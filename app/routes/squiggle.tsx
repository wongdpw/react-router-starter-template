import type { Route } from "./+types/squiggle";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { BattleHeader } from "../components/BattleHeader";
import { ReplayCanvas } from "../components/DrawPad";
import { ROOM_CODE_LENGTH, isValidRoomCode, randomRoomCode } from "../lib/room-code";
import { unpackOps } from "../lib/drawing-codec";
import { makeSquiggle } from "../lib/squiggle";
import { MIN_PLAYERS, ROUND_CHOICES, SECONDS_CHOICES } from "../lib/squiggle-protocol";

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "Squiggle Challenge — ArtDrop Spot" },
		{
			name: "description",
			content:
				"Everyone gets the same random squiggle and turns it into something. Draw at the same time, then vote on the best.",
		},
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
};

const NAME_KEY = "drawBattleName";

export default function SquiggleLanding() {
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [rounds, setRounds] = useState<number>(3);
	const [seconds, setSeconds] = useState<number>(90);
	const [code, setCode] = useState("");
	const [problem, setProblem] = useState<string | null>(null);
	const [sampleSeed, setSampleSeed] = useState(0);

	// A live example of what you'd be starting from.
	const sample = useMemo(() => unpackOps(makeSquiggle()), [sampleSeed]);

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
		navigate(`/squiggle/room/${randomRoomCode()}?${new URLSearchParams({ rounds: String(rounds), seconds: String(seconds) })}`);
	}

	function join(event: React.FormEvent) {
		event.preventDefault();
		const clean = code.trim().toUpperCase();
		if (!isValidRoomCode(clean)) {
			setProblem(`Room codes are ${ROOM_CODE_LENGTH} characters — check it and try again.`);
			return;
		}
		remember();
		navigate(`/squiggle/room/${clean}`);
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
					.sq-hero { grid-template-columns: 1fr !important; }
					.sq-title { font-size: 32px !important; }
				}
			`}</style>

			<BattleHeader />

			<main style={{ maxWidth: 1080, margin: "0 auto", padding: "34px 22px 80px" }}>
				<div style={{ marginBottom: 18 }}>
					<a href="/games" style={{ color: COLORS.textDim, textDecoration: "none", fontSize: 13.5, fontWeight: 600 }}>
						← All games
					</a>
				</div>

				<section
					className="sq-hero"
					style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 34, alignItems: "center", padding: "10px 0 40px" }}
				>
					<div>
						<span
							style={{
								display: "inline-block",
								fontSize: 12,
								letterSpacing: "0.18em",
								textTransform: "uppercase",
								color: COLORS.lime,
								fontWeight: 700,
								marginBottom: 14,
							}}
						>
							{MIN_PLAYERS}–8 players · everyone at once
						</span>
						<h1
							className="sq-title"
							style={{
								fontFamily: "'Archivo Black', sans-serif",
								fontSize: "clamp(34px, 5.6vw, 56px)",
								lineHeight: 1.04,
								margin: "0 0 16px",
								background: `linear-gradient(90deg, ${COLORS.text}, ${COLORS.lime})`,
								WebkitBackgroundClip: "text",
								WebkitTextFillColor: "transparent",
								backgroundClip: "text",
							}}
						>
							SAME SQUIGGLE.
							<br />
							DIFFERENT MINDS.
						</h1>
						<p style={{ color: COLORS.textDim, fontSize: 16, lineHeight: 1.65, margin: 0 }}>
							Everyone starts from the exact same random mark and turns it into
							something — all at the same time, no waiting for turns. Then you vote on
							whose was best. The fun is seeing eight people look at one line and
							think of eight different things.
						</p>
					</div>

					<div>
						<div
							style={{
								borderRadius: 16,
								padding: 10,
								background: COLORS.bgPanel,
								border: `1px solid ${COLORS.border}`,
							}}
						>
							<div style={{ borderRadius: 10, overflow: "hidden" }}>
								<ReplayCanvas ops={sample} play={false} />
							</div>
						</div>
						<button
							type="button"
							onClick={() => setSampleSeed((s) => s + 1)}
							style={{
								marginTop: 10,
								width: "100%",
								background: "transparent",
								border: `1px solid ${COLORS.border}`,
								color: COLORS.textDim,
								borderRadius: 999,
								padding: "10px 16px",
								fontFamily: "inherit",
								fontSize: 13,
								fontWeight: 600,
								cursor: "pointer",
							}}
						>
							Show me another squiggle
						</button>
					</div>
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
						<p style={hint}>Shown on the scoreboard when the votes come in.</p>
					</Panel>

					<Panel title="Time to draw">
						<Segmented
							options={SECONDS_CHOICES.map((s) => ({ value: s, label: `${s}s` }))}
							value={seconds}
							onChange={setSeconds}
						/>
						<p style={hint}>Everyone draws simultaneously, so this is the whole round.</p>
					</Panel>

					<Panel title="Rounds">
						<Segmented
							options={ROUND_CHOICES.map((r) => ({ value: r, label: String(r) }))}
							value={rounds}
							onChange={setRounds}
						/>
						<p style={hint}>A brand new squiggle every round.</p>
					</Panel>
				</div>

				<div style={{ textAlign: "center", marginTop: 34 }}>
					<button
						type="button"
						onClick={create}
						style={{
							background: COLORS.lime,
							color: "#0A0A0A",
							border: "none",
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: 17,
							letterSpacing: 0.5,
							padding: "16px 42px",
							borderRadius: 999,
							cursor: "pointer",
							boxShadow: `0 12px 34px ${COLORS.lime}33`,
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
						<span><b style={{ color: COLORS.text }}>1.</b> Everyone gets the same mark</span>
						<span><b style={{ color: COLORS.text }}>2.</b> Draw at the same time</span>
						<span><b style={{ color: COLORS.text }}>3.</b> Vote on somebody else's</span>
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
							background: on ? COLORS.lime : "transparent",
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
