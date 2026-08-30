import type { Route } from "./+types/galaxy-swarm.room.$code";
import { useEffect, useRef, useState } from "react";
import { BattleHeader } from "../components/BattleHeader";
import {
	SNAP_EVERY_FRAMES,
	isValidRoomCode,
	type GalaxyClientMsg,
	type GalaxyRoomState,
	type GalaxyServerMsg,
	type GalaxySnap,
} from "../lib/galaxy-protocol";

export function meta({ params }: Route.MetaArgs) {
	return [{ title: `Galaxy Swarm room ${params.code ?? ""} — ArtDrop Spot` }];
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

const NAME_KEY = "galaxySwarmName";

/* Per-tab identity: a refresh reclaims your seat, a second tab is a second player. */
function persistentPid(code: string): string {
	const key = `galaxy-pid:${code}`;
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
   GAME SIMULATION — runs only in the host's browser (seat 0). The guest
   never simulates; it renders the host's snapshots. All code and visuals
   are original.
   ========================================================================= */

const W = 560;
const H = 640;
const ROWS = 5;
const ENEMY_COLS = 9;
const SLOT_W = 48;
const SLOT_H = 40;
const FORM_TOP = 70;
const P_COLORS = ["#FACC15", "#38BDF8"];

type Enemy = {
	row: number;
	col: number;
	diving: boolean;
	x: number;
	y: number;
	t: number;
	diveStartX: number;
	diveStartY: number;
	diveTargetX: number;
	wiggle: number;
	alive: boolean;
};
type Bullet = { x: number; y: number };
type EnemyBullet = { x: number; y: number; vx: number; vy: number };
type Star = { x: number; y: number; r: number; v: number };
type Pilot = {
	x: number;
	startX: number;
	bullets: Bullet[];
	lives: number;
	score: number;
	invulnUntil: number;
};
type Sim = {
	enemies: Enemy[];
	pilots: [Pilot, Pilot];
	enemyBullets: EnemyBullet[];
	wave: number;
	swayT: number;
	diveTimer: number;
	over: boolean;
	lastFrame: number;
	frame: number;
	snapSeq: number;
};

function formationX(col: number, sway: number): number {
	return (W - ENEMY_COLS * SLOT_W) / 2 + col * SLOT_W + SLOT_W / 2 + sway;
}
function formationY(row: number): number {
	return FORM_TOP + row * SLOT_H;
}
function rowScore(row: number): number {
	if (row === 0) return 80;
	if (row <= 2) return 50;
	return 30;
}
function makePilot(startX: number): Pilot {
	return { x: startX, startX, bullets: [], lives: 3, score: 0, invulnUntil: 0 };
}
function spawnEnemies(): Enemy[] {
	const out: Enemy[] = [];
	for (let row = 0; row < ROWS; row++)
		for (let col = 0; col < ENEMY_COLS; col++)
			out.push({
				row, col, diving: false, x: 0, y: 0, t: 0,
				diveStartX: 0, diveStartY: 0, diveTargetX: 0, wiggle: 0, alive: true,
			});
	return out;
}
function newSim(): Sim {
	return {
		enemies: spawnEnemies(),
		pilots: [makePilot(W / 3), makePilot((W / 3) * 2)],
		enemyBullets: [],
		wave: 1,
		swayT: 0,
		diveTimer: 0,
		over: false,
		lastFrame: 0,
		frame: 0,
		snapSeq: 0,
	};
}

type Keys = { l: boolean; r: boolean; f: boolean };

function stepSim(sim: Sim, now: number, in1: Keys, in2: Keys): void {
	const dt = sim.lastFrame ? Math.min(40, now - sim.lastFrame) : 16;
	sim.lastFrame = now;
	sim.frame++;

	const speed = 0.32 * dt;
	const inputs: [Keys, Keys] = [in1, in2];
	sim.pilots.forEach((p, i) => {
		if (p.lives <= 0) return;
		const k = inputs[i];
		if (k.l) p.x -= speed;
		if (k.r) p.x += speed;
		p.x = Math.max(24, Math.min(W - 24, p.x));
		if (k.f && p.bullets.length < 2) {
			const last = p.bullets[p.bullets.length - 1];
			if (!last || last.y < H - 120) p.bullets.push({ x: p.x, y: H - 66 });
		}
		for (const b of p.bullets) b.y -= 0.75 * dt;
		p.bullets = p.bullets.filter((b) => b.y > -12);
	});

	sim.swayT += 0.0012 * dt;
	const sway = Math.sin(sim.swayT) * 26;

	const alive = sim.pilots.filter((p) => p.lives > 0);
	sim.diveTimer += dt;
	const aliveEnemies = sim.enemies.filter((e) => e.alive).length;
	const interval = Math.max(600, 2200 - sim.wave * 150 - (45 - aliveEnemies) * 20);
	if (sim.diveTimer >= interval && alive.length > 0) {
		sim.diveTimer = 0;
		const candidates = sim.enemies.filter((e) => e.alive && !e.diving);
		if (candidates.length) {
			const e = candidates[Math.floor(Math.random() * candidates.length)];
			const target = alive[Math.floor(Math.random() * alive.length)];
			e.diving = true;
			e.t = 0;
			e.diveStartX = formationX(e.col, sway);
			e.diveStartY = formationY(e.row);
			e.diveTargetX = Math.max(30, Math.min(W - 30, target.x + (Math.random() * 160 - 80)));
			e.wiggle = Math.random() * Math.PI * 2;
		}
	}

	for (const e of sim.enemies) {
		if (!e.alive) continue;
		if (!e.diving) {
			e.x = formationX(e.col, sway);
			e.y = formationY(e.row);
		} else {
			e.t += 0.00035 * dt * (1 + sim.wave * 0.08);
			const t = e.t;
			const straightX = e.diveStartX + (e.diveTargetX - e.diveStartX) * t;
			e.x = straightX + Math.sin(t * Math.PI * 3 + e.wiggle) * 46 * (1 - t * 0.4);
			e.y = e.diveStartY + (H + 50 - e.diveStartY) * t * t;
			if (Math.random() < 0.0025 * dt && e.y < H - 160 && alive.length > 0) {
				let target = alive[0];
				for (const p of alive) if (Math.abs(p.x - e.x) < Math.abs(target.x - e.x)) target = p;
				const dx = target.x - e.x;
				const dy = H - 60 - e.y;
				const len = Math.hypot(dx, dy) || 1;
				sim.enemyBullets.push({ x: e.x, y: e.y, vx: (dx / len) * 0.22, vy: (dy / len) * 0.22 });
			}
			if (e.t >= 1) {
				e.diving = false;
				e.t = 0;
			}
		}
	}

	for (const b of sim.enemyBullets) {
		b.x += b.vx * dt;
		b.y += b.vy * dt;
	}
	sim.enemyBullets = sim.enemyBullets.filter((b) => b.y < H + 12 && b.x > -12 && b.x < W + 12);

	for (const p of sim.pilots) {
		for (const b of p.bullets) {
			for (const e of sim.enemies) {
				if (!e.alive) continue;
				if (Math.abs(b.x - e.x) < 15 && Math.abs(b.y - e.y) < 13) {
					e.alive = false;
					b.y = -100;
					const base = rowScore(e.row);
					p.score += e.diving ? base * 2 : base;
					break;
				}
			}
		}
		p.bullets = p.bullets.filter((b) => b.y > -50);
	}

	const py = H - 52;
	for (const p of sim.pilots) {
		if (p.lives <= 0 || now < p.invulnUntil) continue;
		let hit = false;
		for (const b of sim.enemyBullets) {
			if (Math.abs(b.x - p.x) < 16 && Math.abs(b.y - py) < 14) {
				b.y = H + 100;
				hit = true;
				break;
			}
		}
		if (!hit) {
			for (const e of sim.enemies) {
				if (e.alive && e.diving && Math.abs(e.x - p.x) < 20 && Math.abs(e.y - py) < 16) {
					e.alive = false;
					hit = true;
					break;
				}
			}
		}
		if (hit) {
			p.lives -= 1;
			if (p.lives > 0) {
				p.x = p.startX;
				p.bullets = [];
				p.invulnUntil = now + 2000;
			}
		}
	}
	if (sim.pilots.every((p) => p.lives <= 0)) {
		sim.over = true;
		return;
	}

	if (sim.enemies.every((e) => !e.alive)) {
		sim.wave += 1;
		sim.enemyBullets = [];
		for (const p of sim.pilots) p.bullets = [];
		sim.enemies = spawnEnemies();
	}
}

function buildSnap(sim: Sim, now: number): GalaxySnap {
	const r = Math.round;
	return {
		t: "snap",
		n: ++sim.snapSeq,
		w: sim.wave,
		s: [sim.pilots[0].score, sim.pilots[1].score],
		v: [sim.pilots[0].lives, sim.pilots[1].lives],
		p: [r(sim.pilots[0].x), r(sim.pilots[1].x)],
		i: [now < sim.pilots[0].invulnUntil, now < sim.pilots[1].invulnUntil],
		e: sim.enemies.filter((e) => e.alive).map((e) => [r(e.x), r(e.y), e.row, e.diving ? 1 : 0]),
		b: [
			sim.pilots[0].bullets.map((b) => [r(b.x), r(b.y)] as [number, number]),
			sim.pilots[1].bullets.map((b) => [r(b.x), r(b.y)] as [number, number]),
		],
		eb: sim.enemyBullets.map((b) => [r(b.x), r(b.y)] as [number, number]),
	};
}

/* =========================================================================
   SHARED RENDERER — the host draws its live sim, the guest draws the
   latest snapshot; both go through this same drawing code.
   ========================================================================= */

type DrawFrame = {
	wave: number;
	scores: [number, number];
	lives: [number, number];
	px: [number, number];
	flicker: [boolean, boolean];
	enemies: [number, number, number, number][];
	bullets: [[number, number][], [number, number][]];
	enemyBullets: [number, number][];
	over: boolean;
};

function frameFromSim(sim: Sim, now: number): DrawFrame {
	return {
		wave: sim.wave,
		scores: [sim.pilots[0].score, sim.pilots[1].score],
		lives: [sim.pilots[0].lives, sim.pilots[1].lives],
		px: [sim.pilots[0].x, sim.pilots[1].x],
		flicker: [
			now < sim.pilots[0].invulnUntil && Math.floor(now / 120) % 2 === 0,
			now < sim.pilots[1].invulnUntil && Math.floor(now / 120) % 2 === 0,
		],
		enemies: sim.enemies.filter((e) => e.alive).map((e) => [e.x, e.y, e.row, e.diving ? 1 : 0]),
		bullets: [
			sim.pilots[0].bullets.map((b) => [b.x, b.y] as [number, number]),
			sim.pilots[1].bullets.map((b) => [b.x, b.y] as [number, number]),
		],
		enemyBullets: sim.enemyBullets.map((b) => [b.x, b.y] as [number, number]),
		over: sim.over,
	};
}

function frameFromSnap(snap: GalaxySnap, now: number): DrawFrame {
	return {
		wave: snap.w,
		scores: snap.s,
		lives: snap.v,
		px: snap.p,
		flicker: [snap.i[0] && Math.floor(now / 120) % 2 === 0, snap.i[1] && Math.floor(now / 120) % 2 === 0],
		enemies: snap.e,
		bullets: snap.b,
		enemyBullets: snap.eb,
		over: false,
	};
}

function makeStars(): Star[] {
	const stars: Star[] = [];
	for (let i = 0; i < 70; i++)
		stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + 0.4, v: Math.random() * 0.6 + 0.2 });
	return stars;
}

function drawWorld(
	g: CanvasRenderingContext2D,
	frame: DrawFrame | null,
	stars: Star[],
	names: [string, string],
	overlay: string | null
) {
	g.fillStyle = "#000000";
	g.fillRect(0, 0, W, H);

	g.fillStyle = "#FFFFFF";
	for (const s of stars) {
		s.y += s.v;
		if (s.y > H) {
			s.y = -2;
			s.x = Math.random() * W;
		}
		g.globalAlpha = 0.35 + s.v;
		g.fillRect(s.x, s.y, s.r, s.r);
	}
	g.globalAlpha = 1;

	if (frame) {
		for (const [x, y, row, diving] of frame.enemies) drawAlien(g, x, y, row, diving === 1);

		const py = H - 52;
		for (let i = 0 as 0 | 1; i <= 1; i = (i + 1) as 0 | 1) {
			if (frame.lives[i] > 0 && !frame.flicker[i]) drawShip(g, frame.px[i], py, P_COLORS[i]);
			g.fillStyle = P_COLORS[i];
			for (const [x, y] of frame.bullets[i]) g.fillRect(x - 1.5, y - 8, 3, 10);
		}
		g.fillStyle = COLORS.red;
		for (const [x, y] of frame.enemyBullets) g.fillRect(x - 2, y - 4, 4, 8);

		g.font = "bold 15px Inter, sans-serif";
		g.fillStyle = P_COLORS[0];
		g.textAlign = "left";
		g.fillText(`${names[0] || "P1"} ${frame.scores[0]}  ♥${Math.max(0, frame.lives[0])}`, 10, 22);
		g.fillStyle = COLORS.accent;
		g.textAlign = "center";
		g.fillText(`WAVE ${frame.wave}`, W / 2, 22);
		g.fillStyle = P_COLORS[1];
		g.textAlign = "right";
		g.fillText(`${names[1] || "P2"} ${frame.scores[1]}  ♥${Math.max(0, frame.lives[1])}`, W - 10, 22);
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

function drawAlien(g: CanvasRenderingContext2D, x: number, y: number, row: number, diving: boolean) {
	const body = row === 0 ? "#FACC15" : row <= 2 ? "#F472B6" : "#38BDF8";
	const wing = row === 0 ? "#F87171" : row <= 2 ? "#C084FC" : "#818CF8";
	g.fillStyle = wing;
	g.beginPath();
	g.moveTo(x - 13, y + (diving ? 6 : 4));
	g.lineTo(x - 4, y - 6);
	g.lineTo(x - 4, y + 8);
	g.closePath();
	g.fill();
	g.beginPath();
	g.moveTo(x + 13, y + (diving ? 6 : 4));
	g.lineTo(x + 4, y - 6);
	g.lineTo(x + 4, y + 8);
	g.closePath();
	g.fill();
	g.fillStyle = body;
	g.beginPath();
	g.ellipse(x, y, 6, 9, 0, 0, Math.PI * 2);
	g.fill();
	g.fillStyle = "#0A0A0A";
	g.beginPath();
	g.arc(x - 2.4, y - 2, 1.5, 0, Math.PI * 2);
	g.arc(x + 2.4, y - 2, 1.5, 0, Math.PI * 2);
	g.fill();
}

function drawShip(g: CanvasRenderingContext2D, x: number, y: number, color: string) {
	g.fillStyle = color;
	g.beginPath();
	g.moveTo(x, y - 16);
	g.lineTo(x - 6, y - 2);
	g.lineTo(x - 16, y + 12);
	g.lineTo(x - 5, y + 8);
	g.lineTo(x, y + 12);
	g.lineTo(x + 5, y + 8);
	g.lineTo(x + 16, y + 12);
	g.lineTo(x + 6, y - 2);
	g.closePath();
	g.fill();
	g.fillStyle = "#F87171";
	g.fillRect(x - 1.5, y - 14, 3, 7);
}

/* =========================================================================
   ROOM PAGE
   ========================================================================= */

type ConnStatus = "connecting" | "open" | "reconnecting" | "closed";

export default function GalaxySwarmRoomPage({ params }: Route.ComponentProps) {
	const code = (params.code ?? "").toUpperCase();

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const closedByUs = useRef(false);
	const attempts = useRef(0);
	const retryTimer = useRef<number | null>(null);

	const [room, setRoom] = useState<GalaxyRoomState | null>(null);
	const [status, setStatus] = useState<ConnStatus>("connecting");
	const [error, setError] = useState<string | null>(null);
	const [peerGone, setPeerGone] = useState(false);
	const [playing, setPlaying] = useState(false);
	const [finalScores, setFinalScores] = useState<[number, number] | null>(null);

	// refs the game loop reads without re-rendering
	const roomRef = useRef<GalaxyRoomState | null>(null);
	roomRef.current = room;
	const playingRef = useRef(false);
	playingRef.current = playing;
	const simRef = useRef<Sim | null>(null);
	const snapRef = useRef<GalaxySnap | null>(null);
	const localKeys = useRef<Keys>({ l: false, r: false, f: false });
	const remoteKeys = useRef<Keys>({ l: false, r: false, f: false });
	const starsRef = useRef<Star[]>([]);
	// the render loop reads final scores through a ref so it needn't re-subscribe
	const finalScoresRef = useRef<[number, number] | null>(null);
	finalScoresRef.current = finalScores;

	const isHost = room?.youSeat === 0;

	function send(msg: GalaxyClientMsg) {
		const ws = wsRef.current;
		if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
	}

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
			const name = encodeURIComponent(savedName() || "Pilot");
			const ws = new WebSocket(`${proto}://${window.location.host}/api/galaxy/${code}/ws?pid=${pid}&name=${name}`);
			wsRef.current = ws;

			ws.onopen = () => {
				attempts.current = 0;
				setStatus("open");
			};
			ws.onmessage = (ev) => {
				let msg: GalaxyServerMsg;
				try {
					msg = JSON.parse(ev.data as string) as GalaxyServerMsg;
				} catch {
					return;
				}
				switch (msg.t) {
					case "room":
						setRoom(msg.state);
						// rejoining an in-progress game: fall back into play view
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
						remoteKeys.current = { l: msg.l, r: msg.r, f: msg.f };
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

	/* ---- guest input uplink: on change + a low-rate heartbeat ---- */
	useEffect(() => {
		const timer = window.setInterval(() => {
			if (!playingRef.current || roomRef.current?.youSeat !== 1) return;
			const k = localKeys.current;
			send({ t: "input", l: k.l, r: k.r, f: k.f });
		}, 100);
		return () => window.clearInterval(timer);
	}, []);

	/* ---- main loop: host simulates + snapshots, guest renders snaps ---- */
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const g = ctx;
		if (starsRef.current.length === 0) starsRef.current = makeStars();

		let raf = 0;
		function loop(now: number) {
			raf = requestAnimationFrame(loop);
			const r = roomRef.current;
			const names: [string, string] = [r?.seats[0]?.name ?? "P1", r?.seats[1]?.name ?? "P2"];

			if (!playingRef.current) {
				const overlay =
					finalScoresRef.current
						? `GAME OVER\n${names[0]}: ${finalScoresRef.current[0]}   ${names[1]}: ${finalScoresRef.current[1]}`
						: r?.phase === "lobby"
							? "Waiting in the hangar…"
							: null;
				drawWorld(g, null, starsRef.current, names, overlay);
				return;
			}

			if (r?.youSeat === 0) {
				const sim = simRef.current;
				if (!sim) return;
				stepSim(sim, now, localKeys.current, remoteKeys.current);
				if (sim.frame % SNAP_EVERY_FRAMES === 0) send(buildSnap(sim, now));
				drawWorld(g, frameFromSim(sim, now), starsRef.current, names, null);
				if (sim.over) {
					const s: [number, number] = [sim.pilots[0].score, sim.pilots[1].score];
					send({ t: "over", s });
					setFinalScores(s);
					setPlaying(false);
				}
			} else {
				const snap = snapRef.current;
				drawWorld(g, snap ? frameFromSnap(snap, now) : null, starsRef.current, names, snap ? null : "Syncing with the host…");
			}
		}
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, []);

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
					Galaxy Swarm — room <span style={{ color: COLORS.accent }}>{code}</span>
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
						Your co-pilot disconnected — their seat is saved if they come back.
					</p>
				)}

				{/* Lobby panel */}
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
										<div style={{ fontSize: 15, fontWeight: 600, marginTop: 4, color: seat ? COLORS.text : COLORS.textDim }}>
											{seat ? `${seat.name}${seat.connected ? "" : " (away)"}` : "Waiting for a pilot…"}
										</div>
									</div>
								);
							})}
						</div>

						{!bothSeated && (
							<p style={{ color: COLORS.textDim, fontSize: 13.5, margin: "0 0 12px" }}>
								Share this page's link (or the code <b style={{ color: COLORS.accent }}>{code}</b>) with your co-pilot.
							</p>
						)}

						<div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
							<button onClick={copyInvite} style={buttonStyle(false)}>
								Copy invite link
							</button>
							{showStart && (
								<button onClick={() => send({ t: "start" })} style={buttonStyle(true)}>
									{finalScores ? "Play again" : "Start the battle"}
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
					}}
				/>
				<p style={{ color: COLORS.textDim, fontSize: 12.5, marginTop: 10 }}>
					Move with ← → or A/D · shoot with Space or Enter
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
