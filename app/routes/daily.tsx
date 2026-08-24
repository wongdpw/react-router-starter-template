import type { Route } from "./+types/daily";
import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { BattleHeader } from "../components/BattleHeader";
import VoteButton from "../components/VoteButton";
import { DrawPad, opsToDataURL, type DrawPadHandle } from "../components/DrawPad";
import { formatDay, msUntilNextPrompt, previousKey, promptFor, todayKey } from "../lib/daily-prompts";

export function meta({ data }: Route.MetaArgs) {
	const prompt = data?.prompt ?? "Today's prompt";
	return [
		{ title: `Daily Prompt: ${prompt} — ArtDrop Spot` },
		{
			name: "description",
			content: `Today's drawing prompt is "${prompt}". Draw it in your browser, then vote on everyone else's.`,
		},
	];
}

const MAX_PNG_BYTES = 3 * 1024 * 1024;
const ENTRY_PREFIX = "daily-";
/** Kept off the entry prefix so it never shows up in a day's listing. */
const LOCK_PREFIX = "dailylock/";

function clientIp(request: Request): string {
	return (
		request.headers.get("CF-Connecting-IP") ??
		request.headers.get("X-Forwarded-For") ??
		"unknown"
	);
}

interface Entry {
	key: string;
	artist: string;
	votes: number;
	submittedAt: string;
}

async function listDay(bucket: R2Bucket, day: string): Promise<Entry[]> {
	const listed = await bucket.list({ prefix: `${ENTRY_PREFIX}${day}-`, include: ["customMetadata"] });
	return listed.objects
		.map((obj) => ({
			key: obj.key,
			artist: obj.customMetadata?.artist ?? "Anonymous",
			votes: parseInt(obj.customMetadata?.votes ?? "0", 10),
			submittedAt: obj.uploaded.toISOString(),
		}))
		.sort((a, b) => b.votes - a.votes || a.submittedAt.localeCompare(b.submittedAt));
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const bucket = context.cloudflare.env.ART_BUCKET;
	const day = todayKey();
	const yesterday = previousKey(day);

	const [entries, yesterdayEntries, lock] = await Promise.all([
		listDay(bucket, day),
		listDay(bucket, yesterday),
		bucket.head(`${LOCK_PREFIX}${day}/${clientIp(request)}.json`),
	]);

	return {
		day,
		prompt: promptFor(day),
		entries,
		alreadySubmitted: lock !== null,
		msLeft: msUntilNextPrompt(),
		yesterday: {
			day: yesterday,
			prompt: promptFor(yesterday),
			winner: yesterdayEntries[0] ?? null,
			count: yesterdayEntries.length,
		},
	};
}

export async function action({ request, context }: Route.ActionArgs) {
	const bucket = context.cloudflare.env.ART_BUCKET;
	const day = todayKey();
	const ip = clientIp(request);
	const lockKey = `${LOCK_PREFIX}${day}/${ip}.json`;

	// One entry per person per day, matching the rate-limit approach used
	// by the bulletin board.
	if (await bucket.head(lockKey)) {
		return { error: "You've already entered today. Come back tomorrow for a new prompt." };
	}

	const formData = await request.formData();
	const artist = (formData.get("artist") as string | null)?.trim() ?? "";
	const file = formData.get("artwork") as File | null;

	if (!artist) return { error: "Add a name so people know whose drawing it is." };
	if (artist.length > 30) return { error: "Name must be 30 characters or fewer." };
	if (!file || file.size === 0) return { error: "Draw something first." };
	if (file.type !== "image/png") return { error: "Something went wrong exporting your drawing." };
	if (file.size > MAX_PNG_BYTES) return { error: "That drawing is too large to submit." };

	const key = `${ENTRY_PREFIX}${day}-${crypto.randomUUID()}.png`;
	await bucket.put(key, file.stream(), {
		httpMetadata: { contentType: "image/png" },
		customMetadata: {
			// Deliberately not "approved": daily entries live on this page and
			// stay out of the main collection and Rising Stars unless an admin
			// promotes one.
			status: "daily",
			day,
			prompt: promptFor(day),
			artist,
			votes: "0",
		},
	});

	await bucket.put(lockKey, JSON.stringify({ at: Date.now(), key }), {
		httpMetadata: { contentType: "application/json" },
	});

	return { success: true, key };
}

const COLORS = {
	bg: "#0A0A0A",
	bgPanel: "#1A1A1A",
	accent: "#FACC15",
	orange: "#FB923C",
	text: "#FFFFFF",
	textDim: "#9CA3AF",
	border: "#2E2E2E",
	good: "#34D399",
	bad: "#F87171",
};

const PAD_THEME = {
	panel: COLORS.bgPanel,
	border: COLORS.border,
	text: COLORS.text,
	dim: COLORS.textDim,
	accent: COLORS.accent,
};

const NAME_KEY = "drawBattleName";

export default function Daily({ loaderData }: Route.ComponentProps) {
	const { day, prompt, entries, alreadySubmitted, msLeft, yesterday } = loaderData;
	const fetcher = useFetcher<typeof action>();
	const revalidator = useRevalidator();
	const padRef = useRef<DrawPadHandle>(null);

	const [artist, setArtist] = useState("");
	const [strokes, setStrokes] = useState(0);
	const [exporting, setExporting] = useState(false);
	const [localDone, setLocalDone] = useState(false);

	useEffect(() => {
		try {
			setArtist(window.localStorage.getItem(NAME_KEY) ?? "");
		} catch {
			/* storage blocked */
		}
	}, []);

	// A successful submit should show the gallery straight away.
	useEffect(() => {
		if (fetcher.data && "success" in fetcher.data && fetcher.data.success) {
			setLocalDone(true);
			revalidator.revalidate();
		}
	}, [fetcher.data, revalidator]);

	const done = alreadySubmitted || localDone;
	const submitting = fetcher.state !== "idle" || exporting;
	const error = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

	async function submit() {
		const ops = padRef.current?.getOps() ?? [];
		if (ops.length === 0 || !artist.trim()) return;

		setExporting(true);
		try {
			const dataUrl = opsToDataURL(ops);
			const blob = await (await fetch(dataUrl)).blob();
			try {
				window.localStorage.setItem(NAME_KEY, artist.trim());
			} catch {
				/* storage blocked */
			}
			const body = new FormData();
			body.append("artist", artist.trim());
			body.append("artwork", new File([blob], "daily.png", { type: "image/png" }));
			fetcher.submit(body, { method: "post", encType: "multipart/form-data" });
		} finally {
			setExporting(false);
		}
	}

	return (
		<div style={{ fontFamily: "'Inter', sans-serif", background: COLORS.bg, color: COLORS.text, minHeight: "100vh" }}>
			<link
				rel="stylesheet"
				href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700&display=swap"
			/>
			<style>{`
				@media (max-width: 900px) {
					.db-nav { flex-wrap: wrap !important; gap: 12px 18px !important; justify-content: center !important; }
					.dp-split { grid-template-columns: 1fr !important; }
					.dp-title { font-size: 30px !important; }
				}
			`}</style>

			<BattleHeader />

			<main style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 22px 80px" }}>
				<div style={{ marginBottom: 18 }}>
					<a href="/games" style={{ color: COLORS.textDim, textDecoration: "none", fontSize: 13.5, fontWeight: 600 }}>
						← All games
					</a>
				</div>

				<section style={{ textAlign: "center", marginBottom: 34 }}>
					<span
						style={{
							fontSize: 12,
							letterSpacing: "0.18em",
							textTransform: "uppercase",
							color: COLORS.orange,
							fontWeight: 700,
						}}
					>
						{formatDay(day)} · everyone gets the same prompt
					</span>
					<h1
						className="dp-title"
						style={{
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: "clamp(30px, 5.4vw, 54px)",
							lineHeight: 1.08,
							margin: "14px 0 14px",
						}}
					>
						{prompt}
					</h1>
					<p style={{ color: COLORS.textDim, fontSize: 14.5, margin: 0 }}>
						New prompt in <Countdown ms={msLeft} /> · {entries.length}{" "}
						{entries.length === 1 ? "entry" : "entries"} so far
					</p>
				</section>

				{!done ? (
					<section style={{ marginBottom: 44 }}>
						<DrawPad ref={padRef} theme={PAD_THEME} onStrokeCountChange={setStrokes} frozen={submitting} />

						{error && (
							<p
								role="alert"
								style={{
									background: "#2a1616",
									border: `1px solid ${COLORS.bad}`,
									color: COLORS.bad,
									borderRadius: 12,
									padding: "11px 16px",
									margin: "16px 0 0",
									fontSize: 14,
								}}
							>
								{error}
							</p>
						)}

						<div
							style={{
								display: "flex",
								gap: 12,
								alignItems: "center",
								flexWrap: "wrap",
								justifyContent: "center",
								marginTop: 18,
							}}
						>
							<input
								value={artist}
								maxLength={30}
								onChange={(e) => setArtist(e.target.value)}
								placeholder="Your name"
								aria-label="Your name"
								style={{
									padding: "13px 16px",
									borderRadius: 10,
									border: `1px solid ${COLORS.border}`,
									background: COLORS.bgPanel,
									color: COLORS.text,
									fontFamily: "inherit",
									fontSize: 14,
									width: 220,
								}}
							/>
							<button
								type="button"
								onClick={submit}
								disabled={submitting || strokes === 0 || !artist.trim()}
								style={{
									background: strokes > 0 && artist.trim() ? COLORS.orange : "transparent",
									color: strokes > 0 && artist.trim() ? "#0A0A0A" : COLORS.textDim,
									border: `1px solid ${strokes > 0 && artist.trim() ? COLORS.orange : COLORS.border}`,
									fontFamily: "'Archivo Black', sans-serif",
									fontSize: 15,
									padding: "14px 34px",
									borderRadius: 999,
									cursor: submitting || strokes === 0 || !artist.trim() ? "not-allowed" : "pointer",
								}}
							>
								{submitting ? "SUBMITTING…" : "SUBMIT ENTRY"}
							</button>
						</div>
						<p style={{ textAlign: "center", color: COLORS.textDim, fontSize: 12.5, marginTop: 12 }}>
							One entry each per day. You can vote on everyone else's once you've entered.
						</p>
					</section>
				) : (
					<p
						style={{
							textAlign: "center",
							background: COLORS.bgPanel,
							border: `1px solid ${COLORS.good}`,
							color: COLORS.good,
							borderRadius: 12,
							padding: "14px 18px",
							margin: "0 auto 36px",
							maxWidth: 460,
							fontWeight: 600,
							fontSize: 14.5,
						}}
					>
						You're in for today. Come back after midnight UTC for a new prompt.
					</p>
				)}

				<section>
					<h2
						style={{
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: 19,
							letterSpacing: 0.4,
							margin: "0 0 18px",
							textAlign: "center",
						}}
					>
						TODAY'S ENTRIES
					</h2>

					{entries.length === 0 ? (
						<p style={{ color: COLORS.textDim, textAlign: "center", fontSize: 14.5 }}>
							Nothing yet — be the first.
						</p>
					) : (
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 18 }}>
							{entries.map((entry, i) => (
								<figure
									key={entry.key}
									style={{
										margin: 0,
										borderRadius: 14,
										overflow: "hidden",
										background: COLORS.bgPanel,
										border: `1px solid ${i === 0 && entry.votes > 0 ? COLORS.accent : COLORS.border}`,
									}}
								>
									<img
										src={`/art/${entry.key}`}
										alt={`${prompt}, by ${entry.artist}`}
										loading="lazy"
										style={{ display: "block", width: "100%", height: "auto", background: "#fff" }}
									/>
									<figcaption
										style={{
											display: "flex",
											alignItems: "center",
											justifyContent: "space-between",
											gap: 8,
											padding: "10px 13px",
										}}
									>
										<span style={{ fontSize: 13.5, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
											{i === 0 && entry.votes > 0 ? "🏆 " : ""}
											{entry.artist}
										</span>
										<VoteButton itemKey={entry.key} initialVotes={entry.votes} />
									</figcaption>
								</figure>
							))}
						</div>
					)}
				</section>

				{yesterday.winner && (
					<section
						style={{
							marginTop: 48,
							background: COLORS.bgPanel,
							border: `1px solid ${COLORS.border}`,
							borderRadius: 18,
							padding: 24,
						}}
					>
						<h2
							style={{
								fontSize: 11.5,
								letterSpacing: "0.14em",
								textTransform: "uppercase",
								color: COLORS.textDim,
								fontWeight: 700,
								margin: "0 0 16px",
							}}
						>
							Yesterday's winner
						</h2>
						<div className="dp-split" style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20, alignItems: "center" }}>
							<img
								src={`/art/${yesterday.winner.key}`}
								alt={`${yesterday.prompt}, by ${yesterday.winner.artist}`}
								loading="lazy"
								style={{ display: "block", width: "100%", height: "auto", borderRadius: 10, background: "#fff" }}
							/>
							<div>
								<div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 22, marginBottom: 6 }}>
									{yesterday.prompt}
								</div>
								<p style={{ color: COLORS.textDim, fontSize: 14, margin: 0, lineHeight: 1.6 }}>
									<b style={{ color: COLORS.text }}>{yesterday.winner.artist}</b> took it with{" "}
									{yesterday.winner.votes} {yesterday.winner.votes === 1 ? "vote" : "votes"}, out of{" "}
									{yesterday.count} {yesterday.count === 1 ? "entry" : "entries"}.
								</p>
							</div>
						</div>
					</section>
				)}
			</main>
		</div>
	);
}

/** Counts down to the next UTC midnight without re-fetching the page. */
function Countdown({ ms }: { ms: number }) {
	const [left, setLeft] = useState(ms);

	useEffect(() => {
		setLeft(ms);
		const started = Date.now();
		const id = window.setInterval(() => setLeft(Math.max(0, ms - (Date.now() - started))), 1000);
		return () => window.clearInterval(id);
	}, [ms]);

	const total = Math.floor(left / 1000);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	return (
		<b style={{ color: "#FFFFFF", fontVariantNumeric: "tabular-nums" }}>
			{h}h {String(m).padStart(2, "0")}m
		</b>
	);
}
