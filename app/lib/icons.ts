/**
 * Stamp-able icons for the drawing pad.
 *
 * Icons are vector shapes rather than images: they stay crisp at any size,
 * cost a handful of bytes on the wire, and replay through the same op-list
 * machinery as brush strokes. Everything is authored in a 100x100 box centred
 * on (50, 50) so placement maths is uniform.
 */

export type IconShape =
	| { c: "circle"; x: number; y: number; r: number; fill?: string; stroke?: string; w?: number }
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
	{
		id: "fish",
		name: "Fish",
		shapes: [
			{ c: "path", d: "M68 50c0 13-15 23-29 23S12 63 12 50s13-23 27-23 29 10 29 23Z", fill: "#38BDF8" },
			{ c: "poly", pts: [66, 50, 92, 30, 92, 70], fill: "#0EA5E9" },
			{ c: "circle", x: 30, y: 44, r: 4, fill: "#0F172A" },
		],
	},
	{
		id: "bird",
		name: "Bird",
		shapes: [
			{ c: "path", d: "M20 60c0-18 14-30 32-30 14 0 24 7 28 18l14 4-12 8c-3 16-16 26-32 26-18 0-30-11-30-26Z", fill: "#60A5FA" },
			{ c: "path", d: "M34 58c8-8 18-8 26-2-6 10-18 12-26 2Z", fill: "#3B82F6" },
			{ c: "poly", pts: [86, 52, 98, 56, 86, 60], fill: "#FB923C" },
			{ c: "circle", x: 66, y: 46, r: 3.5, fill: "#0F172A" },
		],
	},
	{
		id: "butterfly",
		name: "Butterfly",
		shapes: [
			{ c: "path", d: "M48 50C36 26 10 22 10 40c0 16 20 22 38 24Z", fill: "#F472B6" },
			{ c: "path", d: "M52 50C64 26 90 22 90 40c0 16-20 22-38 24Z", fill: "#F472B6" },
			{ c: "path", d: "M48 52C38 74 16 82 16 68c0-12 18-16 32-18Z", fill: "#C084FC" },
			{ c: "path", d: "M52 52C62 74 84 82 84 68c0-12-18-16-32-18Z", fill: "#C084FC" },
			{ c: "path", d: "M50 26v52", stroke: "#1F2937", w: 5 },
		],
	},
	{
		id: "bee",
		name: "Bee",
		shapes: [
			{ c: "path", d: "M24 40c14-10 34-10 48 0 8 6 8 20 0 26-14 10-34 10-48 0-8-6-8-20 0-26Z", fill: "#FBBF24" },
			{ c: "path", d: "M42 32v36M58 32v36", stroke: "#1F2937", w: 6 },
			{ c: "path", d: "M34 34C24 16 8 16 12 28c3 8 14 10 22 6Z", fill: "#E0F2FE" },
			{ c: "path", d: "M66 34C76 16 92 16 88 28c-3 8-14 10-22 6Z", fill: "#E0F2FE" },
		],
	},
	{
		id: "snail",
		name: "Snail",
		shapes: [
			{ c: "path", d: "M10 76c0-6 6-10 14-10h10v10Z", fill: "#FCD34D" },
			{ c: "path", d: "M34 76a26 26 0 1 1 26-26c0 8-6 14-14 14s-12-5-12-12 4-8 8-8", stroke: "#D97706", w: 7 },
			{ c: "path", d: "M12 66c0-14 8-22 20-22", stroke: "#FCD34D", w: 10 },
			{ c: "path", d: "M14 46l-4-12M22 44l2-14", stroke: "#FCD34D", w: 4 },
		],
	},
	{
		id: "dog",
		name: "Dog",
		shapes: [
			{ c: "path", d: "M18 30c0-12 4-18 10-16 6 2 10 8 12 14Z", fill: "#B45309" },
			{ c: "path", d: "M82 30c0-12-4-18-10-16-6 2-10 8-12 14Z", fill: "#B45309" },
			{ c: "circle", x: 50, y: 54, r: 30, fill: "#D97706" },
			{ c: "circle", x: 39, y: 48, r: 4.5, fill: "#1F2937" },
			{ c: "circle", x: 61, y: 48, r: 4.5, fill: "#1F2937" },
			{ c: "circle", x: 50, y: 62, r: 6, fill: "#1F2937" },
		],
	},
	{
		id: "frog",
		name: "Frog",
		shapes: [
			{ c: "circle", x: 30, y: 32, r: 13, fill: "#4ADE80" },
			{ c: "circle", x: 70, y: 32, r: 13, fill: "#4ADE80" },
			{ c: "circle", x: 30, y: 30, r: 5, fill: "#0F172A" },
			{ c: "circle", x: 70, y: 30, r: 5, fill: "#0F172A" },
			{ c: "path", d: "M16 52a34 26 0 0 0 68 0Z", fill: "#22C55E" },
			{ c: "path", d: "M30 66c8 8 32 8 40 0", stroke: "#166534", w: 5 },
		],
	},
	{
		id: "owl",
		name: "Owl",
		shapes: [
			{ c: "poly", pts: [22, 22, 30, 4, 42, 18], fill: "#92400E" },
			{ c: "poly", pts: [78, 22, 70, 4, 58, 18], fill: "#92400E" },
			{ c: "path", d: "M50 14c20 0 32 16 32 38S68 92 50 92 18 74 18 52 30 14 50 14Z", fill: "#B45309" },
			{ c: "circle", x: 37, y: 44, r: 12, fill: "#FEF3C7" },
			{ c: "circle", x: 63, y: 44, r: 12, fill: "#FEF3C7" },
			{ c: "circle", x: 37, y: 44, r: 5, fill: "#0F172A" },
			{ c: "circle", x: 63, y: 44, r: 5, fill: "#0F172A" },
			{ c: "poly", pts: [50, 54, 44, 64, 56, 64], fill: "#FB923C" },
		],
	},
	{
		id: "whale",
		name: "Whale",
		shapes: [
			{ c: "path", d: "M14 56c0-16 16-26 34-26s32 10 32 24c0 10-10 18-24 18H30c-10 0-16-6-16-16Z", fill: "#38BDF8" },
			{ c: "poly", pts: [78, 54, 96, 40, 96, 68], fill: "#0EA5E9" },
			{ c: "circle", x: 34, y: 50, r: 4, fill: "#0F172A" },
			{ c: "path", d: "M46 28c0-8 6-12 6-12s6 4 6 12", stroke: "#BAE6FD", w: 5 },
		],
	},
	{
		id: "crab",
		name: "Crab",
		shapes: [
			{ c: "path", d: "M22 60a28 20 0 0 1 56 0Z", fill: "#F87171" },
			{ c: "path", d: "M22 62h56v4a10 10 0 0 1-10 10H32a10 10 0 0 1-10-10Z", fill: "#EF4444" },
			{ c: "circle", x: 38, y: 50, r: 4, fill: "#0F172A" },
			{ c: "circle", x: 62, y: 50, r: 4, fill: "#0F172A" },
			{ c: "path", d: "M22 58C10 54 8 44 14 38c6 4 10 10 10 16ZM78 58c12-4 14-14 8-20-6 4-10 10-10 16Z", fill: "#EF4444" },
			{ c: "path", d: "M28 78l-8 10M50 80v10M72 78l8 10", stroke: "#EF4444", w: 5 },
		],
	},
	{
		id: "dino",
		name: "Dinosaur",
		shapes: [
			{ c: "path", d: "M14 74c0-22 12-38 32-38 14 0 22 8 26 18l14 6-14 6c-2 10-8 16-16 18Z", fill: "#34D399" },
			{ c: "poly", pts: [30, 38, 36, 24, 42, 38], fill: "#10B981" },
			{ c: "poly", pts: [44, 36, 50, 22, 56, 36], fill: "#10B981" },
			{ c: "path", d: "M24 74v12M40 76v10M58 74v12", stroke: "#34D399", w: 7 },
			{ c: "circle", x: 62, y: 50, r: 3.5, fill: "#0F172A" },
		],
	},
	{
		id: "pizza",
		name: "Pizza",
		shapes: [
			{ c: "poly", pts: [50, 8, 90, 84, 10, 84], fill: "#FBBF24" },
			{ c: "path", d: "M10 84h80", stroke: "#B45309", w: 10 },
			{ c: "circle", x: 50, y: 46, r: 6, fill: "#EF4444" },
			{ c: "circle", x: 36, y: 66, r: 6, fill: "#EF4444" },
			{ c: "circle", x: 64, y: 68, r: 6, fill: "#EF4444" },
		],
	},
	{
		id: "icecream",
		name: "Ice cream",
		shapes: [
			{ c: "poly", pts: [32, 52, 68, 52, 50, 94], fill: "#D97706" },
			{ c: "circle", x: 38, y: 42, r: 15, fill: "#F9A8D4" },
			{ c: "circle", x: 62, y: 42, r: 15, fill: "#FDE68A" },
			{ c: "circle", x: 50, y: 26, r: 15, fill: "#A7F3D0" },
		],
	},
	{
		id: "cupcake",
		name: "Cupcake",
		shapes: [
			{ c: "path", d: "M26 54h48l-6 36H32Z", fill: "#FCD34D" },
			{ c: "path", d: "M22 54c0-16 12-26 28-26s28 10 28 26Z", fill: "#F9A8D4" },
			{ c: "circle", x: 50, y: 20, r: 7, fill: "#EF4444" },
		],
	},
	{
		id: "apple",
		name: "Apple",
		shapes: [
			{ c: "path", d: "M50 30c-6-6-18-8-26-2-10 8-12 26-4 40 6 10 14 18 22 18s8-4 8-4 0 4 8 4 16-8 22-18c8-14 6-32-4-40-8-6-20-4-26 2Z", fill: "#EF4444" },
			{ c: "path", d: "M50 30V16", stroke: "#78350F", w: 5 },
			{ c: "path", d: "M52 20c8-10 20-8 20-8s-2 12-12 14c-4 1-8-2-8-6Z", fill: "#22C55E" },
		],
	},
	{
		id: "banana",
		name: "Banana",
		shapes: [
			{ c: "path", d: "M18 22c0 34 22 58 56 58 8 0 12-4 12-8 0-6-6-6-12-8-22-6-38-22-42-44-1-6-14-6-14 2Z", fill: "#FDE047" },
			{ c: "path", d: "M22 20c2 30 22 52 52 54", stroke: "#CA8A04", w: 4 },
		],
	},
	{
		id: "coffee",
		name: "Coffee",
		shapes: [
			{ c: "path", d: "M22 40h50v26a20 20 0 0 1-20 20H42a20 20 0 0 1-20-20Z", fill: "#F3F4F6" },
			{ c: "path", d: "M72 48h8a12 12 0 0 1 0 24h-8", stroke: "#9CA3AF", w: 6 },
			{ c: "path", d: "M36 26c0-6 6-6 6-12M50 26c0-6 6-6 6-12M64 26c0-6-6-6-6-12", stroke: "#9CA3AF", w: 4 },
		],
	},
	{
		id: "donut",
		name: "Doughnut",
		shapes: [
			{ c: "path", d: "M50 22a28 28 0 1 0 0 56 28 28 0 0 0 0-56Z", stroke: "#D97706", w: 22 },
			{ c: "path", d: "M50 24a26 26 0 1 0 0 52", stroke: "#F9A8D4", w: 14 },
			{ c: "path", d: "M36 34l4-6M62 32l6 4M32 62l-6 2M68 62l6 4", stroke: "#FFFFFF", w: 4 },
		],
	},
	{
		id: "cherry",
		name: "Cherries",
		shapes: [
			{ c: "path", d: "M52 14c-12 18-24 26-24 44M52 14c8 16 18 22 22 40", stroke: "#16A34A", w: 5 },
			{ c: "circle", x: 28, y: 70, r: 15, fill: "#EF4444" },
			{ c: "circle", x: 72, y: 68, r: 14, fill: "#DC2626" },
		],
	},
	{
		id: "rocket",
		name: "Rocket",
		shapes: [
			{ c: "path", d: "M50 6c14 12 20 28 20 46v14H30V52c0-18 6-34 20-46Z", fill: "#E5E7EB" },
			{ c: "poly", pts: [30, 56, 14, 82, 30, 74], fill: "#EF4444" },
			{ c: "poly", pts: [70, 56, 86, 82, 70, 74], fill: "#EF4444" },
			{ c: "circle", x: 50, y: 40, r: 9, fill: "#38BDF8" },
			{ c: "poly", pts: [42, 66, 58, 66, 50, 94], fill: "#FB923C" },
		],
	},
	{
		id: "car",
		name: "Car",
		shapes: [
			{ c: "path", d: "M12 66V52l12-4 10-16h32l10 16 12 4v14Z", fill: "#EF4444" },
			{ c: "path", d: "M38 36h24l7 12H31Z", fill: "#BAE6FD" },
			{ c: "circle", x: 30, y: 70, r: 11, fill: "#1F2937" },
			{ c: "circle", x: 70, y: 70, r: 11, fill: "#1F2937" },
		],
	},
	{
		id: "boat",
		name: "Sailboat",
		shapes: [
			{ c: "path", d: "M14 70h72l-12 18H26Z", fill: "#B45309" },
			{ c: "path", d: "M50 10v56", stroke: "#78350F", w: 5 },
			{ c: "poly", pts: [54, 16, 84, 62, 54, 62], fill: "#F3F4F6" },
			{ c: "poly", pts: [46, 24, 20, 62, 46, 62], fill: "#38BDF8" },
		],
	},
	{
		id: "house",
		name: "House",
		shapes: [
			{ c: "poly", pts: [50, 10, 92, 44, 8, 44], fill: "#EF4444" },
			{ c: "path", d: "M18 44h64v46H18z", fill: "#FCD34D" },
			{ c: "path", d: "M42 62h16v28H42z", fill: "#92400E" },
			{ c: "circle", x: 54, y: 76, r: 2.5, fill: "#FDE047" },
		],
	},
	{
		id: "key",
		name: "Key",
		shapes: [
			{ c: "circle", x: 34, y: 34, r: 18, stroke: "#F59E0B", w: 10 },
			{ c: "path", d: "M46 46l34 34", stroke: "#F59E0B", w: 9 },
			{ c: "path", d: "M66 66l10 10M58 74l8 8", stroke: "#F59E0B", w: 9 },
		],
	},
	{
		id: "bulb",
		name: "Lightbulb",
		shapes: [
			{ c: "circle", x: 50, y: 40, r: 26, fill: "#FDE047" },
			{ c: "path", d: "M38 66h24v10H38z", fill: "#9CA3AF" },
			{ c: "path", d: "M40 80h20M42 88h16", stroke: "#9CA3AF", w: 5 },
			{ c: "path", d: "M44 42c0-6 4-10 6-10s6 4 6 10", stroke: "#CA8A04", w: 4 },
		],
	},
	{
		id: "camera",
		name: "Camera",
		shapes: [
			{ c: "path", d: "M10 32h80v50H10z", fill: "#374151" },
			{ c: "path", d: "M34 22h32l6 10H28Z", fill: "#4B5563" },
			{ c: "circle", x: 50, y: 58, r: 18, fill: "#111827" },
			{ c: "circle", x: 50, y: 58, r: 10, fill: "#38BDF8" },
			{ c: "circle", x: 80, y: 42, r: 4, fill: "#FDE047" },
		],
	},
	{
		id: "book",
		name: "Book",
		shapes: [
			{ c: "path", d: "M14 18h32c4 0 4 4 4 4v60s0-4-4-4H14Z", fill: "#3B82F6" },
			{ c: "path", d: "M86 18H54c-4 0-4 4-4 4v60s0-4 4-4h32Z", fill: "#60A5FA" },
			{ c: "path", d: "M50 22v60", stroke: "#1E3A8A", w: 5 },
		],
	},
	{
		id: "umbrella",
		name: "Umbrella",
		shapes: [
			{ c: "path", d: "M8 52a42 42 0 0 1 84 0Z", fill: "#EF4444" },
			{ c: "path", d: "M50 52v28a10 10 0 0 1-20 0", stroke: "#78350F", w: 6 },
		],
	},
	{
		id: "gift",
		name: "Gift",
		shapes: [
			{ c: "path", d: "M14 40h72v46H14z", fill: "#EF4444" },
			{ c: "path", d: "M42 40h16v46H42z", fill: "#FDE047" },
			{ c: "path", d: "M14 40h72", stroke: "#B91C1C", w: 6 },
			{ c: "path", d: "M50 40c-14 0-22-6-22-14s14-4 22 14c8-18 22-22 22-14s-8 14-22 14Z", fill: "#FDE047" },
		],
	},
	{
		id: "clock",
		name: "Clock",
		shapes: [
			{ c: "circle", x: 50, y: 50, r: 38, fill: "#F3F4F6" },
			{ c: "circle", x: 50, y: 50, r: 38, stroke: "#374151", w: 6 },
			{ c: "path", d: "M50 26v26l18 10", stroke: "#111827", w: 6 },
		],
	},
	{
		id: "anchor",
		name: "Anchor",
		shapes: [
			{ c: "circle", x: 50, y: 18, r: 9, stroke: "#64748B", w: 7 },
			{ c: "path", d: "M50 32v54", stroke: "#64748B", w: 7 },
			{ c: "path", d: "M32 44h36", stroke: "#64748B", w: 7 },
			{ c: "path", d: "M18 60c0 18 14 28 32 28s32-10 32-28", stroke: "#64748B", w: 7 },
		],
	},
	{
		id: "glasses",
		name: "Glasses",
		shapes: [
			{ c: "circle", x: 28, y: 54, r: 17, stroke: "#111827", w: 6 },
			{ c: "circle", x: 72, y: 54, r: 17, stroke: "#111827", w: 6 },
			{ c: "path", d: "M45 52h10M11 48 4 42M89 48l7-6", stroke: "#111827", w: 6 },
		],
	},
	{
		id: "smiley",
		name: "Smiley",
		shapes: [
			{ c: "circle", x: 50, y: 50, r: 40, fill: "#FDE047" },
			{ c: "circle", x: 36, y: 42, r: 5, fill: "#1F2937" },
			{ c: "circle", x: 64, y: 42, r: 5, fill: "#1F2937" },
			{ c: "path", d: "M30 60c6 12 34 12 40 0", stroke: "#1F2937", w: 6 },
		],
	},
	{
		id: "skull",
		name: "Skull",
		shapes: [
			{ c: "path", d: "M50 10c22 0 34 16 34 34 0 12-6 18-6 24H22c0-6-6-12-6-24 0-18 12-34 34-34Z", fill: "#F3F4F6" },
			{ c: "circle", x: 36, y: 46, r: 9, fill: "#111827" },
			{ c: "circle", x: 64, y: 46, r: 9, fill: "#111827" },
			{ c: "path", d: "M30 68h40v14a6 6 0 0 1-6 6H36a6 6 0 0 1-6-6Z", fill: "#F3F4F6" },
			{ c: "path", d: "M42 68v20M58 68v20", stroke: "#9CA3AF", w: 4 },
		],
	},
	{
		id: "diamond",
		name: "Diamond",
		shapes: [
			{ c: "poly", pts: [50, 90, 8, 38, 26, 12, 74, 12, 92, 38], fill: "#22D3EE" },
			{ c: "path", d: "M26 12 38 38 50 90 62 38 74 12M8 38h84", stroke: "#0E7490", w: 3 },
		],
	},
	{
		id: "flag",
		name: "Flag",
		shapes: [
			{ c: "path", d: "M24 8v84", stroke: "#78350F", w: 7 },
			{ c: "path", d: "M28 14h56l-12 16 12 16H28Z", fill: "#EF4444" },
		],
	},
	{
		id: "snowflake",
		name: "Snowflake",
		shapes: [
			{ c: "path", d: "M50 6v88M12 28l76 44M88 28 12 72", stroke: "#7DD3FC", w: 7 },
			{ c: "path", d: "M38 16l12 10 12-10M38 84l12-10 12 10", stroke: "#7DD3FC", w: 5 },
		],
	},
	{
		id: "mountain",
		name: "Mountain",
		shapes: [
			{ c: "poly", pts: [4, 84, 38, 26, 62, 60, 72, 46, 96, 84], fill: "#64748B" },
			{ c: "poly", pts: [38, 26, 26, 46, 50, 46], fill: "#F8FAFC" },
			{ c: "poly", pts: [72, 46, 64, 58, 82, 58], fill: "#F8FAFC" },
		],
	},
	{
		id: "cactus",
		name: "Cactus",
		shapes: [
			{ c: "path", d: "M40 30h20v58H40z", fill: "#22C55E" },
			{ c: "path", d: "M40 46H26v18h14M60 40h14v22H60", stroke: "#22C55E", w: 12 },
			{ c: "path", d: "M30 88h40", stroke: "#B45309", w: 10 },
		],
	},
	{
		id: "planet",
		name: "Planet",
		shapes: [
			{ c: "circle", x: 50, y: 46, r: 26, fill: "#A78BFA" },
			{ c: "circle", x: 42, y: 38, r: 6, fill: "#8B5CF6" },
			{ c: "circle", x: 60, y: 54, r: 4, fill: "#8B5CF6" },
			{ c: "path", d: "M14 58c14 10 58 10 72 0", stroke: "#FBBF24", w: 6 },
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
			ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2);
			if (shape.fill) {
				ctx.fillStyle = shape.fill;
				ctx.fill();
			}
			if (shape.stroke) {
				ctx.strokeStyle = shape.stroke;
				ctx.lineWidth = shape.w ?? 4;
				ctx.stroke();
			}
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
				const fill = shape.fill ? `fill="${shape.fill}"` : `fill="none"`;
				const stroke = shape.stroke ? `stroke="${shape.stroke}" stroke-width="${shape.w ?? 4}"` : "";
				return `<circle cx="${shape.x}" cy="${shape.y}" r="${shape.r}" ${fill} ${stroke}/>`;
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
