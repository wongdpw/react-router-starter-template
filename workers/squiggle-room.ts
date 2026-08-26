import { DurableObject } from "cloudflare:workers";
import { SocketHub } from "./socket-hub";
import { isValidPackedEntry, type PackedOp } from "../app/lib/drawing-codec";
import { makeSquiggle } from "../app/lib/squiggle";
import {
	MAX_CHAT,
	MAX_CHAT_LEN,
	MAX_ENTRY_BYTES,
	MAX_PLAYERS,
	MIN_PLAYERS,
	POINTS_PER_VOTE,
	ROUND_CHOICES,
	ROUND_GAP_MS,
	ROUND_WINNER_BONUS,
	SECONDS_CHOICES,
	VOTE_MS,
	type SquiggleChatEntry,
	type SquiggleClientMsg,
	type SquigglePhase,
	type SquiggleServerMsg,
	type SquiggleSettings,
	type SquiggleState,
} from "../app/lib/squiggle-protocol";

interface PlayerRecord {
	pid: string;
	id: string;
	name: string;
	ready: boolean;
	score: number;
	submitted: boolean;
	votedFor: string | null;
	votes: number;
	lastDelta: number;
}

type AlarmJob = "drawEnd" | "voteEnd" | "nextRound" | null;

interface Persisted {
	code: string;
	phase: SquigglePhase;
	settings: SquiggleSettings;
	players: PlayerRecord[];
	hostPid: string | null;
	round: number;
	squiggle: PackedOp[];
	endsAt: number | null;
	alarmJob: AlarmJob;
	roundWinnerIds: string[];
	chat: SquiggleChatEntry[];
}

interface Attachment {
	pid: string;
}

function freshRoom(code: string): Persisted {
	return {
		code,
		phase: "lobby",
		settings: { rounds: 3, seconds: 90 },
		players: [],
		hostPid: null,
		round: 1,
		squiggle: [],
		endsAt: null,
		alarmJob: null,
		roundWinnerIds: [],
		chat: [],
	};
}

/**
 * One instance per room code.
 *
 * Everyone draws at the same time on the same starting mark, so unlike the
 * turn-based rooms there is no rotation to manage — just one deadline for
 * the whole group, then a vote. The squiggle is generated here and shipped
 * as packed ops, which is what guarantees nobody gets an easier one.
 */
export class SquiggleRoom extends DurableObject<Env> {
	private room: Persisted | null = null;
	private hub: SocketHub<Attachment>;
	/** playerId -> packed drawing for the current round. */
	private entries = new Map<string, PackedOp[]>();

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.hub = new SocketHub<Attachment>(ctx);
		ctx.blockConcurrencyWhile(async () => {
			this.room = (await ctx.storage.get<Persisted>("room")) ?? null;
			const stored = await ctx.storage.list<PackedOp[]>({ prefix: "entry:" });
			for (const [key, value] of stored) {
				this.entries.set(key.slice("entry:".length), value);
			}
		});
	}

	private async save() {
		if (this.room) await this.ctx.storage.put("room", this.room);
	}

	private async clearEntries() {
		this.entries.clear();
		await this.ctx.storage.delete([...(await this.ctx.storage.list({ prefix: "entry:" })).keys()]);
	}

	/* ---------------- connection ---------------- */

	override async fetch(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
			return new Response("Expected WebSocket upgrade", { status: 426 });
		}

		const url = new URL(request.url);
		const code = (url.searchParams.get("code") ?? "").toUpperCase();
		const pid = url.searchParams.get("pid") ?? crypto.randomUUID();
		const name = (url.searchParams.get("name") ?? "").slice(0, 16).trim();

		if (!this.room) this.room = freshRoom(code);
		const room = this.room;

		let player = room.players.find((p) => p.pid === pid);
		if (player) {
			if (name) player.name = name;
		} else {
			if (room.players.length >= MAX_PLAYERS) {
				return new Response("Room is full", { status: 503 });
			}
			player = {
				pid,
				id: crypto.randomUUID().slice(0, 8),
				name: name || `Player ${room.players.length + 1}`,
				ready: false,
				score: 0,
				submitted: false,
				votedFor: null,
				votes: 0,
				lastDelta: 0,
			};
			room.players.push(player);
			this.pushChat(room, { kind: "join", text: `${player.name} joined` });
		}

		if (room.hostPid === null) room.hostPid = pid;

		const { client, server } = this.hub.accept({ pid });
		await this.save();

		this.hub.send(server, {
			t: "welcome",
			you: { id: player.id },
			state: this.stateFor(pid),
			chat: room.chat,
		} satisfies SquiggleServerMsg);

		// A reconnect during the reveal needs the entries resent.
		if (room.phase === "reveal" || room.phase === "roundend") {
			this.sendEntries(server);
		}

		this.broadcast(server);
		return new Response(null, { status: 101, webSocket: client });
	}

	override async webSocketClose(ws: WebSocket) {
		await this.handleGone(ws);
	}

	override async webSocketError(ws: WebSocket) {
		await this.handleGone(ws);
	}

	private async handleGone(ws: WebSocket) {
		const room = this.room;
		if (!room) return;
		const att = this.hub.attachmentOf(ws);
		if (!att || this.hub.hasOtherSocket(att.pid, ws)) return;

		const player = room.players.find((p) => p.pid === att.pid);
		if (room.phase === "lobby") {
			room.players = room.players.filter((p) => p.pid !== att.pid);
			if (room.hostPid === att.pid) room.hostPid = room.players[0]?.pid ?? null;
			if (player) this.pushChat(room, { kind: "leave", text: `${player.name} left` });
			await this.save();
			this.broadcast(ws);
			return;
		}

		if (player) this.pushChat(room, { kind: "leave", text: `${player.name} disconnected` });
		await this.save();
		this.broadcast(ws);

		// A departure can be the last thing a phase was waiting on.
		await this.maybeEndDrawing();
		await this.maybeResolveVotes();
	}

	/* ---------------- messages ---------------- */

	override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		if (typeof message !== "string") return;
		if (message.length > MAX_ENTRY_BYTES + 4096) {
			this.hub.send(ws, { t: "error", message: "Drawing is too detailed to submit." });
			return;
		}

		const room = this.room;
		if (!room) return;
		const att = this.hub.attachmentOf(ws);
		if (!att) return;
		const me = room.players.find((p) => p.pid === att.pid);
		if (!me) return;

		let msg: SquiggleClientMsg;
		try {
			msg = JSON.parse(message) as SquiggleClientMsg;
		} catch {
			return;
		}

		const isHost = room.hostPid === att.pid;

		switch (msg.t) {
			case "setName": {
				me.name = String(msg.name ?? "").slice(0, 16).trim() || me.name;
				await this.save();
				break;
			}

			case "setSettings": {
				if (!isHost || room.phase !== "lobby") return;
				const next = msg.settings ?? {};
				if (typeof next.rounds === "number" && (ROUND_CHOICES as readonly number[]).includes(next.rounds)) {
					room.settings.rounds = next.rounds;
				}
				if (typeof next.seconds === "number" && (SECONDS_CHOICES as readonly number[]).includes(next.seconds)) {
					room.settings.seconds = next.seconds;
				}
				await this.save();
				break;
			}

			case "ready": {
				if (room.phase !== "lobby") return;
				me.ready = Boolean(msg.value);
				await this.save();
				break;
			}

			case "start": {
				if (!isHost || room.phase !== "lobby") return;
				const connected = this.connectedPlayers();
				if (connected.length < MIN_PLAYERS) {
					this.hub.send(ws, { t: "error", message: `You need at least ${MIN_PLAYERS} players.` });
					return;
				}
				if (!connected.every((p) => p.ready)) {
					this.hub.send(ws, { t: "error", message: "Everyone needs to be ready." });
					return;
				}
				for (const p of room.players) {
					p.score = 0;
					p.lastDelta = 0;
				}
				room.round = 1;
				await this.beginRound();
				return;
			}

			case "submit": {
				if (room.phase !== "drawing") return;
				if (!isValidPackedEntry(msg.ops)) {
					this.hub.send(ws, { t: "error", message: "Drawing rejected — too large or malformed." });
					return;
				}
				if (JSON.stringify(msg.ops).length > MAX_ENTRY_BYTES) {
					this.hub.send(ws, { t: "error", message: "Drawing is too detailed to submit." });
					return;
				}
				// The starting squiggle is part of the finished piece. The client
				// draws on top of it as a locked base layer and only sends its own
				// marks, so it is stitched back on here rather than trusted to the
				// client — that way an entry is always self-contained.
				const composed = [...room.squiggle, ...msg.ops];
				this.entries.set(me.id, composed);
				await this.ctx.storage.put(`entry:${me.id}`, composed);
				// Only an explicit finish counts, so auto-saves can't end the round early.
				if (msg.final === true) me.submitted = true;
				await this.save();
				this.broadcast();
				await this.maybeEndDrawing();
				return;
			}

			case "vote": {
				if (room.phase !== "reveal") return;
				const target = room.players.find((p) => p.id === msg.targetId);
				// Voting for your own is the one thing that would break scoring.
				if (!target || target.pid === att.pid) return;
				if (!this.entries.has(target.id)) return;
				me.votedFor = target.id;
				await this.save();
				this.broadcast();
				await this.maybeResolveVotes();
				return;
			}

			case "chat": {
				const text = String(msg.text ?? "").slice(0, MAX_CHAT_LEN).trim();
				if (!text) return;
				this.pushChat(room, { kind: "chat", from: me.name, text });
				await this.save();
				this.flushChat();
				return;
			}

			case "playAgain": {
				if (!isHost || room.phase !== "gameover") return;
				room.phase = "lobby";
				room.round = 1;
				room.endsAt = null;
				room.alarmJob = null;
				room.squiggle = [];
				room.roundWinnerIds = [];
				for (const p of room.players) {
					p.ready = false;
					p.submitted = false;
					p.votedFor = null;
					p.votes = 0;
					p.score = 0;
					p.lastDelta = 0;
				}
				await this.clearEntries();
				await this.ctx.storage.deleteAlarm();
				await this.save();
				break;
			}
		}

		this.broadcast();
	}

	/* ---------------- round machinery ---------------- */

	private connectedPlayers(): PlayerRecord[] {
		const room = this.room;
		if (!room) return [];
		const live = this.hub.connectedPids();
		return room.players.filter((p) => live.has(p.pid));
	}

	private async setAlarm(job: AlarmJob, at: number) {
		const room = this.room;
		if (!room) return;
		room.alarmJob = job;
		await this.save();
		await this.ctx.storage.setAlarm(at);
	}

	private async beginRound() {
		const room = this.room;
		if (!room) return;

		room.phase = "drawing";
		room.squiggle = makeSquiggle();
		room.roundWinnerIds = [];
		room.endsAt = Date.now() + room.settings.seconds * 1000;
		for (const p of room.players) {
			p.submitted = false;
			p.votedFor = null;
			p.votes = 0;
			p.lastDelta = 0;
		}
		await this.clearEntries();
		this.pushChat(room, { kind: "system", text: `Round ${room.round} — make it into something.` });
		await this.setAlarm("drawEnd", room.endsAt);
		this.flushChat();
		this.broadcast();
	}

	private async maybeEndDrawing() {
		const room = this.room;
		if (!room || room.phase !== "drawing") return;
		const players = this.connectedPlayers();
		if (players.length > 0 && players.every((p) => p.submitted)) {
			await this.beginReveal();
		}
	}

	private async beginReveal() {
		const room = this.room;
		if (!room) return;
		room.phase = "reveal";
		room.endsAt = Date.now() + VOTE_MS;
		await this.setAlarm("voteEnd", room.endsAt);
		this.broadcast();
		// State first so clients know how many entries to expect.
		for (const s of this.hub.list()) this.sendEntries(s.ws);
	}

	private sendEntries(ws: WebSocket) {
		for (const [playerId, ops] of this.entries) {
			this.hub.send(ws, { t: "entry", playerId, ops } satisfies SquiggleServerMsg);
		}
	}

	private async maybeResolveVotes() {
		const room = this.room;
		if (!room || room.phase !== "reveal") return;
		const voters = this.connectedPlayers().filter((p) => this.entries.size > 1);
		if (voters.length > 0 && voters.every((p) => p.votedFor !== null)) {
			await this.tallyVotes();
		}
	}

	private async tallyVotes() {
		const room = this.room;
		if (!room) return;

		for (const p of room.players) {
			p.votes = 0;
			p.lastDelta = 0;
		}
		for (const voter of room.players) {
			if (!voter.votedFor) continue;
			const target = room.players.find((p) => p.id === voter.votedFor);
			if (target) target.votes += 1;
		}

		let best = 0;
		for (const p of room.players) best = Math.max(best, p.votes);
		room.roundWinnerIds = best > 0 ? room.players.filter((p) => p.votes === best).map((p) => p.id) : [];

		for (const p of room.players) {
			let delta = p.votes * POINTS_PER_VOTE;
			if (best > 0 && p.votes === best) delta += ROUND_WINNER_BONUS;
			p.lastDelta = delta;
			p.score += delta;
		}

		const winners = room.players.filter((p) => room.roundWinnerIds.includes(p.id));
		this.pushChat(room, {
			kind: "system",
			text:
				winners.length === 0
					? "Nobody voted — no points this round."
					: winners.length === 1
						? `${winners[0].name} takes the round.`
						: `Tied: ${winners.map((w) => w.name).join(" & ")}.`,
		});

		room.phase = "roundend";
		room.endsAt = Date.now() + ROUND_GAP_MS;
		await this.setAlarm("nextRound", room.endsAt);
		this.flushChat();
		this.broadcast();
	}

	private async endGame() {
		const room = this.room;
		if (!room) return;
		room.phase = "gameover";
		room.endsAt = null;
		room.alarmJob = null;
		await this.ctx.storage.deleteAlarm();
		this.pushChat(room, { kind: "system", text: "Game over!" });
		await this.save();
		this.flushChat();
		this.broadcast();
	}

	override async alarm() {
		const room = this.room;
		if (!room) return;
		const job = room.alarmJob;
		room.alarmJob = null;

		switch (job) {
			case "drawEnd":
				await this.beginReveal();
				return;
			case "voteEnd":
				await this.tallyVotes();
				return;
			case "nextRound": {
				room.round += 1;
				if (room.round > room.settings.rounds) await this.endGame();
				else await this.beginRound();
				return;
			}
			default:
				await this.save();
		}
	}

	/* ---------------- chat ---------------- */

	private pushChat(room: Persisted, entry: Omit<SquiggleChatEntry, "id" | "at">) {
		room.chat.push({ id: crypto.randomUUID().slice(0, 8), at: Date.now(), ...entry });
		if (room.chat.length > MAX_CHAT) room.chat = room.chat.slice(-MAX_CHAT);
	}

	private flushChat() {
		const room = this.room;
		if (!room) return;
		const latest = room.chat[room.chat.length - 1];
		if (!latest) return;
		this.hub.broadcastRaw(JSON.stringify({ t: "chat", entry: latest } satisfies SquiggleServerMsg));
	}

	/* ---------------- state ---------------- */

	private stateFor(pid: string): SquiggleState {
		const room = this.room ?? freshRoom("?????");
		const live = this.hub.connectedPids();
		const me = room.players.find((p) => p.pid === pid);
		const revealing = room.phase === "reveal" || room.phase === "roundend" || room.phase === "gameover";
		const host = room.players.find((p) => p.pid === room.hostPid);

		return {
			code: room.code,
			phase: room.phase,
			settings: room.settings,
			players: room.players.map((p) => ({
				id: p.id,
				name: p.name,
				connected: live.has(p.pid),
				ready: p.ready,
				score: p.score,
				submitted: p.submitted,
				...(revealing ? { votes: p.votes, lastDelta: p.lastDelta } : {}),
			})),
			hostId: host?.id ?? null,
			round: room.round,
			endsAt: room.endsAt,
			serverNow: Date.now(),
			squiggle: room.squiggle,
			revealIds: revealing ? [...this.entries.keys()] : [],
			youVoted: me?.votedFor ?? null,
			roundWinnerIds: room.roundWinnerIds,
		};
	}

	private broadcast(except?: WebSocket) {
		this.hub.broadcastEach(
			(att) => ({ t: "state", state: this.stateFor(att.pid) }) satisfies SquiggleServerMsg,
			except
		);
	}
}
