import type { Route } from "./+types/galaxy-swarm";
import { BattleHeader } from "../components/BattleHeader";
import { useEffect, useRef } from "react";

export function meta({}: Route.MetaArgs) {
	return [{ title: "Galaxy Swarm — Games — ArtDrop Spot" }];
}

const COLORS = {
	bg: "#0A0A0A",
	text: "#FFFFFF",
	textDim: "#9CA3AF",
	border: "#2E2E2E",
	violet: "#FACC15",
};

// ---------------------------------------------------------------
// Galaxy Swarm — an original fixed-shooter in the spirit of the
// classic formation space games. A swarm sways in formation, peels
// off in diving attack runs, and you hold the line at the bottom.
// All code and visuals are original and procedurally drawn.
// ---------------------------------------------------------------

const W = 560;
const H = 640;

const ROWS = 5;
const ENEMY_COLS = 9;
const SLOT_W = 48;
const SLOT_H = 40;
const FORM_TOP = 70;

type EnemyState = "formation" | "diving";

type Enemy = {
	row: number;
	col: number;
	state: EnemyState;
	// live position (formation position is derived; diving uses these)
	x: number;
	y: number;
	t: number; // dive progress 0..1
	diveStartX: number;
	diveStartY: number;
	diveTargetX: number;
	wiggle: number; // radians offset for the dive curve
	alive: boolean;
};

type Bullet = { x: number; y: number };
type EnemyBullet = { x: number; y: number; vx: number; vy: number };
type Star = { x: number; y: number; r: number; v: number };

type GameState = {
	enemies: Enemy[];
	playerX: number;
	bullets: Bullet[];
	enemyBullets: EnemyBullet[];
	stars: Star[];
	score: number;
	lives: number;
	wave: number;
	swayT: number;
	diveTimer: number;
	diveEveryMs: number;
	invulnUntil: number;
	over: boolean;
	started: boolean;
	lastFrame: number;
};

function formationX(col: number, sway: number): number {
	const totalW = ENEMY_COLS * SLOT_W;
	return (W - totalW) / 2 + col * SLOT_W + SLOT_W / 2 + sway;
}
function formationY(row: number): number {
	return FORM_TOP + row * SLOT_H;
}

function spawnWave(state: GameState) {
	state.enemies = [];
	for (let row = 0; row < ROWS; row++) {
		for (let col = 0; col < ENEMY_COLS; col++) {
			state.enemies.push({
				row,
				col,
				state: "formation",
				x: 0,
				y: 0,
				t: 0,
				diveStartX: 0,
				diveStartY: 0,
				diveTargetX: 0,
				wiggle: 0,
				alive: true,
			});
		}
	}
}

function makeStars(): Star[] {
	const stars: Star[] = [];
	for (let i = 0; i < 70; i++) {
		stars.push({
			x: Math.random() * W,
			y: Math.random() * H,
			r: Math.random() * 1.4 + 0.4,
			v: Math.random() * 0.6 + 0.2,
		});
	}
	return stars;
}

function newGame(): GameState {
	const state: GameState = {
		enemies: [],
		playerX: W / 2,
		bullets: [],
		enemyBullets: [],
		stars: makeStars(),
		score: 0,
		lives: 3,
		wave: 1,
		swayT: 0,
		diveTimer: 0,
		diveEveryMs: 2200,
		invulnUntil: 0,
		over: false,
		started: true,
		lastFrame: 0,
	};
	spawnWave(state);
	return state;
}

// Row 0 is the flagship row (worth the most), rows below are grunts.
function rowScore(row: number): number {
	if (row === 0) return 80;
	if (row <= 2) return 50;
	return 30;
}

export default function GalaxySwarm({}: Route.ComponentProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const stateRef = useRef<GameState | null>(null);
	const keysRef = useRef<Record<string, boolean>>({});

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const g = ctx; // narrowed, non-null binding usable inside closures

		let raf = 0;

		function onKeyDown(e: KeyboardEvent) {
			if (["ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
			keysRef.current[e.key] = true;
			if (
				(e.key === " " || e.key === "Enter") &&
				(!stateRef.current || stateRef.current.over || !stateRef.current.started)
			) {
				stateRef.current = newGame();
			}
		}
		function onKeyUp(e: KeyboardEvent) {
			keysRef.current[e.key] = false;
		}
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);

		function startDive(state: GameState) {
			const candidates = state.enemies.filter((e) => e.alive && e.state === "formation");
			if (candidates.length === 0) return;
			const enemy = candidates[Math.floor(Math.random() * candidates.length)];
			enemy.state = "diving";
			enemy.t = 0;
			enemy.diveStartX = formationX(enemy.col, currentSway(state));
			enemy.diveStartY = formationY(enemy.row);
			enemy.diveTargetX = Math.max(30, Math.min(W - 30, state.playerX + (Math.random() * 160 - 80)));
			enemy.wiggle = Math.random() * Math.PI * 2;
		}

		function currentSway(state: GameState): number {
			return Math.sin(state.swayT) * 26;
		}

		function loseLife(state: GameState, now: number) {
			state.lives -= 1;
			if (state.lives <= 0) {
				state.over = true;
				return;
			}
			state.playerX = W / 2;
			state.enemyBullets = [];
			state.invulnUntil = now + 2000;
			// divers break off and return to formation
			for (const e of state.enemies) {
				if (e.state === "diving") {
					e.state = "formation";
					e.t = 0;
				}
			}
		}

		function update(now: number) {
			const state = stateRef.current;
			if (!state || state.over || !state.started) return;

			const dt = state.lastFrame ? Math.min(40, now - state.lastFrame) : 16;
			state.lastFrame = now;

			// starfield
			for (const s of state.stars) {
				s.y += s.v;
				if (s.y > H) {
					s.y = -2;
					s.x = Math.random() * W;
				}
			}

			// player
			const speed = 0.32 * dt;
			if (keysRef.current["ArrowLeft"]) state.playerX -= speed;
			if (keysRef.current["ArrowRight"]) state.playerX += speed;
			state.playerX = Math.max(24, Math.min(W - 24, state.playerX));

			// shooting: up to 2 bullets on screen
			if (keysRef.current[" "] && state.bullets.length < 2) {
				const last = state.bullets[state.bullets.length - 1];
				if (!last || last.y < H - 120) {
					state.bullets.push({ x: state.playerX, y: H - 66 });
				}
			}

			// player bullets
			for (const b of state.bullets) b.y -= 0.75 * dt;
			state.bullets = state.bullets.filter((b) => b.y > -12);

			// formation sway
			state.swayT += 0.0012 * dt;
			const sway = currentSway(state);

			// dive scheduling — more frequent as the wave thins and waves rise
			state.diveTimer += dt;
			const aliveCount = state.enemies.filter((e) => e.alive).length;
			const interval = Math.max(600, state.diveEveryMs - state.wave * 150 - (45 - aliveCount) * 20);
			if (state.diveTimer >= interval) {
				state.diveTimer = 0;
				startDive(state);
			}

			// enemies
			for (const e of state.enemies) {
				if (!e.alive) continue;
				if (e.state === "formation") {
					e.x = formationX(e.col, sway);
					e.y = formationY(e.row);
				} else {
					// diving: curved run toward (and past) the player
					e.t += 0.00035 * dt * (1 + state.wave * 0.08);
					const t = e.t;
					const straightX = e.diveStartX + (e.diveTargetX - e.diveStartX) * t;
					e.x = straightX + Math.sin(t * Math.PI * 3 + e.wiggle) * 46 * (1 - t * 0.4);
					e.y = e.diveStartY + (H + 50 - e.diveStartY) * t * t;

					// occasional aimed shot on the way down
					if (Math.random() < 0.0025 * dt && e.y < H - 160) {
						const dx = state.playerX - e.x;
						const dy = H - 60 - e.y;
						const len = Math.hypot(dx, dy) || 1;
						const v = 0.22;
						state.enemyBullets.push({ x: e.x, y: e.y, vx: (dx / len) * v, vy: (dy / len) * v });
					}

					// off the bottom: rejoin the formation from the top
					if (e.t >= 1) {
						e.state = "formation";
						e.t = 0;
					}
				}
			}

			// enemy bullets
			for (const b of state.enemyBullets) {
				b.x += b.vx * dt;
				b.y += b.vy * dt;
			}
			state.enemyBullets = state.enemyBullets.filter((b) => b.y < H + 12 && b.x > -12 && b.x < W + 12);

			// player bullets vs enemies
			for (const b of state.bullets) {
				for (const e of state.enemies) {
					if (!e.alive) continue;
					if (Math.abs(b.x - e.x) < 15 && Math.abs(b.y - e.y) < 13) {
						e.alive = false;
						b.y = -100; // consume the bullet
						const base = rowScore(e.row);
						state.score += e.state === "diving" ? base * 2 : base;
						break;
					}
				}
			}
			state.bullets = state.bullets.filter((b) => b.y > -50);

			// enemy contact / bullets vs player
			const px = state.playerX;
			const py = H - 52;
			if (now >= state.invulnUntil) {
				for (const b of state.enemyBullets) {
					if (Math.abs(b.x - px) < 16 && Math.abs(b.y - py) < 14) {
						loseLife(state, now);
						return;
					}
				}
				for (const e of state.enemies) {
					if (e.alive && e.state === "diving" && Math.abs(e.x - px) < 20 && Math.abs(e.y - py) < 16) {
						e.alive = false;
						loseLife(state, now);
						return;
					}
				}
			}

			// wave cleared
			if (state.enemies.every((e) => !e.alive)) {
				state.wave += 1;
				state.enemyBullets = [];
				state.bullets = [];
				spawnWave(state);
			}
		}

		function drawAlien(x: number, y: number, row: number, diving: boolean) {
			const body =
				row === 0 ? "#FACC15" : row <= 2 ? "#F472B6" : "#38BDF8";
			const wing =
				row === 0 ? "#F87171" : row <= 2 ? "#C084FC" : "#818CF8";
			// wings
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
			// body
			g.fillStyle = body;
			g.beginPath();
			g.ellipse(x, y, 6, 9, 0, 0, Math.PI * 2);
			g.fill();
			// eyes
			g.fillStyle = "#0A0A0A";
			g.beginPath();
			g.arc(x - 2.4, y - 2, 1.5, 0, Math.PI * 2);
			g.arc(x + 2.4, y - 2, 1.5, 0, Math.PI * 2);
			g.fill();
		}

		function drawPlayer(x: number, y: number, flicker: boolean) {
			if (flicker && Math.floor(performance.now() / 120) % 2 === 0) return;
			g.fillStyle = "#FACC15";
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

		function draw(now: number) {
			const state = stateRef.current;
			g.fillStyle = "#000000";
			g.fillRect(0, 0, W, H);

			// starfield behind everything (even on menus)
			const stars = state?.stars ?? [];
			g.fillStyle = "#FFFFFF";
			for (const s of stars) {
				g.globalAlpha = 0.35 + s.v;
				g.fillRect(s.x, s.y, s.r, s.r);
			}
			g.globalAlpha = 1;

			if (!state || !state.started) {
				g.fillStyle = "#FACC15";
				g.font = "bold 30px 'Archivo Black', sans-serif";
				g.textAlign = "center";
				g.fillText("GALAXY SWARM", W / 2, H / 2 - 44);
				g.fillStyle = "#FFFFFF";
				g.font = "14px Inter, sans-serif";
				g.fillText("← → to move • Space to shoot", W / 2, H / 2);
				g.fillText("Diving raiders are worth double", W / 2, H / 2 + 24);
				g.fillText("Press Space or Enter to start", W / 2, H / 2 + 52);
				return;
			}

			for (const e of state.enemies) {
				if (e.alive) drawAlien(e.x, e.y, e.row, e.state === "diving");
			}

			drawPlayer(state.playerX, H - 52, now < state.invulnUntil);

			g.fillStyle = "#FFFFFF";
			for (const b of state.bullets) g.fillRect(b.x - 1.5, b.y - 8, 3, 10);
			g.fillStyle = "#F87171";
			for (const b of state.enemyBullets) g.fillRect(b.x - 2, b.y - 4, 4, 8);

			// HUD
			g.fillStyle = "#FACC15";
			g.font = "bold 16px Inter, sans-serif";
			g.textAlign = "left";
			g.fillText(`SCORE ${state.score}`, 10, 22);
			g.textAlign = "right";
			g.fillText(`WAVE ${state.wave}`, W - 10, 22);
			// lives as small ships
			for (let i = 0; i < state.lives; i++) {
				const lx = 20 + i * 26;
				g.fillStyle = "#FACC15";
				g.beginPath();
				g.moveTo(lx, H - 18);
				g.lineTo(lx - 8, H - 6);
				g.lineTo(lx + 8, H - 6);
				g.closePath();
				g.fill();
			}

			if (state.over) {
				g.fillStyle = "rgba(0,0,0,0.72)";
				g.fillRect(0, 0, W, H);
				g.fillStyle = "#F87171";
				g.font = "bold 32px 'Archivo Black', sans-serif";
				g.textAlign = "center";
				g.fillText("GAME OVER", W / 2, H / 2 - 20);
				g.fillStyle = "#FFFFFF";
				g.font = "16px Inter, sans-serif";
				g.fillText(`Final score: ${state.score}`, W / 2, H / 2 + 14);
				g.fillText("Press Space to play again", W / 2, H / 2 + 42);
			}
		}

		function frame(now: number) {
			update(now);
			draw(now);
			raf = requestAnimationFrame(frame);
		}
		raf = requestAnimationFrame(frame);

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
		};
	}, []);

	return (
		<div
			style={{
				fontFamily: "'Inter', sans-serif",
				background: COLORS.bg,
				color: COLORS.text,
				minHeight: "100vh",
			}}
		>
			<link
				rel="stylesheet"
				href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700&display=swap"
			/>

			<BattleHeader />

			<div style={{ maxWidth: 700, margin: "0 auto", padding: "40px 24px", textAlign: "center" }}>
				<h1
					style={{
						fontFamily: "'Archivo Black', sans-serif",
						fontSize: 32,
						margin: "0 0 8px",
					}}
				>
					Galaxy Swarm
				</h1>
				<p style={{ color: COLORS.textDim, fontSize: 15, marginBottom: 24 }}>
					Hold the line against the swarm. ← → to move, Space to shoot.
				</p>

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
			</div>
		</div>
	);
}
