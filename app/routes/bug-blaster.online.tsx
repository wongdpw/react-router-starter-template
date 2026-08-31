import type { Route } from "./+types/bug-blaster.online";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { BattleHeader } from "../components/BattleHeader";
import { ROOM_CODE_LENGTH, isValidRoomCode, randomRoomCode } from "../lib/blaster-protocol";

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "Play Bug Blaster Online — ArtDrop Spot" },
		{
			name: "description",
			content: "Create a Bug Blaster room, share the code, and clear the mushroom field together from two computers.",
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

const NAME_KEY = "bugBlasterName";

export default function BugBlasterOnline() {
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
		navigate(`/bug-blaster/room/${randomRoomCode()}`);
	}

	function join(event: React.FormEvent) {
		event.preventDefault();
		const clean = code.trim().toUpperCase();
		if (!isValidRoomCode(clean)) {
			setProblem(`Room codes are ${ROOM_CODE_LENGTH} characters — check it and try again.`);
			return;
		}
		rememberName();
		navigate(`/bug-blaster/room/${clean}`);
	}

	return (
		<div style={{ fontFamily: "'Inter', sans-serif", background: COLORS.bg, color: COLORS.text, minHeight: "100vh" }}>
			<link
				rel="stylesheet"
				href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700&display=swap"
			/>
			<style>{`
				@media (max-width: 760px) {
					.bb-split { grid-template-columns: 1fr !important; }
				}
			`}</style>

			<BattleHeader />

			<main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 22px 90px" }}>
				<section style={{ textAlign: "center", marginBottom: 36 }}>
					<h1
						style={{
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: "clamp(30px, 5vw, 44px)",
							margin: "0 0 12px",
						}}
					>
						Bug Blaster Online
					</h1>
					<p style={{ color: COLORS.textDim, maxWidth: 480, margin: "0 auto", lineHeight: 1.65, fontSize: 15 }}>
						Two shooters, two computers, one mushroom field. Create a room and
						share the code — whoever creates it hosts and plays Player 1.
					</p>
				</section>

				<label style={{ display: "block", maxWidth: 380, margin: "0 auto 26px" }}>
					<span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDim }}>Your pilot name</span>
					<input
						type="text"
						value={name}
						maxLength={24}
						onChange={(e) => setName(e.target.value)}
						placeholder="Name or handle"
						style={{
							display: "block",
							width: "100%",
							marginTop: 6,
							padding: "11px 12px",
							borderRadius: 8,
							border: `1px solid ${COLORS.border}`,
							background: COLORS.bgPanel,
							color: COLORS.text,
							fontSize: 14,
							fontFamily: "'Inter', sans-serif",
							boxSizing: "border-box",
						}}
					/>
				</label>

				<div className="bb-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
					<div
						style={{
							background: COLORS.bgPanel,
							border: `1px solid ${COLORS.border}`,
							borderRadius: 16,
							padding: 26,
							textAlign: "center",
						}}
					>
						<h2 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 20, margin: "0 0 10px" }}>
							Create a room
						</h2>
						<p style={{ color: COLORS.textDim, fontSize: 13.5, lineHeight: 1.6, margin: "0 0 18px" }}>
							You get a code to share. You host and play the yellow shooter.
						</p>
						<button
							onClick={create}
							style={{
								background: COLORS.accent,
								color: "#0A0A0A",
								border: "none",
								borderRadius: 999,
								padding: "12px 30px",
								fontWeight: 800,
								fontSize: 14,
								cursor: "pointer",
								fontFamily: "'Inter', sans-serif",
							}}
						>
							Create room
						</button>
					</div>

					<div
						style={{
							background: COLORS.bgPanel,
							border: `1px solid ${COLORS.border}`,
							borderRadius: 16,
							padding: 26,
							textAlign: "center",
						}}
					>
						<h2 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 20, margin: "0 0 10px" }}>
							Join a room
						</h2>
						<p style={{ color: COLORS.textDim, fontSize: 13.5, lineHeight: 1.6, margin: "0 0 14px" }}>
							Got a code? You play the cyan shooter.
						</p>
						<form onSubmit={join}>
							<input
								type="text"
								value={code}
								onChange={(e) => {
									setCode(e.target.value.toUpperCase());
									setProblem(null);
								}}
								maxLength={ROOM_CODE_LENGTH}
								placeholder="CODE"
								style={{
									width: 130,
									textAlign: "center",
									letterSpacing: "0.25em",
									padding: "11px 12px",
									borderRadius: 8,
									border: `1px solid ${COLORS.border}`,
									background: COLORS.bg,
									color: COLORS.text,
									fontSize: 16,
									fontWeight: 700,
									fontFamily: "'Inter', sans-serif",
									marginBottom: 14,
									boxSizing: "border-box",
								}}
							/>
							<br />
							<button
								type="submit"
								style={{
									background: "transparent",
									color: COLORS.blue,
									border: `1px solid ${COLORS.blue}`,
									borderRadius: 999,
									padding: "11px 30px",
									fontWeight: 800,
									fontSize: 14,
									cursor: "pointer",
									fontFamily: "'Inter', sans-serif",
								}}
							>
								Join room
							</button>
						</form>
						{problem && (
							<p style={{ color: "#F87171", fontSize: 13, marginTop: 12 }}>{problem}</p>
						)}
					</div>
				</div>

				<p style={{ textAlign: "center", marginTop: 34, color: COLORS.textDim, fontSize: 13.5 }}>
					Rather play on one keyboard?{" "}
					<a href="/bug-blaster" style={{ color: COLORS.accent, fontWeight: 600, textDecoration: "none" }}>
						Local play is here
					</a>
					.
				</p>
			</main>
		</div>
	);
}
