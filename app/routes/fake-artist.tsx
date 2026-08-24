import type { Route } from "./+types/fake-artist";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { BattleHeader } from "../components/BattleHeader";
import { ROOM_CODE_LENGTH, isValidRoomCode, randomRoomCode } from "../lib/room-code";
import { MIN_PLAYERS, PASS_CHOICES, ROUND_CHOICES, STROKE_SECONDS_CHOICES } from "../lib/fake-artist-protocol";

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "Fake Artist — ArtDrop Spot" },
		{
			name: "description",
			content:
				"Everyone knows the word except one player. Draw one stroke each, then work out who was faking it.",
		},
	];
}

const COLORS = {
	bg: "#0A0A0A",
	bgPanel: "#1A1A1A",
	accent: "#FACC15",
	rose: "#F472B6",
	text: "#FFFFFF",
	textDim: "#9CA3AF",
	border: "#2E2E2E",
};

const NAME_KEY = "drawBattleName";

export default function FakeArtistLanding() {
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [rounds, setRounds] = useState<number>(3);
	const [passes, setPasses] = useState<number>(2);
	const [strokeSeconds, setStrokeSeconds] = useState<number>(25);
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
		const params = new URLSearchParams({
			rounds: String(rounds),
			passes: String(passes),
			strokeSeconds: String(strokeSeconds),
		});
		navigate(`/fake-artist/room/${randomRoomCode()}?${params}`);
	}

	function join(event: React.FormEvent) {
		event.preventDefault();
		const clean = code.trim().toUpperCase();
		if (!isValidRoomCode(clean)) {
			setProblem(`Room codes are ${ROOM_CODE_LENGTH} characters — check it and try again.`);
			return;
		}
		remember();
		navigate(`/fake-artist/room/${clean}`);
	}

	return (
		<div style={{ fontFamily: "'Inter', sans-serif", background: COLORS.bg, color: COLORS.text, minHeight: "100vh" }}>
			<link
				rel="stylesheet"
				href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700&display=swap"
			/>
			<style>{`
				@media (max-width: 860px) {
					.db-nav { flex-wrap: wrap !important; gap: 12px 18px !important; justify-content: center !important; }
					.fa-title { font-size: 32px !important; }
				}
			`}</style>

			<BattleHeader />

			<main style={{ maxWidth: 1080, margin: "0 auto", padding: "34px 22px 80px" }}>
				<div style={{ marginBottom: 18 }}>
					<a href="/games" style={{ color: COLORS.textDim, textDecoration: "none", fontSize: 13.5, fontWeight: 600 }}>
						← All games
					</a>
				</div>

				<section style={{ textAlign: "center", padding: "10px 0 38px" }}>
					<span
						style={{
							display: "inline-block",
							fontSize: 12,
							letterSpacing: "0.18em",
							textTransform: "uppercase",
							color: COLORS.rose,
							fontWeight: 700,
							marginBottom: 14,
						}}
					>
						{MIN_PLAYERS}–10 players · online
					</span>
					<h1
						className="fa-title"
						style={{
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: "clamp(34px, 6vw, 60px)",
							lineHeight: 1.04,
							margin: "0 0 16px",
							background: `linear-gradient(90deg, ${COLORS.text}, ${COLORS.rose})`,
							WebkitBackgroundClip: "text",
							WebkitTextFillColor: "transparent",
							backgroundClip: "text",
						}}
					>
						ONE OF YOU
						<br />
						IS FAKING IT.
					</h1>
					<p style={{ color: COLORS.textDim, fontSize: 16, maxWidth: 560, margin: "0 auto", lineHeight: 1.65 }}>
						Everybody gets the same secret word — except one player, who only sees the
						category. You take turns adding a single stroke each, then vote on who was
						bluffing. Being good at drawing will not save you.
					</p>
				</section>

				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 20 }}>
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
						<p style={hint}>Shown on the scoreboard and in the accusations.</p>
					</Panel>

					<Panel title="Strokes each">
						<Segmented
							options={PASS_CHOICES.map((p) => ({ value: p, label: p === 1 ? "1 pass" : `${p} passes` }))}
							value={passes}
							onChange={setPasses}
						/>
						<p style={hint}>How many times the turn order goes around before the vote.</p>
					</Panel>

					<Panel title="Time per stroke">
						<Segmented
							options={STROKE_SECONDS_CHOICES.map((s) => ({ value: s, label: `${s}s` }))}
							value={strokeSeconds}
							onChange={setStrokeSeconds}
						/>
						<p style={hint}>Run out of time and you forfeit that stroke — very suspicious.</p>
					</Panel>

					<Panel title="Rounds">
						<Segmented
							options={ROUND_CHOICES.map((r) => ({ value: r, label: String(r) }))}
							value={rounds}
							onChange={setRounds}
						/>
						<p style={hint}>A new faker and a new word every round.</p>
					</Panel>
				</div>

				<div style={{ textAlign: "center", marginTop: 34 }}>
					<button
						type="button"
						onClick={create}
						style={{
							background: COLORS.rose,
							color: "#0A0A0A",
							border: "none",
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: 17,
							letterSpacing: 0.5,
							padding: "16px 42px",
							borderRadius: 999,
							cursor: "pointer",
							boxShadow: `0 12px 34px ${COLORS.rose}33`,
						}}
					>
						CREATE ROOM
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
						<span><b style={{ color: COLORS.text }}>1.</b> Everyone but one sees the word</span>
						<span><b style={{ color: COLORS.text }}>2.</b> One stroke each, in turn</span>
						<span><b style={{ color: COLORS.text }}>3.</b> Vote on the faker</span>
						<span><b style={{ color: COLORS.text }}>4.</b> Caught? They still get one guess</span>
					</div>
				</div>

				<section
					style={{
						maxWidth: 700,
						margin: "44px auto 0",
						background: COLORS.bgPanel,
						border: `1px solid ${COLORS.border}`,
						borderRadius: 16,
						padding: 24,
					}}
				>
					<h2 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 16, margin: "0 0 12px" }}>
						The trick
					</h2>
					<p style={{ color: COLORS.textDim, fontSize: 14, lineHeight: 1.7, margin: 0 }}>
						If you know the word, drawing it too well tells the faker exactly what it is —
						so you have to prove you know it without giving it away. And if you're the
						faker, the category is your only foothold. Draw something vague, draw it
						confidently, and hope nobody's counting how long you hesitated.
					</p>
				</section>

				<form
					onSubmit={join}
					style={{
						maxWidth: 430,
						margin: "26px auto 0",
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
					<p style={{ color: COLORS.textDim, fontSize: 13.5, margin: "0 0 16px" }}>Join an existing room.</p>
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

const hint: React.CSSProperties = {
	margin: "14px 0 0",
	fontSize: 12.5,
	color: COLORS.textDim,
	lineHeight: 1.5,
};

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
							background: on ? COLORS.rose : "transparent",
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
