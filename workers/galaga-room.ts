import { DurableObject } from "cloudflare:workers";
import { SocketHub } from "./socket-hub";

type Seat = 0 | 1;
type Phase = "lobby" | "playing" | "over";

interface SeatRecord {
	pid: string;
	name: string;
	ready: boolean;
}

interface Persisted {
	code: string;
	phase: Phase;
	seats: (SeatRecord | null)[];
	hostPid: string | null; // seat 0 whenever present
}

interface Attachment {
	pid: string;
	seat: Seat | null;
}

function freshRoom(code: string): Persisted {
	return { code, phase: "lobby", seats: [null, null], hostPid: null };
}

/**
 * Galaga co-op is host-authoritative: seat 0's browser runs the real game
 * loop and broadcasts snapshots, seat 1 only sends input and renders what
 * it's told. This DO does no simulation of its own — it's a lobby plus a
 * dumb relay between the two sockets, which is what keeps the added
 * latency down to one hop instead of a round trip through game logic.
 */
export class GalagaRoom extends DurableObject<Env> {
	private room: Persisted | null = null;
	private hub: SocketHub<Attachment>;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.hub = new SocketHub<Attachment>(ctx);
		ctx.blockConcurrencyWhile(async () => {
			this.room = (await ctx.storage.get<Persisted>("room")) ?? null;
		});
	}

	private async save() {
		if (this.room) await this.ctx.storage.put("room", this.room);
	}

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

		let seat: Seat | null = null;
		const existing = room.seats.findIndex((s) => s?.pid === pid);
		if (existing >= 0) {
			seat = existing as Seat;
		} else {
			const free = room.seats.findIndex((s) => s === null);
			if (free >= 0) {
				seat = free as Seat;
				room.seats[free] = { pid, name: name || `Player ${free + 1}`, ready: false };
			} else {
				return new Response("Room is full", { status: 503 });
			}
		}
		if (room.hostPid === null && seat === 0) room.hostPid = pid;

		const attachment: Attachment = { pid, seat };
		const { client, server } = this.hub.accept(attachment);
		await this.save();

		this.hub.send(server, { t: "welcome", seat, state: this.publicState() });
		this.broadcastState();
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
		if (att && att.seat !== null && !this.hub.hasOtherSocket(att.pid, ws)) {
			const wasHost = room.hostPid === att.pid;
			room.seats[att.seat] = null;
			if (room.phase === "lobby") {
				if (wasHost) {
					const other = room.seats.find((s) => s !== null);
					room.hostPid = other ? other.pid : null;
				}
			} else if (room.phase === "playing") {
				// No mid-match host migration yet — a dropped player ends the round.
				room.phase = "over";
			}
			await this.save();
		}
		this.broadcastState();
	}

	override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		if (typeof message !== "string") return;
		if (message.length > 32_768) return; // snapshots stay well under this
		const room = this.room;
		if (!room) return;
		const att = this.hub.attachmentOf(ws);
		if (!att || att.seat === null) return;

		let msg: any;
		try {
			msg = JSON.parse(message);
		} catch {
			return;
		}

		const isHost = room.hostPid === att.pid;

		switch (msg.t) {
			case "ready": {
				const rec = room.seats[att.seat];
				if (rec) rec.ready = Boolean(msg.value);
				await this.save();
				this.broadcastState();
				return;
			}
			case "start": {
				if (!isHost || room.phase !== "lobby") return;
				if (!room.seats[0] || !room.seats[1]) return;
				room.phase = "playing";
				await this.save();
				this.hub.broadcastRaw(JSON.stringify({ t: "start" }), undefined, ws);
				this.broadcastState();
				return;
			}
			// Guest -> host: raw input, relayed untouched, host-only.
			case "input": {
				if (isHost || room.phase !== "playing") return;
				this.hub.broadcastRaw(message, (a) => a.pid === room.hostPid);
				return;
			}
			// Host -> guest: compact game-state snapshot, relayed untouched.
			case "snapshot": {
				if (!isHost || room.phase !== "playing") return;
				this.hub.broadcastRaw(message, (a) => a.pid !== room.hostPid);
				return;
			}
			case "gameover": {
				if (!isHost) return;
				room.phase = "over";
				await this.save();
				this.hub.broadcastRaw(JSON.stringify({ t: "gameover", score: msg.score }));
				this.broadcastState();
				return;
			}
			case "rematch": {
				if (!isHost || room.phase !== "over") return;
				room.phase = "lobby";
				for (const s of room.seats) if (s) s.ready = false;
				await this.save();
				this.broadcastState();
				return;
			}
		}
	}

	private publicState() {
		const room = this.room!;
		const connected = this.hub.connectedPids();
		return {
			code: room.code,
			phase: room.phase,
			hostSeat: room.seats.findIndex((s) => s?.pid === room.hostPid),
			players: room.seats.map((s) => (s ? { name: s.name, ready: s.ready, connected: connected.has(s.pid) } : null)),
		};
	}

	private broadcastState() {
		this.hub.broadcastRaw(JSON.stringify({ t: "state", state: this.publicState() }));
	}
}
