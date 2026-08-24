import { useCallback, useEffect, useRef, useState } from "react";
import type { FakeChatEntry, FakeClientMsg, FakeServerMsg, FakeState } from "./fake-artist-protocol";

export type FakeConnStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface FakeRoomConnection {
	state: FakeState | null;
	youId: string | null;
	status: FakeConnStatus;
	error: string | null;
	chat: FakeChatEntry[];
	send: (msg: FakeClientMsg) => void;
	clockOffset: number;
	dismissError: () => void;
}

/** Per-tab identity: refreshing keeps your seat, a second tab is a second player. */
function persistentPid(code: string): string {
	const key = `fake-pid:${code}`;
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

export function useFakeArtistRoom(code: string, name: string): FakeRoomConnection {
	const [state, setState] = useState<FakeState | null>(null);
	const [youId, setYouId] = useState<string | null>(null);
	const [status, setStatus] = useState<FakeConnStatus>("connecting");
	const [error, setError] = useState<string | null>(null);
	const [chat, setChat] = useState<FakeChatEntry[]>([]);
	const [clockOffset, setClockOffset] = useState(0);

	const wsRef = useRef<WebSocket | null>(null);
	const closedByUs = useRef(false);
	const attempts = useRef(0);
	const retryTimer = useRef<number | null>(null);
	const nameRef = useRef(name);
	nameRef.current = name;

	const send = useCallback((msg: FakeClientMsg) => {
		const ws = wsRef.current;
		if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
	}, []);

	useEffect(() => {
		if (!code) return;
		closedByUs.current = false;

		const connect = () => {
			const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
			const params = new URLSearchParams({ pid: persistentPid(code), name: nameRef.current ?? "" });
			const ws = new WebSocket(`${proto}//${window.location.host}/api/fake/${code}/ws?${params}`);
			wsRef.current = ws;

			ws.onopen = () => {
				attempts.current = 0;
				setStatus("open");
			};

			ws.onmessage = (event) => {
				let msg: FakeServerMsg;
				try {
					msg = JSON.parse(String(event.data)) as FakeServerMsg;
				} catch {
					return;
				}
				switch (msg.t) {
					case "welcome":
						setYouId(msg.you.id);
						setState(msg.state);
						setChat(msg.chat);
						setClockOffset(msg.state.serverNow - Date.now());
						break;
					case "state":
						setState(msg.state);
						setClockOffset(msg.state.serverNow - Date.now());
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

	return { state, youId, status, error, chat, send, clockOffset, dismissError };
}
