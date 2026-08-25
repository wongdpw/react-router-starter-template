/**
 * Stamp-able icons for the drawing pad.
 *
 * Icons are vector shapes rather than images: they stay crisp at any size,
 * cost a handful of bytes on the wire, and replay through the same op-list
 * machinery as brush strokes. Everything is authored in a 100x100 box centred
 * on (50, 50) so placement maths is uniform.
 */

export type IconShape =
	| { c: "circle"; x: number; y: number; r: number; fill: string }
	| { c: "poly"; pts: number[]; fill: string }
	| { c: "path"; d: string; fill?: string; stroke?: string; w?: number };

export interface Icon {
	id: string;
	name: string;
	shapes: IconShape[];
}

export const ICONS: Icon[] = [
	{
		id: "star",
		name: "Star",
		shapes: [
			{ c: "poly", pts: [50, 6, 62, 38, 96, 38, 68, 58, 79, 92, 50, 71, 21, 92, 32, 58, 4, 38, 38, 38], fill: "#FACC15" },
		],
	},
	{
		id: "heart",
		name: "Heart",
		shapes: [
			{ c: "path", d: "M50 90C20 68 8 52 8 36 8 22 19 12 32 12c8 0 15 4 18 10 3-6 10-10 18-10 13 0 24 10 24 24 0 16-12 32-42 54Z", fill: "#F43F5E" },
		],
	},
	{
		id: "sun",
		name: "Sun",
		shapes: [
			{ c: "circle", x: 50, y: 50, r: 24, fill: "#FBBF24" },
			{ c: "path", d: "M50 4v14M50 82v14M4 50h14M82 50h14M17 17l10 10M73 73l10 10M83 17L73 27M27 73l-10 10", stroke: "#FBBF24", w: 7 },
		],
	},
	{
		id: "moon",
		name: "Moon",
		shapes: [
			{ c: "path", d: "M62 8a44 44 0 1 0 30 62A38 38 0 0 1 62 8Z", fill: "#E5E7EB" },
		],
	},
	{
		id: "cloud",
		name: "Cloud",
		shapes: [
			{ c: "path", d: "M26 74a20 20 0 0 1 2-40 26 26 0 0 1 48-6 18 18 0 0 1 2 46Z", fill: "#BAE6FD" },
		],
	},
	{
		id: "bolt",
		name: "Lightning",
		shapes: [{ c: "poly", pts: [56, 4, 24, 56, 46, 56, 38, 96, 76, 40, 52, 40], fill: "#FDE047" }],
	},
	{
		id: "flower",
		name: "Flower",
		shapes: [
			{ c: "circle", x: 50, y: 22, r: 15, fill: "#F472B6" },
			{ c: "circle", x: 78, y: 50, r: 15, fill: "#F472B6" },
			{ c: "circle", x: 50, y: 78, r: 15, fill: "#F472B6" },
			{ c: "circle", x: 22, y: 50, r: 15, fill: "#F472B6" },
			{ c: "circle", x: 50, y: 50, r: 13, fill: "#FDE047" },
		],
	},
	{
		id: "leaf",
		name: "Leaf",
		shapes: [
			{ c: "path", d: "M86 14C40 14 14 40 14 78c0 4 4 8 8 8 38 0 64-26 64-72Z", fill: "#4ADE80" },
			{ c: "path", d: "M78 22 26 74", stroke: "#16A34A", w: 5 },
		],
	},
	{
		id: "tree",
		name: "Tree",
		shapes: [
			{ c: "path", d: "M44 74h12v20H44z", fill: "#92400E" },
			{ c: "circle", x: 50, y: 42, r: 28, fill: "#22C55E" },
		],
	},
	{
		id: "mushroom",
		name: "Mushroom",
		shapes: [
			{ c: "path", d: "M36 56h28v30a14 14 0 0 1-28 0Z", fill: "#FEF3C7" },
			{ c: "path", d: "M10 56a40 34 0 0 1 80 0Z", fill: "#EF4444" },
			{ c: "circle", x: 32, y: 42, r: 6, fill: "#FFFFFF" },
			{ c: "circle", x: 62, y: 36, r: 5, fill: "#FFFFFF" },
		],
	},
	{
		id: "cat",
		name: "Cat",
		shapes: [
			{ c: "poly", pts: [20, 34, 26, 8, 44, 24], fill: "#A78BFA" },
			{ c: "poly", pts: [80, 34, 74, 8, 56, 24], fill: "#A78BFA" },
			{ c: "circle", x: 50, y: 56, r: 32, fill: "#A78BFA" },
			{ c: "circle", x: 38, y: 50, r: 4, fill: "#1F2937" },
			{ c: "circle", x: 62, y: 50, r: 4, fill: "#1F2937" },
			{ c: "path", d: "M44 64h12l-6 6Z", fill: "#1F2937" },
		],
	},
	{
		id: "ghost",
		name: "Ghost",
		shapes: [
			{ c: "path", d: "M18 88V46a32 32 0 0 1 64 0v42l-11-9-11 9-11-9-11 9-10-9Z", fill: "#F3F4F6" },
			{ c: "circle", x: 38, y: 44, r: 5, fill: "#1F2937" },
			{ c: "circle", x: 62, y: 44, r: 5, fill: "#1F2937" },
		],
	},
	{
		id: "robot",
		name: "Robot",
		shapes: [
			{ c: "path", d: "M50 6v14", stroke: "#94A3B8", w: 5 },
			{ c: "circle", x: 50, y: 8, r: 6, fill: "#94A3B8" },
			{ c: "path", d: "M20 24h60v56H20z", fill: "#CBD5E1" },
			{ c: "circle", x: 36, y: 46, r: 7, fill: "#0EA5E9" },
			{ c: "circle", x: 64, y: 46, r: 7, fill: "#0EA5E9" },
			{ c: "path", d: "M34 66h32", stroke: "#475569", w: 5 },
		],
	},
	{
		id: "crown",
		name: "Crown",
		shapes: [
			{ c: "poly", pts: [12, 76, 20, 26, 36, 50, 50, 18, 64, 50, 80, 26, 88, 76], fill: "#F59E0B" },
			{ c: "path", d: "M12 78h76", stroke: "#B45309", w: 8 },
		],
	},
	{
		id: "balloon",
		name: "Balloon",
		shapes: [
			{ c: "path", d: "M50 66c-16 0-28-14-28-30S34 8 50 8s28 12 28 28-12 30-28 30Z", fill: "#FB7185" },
			{ c: "poly", pts: [44, 64, 56, 64, 50, 74], fill: "#FB7185" },
			{ c: "path", d: "M50 74c8 8-8 12 0 20", stroke: "#9CA3AF", w: 3 },
		],
	},
	{
		id: "rainbow",
		name: "Rainbow",
		shapes: [
			{ c: "path", d: "M10 80a40 40 0 0 1 80 0", stroke: "#EF4444", w: 10 },
			{ c: "path", d: "M22 80a28 28 0 0 1 56 0", stroke: "#F59E0B", w: 10 },
			{ c: "path", d: "M34 80a16 16 0 0 1 32 0", stroke: "#22C55E", w: 10 },
		],
	},
	{
		id: "fire",
		name: "Fire",
		shapes: [
			{ c: "path", d: "M50 92c18 0 30-12 30-28 0-20-18-28-22-56-14 12-14 26-14 32-6-4-8-10-8-16-10 10-16 24-16 40 0 16 12 28 30 28Z", fill: "#F97316" },
			{ c: "path", d: "M50 90c9 0 15-7 15-16 0-11-9-16-11-30-8 8-8 18-8 22-4-2-5-6-5-9-5 6-6 12-6 17 0 9 6 16 15 16Z", fill: "#FDE047" },
		],
	},
	{
		id: "drop",
		name: "Water drop",
		shapes: [
			{ c: "path", d: "M50 8C34 32 24 46 24 60a26 26 0 0 0 52 0c0-14-10-28-26-52Z", fill: "#38BDF8" },
		],
	},
	{
		id: "note",
		name: "Music note",
		shapes: [
			{ c: "path", d: "M42 74V18l34-8v56", stroke: "#1F2937", w: 7 },
			{ c: "circle", x: 32, y: 76, r: 12, fill: "#1F2937" },
			{ c: "circle", x: 66, y: 66, r: 12, fill: "#1F2937" },
		],
	},
	{
		id: "eye",
		name: "Eye",
		shapes: [
			{ c: "path", d: "M6 50c14-20 30-30 44-30s30 10 44 30c-14 20-30 30-44 30S20 70 6 50Z", fill: "#FFFFFF", stroke: "#1F2937", w: 5 },
			{ c: "circle", x: 50, y: 50, r: 15, fill: "#0EA5E9" },
			{ c: "circle", x: 50, y: 50, r: 7, fill: "#111827" },
		],
	},
];

export const ICON_IDS: string[] = ICONS.map((s) => s.id);

const byId = new Map(ICONS.map((s) => [s.id, s]));

export function getIcon(id: string): Icon | undefined {
	return byId.get(id);
}

/** Default on-canvas size, in canvas units, before the placement drag scales it. */
export const ICON_BASE_SIZE = 160;

/**
 * Paints one sticker. Browser-only — the worker never renders, it only
 * validates and relays.
 */
export function drawIcon(
	ctx: CanvasRenderingContext2D,
	id: string,
	x: number,
	y: number,
	scale: number,
	rotation: number
) {
	const icon = byId.get(id);
	if (!icon) return;

	const size = ICON_BASE_SIZE * scale;
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(rotation);
	ctx.scale(size / 100, size / 100);
	ctx.translate(-50, -50);

	for (const shape of icon.shapes) {
		ctx.beginPath();
		if (shape.c === "circle") {
			ctx.fillStyle = shape.fill;
			ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2);
			ctx.fill();
			continue;
		}
		if (shape.c === "poly") {
			ctx.fillStyle = shape.fill;
			for (let i = 0; i < shape.pts.length; i += 2) {
				if (i === 0) ctx.moveTo(shape.pts[i], shape.pts[i + 1]);
				else ctx.lineTo(shape.pts[i], shape.pts[i + 1]);
			}
			ctx.closePath();
			ctx.fill();
			continue;
		}
		const path = new Path2D(shape.d);
		if (shape.fill) {
			ctx.fillStyle = shape.fill;
			ctx.fill(path);
		}
		if (shape.stroke) {
			ctx.strokeStyle = shape.stroke;
			ctx.lineWidth = shape.w ?? 4;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.stroke(path);
		}
	}

	ctx.restore();
}

/** Inline SVG for the picker, using the same shape data as the canvas. */
export function iconSvgChildren(icon: Icon): string {
	return icon.shapes
		.map((shape) => {
			if (shape.c === "circle") {
				return `<circle cx="${shape.x}" cy="${shape.y}" r="${shape.r}" fill="${shape.fill}"/>`;
			}
			if (shape.c === "poly") {
				const pts: string[] = [];
				for (let i = 0; i < shape.pts.length; i += 2) pts.push(`${shape.pts[i]},${shape.pts[i + 1]}`);
				return `<polygon points="${pts.join(" ")}" fill="${shape.fill}"/>`;
			}
			const fill = shape.fill ? `fill="${shape.fill}"` : `fill="none"`;
			const stroke = shape.stroke
				? `stroke="${shape.stroke}" stroke-width="${shape.w ?? 4}" stroke-linecap="round" stroke-linejoin="round"`
				: "";
			return `<path d="${shape.d}" ${fill} ${stroke}/>`;
		})
		.join("");
}
