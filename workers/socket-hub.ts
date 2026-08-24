/**
 * WebSocket bookkeeping shared by every game room Durable Object.
 *
 * Uses the hibernation API, so an idle room costs nothing while players sit
 * between rounds. Per-connection data rides on the socket's serialized
 * attachment rather than in memory, which is what lets it survive the object
 * being evicted and rebuilt.
 *
 * This is composition, not a base class: each game keeps full control of its
 * own state machine and only delegates the socket plumbing.
 */
export class SocketHub<A extends { pid: string }> {
	constructor(private readonly ctx: DurableObjectState) {}

	/**
	 * Accepts a hibernatable connection. The `client` half goes back in the
	 * 101 response; the `server` half is what the room sends on.
	 */
	accept(attachment: A): { client: WebSocket; server: WebSocket } {
		const pair = new WebSocketPair();
		const server = pair[1];
		this.ctx.acceptWebSocket(server);
		server.serializeAttachment(attachment);
		return { client: pair[0], server };
	}

	attachmentOf(ws: WebSocket): A | null {
		return (ws.deserializeAttachment() ?? null) as A | null;
	}

	update(ws: WebSocket, attachment: A) {
		ws.serializeAttachment(attachment);
	}

	list(): { ws: WebSocket; att: A }[] {
		const out: { ws: WebSocket; att: A }[] = [];
		for (const ws of this.ctx.getWebSockets()) {
			const att = this.attachmentOf(ws);
			if (att) out.push({ ws, att });
		}
		return out;
	}

	/** Distinct participant ids currently connected. */
	connectedPids(): Set<string> {
		return new Set(this.list().map((s) => s.att.pid));
	}

	/** True when this pid still has another live socket besides `except`. */
	hasOtherSocket(pid: string, except: WebSocket): boolean {
		return this.list().some((s) => s.ws !== except && s.att.pid === pid);
	}

	send(ws: WebSocket, msg: unknown) {
		try {
			ws.send(JSON.stringify(msg));
		} catch {
			/* socket already gone */
		}
	}

	sendRaw(ws: WebSocket, frame: string) {
		try {
			ws.send(frame);
		} catch {
			/* socket already gone */
		}
	}

	/** One prebuilt frame to every matching connection. */
	broadcastRaw(frame: string, filter?: (att: A) => boolean, except?: WebSocket) {
		for (const s of this.list()) {
			if (s.ws === except) continue;
			if (filter && !filter(s.att)) continue;
			this.sendRaw(s.ws, frame);
		}
	}

	/** Per-recipient payloads, for state that differs by viewer. */
	broadcastEach(build: (att: A) => unknown | null, except?: WebSocket) {
		for (const s of this.list()) {
			if (s.ws === except) continue;
			const msg = build(s.att);
			if (msg !== null) this.send(s.ws, msg);
		}
	}
}
