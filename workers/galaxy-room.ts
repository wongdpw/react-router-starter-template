import { DurableObject } from "cloudflare:workers";
import { SocketHub } from "./socket-hub";
import {
	GALAXY_MAX_PLAYERS,
	type GalaxyClientMsg,
	type GalaxyRoomState,
	type GalaxySeat,
	type GalaxyPhase,
	type GalaxyServerMsg,
} from "../app/lib/galaxy-protocol";

interface Attachment {
	pid: string;
}

interface Persisted {
	code: string;
	phase: GalaxyPhase;
	seats: GalaxySeat[]; // seat 0 = host = player 1
}

/**
 * One instance per room code.
 *
 * Unlike the drawing rooms, this DO deliberately holds no game state at
 * all: the host browser is the single authoritative simulation. The room's
 * whole job is seating (host = seat 0) and relaying frames — guest inputs
 * up to the host, host snapshots down to the guest. Snapshots are transient
 * and never touch storage, so an active game costs the DO almost nothing.
 */
export class GalaxySwarmRoom extends DurableObject<Env> {
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

	private seatOf(pid: string): number {
		return this.room ? this.room.seats.findIndex((s) => s.pid === pid) : -1;
	}

	private stateFor(pid: string): GalaxyRoomState {
		const room = this.room!;
		return {
			code: room.code,
			phase: room.phase,
			seats: room.seats.map((s) => ({ ...s })),
			youSeat: this.seatOf(pid),
		};
	}

	private broadcastRoom() {
		this.hub.broadcastEach((att) => ({ t: "room", state: this.stateFor(att.pid) } satisfies GalaxyServerMsg));
	}

	/** Send one message to every socket belonging to the given seat. */
	private sendToSeat(seat: number, frame: string) {
		const pid = this.room?.seats[seat]?.pid;
		if (!pid) return;
		this.hub.broadcastRaw(frame, (att) => att.pid === pid);
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("Expected a WebSocket", { status: 426 });
		}

		const code = (url.searchParams.get("code") ?? "").toUpperCase();
		const pid = url.searchParams.get("pid") ?? "";
		const name = (url.searchParams.get("name") ?? "").slice(0, 24).trim() || "Player";
		if (!pid) return new Response("Missing pid", { status: 400 });

		if (!this.room) {
			this.room = { code, phase: "lobby", seats: [] };
		}

		// Seat the connection: a returning pid reclaims its seat, a new pid
		// takes a free one, everyone else is turned away at the door.
		let seat = this.seatOf(pid);
		if (seat === -1) {
			if (this.room.seats.length >= GALAXY_MAX_PLAYERS) {
				const pair = new WebSocketPair();
				pair[1].accept();
				pair[1].send(JSON.stringify({ t: "error", message: "This room already has two pilots." } satisfies GalaxyServerMsg));
				pair[1].close(1008, "room full");
				return new Response(null, { status: 101, webSocket: pair[0] });
			}
			this.room.seats.push({ pid, name, connected: true });
			seat = this.room.seats.length - 1;
		} else {
			this.room.seats[seat].name = name;
			this.room.seats[seat].connected = true;
		}
		await this.save();

		const { client } = this.hub.accept({ pid });
		this.broadcastRoom();
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		if (typeof message !== "string" || !this.room) return;
		const att = this.hub.attachmentOf(ws);
		if (!att) return;
		const seat = this.seatOf(att.pid);
		if (seat === -1) return;

		let msg: GalaxyClientMsg;
		try {
			msg = JSON.parse(message) as GalaxyClientMsg;
		} catch {
			return;
		}

		switch (msg.t) {
			case "start": {
				// Host-only, and only with a full cockpit.
				if (seat !== 0) return;
				if (this.room.seats.length < GALAXY_MAX_PLAYERS) return;
				this.room.phase = "play";
				await this.save();
				this.broadcastRoom();
				this.hub.broadcastRaw(JSON.stringify({ t: "begin" } satisfies GalaxyServerMsg));
				return;
			}
			case "input": {
				// Guest → host, verbatim. Not persisted, not validated beyond shape.
				if (seat !== 1 || this.room.phase !== "play") return;
				this.sendToSeat(0, message);
				return;
			}
			case "snap": {
				// Host → guest, verbatim.
				if (seat !== 0 || this.room.phase !== "play") return;
				this.sendToSeat(1, message);
				return;
			}
			case "over": {
				if (seat !== 0 || this.room.phase !== "play") return;
				this.room.phase = "over";
				await this.save();
				this.hub.broadcastRaw(JSON.stringify({ t: "ended", s: msg.s } satisfies GalaxyServerMsg));
				this.broadcastRoom();
				return;
			}
		}
	}

	async webSocketClose(ws: WebSocket) {
		const att = this.hub.attachmentOf(ws);
		if (!att || !this.room) return;
		if (this.hub.hasOtherSocket(att.pid, ws)) return; // another tab still holds the seat

		const seat = this.seatOf(att.pid);
		if (seat !== -1) {
			this.room.seats[seat].connected = false;
			// In the lobby a vacated seat opens up again; mid-game we keep it
			// reserved so a refresh can reclaim it.
			if (this.room.phase === "lobby") {
				this.room.seats.splice(seat, 1);
			}
			await this.save();
			this.hub.broadcastRaw(JSON.stringify({ t: "peerGone" } satisfies GalaxyServerMsg), (a) => a.pid !== att.pid);
			this.broadcastRoom();
		}
	}

	async webSocketError(ws: WebSocket) {
		await this.webSocketClose(ws);
	}
}
