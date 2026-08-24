import type { Route } from "./+types/guess.room.$code";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { DrawPad, ReplayCanvas, type DrawPadHandle, type Op } from "../components/DrawPad";
import { BattleHeader } from "../components/BattleHeader";
import { isValidRoomCode } from "../lib/room-code";
import { packOps, unpackOps } from "../lib/drawing-codec";
import {
	DRAW_SECONDS_CHOICES,
	MAX_CHAT_LEN,
	MIN_PLAYERS,
	ROUND_CHOICES,
	type ChatEntry,
	type GuessState,
} from "../lib/guess-protocol";
import { DIFFICULTY_LABELS, type GuessDifficulty } from "../lib/guess-words";
import { useGuessRoom } from "../lib/useGuessRoom";

export function meta({ params }: Route.MetaArgs) {
	return [
		{ title: `Room ${params.code?.toUpperCase() ?? ""} — Guess the Drawing` },
		{ name: "robots", content: "noindex" },
	];
}

const COLORS = {
	bg: "#0A0A0A",
	bgPanel: "#1A1A1A",
	accent: "#FACC15",
	blue: "#38BDF8",
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
const DIFFICULTIES: GuessDifficulty[] = ["easy", "normal", "hard", "mixed"];

export default function GuessRoomPage({ params }: Route.ComponentProps) {
	const code = (params.code ?? "").toUpperCase();
	const [name, setName] = useState("");
	const [ready, setReady] = useState(false);

	useEffect(() => {
		try {
			setName(window.localStorage.getItem(NAME_KEY) ?? "");
		} catch {
			/* storage blocked */
		}
		setReady(true);
	}, []);

	if (!isValidRoomCode(code)) {
		return (
			<Shell>
				<Notice
					title="That room code isn't valid"
					body="Room codes are five characters. Check the link you were sent."
					action={{ href: "/guess", label: "Back to Guess the Drawing" }}
				/>
			</Shell>
		);
	}

	if (!ready) {
		return (
			<Shell>
				<Notice title="Loading…" body="" />
			</Shell>
		);
	}

	return <Room code={code} initialName={name} />;
}

function Room({ code, initialName }: { code: string; initialName: string }) {
	const [searchParams] = useSearchParams();
	const [name, setName] = useState(initialName);
	const { state, youId, status, error, chat, canvas, send, clockOffset, dismissError } = useGuessRoom(code, name);

	const padRef = useRef<DrawPadHandle>(null);
	const lastCount = useRef(0);
	const appliedSettings = useRef(false);

	const me = state?.players.find((p) => p.id === youId) ?? null;
	const isHost = Boolean(state && youId && state.hostId === youId);
	const isDrawer = Boolean(state?.youAreDrawer);

	/* The creator's chosen settings ride in on the URL; apply them once. */
	useEffect(() => {
		if (appliedSettings.current || !state || !isHost || state.phase !== "lobby") return;
		const rounds = Number(searchParams.get("rounds"));
		const seconds = Number(searchParams.get("seconds"));
		const difficulty = searchParams.get("difficulty") as GuessDifficulty | null;
		if (!rounds && !seconds && !difficulty) {
			appliedSettings.current = true;
			return;
		}
		appliedSettings.current = true;
		send({
			t: "setSettings",
			settings: {
				...(rounds ? { rounds } : {}),
				...(seconds ? { seconds } : {}),
				...(difficulty ? { difficulty } : {}),
			},
		});
	}, [state, isHost, searchParams, send]);

	/* Fresh canvas whenever a new turn starts. */
	useEffect(() => {
		if (state?.phase === "choosing") {
			padRef.current?.reset();
			lastCount.current = 0;
		}
	}, [state?.phase, state?.turnNumber]);

	function handleCommit(op: Op) {
		send({ t: "stroke", op: packOps([op])[0] });
		lastCount.current += 1;
	}

	/**
	 * Undo and clear live inside DrawPad, so the room detects them by the op
	 * count dropping and resends the whole canvas rather than a delta.
	 */
	function handleCountChange(n: number) {
		if (n < lastCount.current) {
			send({ t: "sync", ops: packOps(padRef.current?.getOps() ?? []) });
		}
		lastCount.current = n;
	}

	if (!state) {
		return (
			<Shell>
				<Notice
					title={status === "closed" ? "Couldn't reach the room" : "Connecting…"}
					body={
						status === "closed"
							? "The connection kept dropping. Refresh to try again."
							: `Joining room ${code}.`
					}
					action={status === "closed" ? { href: "/guess", label: "Back to Guess the Drawing" } : undefined}
				/>
			</Shell>
		);
	}

	return (
		<Shell>
			<TopBar code={code} status={status} state={state} />

			{error && (
				<div
					role="alert"
					style={{
						background: "#2a1616",
						border: `1px solid ${COLORS.bad}`,
						color: COLORS.bad,
						borderRadius: 12,
						padding: "11px 16px",
						marginBottom: 16,
						display: "flex",
						justifyContent: "space-between",
						gap: 12,
						fontSize: 14,
					}}
				>
					<span>{error}</span>
					<button
						type="button"
						onClick={dismissError}
						style={{ background: "none", border: "none", color: COLORS.bad, cursor: "pointer", fontWeight: 700 }}
					>
						Dismiss
					</button>
				</div>
			)}

			{state.phase === "lobby" ? (
				<Lobby
					state={state}
					youId={youId}
					isHost={isHost}
					name={name}
					onRename={(n) => {
						setName(n);
						try {
							window.localStorage.setItem(NAME_KEY, n);
						} catch {
							/* storage blocked */
						}
						send({ t: "setName", name: n });
					}}
					onReady={(v) => send({ t: "ready", value: v })}
					onStart={() => send({ t: "start" })}
					onSettings={(s) => send({ t: "setSettings", settings: s })}
					meReady={Boolean(me?.ready)}
				/>
			) : (
				<div className="gr-grid" style={{ display: "grid", gridTemplateColumns: "210px minmax(0,1fr) 300px", gap: 16 }}>
					<Scoreboard state={state} youId={youId} />

					<div>
						<WordBar state={state} clockOffset={clockOffset} isDrawer={isDrawer} onSkip={() => send({ t: "skip" })} />

						<div style={{ position: "relative" }}>
							{isDrawer && state.phase === "drawing" ? (
								<DrawPad
									ref={padRef}
									theme={PAD_THEME}
									onCommit={handleCommit}
									onStrokeCountChange={handleCountChange}
								/>
							) : (
								<ViewerCanvas canvas={canvas} />
							)}

							{state.phase === "choosing" && (
								<Veil>
									<ChooseOverlay state={state} onChoose={(i) => send({ t: "choose", index: i })} clockOffset={clockOffset} />
								</Veil>
							)}

							{state.phase === "turnend" && <Veil><TurnSummary state={state} /></Veil>}
							{state.phase === "gameover" && (
								<Veil>
									<GameOver state={state} isHost={isHost} onPlayAgain={() => send({ t: "playAgain" })} />
								</Veil>
							)}
						</div>
					</div>

					<ChatPanel
						chat={chat}
						state={state}
						disabled={isDrawer && state.phase === "drawing"}
						onSend={(text) => send({ t: "chat", text })}
					/>
				</div>
			)}
		</Shell>
	);
}

/* ------------------------------------------------------------------ *
 * Chrome
 * ------------------------------------------------------------------ */

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div style={{ fontFamily: "'Inter', sans-serif", background: COLORS.bg, color: COLORS.text, minHeight: "100vh" }}>
			<link
				rel="stylesheet"
				href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700&display=swap"
			/>
			<style>{`
				@keyframes gr-pop { 0% { transform: scale(.6); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
				@keyframes gr-pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
				@media (max-width: 1000px) {
					.db-nav { flex-wrap: wrap !important; gap: 12px 18px !important; justify-content: center !important; }
					.gr-grid { grid-template-columns: 1fr !important; }
					.gr-bar { flex-direction: column !important; align-items: stretch !important; }
				}
			`}</style>
			<BattleHeader />
			<main style={{ maxWidth: 1240, margin: "0 auto", padding: "22px 18px 70px" }}>{children}</main>
		</div>
	);
}

function Notice({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
	return (
		<div
			style={{
				background: COLORS.bgPanel,
				border: `1px solid ${COLORS.border}`,
				borderRadius: 18,
				padding: "60px 30px",
				textAlign: "center",
				maxWidth: 560,
				margin: "40px auto",
			}}
		>
			<h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 25, margin: "0 0 10px" }}>{title}</h1>
			{body && <p style={{ color: COLORS.textDim, margin: "0 0 22px", lineHeight: 1.6 }}>{body}</p>}
			{action && (
				<a
					href={action.href}
					style={{
						display: "inline-block",
						background: COLORS.blue,
						color: "#0A0A0A",
						fontWeight: 700,
						textDecoration: "none",
						padding: "13px 26px",
						borderRadius: 999,
					}}
				>
					{action.label}
				</a>
			)}
		</div>
	);
}

function TopBar({ code, status, state }: { code: string; status: string; state: GuessState }) {
	const [copied, setCopied] = useState(false);
	const dot = status === "open" ? COLORS.good : status === "reconnecting" ? COLORS.accent : COLORS.bad;

	return (
		<div
			className="gr-bar"
			style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 18 }}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
				<span
					style={{
						fontFamily: "'Archivo Black', sans-serif",
						fontSize: 20,
						letterSpacing: "0.2em",
						background: COLORS.bgPanel,
						border: `1px solid ${COLORS.border}`,
						borderRadius: 11,
						padding: "7px 15px",
					}}
				>
					{code}
				</span>
				<button
					type="button"
					onClick={() => {
						try {
							void navigator.clipboard.writeText(window.location.origin + window.location.pathname);
							setCopied(true);
							window.setTimeout(() => setCopied(false), 1600);
						} catch {
							/* clipboard unavailable */
						}
					}}
					style={{
						background: "transparent",
						border: `1px solid ${COLORS.border}`,
						color: copied ? COLORS.good : COLORS.text,
						borderRadius: 999,
						padding: "8px 15px",
						fontFamily: "inherit",
						fontSize: 13,
						fontWeight: 600,
						cursor: "pointer",
					}}
				>
					{copied ? "Link copied" : "Copy invite link"}
				</button>
				<span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: COLORS.textDim }}>
					<span style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />
					{status === "open" ? `${state.players.filter((p) => p.connected).length} here` : status}
				</span>
			</div>

			{state.phase !== "lobby" && (
				<span
					style={{
						padding: "8px 15px",
						borderRadius: 999,
						border: `1px solid ${COLORS.border}`,
						fontSize: 12.5,
						color: COLORS.textDim,
					}}
				>
					Round {state.round} of {state.settings.rounds} · turn {state.turnNumber}
					{state.totalTurns > 0 ? ` of ${state.totalTurns}` : ""}
				</span>
			)}
		</div>
	);
}

/* ------------------------------------------------------------------ *
 * Lobby
 * ------------------------------------------------------------------ */

function Lobby({
	state,
	youId,
	isHost,
	name,
	onRename,
	onReady,
	onStart,
	onSettings,
	meReady,
}: {
	state: GuessState;
	youId: string | null;
	isHost: boolean;
	name: string;
	onRename: (n: string) => void;
	onReady: (v: boolean) => void;
	onStart: () => void;
	onSettings: (s: { rounds?: number; seconds?: number; difficulty?: GuessDifficulty }) => void;
	meReady: boolean;
}) {
	const connected = state.players.filter((p) => p.connected);
	const enough = connected.length >= MIN_PLAYERS;
	const allReady = connected.length > 0 && connected.every((p) => p.ready);

	return (
		<div className="gr-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 20 }}>
			<section style={{ background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 26 }}>
				<h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 24, margin: "0 0 6px" }}>Waiting room</h1>
				<p style={{ color: COLORS.textDim, fontSize: 14, margin: "0 0 22px", lineHeight: 1.6 }}>
					Share the invite link. You need at least {MIN_PLAYERS} players — it gets a lot
					better with four or more.
				</p>

				<div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 22 }}>
					{state.players.map((p) => (
						<div
							key={p.id}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 12,
								padding: "11px 14px",
								borderRadius: 11,
								background: COLORS.bg,
								border: `1px solid ${p.id === youId ? COLORS.blue : COLORS.border}`,
								opacity: p.connected ? 1 : 0.5,
							}}
						>
							<span
								style={{
									width: 30,
									height: 30,
									borderRadius: 9,
									display: "grid",
									placeItems: "center",
									background: p.ready ? COLORS.good : COLORS.border,
									color: "#0A0A0A",
									fontWeight: 800,
									fontSize: 13,
								}}
							>
								{p.name.slice(0, 1).toUpperCase()}
							</span>
							<span style={{ fontWeight: 600, fontSize: 14.5, flex: 1 }}>
								{p.name}
								{p.id === youId ? " (you)" : ""}
								{state.hostId === p.id ? <span style={{ color: COLORS.textDim, fontWeight: 500 }}> · host</span> : null}
							</span>
							<span style={{ fontSize: 12.5, color: p.ready ? COLORS.good : COLORS.textDim }}>
								{p.connected ? (p.ready ? "Ready" : "Not ready") : "Away"}
							</span>
						</div>
					))}
				</div>

				<label
					htmlFor="gr-name"
					style={{
						display: "block",
						fontSize: 11.5,
						letterSpacing: "0.14em",
						textTransform: "uppercase",
						color: COLORS.textDim,
						fontWeight: 700,
						marginBottom: 8,
					}}
				>
					Your name
				</label>
				<input
					id="gr-name"
					value={name}
					maxLength={16}
					onChange={(e) => onRename(e.target.value)}
					placeholder="Your name"
					style={{
						width: "100%",
						padding: "12px 14px",
						borderRadius: 10,
						border: `1px solid ${COLORS.border}`,
						background: COLORS.bg,
						color: COLORS.text,
						fontFamily: "inherit",
						fontSize: 14,
						marginBottom: 18,
					}}
				/>

				<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
					<button
						type="button"
						onClick={() => onReady(!meReady)}
						style={{
							flex: 1,
							minWidth: 150,
							background: meReady ? "transparent" : COLORS.good,
							color: meReady ? COLORS.text : "#0A0A0A",
							border: `1px solid ${meReady ? COLORS.border : COLORS.good}`,
							fontFamily: "inherit",
							fontWeight: 700,
							fontSize: 15,
							padding: "14px 22px",
							borderRadius: 999,
							cursor: "pointer",
						}}
					>
						{meReady ? "Cancel ready" : "I'm ready"}
					</button>
					{isHost && (
						<button
							type="button"
							disabled={!enough || !allReady}
							onClick={onStart}
							title={!enough ? `Need at least ${MIN_PLAYERS} players` : !allReady ? "Everyone must be ready" : ""}
							style={{
								flex: 1,
								minWidth: 150,
								background: enough && allReady ? COLORS.blue : "transparent",
								color: enough && allReady ? "#0A0A0A" : COLORS.textDim,
								border: `1px solid ${enough && allReady ? COLORS.blue : COLORS.border}`,
								fontFamily: "'Archivo Black', sans-serif",
								fontSize: 15,
								padding: "14px 22px",
								borderRadius: 999,
								cursor: enough && allReady ? "pointer" : "not-allowed",
							}}
						>
							START GAME
						</button>
					)}
				</div>
			</section>

			<aside style={{ background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
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
					Settings {!isHost && "· host controls"}
				</h2>

				<Field label="Time to draw">
					<Seg
						options={DRAW_SECONDS_CHOICES.map((s) => ({ value: s, label: `${s}s` }))}
						value={state.settings.seconds}
						disabled={!isHost}
						onChange={(v) => onSettings({ seconds: v })}
					/>
				</Field>

				<Field label="Rounds">
					<Seg
						options={ROUND_CHOICES.map((r) => ({ value: r, label: String(r) }))}
						value={state.settings.rounds}
						disabled={!isHost}
						onChange={(v) => onSettings({ rounds: v })}
					/>
				</Field>

				<Field label="Word difficulty">
					<div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
						{DIFFICULTIES.map((d) => {
							const on = state.settings.difficulty === d;
							return (
								<button
									key={d}
									type="button"
									disabled={!isHost}
									onClick={() => onSettings({ difficulty: d })}
									style={{
										padding: "7px 13px",
										borderRadius: 999,
										fontSize: 12.5,
										fontWeight: 600,
										fontFamily: "inherit",
										cursor: isHost ? "pointer" : "default",
										background: on ? COLORS.blue : "transparent",
										color: on ? "#0A0A0A" : COLORS.text,
										border: `1px solid ${on ? COLORS.blue : COLORS.border}`,
										opacity: isHost ? 1 : 0.75,
									}}
								>
									{DIFFICULTY_LABELS[d]}
								</button>
							);
						})}
					</div>
				</Field>

				<p style={{ fontSize: 12.5, color: COLORS.textDim, lineHeight: 1.6, borderTop: `1px solid ${COLORS.border}`, paddingTop: 15, margin: "18px 0 0" }}>
					Everyone draws once per round, so {connected.length || "n"} players × {state.settings.rounds} rounds
					= {(connected.length || 0) * state.settings.rounds} turns.
				</p>
			</aside>
		</div>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div style={{ marginBottom: 18 }}>
			<div style={{ fontSize: 12.5, color: COLORS.textDim, marginBottom: 8 }}>{label}</div>
			{children}
		</div>
	);
}

function Seg<T extends number>({
	options,
	value,
	disabled,
	onChange,
}: {
	options: readonly { value: T; label: string }[];
	value: T;
	disabled?: boolean;
	onChange: (v: T) => void;
}) {
	return (
		<div style={{ display: "flex", border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "hidden" }}>
			{options.map((o) => {
				const on = o.value === value;
				return (
					<button
						key={String(o.value)}
						type="button"
						disabled={disabled}
						onClick={() => onChange(o.value)}
						style={{
							flex: 1,
							padding: "10px 6px",
							border: "none",
							fontFamily: "inherit",
							fontSize: 13,
							fontWeight: on ? 700 : 500,
							background: on ? COLORS.blue : "transparent",
							color: on ? "#0A0A0A" : COLORS.text,
							cursor: disabled ? "default" : "pointer",
							opacity: disabled && !on ? 0.6 : 1,
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
 * In-game pieces
 * ------------------------------------------------------------------ */

function useRemaining(endsAt: number | null, offset: number): number {
	const [ms, setMs] = useState(() => (endsAt === null ? 0 : Math.max(0, endsAt - offset - Date.now())));
	useEffect(() => {
		if (endsAt === null) {
			setMs(0);
			return;
		}
		const tick = () => setMs(Math.max(0, endsAt - offset - Date.now()));
		tick();
		const id = window.setInterval(tick, 100);
		return () => window.clearInterval(id);
	}, [endsAt, offset]);
	return ms;
}

function Countdown({ endsAt, offset }: { endsAt: number | null; offset: number }) {
	const ms = useRemaining(endsAt, offset);
	return <>{Math.ceil(ms / 1000)}</>;
}

function Scoreboard({ state, youId }: { state: GuessState; youId: string | null }) {
	const sorted = [...state.players].sort((a, b) => b.score - a.score);
	return (
		<aside style={{ background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 14, alignSelf: "start" }}>
			<h2
				style={{
					fontSize: 11,
					letterSpacing: "0.14em",
					textTransform: "uppercase",
					color: COLORS.textDim,
					fontWeight: 700,
					margin: "0 0 12px",
				}}
			>
				Scores
			</h2>
			<div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
				{sorted.map((p, i) => {
					const drawing = state.drawerId === p.id;
					return (
						<div
							key={p.id}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								padding: "8px 10px",
								borderRadius: 9,
								background: drawing ? `${COLORS.accent}18` : "transparent",
								border: `1px solid ${drawing ? COLORS.accent : "transparent"}`,
								opacity: p.connected ? 1 : 0.45,
							}}
						>
							<span style={{ fontSize: 11.5, color: COLORS.textDim, width: 14 }}>{i + 1}</span>
							<span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: p.id === youId ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
								{p.name}
							</span>
							{drawing && <span title="Drawing">✏️</span>}
							{p.guessed && !drawing && <span title="Guessed it" style={{ color: COLORS.good }}>✓</span>}
							<b style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 13 }}>{p.score}</b>
						</div>
					);
				})}
			</div>
		</aside>
	);
}

function WordBar({
	state,
	clockOffset,
	isDrawer,
	onSkip,
}: {
	state: GuessState;
	clockOffset: number;
	isDrawer: boolean;
	onSkip: () => void;
}) {
	const ms = useRemaining(state.endsAt, clockOffset);
	const low = state.phase === "drawing" && ms <= 10_000;
	const letters = state.wordHint ?? "";

	return (
		<div
			className="gr-bar"
			style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 12, flexWrap: "wrap" }}
		>
			<div style={{ minWidth: 0 }}>
				<div style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: COLORS.textDim }}>
					{isDrawer ? "You're drawing" : state.word ? "The word was" : "Guess the word"}
				</div>
				<div
					style={{
						fontFamily: "'Archivo Black', sans-serif",
						fontSize: "clamp(19px, 3vw, 29px)",
						letterSpacing: state.word && !isDrawer ? 0 : "0.16em",
						lineHeight: 1.2,
					}}
				>
					{state.word ?? letters.split("").join(" ")}
				</div>
				{!state.word && letters && (
					<div style={{ fontSize: 11.5, color: COLORS.textDim, marginTop: 3 }}>
						{letters.replace(/[^_a-zA-Z0-9]/g, "").length} letters
					</div>
				)}
			</div>

			<div style={{ display: "flex", alignItems: "center", gap: 14 }}>
				{state.phase === "drawing" && (
					<span style={{ fontSize: 12.5, color: COLORS.textDim }}>
						{state.correctCount}/{state.guesserCount} guessed
					</span>
				)}
				<span
					style={{
						fontFamily: "'Archivo Black', sans-serif",
						fontSize: 26,
						fontVariantNumeric: "tabular-nums",
						color: low ? COLORS.bad : COLORS.text,
						animation: low ? "gr-pulse 1s ease-in-out infinite" : "none",
						minWidth: "2.4ch",
						textAlign: "right",
					}}
				>
					<Countdown endsAt={state.endsAt} offset={clockOffset} />
				</span>
				{isDrawer && state.phase === "drawing" && (
					<button
						type="button"
						onClick={onSkip}
						style={{
							padding: "10px 18px",
							borderRadius: 999,
							border: `1px solid ${COLORS.border}`,
							background: "transparent",
							color: COLORS.textDim,
							fontFamily: "inherit",
							fontWeight: 600,
							fontSize: 13,
							cursor: "pointer",
						}}
					>
						Skip turn
					</button>
				)}
			</div>
		</div>
	);
}

function ViewerCanvas({ canvas }: { canvas: ReturnType<typeof packOps> }) {
	const ops = useMemo(() => unpackOps(canvas), [canvas]);
	return (
		<div
			style={{
				borderRadius: 16,
				padding: 10,
				background: COLORS.bgPanel,
				border: `1px solid ${COLORS.border}`,
				boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
			}}
		>
			<div style={{ borderRadius: 10, overflow: "hidden" }}>
				<ReplayCanvas ops={ops} play={false} />
			</div>
		</div>
	);
}

function Veil({ children }: { children: React.ReactNode }) {
	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				borderRadius: 16,
				background: "rgba(10,10,10,0.93)",
				display: "grid",
				placeItems: "center",
				zIndex: 20,
				padding: 20,
			}}
		>
			{children}
		</div>
	);
}

function ChooseOverlay({
	state,
	onChoose,
	clockOffset,
}: {
	state: GuessState;
	onChoose: (i: number) => void;
	clockOffset: number;
}) {
	const drawer = state.players.find((p) => p.id === state.drawerId);

	if (!state.youAreDrawer || !state.choices) {
		return (
			<div style={{ textAlign: "center" }}>
				<div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 24, marginBottom: 10 }}>
					{drawer?.name ?? "Someone"} is picking a word
				</div>
				<div style={{ color: COLORS.textDim, fontSize: 14 }}>
					Get ready to guess — <Countdown endsAt={state.endsAt} offset={clockOffset} />s
				</div>
			</div>
		);
	}

	return (
		<div style={{ textAlign: "center" }}>
			<div style={{ fontSize: 11.5, letterSpacing: "0.16em", textTransform: "uppercase", color: COLORS.textDim, marginBottom: 8 }}>
				Your turn — pick a word
			</div>
			<div style={{ color: COLORS.textDim, fontSize: 13, marginBottom: 20 }}>
				Auto-picks in <Countdown endsAt={state.endsAt} offset={clockOffset} />s
			</div>
			<div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
				{state.choices.map((word, i) => (
					<button
						key={word}
						type="button"
						onClick={() => onChoose(i)}
						style={{
							background: COLORS.bgPanel,
							border: `1px solid ${COLORS.blue}`,
							color: COLORS.text,
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: 17,
							padding: "16px 26px",
							borderRadius: 14,
							cursor: "pointer",
							animation: "gr-pop 220ms ease both",
						}}
					>
						{word}
					</button>
				))}
			</div>
		</div>
	);
}

function TurnSummary({ state }: { state: GuessState }) {
	const scored = [...state.players].filter((p) => p.lastDelta > 0).sort((a, b) => b.lastDelta - a.lastDelta);
	return (
		<div style={{ textAlign: "center", maxWidth: 460 }}>
			<div style={{ fontSize: 11.5, letterSpacing: "0.16em", textTransform: "uppercase", color: COLORS.textDim }}>
				The word was
			</div>
			<div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(28px, 5vw, 44px)", margin: "8px 0 22px" }}>
				{state.word ?? "—"}
			</div>
			{scored.length === 0 ? (
				<p style={{ color: COLORS.textDim, fontSize: 14.5 }}>Nobody got that one.</p>
			) : (
				<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
					{scored.map((p) => (
						<div
							key={p.id}
							style={{
								display: "flex",
								justifyContent: "space-between",
								padding: "9px 15px",
								borderRadius: 9,
								background: COLORS.bgPanel,
								fontSize: 14,
							}}
						>
							<span>
								{p.name}
								{state.drawerId === p.id ? " (drawing)" : ""}
							</span>
							<b style={{ color: COLORS.good }}>+{p.lastDelta}</b>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function GameOver({ state, isHost, onPlayAgain }: { state: GuessState; isHost: boolean; onPlayAgain: () => void }) {
	const sorted = [...state.players].sort((a, b) => b.score - a.score);
	const winner = sorted[0];
	return (
		<div style={{ textAlign: "center", maxWidth: 460, width: "100%" }}>
			<div style={{ fontSize: 11.5, letterSpacing: "0.16em", textTransform: "uppercase", color: COLORS.textDim }}>
				Final scores
			</div>
			<div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(26px, 5vw, 40px)", margin: "8px 0 20px", color: COLORS.accent }}>
				{winner ? `${winner.name.toUpperCase()} WINS` : "GAME OVER"}
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 24 }}>
				{sorted.map((p, i) => (
					<div
						key={p.id}
						style={{
							display: "flex",
							justifyContent: "space-between",
							padding: "10px 15px",
							borderRadius: 9,
							background: COLORS.bgPanel,
							border: i === 0 ? `1px solid ${COLORS.accent}` : `1px solid ${COLORS.border}`,
							fontSize: 14,
						}}
					>
						<span>
							{i + 1}. {p.name}
						</span>
						<b>{p.score}</b>
					</div>
				))}
			</div>
			<div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
				{isHost && (
					<button
						type="button"
						onClick={onPlayAgain}
						style={{
							background: COLORS.blue,
							color: "#0A0A0A",
							border: "none",
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: 15,
							padding: "13px 30px",
							borderRadius: 999,
							cursor: "pointer",
						}}
					>
						PLAY AGAIN
					</button>
				)}
				<a
					href="/games"
					style={{
						background: "transparent",
						border: `1px solid ${COLORS.border}`,
						color: COLORS.text,
						textDecoration: "none",
						fontWeight: 600,
						fontSize: 14,
						padding: "13px 24px",
						borderRadius: 999,
					}}
				>
					All games
				</a>
			</div>
			{!isHost && (
				<p style={{ color: COLORS.textDim, fontSize: 13, marginTop: 14 }}>
					The host can restart the game in this room.
				</p>
			)}
		</div>
	);
}

/* ------------------------------------------------------------------ *
 * Chat / guessing
 * ------------------------------------------------------------------ */

function ChatPanel({
	chat,
	state,
	disabled,
	onSend,
}: {
	chat: ChatEntry[];
	state: GuessState;
	disabled: boolean;
	onSend: (text: string) => void;
}) {
	const [text, setText] = useState("");
	const endRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		endRef.current?.scrollIntoView({ block: "end" });
	}, [chat.length]);

	const guessing = state.phase === "drawing" && !state.youAreDrawer && !state.youGuessed;

	return (
		<aside
			style={{
				background: COLORS.bgPanel,
				border: `1px solid ${COLORS.border}`,
				borderRadius: 14,
				display: "flex",
				flexDirection: "column",
				height: 520,
			}}
		>
			<div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 7 }}>
				{chat.length === 0 && (
					<p style={{ color: COLORS.textDim, fontSize: 13, margin: 0 }}>
						Guesses and chat show up here.
					</p>
				)}
				{chat.map((entry) => (
					<ChatLine key={entry.id} entry={entry} />
				))}
				<div ref={endRef} />
			</div>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					const value = text.trim();
					if (!value) return;
					onSend(value);
					setText("");
				}}
				style={{ borderTop: `1px solid ${COLORS.border}`, padding: 10, display: "flex", gap: 8 }}
			>
				<input
					value={text}
					maxLength={MAX_CHAT_LEN}
					onChange={(e) => setText(e.target.value)}
					disabled={disabled}
					placeholder={
						disabled
							? "You're drawing — no chatting"
							: guessing
								? "Type your guess…"
								: state.youGuessed
									? "You got it! Chat away"
									: "Say something…"
					}
					style={{
						flex: 1,
						minWidth: 0,
						padding: "11px 13px",
						borderRadius: 9,
						border: `1px solid ${guessing ? COLORS.blue : COLORS.border}`,
						background: COLORS.bg,
						color: COLORS.text,
						fontFamily: "inherit",
						fontSize: 13.5,
						opacity: disabled ? 0.5 : 1,
					}}
				/>
				<button
					type="submit"
					disabled={disabled}
					style={{
						background: guessing ? COLORS.blue : "transparent",
						color: guessing ? "#0A0A0A" : COLORS.text,
						border: `1px solid ${guessing ? COLORS.blue : COLORS.border}`,
						borderRadius: 9,
						padding: "0 15px",
						fontFamily: "inherit",
						fontWeight: 700,
						fontSize: 13,
						cursor: disabled ? "not-allowed" : "pointer",
					}}
				>
					Send
				</button>
			</form>
		</aside>
	);
}

function ChatLine({ entry }: { entry: ChatEntry }) {
	if (entry.kind === "correct") {
		return (
			<div style={{ background: `${COLORS.good}1e`, color: COLORS.good, borderRadius: 8, padding: "7px 10px", fontSize: 13, fontWeight: 600 }}>
				{entry.text}
			</div>
		);
	}
	if (entry.kind === "close") {
		return (
			<div style={{ background: `${COLORS.accent}1e`, color: COLORS.accent, borderRadius: 8, padding: "7px 10px", fontSize: 13, fontWeight: 600 }}>
				{entry.text}
			</div>
		);
	}
	if (entry.kind === "system" || entry.kind === "join" || entry.kind === "leave") {
		return <div style={{ color: COLORS.textDim, fontSize: 12.5, fontStyle: "italic" }}>{entry.text}</div>;
	}
	return (
		<div style={{ fontSize: 13.5, lineHeight: 1.45, wordBreak: "break-word" }}>
			<b style={{ color: COLORS.blue }}>{entry.from}</b>{" "}
			<span style={{ color: COLORS.text }}>{entry.text}</span>
		</div>
	);
}
