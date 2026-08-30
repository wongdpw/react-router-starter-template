import type { Route } from "./+types/games";
import { BattleHeader } from "../components/BattleHeader";
import { DAILY_PROMPT_ENABLED } from "../lib/feature-flags";
import { visitorId, type GameId } from "../lib/game-ids";

export async function loader({ context }: Route.LoaderArgs) {
	const ns = context.cloudflare.env.GAME_STATS;
	try {
		const res = await ns.get(ns.idFromName("global")).fetch("https://stats/counts");
		return { plays: (await res.json()) as Record<string, number> };
	} catch {
		// A stats hiccup must never take the games page down.
		return { plays: {} as Record<string, number> };
	}
}

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "Games — ArtDrop Spot" },
		{
			name: "description",
			content:
				"Drawing games you can play in the browser: Draw Battle, Guess the Drawing and Fake Artist.",
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

interface GameCard {
	id: GameId;
	title: string;
	tagline: string;
	blurb: string;
	players: string;
	modes: string;
	href: string;
	tint: string;
	art: React.ReactNode;
	/** Shown on the hub but not yet playable. */
	comingSoon?: boolean;
}

const GAMES: GameCard[] = [
	{
		id: "daily",
		title: "Daily Prompt",
		tagline: "New every day",
		blurb:
			"One prompt for everybody, changing at midnight. Draw it in your browser, then vote on everyone else's take before the day runs out.",
		players: "Play alone",
		modes: "No room needed",
		href: "/daily",
		tint: "#FB923C",
		art: <DailyArt />,
		comingSoon: !DAILY_PROMPT_ENABLED,
	},
	{
		id: "draw-battle",
		title: "Draw Battle",
		tagline: "Head to head",
		blurb:
			"Two players get the same secret prompt and the same clock. Both drawings replay stroke by stroke, then somebody votes.",
		players: "2 players + spectators",
		modes: "One device or online",
		href: "/draw-battle",
		tint: "#FACC15",
		art: <BattleArt />,
	},
	{
		id: "guess",
		title: "Guess the Drawing",
		tagline: "Everyone plays",
		blurb:
			"One player draws a secret word while everyone else races to type it. Fastest guess scores most, and the drawer earns for every person who gets it.",
		players: "2–10 players",
		modes: "Online rooms",
		href: "/guess",
		tint: "#38BDF8",
		art: <GuessArt />,
	},
	{
		id: "fake-artist",
		title: "Fake Artist",
		tagline: "Social deduction",
		blurb:
			"Everyone gets the same secret word except one player, who only sees the category. One stroke each, then vote on who was bluffing.",
		players: "3–10 players",
		modes: "Online rooms",
		href: "/fake-artist",
		tint: "#F472B6",
		art: <FakeArt />,
	},
	{
		id: "squiggle",
		title: "Squiggle Challenge",
		tagline: "Everyone at once",
		blurb:
			"Everybody starts from the exact same random squiggle and turns it into something. No turns, no waiting — then vote on the best one.",
		players: "2–8 players",
		modes: "Online rooms",
		href: "/squiggle",
		tint: "#A3E635",
		art: <SquiggleArt />,
	},
	{
		id: "doodle",
		title: "Doodle Board",
		tagline: "No winner",
		blurb:
			"Take turns adding whatever you like to one shared picture — draw it, or stamp an icon. No prompt, no score, just something the whole group made.",
		players: "2–10 people",
		modes: "Online rooms",
		href: "/doodle",
		tint: "#2DD4BF",
		art: <DoodleArt />,
	},
	{
		id: "bug-blaster",
		title: "Bug Blaster",
		tagline: "Retro arcade",
		blurb:
			"A mushroom field, a many-segment crawler winding down toward you, and one shot on screen at a time. Split it, clear it, and survive as the waves speed up.",
		players: "Play alone",
		modes: "Keyboard \u00b7 No room needed",
		href: "/bug-blaster",
		tint: "#F87171",
		art: <BlasterArt />,
	},
	{
		id: "moon-patrol",
		title: "Moon Patrol",
		tagline: "Retro arcade",
		blurb:
			"Drive a moon buggy over craters and mines while UFOs strafe from above. Jump, shoot forward and up at once, and see how far along the lunar surface you can get.",
		players: "Play alone",
		modes: "Keyboard \u00b7 No room needed",
		href: "/moon-patrol",
		tint: "#C084FC",
		art: <MoonArt />,
	},
	{
		id: "galaxy-swarm",
		title: "Galaxy Swarm",
		tagline: "Retro arcade",
		blurb:
			"An alien formation sways overhead, peeling off in diving attack runs while you hold the line. Divers are worth double \u2014 if you can hit them mid-swoop.",
		players: "1\u20132 players",
		modes: "Solo or online rooms",
		href: "/galaxy-swarm",
		tint: "#818CF8",
		art: <SwarmArt />,
	},
];

export default function Games({ loaderData }: Route.ComponentProps) {
	const plays = loaderData.plays ?? {};
	// Only games people can actually open compete for the badge.
	const playable = GAMES.filter((g) => !g.comingSoon);
	const best = Math.max(0, ...playable.map((g) => plays[g.id] ?? 0));

	/**
	 * Fired as the browser navigates away, so `keepalive` is what keeps the
	 * request alive long enough to land. Failure is silent by design — a
	 * missed count must never get in the way of opening the game.
	 */
	function recordPlay(id: GameId) {
		try {
			void fetch("/api/game-click", {
				method: "POST",
				keepalive: true,
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ game: id, visitor: visitorId() }),
			}).catch(() => {});
		} catch {
			/* never block the click */
		}
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
					.g-grid { grid-template-columns: 1fr !important; }
				}
				.g-card { transition: transform 160ms ease, border-color 160ms ease; }
				.g-card:hover { transform: translateY(-3px); }
			`}</style>

			<BattleHeader />

			<main style={{ maxWidth: 1080, margin: "0 auto", padding: "48px 22px 90px" }}>
				<section style={{ textAlign: "center", marginBottom: 44 }}>
					<span
						style={{
							fontSize: 12,
							letterSpacing: "0.18em",
							textTransform: "uppercase",
							color: COLORS.accent,
							fontWeight: 700,
						}}
					>
						Play in your browser
					</span>
					<h1
						style={{
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: "clamp(34px, 6vw, 58px)",
							lineHeight: 1.05,
							margin: "12px 0 16px",
						}}
					>
						GAMES
					</h1>
					<p style={{ color: COLORS.textDim, maxWidth: 520, margin: "0 auto", lineHeight: 1.65, fontSize: 15.5 }}>
						Nothing to install and no account needed. Pick a game, share the link, and
						whatever you make can go straight into the gallery.
					</p>
				</section>

				<div className="g-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 22 }}>
					{GAMES.map((game) => {
						const count = plays[game.id] ?? 0;
						const isTop = !game.comingSoon && count > 0 && count === best;
						return (
						<a
							key={game.title}
							href={game.comingSoon ? undefined : game.href}
							onClick={game.comingSoon ? undefined : () => recordPlay(game.id)}
							className={game.comingSoon ? undefined : "g-card"}
							aria-disabled={game.comingSoon || undefined}
							style={{
								display: "flex",
								flexDirection: "column",
								textDecoration: "none",
								color: "inherit",
								background: COLORS.bgPanel,
								border: `1px solid ${COLORS.border}`,
								borderRadius: 20,
								overflow: "hidden",
								cursor: game.comingSoon ? "default" : "pointer",
								opacity: game.comingSoon ? 0.62 : 1,
							}}
						>
							<div
								style={{
									position: "relative",
									height: 150,
									background: `linear-gradient(150deg, ${game.tint}22, ${COLORS.bgPanel} 70%)`,
									borderBottom: `1px solid ${COLORS.border}`,
									display: "grid",
									placeItems: "center",
								}}
							>
								{game.art}
								{!game.comingSoon && count > 0 && (
									<span
										title={`${count} ${count === 1 ? "person has" : "people have"} opened this`}
										style={{
											position: "absolute",
											top: 12,
											right: 12,
											display: "flex",
											alignItems: "center",
											gap: 5,
											background: isTop ? game.tint : COLORS.bgPanel,
											border: `1px solid ${isTop ? game.tint : COLORS.border}`,
											color: isTop ? "#0A0A0A" : COLORS.textDim,
											borderRadius: 999,
											padding: "5px 11px",
											fontSize: 10.5,
											fontWeight: 800,
											letterSpacing: "0.08em",
											textTransform: "uppercase",
											whiteSpace: "nowrap",
										}}
									>
										{isTop && <span aria-hidden>★</span>}
										{isTop ? `Most played · ${count}` : `${count} ${count === 1 ? "play" : "plays"}`}
									</span>
								)}
								{game.comingSoon && (
									<span
										style={{
											position: "absolute",
											top: 12,
											right: 12,
											background: COLORS.bgPanel,
											border: `1px solid ${game.tint}`,
											color: game.tint,
											borderRadius: 999,
											padding: "5px 12px",
											fontSize: 10.5,
											fontWeight: 800,
											letterSpacing: "0.12em",
											textTransform: "uppercase",
										}}
									>
										In development
									</span>
								)}
							</div>
							<div style={{ padding: 26, display: "flex", flexDirection: "column", flex: 1 }}>
								<span
									style={{
										fontSize: 11,
										letterSpacing: "0.16em",
										textTransform: "uppercase",
										color: game.tint,
										fontWeight: 700,
									}}
								>
									{game.tagline}
								</span>
								<h2 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 25, margin: "9px 0 12px" }}>
									{game.title}
								</h2>
								<p style={{ color: COLORS.textDim, fontSize: 14, lineHeight: 1.65, margin: "0 0 20px", flex: 1 }}>
									{game.blurb}
								</p>
								<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
									<Tag>{game.players}</Tag>
									<Tag>{game.modes}</Tag>
								</div>
								<span
									style={{
										alignSelf: "flex-start",
										background: game.comingSoon ? "transparent" : game.tint,
										border: game.comingSoon ? `1px solid ${COLORS.border}` : "1px solid transparent",
										color: game.comingSoon ? COLORS.textDim : "#0A0A0A",
										fontWeight: 800,
										fontSize: 14,
										padding: "12px 26px",
										borderRadius: 999,
									}}
								>
									{game.comingSoon ? "Coming soon" : "Play →"}
								</span>
							</div>
						</a>
						);
					})}
				</div>

				<p style={{ textAlign: "center", marginTop: 40, color: COLORS.textDim, fontSize: 13.5 }}>
					Got an idea for another one?{" "}
					<a href="/board" style={{ color: COLORS.accent, fontWeight: 600 }}>
						Leave it on the bulletin board
					</a>
					.
				</p>
			</main>
		</div>
	);
}

function Tag({ children }: { children: React.ReactNode }) {
	return (
		<span
			style={{
				fontSize: 12,
				color: COLORS.textDim,
				border: `1px solid ${COLORS.border}`,
				borderRadius: 999,
				padding: "5px 12px",
			}}
		>
			{children}
		</span>
	);
}

function BattleArt() {
	return (
		<svg width="150" height="92" viewBox="0 0 150 92" fill="none" aria-hidden>
			<rect x="6" y="10" width="62" height="72" rx="7" fill="#FFFFFF" opacity="0.94" />
			<rect x="82" y="10" width="62" height="72" rx="7" fill="#FFFFFF" opacity="0.94" />
			<path d="M20 62c6-20 14-28 20-28s12 10 16 28" stroke="#111" strokeWidth="3.4" strokeLinecap="round" fill="none" />
			<circle cx="37" cy="31" r="7" stroke="#111" strokeWidth="3.4" fill="none" />
			<path d="M95 64c4-9 9-14 14-14s11 6 14 14" stroke="#111" strokeWidth="3.4" strokeLinecap="round" fill="none" />
			<path d="M101 34l8 8 8-8" stroke="#111" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
			<circle cx="75" cy="46" r="13" fill="#FACC15" />
			<text x="75" y="51" textAnchor="middle" fontSize="12" fontWeight="800" fill="#0A0A0A" fontFamily="Inter, sans-serif">
				VS
			</text>
		</svg>
	);
}

function GuessArt() {
	return (
		<svg width="150" height="92" viewBox="0 0 150 92" fill="none" aria-hidden>
			<rect x="8" y="10" width="80" height="72" rx="7" fill="#FFFFFF" opacity="0.94" />
			<path d="M24 60c8-22 18-30 24-30s10 12 12 30" stroke="#111" strokeWidth="3.4" strokeLinecap="round" fill="none" />
			<circle cx="46" cy="28" r="6" stroke="#111" strokeWidth="3.4" fill="none" />
			<rect x="98" y="20" width="44" height="15" rx="7.5" fill="#38BDF8" />
			<rect x="98" y="41" width="36" height="15" rx="7.5" fill="#2E2E2E" />
			<rect x="98" y="62" width="44" height="15" rx="7.5" fill="#2E2E2E" />
			<text x="120" y="31" textAnchor="middle" fontSize="9" fontWeight="800" fill="#0A0A0A" fontFamily="Inter, sans-serif">
				CAT?
			</text>
		</svg>
	);
}

function FakeArt() {
	return (
		<svg width="150" height="92" viewBox="0 0 150 92" fill="none" aria-hidden>
			<rect x="26" y="10" width="98" height="72" rx="7" fill="#FFFFFF" opacity="0.94" />
			<path d="M44 62c6-18 13-26 19-26" stroke="#111" strokeWidth="3.4" strokeLinecap="round" fill="none" />
			<path d="M63 36c6 0 12 9 15 26" stroke="#E11D48" strokeWidth="3.4" strokeLinecap="round" fill="none" />
			<path d="M84 60c3-11 7-17 11-17" stroke="#111" strokeWidth="3.4" strokeLinecap="round" fill="none" />
			<path d="M95 43c4 0 7 6 9 17" stroke="#111" strokeWidth="3.4" strokeLinecap="round" fill="none" />
			<circle cx="106" cy="24" r="12" fill="#F472B6" />
			<text x="106" y="29" textAnchor="middle" fontSize="13" fontWeight="800" fill="#0A0A0A" fontFamily="Inter, sans-serif">
				?
			</text>
		</svg>
	);
}

function SquiggleArt() {
	return (
		<svg width="150" height="92" viewBox="0 0 150 92" fill="none" aria-hidden>
			<rect x="8" y="12" width="60" height="68" rx="7" fill="#FFFFFF" opacity="0.94" />
			<rect x="82" y="12" width="60" height="68" rx="7" fill="#FFFFFF" opacity="0.94" />
			<path d="M22 56c8-20 20-4 30-24" stroke="#A3E635" strokeWidth="4" strokeLinecap="round" fill="none" />
			<path d="M96 56c8-20 20-4 30-24" stroke="#A3E635" strokeWidth="4" strokeLinecap="round" fill="none" />
			<circle cx="30" cy="40" r="5" stroke="#111" strokeWidth="2.6" fill="none" />
			<path d="M22 66h30" stroke="#111" strokeWidth="2.6" strokeLinecap="round" />
			<path d="M100 66c6-10 14-10 20 0" stroke="#111" strokeWidth="2.6" strokeLinecap="round" fill="none" />
			<path d="M112 22l5 9h-10l5-9Z" stroke="#111" strokeWidth="2.6" strokeLinejoin="round" fill="none" />
		</svg>
	);
}

function DailyArt() {
	return (
		<svg width="150" height="92" viewBox="0 0 150 92" fill="none" aria-hidden>
			<rect x="20" y="8" width="110" height="76" rx="8" fill="#FFFFFF" opacity="0.94" />
			<rect x="20" y="8" width="110" height="18" rx="8" fill="#FB923C" />
			<rect x="20" y="20" width="110" height="6" fill="#FB923C" />
			<circle cx="42" cy="17" r="3" fill="#0A0A0A" opacity="0.5" />
			<circle cx="108" cy="17" r="3" fill="#0A0A0A" opacity="0.5" />
			<path d="M44 68c8-24 18-32 24-32s10 14 12 32" stroke="#111" strokeWidth="3.4" strokeLinecap="round" fill="none" />
			<circle cx="66" cy="34" r="6" stroke="#111" strokeWidth="3.4" fill="none" />
			<path d="M92 44l4 8 4-8" stroke="#FB923C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
		</svg>
	);
}

function DoodleArt() {
	return (
		<svg width="150" height="92" viewBox="0 0 150 92" fill="none" aria-hidden>
			<rect x="22" y="8" width="106" height="76" rx="8" fill="#FFFFFF" opacity="0.94" />
			<path d="M34 62c10-22 18-6 26-24" stroke="#2DD4BF" strokeWidth="4" strokeLinecap="round" fill="none" />
			<path d="M64 66c6-14 14-6 18-18" stroke="#F472B6" strokeWidth="4" strokeLinecap="round" fill="none" />
			<circle cx="98" cy="34" r="9" fill="#FACC15" />
			<path d="M92 62l6-10 6 10Z" fill="#38BDF8" />
			<circle cx="46" cy="26" r="6" fill="#FB923C" />
		</svg>
	);
}

function BlasterArt() {
	return (
		<svg width="150" height="92" viewBox="0 0 150 92" fill="none" aria-hidden>
			<rect x="22" y="8" width="106" height="76" rx="8" fill="#0A0A0A" stroke="#2E2E2E" />
			<circle cx="52" cy="30" r="7" fill="#F87171" />
			<circle cx="66" cy="30" r="7" fill="#F87171" />
			<circle cx="80" cy="30" r="7" fill="#F87171" />
			<circle cx="94" cy="30" r="7" fill="#FACC15" />
			<circle cx="98" cy="28" r="1.6" fill="#0A0A0A" />
			<path d="M38 46a5 5 0 0 1 10 0Z" fill="#4ADE80" />
			<rect x="41.5" y="46" width="3" height="4" fill="#DCFCE7" />
			<path d="M104 50a5 5 0 0 1 10 0Z" fill="#4ADE80" />
			<rect x="107.5" y="50" width="3" height="4" fill="#DCFCE7" />
			<path d="M70 78l-6 -0.5 6 -12 6 12Z" fill="#FACC15" />
			<rect x="69" y="52" width="2.4" height="8" fill="#FFFFFF" />
		</svg>
	);
}

function MoonArt() {
	return (
		<svg width="150" height="92" viewBox="0 0 150 92" fill="none" aria-hidden>
			<rect x="22" y="8" width="106" height="76" rx="8" fill="#0A0A0A" stroke="#2E2E2E" />
			<circle cx="112" cy="24" r="8" fill="#E9D5FF" opacity="0.9" />
			<circle cx="38" cy="20" r="1.4" fill="#FFFFFF" opacity="0.8" />
			<circle cx="58" cy="16" r="1.2" fill="#FFFFFF" opacity="0.6" />
			<circle cx="86" cy="20" r="1.3" fill="#FFFFFF" opacity="0.7" />
			<path d="M52 34l4 6h-8l4 -6Z" fill="#F87171" />
			<ellipse cx="52" cy="33" rx="7" ry="3" fill="#C084FC" />
			<path d="M26 66h20l4 -6h16l4 6h34" stroke="#C084FC" strokeWidth="3" strokeLinecap="round" fill="none" />
			<path d="M104 66c2 -5 6 -5 8 0" stroke="#C084FC" strokeWidth="3" strokeLinecap="round" fill="none" />
			<rect x="60" y="48" width="22" height="9" rx="4" fill="#FACC15" />
			<rect x="76" y="43" width="8" height="6" rx="2" fill="#FACC15" />
			<circle cx="65" cy="60" r="4.5" fill="#2E2E2E" stroke="#9CA3AF" strokeWidth="1.6" />
			<circle cx="77" cy="60" r="4.5" fill="#2E2E2E" stroke="#9CA3AF" strokeWidth="1.6" />
		</svg>
	);
}

function SwarmArt() {
	return (
		<svg width="150" height="92" viewBox="0 0 150 92" fill="none" aria-hidden>
			<rect x="22" y="8" width="106" height="76" rx="8" fill="#0A0A0A" stroke="#2E2E2E" />
			<circle cx="40" cy="18" r="1.2" fill="#FFFFFF" opacity="0.7" />
			<circle cx="72" cy="14" r="1.4" fill="#FFFFFF" opacity="0.8" />
			<circle cx="112" cy="20" r="1.2" fill="#FFFFFF" opacity="0.6" />
			<g fill="#818CF8">
				<path d="M46 26l-5 5h10Z" />
				<path d="M66 26l-5 5h10Z" />
				<path d="M86 26l-5 5h10Z" />
				<path d="M106 26l-5 5h10Z" />
			</g>
			<g fill="#F472B6">
				<path d="M56 38l-5 5h10Z" />
				<path d="M76 38l-5 5h10Z" />
				<path d="M96 38l-5 5h10Z" />
			</g>
			<path d="M104 50l-6 8h12Z" fill="#FACC15" />
			<rect x="74" y="56" width="2.6" height="10" fill="#FFFFFF" />
			<path d="M75 80l-10 -4 4 -8h12l4 8Z" fill="#FACC15" />
			<rect x="73.7" y="64" width="2.6" height="6" fill="#F87171" />
		</svg>
	);
}
