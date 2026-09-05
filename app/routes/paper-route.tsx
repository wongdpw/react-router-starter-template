import type { Route } from "./+types/paper-route";
import { BattleHeader } from "../components/BattleHeader";
import { useEffect, useRef, useState } from "react";
import { HighScoreBoard, InitialsPrompt, useHighScores } from "../components/HighScores";
import { Sound } from "../lib/arcade-sound";

export function meta({}: Route.MetaArgs) {
	return [{ title: "Paper Route — Games — ArtDrop Spot" }];
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
// Paper Route — an original arcade delivery game in the spirit of
// the classic bike-and-newspaper arcade games. Rendered with a
// pseudo-isometric 3/4 view: the world scrolls toward the player
// while lawns, sidewalks and the road recede toward a vanishing
// point up-screen. All code and visuals are original.
// ---------------------------------------------------------------

const W = 576;
const H = 640;

// Lane layout across the 576px width, before perspective squeeze:
// [ lawn L ][ walk L ][ ===== ROAD ===== ][ walk R ][ lawn R ]
const LAWN_L = 150; // right edge of the left lawn
const WALK_L = 186; // left kerb of the road
const WALK_R = W - 186; // right kerb of the road
const LAWN_R = W - 150;
const ROAD_L = WALK_L;
const ROAD_R = WALK_R;

const BIKE_SCREEN_Y = H - 150; // the cyclist stays here on screen
const SCROLL_BASE = 2.5;
const THROW_SPEED = 12;
const PAPERS_START = 12; // papers you begin each life with
const PAPERS_MAX = 20; // satchel cap
const BUNDLE_REFILL = 6; // papers gained from a roadside bundle

type Side = "left" | "right";

type House = {
	wy: number;
	side: Side;
	subscriber: boolean;
	hit: boolean;
	missed: boolean;
	broken: boolean;
	hue: number;
	flash: number;
};

type Obstacle = {
	wy: number;
	x: number;
	kind: "pothole" | "car" | "dog" | "hydrant";
	dir: 1 | -1;
	phase: number;
	hit: boolean;
};

type Paper = { x: number; y: number; vx: number; vy: number; spin: number };
type Puff = { x: number; y: number; life: number; max: number; vx: number; vy: number };
type Bundle = { wy: number; x: number; taken: boolean; bob: number };

type GameState = {
	bikeX: number;
	lean: number;
	cam: number;
	speed: number;
	houses: House[];
	obstacles: Obstacle[];
	papers: Paper[];
	puffs: Puff[];
	bundles: Bundle[];
	papersLeft: number;
	score: number;
	lives: number;
	day: number;
	combo: number;
	delivered: number;
	targetDeliveries: number;
	nextHouseWy: number;
	nextObstacleWy: number;
	nextBundleWy: number;
	dayEndWy: number; // camera passes this world-Y to finish the block
	started: boolean;
	over: boolean;
	invuln: number;
	tyreT: number;
};

/* ---- tuning curves -------------------------------------------------- */

function scrollSpeedFor(day: number) {
	return SCROLL_BASE + Math.min(3.2, (day - 1) * 0.4);
}
function obstacleChanceFor(day: number) {
	return Math.min(0.6, 0.22 + (day - 1) * 0.05);
}
function subscriberChanceFor(day: number) {
	return Math.max(0.5, 0.82 - (day - 1) * 0.045);
}

/* ---- perspective helpers -------------------------------------------- */

function depthAt(screenY: number) {
	return 1 - screenY / H;
}
function persp(screenY: number) {
	// near the bottom scale ≈ 1, up top ≈ 0.62 — the 3/4 squeeze.
	return 1 - depthAt(screenY) * 0.38;
}
function px(x: number, screenY: number) {
	return W / 2 + (x - W / 2) * persp(screenY);
}

/* ---- spawning ------------------------------------------------------- */

function spawnHouseRow(state: GameState) {
	const wy = state.nextHouseWy;
	state.nextHouseWy += 150;
	const chance = subscriberChanceFor(state.day);
	(["left", "right"] as Side[]).forEach((side) => {
		const subscriber = Math.random() < chance;
		// only subscribers inside the current block count toward the
		// perfect-route bonus; ones spawned ahead belong to the next block.
		if (subscriber && wy < state.dayEndWy) state.targetDeliveries++;
		state.houses.push({
			wy,
			side,
			subscriber,
			hit: false,
			missed: false,
			broken: false,
			hue: Math.random(),
			flash: 0,
		});
	});
}

function spawnObstacle(state: GameState) {
	const wy = state.nextObstacleWy;
	state.nextObstacleWy += 120 + Math.random() * 130;
	if (Math.random() > obstacleChanceFor(state.day)) return;
	const roll = Math.random();
	const kind: Obstacle["kind"] =
		roll < 0.4 ? "pothole" : roll < 0.68 ? "car" : roll < 0.86 ? "dog" : "hydrant";
	const x =
		kind === "hydrant"
			? Math.random() < 0.5
				? ROAD_L + 14
				: ROAD_R - 14
			: ROAD_L + 24 + Math.random() * (ROAD_R - ROAD_L - 48);
	state.obstacles.push({ wy, x, kind, dir: Math.random() < 0.5 ? 1 : -1, phase: Math.random() * 6, hit: false });
}

/**
 * Roadside paper bundles. They sit in the middle of the road so grabbing
 * one is a small detour, and they're spaced so you're never starved: even
 * a wasteful player refills before the satchel empties.
 */
function spawnBundle(state: GameState) {
	const wy = state.nextBundleWy;
	state.nextBundleWy += 320 + Math.random() * 160;
	const x = ROAD_L + 40 + Math.random() * (ROAD_R - ROAD_L - 80);
	state.bundles.push({ wy, x, taken: false, bob: Math.random() * 6 });
}

function resetBike(state: GameState) {
	state.bikeX = (ROAD_L + ROAD_R) / 2;
	state.lean = 0;
	state.papers = [];
}

function newGame(): GameState {
	const state: GameState = {
		bikeX: (ROAD_L + ROAD_R) / 2,
		lean: 0,
		cam: 0,
		speed: scrollSpeedFor(1),
		houses: [],
		obstacles: [],
		papers: [],
		puffs: [],
		bundles: [],
		papersLeft: PAPERS_START,
		score: 0,
		lives: 3,
		day: 1,
		combo: 0,
		delivered: 0,
		targetDeliveries: 0,
		nextHouseWy: 260,
		nextObstacleWy: 420,
		nextBundleWy: 500,
		dayEndWy: 2200, // ~14 house-rows of road per block
		started: true,
		over: false,
		invuln: 0,
		tyreT: 0,
	};
	for (let i = 0; i < 9; i++) spawnHouseRow(state);
	for (let i = 0; i < 7; i++) spawnObstacle(state);
	for (let i = 0; i < 3; i++) spawnBundle(state);
	return state;
}

export default function PaperRoute({}: Route.ComponentProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const stateRef = useRef<GameState | null>(null);
	const keysRef = useRef<Record<string, boolean>>({});
	const [, setRenderTick] = useState(0);

	const { board, pendingScore, justRanked, finishRun, submit, dismiss } = useHighScores("paper-route");
	const finishRef = useRef(finishRun);
	finishRef.current = finishRun;
	const reportedRef = useRef(false);
	const spaceLatchedRef = useRef(false);
	const [muted, setMuted] = useState(false);

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

		function onKeyDown(e: KeyboardEvent) {
			if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
			keysRef.current[e.key] = true;
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

		function screenYOf(wy: number, cam: number) {
			return BIKE_SCREEN_Y - (wy - cam);
		}

		function throwPaper(state: GameState, dir: Side | "straight") {
			if (state.papersLeft <= 0) return;
			state.papersLeft -= 1;
			const lateral = dir === "left" ? -4.6 : dir === "right" ? 4.6 : 0;
			state.papers.push({ x: px(state.bikeX, BIKE_SCREEN_Y), y: BIKE_SCREEN_Y - 24, vx: lateral, vy: -THROW_SPEED, spin: 0 });
			Sound?.shoot();
		}

		function loseLife(state: GameState) {
			state.lives -= 1;
			state.invuln = 100;
			for (let i = 0; i < 10; i++)
				state.puffs.push({
					x: px(state.bikeX, BIKE_SCREEN_Y),
					y: BIKE_SCREEN_Y,
					life: 26,
					max: 26,
					vx: (Math.random() - 0.5) * 4,
					vy: (Math.random() - 0.5) * 4 - 1,
				});
			if (state.lives <= 0) {
				state.over = true;
				Sound?.gameOver();
				if (!reportedRef.current) {
					reportedRef.current = true;
					finishRef.current(state.score);
				}
			} else {
				Sound?.playerDie();
				resetBike(state);
			}
		}

		function update(now: number, dt: number) {
			const state = stateRef.current;
			if (!state || state.over || !state.started) return;

			const steer = 4.4;
			let steering = 0;
			if (keysRef.current["ArrowLeft"]) steering -= 1;
			if (keysRef.current["ArrowRight"]) steering += 1;
			state.bikeX += steering * steer;
			state.bikeX = Math.max(ROAD_L + 14, Math.min(ROAD_R - 14, state.bikeX));
			state.lean += (steering - state.lean) * 0.2;
			state.tyreT += dt;
			if (state.invuln > 0) state.invuln -= 1;

			if (keysRef.current[" "] && !spaceLatchedRef.current) {
				spaceLatchedRef.current = true;
				const dir: Side | "straight" = state.lean < -0.25 ? "left" : state.lean > 0.25 ? "right" : "straight";
				throwPaper(state, dir);
			}
			if (!keysRef.current[" "]) spaceLatchedRef.current = false;

			state.cam += state.speed;

			// tyre puffs
			if (state.tyreT % 0.06 < dt) {
				state.puffs.push({
					x: px(state.bikeX, BIKE_SCREEN_Y) + (Math.random() - 0.5) * 6,
					y: BIKE_SCREEN_Y + 10,
					life: 16,
					max: 16,
					vx: (Math.random() - 0.5) * 0.6,
					vy: 0.6 + Math.random() * 0.5,
				});
			}
			for (let i = state.puffs.length - 1; i >= 0; i--) {
				const p = state.puffs[i];
				p.x += p.vx;
				p.y += p.vy;
				p.life -= 1;
				if (p.life <= 0) state.puffs.splice(i, 1);
			}

			// papers arc under gravity
			for (let i = state.papers.length - 1; i >= 0; i--) {
				const p = state.papers[i];
				p.x += p.vx;
				p.y += p.vy;
				p.vy += 0.12;
				p.spin += 0.4;
				if (p.y > H + 20 || p.x < -20 || p.x > W + 20) state.papers.splice(i, 1);
			}

			// obstacle drift + animation
			for (const o of state.obstacles) {
				o.phase += dt * 4;
				if (o.kind === "car") o.x += o.dir * 0.7;
				if (o.kind === "dog") o.x += o.dir * 1.5;
				if ((o.kind === "car" || o.kind === "dog") && (o.x < ROAD_L + 16 || o.x > ROAD_R - 16))
					o.dir = (o.dir * -1) as 1 | -1;
			}
			for (const b of state.bundles) b.bob += dt * 4;

			// paper vs house (compare in screen space at the house's row)
			for (const p of [...state.papers]) {
				for (const h of state.houses) {
					if (h.hit || h.broken) continue;
					const hy = screenYOf(h.wy, state.cam);
					if (hy < -40 || hy > H + 40) continue;
					const mailboxX = px(h.side === "left" ? WALK_L - 8 : WALK_R + 8, hy);
					if (Math.abs(p.x - mailboxX) < 26 && Math.abs(p.y - hy) < 22) {
						state.papers = state.papers.filter((pp) => pp !== p);
						h.flash = 18;
						if (h.subscriber) {
							h.hit = true;
							state.delivered += 1;
							state.combo += 1;
							state.score += 25 + Math.min(50, state.combo * 5);
							Sound?.hitSmall();
							if (state.combo > 0 && state.combo % 5 === 0) Sound?.extraLife();
						} else {
							h.broken = true;
							state.combo = 0;
							state.score = Math.max(0, state.score - 20);
							Sound?.hitEnemy();
						}
						break;
					}
				}
			}

			// bike vs obstacle
			if (state.invuln === 0) {
				for (const o of state.obstacles) {
					if (o.hit) continue;
					const oy = screenYOf(o.wy, state.cam);
					if (Math.abs(oy - BIKE_SCREEN_Y) < 20) {
						const ox = px(o.x, oy);
						if (Math.abs(px(state.bikeX, BIKE_SCREEN_Y) - ox) < 24) {
							o.hit = true;
							Sound?.noise(0.18, 0.22, 1200, 200);
							loseLife(state);
							return;
						}
					}
				}
			}

			// bike vs paper bundle — ride over one to refill the satchel
			for (const b of state.bundles) {
				if (b.taken) continue;
				const by = screenYOf(b.wy, state.cam);
				if (Math.abs(by - BIKE_SCREEN_Y) < 22) {
					const bx = px(b.x, by);
					if (Math.abs(px(state.bikeX, BIKE_SCREEN_Y) - bx) < 26) {
						b.taken = true;
						state.papersLeft = Math.min(PAPERS_MAX, state.papersLeft + BUNDLE_REFILL);
						Sound?.extraLife();
					}
				}
			}

			// missed subscribers
			for (const h of state.houses) {
				if (!h.hit && !h.missed && h.subscriber) {
					if (screenYOf(h.wy, state.cam) > BIKE_SCREEN_Y + 40) {
						h.missed = true;
						state.combo = 0;
					}
				}
				if (h.flash > 0) h.flash -= 1;
			}

			// prune + top-up
			state.houses = state.houses.filter((h) => screenYOf(h.wy, state.cam) < H + 80);
			state.obstacles = state.obstacles.filter((o) => screenYOf(o.wy, state.cam) < H + 80 && !o.hit);
			state.bundles = state.bundles.filter((b) => screenYOf(b.wy, state.cam) < H + 80 && !b.taken);
			while (state.houses.filter((h) => h.side === "left").length < 9) spawnHouseRow(state);
			while (state.obstacles.length < 6) spawnObstacle(state);
			while (state.bundles.length < 3) spawnBundle(state);

			// end of day: you've ridden past the block marker, and no
			// subscriber house is still sitting between you and the top of
			// the screen waiting to be served. Distance-based, so the day
			// always ends whether or not you ran the satchel dry.
			if (state.cam >= state.dayEndWy) {
				const anyPending = state.houses.some(
					(h) =>
						h.subscriber &&
						!h.hit &&
						!h.missed &&
						h.wy < state.dayEndWy &&
						screenYOf(h.wy, state.cam) < BIKE_SCREEN_Y,
				);
				if (!anyPending) {
					if (state.delivered >= state.targetDeliveries && state.targetDeliveries > 0) {
						state.score += 250;
						Sound?.extraLife();
					}
					state.day += 1;
					state.speed = scrollSpeedFor(state.day);
					state.papersLeft = Math.min(PAPERS_MAX, state.papersLeft + PAPERS_START);
					state.delivered = 0;
					state.targetDeliveries = 0;
					state.dayEndWy = state.cam + 2200;
					Sound?.waveUp();
				}
			}
		}

		/* ---- drawing ---------------------------------------------------- */

		function drawGround(state: GameState) {
			const grad = g.createLinearGradient(0, 0, 0, H);
			grad.addColorStop(0, "#0d1b12");
			grad.addColorStop(1, "#0a0a0a");
			g.fillStyle = grad;
			g.fillRect(0, 0, W, H);

			const bandH = 8;
			for (let y = 0; y <= H; y += bandH) {
				const s = persp(y);
				const lawnL = px(0, y);
				const lawnLr = px(LAWN_L, y);
				const walkLr = px(WALK_L, y);
				const walkRl = px(WALK_R, y);
				const lawnRl = px(LAWN_R, y);
				const lawnR = px(W, y);
				g.fillStyle = "#12351f";
				g.fillRect(lawnL, y, lawnLr - lawnL, bandH + 1);
				g.fillRect(lawnRl, y, lawnR - lawnRl, bandH + 1);
				g.fillStyle = "#4a4a4a";
				g.fillRect(lawnLr, y, walkLr - lawnLr, bandH + 1);
				g.fillRect(walkRl, y, lawnRl - walkRl, bandH + 1);
				g.fillStyle = "#2b2b2b";
				g.fillRect(walkLr, y, walkRl - walkLr, bandH + 1);
				g.fillStyle = "rgba(255,255,255,0.06)";
				g.fillRect(walkLr, y, 2 * s, bandH + 1);
				g.fillRect(walkRl - 2 * s, y, 2 * s, bandH + 1);
			}

			g.fillStyle = "rgba(255,255,255,0.5)";
			const dashSpacing = 44;
			const off = state.cam % dashSpacing;
			for (let y = -off; y < H + dashSpacing; y += dashSpacing) {
				const s = persp(y);
				const cx = px(W / 2, y);
				g.fillRect(cx - 2 * s, y, 4 * s, 16 * s);
			}
			g.strokeStyle = "rgba(0,0,0,0.25)";
			g.lineWidth = 1;
			for (let y = -(state.cam % 60); y < H; y += 60) {
				g.beginPath();
				g.moveTo(px(LAWN_L, y), y);
				g.lineTo(px(WALK_L, y), y);
				g.moveTo(px(WALK_R, y), y);
				g.lineTo(px(LAWN_R, y), y);
				g.stroke();
			}
		}

		const WALL = ["#8a5a3c", "#6b7280", "#7c6f9c", "#4b7a5a", "#9c6f4b"];

		function drawHouse(h: House, cam: number) {
			const y = screenYOf(h.wy, cam);
			if (y < -60 || y > H + 60) return;
			const s = persp(y);
			const flip = h.side === "left" ? 1 : -1;
			const bodyCx = px(h.side === "left" ? LAWN_L / 2 : (LAWN_R + W) / 2, y);
			const bw = 96 * s;
			const bh = 68 * s;
			const roofH = 34 * s;

			g.fillStyle = "rgba(0,0,0,0.35)";
			g.beginPath();
			g.ellipse(bodyCx, y + bh * 0.5, bw * 0.55, 9 * s, 0, 0, Math.PI * 2);
			g.fill();

			// a couple of hedges on the lawn so the grass isn't a flat slab
			const hedgeY = y + bh * 0.55;
			g.fillStyle = "#0f5132";
			for (const hx of [bodyCx - bw * 0.62, bodyCx + bw * 0.62]) {
				g.beginPath();
				g.arc(hx, hedgeY, 7 * s, 0, Math.PI * 2);
				g.fill();
			}

			const base = WALL[Math.floor(h.hue * WALL.length) % WALL.length];
			g.fillStyle = h.broken ? "#5a2222" : base;
			g.fillRect(bodyCx - bw / 2, y - bh / 2, bw, bh);
			g.fillStyle = "rgba(0,0,0,0.22)";
			g.fillRect(bodyCx + flip * (bw / 2 - bw * 0.18), y - bh / 2, bw * 0.18, bh);

			g.fillStyle = h.broken ? "#3a1414" : "#2a2a33";
			g.beginPath();
			g.moveTo(bodyCx - bw / 2 - 4 * s, y - bh / 2);
			g.lineTo(bodyCx, y - bh / 2 - roofH);
			g.lineTo(bodyCx + bw / 2 + 4 * s, y - bh / 2);
			g.closePath();
			g.fill();

			g.fillStyle = "#2a1c12";
			g.fillRect(bodyCx - 9 * s, y + bh / 2 - 26 * s, 18 * s, 26 * s);
			g.fillStyle = "#FACC15";
			g.beginPath();
			g.arc(bodyCx + 5 * s, y + bh / 2 - 13 * s, 1.6 * s, 0, Math.PI * 2);
			g.fill();

			g.fillStyle = h.broken ? "#1a1a1a" : h.subscriber ? "#ffd257" : "#20303a";
			g.fillRect(bodyCx - bw / 2 + 12 * s, y - bh / 2 + 12 * s, 16 * s, 14 * s);
			g.fillRect(bodyCx + bw / 2 - 28 * s, y - bh / 2 + 12 * s, 16 * s, 14 * s);
			if (h.broken) {
				g.strokeStyle = "#000";
				g.lineWidth = 1;
				g.beginPath();
				g.moveTo(bodyCx - bw / 2 + 12 * s, y - bh / 2 + 12 * s);
				g.lineTo(bodyCx - bw / 2 + 28 * s, y - bh / 2 + 26 * s);
				g.stroke();
			}

			const mbX = px(h.side === "left" ? WALK_L - 8 : WALK_R + 8, y);
			g.strokeStyle = "rgba(200,200,200,0.18)";
			g.lineWidth = 6 * s;
			g.beginPath();
			g.moveTo(bodyCx, y + bh / 2);
			g.lineTo(mbX, y + 4 * s);
			g.stroke();

			const targetCol = h.hit ? "#4ADE80" : h.broken ? "#F87171" : h.subscriber ? "#FACC15" : "#6b7280";
			g.fillStyle = "#3a2a1a";
			g.fillRect(mbX - 1.6 * s, y - 2 * s, 3.2 * s, 16 * s);
			if (h.flash > 0) {
				const rings = h.subscriber ? "74,222,128" : "248,113,113";
				g.globalAlpha = Math.min(0.8, h.flash / 18);
				g.strokeStyle = `rgba(${rings},1)`;
				g.lineWidth = 2 * s;
				g.beginPath();
				g.arc(mbX, y - 6 * s, (18 - h.flash) * s + 4, 0, Math.PI * 2);
				g.stroke();
				g.globalAlpha = 1;
			}
			g.fillStyle = targetCol;
			g.fillRect(mbX - 7 * s, y - 12 * s, 14 * s, 10 * s);
			g.fillStyle = "rgba(0,0,0,0.4)";
			g.fillRect(mbX - 7 * s, y - 9 * s, 14 * s, 2 * s);
			if (h.subscriber && !h.hit) {
				g.fillStyle = "#ef4444";
				g.fillRect(mbX + 6 * s, y - 12 * s, 4 * s, 6 * s);
			}
		}

		function drawObstacle(o: Obstacle, cam: number) {
			const y = screenYOf(o.wy, cam);
			if (y < -30 || y > H + 30) return;
			const s = persp(y);
			const cx = px(o.x, y);
			if (o.kind === "pothole") {
				g.fillStyle = "rgba(0,0,0,0.55)";
				g.beginPath();
				g.ellipse(cx, y, 16 * s, 8 * s, 0, 0, Math.PI * 2);
				g.fill();
				g.strokeStyle = "rgba(120,120,120,0.4)";
				g.lineWidth = 1.4 * s;
				g.beginPath();
				g.ellipse(cx, y, 16 * s, 8 * s, 0, 0, Math.PI * 2);
				g.stroke();
			} else if (o.kind === "car") {
				const cw = 40 * s;
				const ch = 26 * s;
				g.fillStyle = "rgba(0,0,0,0.4)";
				g.beginPath();
				g.ellipse(cx, y + ch * 0.5, cw * 0.55, 6 * s, 0, 0, Math.PI * 2);
				g.fill();
				g.fillStyle = "#38BDF8";
				g.fillRect(cx - cw / 2, y - ch / 2, cw, ch);
				g.fillStyle = "#0b2b3a";
				g.fillRect(cx - cw / 2 + 5 * s, y - ch / 2 + 5 * s, cw - 10 * s, 9 * s);
				g.fillStyle = "#0A0A0A";
				g.beginPath();
				g.arc(cx - cw / 2 + 9 * s, y + ch / 2, 5 * s, 0, Math.PI * 2);
				g.arc(cx + cw / 2 - 9 * s, y + ch / 2, 5 * s, 0, Math.PI * 2);
				g.fill();
				g.fillStyle = "#fde68a";
				g.fillRect(cx - cw / 2, y - 4 * s, 3 * s, 5 * s);
				g.fillRect(cx + cw / 2 - 3 * s, y - 4 * s, 3 * s, 5 * s);
			} else if (o.kind === "dog") {
				const wag = Math.sin(o.phase) * 3 * s;
				g.fillStyle = "rgba(0,0,0,0.35)";
				g.beginPath();
				g.ellipse(cx, y + 7 * s, 14 * s, 4 * s, 0, 0, Math.PI * 2);
				g.fill();
				g.fillStyle = "#b45309";
				g.fillRect(cx - 12 * s, y - 4 * s, 20 * s, 10 * s);
				g.beginPath();
				g.arc(cx + 12 * s * o.dir, y - 2 * s, 6 * s, 0, Math.PI * 2);
				g.fill();
				g.fillStyle = "#7c3a06";
				g.fillRect(cx + 14 * s * o.dir, y - 8 * s, 3 * s, 4 * s);
				g.strokeStyle = "#b45309";
				g.lineWidth = 3 * s;
				g.beginPath();
				g.moveTo(cx - 12 * s * o.dir, y - 2 * s);
				g.lineTo(cx - 18 * s * o.dir, y - 6 * s + wag);
				g.stroke();
				g.fillStyle = "#7c3a06";
				g.fillRect(cx - 8 * s, y + 4 * s, 3 * s, 6 * s);
				g.fillRect(cx + 5 * s, y + 4 * s, 3 * s, 6 * s);
			} else {
				g.fillStyle = "rgba(0,0,0,0.35)";
				g.beginPath();
				g.ellipse(cx, y + 8 * s, 9 * s, 3 * s, 0, 0, Math.PI * 2);
				g.fill();
				g.fillStyle = "#ef4444";
				g.fillRect(cx - 5 * s, y - 8 * s, 10 * s, 16 * s);
				g.beginPath();
				g.arc(cx, y - 8 * s, 5 * s, Math.PI, 0);
				g.fill();
				g.fillStyle = "#b91c1c";
				g.fillRect(cx - 8 * s, y - 2 * s, 3 * s, 4 * s);
				g.fillRect(cx + 5 * s, y - 2 * s, 3 * s, 4 * s);
			}
		}

		function drawBike(state: GameState) {
			const baseY = BIKE_SCREEN_Y;
			const x = px(state.bikeX, baseY);
			if (state.invuln > 0 && Math.floor(state.invuln / 6) % 2 === 0) return;
			const lean = state.lean;
			const wobble = Math.sin(state.tyreT * 16) * 1.2;
			const wheelSpin = state.tyreT * 20;

			g.save();
			g.translate(x, baseY);
			g.rotate(lean * 0.12);

			g.fillStyle = "rgba(0,0,0,0.4)";
			g.beginPath();
			g.ellipse(0, 20, 22, 6, 0, 0, Math.PI * 2);
			g.fill();

			for (const wx of [-13, 13]) {
				g.strokeStyle = "#111";
				g.lineWidth = 4;
				g.beginPath();
				g.ellipse(wx, 14, 8, 11, 0, 0, Math.PI * 2);
				g.stroke();
				g.strokeStyle = "rgba(200,200,200,0.5)";
				g.lineWidth = 1;
				for (let a = 0; a < 3; a++) {
					const ang = wheelSpin + a * (Math.PI / 3);
					g.beginPath();
					g.moveTo(wx, 14);
					g.lineTo(wx + Math.cos(ang) * 6, 14 + Math.sin(ang) * 9);
					g.stroke();
				}
			}
			g.strokeStyle = "#FACC15";
			g.lineWidth = 3;
			g.beginPath();
			g.moveTo(-13, 14);
			g.lineTo(0, 2);
			g.lineTo(13, 14);
			g.moveTo(0, 2);
			g.lineTo(0, -8);
			g.stroke();
			g.beginPath();
			g.moveTo(-7, -8);
			g.lineTo(7, -8);
			g.stroke();
			g.fillStyle = "#9c6f4b";
			g.fillRect(-9, 0, 8, 8);

			g.fillStyle = "#38BDF8";
			g.beginPath();
			g.moveTo(-6 + wobble, -6);
			g.lineTo(6 + wobble, -6);
			g.lineTo(5 + wobble + lean * 3, -20);
			g.lineTo(-5 + wobble + lean * 3, -20);
			g.closePath();
			g.fill();
			g.strokeStyle = "#38BDF8";
			g.lineWidth = 3;
			g.beginPath();
			g.moveTo(-4 + wobble + lean * 3, -18);
			g.lineTo(-7, -8);
			g.moveTo(4 + wobble + lean * 3, -18);
			g.lineTo(7, -8);
			g.stroke();
			g.fillStyle = "#f2c48c";
			g.beginPath();
			g.arc(wobble + lean * 3, -25, 5, 0, Math.PI * 2);
			g.fill();
			g.fillStyle = "#ef4444";
			g.beginPath();
			g.arc(wobble + lean * 3, -26, 5.4, Math.PI, 0);
			g.fill();
			g.fillRect(wobble + lean * 3 - 5.4, -26, 3, 1.6);

			g.restore();
		}

		function drawPaper(p: Paper) {
			g.save();
			g.translate(p.x, p.y);
			g.rotate(p.spin);
			g.fillStyle = "#f5f5f5";
			g.fillRect(-4, -3, 8, 6);
			g.strokeStyle = "#9ca3af";
			g.lineWidth = 0.8;
			g.beginPath();
			g.moveTo(-4, 0);
			g.lineTo(4, 0);
			g.stroke();
			g.restore();
		}

		function drawBundle(b: Bundle, cam: number) {
			const y = screenYOf(b.wy, cam);
			if (y < -30 || y > H + 30) return;
			const s = persp(y);
			const cx = px(b.x, y);
			const lift = Math.sin(b.bob) * 2 * s;
			// shadow
			g.fillStyle = "rgba(0,0,0,0.35)";
			g.beginPath();
			g.ellipse(cx, y + 6 * s, 11 * s, 3.5 * s, 0, 0, Math.PI * 2);
			g.fill();
			// a tied stack of papers
			g.fillStyle = "#e5e5e5";
			g.fillRect(cx - 10 * s, y - 8 * s - lift, 20 * s, 12 * s);
			g.fillStyle = "#cfcfcf";
			g.fillRect(cx - 10 * s, y - 2 * s - lift, 20 * s, 3 * s);
			// twine
			g.strokeStyle = "#ef4444";
			g.lineWidth = 1.6 * s;
			g.beginPath();
			g.moveTo(cx, y - 8 * s - lift);
			g.lineTo(cx, y + 4 * s - lift);
			g.moveTo(cx - 10 * s, y - 2 * s - lift);
			g.lineTo(cx + 10 * s, y - 2 * s - lift);
			g.stroke();
			// a little "+PAPERS" glint so it reads as a pickup
			g.fillStyle = "#FACC15";
			g.beginPath();
			g.arc(cx + 11 * s, y - 9 * s - lift, 2 * s, 0, Math.PI * 2);
			g.fill();
		}

		function drawPuffs(state: GameState) {
			for (const p of state.puffs) {
				g.globalAlpha = (p.life / p.max) * 0.5;
				g.fillStyle = "#c9c9c9";
				g.beginPath();
				g.arc(p.x, p.y, 3 + (1 - p.life / p.max) * 4, 0, Math.PI * 2);
				g.fill();
			}
			g.globalAlpha = 1;
		}

		function draw(now: number) {
			const state = stateRef.current;

			if (!state || !state.started) {
				g.fillStyle = "#0a0a0a";
				g.fillRect(0, 0, W, H);
				g.fillStyle = "#12351f";
				g.fillRect(0, H / 2 + 40, W, H);
				g.fillStyle = "#FACC15";
				g.font = "bold 34px 'Archivo Black', sans-serif";
				g.textAlign = "center";
				g.fillText("PAPER ROUTE", W / 2, H / 2 - 60);
				g.fillStyle = "#FFFFFF";
				g.font = "15px Inter, sans-serif";
				g.fillText("\u2190 \u2192 steer  \u2022  Space throws where you lean", W / 2, H / 2 - 16);
				g.fillText("Hit the yellow mailboxes. Skip the grey ones.", W / 2, H / 2 + 8);
				g.fillText("Grab paper bundles \u00b7 dodge cars, dogs, potholes.", W / 2, H / 2 + 30);
				g.fillStyle = "#FACC15";
				g.font = "bold 15px Inter, sans-serif";
				g.fillText("Press Space or Enter to start", W / 2, H / 2 + 64);
				return;
			}

			drawGround(state);

			// depth-sort: far (small wy) first so nearer props overlap correctly
			const props: Array<{ wy: number; kind: "house" | "obs" | "bundle"; ref: House | Obstacle | Bundle }> = [];
			for (const h of state.houses) props.push({ wy: h.wy, kind: "house", ref: h });
			for (const o of state.obstacles) props.push({ wy: o.wy, kind: "obs", ref: o });
			for (const b of state.bundles) props.push({ wy: b.wy, kind: "bundle", ref: b });
			props.sort((a, b) => a.wy - b.wy);
			for (const pr of props) {
				if (pr.kind === "house") drawHouse(pr.ref as House, state.cam);
				else if (pr.kind === "bundle") drawBundle(pr.ref as Bundle, state.cam);
				else drawObstacle(pr.ref as Obstacle, state.cam);
			}

			drawPuffs(state);
			drawBike(state);
			for (const p of state.papers) drawPaper(p);

			// HUD
			g.fillStyle = "rgba(0,0,0,0.45)";
			g.fillRect(0, 0, W, 30);
			g.fillStyle = "#FACC15";
			g.font = "bold 15px Inter, sans-serif";
			g.textAlign = "left";
			g.fillText(`SCORE ${state.score}`, 10, 20);
			g.textAlign = "center";
			g.fillStyle = "#FFFFFF";
			g.fillText(`DAY ${state.day}`, W / 2, 20);
			if (state.combo > 1) {
				g.fillStyle = "#4ADE80";
				g.font = "bold 13px Inter, sans-serif";
				g.fillText(`COMBO x${state.combo}`, W / 2, H - 14);
			}
			g.textAlign = "right";
			g.fillStyle = "#FACC15";
			g.font = "bold 15px Inter, sans-serif";
			g.fillText(`PAPERS ${state.papersLeft}`, W - 10, 20);
			for (let i = 0; i < state.lives; i++) {
				g.fillStyle = "#f5f5f5";
				g.fillRect(W - 12 - i * 12, 24, 8, 6);
			}

			if (state.over) {
				g.fillStyle = "rgba(0,0,0,0.74)";
				g.fillRect(0, 0, W, H);
				g.fillStyle = "#F87171";
				g.font = "bold 32px 'Archivo Black', sans-serif";
				g.textAlign = "center";
				g.fillText("ROUTE OVER", W / 2, H / 2 - 20);
				g.fillStyle = "#FFFFFF";
				g.font = "16px Inter, sans-serif";
				g.fillText(`Final score: ${state.score}`, W / 2, H / 2 + 14);
				g.fillText("Press Space to play again", W / 2, H / 2 + 42);
			}
		}

		let lastNow = 0;
		function frame(now: number) {
			const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0;
			lastNow = now;
			update(now, dt);
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
		<div style={{ fontFamily: "'Inter', sans-serif", background: COLORS.bg, color: COLORS.text, minHeight: "100vh" }}>
			<link
				rel="stylesheet"
				href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700&display=swap"
			/>

			<BattleHeader />

			<div style={{ maxWidth: 700, margin: "0 auto", padding: "40px 24px", textAlign: "center" }}>
				<h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 32, margin: "0 0 8px" }}>Paper Route</h1>
				<p style={{ color: COLORS.textDim, fontSize: 15, marginBottom: 24 }}>
					Ride the block and land every paper. Arrows to steer, Space to throw where you lean.
				</p>

				{pendingScore !== null && <InitialsPrompt score={pendingScore} onSubmit={submit} onCancel={dismiss} />}

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
