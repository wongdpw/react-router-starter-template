import type { Route } from "./+types/galaga";
import { useEffect } from "react";
import { BattleHeader } from "../components/BattleHeader";
import { HighScoreBoard, InitialsPrompt, useHighScores } from "../components/HighScores";

export function meta({}: Route.MetaArgs) {
	return [{ title: "Galaga — Games — ArtDrop Spot" }];
}

const COLORS = {
	bg: "#0A0A0A",
	text: "#FFFFFF",
	textDim: "#9CA3AF",
	border: "#2E2E2E",
};

// The game is a self-contained HTML5 canvas game served as a static asset
// from /public/galaga-game.html. Embedding it in an iframe keeps its own
// code untouched while this route supplies the site header and the shared
// arcade high-score board.
export default function Galaga({}: Route.ComponentProps) {
	const { board, pendingScore, justRanked, finishRun, submit, dismiss } = useHighScores("galaga");

	// The game posts its final score out when a run ends.
	useEffect(() => {
		function onMessage(event: MessageEvent) {
			if (event.origin !== window.location.origin) return;
			const data = event.data as { type?: unknown; game?: unknown; score?: unknown } | null;
			if (!data || data.type !== "arcade:gameover" || data.game !== "galaga") return;
			if (typeof data.score !== "number" || !Number.isFinite(data.score)) return;
			finishRun(data.score);
		}
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [finishRun]);

	return (
		<div style={{ fontFamily: "'Inter', sans-serif", background: COLORS.bg, color: COLORS.text, minHeight: "100vh" }}>
			<link
				rel="stylesheet"
				href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700&display=swap"
			/>

			<BattleHeader />

			<div
				style={{
					maxWidth: 920,
					width: "100%",
					margin: "0 auto",
					padding: "28px 22px 60px",
					textAlign: "center",
					boxSizing: "border-box",
				}}
			>
				<h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 32, margin: "0 0 8px" }}>Galaga</h1>
				<p style={{ color: COLORS.textDim, fontSize: 13, margin: "0 0 18px" }}>
					Click the game once to give it keyboard focus.
				</p>

				{pendingScore !== null && (
					<InitialsPrompt score={pendingScore} onSubmit={submit} onCancel={dismiss} />
				)}

				<iframe
					src="/galaga-game.html"
					title="Galaga"
					allow="fullscreen"
					style={{
						width: "100%",
						height: 820,
						border: `2px solid ${COLORS.border}`,
						borderRadius: 12,
						display: "block",
						background: "#07070d",
					}}
				/>

				<HighScoreBoard board={board} highlight={justRanked} />
			</div>
		</div>
	);
}
