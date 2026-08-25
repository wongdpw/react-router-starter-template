import { DurableObject } from "cloudflare:workers";
import { SocketHub } from "./socket-hub";
import { MAX_PACKED_BYTES, isValidPackedOp, type PackedOp } from "../app/lib/drawing-codec";
import {
	MAX_CANVAS_OPS,
	MAX_CHAT,
	MAX_CHAT_LEN,
	MAX_PLAYERS,
	MIN_PLAYERS,
	PASS_CHOICES,
	TURN_SECONDS_CHOICES,
	type DoodleChatEntry,
	type DoodleClientMsg,
	type DoodlePhase,
	type DoodleServerMsg,
	type DoodleSettings,
	type DoodleState,
} from "../app/lib/doodle-protocol";

interface PlayerRecord {
	pid: string;
	id: string;
	name: string;
	contributions: number;
}

type AlarmJob = "turn" | null;

interface Persisted {
	code: string;
	phase: DoodlePhase;
	settings: DoodleSettings;
	players: PlayerRecord[];
	hostPid: string | null;
	order: string[];
	orderIndex: number;
	pass: number;
	endsAt: number | null;
	alarmJob: AlarmJob;
	chat: DoodleChatEntry[];
}

interface Attachment {
	pid: string;
}

function freshRoom(code: string): Persisted {
	return {
		code,
		phase: "lobby",
		settings: { seconds: 45, passes: 3 },
		players: [],
		hostPid: null,
		order: [],
		orderIndex: 0,
		pass: 1,
		endsAt: null,
		alarmJob: null,
		chat: [],
	};
}

/**
 * One instance per room code.
 *
 * The simplest room of the set: it owns the turn order, the clock and the
 * picture. Nothing is hidden from anybody, so unlike the other games there is
 * no per-recipient state to build — every client sees exactly the same thing.
 */
export class DoodleRoom extends DurableObject<Env> {
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
				contributions: 0,
			};
			room.players.push(player);
			// Latecomers join the end of the rotation rather than waiting.
			if (room.phase === "drawing" && !room.order.includes(pid)) room.order.push(pid);
			this.pushChat(room, { kind: "join", text: `${player.name} joined` });
		}

		if (room.hostPid === null) room.hostPid = pid;

		const { client, server } = this.hub.accept({ pid });
		await this.save();

		this.hub.send(server, {
			t: "welcome",
			you: { id: player.id },
			state: this.stateOf(),
			canvas: this.canvas,
			chat: room.chat,
		} satisfies DoodleServerMsg);

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
		if (player) this.pushChat(room, { kind: "leave", text: `${player.name} left` });

		if (room.phase === "lobby") {
			room.players = room.players.filter((p) => p.pid !== att.pid);
			if (room.hostPid === att.pid) room.hostPid = room.players[0]?.pid ?? null;
		}

		await this.save();

		// Don't leave everyone waiting on somebody who has gone.
		if (room.phase === "drawing" && room.order[room.orderIndex] === att.pid) {
			await this.nextTurn();
			return;
		}
		this.broadcast(ws);
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

		let msg: DoodleClientMsg;
		try {
			msg = JSON.parse(message) as DoodleClientMsg;
		} catch {
			return;
		}

		const isHost = room.hostPid === att.pid;
		const isActive = room.phase === "drawing" && room.order[room.orderIndex] === att.pid;

		switch (msg.t) {
			case "setName": {
				me.name = String(msg.name ?? "").slice(0, 16).trim() || me.name;
				await this.save();
				break;
			}

			case "setSettings": {
				if (!isHost || room.phase !== "lobby") return;
				const next = msg.settings ?? {};
				if (
					typeof next.seconds === "number" &&
					(TURN_SECONDS_CHOICES as readonly number[]).includes(next.seconds)
				) {
					room.settings.seconds = next.seconds;
				}
				if (typeof next.passes === "number" && (PASS_CHOICES as readonly number[]).includes(next.passes)) {
					room.settings.passes = next.passes;
				}
				await this.save();
				break;
			}

			case "start": {
				if (!isHost || room.phase !== "lobby") return;
				const connected = this.connectedPlayers();
				if (connected.length < MIN_PLAYERS) {
					this.hub.send(ws, { t: "error", message: `You need at least ${MIN_PLAYERS} people.` });
					return;
				}
				for (const p of room.players) p.contributions = 0;
				this.canvas = [];
				await this.saveCanvas();
				room.order = connected.map((p) => p.pid);
				room.orderIndex = 0;
				room.pass = 1;
				room.phase = "drawing";
				this.pushChat(room, { kind: "system", text: "Off we go — one turn each." });
				await this.beginTurn();
				return;
			}

			case "op": {
				if (!isActive) return;
				if (!isValidPackedOp(msg.op)) return;
				if (this.canvas.length >= MAX_CANVAS_OPS) {
					this.hub.send(ws, { t: "error", message: "The picture is full." });
					return;
				}
				this.canvas.push(msg.op);
				me.contributions += 1;
				// Not awaited: persistence must not add latency to live drawing.
				void this.saveCanvas();
				const frame = JSON.stringify({ t: "op", op: msg.op } satisfies DoodleServerMsg);
				this.hub.broadcastRaw(frame, (a) => a.pid !== att.pid);
				return;
			}

			case "done": {
				if (!isActive) return;
				await this.nextTurn();
				return;
			}

			case "finish": {
				if (!isHost || room.phase !== "drawing") return;
				this.pushChat(room, { kind: "system", text: `${me.name} called it finished.` });
				await this.finish();
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
				if (!isHost || room.phase !== "finished") return;
				room.phase = "lobby";
				room.order = [];
				room.orderIndex = 0;
				room.pass = 1;
				room.endsAt = null;
				room.alarmJob = null;
				for (const p of room.players) p.contributions = 0;
				this.canvas = [];
				await this.saveCanvas();
				await this.ctx.storage.deleteAlarm();
				await this.save();
				// Everyone needs the blank canvas, not just the host.
				this.hub.broadcastRaw(JSON.stringify({ t: "canvas", canvas: [] } satisfies DoodleServerMsg));
				break;
			}
		}

		this.broadcast();
	}

	/* ---------------- turns ---------------- */

	private connectedPlayers(): PlayerRecord[] {
		const room = this.room;
		if (!room) return [];
		const live = this.hub.connectedPids();
		return room.players.filter((p) => live.has(p.pid));
	}

	private async beginTurn() {
		const room = this.room;
		if (!room) return;
		room.endsAt = Date.now() + room.settings.seconds * 1000;
		room.alarmJob = "turn";
		await this.save();
		await this.ctx.storage.setAlarm(room.endsAt);
		this.broadcast();
	}

	private async nextTurn() {
		const room = this.room;
		if (!room) return;

		room.orderIndex += 1;
		if (room.orderIndex >= room.order.length) {
			room.orderIndex = 0;
			room.pass += 1;
			if (room.pass > room.settings.passes) {
				await this.finish();
				return;
			}
		}

		// Skip anyone who has dropped out.
		const live = this.hub.connectedPids();
		let guard = 0;
		while (!live.has(room.order[room.orderIndex]) && guard <= room.order.length) {
			room.orderIndex += 1;
			guard += 1;
			if (room.orderIndex >= room.order.length) {
				room.orderIndex = 0;
				room.pass += 1;
				if (room.pass > room.settings.passes) {
					await this.finish();
					return;
				}
			}
		}

		if (this.connectedPlayers().length === 0) {
			await this.finish();
			return;
		}

		await this.beginTurn();
	}

	private async finish() {
		const room = this.room;
		if (!room) return;
		room.phase = "finished";
		room.endsAt = null;
		room.alarmJob = null;
		await this.ctx.storage.deleteAlarm();
		this.pushChat(room, { kind: "system", text: "Finished — here's what everyone made." });
		await this.save();
		this.flushChat();
		this.broadcast();
	}

	override async alarm() {
		const room = this.room;
		if (!room) return;
		room.alarmJob = null;
		if (room.phase !== "drawing") {
			await this.save();
			return;
		}
		await this.nextTurn();
	}

	/* ---------------- chat ---------------- */

	private pushChat(room: Persisted, entry: Omit<DoodleChatEntry, "id" | "at">) {
		room.chat.push({ id: crypto.randomUUID().slice(0, 8), at: Date.now(), ...entry });
		if (room.chat.length > MAX_CHAT) room.chat = room.chat.slice(-MAX_CHAT);
	}

	private flushChat() {
		const room = this.room;
		if (!room) return;
		const latest = room.chat[room.chat.length - 1];
		if (!latest) return;
		this.hub.broadcastRaw(JSON.stringify({ t: "chat", entry: latest } satisfies DoodleServerMsg));
	}

	/* ---------------- state ---------------- */

	/** Nothing is secret here, so one snapshot serves everybody. */
	private stateOf(): DoodleState {
		const room = this.room ?? freshRoom("?????");
		const live = this.hub.connectedPids();
		const idOf = (pid: string) => room.players.find((p) => p.pid === pid)?.id ?? "";
		const active = room.phase === "drawing" ? room.order[room.orderIndex] : null;

		return {
			code: room.code,
			phase: room.phase,
			settings: room.settings,
			players: room.players.map((p) => ({
				id: p.id,
				name: p.name,
				connected: live.has(p.pid),
				contributions: p.contributions,
			})),
			hostId: room.hostPid ? idOf(room.hostPid) : null,
			activeId: active ? idOf(active) : null,
			order: room.order.map(idOf),
			pass: room.pass,
			endsAt: room.endsAt,
			serverNow: Date.now(),
			opCount: this.canvas.length,
		};
	}

	private broadcast(except?: WebSocket) {
		const frame = JSON.stringify({ t: "state", state: this.stateOf() } satisfies DoodleServerMsg);
		this.hub.broadcastRaw(frame, undefined, except);
	}
}
