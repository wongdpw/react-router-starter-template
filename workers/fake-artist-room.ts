import { DurableObject } from "cloudflare:workers";
import { SocketHub } from "./socket-hub";
import { MAX_PACKED_BYTES, isValidPackedOp, type PackedOp } from "../app/lib/drawing-codec";
import {
	CATCH_POINTS,
	FAKE_GUESS_MS,
	FAKE_WIN_POINTS,
	MAX_CHAT,
	MAX_CHAT_LEN,
	MAX_PLAYERS,
	MIN_PLAYERS,
	PASS_CHOICES,
	REVEAL_MS,
	ROUND_CHOICES,
	ROUND_GAP_MS,
	STROKE_SECONDS_CHOICES,
	VOTE_MS,
	type FakeChatEntry,
	type FakeClientMsg,
	type FakePhase,
	type FakeServerMsg,
	type FakeSettings,
	type FakeState,
} from "../app/lib/fake-artist-protocol";
import { CATEGORIES, buildFakeDeck, normalizeWord, type FakeWord } from "../app/lib/fake-artist-words";

interface PlayerRecord {
	pid: string;
	id: string;
	name: string;
	ready: boolean;
	score: number;
	strokes: number;
	votedFor: string | null;
	lastDelta: number;
}

type AlarmJob = "startDrawing" | "turn" | "vote" | "fakeGuess" | "nextRound" | null;

interface Persisted {
	code: string;
	phase: FakePhase;
	settings: FakeSettings;
	players: PlayerRecord[];
	hostPid: string | null;

	round: number;
	pass: number;
	order: string[];
	orderIndex: number;

	fakePid: string | null;
	word: string | null;
	category: string | null;
	deck: FakeWord[];

	endsAt: number | null;
	alarmJob: AlarmJob;

	accusedId: string | null;
	fakeGuess: string | null;
	fakeWon: boolean | null;

	chat: FakeChatEntry[];
}

interface Attachment {
	pid: string;
}

function freshRoom(code: string): Persisted {
	return {
		code,
		phase: "lobby",
		settings: { rounds: 3, passes: 2, strokeSeconds: 25, categories: [] },
		players: [],
		hostPid: null,
		round: 1,
		pass: 1,
		order: [],
		orderIndex: 0,
		fakePid: null,
		word: null,
		category: null,
		deck: [],
		endsAt: null,
		alarmJob: null,
		accusedId: null,
		fakeGuess: null,
		fakeWon: null,
		chat: [],
	};
}

/**
 * One instance per room code.
 *
 * The secret here is asymmetric: everyone is told the word except one player,
 * and the room is what keeps that asymmetry honest. The faker's client is
 * never sent the word, only the category — so there is nothing to read out of
 * the network tab. Turn order, who the faker is, and the vote count are all
 * decided server-side.
 */
export class FakeArtistRoom extends DurableObject<Env> {
	private room: Persisted | null = null;
	private hub: SocketHub<Attachment>;
	private canvas: PackedOp[] = [];

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.hub = new SocketHub<Attachment>(ctx);
		ctx.blockConcurrencyWhile(async () => {
			this.room = (await ctx.storage.get<Persisted>("room")) ?? null;
			this.canvas = (await ctx.storage.get<PackedOp[]>("canvas")) ?? [];
		});
	}

	private async save() {
		if (this.room) await this.ctx.storage.put("room", this.room);
	}

	private async saveCanvas() {
		if (this.canvas.length === 0) await this.ctx.storage.delete("canvas");
		else await this.ctx.storage.put("canvas", this.canvas);
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
				strokes: 0,
				votedFor: null,
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
		} satisfies FakeServerMsg);

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

		// The whole round hinges on the faker being present.
		if (room.fakePid === att.pid && room.phase !== "roundend" && room.phase !== "gameover") {
			this.pushChat(room, { kind: "system", text: "The Fake Artist left — abandoning this round." });
			await this.finishRound(null);
			return;
		}

		await this.save();

		// Don't stall on a player who has gone.
		if (room.phase === "drawing" && room.order[room.orderIndex] === att.pid) {
			await this.advanceTurn();
			return;
		}
		this.broadcast(ws);
		await this.maybeResolveVotes();
	}

	/* ---------------- messages ---------------- */

	override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		if (typeof message !== "string") return;
		if (message.length > MAX_PACKED_BYTES + 4096) return;

		const room = this.room;
		if (!room) return;
		const att = this.hub.attachmentOf(ws);
		if (!att) return;
		const me = room.players.find((p) => p.pid === att.pid);
		if (!me) return;

		let msg: FakeClientMsg;
		try {
			msg = JSON.parse(message) as FakeClientMsg;
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
				if (typeof next.passes === "number" && (PASS_CHOICES as readonly number[]).includes(next.passes)) {
					room.settings.passes = next.passes;
				}
				if (
					typeof next.strokeSeconds === "number" &&
					(STROKE_SECONDS_CHOICES as readonly number[]).includes(next.strokeSeconds)
				) {
					room.settings.strokeSeconds = next.strokeSeconds;
				}
				if (Array.isArray(next.categories)) {
					room.settings.categories = next.categories.filter((c) => CATEGORIES.includes(c));
					room.deck = [];
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
				room.deck = [];
				await this.beginRound();
				return;
			}

			case "stroke": {
				if (room.phase !== "drawing") return;
				if (room.order[room.orderIndex] !== att.pid) return;
				if (!isValidPackedOp(msg.op)) return;
				this.canvas.push(msg.op);
				me.strokes += 1;
				await this.saveCanvas();
				// One stroke is a whole turn.
				await this.advanceTurn();
				return;
			}

			case "vote": {
				if (room.phase !== "voting") return;
				const target = room.players.find((p) => p.id === msg.targetId);
				// No voting for yourself — it would just be a free abstention.
				if (!target || target.pid === att.pid) return;
				me.votedFor = target.id;
				await this.save();
				this.broadcast();
				await this.maybeResolveVotes();
				return;
			}

			case "fakeGuess": {
				if (room.phase !== "fakeguess" || room.fakePid !== att.pid) return;
				await this.resolveFakeGuess(String(msg.word ?? ""));
				return;
			}

			case "chat": {
				const text = String(msg.text ?? "").slice(0, MAX_CHAT_LEN).trim();
				if (!text) return;
				// Knowing the word doesn't entitle you to type it out.
				const secret = room.word ? normalizeWord(room.word) : "";
				const inPlay = room.phase === "drawing" || room.phase === "voting" || room.phase === "fakeguess";
				if (inPlay && secret && normalizeWord(text).includes(secret)) {
					this.hub.send(ws, { t: "error", message: "That gives away the word." });
					return;
				}
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
				room.fakePid = null;
				room.word = null;
				room.category = null;
				room.accusedId = null;
				room.fakeGuess = null;
				room.fakeWon = null;
				for (const p of room.players) {
					p.ready = false;
					p.votedFor = null;
					p.strokes = 0;
					p.score = 0;
					p.lastDelta = 0;
				}
				this.canvas = [];
				await this.saveCanvas();
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

		const players = this.connectedPlayers();
		if (players.length < MIN_PLAYERS) {
			await this.endGame();
			return;
		}

		if (room.deck.length === 0) room.deck = buildFakeDeck(room.settings.categories);
		const pick = room.deck.pop();
		if (!pick) {
			await this.endGame();
			return;
		}

		// Randomise both the faker and the drawing order every round.
		const shuffled = [...players];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}

		room.order = shuffled.map((p) => p.pid);
		room.orderIndex = 0;
		room.pass = 1;
		room.fakePid = shuffled[Math.floor(Math.random() * shuffled.length)].pid;
		room.word = pick.word;
		room.category = pick.category;
		room.accusedId = null;
		room.fakeGuess = null;
		room.fakeWon = null;
		room.phase = "reveal";
		room.endsAt = Date.now() + REVEAL_MS;

		for (const p of room.players) {
			p.votedFor = null;
			p.strokes = 0;
			p.lastDelta = 0;
		}

		this.canvas = [];
		await this.saveCanvas();
		this.pushChat(room, {
			kind: "system",
			text: `Round ${room.round} — category: ${pick.category}`,
		});

		await this.setAlarm("startDrawing", room.endsAt);
		this.flushChat();
		this.broadcast();
	}

	private async startDrawing() {
		const room = this.room;
		if (!room) return;
		room.phase = "drawing";
		room.endsAt = Date.now() + room.settings.strokeSeconds * 1000;
		await this.setAlarm("turn", room.endsAt);
		this.broadcast();
	}

	private async advanceTurn() {
		const room = this.room;
		if (!room) return;

		room.orderIndex += 1;
		if (room.orderIndex >= room.order.length) {
			room.orderIndex = 0;
			room.pass += 1;
			if (room.pass > room.settings.passes) {
				await this.beginVoting();
				return;
			}
		}

		// Skip anyone who dropped out mid-round.
		const live = this.hub.connectedPids();
		let guard = 0;
		while (!live.has(room.order[room.orderIndex]) && guard < room.order.length) {
			room.orderIndex += 1;
			guard += 1;
			if (room.orderIndex >= room.order.length) {
				room.orderIndex = 0;
				room.pass += 1;
				if (room.pass > room.settings.passes) {
					await this.beginVoting();
					return;
				}
			}
		}

		room.endsAt = Date.now() + room.settings.strokeSeconds * 1000;
		await this.setAlarm("turn", room.endsAt);
		this.broadcast();
	}

	private async beginVoting() {
		const room = this.room;
		if (!room) return;
		room.phase = "voting";
		room.endsAt = Date.now() + VOTE_MS;
		this.pushChat(room, { kind: "system", text: "Time to vote — who was faking it?" });
		await this.setAlarm("vote", room.endsAt);
		this.flushChat();
		this.broadcast();
	}

	private async maybeResolveVotes() {
		const room = this.room;
		if (!room || room.phase !== "voting") return;
		const voters = this.connectedPlayers();
		if (voters.length > 0 && voters.every((p) => p.votedFor !== null)) {
			await this.tallyVotes();
		}
	}

	private async tallyVotes() {
		const room = this.room;
		if (!room) return;

		const counts = new Map<string, number>();
		for (const p of this.connectedPlayers()) {
			if (p.votedFor) counts.set(p.votedFor, (counts.get(p.votedFor) ?? 0) + 1);
		}

		let topId: string | null = null;
		let topCount = 0;
		let tied = false;
		for (const [id, n] of counts) {
			if (n > topCount) {
				topId = id;
				topCount = n;
				tied = false;
			} else if (n === topCount) {
				tied = true;
			}
		}

		// A split vote means nobody was convincingly accused.
		room.accusedId = tied ? null : topId;
		const fake = room.players.find((p) => p.pid === room.fakePid);
		const caught = Boolean(fake && room.accusedId === fake.id);

		if (caught) {
			room.phase = "fakeguess";
			room.endsAt = Date.now() + FAKE_GUESS_MS;
			this.pushChat(room, {
				kind: "system",
				text: `${fake?.name} was caught! They get one guess at the word.`,
			});
			await this.setAlarm("fakeGuess", room.endsAt);
			this.flushChat();
			this.broadcast();
			return;
		}

		await this.finishRound(false);
	}

	private async resolveFakeGuess(guess: string) {
		const room = this.room;
		if (!room) return;
		room.fakeGuess = guess.slice(0, 40);
		const correct = normalizeWord(guess) === normalizeWord(room.word ?? "");
		await this.finishRound(correct ? true : false, true);
	}

	/**
	 * `fakeEscaped` is true when the faker survived the vote, false when they
	 * were caught, and null when the round was abandoned.
	 */
	private async finishRound(fakeEscaped: boolean | null, viaGuess = false) {
		const room = this.room;
		if (!room) return;

		const fake = room.players.find((p) => p.pid === room.fakePid);

		if (fakeEscaped === null) {
			room.fakeWon = null;
		} else if (viaGuess) {
			// Caught, but naming the word still wins it for them.
			room.fakeWon = fakeEscaped;
		} else {
			room.fakeWon = fakeEscaped === false ? false : true;
		}

		if (room.fakeWon === true && fake) {
			fake.score += FAKE_WIN_POINTS;
			fake.lastDelta = FAKE_WIN_POINTS;
			this.pushChat(room, {
				kind: "system",
				text: viaGuess
					? `${fake.name} was caught but named the word — the Fake Artist wins.`
					: `Nobody caught ${fake.name}. The Fake Artist wins.`,
			});
		} else if (room.fakeWon === false && fake) {
			for (const p of room.players) {
				if (p.pid !== room.fakePid && p.votedFor === fake.id) {
					p.score += CATCH_POINTS;
					p.lastDelta = CATCH_POINTS;
				}
			}
			this.pushChat(room, {
				kind: "system",
				text: `${fake.name} was the Fake Artist — the word was "${room.word}".`,
			});
		}

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
			case "startDrawing":
				await this.startDrawing();
				return;
			case "turn":
				// Ran out of time — that player simply forfeits their stroke.
				await this.advanceTurn();
				return;
			case "vote":
				await this.tallyVotes();
				return;
			case "fakeGuess":
				await this.finishRound(false, true);
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

	private pushChat(room: Persisted, entry: Omit<FakeChatEntry, "id" | "at">) {
		room.chat.push({ id: crypto.randomUUID().slice(0, 8), at: Date.now(), ...entry });
		if (room.chat.length > MAX_CHAT) room.chat = room.chat.slice(-MAX_CHAT);
	}

	private flushChat() {
		const room = this.room;
		if (!room) return;
		const latest = room.chat[room.chat.length - 1];
		if (!latest) return;
		const frame = JSON.stringify({ t: "chat", entry: latest } satisfies FakeServerMsg);
		this.hub.broadcastRaw(frame);
	}

	/* ---------------- state ---------------- */

	private stateFor(pid: string): FakeState {
		const room = this.room ?? freshRoom("?????");
		const live = this.hub.connectedPids();
		const isFake = room.fakePid === pid;
		const over = room.phase === "roundend" || room.phase === "gameover";
		const fake = room.players.find((p) => p.pid === room.fakePid);
		const host = room.players.find((p) => p.pid === room.hostPid);
		const me = room.players.find((p) => p.pid === pid);
		const active = room.players.find((p) => p.pid === room.order[room.orderIndex]);
		const idOf = (target: string) => room.players.find((p) => p.pid === target)?.id ?? "";

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
				strokes: p.strokes,
				...(over ? { wasFake: p.pid === room.fakePid, votedFor: p.votedFor, lastDelta: p.lastDelta } : {}),
			})),
			hostId: host?.id ?? null,
			round: room.round,
			pass: room.pass,
			activeId: room.phase === "drawing" ? (active?.id ?? null) : null,
			order: room.order.map(idOf),
			endsAt: room.endsAt,
			serverNow: Date.now(),
			// The category is public; that is what the faker has to work with.
			category: room.category,
			// The faker's client is never told the word until the round ends.
			word: room.word && (!isFake || over) ? room.word : null,
			youAreFake: isFake,
			youVoted: me?.votedFor ?? null,
			votes:
				room.phase === "voting" || over
					? room.players.filter((p) => p.votedFor).map((p) => ({ voterId: p.id, targetId: p.votedFor as string }))
					: null,
			accusedId: room.accusedId,
			fakeId: over ? (fake?.id ?? null) : null,
			fakeGuess: over ? room.fakeGuess : null,
			fakeWon: over ? room.fakeWon : null,
			canvas: this.canvas,
		};
	}

	private broadcast(except?: WebSocket) {
		this.hub.broadcastEach(
			(att) => ({ t: "state", state: this.stateFor(att.pid) }) satisfies FakeServerMsg,
			except
		);
	}
}
