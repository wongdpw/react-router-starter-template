import type { Route } from "./+types/draw-battle.online";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { BattleHeader } from "../components/BattleHeader";
import { ROOM_CODE_LENGTH, isValidRoomCode, randomRoomCode } from "../lib/battle-protocol";

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "Play Draw Battle Online — ArtDrop Spot" },
		{
			name: "description",
			content: "Create a Draw Battle room and share the link. Two players draw, everyone else votes.",
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

export default function DrawBattleOnline() {
	const navigate = useNavigate();
	const [name, setName] = useState("");
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

	function create() {
		rememberName();
		navigate(`/draw-battle/room/${randomRoomCode()}`);
	}

	function join(event: React.FormEvent) {
		event.preventDefault();
		const clean = code.trim().toUpperCase();
		if (!isValidRoomCode(clean)) {
			setProblem(`Room codes are ${ROOM_CODE_LENGTH} characters — check it and try again.`);
			return;
		}
		rememberName();
		navigate(`/draw-battle/room/${clean}`);
	}

	return (
		<div style={{ fontFamily: "'Inter', sans-serif", background: COLORS.bg, color: COLORS.text, minHeight: "100vh" }}>
			<link
				rel="stylesheet"
				href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700&display=swap"
			/>
			<style>{`
				@media (max-width: 760px) {
					.db-nav { flex-wrap: wrap !important; gap: 12px 18px !important; justify-content: center !important; }
					.db-split { grid-template-columns: 1fr !important; }
				}
			`}</style>

			<BattleHeader />

			<main style={{ maxWidth: 860, margin: "0 auto", padding: "44px 22px 80px" }}>
				<div style={{ textAlign: "center", marginBottom: 38 }}>
					<span
						style={{
							fontSize: 12,
							letterSpacing: "0.18em",
							textTransform: "uppercase",
							color: COLORS.blue,
							fontWeight: 700,
						}}
					>
						Online rooms
					</span>
					<h1
						style={{
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: "clamp(30px, 5.5vw, 48px)",
							lineHeight: 1.06,
							margin: "12px 0 14px",
						}}
					>
						DRAW FROM ANYWHERE
					</h1>
					<p style={{ color: COLORS.textDim, maxWidth: 500, margin: "0 auto", lineHeight: 1.65, fontSize: 15.5 }}>
						Two players draw the same prompt at the same time. Anyone else who opens the
						room link watches both canvases live — and they're the ones who vote.
					</p>
				</div>

				<div style={{ marginBottom: 24 }}>
					<label
						htmlFor="db-name"
						style={{
							display: "block",
							fontSize: 11.5,
							letterSpacing: "0.14em",
							textTransform: "uppercase",
							color: COLORS.textDim,
							fontWeight: 700,
							marginBottom: 9,
						}}
					>
						Your name
					</label>
					<input
						id="db-name"
						value={name}
						maxLength={16}
						onChange={(e) => setName(e.target.value)}
						placeholder="What should we call you?"
						style={{
							width: "100%",
							padding: "14px 16px",
							borderRadius: 12,
							border: `1px solid ${COLORS.border}`,
							background: COLORS.bgPanel,
							color: COLORS.text,
							fontFamily: "inherit",
							fontSize: 15,
						}}
					/>
				</div>

				<div className="db-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
					<section
						style={{
							background: `linear-gradient(160deg, ${COLORS.bgPanel}, #16202b)`,
							border: "1px solid #2b3f52",
							borderRadius: 18,
							padding: 26,
							display: "flex",
							flexDirection: "column",
						}}
					>
						<h2 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 19, margin: "0 0 10px" }}>
							Start a room
						</h2>
						<p style={{ color: COLORS.textDim, fontSize: 13.5, lineHeight: 1.6, margin: "0 0 22px", flex: 1 }}>
							You'll get a five-character code and a link to send your opponent. You
							control the settings and start the match.
						</p>
						<button
							type="button"
							onClick={create}
							style={{
								background: COLORS.blue,
								color: "#0A0A0A",
								border: "none",
								fontFamily: "'Archivo Black', sans-serif",
								fontSize: 15,
								padding: "15px 20px",
								borderRadius: 999,
								cursor: "pointer",
							}}
						>
							CREATE ROOM
						</button>
					</section>

					<form
						onSubmit={join}
						style={{
							background: COLORS.bgPanel,
							border: `1px solid ${COLORS.border}`,
							borderRadius: 18,
							padding: 26,
							display: "flex",
							flexDirection: "column",
						}}
					>
						<h2 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 19, margin: "0 0 10px" }}>
							Join a room
						</h2>
						<p style={{ color: COLORS.textDim, fontSize: 13.5, lineHeight: 1.6, margin: "0 0 18px" }}>
							Got a code from someone? Enter it here.
						</p>
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
								width: "100%",
								padding: "14px 16px",
								borderRadius: 12,
								border: `1px solid ${problem ? "#F87171" : COLORS.border}`,
								background: COLORS.bg,
								color: COLORS.text,
								fontFamily: "'Archivo Black', sans-serif",
								fontSize: 22,
								letterSpacing: "0.3em",
								textAlign: "center",
								marginBottom: 14,
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
								padding: "14px 20px",
								borderRadius: 999,
								cursor: "pointer",
							}}
						>
							Join
						</button>
						{problem && (
							<p style={{ color: "#F87171", fontSize: 13, margin: "12px 0 0", textAlign: "center" }}>{problem}</p>
						)}
					</form>
				</div>

				<p style={{ textAlign: "center", marginTop: 30, fontSize: 13.5, color: COLORS.textDim }}>
					Both of you in the same room?{" "}
					<a href="/draw-battle" style={{ color: COLORS.accent, fontWeight: 600 }}>
						Play pass-and-play on one device instead
					</a>
					.
				</p>
			</main>
		</div>
	);
}
