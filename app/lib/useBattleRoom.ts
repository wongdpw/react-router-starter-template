import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMsg, PackedOp, Role, RoomState, Seat, ServerMsg } from "./battle-protocol";

export type ConnStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface BattleRoomConnection {
	state: RoomState | null;
	you: { role: Role; seat: Seat | null } | null;
	status: ConnStatus;
	error: string | null;
	/** Strokes streamed from players while they draw — spectators only. */
	liveOps: [PackedOp[], PackedOp[]];
	send: (msg: ClientMsg) => void;
	/** Add to Date.now() to get the server's clock. */
	clockOffset: number;
	dismissError: () => void;
}

/**
 * Identity is per-tab, so opening a second tab joins as a second player
 * (handy for testing) while a refresh reclaims the same seat.
 */
function persistentPid(code: string): string {
	const key = `battle-pid:${code}`;
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

export function useBattleRoom(code: string, name: string): BattleRoomConnection {
	const [state, setState] = useState<RoomState | null>(null);
	const [you, setYou] = useState<{ role: Role; seat: Seat | null } | null>(null);
	const [status, setStatus] = useState<ConnStatus>("connecting");
	const [error, setError] = useState<string | null>(null);
	const [liveOps, setLiveOps] = useState<[PackedOp[], PackedOp[]]>([[], []]);
	const [clockOffset, setClockOffset] = useState(0);

	const wsRef = useRef<WebSocket | null>(null);
	const closedByUs = useRef(false);
	const attempts = useRef(0);
	const retryTimer = useRef<number | null>(null);
	const nameRef = useRef(name);
	nameRef.current = name;
	const lastPhase = useRef<string | null>(null);

	const send = useCallback((msg: ClientMsg) => {
		const ws = wsRef.current;
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(msg));
		}
	}, []);

	useEffect(() => {
		if (!code) return;
		closedByUs.current = false;

		const connect = () => {
			const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
			const params = new URLSearchParams({
				pid: persistentPid(code),
				name: nameRef.current ?? "",
			});
			const ws = new WebSocket(`${proto}//${window.location.host}/api/battle/${code}/ws?${params}`);
			wsRef.current = ws;

			ws.onopen = () => {
				attempts.current = 0;
				setStatus("open");
			};

			ws.onmessage = (event) => {
				let msg: ServerMsg;
				try {
					msg = JSON.parse(String(event.data)) as ServerMsg;
				} catch {
					return;
				}

				if (msg.t === "welcome") {
					setYou(msg.you);
					setState(msg.state);
					setClockOffset(msg.state.serverNow - Date.now());
					lastPhase.current = msg.state.phase;
					return;
				}

				if (msg.t === "state") {
					setState(msg.state);
					setClockOffset(msg.state.serverNow - Date.now());
					// A fresh round wipes the spectator's live canvases.
					if (msg.state.phase === "countdown" && lastPhase.current !== "countdown") {
						setLiveOps([[], []]);
					}
					lastPhase.current = msg.state.phase;
					return;
				}

				if (msg.t === "peerStroke") {
					setLiveOps((prev) => {
						const next: [PackedOp[], PackedOp[]] = [prev[0], prev[1]];
						next[msg.seat] = [...next[msg.seat], msg.op];
						return next;
					});
					return;
				}

				if (msg.t === "error") {
					setError(msg.message);
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
				const delay = Math.min(8000, 700 * 2 ** (attempts.current - 1));
				retryTimer.current = window.setTimeout(connect, delay);
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

	return { state, you, status, error, liveOps, send, clockOffset, dismissError };
}
