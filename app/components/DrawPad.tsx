import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";

/* ------------------------------------------------------------------ *
 * Model
 *
 * Artwork is stored as an ordered list of operations rather than as
 * pixels. That keeps undo/redo cheap, keeps memory flat, and — the
 * reason it matters for this game — lets the reveal screen replay a
 * drawing stroke by stroke.
 * ------------------------------------------------------------------ */

export type BrushTool = "pen" | "marker" | "pencil" | "eraser";
export type Tool = BrushTool | "fill";

export type StrokePoint = { x: number; y: number; p: number };

export type Op =
	| { kind: "stroke"; tool: BrushTool; color: string; size: number; pts: StrokePoint[] }
	| { kind: "fill"; color: string; x: number; y: number };

export const CANVAS_W = 1400;
export const CANVAS_H = 1000;
export const PAPER = "#FFFFFF";

const BRUSH_ALPHA: Record<BrushTool, number> = {
	pen: 1,
	marker: 0.34,
	pencil: 0.8,
	eraser: 1,
};

const BRUSH_WIDTH_SCALE: Record<BrushTool, number> = {
	pen: 1,
	marker: 2.4,
	pencil: 0.9,
	eraser: 2.2,
};

export const PALETTE = [
	"#111111",
	"#5B5B5B",
	"#9CA3AF",
	"#FFFFFF",
	"#E11D48",
	"#F97316",
	"#FACC15",
	"#84CC16",
	"#10B981",
	"#06B6D4",
	"#3B82F6",
	"#6366F1",
	"#A855F7",
	"#EC4899",
	"#92400E",
	"#065F46",
];

const SIZE_MIN = 2;
const SIZE_MAX = 64;

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function hexToRgb(hex: string): [number, number, number] {
	let h = hex.replace("#", "");
	if (h.length === 3) {
		h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
	}
	const n = parseInt(h, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Deterministic pseudo-random in [-1, 1] — pencil grain must replay identically. */
function jitter(seed: number): number {
	const s = Math.sin(seed * 12.9898) * 43758.5453;
	return (s - Math.floor(s)) * 2 - 1;
}

function widthAt(op: Extract<Op, { kind: "stroke" }>, pressure: number): number {
	const base = op.size * BRUSH_WIDTH_SCALE[op.tool];
	if (op.tool === "marker" || op.tool === "eraser") return base;
	// Pen and pencil taper with pressure / speed for an inked feel.
	return Math.max(0.6, base * (0.45 + 0.55 * pressure));
}

/**
 * Draws a stroke incrementally. The same renderer backs live drawing and
 * replay, so what a player sees while drawing is exactly what replays.
 */
function createStrokeRenderer(ctx: CanvasRenderingContext2D, op: Extract<Op, { kind: "stroke" }>) {
	let drawn = 0;
	let prevMidX = 0;
	let prevMidY = 0;

	const color = op.tool === "eraser" ? PAPER : op.color;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.strokeStyle = color;
	ctx.fillStyle = color;

	function grain(x: number, y: number, w: number, seed: number) {
		const spread = w * 0.5;
		for (let k = 0; k < 3; k++) {
			const jx = jitter(seed * 3 + k) * spread;
			const jy = jitter(seed * 3 + k + 0.5) * spread;
			ctx.globalAlpha = 0.55;
			ctx.beginPath();
			ctx.arc(x + jx, y + jy, Math.max(0.4, w * 0.22), 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
	}

	return {
		/** Render points up to (but not including) index `n`. */
		advanceTo(n: number) {
			const pts = op.pts;
			const limit = Math.min(n, pts.length);

			if (drawn === 0 && limit > 0) {
				const p0 = pts[0];
				prevMidX = p0.x;
				prevMidY = p0.y;
				const w = widthAt(op, p0.p);
				ctx.beginPath();
				ctx.arc(p0.x, p0.y, w / 2, 0, Math.PI * 2);
				ctx.fill();
				drawn = 1;
			}

			for (let i = Math.max(1, drawn); i < limit; i++) {
				const a = pts[i - 1];
				const b = pts[i];
				const midX = (a.x + b.x) / 2;
				const midY = (a.y + b.y) / 2;
				const w = widthAt(op, b.p);

				if (op.tool === "pencil") {
					const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
					for (let s = 0; s < steps; s++) {
						const t = s / steps;
						grain(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, w, i * 7 + s);
					}
				} else {
					ctx.lineWidth = w;
					ctx.beginPath();
					ctx.moveTo(prevMidX, prevMidY);
					ctx.quadraticCurveTo(a.x, a.y, midX, midY);
					ctx.stroke();
				}

				prevMidX = midX;
				prevMidY = midY;
				drawn = i + 1;
			}
		},
		get drawn() {
			return drawn;
		},
	};
}

function floodFill(ctx: CanvasRenderingContext2D, sx: number, sy: number, hex: string) {
	const w = ctx.canvas.width;
	const h = ctx.canvas.height;
	const x0 = Math.round(sx);
	const y0 = Math.round(sy);
	if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return;

	const img = ctx.getImageData(0, 0, w, h);
	const d = img.data;
	const head = (y0 * w + x0) * 4;
	const tr = d[head];
	const tg = d[head + 1];
	const tb = d[head + 2];
	const [fr, fg, fb] = hexToRgb(hex);

	if (Math.abs(tr - fr) < 4 && Math.abs(tg - fg) < 4 && Math.abs(tb - fb) < 4) return;

	const tol = 40 * 40 * 3;
	const matches = (i: number) => {
		const dr = d[i] - tr;
		const dg = d[i + 1] - tg;
		const db = d[i + 2] - tb;
		return dr * dr + dg * dg + db * db <= tol;
	};

	// Scanline flood fill — fast enough to feel instant at this canvas size.
	const stack: number[] = [x0, y0];
	while (stack.length > 0) {
		const y = stack.pop() as number;
		let x = stack.pop() as number;

		let i = (y * w + x) * 4;
		while (x >= 0 && matches(i)) {
			x--;
			i -= 4;
		}
		x++;
		i += 4;

		let spanUp = false;
		let spanDown = false;
		while (x < w && matches(i)) {
			d[i] = fr;
			d[i + 1] = fg;
			d[i + 2] = fb;
			d[i + 3] = 255;

			if (y > 0) {
				const up = i - w * 4;
				if (matches(up)) {
					if (!spanUp) {
						stack.push(x, y - 1);
						spanUp = true;
					}
				} else {
					spanUp = false;
				}
			}
			if (y < h - 1) {
				const down = i + w * 4;
				if (matches(down)) {
					if (!spanDown) {
						stack.push(x, y + 1);
						spanDown = true;
					}
				} else {
					spanDown = false;
				}
			}
			x++;
			i += 4;
		}
	}

	ctx.putImageData(img, 0, 0);
}

function makeLayer(): HTMLCanvasElement {
	const c = document.createElement("canvas");
	c.width = CANVAS_W;
	c.height = CANVAS_H;
	return c;
}

/** Paints one committed op onto `ctx`, honouring per-brush translucency. */
function commitOp(ctx: CanvasRenderingContext2D, op: Op, scratch: HTMLCanvasElement) {
	if (op.kind === "fill") {
		floodFill(ctx, op.x, op.y, op.color);
		return;
	}

	const alpha = BRUSH_ALPHA[op.tool];
	if (alpha >= 1) {
		createStrokeRenderer(ctx, op).advanceTo(op.pts.length);
		return;
	}

	// Translucent brushes are built at full opacity on a scratch layer and
	// flattened once, so a stroke that crosses itself doesn't blotch.
	const sctx = scratch.getContext("2d");
	if (!sctx) return;
	sctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
	createStrokeRenderer(sctx, op).advanceTo(op.pts.length);
	ctx.save();
	ctx.globalAlpha = alpha;
	ctx.drawImage(scratch, 0, 0);
	ctx.restore();
}

/** Renders `ops` (optionally a prefix) onto a blank sheet. */
export function renderOps(ctx: CanvasRenderingContext2D, ops: Op[], scratch: HTMLCanvasElement) {
	ctx.save();
	ctx.globalAlpha = 1;
	ctx.fillStyle = PAPER;
	ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
	ctx.restore();
	for (const op of ops) {
		commitOp(ctx, op, scratch);
	}
}

/* ------------------------------------------------------------------ *
 * Replay canvas — used on the reveal screen
 * ------------------------------------------------------------------ */

/** Total points across all ops; fills count as a chunk of "work". */
function opWeight(ops: Op[]): number {
	return ops.reduce((sum, op) => sum + (op.kind === "fill" ? 12 : op.pts.length), 0);
}

export function ReplayCanvas({
	ops,
	durationMs = 3400,
	play,
	style,
	onDone,
}: {
	ops: Op[];
	durationMs?: number;
	play: boolean;
	style?: React.CSSProperties;
	onDone?: () => void;
}) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const scratchRef = useRef<HTMLCanvasElement | null>(null);
	const frameRef = useRef<number | null>(null);
	const doneRef = useRef(onDone);
	doneRef.current = onDone;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		if (!scratchRef.current) scratchRef.current = makeLayer();
		const scratch = scratchRef.current;

		if (!play) {
			renderOps(ctx, ops, scratch);
			return;
		}

		const total = Math.max(1, opWeight(ops));
		const start = performance.now();
		let finished = false;

		const step = () => {
			const t = Math.min(1, (performance.now() - start) / durationMs);
			// Ease-out so the drawing lands rather than stopping dead.
			const eased = 1 - Math.pow(1 - t, 2);
			let budget = eased * total;

			ctx.save();
			ctx.globalAlpha = 1;
			ctx.fillStyle = PAPER;
			ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
			ctx.restore();

			for (const op of ops) {
				if (budget <= 0) break;
				const weight = op.kind === "fill" ? 12 : op.pts.length;
				if (budget >= weight) {
					commitOp(ctx, op, scratch);
					budget -= weight;
				} else if (op.kind === "stroke") {
					const partial: Op = { ...op, pts: op.pts.slice(0, Math.ceil(budget)) };
					commitOp(ctx, partial, scratch);
					budget = 0;
				} else {
					budget = 0;
				}
			}

			if (t < 1) {
				frameRef.current = requestAnimationFrame(step);
			} else if (!finished) {
				finished = true;
				doneRef.current?.();
			}
		};

		frameRef.current = requestAnimationFrame(step);
		return () => {
			if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
		};
	}, [ops, play, durationMs]);

	return (
		<canvas
			ref={canvasRef}
			width={CANVAS_W}
			height={CANVAS_H}
			style={{ display: "block", width: "100%", height: "auto", background: PAPER, ...style }}
		/>
	);
}

/** Flattens ops to a PNG data URL without needing a mounted canvas. */
export function opsToDataURL(ops: Op[]): string {
	const layer = makeLayer();
	const ctx = layer.getContext("2d");
	if (!ctx) return "";
	renderOps(ctx, ops, makeLayer());
	return layer.toDataURL("image/png");
}

/* ------------------------------------------------------------------ *
 * DrawPad
 * ------------------------------------------------------------------ */

export interface DrawPadHandle {
	getOps(): Op[];
	reset(): void;
}

type Theme = { panel: string; border: string; text: string; dim: string; accent: string };

export const DrawPad = forwardRef<
	DrawPadHandle,
	{
		theme: Theme;
		frozen?: boolean;
		onStrokeCountChange?: (n: number) => void;
		/** Fires once per committed op — used to relay strokes to spectators. */
		onCommit?: (op: Op) => void;
		/**
		 * Immutable artwork drawn underneath this player's own strokes — a
		 * shared canvas everyone adds to. It renders but cannot be undone or
		 * cleared, and `getOps` never returns it.
		 */
		baseOps?: Op[];
	}
>(function DrawPad({ theme, frozen = false, onStrokeCountChange, onCommit, baseOps }, ref) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const liveRef = useRef<HTMLCanvasElement | null>(null);

	const baseLayer = useRef<HTMLCanvasElement | null>(null);
	const scratch = useRef<HTMLCanvasElement | null>(null);

	const ops = useRef<Op[]>([]);
	const redo = useRef<Op[]>([]);
	const current = useRef<Extract<Op, { kind: "stroke" }> | null>(null);
	const renderer = useRef<ReturnType<typeof createStrokeRenderer> | null>(null);
	const lastMove = useRef<{ x: number; y: number; t: number } | null>(null);
	const smoothed = useRef(0.5);
	const pointerId = useRef<number | null>(null);

	const [tool, setTool] = useState<Tool>("pen");
	const [color, setColor] = useState(PALETTE[0]);
	const [size, setSize] = useState(8);
	const [counts, setCounts] = useState({ ops: 0, redo: 0 });

	const frozenRef = useRef(frozen);
	frozenRef.current = frozen;
	const toolRef = useRef(tool);
	toolRef.current = tool;
	const colorRef = useRef(color);
	colorRef.current = color;
	const sizeRef = useRef(size);
	sizeRef.current = size;
	const onCommitRef = useRef(onCommit);
	onCommitRef.current = onCommit;
	const baseOpsRef = useRef<Op[]>(baseOps ?? []);

	const syncCounts = useCallback(() => {
		setCounts({ ops: ops.current.length, redo: redo.current.length });
		onStrokeCountChange?.(ops.current.length);
	}, [onStrokeCountChange]);

	/** Repaints the committed layer onto the visible canvas. */
	const paint = useCallback(() => {
		const canvas = canvasRef.current;
		const base = baseLayer.current;
		if (!canvas || !base) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
		ctx.drawImage(base, 0, 0);
	}, []);

	const rebuild = useCallback(() => {
		const base = baseLayer.current;
		const s = scratch.current;
		if (!base || !s) return;
		const bctx = base.getContext("2d");
		if (!bctx) return;
		renderOps(bctx, [...baseOpsRef.current, ...ops.current], s);
		paint();
	}, [paint]);

	useEffect(() => {
		baseLayer.current = makeLayer();
		scratch.current = makeLayer();
		const bctx = baseLayer.current.getContext("2d");
		if (bctx) {
			bctx.fillStyle = PAPER;
			bctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
		}
		rebuild();
	}, [rebuild]);

	// A new shared canvas arrives (someone else drew) — repaint underneath.
	useEffect(() => {
		baseOpsRef.current = baseOps ?? [];
		rebuild();
	}, [baseOps, rebuild]);

	useImperativeHandle(
		ref,
		() => ({
			getOps: () => ops.current.map((op) => (op.kind === "stroke" ? { ...op, pts: [...op.pts] } : { ...op })),
			reset: () => {
				ops.current = [];
				redo.current = [];
				current.current = null;
				renderer.current = null;
				rebuild();
				syncCounts();
			},
		}),
		[rebuild, syncCounts]
	);

	function toCanvas(e: React.PointerEvent<HTMLCanvasElement>) {
		const canvas = canvasRef.current;
		if (!canvas) return { x: 0, y: 0 };
		const r = canvas.getBoundingClientRect();
		return {
			x: ((e.clientX - r.left) / r.width) * CANVAS_W,
			y: ((e.clientY - r.top) / r.height) * CANVAS_H,
		};
	}

	/**
	 * Pen hardware reports real pressure. For a mouse or finger we synthesise
	 * it from stroke speed — fast strokes thin out, which is what makes the
	 * line look drawn rather than plotted.
	 */
	function pressureFor(e: React.PointerEvent<HTMLCanvasElement>, x: number, y: number): number {
		if (e.pointerType === "pen" && e.pressure > 0 && e.pressure < 1) {
			smoothed.current = smoothed.current * 0.4 + e.pressure * 0.6;
			return smoothed.current;
		}
		const now = performance.now();
		const prev = lastMove.current;
		lastMove.current = { x, y, t: now };
		if (!prev) return smoothed.current;
		const dt = Math.max(1, now - prev.t);
		const speed = Math.hypot(x - prev.x, y - prev.y) / dt;
		const target = Math.max(0.35, Math.min(1, 1 - speed / 4));
		smoothed.current = smoothed.current * 0.7 + target * 0.3;
		return smoothed.current;
	}

	function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
		if (frozenRef.current || pointerId.current !== null) return;
		if (e.button !== undefined && e.button !== 0) return;
		const { x, y } = toCanvas(e);

		if (toolRef.current === "fill") {
			const base = baseLayer.current;
			const s = scratch.current;
			if (!base || !s) return;
			const bctx = base.getContext("2d");
			if (!bctx) return;
			const op: Op = { kind: "fill", color: colorRef.current, x, y };
			commitOp(bctx, op, s);
			ops.current.push(op);
			redo.current = [];
			paint();
			syncCounts();
			onCommitRef.current?.(op);
			return;
		}

		e.currentTarget.setPointerCapture(e.pointerId);
		pointerId.current = e.pointerId;
		lastMove.current = null;
		smoothed.current = 0.75;

		const op: Extract<Op, { kind: "stroke" }> = {
			kind: "stroke",
			tool: toolRef.current as BrushTool,
			color: colorRef.current,
			size: sizeRef.current,
			pts: [{ x, y, p: pressureFor(e, x, y) }],
		};
		current.current = op;

		const live = liveRef.current;
		const lctx = live?.getContext("2d");
		if (!lctx) return;
		lctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
		live!.style.opacity = String(BRUSH_ALPHA[op.tool]);
		renderer.current = createStrokeRenderer(lctx, op);
		renderer.current.advanceTo(1);
	}

	function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
		const op = current.current;
		if (!op || pointerId.current !== e.pointerId) return;
		e.preventDefault();

		// Coalesced events keep fast strokes smooth on high-rate pointers.
		const events =
			typeof e.nativeEvent.getCoalescedEvents === "function"
				? e.nativeEvent.getCoalescedEvents()
				: [e.nativeEvent];

		for (const raw of events.length > 0 ? events : [e.nativeEvent]) {
			const canvas = canvasRef.current;
			if (!canvas) break;
			const r = canvas.getBoundingClientRect();
			const x = ((raw.clientX - r.left) / r.width) * CANVAS_W;
			const y = ((raw.clientY - r.top) / r.height) * CANVAS_H;
			const last = op.pts[op.pts.length - 1];
			if (Math.hypot(x - last.x, y - last.y) < 1.1) continue;
			op.pts.push({
				x,
				y,
				p: pressureFor({ ...e, pointerType: raw.pointerType, pressure: raw.pressure } as React.PointerEvent<HTMLCanvasElement>, x, y),
			});
		}

		renderer.current?.advanceTo(op.pts.length);
	}

	function endStroke() {
		const op = current.current;
		current.current = null;
		renderer.current = null;
		pointerId.current = null;

		const live = liveRef.current;
		const lctx = live?.getContext("2d");
		if (lctx) lctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
		if (!op || op.pts.length === 0) return;

		const base = baseLayer.current;
		const s = scratch.current;
		if (!base || !s) return;
		const bctx = base.getContext("2d");
		if (!bctx) return;

		commitOp(bctx, op, s);
		ops.current.push(op);
		redo.current = [];
		paint();
		syncCounts();
		onCommitRef.current?.(op);
	}

	function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
		if (pointerId.current !== e.pointerId) return;
		endStroke();
	}

	const undo = useCallback(() => {
		const op = ops.current.pop();
		if (!op) return;
		redo.current.push(op);
		rebuild();
		syncCounts();
	}, [rebuild, syncCounts]);

	const redoOne = useCallback(() => {
		const op = redo.current.pop();
		if (!op) return;
		ops.current.push(op);
		rebuild();
		syncCounts();
	}, [rebuild, syncCounts]);

	const clearAll = useCallback(() => {
		if (ops.current.length === 0) return;
		redo.current = [...ops.current].reverse().concat(redo.current);
		ops.current = [];
		rebuild();
		syncCounts();
	}, [rebuild, syncCounts]);

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (frozenRef.current) return;
			const target = e.target as HTMLElement | null;
			if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

			const meta = e.ctrlKey || e.metaKey;
			if (meta && e.key.toLowerCase() === "z") {
				e.preventDefault();
				if (e.shiftKey) redoOne();
				else undo();
				return;
			}
			if (meta && e.key.toLowerCase() === "y") {
				e.preventDefault();
				redoOne();
				return;
			}
			if (meta) return;

			const map: Record<string, Tool> = { b: "pen", m: "marker", p: "pencil", e: "eraser", g: "fill" };
			const next = map[e.key.toLowerCase()];
			if (next) {
				e.preventDefault();
				setTool(next);
				return;
			}
			if (e.key === "[") {
				e.preventDefault();
				setSize((s) => Math.max(SIZE_MIN, s - 2));
			}
			if (e.key === "]") {
				e.preventDefault();
				setSize((s) => Math.min(SIZE_MAX, s + 2));
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [undo, redoOne]);

	const swatchColor = tool === "eraser" ? PAPER : color;

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
			<div
				style={{
					position: "relative",
					borderRadius: 16,
					padding: 10,
					background: theme.panel,
					border: `1px solid ${theme.border}`,
					boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
				}}
			>
				<div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: PAPER }}>
					<canvas
						ref={canvasRef}
						width={CANVAS_W}
						height={CANVAS_H}
						style={{ display: "block", width: "100%", height: "auto", background: PAPER }}
					/>
					<canvas
						ref={liveRef}
						width={CANVAS_W}
						height={CANVAS_H}
						onPointerDown={onPointerDown}
						onPointerMove={onPointerMove}
						onPointerUp={onPointerUp}
						onPointerCancel={onPointerUp}
						style={{
							position: "absolute",
							inset: 0,
							width: "100%",
							height: "100%",
							touchAction: "none",
							cursor: frozen ? "not-allowed" : tool === "fill" ? "cell" : "crosshair",
						}}
					/>
				</div>
			</div>

			{/* Toolbar */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 18,
					flexWrap: "wrap",
					background: theme.panel,
					border: `1px solid ${theme.border}`,
					borderRadius: 14,
					padding: "12px 16px",
				}}
			>
				<div style={{ display: "flex", gap: 6 }}>
					<ToolButton label="Pen" hint="B" active={tool === "pen"} theme={theme} onClick={() => setTool("pen")}>
						<path d="M4 20l3.5-1 9-9-2.5-2.5-9 9L4 20Z" />
						<path d="M15.5 5.5 18 8l1.6-1.6a1.8 1.8 0 0 0 0-2.5l-.1-.1a1.8 1.8 0 0 0-2.5 0L15.5 5.5Z" />
					</ToolButton>
					<ToolButton label="Marker" hint="M" active={tool === "marker"} theme={theme} onClick={() => setTool("marker")}>
						<path d="M14 4l6 6-7.5 7.5H8v-1.5L14 4Z" />
						<path d="M5 20h14" strokeWidth="2.4" />
					</ToolButton>
					<ToolButton label="Pencil" hint="P" active={tool === "pencil"} theme={theme} onClick={() => setTool("pencil")}>
						<path d="M5 19l1-4L17 4l3 3L9 18l-4 1Z" />
						<path d="M15 6l3 3" />
					</ToolButton>
					<ToolButton label="Eraser" hint="E" active={tool === "eraser"} theme={theme} onClick={() => setTool("eraser")}>
						<path d="M8 19h11" strokeWidth="2.2" />
						<path d="M6 16.5 13 9.5a2 2 0 0 1 2.8 0l2.7 2.7a2 2 0 0 1 0 2.8L14.5 19h-4L6 16.5Z" />
					</ToolButton>
					<ToolButton label="Fill" hint="G" active={tool === "fill"} theme={theme} onClick={() => setTool("fill")}>
						<path d="M11 3.5 4.8 9.7a1.6 1.6 0 0 0 0 2.3l5.2 5.2a1.6 1.6 0 0 0 2.3 0l5.4-5.4L11 3.5Z" />
						<path d="M20 15.5s1.7 2 1.7 3.1A1.7 1.7 0 0 1 20 20.3a1.7 1.7 0 0 1-1.7-1.7c0-1.1 1.7-3.1 1.7-3.1Z" />
					</ToolButton>
				</div>

				<Divider theme={theme} />

				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<div
						aria-hidden
						style={{
							width: 34,
							height: 34,
							borderRadius: "50%",
							display: "grid",
							placeItems: "center",
							background: PAPER,
							border: `1px solid ${theme.border}`,
							flexShrink: 0,
						}}
					>
						<span
							style={{
								display: "block",
								borderRadius: "50%",
								background: swatchColor,
								border: swatchColor === PAPER ? "1px solid #D4D4D8" : "none",
								width: Math.max(3, Math.min(26, size * BRUSH_WIDTH_SCALE[tool === "fill" ? "pen" : tool] * 0.5)),
								height: Math.max(3, Math.min(26, size * BRUSH_WIDTH_SCALE[tool === "fill" ? "pen" : tool] * 0.5)),
								opacity: tool === "fill" ? 1 : BRUSH_ALPHA[tool],
							}}
						/>
					</div>
					<input
						type="range"
						min={SIZE_MIN}
						max={SIZE_MAX}
						value={size}
						onChange={(e) => setSize(Number(e.target.value))}
						aria-label="Brush size"
						style={{ width: 110, accentColor: theme.accent, cursor: "pointer" }}
					/>
				</div>

				<Divider theme={theme} />

				<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(8, 22px)", gap: 6 }}>
						{PALETTE.map((c) => {
							const active = color === c && tool !== "eraser";
							return (
								<button
									key={c}
									type="button"
									aria-label={`Colour ${c}`}
									onClick={() => {
										setColor(c);
										if (tool === "eraser") setTool("pen");
									}}
									style={{
										width: 22,
										height: 22,
										borderRadius: 7,
										background: c,
										cursor: "pointer",
										padding: 0,
										border: active ? `2px solid ${theme.accent}` : `1px solid ${theme.border}`,
										boxShadow: active ? `0 0 0 2px ${theme.accent}33` : "none",
									}}
								/>
							);
						})}
					</div>
					<label
						title="Custom colour"
						style={{
							width: 26,
							height: 26,
							borderRadius: 8,
							border: `1px solid ${theme.border}`,
							display: "grid",
							placeItems: "center",
							cursor: "pointer",
							overflow: "hidden",
							background: "conic-gradient(#e11d48,#facc15,#10b981,#3b82f6,#a855f7,#e11d48)",
						}}
					>
						<input
							type="color"
							value={color}
							onChange={(e) => {
								setColor(e.target.value);
								if (tool === "eraser") setTool("pen");
							}}
							style={{ opacity: 0, width: 26, height: 26, cursor: "pointer" }}
						/>
					</label>
				</div>

				<div style={{ flex: 1 }} />

				<div style={{ display: "flex", gap: 6 }}>
					<ToolButton label="Undo" hint="Ctrl+Z" theme={theme} disabled={frozen || counts.ops === 0} onClick={undo}>
						<path d="M9 14 4 9l5-5" />
						<path d="M4 9h10a6 6 0 0 1 0 12h-3" />
					</ToolButton>
					<ToolButton label="Redo" hint="Ctrl+Shift+Z" theme={theme} disabled={frozen || counts.redo === 0} onClick={redoOne}>
						<path d="m15 14 5-5-5-5" />
						<path d="M20 9H10a6 6 0 0 0 0 12h3" />
					</ToolButton>
					<ToolButton label="Clear" theme={theme} danger disabled={frozen || counts.ops === 0} onClick={clearAll}>
						<path d="M4 7h16" />
						<path d="M9 7V5h6v2" />
						<path d="M6 7l1 13h10l1-13" />
					</ToolButton>
				</div>
			</div>
		</div>
	);
});

function Divider({ theme }: { theme: Theme }) {
	return <span style={{ width: 1, alignSelf: "stretch", background: theme.border, minHeight: 30 }} />;
}

function ToolButton({
	children,
	label,
	hint,
	active,
	danger,
	disabled,
	theme,
	onClick,
}: {
	children: React.ReactNode;
	label: string;
	hint?: string;
	active?: boolean;
	danger?: boolean;
	disabled?: boolean;
	theme: Theme;
	onClick: () => void;
}) {
	const [hover, setHover] = useState(false);
	const tint = danger ? "#F87171" : theme.accent;

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			onPointerEnter={() => setHover(true)}
			onPointerLeave={() => setHover(false)}
			title={hint ? `${label} (${hint})` : label}
			aria-label={label}
			aria-pressed={active}
			style={{
				position: "relative",
				width: 38,
				height: 38,
				display: "grid",
				placeItems: "center",
				borderRadius: 10,
				cursor: disabled ? "not-allowed" : "pointer",
				background: active ? tint : hover && !disabled ? "rgba(255,255,255,0.06)" : "transparent",
				border: `1px solid ${active ? tint : theme.border}`,
				color: active ? "#0A0A0A" : disabled ? "#4B5563" : theme.text,
				opacity: disabled ? 0.45 : 1,
				transition: "background 120ms ease, border-color 120ms ease",
			}}
		>
			<svg
				width="21"
				height="21"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				{children}
			</svg>
		</button>
	);
}
