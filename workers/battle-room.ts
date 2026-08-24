import { DurableObject } from "cloudflare:workers";
import { buildDeck, type PromptCategory } from "../app/lib/draw-battle-prompts";
import {
	COUNTDOWN_MS,
	MAX_PACKED_BYTES,
	MAX_SPECTATORS,
	ROUNDS_CHOICES,
	SECONDS_CHOICES,
	VOTE_TIMEOUT_MS,
	isValidPackedEntry,
	isValidPackedOp,
	type ClientMsg,
	type PackedOp,
	type Phase,
	type Role,
	type RoomSettings,
	type RoomState,
	type Seat,
	type ServerMsg,
	type Verdict,
} from "../app/lib/battle-protocol";

interface SeatRecord {
	pid: string;
	name: string;
	ready: boolean;
	submitted: boolean;
}

interface Persisted {
	code: string;
	phase: Phase;
	round: number;
	settings: RoomSettings;
	seats: (SeatRecord | null)[];
	scores: [number, number];
	hostPid: string | null;
	prompt: string | null;
	endsAt: number | null;
	deck: string[];
	spectatorVotes: Record<string, Verdict>;
	playerVotes: (Verdict | null)[];
	roundWinner: Verdict | null;
	matchWinner: Verdict | null;
	log: { round: number; prompt: string; winner: Verdict }[];
}

interface Attachment {
	pid: string;
	role: Role;
	seat: Seat | null;
}

const ALL_CATEGORIES: PromptCategory[] = ["objects", "creatures", "scenes", "concepts"];

function freshRoom(code: string): Persisted {
	return {
		code,
		phase: "lobby",
		round: 1,
		settings: { seconds: 90, rounds: 3, categories: ["objects", "creatures"] },
		seats: [null, null],
		scores: [0, 0],
		hostPid: null,
		prompt: null,
		endsAt: null,
		deck: [],
		spectatorVotes: {},
		playerVotes: [null, null],
		roundWinner: null,
		matchWinner: null,
		log: [],
	};
}

/**
 * One instance per room code, addressed with `idFromName(code)`.
 *
 * The Durable Object is the referee: it picks the prompt, owns the clock,
 * and decides the winner. Clients render a countdown but cannot extend it —
 * the deadline is an absolute server timestamp backed by a storage alarm,
 * so a player who edits their system clock or closes their laptop still
 * gets exactly the time everyone else got.
 */
export class BattleRoom extends DurableObject<Env> {
	private room: Persisted | null = null;
	private entries: (PackedOp[] | null)[] = [null, null];

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			this.room = (await ctx.storage.get<Persisted>("room")) ?? null;
			this.entries = [
				(await ctx.storage.get<PackedOp[]>("entry:0")) ?? null,
				(await ctx.storage.get<PackedOp[]>("entry:1")) ?? null,
			];
		});
	}

	/* ---------------- persistence ---------------- */

	private async save() {
		if (this.room) await this.ctx.storage.put("room", this.room);
	}

	private async saveEntry(seat: Seat) {
		const value = this.entries[seat];
		if (value) await this.ctx.storage.put(`entry:${seat}`, value);
		else await this.ctx.storage.delete(`entry:${seat}`);
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

		if (!this.room) {
			this.room = freshRoom(code);
		}
		const room = this.room;

		// Seat assignment: an existing pid reclaims its seat (reconnect),
		// otherwise take a free seat, otherwise spectate.
		let seat: Seat | null = null;
		let role: Role = "spectator";

		const existing = room.seats.findIndex((s) => s !== null && s.pid === pid);
		if (existing >= 0) {
			seat = existing as Seat;
			role = "player";
			const record = room.seats[existing];
			if (record && name) record.name = name;
		} else {
			const free = room.seats.findIndex((s) => s === null);
			if (free >= 0) {
				seat = free as Seat;
				role = "player";
				room.seats[free] = {
					pid,
					name: name || `Player ${free + 1}`,
					ready: false,
					submitted: false,
				};
			} else {
				const spectatorCount = this.sockets().filter((s) => s.attachment.role === "spectator").length;
				if (spectatorCount >= MAX_SPECTATORS) {
					return new Response("Room is full", { status: 503 });
				}
			}
		}

		if (role === "player" && room.hostPid === null) {
			room.hostPid = pid;
		}

		const pair = new WebSocketPair();
		const server = pair[1];
		this.ctx.acceptWebSocket(server);
		const attachment: Attachment = { pid, role, seat };
		server.serializeAttachment(attachment);

		await this.save();

		this.sendTo(server, attachment, { t: "welcome", you: { role, seat }, state: this.publicState(pid) });
		this.broadcast(server);

		return new Response(null, { status: 101, webSocket: pair[0] });
	}

	private sockets(): { ws: WebSocket; attachment: Attachment }[] {
		return this.ctx.getWebSockets().map((ws) => ({
			ws,
			attachment: (ws.deserializeAttachment() ?? { pid: "", role: "spectator", seat: null }) as Attachment,
		}));
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
		const attachment = ws.deserializeAttachment() as Attachment | null;

		// A player who drops out of the lobby frees their seat so someone
		// else can take it. Mid-match the seat is held for reconnection.
		if (attachment?.role === "player" && attachment.seat !== null && room.phase === "lobby") {
			const seat = attachment.seat;
			const stillHere = this.sockets().some(
				(s) => s.ws !== ws && s.attachment.pid === attachment.pid
			);
			if (!stillHere) {
				room.seats[seat] = null;
				if (room.hostPid === attachment.pid) {
					const other = room.seats.find((s) => s !== null);
					room.hostPid = other ? other.pid : null;
				}
				await this.save();
			}
		}

		this.broadcast(ws);
	}

	/* ---------------- messages ---------------- */

	override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		if (typeof message !== "string") return;
		if (message.length > MAX_PACKED_BYTES + 4096) {
			this.sendRaw(ws, { t: "error", message: "Message too large." });
			return;
		}

		const room = this.room;
		if (!room) return;
		const attachment = ws.deserializeAttachment() as Attachment | null;
		if (!attachment) return;

		let msg: ClientMsg;
		try {
			msg = JSON.parse(message) as ClientMsg;
		} catch {
			return;
		}

		const seat = attachment.seat;
		const isPlayer = attachment.role === "player" && seat !== null;
		const isHost = room.hostPid === attachment.pid;

		switch (msg.t) {
			case "setName": {
				if (!isPlayer || seat === null) return;
				const record = room.seats[seat];
				if (!record) return;
				record.name = String(msg.name ?? "").slice(0, 16).trim() || `Player ${seat + 1}`;
				await this.save();
				break;
			}

			case "setSettings": {
				if (!isHost || room.phase !== "lobby") return;
				const next = msg.settings ?? {};
				if (typeof next.seconds === "number" && (SECONDS_CHOICES as readonly number[]).includes(next.seconds)) {
					room.settings.seconds = next.seconds;
				}
				if (typeof next.rounds === "number" && (ROUNDS_CHOICES as readonly number[]).includes(next.rounds)) {
					room.settings.rounds = next.rounds;
				}
				if (Array.isArray(next.categories)) {
					const clean = next.categories.filter((c): c is PromptCategory => ALL_CATEGORIES.includes(c));
					if (clean.length > 0) room.settings.categories = clean;
				}
				room.deck = [];
				await this.save();
				break;
			}

			case "ready": {
				if (!isPlayer || seat === null || room.phase !== "lobby") return;
				const record = room.seats[seat];
				if (!record) return;
				record.ready = Boolean(msg.value);
				await this.save();
				break;
			}

			case "start": {
				if (!isHost || room.phase !== "lobby") return;
				if (!room.seats[0] || !room.seats[1]) {
					this.sendRaw(ws, { t: "error", message: "Both seats need a player before you can start." });
					return;
				}
				if (!room.seats[0].ready || !room.seats[1].ready) {
					this.sendRaw(ws, { t: "error", message: "Both players need to be ready." });
					return;
				}
				room.scores = [0, 0];
				room.round = 1;
				room.log = [];
				room.matchWinner = null;
				await this.beginRound();
				return;
			}

			case "stroke": {
				// Relayed to spectators only. Sending live strokes to the
				// opponent would let them trace the drawing.
				if (!isPlayer || seat === null || room.phase !== "drawing") return;
				if (!isValidPackedOp(msg.op)) return;
				const frame = JSON.stringify({ t: "peerStroke", seat, op: msg.op } satisfies ServerMsg);
				for (const s of this.sockets()) {
					if (s.attachment.role === "spectator") {
						try {
							s.ws.send(frame);
						} catch {
							/* socket already gone */
						}
					}
				}
				return;
			}

			case "submit": {
				if (!isPlayer || seat === null) return;
				if (room.phase !== "drawing" && room.phase !== "countdown") return;
				if (!isValidPackedEntry(msg.ops)) {
					this.sendRaw(ws, { t: "error", message: "Drawing rejected — too large or malformed." });
					return;
				}
				const encoded = JSON.stringify(msg.ops);
				if (encoded.length > MAX_PACKED_BYTES) {
					this.sendRaw(ws, { t: "error", message: "Drawing is too detailed to submit." });
					return;
				}
				const record = room.seats[seat];
				if (!record) return;
				// Overwriting is allowed while the phase is still open, so a
				// client can auto-save before the deadline and then top it up.
				this.entries[seat] = msg.ops;
				await this.saveEntry(seat);

				// Only an explicit "I'm done" counts as finished. Auto-saves
				// must not end the round for both players ahead of time.
				if (msg.final === true) record.submitted = true;
				await this.save();

				if (room.seats[0]?.submitted && room.seats[1]?.submitted) {
					await this.endDrawing();
					return;
				}
				break;
			}

			case "vote": {
				if (room.phase !== "reveal") return;
				const verdict = msg.winner;
				if (verdict !== 0 && verdict !== 1 && verdict !== -1) return;

				if (attachment.role === "spectator") {
					room.spectatorVotes[attachment.pid] = verdict;
				} else if (seat !== null) {
					room.playerVotes[seat] = verdict;
				}
				await this.save();

				if (this.everyoneVoted()) {
					await this.resolveRound();
					return;
				}
				break;
			}

			case "next": {
				if (!isHost || room.phase !== "roundover") return;
				room.round += 1;
				await this.beginRound();
				return;
			}

			case "rematch": {
				if (!isHost || room.phase !== "matchover") return;
				room.phase = "lobby";
				room.round = 1;
				room.scores = [0, 0];
				room.log = [];
				room.matchWinner = null;
				room.roundWinner = null;
				room.prompt = null;
				room.endsAt = null;
				for (const s of room.seats) {
					if (s) {
						s.ready = false;
						s.submitted = false;
					}
				}
				await this.clearEntries();
				await this.save();
				break;
			}
		}

		this.broadcast();
	}

	/* ---------------- round machinery ---------------- */

	private async clearEntries() {
		this.entries = [null, null];
		await this.ctx.storage.delete("entry:0");
		await this.ctx.storage.delete("entry:1");
	}

	private async beginRound() {
		const room = this.room;
		if (!room) return;

		if (room.deck.length === 0) {
			room.deck = buildDeck(room.settings.categories);
		}
		room.prompt = room.deck.pop() ?? "something surprising";
		room.phase = "countdown";
		room.endsAt = Date.now() + COUNTDOWN_MS;
		room.roundWinner = null;
		room.spectatorVotes = {};
		room.playerVotes = [null, null];
		for (const s of room.seats) {
			if (s) s.submitted = false;
		}
		await this.clearEntries();
		await this.save();
		await this.ctx.storage.setAlarm(room.endsAt);
		this.broadcast();
	}

	private async endDrawing() {
		const room = this.room;
		if (!room) return;
		room.phase = "reveal";
		room.endsAt = Date.now() + VOTE_TIMEOUT_MS;
		await this.save();
		await this.ctx.storage.setAlarm(room.endsAt);
		this.broadcast();
	}

	/** Connected spectators only — an absent spectator must not stall the vote. */
	private connectedSpectatorPids(): string[] {
		const seen = new Set<string>();
		for (const s of this.sockets()) {
			if (s.attachment.role === "spectator") seen.add(s.attachment.pid);
		}
		return [...seen];
	}

	private everyoneVoted(): boolean {
		const room = this.room;
		if (!room) return false;
		const spectators = this.connectedSpectatorPids();
		if (spectators.length > 0) {
			return spectators.every((pid) => room.spectatorVotes[pid] !== undefined);
		}
		return room.playerVotes[0] !== null && room.playerVotes[1] !== null;
	}

	/**
	 * Spectators are the judges when present. With none, the two players must
	 * agree — if they disagree it is a draw, which removes any incentive to
	 * simply vote for yourself.
	 */
	private decideWinner(): Verdict {
		const room = this.room;
		if (!room) return -1;

		const tally: [number, number, number] = [0, 0, 0];
		for (const pid of this.connectedSpectatorPids()) {
			const v = room.spectatorVotes[pid];
			if (v === undefined) continue;
			tally[v === -1 ? 2 : v] += 1;
		}

		if (tally[0] + tally[1] + tally[2] > 0) {
			if (tally[0] > tally[1]) return 0;
			if (tally[1] > tally[0]) return 1;
			return -1;
		}

		const [a, b] = room.playerVotes;
		return a !== null && a === b ? a : -1;
	}

	private async resolveRound() {
		const room = this.room;
		if (!room) return;

		const winner = this.decideWinner();
		room.roundWinner = winner;
		if (winner === -1) {
			room.scores = [room.scores[0] + 1, room.scores[1] + 1];
		} else {
			room.scores[winner] += 1;
		}
		room.log.push({ round: room.round, prompt: room.prompt ?? "", winner });

		if (room.round >= room.settings.rounds) {
			room.phase = "matchover";
			room.matchWinner =
				room.scores[0] === room.scores[1] ? -1 : room.scores[0] > room.scores[1] ? 0 : 1;
		} else {
			room.phase = "roundover";
		}

		room.endsAt = null;
		await this.ctx.storage.deleteAlarm();
		await this.save();
		this.broadcast();
	}

	override async alarm() {
		const room = this.room;
		if (!room) return;

		if (room.phase === "countdown") {
			room.phase = "drawing";
			room.endsAt = Date.now() + room.settings.seconds * 1000;
			await this.save();
			await this.ctx.storage.setAlarm(room.endsAt);
			this.broadcast();
			return;
		}

		if (room.phase === "drawing") {
			await this.endDrawing();
			return;
		}

		if (room.phase === "reveal") {
			// Voting stalled — resolve with whatever came in.
			await this.resolveRound();
		}
	}

	/* ---------------- state broadcast ---------------- */

	private publicState(forPid: string): RoomState {
		const room = this.room ?? freshRoom("?????");
		const live = this.sockets();
		const connectedPids = new Set(live.map((s) => s.attachment.pid));

		const players = room.seats.map((s, i) =>
			s
				? {
						seat: i as Seat,
						name: s.name,
						connected: connectedPids.has(s.pid),
						ready: s.ready,
						submitted: s.submitted,
					}
				: null
		);

		const tally: [number, number, number] = [0, 0, 0];
		for (const v of Object.values(room.spectatorVotes)) {
			tally[v === -1 ? 2 : v] += 1;
		}

		const seatOfPid = room.seats.findIndex((s) => s !== null && s.pid === forPid);
		const youVoted: Verdict | null =
			seatOfPid >= 0 ? room.playerVotes[seatOfPid] : (room.spectatorVotes[forPid] ?? null);

		const revealing = room.phase === "reveal" || room.phase === "roundover" || room.phase === "matchover";

		return {
			code: room.code,
			phase: room.phase,
			round: room.round,
			settings: room.settings,
			players,
			spectators: this.connectedSpectatorPids().length,
			scores: room.scores,
			hostSeat: (room.seats.findIndex((s) => s !== null && s.pid === room.hostPid) as Seat | -1) >= 0
				? (room.seats.findIndex((s) => s !== null && s.pid === room.hostPid) as Seat)
				: null,
			// The prompt stays hidden through the countdown.
			prompt: room.phase === "drawing" || revealing ? room.prompt : null,
			endsAt: room.endsAt,
			serverNow: Date.now(),
			entries: revealing ? [this.entries[0] ?? [], this.entries[1] ?? []] : null,
			votes: { spectatorTally: tally, playerVotes: room.playerVotes, youVoted },
			roundWinner: room.roundWinner,
			matchWinner: room.matchWinner,
			log: room.log,
		};
	}

	private sendTo(ws: WebSocket, attachment: Attachment, msg: ServerMsg) {
		try {
			ws.send(JSON.stringify(msg));
		} catch {
			/* socket already gone */
		}
	}

	private sendRaw(ws: WebSocket, msg: ServerMsg) {
		try {
			ws.send(JSON.stringify(msg));
		} catch {
			/* socket already gone */
		}
	}

	/** State is per-recipient (it carries "did you vote"), so it is built per socket. */
	private broadcast(except?: WebSocket) {
		for (const s of this.sockets()) {
			if (s.ws === except) continue;
			this.sendTo(s.ws, s.attachment, { t: "state", state: this.publicState(s.attachment.pid) });
		}
	}
}
