import { DurableObject } from "cloudflare:workers";
import { SocketHub } from "./socket-hub";
import { MAX_PACKED_BYTES, isValidPackedEntry, isValidPackedOp, type PackedOp } from "../app/lib/drawing-codec";
import {
	BASE_GUESS_POINTS,
	CHOOSE_MS,
	DRAWER_POINTS_PER_GUESSER,
	DRAW_SECONDS_CHOICES,
	FIRST_CORRECT_BONUS,
	MAX_CHAT,
	MAX_CHAT_LEN,
	MAX_PLAYERS,
	MIN_PLAYERS,
	ROUND_CHOICES,
	SPEED_GUESS_POINTS,
	TURN_GAP_MS,
	WORD_CHOICES,
	type ChatEntry,
	type GuessClientMsg,
	type GuessPhase,
	type GuessServerMsg,
	type GuessSettings,
	type GuessState,
} from "../app/lib/guess-protocol";
import {
	buildWordDeck,
	editDistance,
	letterIndices,
	maskWord,
	normalizeGuess,
	type GuessDifficulty,
} from "../app/lib/guess-words";

interface PlayerRecord {
	pid: string;
	id: string;
	name: string;
	ready: boolean;
	score: number;
	guessedAt: number | null;
	lastDelta: number;
}

/** What the single storage alarm is currently scheduled for. */
type AlarmJob = "choose" | "hint1" | "hint2" | "turnEnd" | "advance" | null;

interface Persisted {
	code: string;
	phase: GuessPhase;
	settings: GuessSettings;
	players: PlayerRecord[];
	hostPid: string | null;

	round: number;
	order: string[];
	orderIndex: number;
	turnNumber: number;

	drawerPid: string | null;
	word: string | null;
	choices: string[] | null;
	revealed: number[];
	deck: string[];

	endsAt: number | null;
	turnTotalMs: number;
	alarmJob: AlarmJob;
	correctThisTurn: number;
	chat: (ChatEntry & { audience: "all" | "insiders" })[];
}

interface Attachment {
	pid: string;
}

function freshRoom(code: string): Persisted {
	return {
		code,
		phase: "lobby",
		settings: { rounds: 2, seconds: 80, difficulty: "normal" },
		players: [],
		hostPid: null,
		round: 1,
		order: [],
		orderIndex: 0,
		turnNumber: 0,
		drawerPid: null,
		word: null,
		choices: null,
		revealed: [],
		deck: [],
		endsAt: null,
		turnTotalMs: 0,
		alarmJob: null,
		correctThisTurn: 0,
		chat: [],
	};
}

/**
 * One instance per room code.
 *
 * The room is the referee: it owns the word list, the clock, and the score.
 * Guesses are checked here rather than in the browser, and the word is only
 * ever sent to clients entitled to see it — the drawer, players who have
 * already guessed it, and everyone once the turn is over. That is what stops
 * a player from reading the answer out of their own network tab.
 */
export class GuessRoom extends DurableObject<Env> {
	private room: Persisted | null = null;
	private hub: SocketHub<Attachment>;
	/** Current drawing, kept so late joiners and reconnects see the canvas. */
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
				guessedAt: null,
				lastDelta: 0,
			};
			room.players.push(player);
			// Someone joining mid-game still gets a turn later on.
			if (room.phase !== "lobby" && !room.order.includes(player.pid)) {
				room.order.push(player.pid);
			}
			this.pushChat(room, { kind: "join", text: `${player.name} joined`, audience: "all" });
		}

		if (room.hostPid === null) room.hostPid = pid;

		const { client, server } = this.hub.accept({ pid });
		await this.save();

		this.hub.send(server, {
			t: "welcome",
			you: { id: player.id },
			state: this.stateFor(pid),
			chat: this.chatFor(pid),
		} satisfies GuessServerMsg);

		// Bring a joiner's canvas up to date with the drawing in progress.
		if (this.canvas.length > 0 && room.phase === "drawing") {
			this.hub.send(server, { t: "sync", ops: this.canvas } satisfies GuessServerMsg);
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
		if (!att) return;
		if (this.hub.hasOtherSocket(att.pid, ws)) return;

		const player = room.players.find((p) => p.pid === att.pid);

		if (room.phase === "lobby") {
			room.players = room.players.filter((p) => p.pid !== att.pid);
			if (room.hostPid === att.pid) room.hostPid = room.players[0]?.pid ?? null;
			if (player) this.pushChat(room, { kind: "leave", text: `${player.name} left`, audience: "all" });
			await this.save();
			this.broadcast(ws);
			return;
		}

		if (player) this.pushChat(room, { kind: "leave", text: `${player.name} disconnected`, audience: "all" });

		// If the drawer walks out mid-turn there is nothing left to guess at.
		if (room.drawerPid === att.pid && (room.phase === "drawing" || room.phase === "choosing")) {
			this.pushChat(room, { kind: "system", text: "The drawer left — skipping this turn.", audience: "all" });
			await this.endTurn(true);
			return;
		}

		await this.save();
		this.broadcast(ws);
		await this.maybeEndTurnEarly();
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

		let msg: GuessClientMsg;
		try {
			msg = JSON.parse(message) as GuessClientMsg;
		} catch {
			return;
		}

		const isHost = room.hostPid === att.pid;
		const isDrawer = room.drawerPid === att.pid;

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
				if (typeof next.seconds === "number" && (DRAW_SECONDS_CHOICES as readonly number[]).includes(next.seconds)) {
					room.settings.seconds = next.seconds;
				}
				const diffs: GuessDifficulty[] = ["easy", "normal", "hard", "mixed"];
				if (typeof next.difficulty === "string" && diffs.includes(next.difficulty as GuessDifficulty)) {
					room.settings.difficulty = next.difficulty as GuessDifficulty;
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
				room.order = connected.map((p) => p.pid);
				room.orderIndex = 0;
				room.turnNumber = 0;
				room.deck = [];
				await this.beginTurn();
				return;
			}

			case "choose": {
				if (!isDrawer || room.phase !== "choosing" || !room.choices) return;
				const pick = room.choices[msg.index];
				if (!pick) return;
				await this.startDrawing(pick);
				return;
			}

			case "stroke": {
				if (!isDrawer || room.phase !== "drawing") return;
				if (!isValidPackedOp(msg.op)) return;
				this.canvas.push(msg.op);
				// Not awaited: persistence must not add latency to live strokes.
				void this.saveCanvas();
				const frame = JSON.stringify({ t: "stroke", op: msg.op } satisfies GuessServerMsg);
				this.hub.broadcastRaw(frame, (a) => a.pid !== att.pid);
				return;
			}

			case "sync": {
				if (!isDrawer || room.phase !== "drawing") return;
				if (!isValidPackedEntry(msg.ops)) return;
				this.canvas = msg.ops;
				void this.saveCanvas();
				const frame = JSON.stringify({ t: "sync", ops: msg.ops } satisfies GuessServerMsg);
				this.hub.broadcastRaw(frame, (a) => a.pid !== att.pid);
				return;
			}

			case "skip": {
				if (!isDrawer || (room.phase !== "drawing" && room.phase !== "choosing")) return;
				this.pushChat(room, { kind: "system", text: `${me.name} skipped their turn.`, audience: "all" });
				await this.endTurn(true);
				return;
			}

			case "chat": {
				await this.handleChat(me, String(msg.text ?? ""));
				return;
			}

			case "playAgain": {
				if (!isHost || room.phase !== "gameover") return;
				room.phase = "lobby";
				room.round = 1;
				room.orderIndex = 0;
				room.turnNumber = 0;
				room.drawerPid = null;
				room.word = null;
				room.choices = null;
				room.revealed = [];
				room.endsAt = null;
				room.alarmJob = null;
				for (const p of room.players) {
					p.ready = false;
					p.guessedAt = null;
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

	/* ---------------- chat & guessing ---------------- */

	/**
	 * A message from someone still guessing is treated as a guess. Everyone
	 * else (the drawer, and players who already got it) can only talk to each
	 * other, and never in words containing the answer.
	 */
	private async handleChat(me: PlayerRecord, raw: string) {
		const room = this.room;
		if (!room) return;

		const text = raw.slice(0, MAX_CHAT_LEN).trim();
		if (!text) return;

		const insider = room.drawerPid === me.pid || me.guessedAt !== null;
		const guessing = room.phase === "drawing" && !insider;

		if (!guessing) {
			// Never let the answer leak through the chat box.
			if (room.word && normalizeGuess(text).includes(normalizeGuess(room.word))) {
				this.hub.broadcastEach(
					(a) =>
						a.pid === me.pid
							? ({ t: "error", message: "That message gives away the word." } satisfies GuessServerMsg)
							: null
				);
				return;
			}
			this.pushChat(room, {
				kind: "chat",
				from: me.name,
				text,
				audience: room.phase === "drawing" ? "insiders" : "all",
			});
			await this.save();
			this.flushChat();
			return;
		}

		const guess = normalizeGuess(text);
		const answer = normalizeGuess(room.word ?? "");

		if (answer && guess === answer) {
			await this.awardCorrect(me);
			return;
		}

		if (answer && editDistance(guess, answer, 2) <= 1) {
			// Only the guesser hears "close" — announcing it would narrow it
			// down for everyone else.
			this.hub.broadcastEach((a) =>
				a.pid === me.pid
					? ({
							t: "chat",
							entry: { id: crypto.randomUUID().slice(0, 8), kind: "close", text: `"${text}" is very close!`, at: Date.now() },
						} satisfies GuessServerMsg)
					: null
			);
			return;
		}

		this.pushChat(room, { kind: "chat", from: me.name, text, audience: "all" });
		await this.save();
		this.flushChat();
	}

	private async awardCorrect(me: PlayerRecord) {
		const room = this.room;
		if (!room) return;

		const now = Date.now();
		me.guessedAt = now;
		room.correctThisTurn += 1;

		const remaining = room.endsAt !== null ? Math.max(0, room.endsAt - now) : 0;
		const fraction = room.turnTotalMs > 0 ? remaining / room.turnTotalMs : 0;
		let points = BASE_GUESS_POINTS + Math.round(SPEED_GUESS_POINTS * fraction);
		if (room.correctThisTurn === 1) points += FIRST_CORRECT_BONUS;

		me.score += points;
		me.lastDelta += points;

		const drawer = room.players.find((p) => p.pid === room.drawerPid);
		if (drawer) {
			drawer.score += DRAWER_POINTS_PER_GUESSER;
			drawer.lastDelta += DRAWER_POINTS_PER_GUESSER;
		}

		this.pushChat(room, {
			kind: "correct",
			text: `${me.name} guessed it! +${points}`,
			audience: "all",
		});

		await this.save();
		this.flushChat();
		this.broadcast();
		await this.maybeEndTurnEarly();
	}

	private pushChat(room: Persisted, entry: Omit<ChatEntry, "id" | "at"> & { audience: "all" | "insiders" }) {
		room.chat.push({
			id: crypto.randomUUID().slice(0, 8),
			at: Date.now(),
			...entry,
		});
		if (room.chat.length > MAX_CHAT) room.chat = room.chat.slice(-MAX_CHAT);
	}

	/** Sends the newest chat line to everyone entitled to see it. */
	private flushChat() {
		const room = this.room;
		if (!room) return;
		const latest = room.chat[room.chat.length - 1];
		if (!latest) return;
		const { audience, ...entry } = latest;
		this.hub.broadcastEach((a) =>
			audience === "all" || this.isInsider(a.pid)
				? ({ t: "chat", entry } satisfies GuessServerMsg)
				: null
		);
	}

	private isInsider(pid: string): boolean {
		const room = this.room;
		if (!room) return false;
		if (room.phase !== "drawing") return true;
		if (room.drawerPid === pid) return true;
		const p = room.players.find((x) => x.pid === pid);
		return Boolean(p && p.guessedAt !== null);
	}

	private chatFor(pid: string): ChatEntry[] {
		const room = this.room;
		if (!room) return [];
		const insider = this.isInsider(pid);
		return room.chat
			.filter((c) => c.audience === "all" || insider)
			.map(({ audience, ...entry }) => entry);
	}

	/* ---------------- turn machinery ---------------- */

	private connectedPlayers(): PlayerRecord[] {
		const room = this.room;
		if (!room) return [];
		const live = this.hub.connectedPids();
		return room.players.filter((p) => live.has(p.pid));
	}

	private guessersThisTurn(): PlayerRecord[] {
		const room = this.room;
		if (!room) return [];
		return this.connectedPlayers().filter((p) => p.pid !== room.drawerPid);
	}

	private async setAlarm(job: AlarmJob, at: number) {
		const room = this.room;
		if (!room) return;
		room.alarmJob = job;
		await this.save();
		await this.ctx.storage.setAlarm(at);
	}

	private async beginTurn() {
		const room = this.room;
		if (!room) return;

		// Skip anyone who has disconnected since the order was fixed.
		const live = this.hub.connectedPids();
		while (room.orderIndex < room.order.length && !live.has(room.order[room.orderIndex])) {
			room.orderIndex += 1;
		}

		if (room.orderIndex >= room.order.length) {
			room.round += 1;
			room.orderIndex = 0;
			if (room.round > room.settings.rounds) {
				await this.endGame();
				return;
			}
			// Re-fix the order each round so leavers drop out cleanly.
			room.order = this.connectedPlayers().map((p) => p.pid);
			if (room.order.length < MIN_PLAYERS) {
				await this.endGame();
				return;
			}
		}

		const drawerPid = room.order[room.orderIndex];
		if (!drawerPid) {
			await this.endGame();
			return;
		}

		if (room.deck.length < WORD_CHOICES) {
			room.deck = buildWordDeck(room.settings.difficulty);
		}

		room.drawerPid = drawerPid;
		room.phase = "choosing";
		room.word = null;
		room.revealed = [];
		room.choices = room.deck.splice(0, WORD_CHOICES);
		room.correctThisTurn = 0;
		room.turnNumber += 1;
		room.endsAt = Date.now() + CHOOSE_MS;
		for (const p of room.players) {
			p.guessedAt = null;
			p.lastDelta = 0;
		}
		this.canvas = [];
		await this.saveCanvas();

		const drawer = room.players.find((p) => p.pid === drawerPid);
		this.pushChat(room, {
			kind: "system",
			text: `Round ${room.round} — ${drawer?.name ?? "Someone"} is picking a word.`,
			audience: "all",
		});

		await this.setAlarm("choose", room.endsAt);
		this.flushChat();
		this.broadcast();
	}

	private async startDrawing(word: string) {
		const room = this.room;
		if (!room) return;

		room.word = word;
		room.choices = null;
		room.phase = "drawing";
		room.turnTotalMs = room.settings.seconds * 1000;
		room.endsAt = Date.now() + room.turnTotalMs;
		room.revealed = [];

		// First hint at 60% remaining, second at 30%.
		await this.setAlarm("hint1", Date.now() + room.turnTotalMs * 0.4);
		this.broadcast();
	}

	private async revealHint(next: AlarmJob) {
		const room = this.room;
		if (!room || !room.word) return;

		const candidates = letterIndices(room.word).filter((i) => !room.revealed.includes(i));
		// Never reveal the whole word through hints alone.
		if (candidates.length > 1) {
			room.revealed.push(candidates[Math.floor(Math.random() * candidates.length)]);
		}

		if (next === "hint2" && room.endsAt) {
			await this.setAlarm("hint2", Date.now() + Math.max(0, (room.endsAt - Date.now()) / 2));
		} else if (room.endsAt) {
			await this.setAlarm("turnEnd", room.endsAt);
		}
		this.broadcast();
	}

	private async maybeEndTurnEarly() {
		const room = this.room;
		if (!room || room.phase !== "drawing") return;
		const guessers = this.guessersThisTurn();
		if (guessers.length > 0 && guessers.every((p) => p.guessedAt !== null)) {
			await this.endTurn(false);
		}
	}

	private async endTurn(skipped: boolean) {
		const room = this.room;
		if (!room) return;

		room.phase = "turnend";
		room.choices = null;
		room.endsAt = Date.now() + TURN_GAP_MS;

		if (!skipped && room.word) {
			this.pushChat(room, {
				kind: "system",
				text: `The word was "${room.word}".`,
				audience: "all",
			});
		}

		await this.setAlarm("advance", room.endsAt);
		this.flushChat();
		this.broadcast();
	}

	private async endGame() {
		const room = this.room;
		if (!room) return;
		room.phase = "gameover";
		room.drawerPid = null;
		room.word = null;
		room.choices = null;
		room.endsAt = null;
		room.alarmJob = null;
		await this.ctx.storage.deleteAlarm();
		this.pushChat(room, { kind: "system", text: "Game over!", audience: "all" });
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
			case "choose": {
				// Drawer never picked — choose for them so the game moves on.
				const pick = room.choices?.[0];
				if (pick) await this.startDrawing(pick);
				else await this.endTurn(true);
				return;
			}
			case "hint1":
				await this.revealHint("hint2");
				return;
			case "hint2":
				await this.revealHint("turnEnd");
				return;
			case "turnEnd":
				await this.endTurn(false);
				return;
			case "advance": {
				room.orderIndex += 1;
				await this.beginTurn();
				return;
			}
			default:
				await this.save();
		}
	}

	/* ---------------- state ---------------- */

	private stateFor(pid: string): GuessState {
		const room = this.room ?? freshRoom("?????");
		const live = this.hub.connectedPids();
		const me = room.players.find((p) => p.pid === pid);
		const isDrawer = room.drawerPid === pid;
		const guessed = Boolean(me && me.guessedAt !== null);
		const turnOver = room.phase === "turnend" || room.phase === "gameover";

		const drawer = room.players.find((p) => p.pid === room.drawerPid);
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
				guessed: p.guessedAt !== null,
				lastDelta: p.lastDelta,
			})),
			hostId: host?.id ?? null,
			drawerId: drawer?.id ?? null,
			round: room.round,
			turnNumber: room.turnNumber,
			totalTurns: room.order.length * room.settings.rounds,
			endsAt: room.endsAt,
			serverNow: Date.now(),
			wordHint: room.word ? maskWord(room.word, room.revealed) : null,
			// The answer only goes to clients entitled to it.
			word: room.word && (isDrawer || guessed || turnOver) ? room.word : null,
			choices: isDrawer && room.phase === "choosing" ? room.choices : null,
			youAreDrawer: isDrawer,
			youGuessed: guessed,
			correctCount: room.correctThisTurn,
			guesserCount: this.guessersThisTurn().length,
		};
	}

	private broadcast(except?: WebSocket) {
		this.hub.broadcastEach(
			(att) => ({ t: "state", state: this.stateFor(att.pid) }) satisfies GuessServerMsg,
			except
		);
	}
}
