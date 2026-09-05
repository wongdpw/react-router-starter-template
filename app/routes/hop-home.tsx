import type { Route } from "./+types/hop-home";
import { useEffect, useRef, useState } from "react";
import { BattleHeader } from "../components/BattleHeader";
import { HighScoreBoard, InitialsPrompt, useHighScores } from "../components/HighScores";
import { Sound } from "../lib/arcade-sound";

export function meta({}: Route.MetaArgs) {
	return [{ title: "Hop Home — Games — ArtDrop Spot" }];
}

const COLORS = {
	bg: "#0A0A0A",
	text: "#FFFFFF",
	textDim: "#9CA3AF",
	border: "#2E2E2E",
};

// ---------------------------------------------------------------
// Hop Home — an original road/river crossing arcade game in the
// spirit of the classic. Hop through traffic, then ride logs and
// turtles across the river, into one of five home slots before the
// clock runs out. All code and visuals are original.
// ---------------------------------------------------------------

const CELL = 32;
const COLS = 15;
const ROWS = 15;
const W = COLS * CELL; // 480
const H = ROWS * CELL; // 480

const ROUND_SECONDS = 30;
const HOME_SLOTS = [1, 4, 7, 10, 13]; // columns, mirrors classic 5-slot spacing

type LaneKind = "safe" | "road" | "river" | "home";

interface Lane {
	row: number;
	kind: LaneKind;
	dir: 1 | -1;
	speed: number; // cells/sec
	gap: number; // cells between obstacle starts
	width: number; // obstacle length in cells
	// river lanes only: some carry turtles that briefly submerge
	diving?: boolean;
}

interface Obstacle {
	x: number; // leading-edge position in cells, can be fractional
	sunk: boolean; // turtles only
	divePhase: number;
}

interface HomeSlot {
	col: number;
	filled: boolean;
}

type GameState = {
	lanes: Lane[];
	obstacles: Obstacle[][]; // parallel to lanes
	homes: HomeSlot[];
	frogCol: number;
	frogRow: number;
	frogX: number; // smoothed pixel position for hop animation
	frogY: number;
	ridingDx: number; // px/sec drift from riding a log/turtle this frame
	lives: number;
	score: number;
	round: number;
	timeLeft: number;
	over: boolean;
	won: boolean;
	started: boolean;
	lastTime: number;
	deathFlash: number;
	furthestRow: number; // for the row-progress score bonus
};

function homeRow(): number {
	return 0;
}
function startRow(): number {
	return ROWS - 1;
}

function buildLanes(round: number): Lane[] {
	const speedMul = 1 + (round - 1) * 0.16;
	const lanes: Lane[] = [];
	lanes.push({ row: homeRow(), kind: "home", dir: 1, speed: 0, gap: 0, width: 0 });

	// river band: rows 1-5
	const riverDirs: (1 | -1)[] = [1, -1, 1, -1, 1];
	for (let i = 0; i < 5; i++) {
		const row = 1 + i;
		const diving = i === 1 || i === 3;
		lanes.push({
			row,
			kind: "river",
			dir: riverDirs[i],
			speed: (1.1 + i * 0.18) * speedMul,
			gap: diving ? 4.5 : 5.5,
			width: diving ? 1 : 2 + (i % 2),
			diving,
		});
	}

	lanes.push({ row: 6, kind: "safe", dir: 1, speed: 0, gap: 0, width: 0 });

	// road band: rows 7-12
	const roadDirs: (1 | -1)[] = [-1, 1, -1, 1, -1, 1];
	for (let i = 0; i < 6; i++) {
		const row = 7 + i;
		lanes.push({
			row,
			kind: "road",
			dir: roadDirs[i],
			speed: (1.6 + i * 0.22) * speedMul,
			gap: 4 - (i % 2) * 0.5,
			width: 1,
		});
	}

	lanes.push({ row: 13, kind: "safe", dir: 1, speed: 0, gap: 0, width: 0 });
	lanes.push({ row: startRow(), kind: "safe", dir: 1, speed: 0, gap: 0, width: 0 });
	return lanes;
}

function seedObstacles(lanes: Lane[]): Obstacle[][] {
	return lanes.map((lane) => {
		if (lane.kind !== "road" && lane.kind !== "river") return [];
		const out: Obstacle[] = [];
		const span = COLS + lane.width + 4;
		for (let x = -2; x < span; x += lane.gap) {
			out.push({ x: lane.dir === 1 ? x - span / 2 : x, sunk: false, divePhase: Math.random() * Math.PI * 2 });
		}
		return out;
	});
}

function newRound(round: number, carry: { lives: number; score: number }): GameState {
	const lanes = buildLanes(round);
	return {
		lanes,
		obstacles: seedObstacles(lanes),
		homes: HOME_SLOTS.map((col) => ({ col, filled: false })),
		frogCol: Math.floor(COLS / 2),
		frogRow: startRow(),
		frogX: Math.floor(COLS / 2) * CELL,
		frogY: startRow() * CELL,
		ridingDx: 0,
		lives: carry.lives,
		score: carry.score,
		round,
		timeLeft: ROUND_SECONDS,
		over: false,
		won: false,
		started: true,
		lastTime: 0,
		deathFlash: 0,
		furthestRow: startRow(),
	};
}

function resetFrog(state: GameState) {
	state.frogCol = Math.floor(COLS / 2);
	state.frogRow = startRow();
	state.frogX = state.frogCol * CELL;
	state.frogY = state.frogRow * CELL;
	state.ridingDx = 0;
	state.furthestRow = startRow();
}

export default function HopHome({}: Route.ComponentProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const stateRef = useRef<GameState | null>(null);
	const [muted, setMuted] = useState(false);

	const { board, pendingScore, justRanked, finishRun, submit, dismiss } = useHighScores("hop-home");
	const finishRef = useRef(finishRun);
	finishRef.current = finishRun;
	const reportedRef = useRef(false);

	useEffect(() => {
		setMuted(Sound?.isMuted() ?? false);
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const g = ctx;

		let raf = 0;

		function report(state: GameState) {
			if (!reportedRef.current) {
				reportedRef.current = true;
				finishRef.current(state.score);
			}
		}

		function onKeyDown(e: KeyboardEvent) {
			if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) {
				e.preventDefault();
			}
			Sound?.init();
			Sound?.resume();

			const atMenu = !stateRef.current || stateRef.current.over || !stateRef.current.started;
			if ((e.key === " " || e.key === "Enter") && atMenu) {
				reportedRef.current = false;
				stateRef.current = newRound(1, { lives: 3, score: 0 });
				Sound?.start();
				return;
			}

			const state = stateRef.current;
			if (!state || state.over || !state.started) return;

			let dc = 0;
			let dr = 0;
			if (e.key === "ArrowLeft") dc = -1;
			else if (e.key === "ArrowRight") dc = 1;
			else if (e.key === "ArrowUp") dr = -1;
			else if (e.key === "ArrowDown") dr = 1;
			else return;

			const nextCol = state.frogCol + dc;
			const nextRow = state.frogRow + dr;
			if (nextCol < 0 || nextCol >= COLS || nextRow < 0 || nextRow > startRow()) return;

			state.frogCol = nextCol;
			state.frogRow = nextRow;
			state.frogX = nextCol * CELL;
			state.frogY = nextRow * CELL;
			state.ridingDx = 0;
			if (nextRow < state.furthestRow) {
				state.score += 10;
				state.furthestRow = nextRow;
			}
			Sound?.hitSmall();
		}
		window.addEventListener("keydown", onKeyDown);

		function laneAt(state: GameState, row: number): { lane: Lane; obs: Obstacle[] } | null {
			for (let i = 0; i < state.lanes.length; i++) {
				if (state.lanes[i].row === row) return { lane: state.lanes[i], obs: state.obstacles[i] };
			}
			return null;
		}

		function loseLife(state: GameState) {
			state.lives -= 1;
			Sound?.playerDie();
			state.deathFlash = 1;
			if (state.lives <= 0) {
				state.over = true;
				Sound?.gameOver();
				report(state);
			} else {
				resetFrog(state);
			}
		}

		function update(now: number, dt: number) {
			const state = stateRef.current;
			if (!state || state.over || !state.started) return;

			state.deathFlash = Math.max(0, state.deathFlash - dt * 2.4);

			// obstacles advance; wrap around
			state.lanes.forEach((lane, i) => {
				if (lane.kind !== "road" && lane.kind !== "river") return;
				const span = COLS + lane.width + 4;
				for (const o of state.obstacles[i]) {
					o.x += lane.dir * lane.speed * dt;
					if (lane.dir === 1 && o.x > COLS + 2) o.x -= span;
					if (lane.dir === -1 && o.x < -lane.width - 2) o.x += span;
					if (lane.diving) {
						o.divePhase += dt * 0.9;
						o.sunk = Math.sin(o.divePhase) < -0.55;
					}
				}
			});

			// countdown
			state.timeLeft -= dt;
			if (state.timeLeft <= 0) {
				loseLife(state);
				if (!state.over) state.timeLeft = ROUND_SECONDS;
				return;
			}

			// current lane rules
			const here = laneAt(state, state.frogRow);
			state.ridingDx = 0;

			if (here?.lane.kind === "road") {
				for (const o of here.obs) {
					if (state.frogCol >= o.x - 0.15 && state.frogCol <= o.x + here.lane.width - 0.85) {
						loseLife(state);
						return;
					}
				}
			} else if (here?.lane.kind === "river") {
				let onSomething = false;
				for (const o of here.obs) {
					if (o.sunk) continue;
					if (state.frogX / CELL >= o.x - 0.1 && state.frogX / CELL <= o.x + here.lane.width - 0.1) {
						onSomething = true;
						state.ridingDx = here.lane.dir * here.lane.speed * CELL;
						break;
					}
				}
				if (!onSomething) {
					loseLife(state);
					return;
				}
			}

			// drift with the current, keep the logical column loosely in sync
			if (state.ridingDx !== 0) {
				state.frogX += state.ridingDx * dt;
				state.frogCol = Math.round(state.frogX / CELL);
				if (state.frogX < -CELL * 0.4 || state.frogX > W - CELL * 0.6) {
					loseLife(state);
					return;
				}
			} else {
				state.frogX += (state.frogCol * CELL - state.frogX) * Math.min(1, dt * 14);
			}
			state.frogY += (state.frogRow * CELL - state.frogY) * Math.min(1, dt * 14);

			// reaching the home row: must land in an open, aligned slot
			if (state.frogRow === homeRow()) {
				const slot = state.homes.find((h) => Math.abs(h.col - state.frogCol) <= 0 && !h.filled);
				const nearSlot = state.homes.find((h) => Math.abs(h.col * CELL - state.frogX) < CELL * 0.55);
				if (nearSlot && !nearSlot.filled) {
					nearSlot.filled = true;
					state.score += 50 + Math.floor(state.timeLeft) * 2;
					Sound?.killBig();
					if (state.homes.every((h) => h.filled)) {
						state.won = true;
						Sound?.extraLife();
						const carried = { lives: state.lives, score: state.score };
						setTimeout(() => {
							if (stateRef.current === state) {
								stateRef.current = newRound(state.round + 1, carried);
								stateRef.current.lastTime = performance.now();
							}
						}, 700);
					} else {
						resetFrog(state);
						state.timeLeft = ROUND_SECONDS;
					}
				} else if (!slot) {
					loseLife(state);
				}
			}
		}

		function drawLaneBand(g: CanvasRenderingContext2D, row: number, color: string) {
			g.fillStyle = color;
			g.fillRect(0, row * CELL, W, CELL);
		}

		function drawRoadTexture(g: CanvasRenderingContext2D, row: number, dashPhase: number) {
			const y = row * CELL;
			g.fillStyle = "#1c1c1c";
			g.fillRect(0, y, W, CELL);
			// lane divider dashes, scrolling with traffic direction for readability
			g.fillStyle = "#FACC15";
			const dashLen = 14;
			const dashGap = 10;
			const period = dashLen + dashGap;
			const offset = ((dashPhase % period) + period) % period;
			for (let dx = -period; dx < W + period; dx += period) {
				g.fillRect(dx + offset, y + CELL / 2 - 1.5, dashLen, 3);
			}
		}

		function drawRiverTexture(g: CanvasRenderingContext2D, row: number, dir: 1 | -1, phase: number) {
			const y = row * CELL;
			g.fillStyle = "#0a1f33";
			g.fillRect(0, y, W, CELL);
			// current ripples, drifting the same direction as the lane — flat dashes, no gradients
			g.fillStyle = "#38BDF8";
			g.globalAlpha = 0.4;
			const waveLen = 30;
			const scroll = (phase * dir * 14) % waveLen;
			for (let wy = 8; wy < CELL; wy += 10) {
				for (let wx = -waveLen; wx < W + waveLen; wx += waveLen) {
					g.fillRect(wx + scroll, y + wy, 10, 2);
				}
			}
			g.globalAlpha = 1;
		}

		function drawCar(g: CanvasRenderingContext2D, x: number, y: number, w: number, dir: 1 | -1, hue: string) {
			const bodyH = CELL - 12;
			const top = y + 6;
			g.save();
			// body — flat silhouette, no gradient/shadow
			g.fillStyle = hue;
			g.beginPath();
			g.moveTo(x + 3, top + bodyH);
			g.lineTo(x + 3, top + 5);
			g.lineTo(x + 9, top);
			g.lineTo(x + w - 9, top);
			g.lineTo(x + w - 3, top + 5);
			g.lineTo(x + w - 3, top + bodyH);
			g.closePath();
			g.fill();
			// cabin block, solid black like the alien/ship silhouettes
			const cabinX = dir === 1 ? x + w * 0.42 : x + w * 0.18;
			const cabinW = w * 0.4;
			g.fillStyle = "#0A0A0A";
			g.fillRect(cabinX, top + 3, cabinW, bodyH - 6);
			// headlight, on the leading edge
			g.fillStyle = "#FACC15";
			const lightX = dir === 1 ? x + w - 6 : x + 2;
			g.fillRect(lightX, top + bodyH / 2 - 2, 4, 4);
			// wheels
			g.fillStyle = "#0A0A0A";
			g.beginPath();
			g.arc(x + 8, top + bodyH, 3.4, 0, Math.PI * 2);
			g.arc(x + w - 8, top + bodyH, 3.4, 0, Math.PI * 2);
			g.fill();
			g.restore();
		}

		function drawLog(g: CanvasRenderingContext2D, x: number, y: number, w: number) {
			const h = CELL - 12;
			const top = y + 6;
			g.save();
			// flat bark body, single fill — no gradient
			g.fillStyle = "#a9784a";
			g.beginPath();
			g.ellipse(x + 3, top + h / 2, 3, h / 2, 0, 0, Math.PI * 2);
			g.ellipse(x + w - 3, top + h / 2, 3, h / 2, 0, 0, Math.PI * 2);
			g.fill();
			g.fillRect(x + 3, top, w - 6, h);
			// end-grain ring on the leading edge, flat two-tone
			g.fillStyle = "#c99a63";
			g.beginPath();
			g.ellipse(x + w - 3, top + h / 2, 3, h / 2, 0, 0, Math.PI * 2);
			g.fill();
			g.fillStyle = "#6e4a29";
			g.beginPath();
			g.ellipse(x + w - 3, top + h / 2, 1.6, h / 3, 0, 0, Math.PI * 2);
			g.fill();
			g.restore();
		}

		function drawTurtle(g: CanvasRenderingContext2D, cx: number, cy: number, sinking: number) {
			// sinking: 0 = fully surfaced, 1 = fully under
			const r = CELL * 0.34;
			g.save();
			g.globalAlpha = 1 - sinking * 0.85;
			const bob = Math.sin(cy * 0.2 + performance.now() / 260) * 1.2;
			const y = cy + bob + sinking * 4;
			// ripple ring when mostly submerged
			if (sinking > 0.4) {
				g.strokeStyle = "#38BDF8";
				g.globalAlpha = 0.3 * (1 - sinking);
				g.lineWidth = 1.5;
				g.beginPath();
				g.ellipse(cx, y, r + 3, r * 0.6 + 2, 0, 0, Math.PI * 2);
				g.stroke();
				g.globalAlpha = 1 - sinking * 0.85;
			}
			// feet
			g.fillStyle = "#166534";
			for (const [dx, dy] of [[-r * 0.8, -r * 0.5], [r * 0.8, -r * 0.5], [-r * 0.8, r * 0.5], [r * 0.8, r * 0.5]]) {
				g.beginPath();
				g.ellipse(cx + dx, y + dy, 3.2, 2.2, 0, 0, Math.PI * 2);
				g.fill();
			}
			// shell — flat fill, no radial gradient
			g.fillStyle = "#4ADE80";
			g.beginPath();
			g.ellipse(cx, y, r, r * 0.78, 0, 0, Math.PI * 2);
			g.fill();
			g.strokeStyle = "#0A0A0A";
			g.lineWidth = 1;
			g.beginPath();
			g.moveTo(cx - r * 0.6, y - r * 0.35);
			g.lineTo(cx + r * 0.6, y - r * 0.35);
			g.moveTo(cx - r * 0.6, y + r * 0.35);
			g.lineTo(cx + r * 0.6, y + r * 0.35);
			g.moveTo(cx, y - r * 0.7);
			g.lineTo(cx, y + r * 0.7);
			g.stroke();
			g.restore();
		}

		function drawFrog(g: CanvasRenderingContext2D, fx: number, fy: number, facing: 1 | -1 | 0, jump: number) {
			// jump: 0..1, a quick squash/stretch pulse right after a hop
			const squash = 1 - jump * 0.22;
			const stretch = 1 + jump * 0.18;
			g.save();
			g.translate(fx, fy);
			g.scale(stretch, squash);

			// legs, splayed out and tucking in with the jump pulse — flat fill
			const legSpread = CELL * (0.4 + jump * 0.12);
			g.fillStyle = "#166534";
			for (const side of [-1, 1] as const) {
				g.beginPath();
				g.ellipse(side * legSpread * 0.55, CELL * 0.16, 6, 3.2, side * 0.5, 0, Math.PI * 2);
				g.fill();
				g.beginPath();
				g.ellipse(side * legSpread * 0.42, -CELL * 0.05, 5, 2.8, side * 0.35, 0, Math.PI * 2);
				g.fill();
			}

			// body — single flat fill, matches the alien/ship silhouette approach
			g.fillStyle = "#4ADE80";
			g.beginPath();
			g.ellipse(0, 0, CELL * 0.32, CELL * 0.27, 0, 0, Math.PI * 2);
			g.fill();

			// darker back marking, flat fill (no alpha gradient)
			g.fillStyle = "#22c55e";
			g.beginPath();
			g.ellipse(0, 2, CELL * 0.18, CELL * 0.14, 0, 0, Math.PI * 2);
			g.fill();

			// eyes, offset slightly toward the direction of travel — solid black dots like Galaxy Swarm
			const eyeDx = facing === 0 ? 0 : facing * 2;
			for (const side of [-1, 1] as const) {
				g.fillStyle = "#0A0A0A";
				g.beginPath();
				g.arc(side * CELL * 0.16 + eyeDx, -CELL * 0.2, 3, 0, Math.PI * 2);
				g.fill();
			}
			g.restore();
		}

		function draw(state: GameState | null, now: number) {
			g.fillStyle = "#000000";
			g.fillRect(0, 0, W, H);

			if (!state || !state.started) {
				g.fillStyle = "#4ADE80";
				g.font = "bold 30px 'Archivo Black', sans-serif";
				g.textAlign = "center";
				g.fillText("HOP HOME", W / 2, H / 2 - 40);
				g.fillStyle = "#FFFFFF";
				g.font = "14px Inter, sans-serif";
				g.fillText("Arrows to hop \u2014 cross the road, ride the river", W / 2, H / 2);
				g.fillText("Press Space or Enter to start", W / 2, H / 2 + 26);
				return;
			}

			const t = now / 1000;
			for (const lane of state.lanes) {
				if (lane.kind === "road") {
					drawRoadTexture(g, lane.row, t * lane.dir * lane.speed * 6 * CELL / 100);
				} else if (lane.kind === "river") {
					drawRiverTexture(g, lane.row, lane.dir, t);
				} else {
					const color = lane.kind === "home" ? "#0f2a17" : "#141414";
					drawLaneBand(g, lane.row, color);
				}
			}

			// home slots
			for (const home of state.homes) {
				const x = home.col * CELL;
				const y = homeRow() * CELL;
				g.fillStyle = home.filled ? "#123b1e" : "#0A0A0A";
				g.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
				g.strokeStyle = "#4ADE80";
				g.lineWidth = 1.5;
				g.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);
				if (home.filled) {
					drawFrog(g, x + CELL / 2, y + CELL / 2, 0, 0);
				}
			}

			// obstacles
			state.lanes.forEach((lane, i) => {
				if (lane.kind === "road") {
					const hues = ["#F87171", "#FB923C", "#F472B6", "#C084FC", "#60A5FA", "#FACC15"];
					const hue = hues[lane.row % hues.length];
					for (const o of state.obstacles[i]) {
						drawCar(g, o.x * CELL, lane.row * CELL, lane.width * CELL, lane.dir, hue);
					}
				} else if (lane.kind === "river") {
					for (const o of state.obstacles[i]) {
						if (lane.diving) {
							const sinking = o.sunk ? 1 : Math.max(0, Math.sin(o.divePhase) < -0.25 ? (Math.sin(o.divePhase) + 0.25) / -0.75 : 0);
							drawTurtle(g, (o.x + lane.width / 2) * CELL, lane.row * CELL + CELL / 2, Math.min(1, sinking));
						} else {
							drawLog(g, o.x * CELL, lane.row * CELL, lane.width * CELL);
						}
					}
				}
			});

			// frog
			g.save();
			if (state.deathFlash > 0 && Math.floor(performance.now() / 80) % 2 === 0) {
				g.globalAlpha = 0.3;
			}
			const fx = state.frogX + CELL / 2;
			const fy = state.frogY + CELL / 2;
			const facing: 1 | -1 | 0 = state.ridingDx > 0.5 ? 1 : state.ridingDx < -0.5 ? -1 : 0;
			const hopPulse = Math.max(0, 1 - Math.hypot(state.frogX - state.frogCol * CELL, state.frogY - state.frogRow * CELL) / (CELL * 0.6));
			drawFrog(g, fx, fy, facing, hopPulse);
			g.restore();

			// HUD
			g.font = "bold 15px Inter, sans-serif";
			g.fillStyle = "#FACC15";
			g.textAlign = "left";
			g.fillText(`SCORE ${state.score}`, 8, 18);
			g.textAlign = "center";
			g.fillStyle = "#FFFFFF";
			g.fillText(`ROUND ${state.round}`, W / 2, 18);
			g.textAlign = "right";
			g.fillStyle = state.timeLeft < 8 ? "#F87171" : "#FACC15";
			g.fillText(`TIME ${Math.ceil(Math.max(0, state.timeLeft))}`, W - 92, 18);
			g.fillStyle = "#F87171";
			g.fillText(`\u2665${Math.max(0, state.lives)}`, W - 8, 18);

			if (state.over) {
				g.fillStyle = "rgba(0,0,0,0.72)";
				g.fillRect(0, 0, W, H);
				g.fillStyle = "#F87171";
				g.font = "bold 30px 'Archivo Black', sans-serif";
				g.textAlign = "center";
				g.fillText("GAME OVER", W / 2, H / 2 - 20);
				g.fillStyle = "#FFFFFF";
				g.font = "16px Inter, sans-serif";
				g.fillText(`Final score: ${state.score}`, W / 2, H / 2 + 10);
				g.fillText("Press Space to play again", W / 2, H / 2 + 36);
			}
		}

		function frame(now: number) {
			const state = stateRef.current;
			const dt = state?.lastTime ? Math.min(0.05, (now - state.lastTime) / 1000) : 0;
			if (state) state.lastTime = now;
			update(now, dt);
			draw(stateRef.current, now);
			raf = requestAnimationFrame(frame);
		}
		raf = requestAnimationFrame(frame);

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("keydown", onKeyDown);
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
					Hop Home
				</h1>
				<p style={{ color: COLORS.textDim, fontSize: 15, marginBottom: 24 }}>
					Dodge the traffic, ride the river, fill all five homes before time runs out.
				</p>

				{pendingScore !== null && (
					<InitialsPrompt score={pendingScore} onSubmit={submit} onCancel={dismiss} />
				)}

				<div style={{ display: "flex", justifyContent: "center" }}>
					<canvas
						ref={canvasRef}
						width={W}
						height={H}
						style={{
							display: "block",
							margin: "0 auto",
							maxWidth: "100%",
							border: `2px solid ${COLORS.border}`,
							borderRadius: 12,
							background: "#000000",
							imageRendering: "pixelated",
						}}
					/>
				</div>

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
