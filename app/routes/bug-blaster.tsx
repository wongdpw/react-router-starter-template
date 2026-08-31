import type { Route } from "./+types/bug-blaster";
import { BattleHeader } from "../components/BattleHeader";
import { useEffect, useRef, useState } from "react";
import { HighScoreBoard, InitialsPrompt, useHighScores } from "../components/HighScores";
import { Sound } from "../lib/arcade-sound";

export function meta({}: Route.MetaArgs) {
	return [{ title: "Bug Blaster — Games — ArtDrop Spot" }];
}

const COLORS = {
	bg: "#0A0A0A",
	bgPanel: "#1A1A1A",
	violet: "#FACC15",
	text: "#FFFFFF",
	textDim: "#9CA3AF",
	border: "#2E2E2E",
};

// ---------------------------------------------------------------
// Bug Blaster — an original arcade shooter in the spirit of the
// classic mushroom-field centipede games. All code and visuals
// are original; no third-party assets.
// ---------------------------------------------------------------

const CELL = 24;
const COLS = 24;
const ROWS = 26;
const W = COLS * CELL; // 576
const H = ROWS * CELL; // 624
const PLAYER_ZONE_ROWS = 6; // bottom rows the player can move within
const FIRE_EVERY_MS = 110;  // hold to shoot: one shot per this many ms
const MAX_BULLETS = 8;      // ceiling so a held key can't flood the field

type Mushroom = { col: number; row: number; hp: number };
type Segment = { col: number; row: number };
type Chain = {
	segments: Segment[]; // index 0 is the head
	dir: 1 | -1;
	// when a chain reaches the player zone it bounces within it
	vertical: 1 | -1;
};

type GameState = {
	mushrooms: Map<string, Mushroom>;
	chains: Chain[];
	playerX: number; // pixels, center
	playerY: number; // pixels, center
	bullets: { x: number; y: number }[];
	lastShot: number;
	score: number;
	lives: number;
	wave: number;
	tickMs: number;
	lastTick: number;
	over: boolean;
	started: boolean;
};

function mkey(col: number, row: number) {
	return `${col},${row}`;
}

function spawnMushrooms(state: GameState) {
	state.mushrooms.clear();
	const count = 30;
	let placed = 0;
	while (placed < count) {
		const col = Math.floor(Math.random() * COLS);
		const row = 1 + Math.floor(Math.random() * (ROWS - PLAYER_ZONE_ROWS - 2));
		const k = mkey(col, row);
		if (!state.mushrooms.has(k)) {
			state.mushrooms.set(k, { col, row, hp: 4 });
			placed++;
		}
	}
}

/** Chains grow with the wave, so later rounds are a bigger target to clear. */
function chainLengthFor(wave: number): number {
	return Math.min(20, 10 + Math.floor((wave - 1) * 1.5));
}

/** Crawl speed: still eases off, but far later than the old wave-8 ceiling. */
function tickMsFor(wave: number): number {
	return Math.max(35, 140 - (wave - 1) * 8);
}

function spawnChain(state: GameState) {
	const segs: Segment[] = [];
	const len = chainLengthFor(state.wave);
	for (let i = 0; i < len; i++) {
		segs.push({ col: Math.floor(COLS / 2) + i, row: 0 });
	}
	state.chains.push({ segments: segs, dir: -1, vertical: 1 });
}

/**
 * Extra mushrooms seeded each wave. More clutter means the chain drops
 * toward you sooner and your shots have more to chew through.
 */
function seedExtraMushrooms(state: GameState) {
	const extra = Math.min(24, (state.wave - 1) * 3);
	let placed = 0;
	let guard = 0;
	while (placed < extra && guard++ < 400) {
		const col = Math.floor(Math.random() * COLS);
		const row = 1 + Math.floor(Math.random() * (ROWS - PLAYER_ZONE_ROWS - 2));
		const k = mkey(col, row);
		if (!state.mushrooms.has(k)) {
			state.mushrooms.set(k, { col, row, hp: 4 });
			placed++;
		}
	}
}

function resetPlayer(state: GameState) {
	state.playerX = W / 2;
	state.playerY = H - CELL * 1.5;
	state.bullets = [];
}

function newGame(): GameState {
	const state: GameState = {
		mushrooms: new Map(),
		chains: [],
		playerX: W / 2,
		playerY: H - CELL * 1.5,
		bullets: [],
		lastShot: 0,
		score: 0,
		lives: 3,
		wave: 1,
		tickMs: tickMsFor(1),
		lastTick: 0,
		over: false,
		started: true,
	};
	spawnMushrooms(state);
	spawnChain(state);
	return state;
}

// Advance every chain by one grid step, with classic edge/mushroom
// drop-and-reverse behavior.
function stepChains(state: GameState) {
	for (const chain of state.chains) {
		const head = chain.segments[0];
		let nextCol = head.col + chain.dir;
		let nextRow = head.row;
		let reversed = false;

		const blocked =
			nextCol < 0 ||
			nextCol >= COLS ||
			state.mushrooms.has(mkey(nextCol, head.row));

		if (blocked) {
			reversed = true;
			nextCol = head.col;
			nextRow = head.row + chain.vertical;
			// bounce within the player zone at the bottom, or back down at top
			if (nextRow >= ROWS) {
				chain.vertical = -1;
				nextRow = ROWS - 2;
			} else if (nextRow < ROWS - PLAYER_ZONE_ROWS && chain.vertical === -1) {
				chain.vertical = 1;
				nextRow = ROWS - PLAYER_ZONE_ROWS;
			}
		}

		// shift body: each segment takes its predecessor's spot
		for (let i = chain.segments.length - 1; i > 0; i--) {
			chain.segments[i].col = chain.segments[i - 1].col;
			chain.segments[i].row = chain.segments[i - 1].row;
		}
		head.col = nextCol;
		head.row = nextRow;
		if (reversed) chain.dir = (chain.dir * -1) as 1 | -1;
	}
}

export default function BugBlaster({}: Route.ComponentProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const stateRef = useRef<GameState | null>(null);
	const keysRef = useRef<Record<string, boolean>>({});
	const [, setRenderTick] = useState(0);

	const { board, pendingScore, justRanked, finishRun, submit, dismiss } = useHighScores("bug-blaster");
	// The loop lives in a mount-once effect, so it reaches the reporter
	// through a ref rather than re-subscribing every render.
	const finishRef = useRef(finishRun);
	finishRef.current = finishRun;
	const reportedRef = useRef(false);
	const marchStep = useRef(0);
	const [muted, setMuted] = useState(false);

	// reflect the stored preference once we're on the client
	useEffect(() => {
		setMuted(Sound?.isMuted() ?? false);
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const g = ctx; // narrowed, non-null binding usable inside closures

		let raf = 0;

		function onKeyDown(e: KeyboardEvent) {
			if (
				["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)
			) {
				e.preventDefault();
			}
			keysRef.current[e.key] = true;

			// browsers only allow audio to begin from a user gesture
			Sound?.init();
			Sound?.resume();

			if ((e.key === " " || e.key === "Enter") && (!stateRef.current || stateRef.current.over || !stateRef.current.started)) {
				reportedRef.current = false;
				stateRef.current = newGame();
				Sound?.start();
			}
		}
		function onKeyUp(e: KeyboardEvent) {
			keysRef.current[e.key] = false;
		}
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);

		function loseLife(state: GameState) {
			state.lives -= 1;
			if (state.lives <= 0) {
				state.over = true;
				Sound?.gameOver();
				if (!reportedRef.current) {
					reportedRef.current = true;
					finishRef.current(state.score);
				}
			} else {
				Sound?.playerDie();
				// classic behavior: field keeps its mushrooms, fresh chain
				state.chains = [];
				spawnChain(state);
				resetPlayer(state);
			}
		}

		function update(now: number) {
			const state = stateRef.current;
			if (!state || state.over || !state.started) return;

			// player movement (pixel-based, clamped to the player zone)
			const speed = 4;
			if (keysRef.current["ArrowLeft"]) state.playerX -= speed;
			if (keysRef.current["ArrowRight"]) state.playerX += speed;
			if (keysRef.current["ArrowUp"]) state.playerY -= speed;
			if (keysRef.current["ArrowDown"]) state.playerY += speed;
			state.playerX = Math.max(CELL / 2, Math.min(W - CELL / 2, state.playerX));
			state.playerY = Math.max(
				H - PLAYER_ZONE_ROWS * CELL + CELL / 2,
				Math.min(H - CELL / 2, state.playerY)
			);

			// shooting: hold Space for continuous rapid fire
			if (keysRef.current[" "] && state.bullets.length < MAX_BULLETS && now - state.lastShot >= FIRE_EVERY_MS) {
				state.lastShot = now;
				state.bullets.push({ x: state.playerX, y: state.playerY - CELL / 2 });
				Sound?.shoot();
			}

			// bullet travel + collisions (walk backwards so spent shots
			// can be spliced out while iterating)
			for (let bi = state.bullets.length - 1; bi >= 0; bi--) {
				const bullet = state.bullets[bi];
				bullet.y -= 14;
				if (bullet.y < 0) {
					state.bullets.splice(bi, 1);
					continue;
				}

				const bcol = Math.floor(bullet.x / CELL);
				const brow = Math.floor(bullet.y / CELL);

				// mushroom hit
				const mk = mkey(bcol, brow);
				const mush = state.mushrooms.get(mk);
				if (mush) {
					mush.hp -= 1;
					if (mush.hp <= 0) {
						state.mushrooms.delete(mk);
						state.score += 1;
						Sound?.hitSmall();
					}
					state.bullets.splice(bi, 1);
					continue;
				}

				// segment hit
				outer: for (let c = 0; c < state.chains.length; c++) {
					const chain = state.chains[c];
					for (let s = 0; s < chain.segments.length; s++) {
						const seg = chain.segments[s];
						if (seg.col === bcol && seg.row === brow) {
							// score: heads worth more
							state.score += s === 0 ? 100 : 10;
							if (s === 0) Sound?.killBig();
							else Sound?.hitEnemy();
							// segment becomes a mushroom
							state.mushrooms.set(mkey(seg.col, seg.row), {
								col: seg.col,
								row: seg.row,
								hp: 4,
							});
							// split the chain
							const before = chain.segments.slice(0, s);
							const after = chain.segments.slice(s + 1);
							const newChains: Chain[] = [];
							if (before.length > 0)
								newChains.push({ segments: before, dir: chain.dir, vertical: chain.vertical });
							if (after.length > 0)
								newChains.push({
									segments: after,
									dir: (chain.dir * -1) as 1 | -1,
									vertical: chain.vertical,
								});
							state.chains.splice(c, 1, ...newChains);
							state.bullets.splice(bi, 1);
							break outer;
						}
					}
				}
			}

			// chain stepping on a timer
			if (now - state.lastTick >= state.tickMs) {
				state.lastTick = now;
				stepChains(state);
				marchStep.current = (marchStep.current + 1) % 2;
				Sound?.march(marchStep.current);
			}

			// player collision with any segment
			const pcol = Math.floor(state.playerX / CELL);
			const prow = Math.floor(state.playerY / CELL);
			for (const chain of state.chains) {
				for (const seg of chain.segments) {
					if (seg.col === pcol && seg.row === prow) {
						loseLife(state);
						return;
					}
				}
			}

			// wave cleared
			if (state.chains.length === 0 || state.chains.every((c) => c.segments.length === 0)) {
				state.wave += 1;
				Sound?.waveUp();
				state.tickMs = tickMsFor(state.wave);
				state.chains = [];
				seedExtraMushrooms(state);
				spawnChain(state);
			}
		}

		function drawMushroom(m: Mushroom) {
			const x = m.col * CELL;
			const y = m.row * CELL;
			const shade = 0.4 + (m.hp / 4) * 0.6;
			// cap
			g.fillStyle = `rgba(74, 222, 128, ${shade})`;
			g.beginPath();
			g.arc(x + CELL / 2, y + CELL / 2, CELL * 0.38, Math.PI, 0);
			g.closePath();
			g.fill();
			// stem
			g.fillStyle = `rgba(220, 252, 231, ${shade * 0.9})`;
			g.fillRect(x + CELL * 0.35, y + CELL / 2, CELL * 0.3, CELL * 0.32);
		}

		function drawSegment(seg: Segment, isHead: boolean) {
			const cx = seg.col * CELL + CELL / 2;
			const cy = seg.row * CELL + CELL / 2;
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

		function drawPlayer(state: GameState) {
			const x = state.playerX;
			const y = state.playerY;
			g.fillStyle = "#FACC15";
			g.beginPath();
			g.moveTo(x, y - CELL * 0.45);
			g.lineTo(x - CELL * 0.38, y + CELL * 0.4);
			g.lineTo(x + CELL * 0.38, y + CELL * 0.4);
			g.closePath();
			g.fill();
			g.fillStyle = "#0A0A0A";
			g.fillRect(x - 3, y + CELL * 0.05, 6, CELL * 0.2);
		}

		function draw() {
			const state = stateRef.current;
			g.fillStyle = "#000000";
			g.fillRect(0, 0, W, H);

			if (!state || !state.started) {
				g.fillStyle = "#FACC15";
				g.font = "bold 28px 'Archivo Black', sans-serif";
				g.textAlign = "center";
				g.fillText("BUG BLASTER", W / 2, H / 2 - 40);
				g.fillStyle = "#FFFFFF";
				g.font = "14px Inter, sans-serif";
				g.fillText("Arrows to move • Space to shoot", W / 2, H / 2);
				g.fillText("Press Space or Enter to start", W / 2, H / 2 + 26);
				return;
			}

			// subtle player-zone divider
			g.strokeStyle = "rgba(250, 204, 21, 0.15)";
			g.beginPath();
			g.moveTo(0, H - PLAYER_ZONE_ROWS * CELL);
			g.lineTo(W, H - PLAYER_ZONE_ROWS * CELL);
			g.stroke();

			for (const m of state.mushrooms.values()) drawMushroom(m);
			for (const chain of state.chains) {
				chain.segments.forEach((seg, i) => drawSegment(seg, i === 0));
			}
			drawPlayer(state);

			g.fillStyle = "#FFFFFF";
			for (const bullet of state.bullets) {
				g.fillRect(bullet.x - 1.5, bullet.y - 8, 3, 10);
			}

			// HUD
			g.fillStyle = "#FACC15";
			g.font = "bold 16px Inter, sans-serif";
			g.textAlign = "left";
			g.fillText(`SCORE ${state.score}`, 10, 20);
			g.textAlign = "right";
			g.fillText(`WAVE ${state.wave}   LIVES ${state.lives}`, W - 10, 20);

			if (state.over) {
				g.fillStyle = "rgba(0,0,0,0.7)";
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
			draw();
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
					Bug Blaster
				</h1>
				<p style={{ color: COLORS.textDim, fontSize: 15, marginBottom: 24 }}>
					A classic arcade bug shooter. Arrows to move, Space to shoot.
				</p>

				<p style={{ marginTop: -8, marginBottom: 24 }}>
					<a
						href="/bug-blaster/online"
						style={{ color: "#38BDF8", fontWeight: 700, fontSize: 14, textDecoration: "none" }}
					>
						Play online with a friend on another computer →
					</a>
				</p>

				{pendingScore !== null && (
					<InitialsPrompt score={pendingScore} onSubmit={submit} onCancel={dismiss} />
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

				<div style={{ marginTop: 12 }}>
					<button
						onClick={() => {
							Sound?.init();
							setMuted(Sound?.toggleMute() ?? false);
						}}
						style={{
							background: "transparent",
							border: `1px solid ${COLORS.border}`,
							color: COLORS.textDim,
							borderRadius: 999,
							padding: "7px 16px",
							fontSize: 12.5,
							fontWeight: 600,
							cursor: "pointer",
							fontFamily: "'Inter', sans-serif",
						}}
					>
						{muted ? "Sound: off" : "Sound: on"}
					</button>
				</div>

				<HighScoreBoard board={board} highlight={justRanked} />
			</div>
		</div>
	);
}

