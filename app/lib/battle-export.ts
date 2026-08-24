import { CANVAS_H, CANVAS_W, opsToDataURL, type Op } from "../components/DrawPad";

const BG = "#0A0A0A";
const ACCENT = "#FACC15";
const TEXT = "#FFFFFF";

/**
 * Flattens both entries into one branded side-by-side PNG and hands it to
 * the browser as a download.
 */
export function downloadComposite(
	prompt: string,
	names: string[],
	entries: [Op[], Op[]],
	tints: [string, string]
) {
	const GAP = 28;
	const PAD = 40;
	const BAR = 130;

	const out = document.createElement("canvas");
	out.width = CANVAS_W * 2 + GAP + PAD * 2;
	out.height = CANVAS_H + BAR + PAD * 2 + 60;

	const ctx = out.getContext("2d");
	if (!ctx) return;

	ctx.fillStyle = BG;
	ctx.fillRect(0, 0, out.width, out.height);

	ctx.textBaseline = "top";
	ctx.fillStyle = ACCENT;
	ctx.font = "600 26px Inter, system-ui, sans-serif";
	ctx.fillText("DRAW BATTLE · ARTDROPSPOT.COM", PAD, PAD);

	ctx.fillStyle = TEXT;
	ctx.font = "800 66px 'Archivo Black', Inter, system-ui, sans-serif";
	ctx.fillText(prompt, PAD, PAD + 40);

	const top = PAD + BAR;
	const place = (dataUrl: string, x: number, label: string, tint: string) =>
		new Promise<void>((resolve) => {
			const img = new Image();
			img.onload = () => {
				ctx.fillStyle = "#FFFFFF";
				ctx.fillRect(x, top, CANVAS_W, CANVAS_H);
				ctx.drawImage(img, x, top, CANVAS_W, CANVAS_H);
				ctx.fillStyle = tint;
				ctx.fillRect(x, top + CANVAS_H, CANVAS_W, 52);
				ctx.fillStyle = "#0A0A0A";
				ctx.font = "700 30px Inter, system-ui, sans-serif";
				ctx.fillText(label, x + 20, top + CANVAS_H + 11);
				resolve();
			};
			img.onerror = () => resolve();
			img.src = dataUrl;
		});

	void Promise.all([
		place(opsToDataURL(entries[0]), PAD, names[0], tints[0]),
		place(opsToDataURL(entries[1]), PAD + CANVAS_W + GAP, names[1], tints[1]),
	]).then(() => {
		const a = document.createElement("a");
		a.download = `draw-battle-${prompt.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
		a.href = out.toDataURL("image/png");
		a.click();
	});
}
