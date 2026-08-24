import type { Route } from "./+types/draw-battle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DrawPad, ReplayCanvas, type DrawPadHandle, type Op } from "../components/DrawPad";
import { CATEGORY_LABELS, buildDeck, type PromptCategory } from "../lib/draw-battle-prompts";
import { downloadComposite } from "../lib/battle-export";
import { BattleHeader } from "../components/BattleHeader";

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "Draw Battle — ArtDrop Spot" },
		{
			name: "description",
			content:
				"Two players, one prompt, one clock. Draw head to head, replay both entries stroke by stroke, and vote for a winner.",
		},
	];
}

const COLORS = {
	bg: "#0A0A0A",
	bgPanel: "#1A1A1A",
	violet: "#FACC15",
	text: "#FFFFFF",
	textDim: "#9CA3AF",
	border: "#2E2E2E",
};

const PLAYER_TINTS = ["#FACC15", "#38BDF8"];

const PAD_THEME = {
	panel: COLORS.bgPanel,
	border: COLORS.border,
	text: COLORS.text,
	dim: COLORS.textDim,
	accent: COLORS.violet,
};

type Phase = "setup" | "handoff" | "draw" | "reveal" | "summary";

type RoundRecord = {
	round: number;
	prompt: string;
	entries: [Op[], Op[]];
	winner: 0 | 1 | -1;
};

const TIME_CHOICES = [60, 90, 120];
const ROUND_CHOICES = [1, 3, 5];
const ALL_CATEGORIES: PromptCategory[] = ["objects", "creatures", "scenes", "concepts"];

/* ------------------------------------------------------------------ *
 * Sound — short synthesised cues, no assets, off-switch remembered.
 * ------------------------------------------------------------------ */

function useSound() {
	const [muted, setMuted] = useState(false);
	const ctxRef = useRef<AudioContext | null>(null);

	useEffect(() => {
		try {
			setMuted(window.localStorage.getItem("drawBattleMuted") === "1");
		} catch {
			/* storage blocked — default to sound on */
		}
	}, []);

	const toggle = useCallback(() => {
		setMuted((m) => {
			const next = !m;
			try {
				window.localStorage.setItem("drawBattleMuted", next ? "1" : "0");
			} catch {
				/* ignore */
			}
			return next;
		});
	}, []);

	const play = useCallback(
		(freq: number, ms: number, type: OscillatorType = "sine", gain = 0.06) => {
			if (muted || typeof window === "undefined") return;
			try {
				const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
				if (!AC) return;
				if (!ctxRef.current) ctxRef.current = new AC();
				const ctx = ctxRef.current;
				if (ctx.state === "suspended") void ctx.resume();
				const osc = ctx.createOscillator();
				const vol = ctx.createGain();
				osc.type = type;
				osc.frequency.value = freq;
				vol.gain.setValueAtTime(gain, ctx.currentTime);
				vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
				osc.connect(vol).connect(ctx.destination);
				osc.start();
				osc.stop(ctx.currentTime + ms / 1000);
			} catch {
				/* audio unavailable — the game does not depend on it */
			}
		},
		[muted]
	);

	return { muted, toggle, play };
}

/* ------------------------------------------------------------------ *
 * Route
 * ------------------------------------------------------------------ */

export default function DrawBattle() {
	const [phase, setPhase] = useState<Phase>("setup");

	const [names, setNames] = useState(["Player 1", "Player 2"]);
	const [seconds, setSeconds] = useState(90);
	const [rounds, setRounds] = useState(3);
	const [categories, setCategories] = useState<PromptCategory[]>(["objects", "creatures"]);

	const [deck, setDeck] = useState<string[]>([]);
	const [round, setRound] = useState(1);
	const [scores, setScores] = useState<[number, number]>([0, 0]);
	const [prompt, setPrompt] = useState("");
	const [turn, setTurn] = useState<0 | 1>(0);
	const [entries, setEntries] = useState<[Op[] | null, Op[] | null]>([null, null]);
	const [history, setHistory] = useState<RoundRecord[]>([]);

	const [remaining, setRemaining] = useState(seconds);
	const [countdown, setCountdown] = useState(0);
	const [strokeCount, setStrokeCount] = useState(0);

	const [replayDone, setReplayDone] = useState(false);
	const [voted, setVoted] = useState<0 | 1 | -1 | null>(null);

	const padRef = useRef<DrawPadHandle>(null);
	const sound = useSound();

	const displayNames = useMemo(
		() => names.map((n, i) => (n.trim() ? n.trim() : `Player ${i + 1}`)),
		[names]
	);

	/* ---------------- match flow ---------------- */

	const drawPrompt = useCallback(
		(currentDeck: string[]): [string, string[]] => {
			const supply = currentDeck.length > 0 ? currentDeck : buildDeck(categories);
			const next = supply[supply.length - 1];
			return [next, supply.slice(0, -1)];
		},
		[categories]
	);

	function startMatch() {
		const fresh = buildDeck(categories);
		const [word, rest] = drawPrompt(fresh);
		setDeck(rest);
		setPrompt(word);
		setRound(1);
		setScores([0, 0]);
		setHistory([]);
		setEntries([null, null]);
		setTurn(0);
		setPhase("handoff");
	}

	function beginTurn() {
		padRef.current?.reset();
		setStrokeCount(0);
		setRemaining(seconds);
		setCountdown(3);
		setPhase("draw");
	}

	const finishTurn = useCallback(() => {
		const ops = padRef.current?.getOps() ?? [];
		sound.play(turn === 0 ? 520 : 640, 260, "triangle", 0.07);

		if (turn === 0) {
			setEntries([ops, null]);
			setTurn(1);
			setPhase("handoff");
		} else {
			setEntries((prev) => [prev[0], ops]);
			setReplayDone(false);
			setVoted(null);
			setPhase("reveal");
		}
	}, [turn, sound]);

	function castVote(winner: 0 | 1 | -1) {
		if (voted !== null) return;
		setVoted(winner);
		sound.play(winner === -1 ? 440 : 760, 420, "triangle", 0.08);

		const nextScores: [number, number] = [...scores] as [number, number];
		if (winner === -1) {
			nextScores[0] += 1;
			nextScores[1] += 1;
		} else {
			nextScores[winner] += 1;
		}
		setScores(nextScores);

		const [a, b] = entries;
		setHistory((h) => [...h, { round, prompt, entries: [a ?? [], b ?? []], winner }]);
	}

	function nextRound() {
		if (round >= rounds) {
			setPhase("summary");
			return;
		}
		const [word, rest] = drawPrompt(deck);
		setDeck(rest);
		setPrompt(word);
		setRound((r) => r + 1);
		setEntries([null, null]);
		setTurn(0);
		setPhase("handoff");
	}

	function playAgain() {
		setPhase("setup");
		setEntries([null, null]);
		setHistory([]);
		setScores([0, 0]);
		setRound(1);
	}

	/* ---------------- timers ---------------- */

	// "Ready, set, draw" gate — the prompt stays hidden until it hits zero.
	useEffect(() => {
		if (phase !== "draw" || countdown <= 0) return;
		sound.play(countdown === 1 ? 880 : 520, 160, "square", 0.05);
		const id = window.setTimeout(() => setCountdown((c) => c - 1), 800);
		return () => window.clearTimeout(id);
	}, [phase, countdown, sound]);

	useEffect(() => {
		if (phase !== "draw" || countdown > 0) return;
		const deadline = performance.now() + remaining * 1000;
		let raf = 0;

		const tick = () => {
			const left = Math.max(0, (deadline - performance.now()) / 1000);
			setRemaining(left);
			if (left <= 0) {
				finishTurn();
				return;
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
		// `remaining` is intentionally excluded: it is the tick's own output.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [phase, countdown, finishTurn]);

	// Final-ten-seconds ticks.
	const lastBeep = useRef(-1);
	useEffect(() => {
		if (phase !== "draw" || countdown > 0) {
			lastBeep.current = -1;
			return;
		}
		const whole = Math.ceil(remaining);
		if (whole <= 10 && whole > 0 && whole !== lastBeep.current) {
			lastBeep.current = whole;
			sound.play(whole <= 3 ? 900 : 700, 90, "square", 0.045);
		}
	}, [remaining, phase, countdown, sound]);

	/* ---------------- derived ---------------- */

	const matchLeader =
		scores[0] === scores[1] ? -1 : scores[0] > scores[1] ? 0 : 1;

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
			<style>{`
				@keyframes db-pop { 0% { transform: scale(.55); opacity: 0 } 60% { transform: scale(1.06); opacity: 1 } 100% { transform: scale(1); opacity: 1 } }
				@keyframes db-rise { from { transform: translateY(14px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
				@keyframes db-pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
				.db-rise { animation: db-rise 340ms cubic-bezier(.2,.7,.3,1) both; }
				@media (max-width: 900px) {
					.db-nav { flex-wrap: wrap !important; gap: 12px 18px !important; justify-content: center !important; }
					.db-duo { grid-template-columns: 1fr !important; }
					.db-hud { flex-direction: column !important; align-items: stretch !important; gap: 12px !important; }
					.db-title { font-size: 30px !important; }
				}
			`}</style>

			<BattleHeader />

			<main style={{ maxWidth: 1180, margin: "0 auto", padding: "34px 22px 80px" }}>
				{phase === "setup" && (
					<Setup
						names={names}
						setNames={setNames}
						seconds={seconds}
						setSeconds={setSeconds}
						rounds={rounds}
						setRounds={setRounds}
						categories={categories}
						setCategories={setCategories}
						onStart={startMatch}
					/>
				)}

				{phase !== "setup" && (
					<Scoreboard
						names={displayNames}
						scores={scores}
						round={round}
						rounds={rounds}
						muted={sound.muted}
						onToggleSound={sound.toggle}
					/>
				)}

				{phase === "handoff" && (
					<Handoff
						name={displayNames[turn]}
						tint={PLAYER_TINTS[turn]}
						second={turn === 1}
						round={round}
						rounds={rounds}
						seconds={seconds}
						onReady={beginTurn}
					/>
				)}

				{phase === "draw" && (
					<>
						<DrawHud
							prompt={prompt}
							hidden={countdown > 0}
							name={displayNames[turn]}
							tint={PLAYER_TINTS[turn]}
							remaining={remaining}
							total={seconds}
							strokes={strokeCount}
							onDone={() => {
								setRemaining(0);
								finishTurn();
							}}
						/>
						<div style={{ position: "relative" }}>
							<DrawPad
								ref={padRef}
								theme={PAD_THEME}
								frozen={countdown > 0}
								onStrokeCountChange={setStrokeCount}
							/>
							{countdown > 0 && <CountdownVeil value={countdown} tint={PLAYER_TINTS[turn]} />}
						</div>
					</>
				)}

				{phase === "reveal" && entries[0] && entries[1] && (
					<Reveal
						prompt={prompt}
						names={displayNames}
						entries={[entries[0], entries[1]]}
						replayDone={replayDone}
						onReplayDone={() => setReplayDone(true)}
						onSkip={() => setReplayDone(true)}
						voted={voted}
						onVote={castVote}
						onNext={nextRound}
						isLastRound={round >= rounds}
					/>
				)}

				{phase === "summary" && (
					<Summary
						names={displayNames}
						scores={scores}
						leader={matchLeader}
						history={history}
						onPlayAgain={playAgain}
					/>
				)}
			</main>
		</div>
	);
}

/* ------------------------------------------------------------------ *
 * Setup
 * ------------------------------------------------------------------ */

function Setup({
	names,
	setNames,
	seconds,
	setSeconds,
	rounds,
	setRounds,
	categories,
	setCategories,
	onStart,
}: {
	names: string[];
	setNames: (n: string[]) => void;
	seconds: number;
	setSeconds: (n: number) => void;
	rounds: number;
	setRounds: (n: number) => void;
	categories: PromptCategory[];
	setCategories: (c: PromptCategory[]) => void;
	onStart: () => void;
}) {
	function toggleCategory(c: PromptCategory) {
		setCategories(
			categories.includes(c)
				? categories.filter((x) => x !== c).length === 0
					? categories
					: categories.filter((x) => x !== c)
				: [...categories, c]
		);
	}

	return (
		<div className="db-rise">
			<section style={{ textAlign: "center", padding: "18px 0 40px" }}>
				<span
					style={{
						display: "inline-block",
						fontSize: 12,
						letterSpacing: "0.18em",
						textTransform: "uppercase",
						color: COLORS.violet,
						fontWeight: 700,
						marginBottom: 14,
					}}
				>
					Two players · one device
				</span>
				<h1
					className="db-title"
					style={{
						fontFamily: "'Archivo Black', sans-serif",
						fontSize: "clamp(34px, 6vw, 60px)",
						lineHeight: 1.04,
						margin: "0 0 16px",
						background: `linear-gradient(90deg, ${COLORS.text}, ${COLORS.violet})`,
						WebkitBackgroundClip: "text",
						WebkitTextFillColor: "transparent",
						backgroundClip: "text",
					}}
				>
					SAME WORD. SAME CLOCK.
					<br />
					ONE WINNER.
				</h1>
				<p style={{ color: COLORS.textDim, fontSize: 16, maxWidth: 540, margin: "0 auto", lineHeight: 1.65 }}>
					You both get the same secret prompt and the same countdown. When the second
					player's time is up, both drawings replay stroke by stroke — then somebody has
					to vote.
				</p>
			</section>

			<a
				href="/draw-battle/online"
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 18,
					flexWrap: "wrap",
					textDecoration: "none",
					color: "inherit",
					background: `linear-gradient(100deg, ${COLORS.bgPanel}, #16202b)`,
					border: `1px solid #2b3f52`,
					borderRadius: 16,
					padding: "20px 24px",
					marginBottom: 20,
				}}
			>
				<div>
					<div style={{ fontSize: 11.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "#38BDF8", fontWeight: 700 }}>
						Not in the same room?
					</div>
					<div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 20, margin: "6px 0 4px" }}>
						Play online instead
					</div>
					<div style={{ color: COLORS.textDim, fontSize: 13.5, lineHeight: 1.55, maxWidth: 520 }}>
						Both of you draw at the same time from anywhere, and anyone with the room
						link can watch live and vote on the winner.
					</div>
				</div>
				<span
					style={{
						background: "#38BDF8",
						color: "#0A0A0A",
						fontWeight: 800,
						fontSize: 14,
						padding: "12px 24px",
						borderRadius: 999,
						whiteSpace: "nowrap",
					}}
				>
					Create a room →
				</span>
			</a>

			<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
				<Panel title="The players">
					{[0, 1].map((i) => (
						<div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: i === 0 ? 12 : 0 }}>
							<span
								style={{
									width: 34,
									height: 34,
									borderRadius: 10,
									display: "grid",
									placeItems: "center",
									background: PLAYER_TINTS[i],
									color: "#0A0A0A",
									fontWeight: 800,
									fontSize: 14,
									flexShrink: 0,
								}}
							>
								{i + 1}
							</span>
							<input
								value={names[i]}
								maxLength={16}
								onChange={(e) => {
									const next = [...names];
									next[i] = e.target.value;
									setNames(next);
								}}
								placeholder={`Player ${i + 1}`}
								aria-label={`Player ${i + 1} name`}
								style={{
									flex: 1,
									padding: "11px 14px",
									borderRadius: 10,
									border: `1px solid ${COLORS.border}`,
									background: COLORS.bg,
									color: COLORS.text,
									fontFamily: "inherit",
									fontSize: 14,
								}}
							/>
						</div>
					))}
				</Panel>

				<Panel title="Time per drawing">
					<Segmented
						options={TIME_CHOICES.map((t) => ({ value: t, label: `${t}s` }))}
						value={seconds}
						onChange={setSeconds}
					/>
					<p style={hintStyle}>Each player gets the full clock, one after the other.</p>
				</Panel>

				<Panel title="Match length">
					<Segmented
						options={ROUND_CHOICES.map((r) => ({ value: r, label: r === 1 ? "Single" : `Best of ${r}` }))}
						value={rounds}
						onChange={setRounds}
					/>
					<p style={hintStyle}>A tie scores a point for both.</p>
				</Panel>

				<Panel title="Prompt pool">
					<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
						{ALL_CATEGORIES.map((c) => {
							const on = categories.includes(c);
							return (
								<button
									key={c}
									type="button"
									onClick={() => toggleCategory(c)}
									aria-pressed={on}
									style={{
										padding: "9px 15px",
										borderRadius: 999,
										fontSize: 13,
										fontWeight: 600,
										cursor: "pointer",
										fontFamily: "inherit",
										background: on ? COLORS.violet : "transparent",
										color: on ? "#0A0A0A" : COLORS.text,
										border: `1px solid ${on ? COLORS.violet : COLORS.border}`,
									}}
								>
									{CATEGORY_LABELS[c]}
								</button>
							);
						})}
					</div>
					<p style={hintStyle}>Concepts and Scenes are much harder to draw. You've been warned.</p>
				</Panel>
			</div>

			<div style={{ textAlign: "center", marginTop: 34 }}>
				<button type="button" onClick={onStart} style={ctaStyle}>
					START MATCH
				</button>
				<div
					style={{
						display: "flex",
						gap: 26,
						justifyContent: "center",
						flexWrap: "wrap",
						marginTop: 26,
						fontSize: 13.5,
						color: COLORS.textDim,
					}}
				>
					<span><b style={{ color: COLORS.text }}>1.</b> Player 1 draws alone</span>
					<span><b style={{ color: COLORS.text }}>2.</b> Pass the device</span>
					<span><b style={{ color: COLORS.text }}>3.</b> Player 2 gets the same word</span>
					<span><b style={{ color: COLORS.text }}>4.</b> Replay &amp; vote</span>
				</div>
			</div>
		</div>
	);
}

const hintStyle: React.CSSProperties = {
	margin: "14px 0 0",
	fontSize: 12.5,
	color: COLORS.textDim,
	lineHeight: 1.5,
};

const ctaStyle: React.CSSProperties = {
	background: COLORS.violet,
	color: "#0A0A0A",
	border: "none",
	fontFamily: "'Archivo Black', sans-serif",
	fontSize: 17,
	letterSpacing: 0.5,
	padding: "16px 42px",
	borderRadius: 999,
	cursor: "pointer",
	boxShadow: `0 12px 34px ${COLORS.violet}33`,
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section
			style={{
				background: COLORS.bgPanel,
				border: `1px solid ${COLORS.border}`,
				borderRadius: 16,
				padding: 22,
			}}
		>
			<h2
				style={{
					margin: "0 0 16px",
					fontSize: 11.5,
					letterSpacing: "0.14em",
					textTransform: "uppercase",
					color: COLORS.textDim,
					fontWeight: 700,
				}}
			>
				{title}
			</h2>
			{children}
		</section>
	);
}

function Segmented<T extends number | string>({
	options,
	value,
	onChange,
}: {
	options: { value: T; label: string }[];
	value: T;
	onChange: (v: T) => void;
}) {
	return (
		<div
			style={{
				display: "inline-flex",
				border: `1px solid ${COLORS.border}`,
				borderRadius: 11,
				overflow: "hidden",
				width: "100%",
			}}
		>
			{options.map((o) => {
				const on = o.value === value;
				return (
					<button
						key={String(o.value)}
						type="button"
						onClick={() => onChange(o.value)}
						aria-pressed={on}
						style={{
							flex: 1,
							padding: "11px 8px",
							border: "none",
							cursor: "pointer",
							fontFamily: "inherit",
							fontSize: 13.5,
							fontWeight: on ? 700 : 500,
							background: on ? COLORS.violet : "transparent",
							color: on ? "#0A0A0A" : COLORS.text,
						}}
					>
						{o.label}
					</button>
				);
			})}
		</div>
	);
}

/* ------------------------------------------------------------------ *
 * Scoreboard
 * ------------------------------------------------------------------ */

function Scoreboard({
	names,
	scores,
	round,
	rounds,
	muted,
	onToggleSound,
}: {
	names: string[];
	scores: [number, number];
	round: number;
	rounds: number;
	muted: boolean;
	onToggleSound: () => void;
}) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				gap: 14,
				flexWrap: "wrap",
				marginBottom: 24,
			}}
		>
			{[0, 1].map((i) => (
				<div
					key={i}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						padding: "8px 16px",
						borderRadius: 999,
						background: COLORS.bgPanel,
						border: `1px solid ${COLORS.border}`,
					}}
				>
					<span style={{ width: 8, height: 8, borderRadius: "50%", background: PLAYER_TINTS[i] }} />
					<span style={{ fontWeight: 600, fontSize: 14 }}>{names[i]}</span>
					<span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 16, color: PLAYER_TINTS[i] }}>
						{scores[i]}
					</span>
				</div>
			))}
			<span
				style={{
					padding: "8px 16px",
					borderRadius: 999,
					border: `1px solid ${COLORS.border}`,
					fontSize: 13,
					color: COLORS.textDim,
					fontWeight: 600,
				}}
			>
				Round {round} / {rounds}
			</span>
			<button
				type="button"
				onClick={onToggleSound}
				aria-label={muted ? "Unmute sound" : "Mute sound"}
				title={muted ? "Sound off" : "Sound on"}
				style={{
					width: 36,
					height: 36,
					borderRadius: "50%",
					background: "transparent",
					border: `1px solid ${COLORS.border}`,
					color: muted ? COLORS.textDim : COLORS.text,
					cursor: "pointer",
					display: "grid",
					placeItems: "center",
				}}
			>
				<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
					<path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
					{muted ? <path d="m16 9 5 6M21 9l-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />}
				</svg>
			</button>
		</div>
	);
}

/* ------------------------------------------------------------------ *
 * Handoff
 * ------------------------------------------------------------------ */

function Handoff({
	name,
	tint,
	second,
	round,
	rounds,
	seconds,
	onReady,
}: {
	name: string;
	tint: string;
	second: boolean;
	round: number;
	rounds: number;
	seconds: number;
	onReady: () => void;
}) {
	return (
		<div
			className="db-rise"
			style={{
				background: COLORS.bgPanel,
				border: `1px solid ${COLORS.border}`,
				borderRadius: 20,
				padding: "72px 32px",
				textAlign: "center",
				maxWidth: 660,
				margin: "0 auto",
			}}
		>
			<div style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: COLORS.textDim, marginBottom: 12 }}>
				Round {round} of {rounds}
			</div>
			<div
				style={{
					width: 62,
					height: 62,
					borderRadius: 18,
					background: tint,
					color: "#0A0A0A",
					display: "grid",
					placeItems: "center",
					margin: "0 auto 20px",
					fontFamily: "'Archivo Black', sans-serif",
					fontSize: 26,
				}}
			>
				{name.slice(0, 1).toUpperCase()}
			</div>
			<h2
				style={{
					fontFamily: "'Archivo Black', sans-serif",
					fontSize: "clamp(26px, 4.5vw, 38px)",
					margin: "0 0 14px",
				}}
			>
				{name}, you're up
			</h2>
			<p style={{ color: COLORS.textDim, maxWidth: 420, margin: "0 auto 30px", lineHeight: 1.65, fontSize: 15 }}>
				{second
					? "Hand the device over. Same word, same clock — and no peeking at what was just drawn."
					: "Make sure nobody else can see the screen. The prompt appears after a three-second countdown, and the clock starts with it."}
			</p>
			<button type="button" onClick={onReady} style={{ ...ctaStyle, background: tint }}>
				I'M READY — {seconds}s
			</button>
		</div>
	);
}

/* ------------------------------------------------------------------ *
 * Draw phase
 * ------------------------------------------------------------------ */

function DrawHud({
	prompt,
	hidden,
	name,
	tint,
	remaining,
	total,
	strokes,
	onDone,
}: {
	prompt: string;
	hidden: boolean;
	name: string;
	tint: string;
	remaining: number;
	total: number;
	strokes: number;
	onDone: () => void;
}) {
	const whole = Math.ceil(remaining);
	const frac = Math.max(0, Math.min(1, remaining / total));
	const R = 26;
	const CIRC = 2 * Math.PI * R;
	const low = remaining <= 10;

	return (
		<div
			className="db-hud"
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: 18,
				marginBottom: 16,
				flexWrap: "wrap",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
				<span
					style={{
						padding: "6px 13px",
						borderRadius: 999,
						background: tint,
						color: "#0A0A0A",
						fontWeight: 700,
						fontSize: 13,
						whiteSpace: "nowrap",
					}}
				>
					{name}
				</span>
				<div style={{ minWidth: 0 }}>
					<div style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: COLORS.textDim }}>
						Your prompt
					</div>
					<div
						style={{
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: "clamp(20px, 3.4vw, 32px)",
							lineHeight: 1.15,
							color: hidden ? "transparent" : COLORS.text,
							textShadow: hidden ? `0 0 22px ${COLORS.textDim}` : "none",
							userSelect: hidden ? "none" : "auto",
						}}
					>
						{hidden ? "•••••••" : prompt}
					</div>
				</div>
			</div>

			<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
				<span style={{ fontSize: 12.5, color: COLORS.textDim, whiteSpace: "nowrap" }}>
					{strokes} {strokes === 1 ? "stroke" : "strokes"}
				</span>
				<div style={{ position: "relative", width: 62, height: 62, flexShrink: 0 }}>
					<svg width="62" height="62" viewBox="0 0 62 62" style={{ transform: "rotate(-90deg)" }}>
						<circle cx="31" cy="31" r={R} fill="none" stroke={COLORS.border} strokeWidth="5" />
						<circle
							cx="31"
							cy="31"
							r={R}
							fill="none"
							stroke={low ? "#F87171" : COLORS.violet}
							strokeWidth="5"
							strokeLinecap="round"
							strokeDasharray={CIRC}
							strokeDashoffset={CIRC * (1 - frac)}
						/>
					</svg>
					<span
						style={{
							position: "absolute",
							inset: 0,
							display: "grid",
							placeItems: "center",
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: 19,
							color: low ? "#F87171" : COLORS.text,
							fontVariantNumeric: "tabular-nums",
							animation: low ? "db-pulse 1s ease-in-out infinite" : "none",
						}}
					>
						{whole}
					</span>
				</div>
				<button
					type="button"
					onClick={onDone}
					style={{
						padding: "12px 22px",
						borderRadius: 999,
						border: `1px solid ${COLORS.border}`,
						background: "transparent",
						color: COLORS.text,
						fontFamily: "inherit",
						fontWeight: 700,
						fontSize: 14,
						cursor: "pointer",
						whiteSpace: "nowrap",
					}}
				>
					I'm done
				</button>
			</div>
		</div>
	);
}

function CountdownVeil({ value, tint }: { value: number; tint: string }) {
	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				borderRadius: 16,
				background: "rgba(10,10,10,0.94)",
				display: "grid",
				placeItems: "center",
				zIndex: 20,
			}}
		>
			<div style={{ textAlign: "center" }}>
				<div
					key={value}
					style={{
						fontFamily: "'Archivo Black', sans-serif",
						fontSize: "clamp(70px, 16vw, 150px)",
						lineHeight: 1,
						color: tint,
						animation: "db-pop 340ms cubic-bezier(.2,.7,.3,1) both",
					}}
				>
					{value}
				</div>
				<div style={{ marginTop: 14, color: COLORS.textDim, letterSpacing: "0.2em", textTransform: "uppercase", fontSize: 12 }}>
					Get ready
				</div>
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ *
 * Reveal
 * ------------------------------------------------------------------ */

function Reveal({
	prompt,
	names,
	entries,
	replayDone,
	onReplayDone,
	onSkip,
	voted,
	onVote,
	onNext,
	isLastRound,
}: {
	prompt: string;
	names: string[];
	entries: [Op[], Op[]];
	replayDone: boolean;
	onReplayDone: () => void;
	onSkip: () => void;
	voted: 0 | 1 | -1 | null;
	onVote: (w: 0 | 1 | -1) => void;
	onNext: () => void;
	isLastRound: boolean;
}) {
	const finished = useRef(0);

	function handleOneDone() {
		finished.current += 1;
		if (finished.current >= 2) onReplayDone();
	}

	return (
		<div className="db-rise">
			<div style={{ textAlign: "center", marginBottom: 22 }}>
				<div style={{ fontSize: 11.5, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.textDim }}>
					Pencils down — the prompt was
				</div>
				<h2 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(26px, 5vw, 42px)", margin: "8px 0 0" }}>
					{prompt}
				</h2>
			</div>

			<div className="db-duo" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
				{[0, 1].map((i) => {
					const won = voted === i || voted === -1;
					return (
						<figure
							key={i}
							style={{
								margin: 0,
								borderRadius: 16,
								overflow: "hidden",
								background: COLORS.bgPanel,
								border: `1px solid ${voted !== null && won ? PLAYER_TINTS[i] : COLORS.border}`,
								boxShadow: voted !== null && won ? `0 0 0 2px ${PLAYER_TINTS[i]}55` : "none",
								transition: "border-color 200ms ease, box-shadow 200ms ease",
							}}
						>
							<figcaption
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									padding: "11px 16px",
									background: PLAYER_TINTS[i],
									color: "#0A0A0A",
									fontWeight: 800,
									fontSize: 14.5,
								}}
							>
								<span>{names[i]}</span>
								{voted !== null && (
									<span style={{ fontSize: 11.5, letterSpacing: "0.1em", textTransform: "uppercase" }}>
										{voted === -1 ? "Tie" : voted === i ? "Winner" : ""}
									</span>
								)}
							</figcaption>
							<ReplayCanvas ops={entries[i]} play={!replayDone} onDone={handleOneDone} />
							<div style={{ padding: "9px 16px", fontSize: 12, color: COLORS.textDim }}>
								{entries[i].length} {entries[i].length === 1 ? "stroke" : "strokes"}
							</div>
						</figure>
					);
				})}
			</div>

			{!replayDone && (
				<div style={{ textAlign: "center", marginTop: 22 }}>
					<button type="button" onClick={onSkip} style={ghostStyle}>
						Skip replay
					</button>
				</div>
			)}

			{replayDone && voted === null && (
				<div className="db-rise" style={{ marginTop: 26, textAlign: "center" }}>
					<p style={{ color: COLORS.textDim, fontSize: 14, margin: "0 0 16px" }}>
						Who drew it better?
					</p>
					<div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
						<button type="button" onClick={() => onVote(0)} style={{ ...voteStyle, background: PLAYER_TINTS[0] }}>
							{names[0]}
						</button>
						<button type="button" onClick={() => onVote(-1)} style={ghostStyle}>
							Too close to call
						</button>
						<button type="button" onClick={() => onVote(1)} style={{ ...voteStyle, background: PLAYER_TINTS[1] }}>
							{names[1]}
						</button>
					</div>
				</div>
			)}

			{voted !== null && (
				<div className="db-rise" style={{ marginTop: 26, textAlign: "center" }}>
					<p style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 20, margin: "0 0 18px" }}>
						{voted === -1 ? "Dead even — a point each." : `${names[voted]} takes the round.`}
					</p>
					<div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
						<button type="button" onClick={onNext} style={{ ...ctaStyle, fontSize: 15, padding: "14px 32px" }}>
							{isLastRound ? "SEE FINAL RESULT" : "NEXT ROUND"}
						</button>
						<button
							type="button"
							onClick={() => downloadComposite(prompt, names, entries, PLAYER_TINTS as [string, string])}
							style={ghostStyle}
						>
							Download this round
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

const voteStyle: React.CSSProperties = {
	border: "none",
	color: "#0A0A0A",
	fontFamily: "inherit",
	fontWeight: 800,
	fontSize: 15,
	padding: "14px 30px",
	borderRadius: 999,
	cursor: "pointer",
};

const ghostStyle: React.CSSProperties = {
	background: "transparent",
	border: `1px solid ${COLORS.border}`,
	color: COLORS.text,
	fontFamily: "inherit",
	fontWeight: 600,
	fontSize: 14,
	padding: "13px 26px",
	borderRadius: 999,
	cursor: "pointer",
};

/* ------------------------------------------------------------------ *
 * Summary
 * ------------------------------------------------------------------ */

function Summary({
	names,
	scores,
	leader,
	history,
	onPlayAgain,
}: {
	names: string[];
	scores: [number, number];
	leader: number;
	history: RoundRecord[];
	onPlayAgain: () => void;
}) {
	return (
		<div className="db-rise" style={{ position: "relative" }}>
			<Confetti active={leader !== -1} />

			<section
				style={{
					background: COLORS.bgPanel,
					border: `1px solid ${COLORS.border}`,
					borderRadius: 20,
					padding: "52px 32px",
					textAlign: "center",
					marginBottom: 28,
				}}
			>
				<div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.textDim, marginBottom: 14 }}>
					Final result
				</div>
				<h2
					style={{
						fontFamily: "'Archivo Black', sans-serif",
						fontSize: "clamp(30px, 6vw, 54px)",
						margin: "0 0 10px",
						color: leader === -1 ? COLORS.text : PLAYER_TINTS[leader],
					}}
				>
					{leader === -1 ? "IT'S A DRAW" : `${names[leader].toUpperCase()} WINS`}
				</h2>
				<p style={{ fontSize: 20, color: COLORS.textDim, margin: "0 0 30px", fontVariantNumeric: "tabular-nums" }}>
					{scores[0]} — {scores[1]}
				</p>
				<div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
					<button type="button" onClick={onPlayAgain} style={{ ...ctaStyle, fontSize: 15, padding: "14px 32px" }}>
						PLAY AGAIN
					</button>
					<a href="/upload" style={{ ...ghostStyle, display: "inline-block", textDecoration: "none" }}>
						Drop a winner in the gallery
					</a>
				</div>
			</section>

			<h3
				style={{
					fontFamily: "'Archivo Black', sans-serif",
					fontSize: 18,
					letterSpacing: 0.4,
					margin: "0 0 18px",
					textAlign: "center",
				}}
			>
				THE MATCH
			</h3>

			<div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
				{history.map((rec) => (
					<div
						key={rec.round}
						style={{
							background: COLORS.bgPanel,
							border: `1px solid ${COLORS.border}`,
							borderRadius: 16,
							padding: 18,
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "baseline",
								justifyContent: "space-between",
								gap: 12,
								marginBottom: 14,
								flexWrap: "wrap",
							}}
						>
							<div>
								<span style={{ fontSize: 11.5, letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.textDim }}>
									Round {rec.round}
								</span>
								<div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 20 }}>{rec.prompt}</div>
							</div>
							<button
								type="button"
								onClick={() => downloadComposite(rec.prompt, names, rec.entries, PLAYER_TINTS as [string, string])}
								style={{ ...ghostStyle, padding: "9px 18px", fontSize: 13 }}
							>
								Download
							</button>
						</div>
						<div className="db-duo" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
							{[0, 1].map((i) => {
								const won = rec.winner === i || rec.winner === -1;
								return (
									<div
										key={i}
										style={{
											borderRadius: 12,
											overflow: "hidden",
											border: `1px solid ${won ? PLAYER_TINTS[i] : COLORS.border}`,
										}}
									>
										<div
											style={{
												padding: "7px 12px",
												fontSize: 12.5,
												fontWeight: 700,
												background: won ? PLAYER_TINTS[i] : "transparent",
												color: won ? "#0A0A0A" : COLORS.textDim,
											}}
										>
											{names[i]}
											{rec.winner === i ? " · winner" : rec.winner === -1 ? " · tie" : ""}
										</div>
										<ReplayCanvas ops={rec.entries[i]} play={false} />
									</div>
								);
							})}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function Confetti({ active }: { active: boolean }) {
	const ref = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		if (!active) return;
		const canvas = ref.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const w = (canvas.width = canvas.offsetWidth);
		const h = (canvas.height = 420);
		const tints = [COLORS.violet, "#38BDF8", "#FFFFFF", "#F87171", "#34D399"];
		const bits = Array.from({ length: 110 }, () => ({
			x: Math.random() * w,
			y: -Math.random() * h,
			vx: (Math.random() - 0.5) * 1.6,
			vy: 2 + Math.random() * 3,
			s: 4 + Math.random() * 6,
			rot: Math.random() * Math.PI,
			vr: (Math.random() - 0.5) * 0.24,
			c: tints[Math.floor(Math.random() * tints.length)],
		}));

		const start = performance.now();
		let raf = 0;
		const step = () => {
			const t = performance.now() - start;
			ctx.clearRect(0, 0, w, h);
			for (const b of bits) {
				b.x += b.vx;
				b.y += b.vy;
				b.rot += b.vr;
				ctx.save();
				ctx.translate(b.x, b.y);
				ctx.rotate(b.rot);
				ctx.globalAlpha = Math.max(0, 1 - t / 2600);
				ctx.fillStyle = b.c;
				ctx.fillRect(-b.s / 2, -b.s / 2, b.s, b.s * 0.6);
				ctx.restore();
			}
			if (t < 2600) raf = requestAnimationFrame(step);
			else ctx.clearRect(0, 0, w, h);
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, [active]);

	if (!active) return null;
	return (
		<canvas
			ref={ref}
			aria-hidden
			style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 420, pointerEvents: "none", zIndex: 5 }}
		/>
	);
}
