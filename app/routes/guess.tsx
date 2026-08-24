import type { Route } from "./+types/guess";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { BattleHeader } from "../components/BattleHeader";
import { ROOM_CODE_LENGTH, isValidRoomCode, randomRoomCode } from "../lib/room-code";
import { DRAW_SECONDS_CHOICES, ROUND_CHOICES } from "../lib/guess-protocol";
import { DIFFICULTY_LABELS, type GuessDifficulty } from "../lib/guess-words";

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "Guess the Drawing — ArtDrop Spot" },
		{
			name: "description",
			content:
				"One player draws a secret word, everyone else races to type it. Free multiplayer drawing game in your browser.",
		},
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
};

const NAME_KEY = "drawBattleName";
const DIFFICULTIES: GuessDifficulty[] = ["easy", "normal", "hard", "mixed"];

export default function GuessLanding() {
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [rounds, setRounds] = useState<number>(2);
	const [seconds, setSeconds] = useState<number>(80);
	const [difficulty, setDifficulty] = useState<GuessDifficulty>("normal");
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

	function rememberName() {
		try {
			window.localStorage.setItem(NAME_KEY, name.trim());
		} catch {
			/* storage blocked */
		}
	}

	function createRoom() {
		rememberName();
		const params = new URLSearchParams({
			rounds: String(rounds),
			seconds: String(seconds),
			difficulty,
		});
		navigate(`/guess/room/${randomRoomCode()}?${params}`);
	}

	function joinRoom(event: React.FormEvent) {
		event.preventDefault();
		const clean = code.trim().toUpperCase();
		if (!isValidRoomCode(clean)) {
			setProblem(`Room codes are ${ROOM_CODE_LENGTH} characters — check it and try again.`);
			return;
		}
		rememberName();
		navigate(`/guess/room/${clean}`);
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
					.gl-grid { grid-template-columns: 1fr !important; }
					.gl-title { font-size: 32px !important; }
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
							color: COLORS.blue,
							fontWeight: 700,
							marginBottom: 14,
						}}
					>
						2–10 players · online
					</span>
					<h1
						className="gl-title"
						style={{
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: "clamp(34px, 6vw, 60px)",
							lineHeight: 1.04,
							margin: "0 0 16px",
							background: `linear-gradient(90deg, ${COLORS.text}, ${COLORS.blue})`,
							WebkitBackgroundClip: "text",
							WebkitTextFillColor: "transparent",
							backgroundClip: "text",
						}}
					>
						ONE DRAWS.
						<br />
						EVERYONE GUESSES.
					</h1>
					<p style={{ color: COLORS.textDim, fontSize: 16, maxWidth: 545, margin: "0 auto", lineHeight: 1.65 }}>
						Each turn one player picks a secret word and draws it while everybody else
						races to type it. The faster you guess the more you score — and the drawer
						earns for every person who gets there.
					</p>
				</section>

				<div className="gl-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
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
						<p style={hint}>This is what everyone sees in the scoreboard and chat.</p>
					</Panel>

					<Panel title="Time to draw">
						<Segmented
							options={DRAW_SECONDS_CHOICES.map((s) => ({ value: s, label: `${s}s` }))}
							value={seconds}
							onChange={setSeconds}
						/>
						<p style={hint}>Letters of the word get revealed as the clock runs down.</p>
					</Panel>

					<Panel title="Rounds">
						<Segmented
							options={ROUND_CHOICES.map((r) => ({ value: r, label: r === 1 ? "1 round" : `${r} rounds` }))}
							value={rounds}
							onChange={setRounds}
						/>
						<p style={hint}>Everyone draws once per round, so the turns scale with the group.</p>
					</Panel>

					<Panel title="Word difficulty">
						<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
							{DIFFICULTIES.map((d) => {
								const on = difficulty === d;
								return (
									<button
										key={d}
										type="button"
										onClick={() => setDifficulty(d)}
										aria-pressed={on}
										style={{
											padding: "9px 15px",
											borderRadius: 999,
											fontSize: 13,
											fontWeight: 600,
											fontFamily: "inherit",
											cursor: "pointer",
											background: on ? COLORS.blue : "transparent",
											color: on ? "#0A0A0A" : COLORS.text,
											border: `1px solid ${on ? COLORS.blue : COLORS.border}`,
										}}
									>
										{DIFFICULTY_LABELS[d]}
									</button>
								);
							})}
						</div>
						<p style={hint}>The drawer always gets three words to choose between.</p>
					</Panel>
				</div>

				<div style={{ textAlign: "center", marginTop: 34 }}>
					<button
						type="button"
						onClick={createRoom}
						style={{
							background: COLORS.blue,
							color: "#0A0A0A",
							border: "none",
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: 17,
							letterSpacing: 0.5,
							padding: "16px 42px",
							borderRadius: 999,
							cursor: "pointer",
							boxShadow: `0 12px 34px ${COLORS.blue}33`,
						}}
					>
						CREATE ROOM
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
						<span><b style={{ color: COLORS.text }}>1.</b> Create a room</span>
						<span><b style={{ color: COLORS.text }}>2.</b> Share the link</span>
						<span><b style={{ color: COLORS.text }}>3.</b> Take turns drawing</span>
						<span><b style={{ color: COLORS.text }}>4.</b> Type your guesses</span>
					</div>
				</div>

				<form
					onSubmit={joinRoom}
					style={{
						maxWidth: 430,
						margin: "44px auto 0",
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
					<p style={{ color: COLORS.textDim, fontSize: 13.5, margin: "0 0 16px" }}>
						Join an existing room instead.
					</p>
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
		<section
			style={{ background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 22 }}
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
							background: on ? COLORS.blue : "transparent",
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
