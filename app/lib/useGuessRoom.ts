import { useCallback, useEffect, useRef, useState } from "react";
import type { PackedOp } from "./drawing-codec";
import type { ChatEntry, GuessClientMsg, GuessServerMsg, GuessState } from "./guess-protocol";

export type GuessConnStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface GuessRoomConnection {
	state: GuessState | null;
	youId: string | null;
	status: GuessConnStatus;
	error: string | null;
	chat: ChatEntry[];
	/** The drawing in progress, as received from the drawer. */
	canvas: PackedOp[];
	send: (msg: GuessClientMsg) => void;
	clockOffset: number;
	dismissError: () => void;
}

/** Per-tab identity: a refresh reclaims your seat, a second tab is a second player. */
function persistentPid(code: string): string {
	const key = `guess-pid:${code}`;
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

export function useGuessRoom(code: string, name: string): GuessRoomConnection {
	const [state, setState] = useState<GuessState | null>(null);
	const [youId, setYouId] = useState<string | null>(null);
	const [status, setStatus] = useState<GuessConnStatus>("connecting");
	const [error, setError] = useState<string | null>(null);
	const [chat, setChat] = useState<ChatEntry[]>([]);
	const [canvas, setCanvas] = useState<PackedOp[]>([]);
	const [clockOffset, setClockOffset] = useState(0);

	const wsRef = useRef<WebSocket | null>(null);
	const closedByUs = useRef(false);
	const attempts = useRef(0);
	const retryTimer = useRef<number | null>(null);
	const nameRef = useRef(name);
	nameRef.current = name;
	const lastTurn = useRef<number>(-1);

	const send = useCallback((msg: GuessClientMsg) => {
		const ws = wsRef.current;
		if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
	}, []);

	useEffect(() => {
		if (!code) return;
		closedByUs.current = false;

		const connect = () => {
			const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
			const params = new URLSearchParams({ pid: persistentPid(code), name: nameRef.current ?? "" });
			const ws = new WebSocket(`${proto}//${window.location.host}/api/guess/${code}/ws?${params}`);
			wsRef.current = ws;

			ws.onopen = () => {
				attempts.current = 0;
				setStatus("open");
			};

			ws.onmessage = (event) => {
				let msg: GuessServerMsg;
				try {
					msg = JSON.parse(String(event.data)) as GuessServerMsg;
				} catch {
					return;
				}

				switch (msg.t) {
					case "welcome":
						setYouId(msg.you.id);
						setState(msg.state);
						setChat(msg.chat);
						setClockOffset(msg.state.serverNow - Date.now());
						lastTurn.current = msg.state.turnNumber;
						break;
					case "state":
						setState(msg.state);
						setClockOffset(msg.state.serverNow - Date.now());
						// A new turn means a blank canvas for everyone.
						if (msg.state.turnNumber !== lastTurn.current) {
							lastTurn.current = msg.state.turnNumber;
							setCanvas([]);
						}
						break;
					case "stroke":
						setCanvas((prev) => [...prev, msg.op]);
						break;
					case "sync":
						setCanvas(msg.ops);
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

	return { state, youId, status, error, chat, canvas, send, clockOffset, dismissError };
}
