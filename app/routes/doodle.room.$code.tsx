import type { Route } from "./+types/doodle.room.$code";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { DrawPad, ReplayCanvas, opsToDataURL, type DrawPadHandle, type Op } from "../components/DrawPad";
import { BattleHeader } from "../components/BattleHeader";
import { isValidRoomCode } from "../lib/room-code";
import { packOps, unpackOps } from "../lib/drawing-codec";
import {
	MAX_CHAT_LEN,
	MIN_PLAYERS,
	PASS_CHOICES,
	TURN_SECONDS_CHOICES,
	type DoodleChatEntry,
	type DoodleState,
} from "../lib/doodle-protocol";
import { useDoodleRoom } from "../lib/useDoodleRoom";

export function meta({ params }: Route.MetaArgs) {
	return [
		{ title: `Board ${params.code?.toUpperCase() ?? ""} — Doodle Board` },
		{ name: "robots", content: "noindex" },
	];
}

const COLORS = {
	bg: "#0A0A0A",
	bgPanel: "#1A1A1A",
	accent: "#FACC15",
	teal: "#2DD4BF",
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

export default function DoodleRoomPage({ params }: Route.ComponentProps) {
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
					title="That board code isn't valid"
					body="Codes are five characters. Check the link you were sent."
					action={{ href: "/doodle", label: "Back to Doodle Board" }}
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
	return <Board code={code} initialName={name} />;
}

function Board({ code, initialName }: { code: string; initialName: string }) {
	const [searchParams] = useSearchParams();
	const [name, setName] = useState(initialName);
	const { state, youId, status, error, chat, canvas, appendLocal, send, clockOffset, dismissError } =
		useDoodleRoom(code, name);
	const padRef = useRef<DrawPadHandle>(null);
	const applied = useRef(false);

	const isHost = Boolean(state && youId && state.hostId === youId);
	const myTurn = Boolean(state && youId && state.activeId === youId);

	/* Settings chosen on the landing page ride in on the URL. */
	useEffect(() => {
		if (applied.current || !state || !isHost || state.phase !== "lobby") return;
		applied.current = true;
		const seconds = Number(searchParams.get("seconds"));
		const passes = Number(searchParams.get("passes"));
		if (!seconds && !passes) return;
		send({ t: "setSettings", settings: { ...(seconds ? { seconds } : {}), ...(passes ? { passes } : {}) } });
	}, [state, isHost, searchParams, send]);

	/* Your own additions live in the shared picture, so the pad starts clean each turn. */
	useEffect(() => {
		padRef.current?.reset();
	}, [state?.activeId, state?.pass]);

	const shared = useMemo(() => unpackOps(canvas), [canvas]);

	function handleCommit(op: Op) {
		const packed = packOps([op])[0];
		send({ t: "op", op: packed });
		appendLocal(packed);
	}

	if (!state) {
		return (
			<Shell>
				<Notice
					title={status === "closed" ? "Couldn't reach the board" : "Connecting…"}
					body={status === "closed" ? "The connection kept dropping. Refresh to try again." : `Joining board ${code}.`}
					action={status === "closed" ? { href: "/doodle", label: "Back to Doodle Board" } : undefined}
				/>
			</Shell>
		);
	}

	return (
		<Shell>
			<TopBar code={code} status={status} state={state} marks={canvas.length} />

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
					onStart={() => send({ t: "start" })}
					onSettings={(s) => send({ t: "setSettings", settings: s })}
				/>
			) : (
				<div className="dd-grid" style={{ display: "grid", gridTemplateColumns: "215px minmax(0,1fr) 290px", gap: 16 }}>
					<Contributors state={state} youId={youId} />

					<div>
						<TurnBar
							state={state}
							clockOffset={clockOffset}
							myTurn={myTurn}
							isHost={isHost}
							onDone={() => send({ t: "done" })}
							onFinish={() => send({ t: "finish" })}
						/>

						<div style={{ position: "relative" }}>
							{myTurn && state.phase === "drawing" ? (
								<DrawPad ref={padRef} theme={PAD_THEME} baseOps={shared} icons onCommit={handleCommit} />
							) : (
								<SharedCanvas ops={shared} />
							)}

							{state.phase === "finished" && (
								<Veil>
									<Finished
										state={state}
										isHost={isHost}
										ops={shared}
										onPlayAgain={() => send({ t: "playAgain" })}
									/>
								</Veil>
							)}
						</div>
					</div>

					<ChatPanel chat={chat} onSend={(text) => send({ t: "chat", text })} />
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
				@keyframes dd-pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
				@media (max-width: 1000px) {
					.db-nav { flex-wrap: wrap !important; gap: 12px 18px !important; justify-content: center !important; }
					.dd-grid { grid-template-columns: 1fr !important; }
					.dd-bar { flex-direction: column !important; align-items: stretch !important; }
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
						background: COLORS.teal,
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

/**
 * `marks` comes from the local canvas rather than server state: ops are
 * relayed without a state broadcast, so the server's count only refreshes at
 * turn boundaries while this updates on every stroke.
 */
function TopBar({
	code,
	status,
	state,
	marks,
}: {
	code: string;
	status: string;
	state: DoodleState;
	marks: number;
}) {
	const [copied, setCopied] = useState(false);
	const dot = status === "open" ? COLORS.good : status === "reconnecting" ? COLORS.accent : COLORS.bad;

	return (
		<div className="dd-bar" style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
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
			{state.phase === "drawing" && (
				<span
					style={{
						padding: "8px 15px",
						borderRadius: 999,
						border: `1px solid ${COLORS.border}`,
						fontSize: 12.5,
						color: COLORS.textDim,
					}}
				>
					Pass {state.pass} of {state.settings.passes} · {marks} marks on the board
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
	onStart,
	onSettings,
}: {
	state: DoodleState;
	youId: string | null;
	isHost: boolean;
	name: string;
	onRename: (n: string) => void;
	onStart: () => void;
	onSettings: (s: { seconds?: number; passes?: number }) => void;
}) {
	const connected = state.players.filter((p) => p.connected);
	const enough = connected.length >= MIN_PLAYERS;

	return (
		<div className="dd-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 20 }}>
			<section style={{ background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 26 }}>
				<h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 24, margin: "0 0 6px" }}>Waiting room</h1>
				<p style={{ color: COLORS.textDim, fontSize: 14, margin: "0 0 22px", lineHeight: 1.6 }}>
					Share the link and start whenever. No ready-up needed — anyone who turns up
					late just joins the end of the rotation.
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
								border: `1px solid ${p.id === youId ? COLORS.teal : COLORS.border}`,
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
									background: COLORS.teal,
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
						</div>
					))}
				</div>

				<label
					htmlFor="dd-name"
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
					id="dd-name"
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

				{isHost ? (
					<button
						type="button"
						disabled={!enough}
						onClick={onStart}
						title={enough ? "" : `Need at least ${MIN_PLAYERS} people`}
						style={{
							width: "100%",
							background: enough ? COLORS.teal : "transparent",
							color: enough ? "#0A0A0A" : COLORS.textDim,
							border: `1px solid ${enough ? COLORS.teal : COLORS.border}`,
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: 15,
							padding: "14px 22px",
							borderRadius: 999,
							cursor: enough ? "pointer" : "not-allowed",
						}}
					>
						START THE BOARD
					</button>
				) : (
					<p style={{ color: COLORS.textDim, fontSize: 13.5, textAlign: "center", margin: 0 }}>
						Waiting for the host to start.
					</p>
				)}
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
				<Field label="Time per turn">
					<Seg
						options={TURN_SECONDS_CHOICES.map((s) => ({ value: s, label: `${s}s` }))}
						value={state.settings.seconds}
						disabled={!isHost}
						onChange={(v) => onSettings({ seconds: v })}
					/>
				</Field>
				<Field label="Turns each">
					<Seg
						options={PASS_CHOICES.map((p) => ({ value: p, label: String(p) }))}
						value={state.settings.passes}
						disabled={!isHost}
						onChange={(v) => onSettings({ passes: v })}
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
					{connected.length || "n"} people × {state.settings.passes} turns ={" "}
					{(connected.length || 0) * state.settings.passes} goes at the canvas. The host
					can call it finished early.
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
							background: on ? COLORS.teal : "transparent",
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
 * In session
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

function Contributors({ state, youId }: { state: DoodleState; youId: string | null }) {
	// Kept in turn order rather than ranked — there is nothing to rank.
	const ordered = state.order.length
		? state.order.map((id) => state.players.find((p) => p.id === id)).filter(Boolean)
		: state.players;

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
				Turn order
			</h2>
			<div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
				{(ordered as DoodleState["players"]).map((p) => {
					const active = state.activeId === p.id;
					return (
						<div
							key={p.id}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								padding: "8px 10px",
								borderRadius: 9,
								background: active ? `${COLORS.teal}20` : "transparent",
								border: `1px solid ${active ? COLORS.teal : "transparent"}`,
								opacity: p.connected ? 1 : 0.45,
							}}
						>
							<span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: p.id === youId ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
								{p.name}
							</span>
							{active && <span title="Drawing now">✏️</span>}
							<span style={{ fontSize: 11.5, color: COLORS.textDim }}>{p.contributions}</span>
						</div>
					);
				})}
			</div>
		</aside>
	);
}

function TurnBar({
	state,
	clockOffset,
	myTurn,
	isHost,
	onDone,
	onFinish,
}: {
	state: DoodleState;
	clockOffset: number;
	myTurn: boolean;
	isHost: boolean;
	onDone: () => void;
	onFinish: () => void;
}) {
	const ms = useRemaining(state.endsAt, clockOffset);
	const low = state.phase === "drawing" && ms <= 8000;
	const active = state.players.find((p) => p.id === state.activeId);

	return (
		<div className="dd-bar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 12, flexWrap: "wrap" }}>
			<div style={{ minWidth: 0 }}>
				<div style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: COLORS.textDim }}>
					{state.phase === "finished" ? "All done" : myTurn ? "Your turn" : "Now drawing"}
				</div>
				<div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(19px, 3vw, 29px)", lineHeight: 1.2 }}>
					{state.phase === "finished" ? "Finished picture" : myTurn ? "Add anything you like" : (active?.name ?? "…")}
				</div>
			</div>

			{state.phase === "drawing" && (
				<div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
					<span
						style={{
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: 26,
							fontVariantNumeric: "tabular-nums",
							color: low ? COLORS.bad : COLORS.text,
							animation: low ? "dd-pulse 1s ease-in-out infinite" : "none",
							minWidth: "2.4ch",
							textAlign: "right",
						}}
					>
						<Secs endsAt={state.endsAt} offset={clockOffset} />
					</span>
					{myTurn && (
						<button
							type="button"
							onClick={onDone}
							style={{
								padding: "12px 22px",
								borderRadius: 999,
								border: `1px solid ${COLORS.teal}`,
								background: COLORS.teal,
								color: "#0A0A0A",
								fontFamily: "inherit",
								fontWeight: 700,
								fontSize: 14,
								cursor: "pointer",
								whiteSpace: "nowrap",
							}}
						>
							Pass it on
						</button>
					)}
					{isHost && (
						<button
							type="button"
							onClick={onFinish}
							style={{
								padding: "12px 18px",
								borderRadius: 999,
								border: `1px solid ${COLORS.border}`,
								background: "transparent",
								color: COLORS.textDim,
								fontFamily: "inherit",
								fontWeight: 600,
								fontSize: 13,
								cursor: "pointer",
								whiteSpace: "nowrap",
							}}
						>
							Finish now
						</button>
					)}
				</div>
			)}
		</div>
	);
}

function SharedCanvas({ ops }: { ops: Op[] }) {
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
				background: "rgba(10,10,10,0.9)",
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

function Finished({
	state,
	isHost,
	ops,
	onPlayAgain,
}: {
	state: DoodleState;
	isHost: boolean;
	ops: Op[];
	onPlayAgain: () => void;
}) {
	function download() {
		const a = document.createElement("a");
		a.download = `doodle-board-${state.code.toLowerCase()}.png`;
		a.href = opsToDataURL(ops);
		a.click();
	}

	const contributors = state.players.filter((p) => p.contributions > 0);

	return (
		<div style={{ textAlign: "center", maxWidth: 460 }}>
			<div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(24px, 5vw, 38px)", marginBottom: 10 }}>
				NICE WORK
			</div>
			<p style={{ color: COLORS.textDim, fontSize: 14.5, lineHeight: 1.6, margin: "0 0 8px" }}>
				{contributors.length} {contributors.length === 1 ? "person" : "people"} put{" "}
				{ops.length} marks on this one.
			</p>
			<p style={{ color: COLORS.textDim, fontSize: 13, margin: "0 0 24px" }}>
				{contributors.map((p) => p.name).join(" · ")}
			</p>
			<div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
				<button
					type="button"
					onClick={download}
					style={{
						background: COLORS.teal,
						color: "#0A0A0A",
						border: "none",
						fontFamily: "'Archivo Black', sans-serif",
						fontSize: 15,
						padding: "13px 28px",
						borderRadius: 999,
						cursor: "pointer",
					}}
				>
					DOWNLOAD IT
				</button>
				<a
					href="/upload"
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
					Put it in the gallery
				</a>
				{isHost && (
					<button
						type="button"
						onClick={onPlayAgain}
						style={{
							background: "transparent",
							border: `1px solid ${COLORS.border}`,
							color: COLORS.text,
							fontFamily: "inherit",
							fontWeight: 600,
							fontSize: 14,
							padding: "13px 24px",
							borderRadius: 999,
							cursor: "pointer",
						}}
					>
						Start a fresh one
					</button>
				)}
			</div>
		</div>
	);
}

function ChatPanel({ chat, onSend }: { chat: DoodleChatEntry[]; onSend: (text: string) => void }) {
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
				height: 520,
			}}
		>
			<div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 7 }}>
				{chat.length === 0 && <p style={{ color: COLORS.textDim, fontSize: 13, margin: 0 }}>Say something.</p>}
				{chat.map((entry) =>
					entry.kind === "chat" ? (
						<div key={entry.id} style={{ fontSize: 13.5, lineHeight: 1.45, wordBreak: "break-word" }}>
							<b style={{ color: COLORS.teal }}>{entry.from}</b> <span>{entry.text}</span>
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
