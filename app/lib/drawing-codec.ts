import type { BrushTool, Op } from "../components/DrawPad";

/**
 * Compact wire format for drawings, shared by every game that streams or
 * stores canvas data.
 *
 * `{"x":123.456,"y":789.012,"p":0.83}` is ~40 bytes a point. Packed as flat
 * integer triples it is ~10, which keeps a dense drawing inside both the
 * WebSocket frame budget and the 128 KiB Durable Object value limit.
 */

export const MAX_OPS_PER_ENTRY = 3000;
export const MAX_POINTS_PER_STROKE = 3000;
export const MAX_PACKED_BYTES = 110_000;

const TOOLS: BrushTool[] = ["pen", "marker", "pencil", "eraser"];

/** [0, toolIndex, color, size, [x,y,p, x,y,p, ...]] */
export type PackedStroke = [0, number, string, number, number[]];
/** [1, color, x, y] */
export type PackedFill = [1, string, number, number];
export type PackedOp = PackedStroke | PackedFill;

export function packOps(ops: Op[]): PackedOp[] {
	return ops.map((op): PackedOp => {
		if (op.kind === "fill") {
			return [1, op.color, Math.round(op.x), Math.round(op.y)];
		}
		const flat: number[] = [];
		for (const pt of op.pts) {
			flat.push(Math.round(pt.x), Math.round(pt.y), Math.round(pt.p * 100));
		}
		return [0, Math.max(0, TOOLS.indexOf(op.tool)), op.color, Math.round(op.size), flat];
	});
}

export function unpackOps(packed: PackedOp[]): Op[] {
	const out: Op[] = [];
	for (const p of packed) {
		if (p[0] === 1) {
			out.push({ kind: "fill", color: p[1], x: p[2], y: p[3] });
			continue;
		}
		const flat = p[4];
		const pts = [];
		for (let i = 0; i + 2 < flat.length; i += 3) {
			pts.push({ x: flat[i], y: flat[i + 1], p: flat[i + 2] / 100 });
		}
		out.push({ kind: "stroke", tool: TOOLS[p[1]] ?? "pen", color: p[2], size: p[3], pts });
	}
	return out;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Validates untrusted packed drawing data. Everything here arrives from a
 * player's browser and gets rendered on every other client in the room, so
 * it is checked structurally rather than trusted.
 */
export function isValidPackedOp(value: unknown): value is PackedOp {
	if (!Array.isArray(value)) return false;

	if (value[0] === 1) {
		return (
			value.length === 4 &&
			typeof value[1] === "string" &&
			HEX.test(value[1]) &&
			Number.isFinite(value[2]) &&
			Number.isFinite(value[3])
		);
	}

	if (value[0] !== 0) return false;
	if (value.length !== 5) return false;
	if (!Number.isInteger(value[1]) || value[1] < 0 || value[1] >= TOOLS.length) return false;
	if (typeof value[2] !== "string" || !HEX.test(value[2])) return false;
	if (!Number.isFinite(value[3]) || value[3] <= 0 || value[3] > 256) return false;
	if (!Array.isArray(value[4])) return false;
	if (value[4].length > MAX_POINTS_PER_STROKE * 3) return false;
	if (value[4].length % 3 !== 0) return false;
	for (const n of value[4]) {
		if (!Number.isFinite(n) || n < -10_000 || n > 10_000) return false;
	}
	return true;
}

export function isValidPackedEntry(value: unknown): value is PackedOp[] {
	if (!Array.isArray(value)) return false;
	if (value.length > MAX_OPS_PER_ENTRY) return false;
	return value.every(isValidPackedOp);
}
