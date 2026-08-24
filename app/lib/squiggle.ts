import type { PackedOp } from "./drawing-codec";

/**
 * Generates the starting mark for Squiggle Challenge.
 *
 * It runs on the server and ships as packed ops, so every player is looking
 * at byte-identical artwork — nobody gets a friendlier squiggle than anyone
 * else. The shapes are parametric rather than a random walk, which keeps them
 * smooth enough to be suggestive without ever looking like a real object.
 */

const W = 1400;
const H = 1000;
const INK = "#111111";
const SIZE = 13;
const PRESSURE = 88;

type Point = { x: number; y: number };
type Kind = "wave" | "arc" | "loop" | "spiral" | "zigzag" | "hook";

const KINDS: Kind[] = ["wave", "arc", "loop", "spiral", "zigzag", "hook"];

function sample(kind: Kind, t: number): Point {
	const tau = Math.PI * 2;
	switch (kind) {
		case "wave":
			return { x: (t - 0.5) * 2, y: Math.sin(t * tau * 1.4) * 0.55 };
		case "arc":
			return { x: Math.cos(Math.PI * (0.15 + t * 0.7)) * 1.1, y: Math.sin(Math.PI * (0.15 + t * 0.7)) * -1 };
		case "loop": {
			// A lopsided figure-eight.
			const a = t * tau;
			return { x: Math.sin(a) * 1.1, y: Math.sin(a * 2) * 0.6 };
		}
		case "spiral": {
			const a = t * tau * 1.6;
			const r = 0.25 + t * 0.85;
			return { x: Math.cos(a) * r, y: Math.sin(a) * r };
		}
		case "zigzag": {
			const legs = 4;
			const seg = t * legs;
			const i = Math.floor(seg);
			const f = seg - i;
			return { x: (t - 0.5) * 2, y: (i % 2 === 0 ? f : 1 - f) * 1.1 - 0.55 };
		}
		case "hook": {
			const a = Math.PI * (t * 1.35);
			return { x: Math.cos(a) * (1.05 - t * 0.35), y: Math.sin(a) * -0.9 + t * 0.5 };
		}
	}
}

function buildStroke(kind: Kind, rand: () => number): PackedOp {
	const cx = W / 2 + (rand() - 0.5) * 220;
	const cy = H / 2 + (rand() - 0.5) * 160;
	const scaleX = 210 + rand() * 230;
	const scaleY = 170 + rand() * 190;
	const rotation = (rand() - 0.5) * Math.PI;
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);

	const steps = 64;
	const flat: number[] = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const p = sample(kind, t);
		// Slight wobble so it reads as hand-drawn rather than plotted.
		const wobble = (rand() - 0.5) * 0.035;
		const sx = (p.x + wobble) * scaleX;
		const sy = (p.y + wobble) * scaleY;
		const x = cx + sx * cos - sy * sin;
		const y = cy + sx * sin + sy * cos;
		flat.push(
			Math.round(Math.max(60, Math.min(W - 60, x))),
			Math.round(Math.max(60, Math.min(H - 60, y))),
			PRESSURE
		);
	}

	return [0, 0, INK, SIZE, flat];
}

/**
 * One or two strokes. Two makes for a harder, more interesting starting
 * point; one is cleaner and easier to build on.
 */
export function makeSquiggle(rand: () => number = Math.random): PackedOp[] {
	const first = KINDS[Math.floor(rand() * KINDS.length)];
	const strokes: PackedOp[] = [buildStroke(first, rand)];

	if (rand() < 0.45) {
		const rest = KINDS.filter((k) => k !== first);
		strokes.push(buildStroke(rest[Math.floor(rand() * rest.length)], rand));
	}

	return strokes;
}
