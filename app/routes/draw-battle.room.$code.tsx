import type { Route } from "./+types/draw-battle.room.$code";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DrawPad, ReplayCanvas, type DrawPadHandle } from "../components/DrawPad";
import { BattleHeader } from "../components/BattleHeader";
import { downloadComposite } from "../lib/battle-export";
import { CATEGORY_LABELS, type PromptCategory } from "../lib/draw-battle-prompts";
import {
	ROUNDS_CHOICES,
	SECONDS_CHOICES,
	isValidRoomCode,
	packOps,
	unpackOps,
	type PackedOp,
	type RoomState,
	type Seat,
	type Verdict,
} from "../lib/battle-protocol";
import { useBattleRoom } from "../lib/useBattleRoom";

export function meta({ params }: Route.MetaArgs) {
	return [
		{ title: `Room ${params.code?.toUpperCase() ?? ""} — Draw Battle` },
		{ name: "robots", content: "noindex" },
	];
}

const COLORS = {
	bg: "#0A0A0A",
	bgPanel: "#1A1A1A",
	accent: "#FACC15",
	text: "#FFFFFF",
	textDim: "#9CA3AF",
	border: "#2E2E2E",
	bad: "#F87171",
	good: "#34D399",
};

const TINTS: [string, string] = ["#FACC15", "#38BDF8"];

const PAD_THEME = {
	panel: COLORS.bgPanel,
	border: COLORS.border,
	text: COLORS.text,
	dim: COLORS.textDim,
	accent: COLORS.accent,
};

const ALL_CATEGORIES: PromptCategory[] = ["objects", "creatures", "scenes", "concepts"];
const NAME_KEY = "drawBattleName";

/** Auto-save points before the deadline, in ms remaining. */
const AUTOSAVE_AT = [900, 250];

export default function BattleRoomPage({ params }: Route.ComponentProps) {
	const code = (params.code ?? "").toUpperCase();
	const [name, setName] = useState("");
	const [nameLoaded, setNameLoaded] = useState(false);

	useEffect(() => {
		try {
			setName(window.localStorage.getItem(NAME_KEY) ?? "");
		} catch {
			/* storage blocked */
		}
		setNameLoaded(true);
	}, []);

	if (!isValidRoomCode(code)) {
		return (
			<Shell>
				<Notice
					title="That room code isn't valid"
					body="Room codes are five characters. Check the link you were sent."
					action={{ href: "/draw-battle/online", label: "Back to rooms" }}
				/>
			</Shell>
		);
	}

	if (!nameLoaded) {
		return (
			<Shell>
				<Notice title="Loading…" body="" />
			</Shell>
		);
	}

	return <ConnectedRoom code={code} name={name} onRename={setName} />;
}

function ConnectedRoom({
	code,
	name,
	onRename,
}: {
	code: string;
	name: string;
	onRename: (n: string) => void;
}) {
	const { state, you, status, error, liveOps, send, clockOffset, dismissError } = useBattleRoom(code, name);
	const padRef = useRef<DrawPadHandle>(null);

	const seat = you?.seat ?? null;
	const isPlayer = you?.role === "player" && seat !== null;
	const isHost = state?.hostSeat !== null && state?.hostSeat === seat;
	const me = seat !== null && state ? state.players[seat] : null;

	/* Reset the canvas at the start of every round. */
	useEffect(() => {
		if (state?.phase === "countdown") padRef.current?.reset();
	}, [state?.phase, state?.round]);

	const submit = useCallback(
		(final: boolean) => {
			const ops = padRef.current?.getOps() ?? [];
			send({ t: "submit", ops: packOps(ops), final });
		},
		[send]
	);

	/* Auto-save shortly before the server's deadline so nothing is lost. */
	useEffect(() => {
		if (!isPlayer || state?.phase !== "drawing" || !state.endsAt) return;
		const localDeadline = state.endsAt - clockOffset;
		const timers = AUTOSAVE_AT.map((lead) =>
			window.setTimeout(() => submit(false), Math.max(0, localDeadline - lead - Date.now()))
		);
		return () => timers.forEach(window.clearTimeout);
	}, [isPlayer, state?.phase, state?.endsAt, clockOffset, submit]);

	const relayStroke = useCallback(
		(op: Parameters<NonNullable<React.ComponentProps<typeof DrawPad>["onCommit"]>>[0]) => {
			send({ t: "stroke", op: packOps([op])[0] });
		},
		[send]
	);

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
					action={status === "closed" ? { href: "/draw-battle/online", label: "Back to rooms" } : undefined}
				/>
			</Shell>
		);
	}

	const submitted = Boolean(me?.submitted);

	return (
		<Shell>
			<RoomBar code={code} status={status} state={state} youSeat={seat} role={you?.role ?? "spectator"} />

			{error && (
				<div
					role="alert"
					style={{
						background: "#2a1616",
						border: `1px solid ${COLORS.bad}`,
						color: COLORS.bad,
						borderRadius: 12,
						padding: "12px 16px",
						marginBottom: 18,
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

			{state.phase === "lobby" && (
				<Lobby
					state={state}
					code={code}
					seat={seat}
					isHost={Boolean(isHost)}
					name={name}
					onRename={(n) => {
						onRename(n);
						try {
							window.localStorage.setItem(NAME_KEY, n);
						} catch {
							/* storage blocked */
						}
						send({ t: "setName", name: n });
					}}
					send={send}
				/>
			)}

			{(state.phase === "countdown" || state.phase === "drawing") && (
				<>
					{isPlayer ? (
						<>
							<DrawingHud
								state={state}
								seat={seat as Seat}
								clockOffset={clockOffset}
								submitted={submitted}
								onDone={() => submit(true)}
							/>
							<div style={{ position: "relative" }}>
								<DrawPad
									ref={padRef}
									theme={PAD_THEME}
									frozen={state.phase === "countdown" || submitted}
									onCommit={relayStroke}
								/>
								{state.phase === "countdown" && (
									<Veil>
										<Countdown endsAt={state.endsAt} offset={clockOffset} tint={TINTS[seat as Seat]} />
									</Veil>
								)}
								{submitted && state.phase === "drawing" && (
									<Veil>
										<div style={{ textAlign: "center" }}>
											<div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 26, marginBottom: 8 }}>
												Submitted
											</div>
											<div style={{ color: COLORS.textDim, fontSize: 14 }}>
												Waiting for your opponent to finish.
											</div>
										</div>
									</Veil>
								)}
							</div>
						</>
					) : (
						<SpectatorStage state={state} liveOps={liveOps} clockOffset={clockOffset} />
					)}
				</>
			)}

			{(state.phase === "reveal" || state.phase === "roundover") && (
				<RevealStage
					state={state}
					seat={seat}
					isPlayer={isPlayer}
					isHost={Boolean(isHost)}
					clockOffset={clockOffset}
					send={send}
				/>
			)}

			{state.phase === "matchover" && (
				<MatchOver state={state} isHost={Boolean(isHost)} send={send} />
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
				@keyframes db-pop { 0% { transform: scale(.55); opacity: 0 } 60% { transform: scale(1.06); opacity: 1 } 100% { transform: scale(1); opacity: 1 } }
				@keyframes db-pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
				@media (max-width: 900px) {
					.db-nav { flex-wrap: wrap !important; gap: 12px 18px !important; justify-content: center !important; }
					.db-duo { grid-template-columns: 1fr !important; }
					.db-bar { flex-direction: column !important; align-items: stretch !important; }
				}
			`}</style>
			<BattleHeader />
			<main style={{ maxWidth: 1180, margin: "0 auto", padding: "26px 22px 80px" }}>{children}</main>
		</div>
	);
}

function Notice({
	title,
	body,
	action,
}: {
	title: string;
	body: string;
	action?: { href: string; label: string };
}) {
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
			<h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 26, margin: "0 0 10px" }}>{title}</h1>
			{body && <p style={{ color: COLORS.textDim, margin: "0 0 22px", lineHeight: 1.6 }}>{body}</p>}
			{action && (
				<a
					href={action.href}
					style={{
						display: "inline-block",
						background: COLORS.accent,
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

function RoomBar({
	code,
	status,
	state,
	youSeat,
	role,
}: {
	code: string;
	status: string;
	state: RoomState;
	youSeat: Seat | null;
	role: string;
}) {
	const [copied, setCopied] = useState(false);

	function copyLink() {
		try {
			void navigator.clipboard.writeText(window.location.href);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1600);
		} catch {
			/* clipboard unavailable */
		}
	}

	const dot = status === "open" ? COLORS.good : status === "reconnecting" ? COLORS.accent : COLORS.bad;

	return (
		<div
			className="db-bar"
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: 14,
				flexWrap: "wrap",
				marginBottom: 22,
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
				<span
					style={{
						fontFamily: "'Archivo Black', sans-serif",
						fontSize: 22,
						letterSpacing: "0.22em",
						background: COLORS.bgPanel,
						border: `1px solid ${COLORS.border}`,
						borderRadius: 12,
						padding: "8px 16px",
					}}
				>
					{code}
				</span>
				<button
					type="button"
					onClick={copyLink}
					style={{
						background: "transparent",
						border: `1px solid ${COLORS.border}`,
						color: copied ? COLORS.good : COLORS.text,
						borderRadius: 999,
						padding: "9px 16px",
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
					{status === "open" ? (role === "player" ? "Playing" : "Spectating") : status}
				</span>
			</div>

			<div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
				{[0, 1].map((i) => {
					const p = state.players[i];
					return (
						<span
							key={i}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								padding: "7px 14px",
								borderRadius: 999,
								background: COLORS.bgPanel,
								border: `1px solid ${youSeat === i ? TINTS[i] : COLORS.border}`,
								fontSize: 13.5,
								opacity: p?.connected === false ? 0.55 : 1,
							}}
						>
							<span style={{ width: 8, height: 8, borderRadius: "50%", background: TINTS[i] }} />
							<span style={{ fontWeight: 600 }}>{p ? p.name : "Empty"}</span>
							<b style={{ fontFamily: "'Archivo Black', sans-serif", color: TINTS[i] }}>{state.scores[i]}</b>
						</span>
					);
				})}
				<span
					style={{
						padding: "7px 14px",
						borderRadius: 999,
						border: `1px solid ${COLORS.border}`,
						fontSize: 12.5,
						color: COLORS.textDim,
					}}
				>
					Round {state.round}/{state.settings.rounds} · {state.spectators} watching
				</span>
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ *
 * Lobby
 * ------------------------------------------------------------------ */

function Lobby({
	state,
	code,
	seat,
	isHost,
	name,
	onRename,
	send,
}: {
	state: RoomState;
	code: string;
	seat: Seat | null;
	isHost: boolean;
	name: string;
	onRename: (n: string) => void;
	send: ReturnType<typeof useBattleRoom>["send"];
}) {
	const me = seat !== null ? state.players[seat] : null;
	const bothSeated = Boolean(state.players[0] && state.players[1]);
	const bothReady = Boolean(state.players[0]?.ready && state.players[1]?.ready);

	return (
		<div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 20 }} className="db-duo">
			<section
				style={{ background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 26 }}
			>
				<h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 24, margin: "0 0 6px" }}>
					Waiting room
				</h1>
				<p style={{ color: COLORS.textDim, fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
					Send the invite link to your opponent. Anyone else who opens it becomes a
					spectator — and spectators are the judges.
				</p>

				<div className="db-duo" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
					{[0, 1].map((i) => {
						const p = state.players[i];
						return (
							<div
								key={i}
								style={{
									border: `1px solid ${p ? TINTS[i] : COLORS.border}`,
									borderRadius: 14,
									padding: 18,
									background: COLORS.bg,
									textAlign: "center",
								}}
							>
								<div
									style={{
										width: 46,
										height: 46,
										borderRadius: 14,
										margin: "0 auto 12px",
										display: "grid",
										placeItems: "center",
										background: p ? TINTS[i] : "transparent",
										border: p ? "none" : `1px dashed ${COLORS.border}`,
										color: "#0A0A0A",
										fontFamily: "'Archivo Black', sans-serif",
										fontSize: 20,
									}}
								>
									{p ? p.name.slice(0, 1).toUpperCase() : "?"}
								</div>
								<div style={{ fontWeight: 700, fontSize: 15 }}>{p ? p.name : "Waiting for a player"}</div>
								<div style={{ fontSize: 12.5, color: p?.ready ? COLORS.good : COLORS.textDim, marginTop: 6 }}>
									{!p ? "Empty seat" : p.ready ? "Ready" : p.connected ? "Not ready" : "Disconnected"}
									{state.hostSeat === i ? " · host" : ""}
								</div>
							</div>
						);
					})}
				</div>

				{seat !== null ? (
					<>
						<label
							htmlFor="db-room-name"
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
							id="db-room-name"
							value={name}
							maxLength={16}
							onChange={(e) => onRename(e.target.value)}
							placeholder={`Player ${seat + 1}`}
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
								onClick={() => send({ t: "ready", value: !me?.ready })}
								style={{
									flex: 1,
									minWidth: 160,
									background: me?.ready ? "transparent" : COLORS.good,
									color: me?.ready ? COLORS.text : "#0A0A0A",
									border: `1px solid ${me?.ready ? COLORS.border : COLORS.good}`,
									fontFamily: "inherit",
									fontWeight: 700,
									fontSize: 15,
									padding: "14px 22px",
									borderRadius: 999,
									cursor: "pointer",
								}}
							>
								{me?.ready ? "Cancel ready" : "I'm ready"}
							</button>
							{isHost && (
								<button
									type="button"
									disabled={!bothSeated || !bothReady}
									onClick={() => send({ t: "start" })}
									title={!bothSeated ? "Both seats need a player" : !bothReady ? "Both players must be ready" : ""}
									style={{
										flex: 1,
										minWidth: 160,
										background: bothSeated && bothReady ? COLORS.accent : "transparent",
										color: bothSeated && bothReady ? "#0A0A0A" : COLORS.textDim,
										border: `1px solid ${bothSeated && bothReady ? COLORS.accent : COLORS.border}`,
										fontFamily: "'Archivo Black', sans-serif",
										fontSize: 15,
										padding: "14px 22px",
										borderRadius: 999,
										cursor: bothSeated && bothReady ? "pointer" : "not-allowed",
									}}
								>
									START MATCH
								</button>
							)}
						</div>
					</>
				) : (
					<div
						style={{
							border: `1px solid ${COLORS.border}`,
							borderRadius: 12,
							padding: 18,
							textAlign: "center",
							color: COLORS.textDim,
							fontSize: 14,
							lineHeight: 1.6,
						}}
					>
						Both seats are taken, so you're spectating. You'll see both canvases live —
						and you get a vote at the end of each round.
					</div>
				)}
			</section>

			<Settings state={state} isHost={isHost} send={send} code={code} />
		</div>
	);
}

function Settings({
	state,
	isHost,
	send,
	code,
}: {
	state: RoomState;
	isHost: boolean;
	send: ReturnType<typeof useBattleRoom>["send"];
	code: string;
}) {
	const { settings } = state;

	return (
		<aside
			style={{ background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}
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
				Match settings {!isHost && "· host controls"}
			</h2>

			<Field label="Time per round">
				<Seg
					options={SECONDS_CHOICES.map((s) => ({ value: s, label: `${s}s` }))}
					value={settings.seconds}
					disabled={!isHost}
					onChange={(v) => send({ t: "setSettings", settings: { seconds: v } })}
				/>
			</Field>

			<Field label="Rounds">
				<Seg
					options={ROUNDS_CHOICES.map((r) => ({ value: r, label: r === 1 ? "1" : `${r}` }))}
					value={settings.rounds}
					disabled={!isHost}
					onChange={(v) => send({ t: "setSettings", settings: { rounds: v } })}
				/>
			</Field>

			<Field label="Prompt pool">
				<div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
					{ALL_CATEGORIES.map((c) => {
						const on = settings.categories.includes(c);
						return (
							<button
								key={c}
								type="button"
								disabled={!isHost}
								onClick={() => {
									const next = on
										? settings.categories.filter((x) => x !== c)
										: [...settings.categories, c];
									if (next.length === 0) return;
									send({ t: "setSettings", settings: { categories: next } });
								}}
								style={{
									padding: "7px 13px",
									borderRadius: 999,
									fontSize: 12.5,
									fontWeight: 600,
									fontFamily: "inherit",
									cursor: isHost ? "pointer" : "default",
									background: on ? COLORS.accent : "transparent",
									color: on ? "#0A0A0A" : COLORS.text,
									border: `1px solid ${on ? COLORS.accent : COLORS.border}`,
									opacity: isHost ? 1 : 0.75,
								}}
							>
								{CATEGORY_LABELS[c]}
							</button>
						);
					})}
				</div>
			</Field>

			<div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 20, paddingTop: 16 }}>
				<p style={{ fontSize: 12.5, color: COLORS.textDim, lineHeight: 1.6, margin: 0 }}>
					Share code <b style={{ color: COLORS.text, letterSpacing: "0.14em" }}>{code}</b> or send the
					link. Spectators can join at any time.
				</p>
			</div>
		</aside>
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
	options: { value: T; label: string }[];
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
						key={o.value}
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
							background: on ? COLORS.accent : "transparent",
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
 * Timers — self-contained so ticking never re-renders the canvas
 * ------------------------------------------------------------------ */

function useRemaining(endsAt: number | null, offset: number): number {
	const [ms, setMs] = useState(() => (endsAt === null ? 0 : Math.max(0, endsAt - offset - Date.now())));

	useEffect(() => {
		if (endsAt === null) return;
		const tick = () => setMs(Math.max(0, endsAt - offset - Date.now()));
		tick();
		const id = window.setInterval(tick, 100);
		return () => window.clearInterval(id);
	}, [endsAt, offset]);

	return ms;
}

function Countdown({ endsAt, offset, tint }: { endsAt: number | null; offset: number; tint: string }) {
	const ms = useRemaining(endsAt, offset);
	const n = Math.max(1, Math.ceil(ms / 1000));
	return (
		<div style={{ textAlign: "center" }}>
			<div
				key={n}
				style={{
					fontFamily: "'Archivo Black', sans-serif",
					fontSize: "clamp(70px, 16vw, 150px)",
					lineHeight: 1,
					color: tint,
					animation: "db-pop 340ms cubic-bezier(.2,.7,.3,1) both",
				}}
			>
				{n}
			</div>
			<div style={{ marginTop: 14, color: COLORS.textDim, letterSpacing: "0.2em", textTransform: "uppercase", fontSize: 12 }}>
				Get ready
			</div>
		</div>
	);
}

function TimerRing({ endsAt, offset, total }: { endsAt: number | null; offset: number; total: number }) {
	const ms = useRemaining(endsAt, offset);
	const secs = Math.ceil(ms / 1000);
	const frac = total > 0 ? Math.max(0, Math.min(1, ms / (total * 1000))) : 0;
	const R = 26;
	const CIRC = 2 * Math.PI * R;
	const low = ms <= 10_000;

	return (
		<div style={{ position: "relative", width: 62, height: 62, flexShrink: 0 }}>
			<svg width="62" height="62" viewBox="0 0 62 62" style={{ transform: "rotate(-90deg)" }}>
				<circle cx="31" cy="31" r={R} fill="none" stroke={COLORS.border} strokeWidth="5" />
				<circle
					cx="31"
					cy="31"
					r={R}
					fill="none"
					stroke={low ? COLORS.bad : COLORS.accent}
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
					color: low ? COLORS.bad : COLORS.text,
					fontVariantNumeric: "tabular-nums",
					animation: low ? "db-pulse 1s ease-in-out infinite" : "none",
				}}
			>
				{secs}
			</span>
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
				background: "rgba(10,10,10,0.94)",
				display: "grid",
				placeItems: "center",
				zIndex: 20,
			}}
		>
			{children}
		</div>
	);
}

/* ------------------------------------------------------------------ *
 * Drawing
 * ------------------------------------------------------------------ */

function DrawingHud({
	state,
	seat,
	clockOffset,
	submitted,
	onDone,
}: {
	state: RoomState;
	seat: Seat;
	clockOffset: number;
	submitted: boolean;
	onDone: () => void;
}) {
	const opponent = state.players[seat === 0 ? 1 : 0];

	return (
		<div
			className="db-bar"
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: 18,
				marginBottom: 16,
				flexWrap: "wrap",
			}}
		>
			<div style={{ minWidth: 0 }}>
				<div style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: COLORS.textDim }}>
					Your prompt
				</div>
				<div
					style={{
						fontFamily: "'Archivo Black', sans-serif",
						fontSize: "clamp(20px, 3.4vw, 32px)",
						lineHeight: 1.15,
						color: state.prompt ? COLORS.text : "transparent",
						textShadow: state.prompt ? "none" : `0 0 22px ${COLORS.textDim}`,
					}}
				>
					{state.prompt ?? "•••••••"}
				</div>
			</div>

			<div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
				<span style={{ fontSize: 12.5, color: opponent?.submitted ? COLORS.good : COLORS.textDim }}>
					{opponent
						? opponent.submitted
							? `${opponent.name} is done`
							: `${opponent.name} is drawing`
						: "No opponent"}
				</span>
				<TimerRing endsAt={state.endsAt} offset={clockOffset} total={state.settings.seconds} />
				<button
					type="button"
					onClick={onDone}
					disabled={submitted || state.phase !== "drawing"}
					style={{
						padding: "12px 22px",
						borderRadius: 999,
						border: `1px solid ${COLORS.border}`,
						background: "transparent",
						color: submitted ? COLORS.textDim : COLORS.text,
						fontFamily: "inherit",
						fontWeight: 700,
						fontSize: 14,
						cursor: submitted ? "not-allowed" : "pointer",
						whiteSpace: "nowrap",
					}}
				>
					{submitted ? "Submitted" : "I'm done"}
				</button>
			</div>
		</div>
	);
}

function SpectatorStage({
	state,
	liveOps,
	clockOffset,
}: {
	state: RoomState;
	liveOps: [PackedOp[], PackedOp[]];
	clockOffset: number;
}) {
	return (
		<>
			<div
				className="db-bar"
				style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}
			>
				<div>
					<div style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: COLORS.textDim }}>
						{state.phase === "countdown" ? "Starting" : "They're drawing"}
					</div>
					<div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(20px, 3.4vw, 32px)" }}>
						{state.prompt ?? "•••••••"}
					</div>
				</div>
				<TimerRing endsAt={state.endsAt} offset={clockOffset} total={state.settings.seconds} />
			</div>

			<div className="db-duo" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
				{[0, 1].map((i) => (
					<LiveCanvas
						key={i}
						title={state.players[i]?.name ?? `Player ${i + 1}`}
						tint={TINTS[i]}
						packed={liveOps[i]}
						submitted={Boolean(state.players[i]?.submitted)}
					/>
				))}
			</div>
		</>
	);
}

function LiveCanvas({
	title,
	tint,
	packed,
	submitted,
}: {
	title: string;
	tint: string;
	packed: PackedOp[];
	submitted: boolean;
}) {
	const ops = useMemo(() => unpackOps(packed), [packed]);

	return (
		<figure
			style={{
				margin: 0,
				borderRadius: 16,
				overflow: "hidden",
				background: COLORS.bgPanel,
				border: `1px solid ${COLORS.border}`,
			}}
		>
			<figcaption
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					padding: "10px 15px",
					background: tint,
					color: "#0A0A0A",
					fontWeight: 800,
					fontSize: 14,
				}}
			>
				<span>{title}</span>
				<span style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.1em" }}>
					{submitted ? "Done" : `${ops.length} strokes`}
				</span>
			</figcaption>
			<ReplayCanvas ops={ops} play={false} />
		</figure>
	);
}

/* ------------------------------------------------------------------ *
 * Reveal & voting
 * ------------------------------------------------------------------ */

function RevealStage({
	state,
	seat,
	isPlayer,
	isHost,
	clockOffset,
	send,
}: {
	state: RoomState;
	seat: Seat | null;
	isPlayer: boolean;
	isHost: boolean;
	clockOffset: number;
	send: ReturnType<typeof useBattleRoom>["send"];
}) {
	const packed = state.entries ?? [[], []];
	const left = useMemo(() => unpackOps(packed[0]), [packed]);
	const right = useMemo(() => unpackOps(packed[1]), [packed]);
	const [replayDone, setReplayDone] = useState(false);
	const finished = useRef(0);
	const resolved = state.phase === "roundover";

	useEffect(() => {
		finished.current = 0;
		setReplayDone(false);
	}, [state.round]);

	const names = [state.players[0]?.name ?? "Player 1", state.players[1]?.name ?? "Player 2"];
	// Spectators are the judges. Players only decide when nobody is watching.
	const canVote = state.spectators > 0 ? !isPlayer : isPlayer;
	const youVoted = state.votes.youVoted;

	return (
		<div>
			<div style={{ textAlign: "center", marginBottom: 20 }}>
				<div style={{ fontSize: 11.5, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.textDim }}>
					Pencils down — the prompt was
				</div>
				<h2 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(26px, 5vw, 42px)", margin: "8px 0 0" }}>
					{state.prompt}
				</h2>
			</div>

			<div className="db-duo" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
				{[left, right].map((ops, i) => {
					const won = resolved && (state.roundWinner === i || state.roundWinner === -1);
					return (
						<figure
							key={i}
							style={{
								margin: 0,
								borderRadius: 16,
								overflow: "hidden",
								background: COLORS.bgPanel,
								border: `1px solid ${won ? TINTS[i] : COLORS.border}`,
								boxShadow: won ? `0 0 0 2px ${TINTS[i]}55` : "none",
							}}
						>
							<figcaption
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									padding: "11px 16px",
									background: TINTS[i],
									color: "#0A0A0A",
									fontWeight: 800,
									fontSize: 14.5,
								}}
							>
								<span>
									{names[i]}
									{seat === i ? " (you)" : ""}
								</span>
								{resolved && (
									<span style={{ fontSize: 11.5, letterSpacing: "0.1em", textTransform: "uppercase" }}>
										{state.roundWinner === -1 ? "Tie" : state.roundWinner === i ? "Winner" : ""}
									</span>
								)}
							</figcaption>
							<ReplayCanvas
								ops={ops}
								play={!replayDone}
								onDone={() => {
									finished.current += 1;
									if (finished.current >= 2) setReplayDone(true);
								}}
							/>
						</figure>
					);
				})}
			</div>

			{!replayDone && (
				<div style={{ textAlign: "center", marginTop: 20 }}>
					<button type="button" onClick={() => setReplayDone(true)} style={ghost}>
						Skip replay
					</button>
				</div>
			)}

			{replayDone && !resolved && (
				<div style={{ marginTop: 24, textAlign: "center" }}>
					{canVote ? (
						youVoted === null ? (
							<>
								<p style={{ color: COLORS.textDim, fontSize: 14, margin: "0 0 8px" }}>
									{state.spectators > 0
										? "You're judging this one. Who drew it better?"
										: "No spectators — you both have to agree, or it's a draw."}
								</p>
								<div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 12 }}>
									<VoteBtn label={names[0]} tint={TINTS[0]} onClick={() => send({ t: "vote", winner: 0 })} />
									<button type="button" onClick={() => send({ t: "vote", winner: -1 })} style={ghost}>
										Too close to call
									</button>
									<VoteBtn label={names[1]} tint={TINTS[1]} onClick={() => send({ t: "vote", winner: 1 })} />
								</div>
							</>
						) : (
							<p style={{ color: COLORS.textDim, fontSize: 14.5 }}>
								Vote locked in
								{state.spectators > 0
									? ` — waiting for the other ${state.spectators === 1 ? "spectator" : "spectators"}.`
									: " — waiting for your opponent."}
							</p>
						)
					) : (
						<p style={{ color: COLORS.textDim, fontSize: 14.5 }}>
							{state.spectators > 0
								? `${state.spectators} ${state.spectators === 1 ? "spectator is" : "spectators are"} deciding this round.`
								: "Waiting on the vote."}
						</p>
					)}

					<VoteTally tally={state.votes.spectatorTally} names={names} />

					<p style={{ color: COLORS.textDim, fontSize: 12, marginTop: 14 }}>
						Auto-resolves in <TimerText endsAt={state.endsAt} offset={clockOffset} />
					</p>
				</div>
			)}

			{resolved && (
				<div style={{ marginTop: 24, textAlign: "center" }}>
					<p style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 20, margin: "0 0 18px" }}>
						{state.roundWinner === -1
							? "Dead even — a point each."
							: `${names[state.roundWinner ?? 0]} takes the round.`}
					</p>
					<div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
						{isHost && (
							<button type="button" onClick={() => send({ t: "next" })} style={cta}>
								NEXT ROUND
							</button>
						)}
						<button
							type="button"
							onClick={() => downloadComposite(state.prompt ?? "draw battle", names, [left, right], TINTS)}
							style={ghost}
						>
							Download this round
						</button>
					</div>
					{!isHost && (
						<p style={{ color: COLORS.textDim, fontSize: 13, marginTop: 14 }}>
							Waiting for the host to start the next round.
						</p>
					)}
				</div>
			)}
		</div>
	);
}

function TimerText({ endsAt, offset }: { endsAt: number | null; offset: number }) {
	const ms = useRemaining(endsAt, offset);
	return <>{Math.ceil(ms / 1000)}s</>;
}

function VoteTally({ tally, names }: { tally: [number, number, number]; names: string[] }) {
	const total = tally[0] + tally[1] + tally[2];
	if (total === 0) return null;
	return (
		<div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 16, flexWrap: "wrap", fontSize: 13 }}>
			<span style={{ color: TINTS[0], fontWeight: 700 }}>
				{names[0]}: {tally[0]}
			</span>
			<span style={{ color: COLORS.textDim }}>Tie: {tally[2]}</span>
			<span style={{ color: TINTS[1], fontWeight: 700 }}>
				{names[1]}: {tally[1]}
			</span>
		</div>
	);
}

function VoteBtn({ label, tint, onClick }: { label: string; tint: string; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				border: "none",
				background: tint,
				color: "#0A0A0A",
				fontFamily: "inherit",
				fontWeight: 800,
				fontSize: 15,
				padding: "14px 30px",
				borderRadius: 999,
				cursor: "pointer",
			}}
		>
			{label}
		</button>
	);
}

/* ------------------------------------------------------------------ *
 * Match over
 * ------------------------------------------------------------------ */

function MatchOver({
	state,
	isHost,
	send,
}: {
	state: RoomState;
	isHost: boolean;
	send: ReturnType<typeof useBattleRoom>["send"];
}) {
	const names = [state.players[0]?.name ?? "Player 1", state.players[1]?.name ?? "Player 2"];
	const winner = state.matchWinner;

	return (
		<div>
			<section
				style={{
					background: COLORS.bgPanel,
					border: `1px solid ${COLORS.border}`,
					borderRadius: 20,
					padding: "52px 32px",
					textAlign: "center",
					marginBottom: 26,
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
						color: winner === -1 || winner === null ? COLORS.text : TINTS[winner],
					}}
				>
					{winner === -1 || winner === null ? "IT'S A DRAW" : `${names[winner].toUpperCase()} WINS`}
				</h2>
				<p style={{ fontSize: 20, color: COLORS.textDim, margin: "0 0 28px", fontVariantNumeric: "tabular-nums" }}>
					{state.scores[0]} — {state.scores[1]}
				</p>
				<div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
					{isHost && (
						<button type="button" onClick={() => send({ t: "rematch" })} style={cta}>
							REMATCH
						</button>
					)}
					<a href="/upload" style={{ ...ghost, display: "inline-block", textDecoration: "none" }}>
						Drop a winner in the gallery
					</a>
					<a href="/draw-battle/online" style={{ ...ghost, display: "inline-block", textDecoration: "none" }}>
						New room
					</a>
				</div>
				{!isHost && (
					<p style={{ color: COLORS.textDim, fontSize: 13, marginTop: 16 }}>
						The host can start a rematch in this same room.
					</p>
				)}
			</section>

			{state.log.length > 0 && (
				<div style={{ maxWidth: 520, margin: "0 auto" }}>
					<h3
						style={{
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: 15,
							letterSpacing: 0.4,
							textAlign: "center",
							margin: "0 0 14px",
						}}
					>
						THE MATCH
					</h3>
					{state.log.map((entry) => (
						<div
							key={entry.round}
							style={{
								display: "flex",
								justifyContent: "space-between",
								gap: 12,
								padding: "12px 16px",
								borderBottom: `1px solid ${COLORS.border}`,
								fontSize: 14,
							}}
						>
							<span style={{ color: COLORS.textDim }}>Round {entry.round}</span>
							<span style={{ fontWeight: 600 }}>{entry.prompt}</span>
							<span
								style={{
									fontWeight: 700,
									color: entry.winner === -1 ? COLORS.textDim : TINTS[entry.winner],
								}}
							>
								{entry.winner === -1 ? "Tie" : names[entry.winner]}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

const cta: React.CSSProperties = {
	background: COLORS.accent,
	color: "#0A0A0A",
	border: "none",
	fontFamily: "'Archivo Black', sans-serif",
	fontSize: 15,
	padding: "14px 32px",
	borderRadius: 999,
	cursor: "pointer",
};

const ghost: React.CSSProperties = {
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
