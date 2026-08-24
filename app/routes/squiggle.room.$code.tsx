import type { Route } from "./+types/squiggle.room.$code";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { DrawPad, ReplayCanvas, type DrawPadHandle } from "../components/DrawPad";
import { BattleHeader } from "../components/BattleHeader";
import { isValidRoomCode } from "../lib/room-code";
import { packOps, unpackOps } from "../lib/drawing-codec";
import {
	MAX_CHAT_LEN,
	MIN_PLAYERS,
	ROUND_CHOICES,
	SECONDS_CHOICES,
	type SquiggleChatEntry,
	type SquiggleState,
} from "../lib/squiggle-protocol";
import { useSquiggleRoom } from "../lib/useSquiggleRoom";

export function meta({ params }: Route.MetaArgs) {
	return [
		{ title: `Room ${params.code?.toUpperCase() ?? ""} — Squiggle Challenge` },
		{ name: "robots", content: "noindex" },
	];
}

const COLORS = {
	bg: "#0A0A0A",
	bgPanel: "#1A1A1A",
	accent: "#FACC15",
	lime: "#A3E635",
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
/** Auto-save points before the deadline, in ms remaining. */
const AUTOSAVE_AT = [900, 250];

export default function SquiggleRoomPage({ params }: Route.ComponentProps) {
	const code = (params.code ?? "").toUpperCase();
	const [name, setName] = useState("");
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		try {
			setName(window.localStorage.getItem(NAME_KEY) ?? "");
		} catch {
			/* storage blocked */
		}
		setLoaded(true);
	}, []);

	if (!isValidRoomCode(code)) {
		return (
			<Shell>
				<Notice
					title="That room code isn't valid"
					body="Room codes are five characters. Check the link you were sent."
					action={{ href: "/squiggle", label: "Back to Squiggle Challenge" }}
				/>
			</Shell>
		);
	}
	if (!loaded) {
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
	const { state, youId, status, error, chat, entries, send, clockOffset, dismissError } = useSquiggleRoom(code, name);
	const padRef = useRef<DrawPadHandle>(null);
	const applied = useRef(false);

	const isHost = Boolean(state && youId && state.hostId === youId);
	const me = state?.players.find((p) => p.id === youId) ?? null;
	const submitted = Boolean(me?.submitted);

	/* Settings chosen on the landing page ride in on the URL. */
	useEffect(() => {
		if (applied.current || !state || !isHost || state.phase !== "lobby") return;
		applied.current = true;
		const rounds = Number(searchParams.get("rounds"));
		const seconds = Number(searchParams.get("seconds"));
		if (!rounds && !seconds) return;
		send({ t: "setSettings", settings: { ...(rounds ? { rounds } : {}), ...(seconds ? { seconds } : {}) } });
	}, [state, isHost, searchParams, send]);

	/* Fresh canvas each round — the squiggle itself is the locked base layer. */
	useEffect(() => {
		if (state?.phase === "drawing") padRef.current?.reset();
	}, [state?.phase, state?.round]);

	const submit = useCallback(
		(final: boolean) => {
			send({ t: "submit", ops: packOps(padRef.current?.getOps() ?? []), final });
		},
		[send]
	);

	/* Auto-save before the server's deadline so nothing is lost. */
	useEffect(() => {
		if (state?.phase !== "drawing" || !state.endsAt || submitted) return;
		const localDeadline = state.endsAt - clockOffset;
		const timers = AUTOSAVE_AT.map((lead) =>
			window.setTimeout(() => submit(false), Math.max(0, localDeadline - lead - Date.now()))
		);
		return () => timers.forEach(window.clearTimeout);
	}, [state?.phase, state?.endsAt, state?.round, submitted, clockOffset, submit]);

	const squiggle = useMemo(() => unpackOps(state?.squiggle ?? []), [state?.squiggle]);

	if (!state) {
		return (
			<Shell>
				<Notice
					title={status === "closed" ? "Couldn't reach the room" : "Connecting…"}
					body={status === "closed" ? "The connection kept dropping. Refresh to try again." : `Joining room ${code}.`}
					action={status === "closed" ? { href: "/squiggle", label: "Back to Squiggle Challenge" } : undefined}
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

			{state.phase === "lobby" && (
				<Lobby
					state={state}
					youId={youId}
					isHost={isHost}
					name={name}
					meReady={Boolean(me?.ready)}
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
				/>
			)}

			{state.phase === "drawing" && (
				<div className="sq-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 290px", gap: 16 }}>
					<div>
						<DrawBar state={state} clockOffset={clockOffset} submitted={submitted} onDone={() => submit(true)} />
						<div style={{ position: "relative" }}>
							<DrawPad ref={padRef} theme={PAD_THEME} baseOps={squiggle} frozen={submitted} />
							{submitted && (
								<Veil>
									<div style={{ textAlign: "center" }}>
										<div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 26, marginBottom: 8 }}>
											Submitted
										</div>
										<div style={{ color: COLORS.textDim, fontSize: 14 }}>
											Waiting for everyone else to finish.
										</div>
									</div>
								</Veil>
							)}
						</div>
					</div>
					<ChatPanel chat={chat} onSend={(text) => send({ t: "chat", text })} />
				</div>
			)}

			{(state.phase === "reveal" || state.phase === "roundend" || state.phase === "gameover") && (
				<Gallery
					state={state}
					youId={youId}
					entries={entries}
					squiggle={squiggle}
					clockOffset={clockOffset}
					isHost={isHost}
					chat={chat}
					onVote={(id) => send({ t: "vote", targetId: id })}
					onChat={(text) => send({ t: "chat", text })}
					onPlayAgain={() => send({ t: "playAgain" })}
				/>
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
				@keyframes sq-pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
				@media (max-width: 1000px) {
					.db-nav { flex-wrap: wrap !important; gap: 12px 18px !important; justify-content: center !important; }
					.sq-grid { grid-template-columns: 1fr !important; }
					.sq-bar { flex-direction: column !important; align-items: stretch !important; }
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
						background: COLORS.lime,
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

function TopBar({ code, status, state }: { code: string; status: string; state: SquiggleState }) {
	const [copied, setCopied] = useState(false);
	const dot = status === "open" ? COLORS.good : status === "reconnecting" ? COLORS.accent : COLORS.bad;

	return (
		<div className="sq-bar" style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
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
					Round {state.round} of {state.settings.rounds}
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
	meReady,
	onRename,
	onReady,
	onStart,
	onSettings,
}: {
	state: SquiggleState;
	youId: string | null;
	isHost: boolean;
	name: string;
	meReady: boolean;
	onRename: (n: string) => void;
	onReady: (v: boolean) => void;
	onStart: () => void;
	onSettings: (s: { rounds?: number; seconds?: number }) => void;
}) {
	const connected = state.players.filter((p) => p.connected);
	const enough = connected.length >= MIN_PLAYERS;
	const allReady = connected.length > 0 && connected.every((p) => p.ready);

	return (
		<div className="sq-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 20 }}>
			<section style={{ background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 26 }}>
				<h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 24, margin: "0 0 6px" }}>Waiting room</h1>
				<p style={{ color: COLORS.textDim, fontSize: 14, margin: "0 0 22px", lineHeight: 1.6 }}>
					Share the invite link. Everyone draws at the same time, so nobody sits waiting
					for a turn — it works fine with two and gets better with six.
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
								border: `1px solid ${p.id === youId ? COLORS.lime : COLORS.border}`,
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
							<span style={{ flex: 1, fontWeight: 600, fontSize: 14.5 }}>
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
					htmlFor="sq-name"
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
					id="sq-name"
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
								background: enough && allReady ? COLORS.lime : "transparent",
								color: enough && allReady ? "#0A0A0A" : COLORS.textDim,
								border: `1px solid ${enough && allReady ? COLORS.lime : COLORS.border}`,
								fontFamily: "'Archivo Black', sans-serif",
								fontSize: 15,
								padding: "14px 22px",
								borderRadius: 999,
								cursor: enough && allReady ? "pointer" : "not-allowed",
							}}
						>
							START
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
						options={SECONDS_CHOICES.map((s) => ({ value: s, label: `${s}s` }))}
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
				<p
					style={{
						fontSize: 12.5,
						color: COLORS.textDim,
						lineHeight: 1.6,
						borderTop: `1px solid ${COLORS.border}`,
						paddingTop: 15,
						margin: "18px 0 0",
					}}
				>
					You can't vote for your own drawing. Each vote is worth 2 points, and winning
					the round adds 3 more.
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
							background: on ? COLORS.lime : "transparent",
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
 * Drawing
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

function Secs({ endsAt, offset }: { endsAt: number | null; offset: number }) {
	const ms = useRemaining(endsAt, offset);
	return <>{Math.ceil(ms / 1000)}</>;
}

function DrawBar({
	state,
	clockOffset,
	submitted,
	onDone,
}: {
	state: SquiggleState;
	clockOffset: number;
	submitted: boolean;
	onDone: () => void;
}) {
	const ms = useRemaining(state.endsAt, clockOffset);
	const low = ms <= 10_000;
	const done = state.players.filter((p) => p.submitted).length;
	const total = state.players.filter((p) => p.connected).length;

	return (
		<div className="sq-bar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 12, flexWrap: "wrap" }}>
			<div>
				<div style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: COLORS.textDim }}>
					Round {state.round}
				</div>
				<div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(19px, 3vw, 29px)", lineHeight: 1.2 }}>
					Turn it into something
				</div>
			</div>
			<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
				<span style={{ fontSize: 12.5, color: COLORS.textDim }}>
					{done}/{total} finished
				</span>
				<span
					style={{
						fontFamily: "'Archivo Black', sans-serif",
						fontSize: 26,
						fontVariantNumeric: "tabular-nums",
						color: low ? COLORS.bad : COLORS.text,
						animation: low ? "sq-pulse 1s ease-in-out infinite" : "none",
						minWidth: "2.6ch",
						textAlign: "right",
					}}
				>
					<Secs endsAt={state.endsAt} offset={clockOffset} />
				</span>
				<button
					type="button"
					onClick={onDone}
					disabled={submitted}
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

/* ------------------------------------------------------------------ *
 * Reveal gallery + voting
 * ------------------------------------------------------------------ */

function Gallery({
	state,
	youId,
	entries,
	squiggle,
	clockOffset,
	isHost,
	chat,
	onVote,
	onChat,
	onPlayAgain,
}: {
	state: SquiggleState;
	youId: string | null;
	entries: Record<string, ReturnType<typeof packOps>>;
	squiggle: ReturnType<typeof unpackOps>;
	clockOffset: number;
	isHost: boolean;
	chat: SquiggleChatEntry[];
	onVote: (id: string) => void;
	onChat: (text: string) => void;
	onPlayAgain: () => void;
}) {
	const voting = state.phase === "reveal";
	const finished = state.phase === "gameover";
	const byId = new Map(state.players.map((p) => [p.id, p]));
	const shown = state.revealIds.filter((id) => entries[id]);

	if (finished) {
		return <FinalScores state={state} isHost={isHost} onPlayAgain={onPlayAgain} />;
	}

	return (
		<div>
			<div style={{ textAlign: "center", marginBottom: 20 }}>
				<div style={{ fontSize: 11.5, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.textDim }}>
					{voting ? "Everyone started from this" : `Round ${state.round} results`}
				</div>
				<div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
					<div
						style={{
							width: 150,
							borderRadius: 12,
							padding: 6,
							background: COLORS.bgPanel,
							border: `1px solid ${COLORS.border}`,
						}}
					>
						<div style={{ borderRadius: 8, overflow: "hidden" }}>
							<ReplayCanvas ops={squiggle} play={false} />
						</div>
					</div>
				</div>
				<p style={{ color: COLORS.textDim, fontSize: 13.5, margin: "14px 0 0" }}>
					{voting ? (
						state.youVoted ? (
							<>Vote locked in — waiting for everyone else. <Secs endsAt={state.endsAt} offset={clockOffset} />s</>
						) : (
							<>Pick your favourite — you can't vote for your own. <Secs endsAt={state.endsAt} offset={clockOffset} />s</>
						)
					) : (
						<>Next round in <Secs endsAt={state.endsAt} offset={clockOffset} />s</>
					)}
				</p>
			</div>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
					gap: 16,
					marginBottom: 22,
				}}
			>
				{shown.map((id) => {
					const player = byId.get(id);
					const mine = id === youId;
					const chosen = state.youVoted === id;
					const won = state.roundWinnerIds.includes(id);
					return (
						<figure
							key={id}
							style={{
								margin: 0,
								borderRadius: 14,
								overflow: "hidden",
								background: COLORS.bgPanel,
								border: `1px solid ${won ? COLORS.lime : chosen ? COLORS.accent : COLORS.border}`,
								boxShadow: won ? `0 0 0 2px ${COLORS.lime}44` : "none",
							}}
						>
							<div style={{ borderBottom: `1px solid ${COLORS.border}` }}>
								<ReplayCanvas ops={unpackOps(entries[id])} play={false} />
							</div>
							<figcaption style={{ padding: "10px 13px" }}>
								<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
									<span style={{ fontWeight: 700, fontSize: 14 }}>
										{player?.name ?? "Unknown"}
										{mine ? " (you)" : ""}
									</span>
									{!voting && (
										<span style={{ fontSize: 13, color: COLORS.lime, fontWeight: 700 }}>
											{player?.votes ?? 0} {player?.votes === 1 ? "vote" : "votes"}
											{(player?.lastDelta ?? 0) > 0 ? ` · +${player?.lastDelta}` : ""}
										</span>
									)}
								</div>
								{voting && (
									<button
										type="button"
										disabled={mine || Boolean(state.youVoted)}
										onClick={() => onVote(id)}
										style={{
											marginTop: 9,
											width: "100%",
											padding: "10px 14px",
											borderRadius: 999,
											border: `1px solid ${chosen ? COLORS.accent : COLORS.border}`,
											background: chosen ? COLORS.accent : "transparent",
											color: chosen ? "#0A0A0A" : mine ? COLORS.textDim : COLORS.text,
											fontFamily: "inherit",
											fontWeight: 700,
											fontSize: 13,
											cursor: mine || state.youVoted ? "not-allowed" : "pointer",
											opacity: mine ? 0.45 : 1,
										}}
									>
										{mine ? "Your drawing" : chosen ? "Your vote" : "Vote for this"}
									</button>
								)}
							</figcaption>
						</figure>
					);
				})}
			</div>

			<div className="sq-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 290px", gap: 16 }}>
				<Scores state={state} youId={youId} />
				<ChatPanel chat={chat} onSend={onChat} />
			</div>
		</div>
	);
}

function Scores({ state, youId }: { state: SquiggleState; youId: string | null }) {
	const sorted = [...state.players].sort((a, b) => b.score - a.score);
	return (
		<aside style={{ background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 16, alignSelf: "start" }}>
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
				{sorted.map((p, i) => (
					<div
						key={p.id}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 10,
							padding: "8px 11px",
							borderRadius: 9,
							background: i === 0 ? `${COLORS.lime}14` : "transparent",
							opacity: p.connected ? 1 : 0.45,
						}}
					>
						<span style={{ fontSize: 11.5, color: COLORS.textDim, width: 14 }}>{i + 1}</span>
						<span style={{ flex: 1, fontSize: 13.5, fontWeight: p.id === youId ? 700 : 500 }}>{p.name}</span>
						<b style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 13 }}>{p.score}</b>
					</div>
				))}
			</div>
		</aside>
	);
}

function FinalScores({ state, isHost, onPlayAgain }: { state: SquiggleState; isHost: boolean; onPlayAgain: () => void }) {
	const sorted = [...state.players].sort((a, b) => b.score - a.score);
	const winner = sorted[0];
	return (
		<div style={{ maxWidth: 520, margin: "20px auto" }}>
			<section
				style={{
					background: COLORS.bgPanel,
					border: `1px solid ${COLORS.border}`,
					borderRadius: 20,
					padding: "46px 30px",
					textAlign: "center",
				}}
			>
				<div style={{ fontSize: 11.5, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.textDim }}>
					Final scores
				</div>
				<div
					style={{
						fontFamily: "'Archivo Black', sans-serif",
						fontSize: "clamp(26px, 5vw, 42px)",
						margin: "10px 0 22px",
						color: COLORS.lime,
					}}
				>
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
								background: COLORS.bg,
								border: `1px solid ${i === 0 ? COLORS.lime : COLORS.border}`,
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
								background: COLORS.lime,
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
			</section>
		</div>
	);
}

function ChatPanel({ chat, onSend }: { chat: SquiggleChatEntry[]; onSend: (text: string) => void }) {
	const [text, setText] = useState("");
	const endRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		endRef.current?.scrollIntoView({ block: "end" });
	}, [chat.length]);

	return (
		<aside
			style={{
				background: COLORS.bgPanel,
				border: `1px solid ${COLORS.border}`,
				borderRadius: 14,
				display: "flex",
				flexDirection: "column",
				height: 420,
			}}
		>
			<div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 7 }}>
				{chat.length === 0 && <p style={{ color: COLORS.textDim, fontSize: 13, margin: 0 }}>Say something.</p>}
				{chat.map((entry) =>
					entry.kind === "chat" ? (
						<div key={entry.id} style={{ fontSize: 13.5, lineHeight: 1.45, wordBreak: "break-word" }}>
							<b style={{ color: COLORS.lime }}>{entry.from}</b> <span>{entry.text}</span>
						</div>
					) : (
						<div key={entry.id} style={{ color: COLORS.textDim, fontSize: 12.5, fontStyle: "italic" }}>
							{entry.text}
						</div>
					)
				)}
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
					placeholder="Say something…"
					style={{
						flex: 1,
						minWidth: 0,
						padding: "11px 13px",
						borderRadius: 9,
						border: `1px solid ${COLORS.border}`,
						background: COLORS.bg,
						color: COLORS.text,
						fontFamily: "inherit",
						fontSize: 13.5,
					}}
				/>
				<button
					type="submit"
					style={{
						background: "transparent",
						color: COLORS.text,
						border: `1px solid ${COLORS.border}`,
						borderRadius: 9,
						padding: "0 15px",
						fontFamily: "inherit",
						fontWeight: 700,
						fontSize: 13,
						cursor: "pointer",
					}}
				>
					Send
				</button>
			</form>
		</aside>
	);
}
