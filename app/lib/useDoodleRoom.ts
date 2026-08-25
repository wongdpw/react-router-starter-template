import { useCallback, useEffect, useRef, useState } from "react";
import type { PackedOp } from "./drawing-codec";
import type { DoodleChatEntry, DoodleClientMsg, DoodleServerMsg, DoodleState } from "./doodle-protocol";

export type DoodleConnStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface DoodleRoomConnection {
	state: DoodleState | null;
	youId: string | null;
	status: DoodleConnStatus;
	error: string | null;
	chat: DoodleChatEntry[];
	/** The shared picture, everyone's contributions combined. */
	canvas: PackedOp[];
	/** Adds your own op locally — the server relays it to everyone else. */
	appendLocal: (op: PackedOp) => void;
	send: (msg: DoodleClientMsg) => void;
	clockOffset: number;
	dismissError: () => void;
}

/** Per-tab identity: refreshing keeps your place, a second tab is a second person. */
function persistentPid(code: string): string {
	const key = `doodle-pid:${code}`;
	try {
		const existing = window.sessionStorage.getItem(key);
		if (existing) return existing;
		const fresh = crypto.randomUUID();
		window.sessionStorage.setItem(key, fresh);
		return fresh;
	} catch {
		return crypto.randomUUID();
	}
}

export function useDoodleRoom(code: string, name: string): DoodleRoomConnection {
	const [state, setState] = useState<DoodleState | null>(null);
	const [youId, setYouId] = useState<string | null>(null);
	const [status, setStatus] = useState<DoodleConnStatus>("connecting");
	const [error, setError] = useState<string | null>(null);
	const [chat, setChat] = useState<DoodleChatEntry[]>([]);
	const [canvas, setCanvas] = useState<PackedOp[]>([]);
	const [clockOffset, setClockOffset] = useState(0);

	const wsRef = useRef<WebSocket | null>(null);
	const closedByUs = useRef(false);
	const attempts = useRef(0);
	const retryTimer = useRef<number | null>(null);
	const nameRef = useRef(name);
	nameRef.current = name;

	const send = useCallback((msg: DoodleClientMsg) => {
		const ws = wsRef.current;
		if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
	}, []);

	/**
	 * The server relays your op to everyone else but not back to you, so your
	 * own contribution is folded into the shared picture here.
	 */
	const appendLocal = useCallback((op: PackedOp) => {
		setCanvas((prev) => [...prev, op]);
	}, []);

	useEffect(() => {
		if (!code) return;
		closedByUs.current = false;

		const connect = () => {
			const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
			const params = new URLSearchParams({ pid: persistentPid(code), name: nameRef.current ?? "" });
			const ws = new WebSocket(`${proto}//${window.location.host}/api/doodle/${code}/ws?${params}`);
			wsRef.current = ws;

			ws.onopen = () => {
				attempts.current = 0;
				setStatus("open");
			};

			ws.onmessage = (event) => {
				let msg: DoodleServerMsg;
				try {
					msg = JSON.parse(String(event.data)) as DoodleServerMsg;
				} catch {
					return;
				}
				switch (msg.t) {
					case "welcome":
						setYouId(msg.you.id);
						setState(msg.state);
						setCanvas(msg.canvas);
						setChat(msg.chat);
						setClockOffset(msg.state.serverNow - Date.now());
						break;
					case "state":
						setState(msg.state);
						setClockOffset(msg.state.serverNow - Date.now());
						break;
					case "op":
						setCanvas((prev) => [...prev, msg.op]);
						break;
					case "canvas":
						setCanvas(msg.canvas);
						break;
					case "chat":
						setChat((prev) => [...prev, msg.entry].slice(-80));
						break;
					case "error":
						setError(msg.message);
						break;
				}
			};

			const scheduleRetry = () => {
				if (closedByUs.current) return;
				attempts.current += 1;
				if (attempts.current > 8) {
					setStatus("closed");
					return;
				}
				setStatus("reconnecting");
				retryTimer.current = window.setTimeout(connect, Math.min(8000, 700 * 2 ** (attempts.current - 1)));
			};

			ws.onclose = scheduleRetry;
			ws.onerror = () => {
				try {
					ws.close();
				} catch {
					/* already closing */
				}
			};
		};

		connect();

		return () => {
			closedByUs.current = true;
			if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
			try {
				wsRef.current?.close();
			} catch {
				/* already closed */
			}
			wsRef.current = null;
		};
	}, [code]);

	const dismissError = useCallback(() => setError(null), []);

	return { state, youId, status, error, chat, canvas, appendLocal, send, clockOffset, dismissError };
}
