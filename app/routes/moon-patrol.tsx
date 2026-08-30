import type { Route } from "./+types/moon-patrol";
import { BattleHeader } from "../components/BattleHeader";

export function meta({}: Route.MetaArgs) {
	return [{ title: "Moon Patrol — Games — ArtDrop Spot" }];
}

const COLORS = {
	bg: "#0A0A0A",
	text: "#FFFFFF",
	textDim: "#9CA3AF",
	border: "#2E2E2E",
};

// The game itself is a self-contained single-file HTML5 canvas game served
// as a static asset from /public/moon-patrol.html. Embedding it in an
// iframe keeps its code byte-identical (its own sound, fullscreen button,
// high-score localStorage all keep working) while this route provides the
// site header and nav around it.
export default function MoonPatrol({}: Route.ComponentProps) {
	return (
		<div
			style={{
				fontFamily: "'Inter', sans-serif",
				background: COLORS.bg,
				color: COLORS.text,
				minHeight: "100vh",
				display: "flex",
				flexDirection: "column",
			}}
		>
			<link
				rel="stylesheet"
				href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700&display=swap"
			/>

			<BattleHeader />

			<p
				style={{
					textAlign: "center",
					color: COLORS.textDim,
					fontSize: 13,
					margin: "10px 16px 0",
				}}
			>
				Click the game once to give it keyboard focus.
			</p>

			<iframe
				src="/moon-patrol.html"
				title="Moon Patrol"
				allow="fullscreen"
				style={{
					flex: 1,
					width: "100%",
					minHeight: 560,
					border: "none",
					display: "block",
					background: "#07070d",
				}}
			/>
		</div>
	);
}
