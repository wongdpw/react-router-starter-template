import type { Route } from "./+types/doodle";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { BattleHeader } from "../components/BattleHeader";
import { ROOM_CODE_LENGTH, isValidRoomCode, randomRoomCode } from "../lib/room-code";
import { MIN_PLAYERS, PASS_CHOICES, TURN_SECONDS_CHOICES } from "../lib/doodle-protocol";
import { ICONS, iconSvgChildren } from "../lib/icons";

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "Doodle Board — ArtDrop Spot" },
		{
			name: "description",
			content:
				"Everyone takes a turn adding to the same picture. No scores, no winner — just one drawing you all made together.",
		},
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
};

const NAME_KEY = "drawBattleName";
/** How many icons to show on the landing page before summarising the rest. */
const PREVIEW_COUNT = 24;

export default function DoodleLanding() {
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [seconds, setSeconds] = useState<number>(45);
	const [passes, setPasses] = useState<number>(3);
	const [code, setCode] = useState("");
	const [problem, setProblem] = useState<string | null>(null);

	useEffect(() => {
		try {
			const saved = window.localStorage.getItem(NAME_KEY);
			if (saved) setName(saved);
		} catch {
			/* storage blocked */
		}
	}, []);

	function remember() {
		try {
			window.localStorage.setItem(NAME_KEY, name.trim());
		} catch {
			/* storage blocked */
		}
	}

	function create() {
		remember();
		navigate(`/doodle/room/${randomRoomCode()}?${new URLSearchParams({ seconds: String(seconds), passes: String(passes) })}`);
	}

	function join(event: React.FormEvent) {
		event.preventDefault();
		const clean = code.trim().toUpperCase();
		if (!isValidRoomCode(clean)) {
			setProblem(`Room codes are ${ROOM_CODE_LENGTH} characters — check it and try again.`);
			return;
		}
		remember();
		navigate(`/doodle/room/${clean}`);
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
					.dd-title { font-size: 32px !important; }
				}
			`}</style>

			<BattleHeader />

			<main style={{ maxWidth: 1080, margin: "0 auto", padding: "34px 22px 80px" }}>
				<div style={{ marginBottom: 18 }}>
					<a href="/games" style={{ color: COLORS.textDim, textDecoration: "none", fontSize: 13.5, fontWeight: 600 }}>
						← All games
					</a>
				</div>

				<section style={{ textAlign: "center", padding: "10px 0 34px" }}>
					<span
						style={{
							display: "inline-block",
							fontSize: 12,
							letterSpacing: "0.18em",
							textTransform: "uppercase",
							color: COLORS.teal,
							fontWeight: 700,
							marginBottom: 14,
						}}
					>
						{MIN_PLAYERS}–10 people · nobody wins
					</span>
					<h1
						className="dd-title"
						style={{
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: "clamp(34px, 6vw, 58px)",
							lineHeight: 1.04,
							margin: "0 0 16px",
							background: `linear-gradient(90deg, ${COLORS.text}, ${COLORS.teal})`,
							WebkitBackgroundClip: "text",
							WebkitTextFillColor: "transparent",
							backgroundClip: "text",
						}}
					>
						ONE PICTURE.
						<br />
						EVERYONE'S HANDS.
					</h1>
					<p style={{ color: COLORS.textDim, fontSize: 16, maxWidth: 560, margin: "0 auto", lineHeight: 1.65 }}>
						Take it in turns to add whatever you like to the same canvas — draw it, or
						stamp one of the icons. There's no prompt, no score and no winner. At the
						end you've just got a picture the whole group made.
					</p>
				</section>

				<section
					style={{
						background: COLORS.bgPanel,
						border: `1px solid ${COLORS.border}`,
						borderRadius: 16,
						padding: "18px 22px",
						marginBottom: 24,
					}}
				>
					<div style={{ fontSize: 11.5, letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.textDim, fontWeight: 700, marginBottom: 14 }}>
						Icons you can stamp
					</div>
					<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
						{ICONS.slice(0, PREVIEW_COUNT).map((ic) => (
							<span
								key={ic.id}
								title={ic.name}
								style={{
									width: 44,
									height: 44,
									display: "grid",
									placeItems: "center",
									borderRadius: 11,
									background: COLORS.bg,
									border: `1px solid ${COLORS.border}`,
								}}
							>
								<svg width="28" height="28" viewBox="0 0 100 100" aria-hidden dangerouslySetInnerHTML={{ __html: iconSvgChildren(ic) }} />
							</span>
						))}
						{ICONS.length > PREVIEW_COUNT && (
							<span
								style={{
									minWidth: 44,
									height: 44,
									padding: "0 12px",
									display: "grid",
									placeItems: "center",
									borderRadius: 11,
									background: COLORS.bg,
									border: `1px solid ${COLORS.border}`,
									color: COLORS.textDim,
									fontSize: 12.5,
									fontWeight: 700,
								}}
							>
								+{ICONS.length - PREVIEW_COUNT}
							</span>
						)}
					</div>
					<p style={{ color: COLORS.textDim, fontSize: 12.5, margin: "14px 0 0", lineHeight: 1.5 }}>
						{ICONS.length} to choose from. Click to stamp one, or drag to make it bigger and spin it round.
					</p>
				</section>

				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
					<Panel title="Your name">
						<input
							value={name}
							maxLength={16}
							onChange={(e) => setName(e.target.value)}
							placeholder="What should we call you?"
							aria-label="Your name"
							style={{
								width: "100%",
								padding: "12px 14px",
								borderRadius: 10,
								border: `1px solid ${COLORS.border}`,
								background: COLORS.bg,
								color: COLORS.text,
								fontFamily: "inherit",
								fontSize: 14,
							}}
						/>
						<p style={hint}>Shown when it's your turn.</p>
					</Panel>

					<Panel title="Time per turn">
						<Segmented
							options={TURN_SECONDS_CHOICES.map((s) => ({ value: s, label: `${s}s` }))}
							value={seconds}
							onChange={setSeconds}
						/>
						<p style={hint}>Add as much as you like before it passes on.</p>
					</Panel>

					<Panel title="Turns each">
						<Segmented
							options={PASS_CHOICES.map((p) => ({ value: p, label: String(p) }))}
							value={passes}
							onChange={setPasses}
						/>
						<p style={hint}>How many times the turn order goes around.</p>
					</Panel>
				</div>

				<div style={{ textAlign: "center", marginTop: 32 }}>
					<button
						type="button"
						onClick={create}
						style={{
							background: COLORS.teal,
							color: "#0A0A0A",
							border: "none",
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: 17,
							letterSpacing: 0.5,
							padding: "16px 42px",
							borderRadius: 999,
							cursor: "pointer",
							boxShadow: `0 12px 34px ${COLORS.teal}33`,
						}}
					>
						START A BOARD
					</button>
					<div
						style={{
							display: "flex",
							gap: 24,
							justifyContent: "center",
							flexWrap: "wrap",
							marginTop: 26,
							fontSize: 13.5,
							color: COLORS.textDim,
						}}
					>
						<span><b style={{ color: COLORS.text }}>1.</b> Share the link</span>
						<span><b style={{ color: COLORS.text }}>2.</b> Take turns adding</span>
						<span><b style={{ color: COLORS.text }}>3.</b> Keep the picture</span>
					</div>
				</div>

				<form
					onSubmit={join}
					style={{
						maxWidth: 430,
						margin: "40px auto 0",
						background: COLORS.bgPanel,
						border: `1px solid ${COLORS.border}`,
						borderRadius: 16,
						padding: 24,
						textAlign: "center",
					}}
				>
					<h2 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 17, margin: "0 0 6px" }}>
						Been sent a code?
					</h2>
					<p style={{ color: COLORS.textDim, fontSize: 13.5, margin: "0 0 16px" }}>Join a board in progress.</p>
					<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
						<input
							value={code}
							onChange={(e) => {
								setCode(e.target.value.toUpperCase());
								setProblem(null);
							}}
							maxLength={ROOM_CODE_LENGTH}
							placeholder="ABC12"
							aria-label="Room code"
							style={{
								flex: 1,
								minWidth: 150,
								padding: "13px 14px",
								borderRadius: 10,
								border: `1px solid ${problem ? "#F87171" : COLORS.border}`,
								background: COLORS.bg,
								color: COLORS.text,
								fontFamily: "'Archivo Black', sans-serif",
								fontSize: 20,
								letterSpacing: "0.28em",
								textAlign: "center",
							}}
						/>
						<button
							type="submit"
							style={{
								background: "transparent",
								color: COLORS.text,
								border: `1px solid ${COLORS.border}`,
								fontFamily: "inherit",
								fontWeight: 700,
								fontSize: 14,
								padding: "13px 26px",
								borderRadius: 999,
								cursor: "pointer",
							}}
						>
							Join
						</button>
					</div>
					{problem && <p style={{ color: "#F87171", fontSize: 13, margin: "12px 0 0" }}>{problem}</p>}
				</form>
			</main>
		</div>
	);
}

const hint: React.CSSProperties = { margin: "14px 0 0", fontSize: 12.5, color: COLORS.textDim, lineHeight: 1.5 };

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section style={{ background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 22 }}>
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

function Segmented<T extends number>({
	options,
	value,
	onChange,
}: {
	options: readonly { value: T; label: string }[];
	value: T;
	onChange: (v: T) => void;
}) {
	return (
		<div style={{ display: "flex", border: `1px solid ${COLORS.border}`, borderRadius: 11, overflow: "hidden" }}>
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
							background: on ? COLORS.teal : "transparent",
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
