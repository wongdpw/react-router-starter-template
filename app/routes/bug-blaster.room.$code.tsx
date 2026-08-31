import type { Route } from "./+types/bug-blaster.room.$code";
import { useCallback, useEffect, useRef, useState } from "react";
import { BattleHeader } from "../components/BattleHeader";
import {
	SNAP_EVERY_FRAMES,
	isValidRoomCode,
	type BlasterClientMsg,
	type BlasterRoomState,
	type BlasterServerMsg,
	type BlasterSnap,
} from "../lib/blaster-protocol";

export function meta({ params }: Route.MetaArgs) {
	return [{ title: `Bug Blaster room ${params.code ?? ""} — ArtDrop Spot` }];
}

const COLORS = {
	bg: "#0A0A0A",
	bgPanel: "#1A1A1A",
	accent: "#FACC15",
	blue: "#38BDF8",
	text: "#FFFFFF",
	textDim: "#9CA3AF",
	border: "#2E2E2E",
	red: "#F87171",
};

const NAME_KEY = "bugBlasterName";
const P_COLORS = ["#FACC15", "#38BDF8"];

/* Per-tab identity: a refresh reclaims your seat, a second tab is a second player. */
function persistentPid(code: string): string {
	const key = `blaster-pid:${code}`;
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

function savedName(): string {
	try {
		return window.localStorage.getItem(NAME_KEY) ?? "";
	} catch {
		return "";
	}
}

/* =========================================================================
   GAME SIMULATION — runs only in the host's browser (seat 0). Mirrors the
   local game's rules: mushroom field, splitting chains, per-wave scaling.
   ========================================================================= */

const CELL = 24;
const COLS = 24;
const ROWS = 26;
const W = COLS * CELL; // 576
const H = ROWS * CELL; // 624
const PLAYER_ZONE_ROWS = 6;
const FIRE_EVERY_MS = 110;
const MAX_BULLETS = 8;

type Mushroom = { col: number; row: number; hp: number };
type Segment = { col: number; row: number };
type Chain = { segments: Segment[]; dir: 1 | -1; vertical: 1 | -1 };
type Bullet = { x: number; y: number };
type Shooter = {
	x: number;
	y: number;
	startX: number;
	bullets: Bullet[];
	lastShot: number;
	lives: number;
	score: number;
	invulnUntil: number;
};
type Sim = {
	mushrooms: Map<string, Mushroom>;
	chains: Chain[];
	players: [Shooter, Shooter];
	wave: number;
	tickMs: number;
	lastTick: number;
	over: boolean;
	frame: number;
	snapSeq: number;
};

function mkey(col: number, row: number) {
	return `${col},${row}`;
}
function chainLengthFor(wave: number): number {
	return Math.min(20, 10 + Math.floor((wave - 1) * 1.5));
}
function tickMsFor(wave: number): number {
	return Math.max(35, 140 - (wave - 1) * 8);
}
function makeShooter(startX: number): Shooter {
	return {
		x: startX,
		y: H - CELL * 1.5,
		startX,
		bullets: [],
		lastShot: 0,
		lives: 3,
		score: 0,
		invulnUntil: 0,
	};
}
function seedMushrooms(sim: Sim, count: number) {
	let placed = 0;
	let guard = 0;
	while (placed < count && guard++ < 600) {
		const col = Math.floor(Math.random() * COLS);
		const row = 1 + Math.floor(Math.random() * (ROWS - PLAYER_ZONE_ROWS - 2));
		const k = mkey(col, row);
		if (!sim.mushrooms.has(k)) {
			sim.mushrooms.set(k, { col, row, hp: 4 });
			placed++;
		}
	}
}
function spawnChain(sim: Sim) {
	const segs: Segment[] = [];
	const len = chainLengthFor(sim.wave);
	for (let i = 0; i < len; i++) segs.push({ col: Math.floor(COLS / 2) + i, row: 0 });
	sim.chains.push({ segments: segs, dir: -1, vertical: 1 });
}
function newSim(): Sim {
	const sim: Sim = {
		mushrooms: new Map(),
		chains: [],
		players: [makeShooter(W / 3), makeShooter((W / 3) * 2)],
		wave: 1,
		tickMs: tickMsFor(1),
		lastTick: 0,
		over: false,
		frame: 0,
		snapSeq: 0,
	};
	seedMushrooms(sim, 30);
	spawnChain(sim);
	return sim;
}

function stepChains(sim: Sim) {
	for (const chain of sim.chains) {
		const head = chain.segments[0];
		let nextCol = head.col + chain.dir;
		let nextRow = head.row;
		let reversed = false;

		const blocked = nextCol < 0 || nextCol >= COLS || sim.mushrooms.has(mkey(nextCol, head.row));
		if (blocked) {
			reversed = true;
			nextCol = head.col;
			nextRow = head.row + chain.vertical;
			if (nextRow >= ROWS) {
				chain.vertical = -1;
				nextRow = ROWS - 2;
			} else if (nextRow < ROWS - PLAYER_ZONE_ROWS && chain.vertical === -1) {
				chain.vertical = 1;
				nextRow = ROWS - PLAYER_ZONE_ROWS;
			}
		}

		for (let i = chain.segments.length - 1; i > 0; i--) {
			chain.segments[i].col = chain.segments[i - 1].col;
			chain.segments[i].row = chain.segments[i - 1].row;
		}
		head.col = nextCol;
		head.row = nextRow;
		if (reversed) chain.dir = (chain.dir * -1) as 1 | -1;
	}
}

type Keys = { l: boolean; r: boolean; u: boolean; d: boolean; f: boolean };

function stepSim(sim: Sim, now: number, in1: Keys, in2: Keys): void {
	sim.frame++;
	const speed = 4;
	const inputs: [Keys, Keys] = [in1, in2];

	sim.players.forEach((p, i) => {
		if (p.lives <= 0) return;
		const k = inputs[i];
		if (k.l) p.x -= speed;
		if (k.r) p.x += speed;
		if (k.u) p.y -= speed;
		if (k.d) p.y += speed;
		p.x = Math.max(CELL / 2, Math.min(W - CELL / 2, p.x));
		p.y = Math.max(H - PLAYER_ZONE_ROWS * CELL + CELL / 2, Math.min(H - CELL / 2, p.y));

		if (k.f && p.bullets.length < MAX_BULLETS && now - p.lastShot >= FIRE_EVERY_MS) {
			p.lastShot = now;
			p.bullets.push({ x: p.x, y: p.y - CELL / 2 });
		}

		for (let bi = p.bullets.length - 1; bi >= 0; bi--) {
			const bullet = p.bullets[bi];
			bullet.y -= 14;
			if (bullet.y < 0) {
				p.bullets.splice(bi, 1);
				continue;
			}
			const bcol = Math.floor(bullet.x / CELL);
			const brow = Math.floor(bullet.y / CELL);

			const mk = mkey(bcol, brow);
			const mush = sim.mushrooms.get(mk);
			if (mush) {
				mush.hp -= 1;
				if (mush.hp <= 0) {
					sim.mushrooms.delete(mk);
					p.score += 1;
				}
				p.bullets.splice(bi, 1);
				continue;
			}

			outer: for (let c = 0; c < sim.chains.length; c++) {
				const chain = sim.chains[c];
				for (let s = 0; s < chain.segments.length; s++) {
					const seg = chain.segments[s];
					if (seg.col === bcol && seg.row === brow) {
						p.score += s === 0 ? 100 : 10;
						sim.mushrooms.set(mkey(seg.col, seg.row), { col: seg.col, row: seg.row, hp: 4 });
						const before = chain.segments.slice(0, s);
						const after = chain.segments.slice(s + 1);
						const next: Chain[] = [];
						if (before.length > 0) next.push({ segments: before, dir: chain.dir, vertical: chain.vertical });
						if (after.length > 0)
							next.push({ segments: after, dir: (chain.dir * -1) as 1 | -1, vertical: chain.vertical });
						sim.chains.splice(c, 1, ...next);
						p.bullets.splice(bi, 1);
						break outer;
					}
				}
			}
		}
	});

	if (now - sim.lastTick >= sim.tickMs) {
		sim.lastTick = now;
		stepChains(sim);
	}

	// segment vs player
	for (const p of sim.players) {
		if (p.lives <= 0 || now < p.invulnUntil) continue;
		const pcol = Math.floor(p.x / CELL);
		const prow = Math.floor(p.y / CELL);
		let hit = false;
		for (const chain of sim.chains) {
			for (const seg of chain.segments) {
				if (seg.col === pcol && seg.row === prow) {
					hit = true;
					break;
				}
			}
			if (hit) break;
		}
		if (hit) {
			p.lives -= 1;
			p.bullets = [];
			if (p.lives > 0) {
				p.x = p.startX;
				p.y = H - CELL * 1.5;
				p.invulnUntil = now + 2000;
			}
		}
	}
	if (sim.players.every((p) => p.lives <= 0)) {
		sim.over = true;
		return;
	}

	if (sim.chains.length === 0 || sim.chains.every((c) => c.segments.length === 0)) {
		sim.wave += 1;
		sim.tickMs = tickMsFor(sim.wave);
		sim.chains = [];
		seedMushrooms(sim, Math.min(24, (sim.wave - 1) * 3));
		spawnChain(sim);
	}
}

function buildSnap(sim: Sim, now: number): BlasterSnap {
	const r = Math.round;
	const segs: [number, number, number][] = [];
	for (const chain of sim.chains) {
		chain.segments.forEach((s, i) => segs.push([s.col, s.row, i === 0 ? 1 : 0]));
	}
	return {
		t: "snap",
		n: ++sim.snapSeq,
		w: sim.wave,
		s: [sim.players[0].score, sim.players[1].score],
		v: [sim.players[0].lives, sim.players[1].lives],
		p: [
			[r(sim.players[0].x), r(sim.players[0].y)],
			[r(sim.players[1].x), r(sim.players[1].y)],
		],
		i: [now < sim.players[0].invulnUntil, now < sim.players[1].invulnUntil],
		m: Array.from(sim.mushrooms.values()).map((m) => [m.col, m.row, m.hp] as [number, number, number]),
		c: segs,
		b: [
			sim.players[0].bullets.map((b) => [r(b.x), r(b.y)] as [number, number]),
			sim.players[1].bullets.map((b) => [r(b.x), r(b.y)] as [number, number]),
		],
	};
}

/* =========================================================================
   SHARED RENDERER
   ========================================================================= */

type DrawFrame = {
	wave: number;
	scores: [number, number];
	lives: [number, number];
	pos: [[number, number], [number, number]];
	flicker: [boolean, boolean];
	mushrooms: [number, number, number][];
	segments: [number, number, number][];
	bullets: [[number, number][], [number, number][]];
};

function frameFromSim(sim: Sim, now: number): DrawFrame {
	const segs: [number, number, number][] = [];
	for (const chain of sim.chains) {
		chain.segments.forEach((s, i) => segs.push([s.col, s.row, i === 0 ? 1 : 0]));
	}
	return {
		wave: sim.wave,
		scores: [sim.players[0].score, sim.players[1].score],
		lives: [sim.players[0].lives, sim.players[1].lives],
		pos: [
			[sim.players[0].x, sim.players[0].y],
			[sim.players[1].x, sim.players[1].y],
		],
		flicker: [
			now < sim.players[0].invulnUntil && Math.floor(now / 120) % 2 === 0,
			now < sim.players[1].invulnUntil && Math.floor(now / 120) % 2 === 0,
		],
		mushrooms: Array.from(sim.mushrooms.values()).map((m) => [m.col, m.row, m.hp] as [number, number, number]),
		segments: segs,
		bullets: [
			sim.players[0].bullets.map((b) => [b.x, b.y] as [number, number]),
			sim.players[1].bullets.map((b) => [b.x, b.y] as [number, number]),
		],
	};
}

function frameFromSnap(snap: BlasterSnap, now: number): DrawFrame {
	return {
		wave: snap.w,
		scores: snap.s,
		lives: snap.v,
		pos: snap.p,
		flicker: [snap.i[0] && Math.floor(now / 120) % 2 === 0, snap.i[1] && Math.floor(now / 120) % 2 === 0],
		mushrooms: snap.m,
		segments: snap.c,
		bullets: snap.b,
	};
}

function drawWorld(
	g: CanvasRenderingContext2D,
	frame: DrawFrame | null,
	names: [string, string],
	overlay: string | null
) {
	g.fillStyle = "#000000";
	g.fillRect(0, 0, W, H);

	if (frame) {
		g.strokeStyle = "rgba(250, 204, 21, 0.15)";
		g.beginPath();
		g.moveTo(0, H - PLAYER_ZONE_ROWS * CELL);
		g.lineTo(W, H - PLAYER_ZONE_ROWS * CELL);
		g.stroke();

		for (const [col, row, hp] of frame.mushrooms) {
			const x = col * CELL;
			const y = row * CELL;
			const shade = 0.4 + (hp / 4) * 0.6;
			g.fillStyle = `rgba(74, 222, 128, ${shade})`;
			g.beginPath();
			g.arc(x + CELL / 2, y + CELL / 2, CELL * 0.38, Math.PI, 0);
			g.closePath();
			g.fill();
			g.fillStyle = `rgba(220, 252, 231, ${shade * 0.9})`;
			g.fillRect(x + CELL * 0.35, y + CELL / 2, CELL * 0.3, CELL * 0.32);
		}

		for (const [col, row, isHead] of frame.segments) {
			const cx = col * CELL + CELL / 2;
			const cy = row * CELL + CELL / 2;
			g.fillStyle = isHead ? "#FACC15" : "#F87171";
			g.beginPath();
			g.arc(cx, cy, CELL * 0.42, 0, Math.PI * 2);
			g.fill();
			if (isHead) {
				g.fillStyle = "#0A0A0A";
				g.beginPath();
				g.arc(cx - 4, cy - 3, 2.4, 0, Math.PI * 2);
				g.arc(cx + 4, cy - 3, 2.4, 0, Math.PI * 2);
				g.fill();
			}
		}

		for (let i = 0 as 0 | 1; i <= 1; i = (i + 1) as 0 | 1) {
			if (frame.lives[i] > 0 && !frame.flicker[i]) {
				const [x, y] = frame.pos[i];
				g.fillStyle = P_COLORS[i];
				g.beginPath();
				g.moveTo(x, y - CELL * 0.45);
				g.lineTo(x - CELL * 0.38, y + CELL * 0.4);
				g.lineTo(x + CELL * 0.38, y + CELL * 0.4);
				g.closePath();
				g.fill();
				g.fillStyle = "#0A0A0A";
				g.fillRect(x - 3, y + CELL * 0.05, 6, CELL * 0.2);
			}
			g.fillStyle = "#FFFFFF";
			for (const [bx, by] of frame.bullets[i]) g.fillRect(bx - 1.5, by - 8, 3, 10);
		}

		g.font = "bold 15px Inter, sans-serif";
		g.fillStyle = P_COLORS[0];
		g.textAlign = "left";
		g.fillText(`${names[0] || "P1"} ${frame.scores[0]}  ♥${Math.max(0, frame.lives[0])}`, 10, 20);
		g.fillStyle = COLORS.accent;
		g.textAlign = "center";
		g.fillText(`WAVE ${frame.wave}`, W / 2, 20);
		g.fillStyle = P_COLORS[1];
		g.textAlign = "right";
		g.fillText(`${names[1] || "P2"} ${frame.scores[1]}  ♥${Math.max(0, frame.lives[1])}`, W - 10, 20);
	}

	if (overlay) {
		g.fillStyle = "rgba(0,0,0,0.72)";
		g.fillRect(0, 0, W, H);
		g.fillStyle = "#FFFFFF";
		g.font = "16px Inter, sans-serif";
		g.textAlign = "center";
		const lines = overlay.split("\n");
		lines.forEach((line, i) => g.fillText(line, W / 2, H / 2 - ((lines.length - 1) * 24) / 2 + i * 24));
	}
}

/* =========================================================================
   ROOM PAGE
   ========================================================================= */

type ConnStatus = "connecting" | "open" | "reconnecting" | "closed";

export default function BugBlasterRoomPage({ params }: Route.ComponentProps) {
	const code = (params.code ?? "").toUpperCase();

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const closedByUs = useRef(false);
	const attempts = useRef(0);
	const retryTimer = useRef<number | null>(null);

	const [room, setRoom] = useState<BlasterRoomState | null>(null);
	const [status, setStatus] = useState<ConnStatus>("connecting");
	const [error, setError] = useState<string | null>(null);
	const [peerGone, setPeerGone] = useState(false);
	const [playing, setPlaying] = useState(false);
	const [finalScores, setFinalScores] = useState<[number, number] | null>(null);

	const roomRef = useRef<BlasterRoomState | null>(null);
	roomRef.current = room;
	const playingRef = useRef(false);
	playingRef.current = playing;
	const simRef = useRef<Sim | null>(null);
	const snapRef = useRef<BlasterSnap | null>(null);
	const localKeys = useRef<Keys>({ l: false, r: false, u: false, d: false, f: false });
	const remoteKeys = useRef<Keys>({ l: false, r: false, u: false, d: false, f: false });
	const finalScoresRef = useRef<[number, number] | null>(null);
	finalScoresRef.current = finalScores;

	const isHost = room?.youSeat === 0;

	const send = useCallback((msg: BlasterClientMsg) => {
		const ws = wsRef.current;
		if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
	}, []);

	/* ---- connection ---- */
	useEffect(() => {
		if (!isValidRoomCode(code)) {
			setError("That room code isn't valid.");
			setStatus("closed");
			return;
		}
		closedByUs.current = false;
		const pid = persistentPid(code);

		const connect = () => {
			setStatus(attempts.current === 0 ? "connecting" : "reconnecting");
			const proto = window.location.protocol === "https:" ? "wss" : "ws";
			const name = encodeURIComponent(savedName() || "Player");
			const ws = new WebSocket(`${proto}://${window.location.host}/api/blaster/${code}/ws?pid=${pid}&name=${name}`);
			wsRef.current = ws;

			ws.onopen = () => {
				attempts.current = 0;
				setStatus("open");
			};
			ws.onmessage = (ev) => {
				let msg: BlasterServerMsg;
				try {
					msg = JSON.parse(ev.data as string) as BlasterServerMsg;
				} catch {
					return;
				}
				switch (msg.t) {
					case "room":
						setRoom(msg.state);
						if (msg.state.phase === "play" && !playingRef.current) {
							if (msg.state.youSeat === 0 && !simRef.current) simRef.current = newSim();
							setPlaying(true);
							setFinalScores(null);
						}
						if (msg.state.phase !== "play") setPlaying(false);
						return;
					case "begin":
						setPeerGone(false);
						setFinalScores(null);
						snapRef.current = null;
						if (roomRef.current?.youSeat === 0) simRef.current = newSim();
						setPlaying(true);
						return;
					case "input":
						remoteKeys.current = { l: msg.l, r: msg.r, u: msg.u, d: msg.d, f: msg.f };
						return;
					case "snap":
						snapRef.current = msg;
						return;
					case "ended":
						setFinalScores(msg.s);
						setPlaying(false);
						return;
					case "peerGone":
						setPeerGone(true);
						return;
					case "error":
						setError(msg.message);
						return;
				}
			};
			ws.onclose = () => {
				if (closedByUs.current) return;
				setStatus("reconnecting");
				attempts.current += 1;
				const delay = Math.min(8000, 500 * 2 ** Math.min(attempts.current, 4));
				retryTimer.current = window.setTimeout(connect, delay);
			};
		};
		connect();

		return () => {
			closedByUs.current = true;
			if (retryTimer.current) window.clearTimeout(retryTimer.current);
			wsRef.current?.close();
		};
	}, [code]);

	/* ---- keyboard ---- */
	useEffect(() => {
		function setKey(e: KeyboardEvent, down: boolean) {
			const k = localKeys.current;
			let used = true;
			switch (e.code) {
				case "ArrowLeft":
				case "KeyA":
					k.l = down;
					break;
				case "ArrowRight":
				case "KeyD":
					k.r = down;
					break;
				case "ArrowUp":
				case "KeyW":
					k.u = down;
					break;
				case "ArrowDown":
				case "KeyS":
					k.d = down;
					break;
				case "Space":
				case "Enter":
					k.f = down;
					break;
				default:
					used = false;
			}
			if (used) e.preventDefault();
		}
		const onDown = (e: KeyboardEvent) => setKey(e, true);
		const onUp = (e: KeyboardEvent) => setKey(e, false);
		window.addEventListener("keydown", onDown);
		window.addEventListener("keyup", onUp);
		return () => {
			window.removeEventListener("keydown", onDown);
			window.removeEventListener("keyup", onUp);
		};
	}, []);

	/* ---- guest input uplink ---- */
	useEffect(() => {
		const timer = window.setInterval(() => {
			if (!playingRef.current || roomRef.current?.youSeat !== 1) return;
			const k = localKeys.current;
			send({ t: "input", l: k.l, r: k.r, u: k.u, d: k.d, f: k.f });
		}, 100);
		return () => window.clearInterval(timer);
	}, [send]);

	/* ---- main loop ---- */
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const g = ctx;

		let raf = 0;
		function loop(now: number) {
			raf = requestAnimationFrame(loop);
			const r = roomRef.current;
			const names: [string, string] = [r?.seats[0]?.name ?? "P1", r?.seats[1]?.name ?? "P2"];

			if (!playingRef.current) {
				const overlay = finalScoresRef.current
					? `GAME OVER\n${names[0]}: ${finalScoresRef.current[0]}   ${names[1]}: ${finalScoresRef.current[1]}`
					: r?.phase === "lobby"
						? "Waiting in the lobby…"
						: null;
				drawWorld(g, null, names, overlay);
				return;
			}

			if (r?.youSeat === 0) {
				const sim = simRef.current;
				if (!sim) return;
				stepSim(sim, now, localKeys.current, remoteKeys.current);
				if (sim.frame % SNAP_EVERY_FRAMES === 0) send(buildSnap(sim, now));
				drawWorld(g, frameFromSim(sim, now), names, null);
				if (sim.over) {
					const s: [number, number] = [sim.players[0].score, sim.players[1].score];
					send({ t: "over", s });
					setFinalScores(s);
					setPlaying(false);
				}
			} else {
				const snap = snapRef.current;
				drawWorld(g, snap ? frameFromSnap(snap, now) : null, names, snap ? null : "Syncing with the host…");
			}
		}
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [send]);

	const seats = room?.seats ?? [];
	const bothSeated = seats.length === 2;
	const inLobby = room?.phase === "lobby" || (!playing && !finalScores);
	const showStart = isHost && !playing && bothSeated;

	function copyInvite() {
		try {
			void navigator.clipboard.writeText(window.location.href);
		} catch {
			/* clipboard blocked */
		}
	}

	return (
		<div style={{ fontFamily: "'Inter', sans-serif", background: COLORS.bg, color: COLORS.text, minHeight: "100vh" }}>
			<link
				rel="stylesheet"
				href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700&display=swap"
			/>
			<BattleHeader />

			<main style={{ maxWidth: 700, margin: "0 auto", padding: "28px 22px 70px", textAlign: "center" }}>
				<h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 26, margin: "0 0 4px" }}>
					Bug Blaster — room <span style={{ color: COLORS.accent }}>{code}</span>
				</h1>
				<p style={{ color: COLORS.textDim, fontSize: 13.5, margin: "0 0 18px" }}>
					{status === "open"
						? room
							? room.youSeat === 0
								? "You're hosting — Player 1 (yellow)."
								: room.youSeat === 1
									? "You're Player 2 (blue)."
									: "Finding you a seat…"
							: "Joining…"
						: status === "reconnecting"
							? "Connection lost — reconnecting…"
							: status === "connecting"
								? "Connecting…"
								: ""}
				</p>

				{error && (
					<p
						style={{
							color: COLORS.red,
							background: "rgba(248,113,113,0.08)",
							border: `1px solid ${COLORS.red}`,
							borderRadius: 8,
							padding: "10px 12px",
							fontSize: 14,
						}}
					>
						{error}
					</p>
				)}

				{peerGone && !error && (
					<p
						style={{
							color: COLORS.accent,
							background: "rgba(250,204,21,0.07)",
							border: `1px solid ${COLORS.accent}`,
							borderRadius: 8,
							padding: "10px 12px",
							fontSize: 13.5,
						}}
					>
						Your partner disconnected — their seat is saved if they come back.
					</p>
				)}

				{inLobby && !error && (
					<div
						style={{
							background: COLORS.bgPanel,
							border: `1px solid ${COLORS.border}`,
							borderRadius: 14,
							padding: 20,
							margin: "0 0 20px",
						}}
					>
						<div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 14 }}>
							{[0, 1].map((i) => {
								const seat = seats[i];
								return (
									<div key={i} style={{ minWidth: 180 }}>
										<div style={{ fontSize: 12, fontWeight: 700, color: P_COLORS[i], letterSpacing: "0.1em" }}>
											PLAYER {i + 1} {i === 0 ? "· HOST" : ""}
										</div>
										<div
											style={{
												fontSize: 15,
												fontWeight: 600,
												marginTop: 4,
												color: seat ? COLORS.text : COLORS.textDim,
											}}
										>
											{seat ? `${seat.name}${seat.connected ? "" : " (away)"}` : "Waiting for a player…"}
										</div>
									</div>
								);
							})}
						</div>

						{!bothSeated && (
							<p style={{ color: COLORS.textDim, fontSize: 13.5, margin: "0 0 12px" }}>
								Share this page's link (or the code <b style={{ color: COLORS.accent }}>{code}</b>) with your partner.
							</p>
						)}

						<div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
							<button onClick={copyInvite} style={buttonStyle(false)}>
								Copy invite link
							</button>
							{showStart && (
								<button onClick={() => send({ t: "start" })} style={buttonStyle(true)}>
									{finalScores ? "Play again" : "Start the game"}
								</button>
							)}
							{!isHost && bothSeated && (
								<span style={{ alignSelf: "center", color: COLORS.textDim, fontSize: 13.5 }}>
									Waiting for the host to start…
								</span>
							)}
						</div>
					</div>
				)}

				<canvas
					ref={canvasRef}
					width={W}
					height={H}
					style={{
						maxWidth: "100%",
						border: `2px solid ${COLORS.border}`,
						borderRadius: 12,
						background: "#000000",
						imageRendering: "pixelated",
					}}
				/>
				<p style={{ color: COLORS.textDim, fontSize: 12.5, marginTop: 10 }}>
					Move with the arrows or WASD · hold Space or Enter to shoot
				</p>
			</main>
		</div>
	);
}

function buttonStyle(primary: boolean): React.CSSProperties {
	return {
		padding: "11px 22px",
		borderRadius: 999,
		border: primary ? "1px solid transparent" : `1px solid ${COLORS.border}`,
		background: primary ? COLORS.accent : "transparent",
		color: primary ? "#0A0A0A" : COLORS.text,
		fontWeight: 700,
		fontSize: 14,
		cursor: "pointer",
		fontFamily: "'Inter', sans-serif",
	};
}
