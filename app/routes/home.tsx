import type { Route } from "./+types/home";
import VoteButton from "../components/VoteButton";
import { TopPosters } from "../components/TopPosters";
import { computeTopPosters } from "../lib/leaderboard";
import { useState } from "react";

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "ArtDrop Spot" },
		{ name: "description", content: "Drop your art. Get discovered." },
	];
}

export async function loader({ context }: Route.LoaderArgs) {
	const listed = await context.cloudflare.env.ART_BUCKET.list({
		include: ["customMetadata"],
	});

	const items = listed.objects
		.filter((obj) => !obj.key.startsWith("updates/") && obj.customMetadata?.status === "approved")
		.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime())
		.map((obj) => ({
			key: obj.key,
			title: obj.customMetadata?.title ?? "Untitled",
			artist: obj.customMetadata?.artist ?? "Unknown",
			description: obj.customMetadata?.description ?? "",
			votes: parseInt(obj.customMetadata?.votes ?? "0", 10),
			uploadedAt: obj.uploaded.toISOString(),
		}));

	const topPosters = computeTopPosters(items, 5);

	return { items, topPosters };
}

const COLORS = {
	bg: "#0A0A0A",
	bgPanel: "#1A1A1A",
	violet: "#FACC15",
	coral: "#FACC15",
	text: "#FFFFFF",
	textDim: "#9CA3AF",
	border: "#2E2E2E",
};

export default function Home({ loaderData }: Route.ComponentProps) {
	const { items, topPosters } = loaderData;
	const [query, setQuery] = useState("");

	const filteredItems = query.trim()
		? items.filter(
				(item) =>
					item.title.toLowerCase().includes(query.toLowerCase()) ||
					item.artist.toLowerCase().includes(query.toLowerCase())
			)
		: items.slice(0, 6);

	return (
		<div
			style={{
				fontFamily: "'Inter', sans-serif",
				background: COLORS.bg,
				color: COLORS.text,
				minHeight: "100vh",
			}}
		>
			<link
				rel="stylesheet"
				href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700&display=swap"
			/>
			<style>{`
				@media (max-width: 768px) {
					.ad-banner-title { font-size: 32px !important; }
					.ad-banner-logo { width: 64px !important; height: 64px !important; }
					.ad-nav { flex-wrap: wrap !important; gap: 14px 20px !important; justify-content: center !important; }
					.ad-search { width: 100% !important; order: 99; }
					.ad-hero-title { font-size: 34px !important; }
					.ad-body { flex-direction: column !important; padding: 32px 20px !important; }
					.ad-sidebar { width: 100% !important; }
				}
			`}</style>

			{/* Banner */}
			<div
				style={{
					textAlign: "center",
					padding: "36px 32px",
					width: "100%",
				}}
			>
				<img
					className="ad-banner-logo"
					src="/artdropspot-logo.png"
					alt="ArtDrop Spot logo"
					style={{
						width: 96,
						height: 96,
						borderRadius: 22,
						margin: "0 auto 14px",
						display: "block",
						objectFit: "cover",
					}}
				/>
				<span
					className="ad-banner-title"
					style={{
						fontFamily: "'Archivo Black', sans-serif",
						fontSize: 48,
						letterSpacing: 0.3,
					}}
				>
					ArtDrop <span style={{ color: COLORS.violet }}>Spot</span>
				</span>
			</div>

			{/* Nav bar */}
			<header
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: "14px 32px",
					borderTop: `1px solid ${COLORS.border}`,
					borderBottom: `1px solid ${COLORS.border}`,
					position: "sticky",
					top: 0,
					background: "rgba(11,11,16,0.9)",
					backdropFilter: "blur(8px)",
					zIndex: 10,
				}}
			>
				<nav className="ad-nav" style={{ display: "flex", alignItems: "center", gap: 32 }}>
					<a href="/upload" style={navLinkStyle}>
						Upload
					</a>
				<a href="/gallery" style={navLinkStyle}>
						Collection
					</a>
				<a href="/rising-stars" style={navLinkStyle}>
						Rising Stars
					</a>
					<a href="/board" style={navLinkStyle}>
						Bulletin Board
					</a>
					<a href="/games" style={navLinkStyle}>
						Games
					</a>
					<a href="/updates" style={navLinkStyle}>
						Update Log
					</a>
					<a href="/admin" style={{ ...navLinkStyle, color: COLORS.textDim, fontWeight: 500 }}>
						Sign in
					</a>
					<input
						className="ad-search"
						type="search"
						placeholder="Search art..."
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						style={{
							padding: "9px 14px",
							borderRadius: 8,
							border: `1px solid ${COLORS.border}`,
							background: COLORS.bgPanel,
							color: COLORS.text,
							width: 200,
							fontSize: 14,
							fontFamily: "'Inter', sans-serif",
						}}
					/>
				</nav>
			</header>

			{/* Hero */}
			<section
				style={{
					padding: "72px 32px 56px",
					textAlign: "center",
					borderBottom: `1px solid ${COLORS.border}`,
				}}
			>
				<h1
					className="ad-hero-title"
					style={{
						fontFamily: "'Archivo Black', sans-serif",
						fontSize: "clamp(36px, 6vw, 64px)",
						lineHeight: 1.05,
						margin: "0 0 16px",
						background: `linear-gradient(90deg, ${COLORS.text}, ${COLORS.violet})`,
						WebkitBackgroundClip: "text",
						WebkitTextFillColor: "transparent",
						backgroundClip: "text",
					}}
				>
					DROP YOUR ART.
					<br />
					GET DISCOVERED.
				</h1>
				<p
					style={{
						color: COLORS.textDim,
						fontSize: 16,
						maxWidth: 480,
						margin: "0 auto 28px",
						lineHeight: 1.6,
					}}
				>
					A space for artists to share their work, build a
					following, and see what everyone else is making.
				</p>
				<a href="/upload" style={ctaButtonStyle}>
					UPLOAD
				</a>
			</section>

			{/* Body */}
			<div
				className="ad-body"
				style={{
					display: "flex",
					gap: 32,
					padding: "48px 32px",
					maxWidth: 1200,
					margin: "0 auto",
					flexWrap: "wrap",
				}}
			>
				{/* Main content */}
				<main style={{ flex: "1 1 600px" }}>
					<h2
						style={{
							fontFamily: "'Archivo Black', sans-serif",
							fontSize: 22,
							letterSpacing: 0.5,
							marginBottom: 24,
						}}
					>
						{query.trim() ? `RESULTS FOR "${query.trim().toUpperCase()}"` : "RECENT CREATIONS"}
					</h2>

					{filteredItems.length === 0 ? (
						<p style={{ color: COLORS.textDim }}>
							{query.trim()
								? "No art matches your search."
								: "No artwork uploaded yet — be the first."}
						</p>
					) : (
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
								gap: 20,
							}}
						>
							{filteredItems.map((item) => (
								<a
									key={item.key}
									href="/gallery"
									style={{ textDecoration: "none", color: "inherit" }}
								>
									<ArtCard title={item.title} artist={item.artist} imgKey={item.key} votes={item.votes} uploadedAt={item.uploadedAt} description={item.description} />
								</a>
							))}
						</div>
					)}
				</main>

				{/* Sidebar (nav card + Top Posters, stacked) */}
				<div
					className="ad-sidebar"
					style={{
						width: 280,
						flexShrink: 0,
						display: "flex",
						flexDirection: "column",
						gap: 24,
					}}
				>
				<aside
					style={{
						background: COLORS.bgPanel,
						border: `1px solid ${COLORS.border}`,
						borderRadius: 16,
						padding: 28,
						height: "fit-content",
					}}
				>
					<Logo />
					<p
						style={{
							fontSize: 14,
							lineHeight: 1.6,
							color: COLORS.textDim,
							margin: "16px 0 24px",
						}}
					>
						Upload your art, browse what the community is making, and
						get your work seen.
					</p>

					<nav style={{ display: "flex", flexDirection: "column", gap: 10 }}>
						<a href="/upload" style={sidebarButtonStyle(true)}>
							Upload
						</a>
						<a href="/gallery" style={sidebarButtonStyle(false)}>
							Collection
						</a>
						<a href="/board" style={sidebarButtonStyle(false)}>
							Bulletin Board
						</a>
						<a href="/games" style={sidebarButtonStyle(false)}>
							Games
						</a>
						<a href="/updates" style={sidebarButtonStyle(false)}>
							Update Log
						</a>
					</nav>
				</aside>

				<TopPosters entries={topPosters} />
				</div>
			</div>
		</div>
	);
}

function Logo() {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
			<img
				src="/artdropspot-logo.png"
				alt="ArtDrop Spot logo"
				style={{
					width: 30,
					height: 30,
					borderRadius: 8,
					flexShrink: 0,
					objectFit: "cover",
				}}
			/>
			<span
				style={{
					fontFamily: "'Archivo Black', sans-serif",
					fontSize: 17,
					letterSpacing: 0.3,
				}}
			>
				ArtDrop <span style={{ color: COLORS.violet }}>Spot</span>
			</span>
		</div>
	);
}

function ArtCard({
	title,
	artist,
	imgKey,
	votes,
	uploadedAt,
	description,
}: {
	title: string;
	artist: string;
	imgKey: string;
	votes: number;
	uploadedAt: string;
	description: string;
}) {
	const [showDescription, setShowDescription] = useState(false);

	return (
		<div>
			<div
				style={{
					aspectRatio: "1 / 1",
					borderRadius: 12,
					padding: 2,
					background: `linear-gradient(135deg, ${COLORS.violet}, ${COLORS.coral})`,
				}}
			>
				<div
					style={{
						width: "100%",
						height: "100%",
						borderRadius: 10,
						background: COLORS.bgPanel,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						overflow: "hidden",
					}}
				>
					<img
						src={`/art/${imgKey}`}
						alt={title}
						style={{
							maxWidth: "100%",
							maxHeight: "100%",
							objectFit: "contain",
						}}
					/>
				</div>
			</div>
			<div
				style={{
					display: "flex",
					alignItems: "flex-start",
					justifyContent: "space-between",
					gap: 8,
					marginTop: 10,
				}}
			>
				<div>
					<p
						style={{
							margin: "0 2px",
							fontWeight: 600,
							fontSize: 14,
							color: COLORS.text,
						}}
					>
						{title}
					</p>
					<p style={{ margin: "2px 2px 0", fontSize: 12, color: COLORS.textDim }}>
						by {artist}
					</p>
					<p style={{ margin: "2px 2px 0", fontSize: 11, color: COLORS.textDim, opacity: 0.7 }}>
						{formatDate(uploadedAt)}
					</p>
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
					<button
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							setShowDescription((v) => !v);
						}}
						aria-label="Show description"
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							background: showDescription ? COLORS.violet : COLORS.bgPanel,
							border: `1px solid ${showDescription ? COLORS.violet : COLORS.border}`,
							borderRadius: 999,
							padding: "6px 12px",
							cursor: "pointer",
						}}
					>
						<svg
							width="17"
							height="15"
							viewBox="0 0 26 22"
							fill="none"
							stroke={showDescription ? "#0A0A0A" : COLORS.textDim}
							strokeWidth="1.4"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M17 2H6a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h1v4l4-4h6a3 3 0 0 0 3-3V5a3 3 0 0 0-3-3Z" />
							<circle cx="8" cy="8" r="0.8" fill={showDescription ? "#0A0A0A" : COLORS.textDim} stroke="none" />
							<circle cx="11.5" cy="8" r="0.8" fill={showDescription ? "#0A0A0A" : COLORS.textDim} stroke="none" />
							<circle cx="15" cy="8" r="0.8" fill={showDescription ? "#0A0A0A" : COLORS.textDim} stroke="none" />
							<path d="M20 8h1a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-1v3l-3-3" opacity="0.55" />
						</svg>
					</button>

					{showDescription && (
						<div
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
							}}
							style={{
								position: "absolute",
								bottom: "calc(100% + 8px)",
								right: 0,
								width: 220,
								background: COLORS.bgPanel,
								border: `1px solid ${COLORS.border}`,
								borderRadius: 10,
								padding: 12,
								fontSize: 13,
								lineHeight: 1.5,
								color: COLORS.text,
								zIndex: 20,
								boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
							}}
						>
							{description.trim() ? description : (
								<span style={{ color: COLORS.textDim, fontStyle: "italic" }}>
									No description provided.
								</span>
							)}
						</div>
					)}

					<VoteButton itemKey={imgKey} initialVotes={votes} />
				</div>
			</div>
		</div>
	);
}

function formatDate(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

const navLinkStyle: React.CSSProperties = {
	color: COLORS.text,
	textDecoration: "none",
	fontWeight: 600,
	fontSize: 14,
};

const ctaButtonStyle: React.CSSProperties = {
	display: "inline-block",
	background: COLORS.violet,
	color: "#fff",
	textDecoration: "none",
	fontWeight: 700,
	fontSize: 15,
	padding: "13px 28px",
	borderRadius: 999,
};

function sidebarButtonStyle(primary: boolean): React.CSSProperties {
	return {
		display: "block",
		textAlign: "center",
		padding: "12px 0",
		fontWeight: 700,
		fontSize: 14,
		textDecoration: "none",
		borderRadius: 8,
		background: primary ? COLORS.violet : "transparent",
		color: primary ? "#fff" : COLORS.text,
		border: primary ? "none" : `1px solid ${COLORS.border}`,
	};
}
