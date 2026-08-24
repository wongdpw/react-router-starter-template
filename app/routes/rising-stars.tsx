import type { Route } from "./+types/rising-stars";
import VoteButton from "../components/VoteButton";
import { useState } from "react";

export function meta({}: Route.MetaArgs) {
	return [{ title: "Rising Stars — ArtDrop Spot" }];
}

const RISING_STAR_THRESHOLD = 50;

export async function loader({ context }: Route.LoaderArgs) {
	const listed = await context.cloudflare.env.ART_BUCKET.list({
		include: ["customMetadata"],
	});

	const items = listed.objects
		.filter((obj) => {
			if (obj.key.startsWith("updates/")) return false;
			if (obj.customMetadata?.status !== "approved") return false;
			// Live membership: a piece is a Rising Star for as long as its
			// CURRENT vote count is at or above the threshold. If votes drop
			// below 50 (via downvoting or an admin reset), it drops out of
			// this list automatically on the next load — no separate
			// "removal" step needed. The piece is untouched in Collection.
			const votes = parseInt(obj.customMetadata?.votes ?? "0", 10);
			return votes >= RISING_STAR_THRESHOLD;
		})
		.sort((a, b) => {
			// Highest votes first
			const aVotes = parseInt(a.customMetadata?.votes ?? "0", 10);
			const bVotes = parseInt(b.customMetadata?.votes ?? "0", 10);
			return bVotes - aVotes;
		})
		.map((obj) => ({
			key: obj.key,
			title: obj.customMetadata?.title ?? "Untitled",
			artist: obj.customMetadata?.artist ?? "Unknown artist",
			description: obj.customMetadata?.description ?? "",
			votes: parseInt(obj.customMetadata?.votes ?? "0", 10),
			uploadedAt: obj.uploaded.toISOString(),
			// featuredAt is informational only (shown as "Featured <date>" on
			// the card) — it reflects the most recent time this piece crossed
			// INTO the threshold, refreshed in vote.$key.tsx on re-entry.
			// Falls back to uploadedAt for any legacy piece that hit 50
			// before this field existed.
			featuredAt: obj.customMetadata?.featuredAt ?? obj.uploaded.toISOString(),
		}));

	return { items };
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

export default function RisingStars({ loaderData }: Route.ComponentProps) {
	const { items } = loaderData;
	const [lightboxItem, setLightboxItem] = useState<{ imgKey: string; title: string } | null>(null);

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
				@media (max-width: 640px) {
					.ad-header { flex-wrap: wrap !important; gap: 14px !important; }
					.ad-nav { flex-wrap: wrap !important; gap: 10px 18px !important; }
					.ad-page-title { font-size: 26px !important; }
				}
			`}</style>

			{/* Header */}
			<header
				className="ad-header"
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "18px 32px",
					borderBottom: `1px solid ${COLORS.border}`,
				}}
			>
				<a href="/" style={{ textDecoration: "none", color: "inherit" }}>
					<Logo />
				</a>
				<nav className="ad-nav" style={{ display: "flex", alignItems: "center", gap: 32 }}>
					<a href="/upload" style={navLinkStyle}>
						Upload
					</a>
					<a href="/gallery" style={navLinkStyle}>
						Collection
					</a>
					<a href="/rising-stars" style={{ ...navLinkStyle, color: COLORS.violet }}>
						Rising Stars
					</a>
					<a href="/board" style={navLinkStyle}>
						Bulletin Board
					</a>
					<a href="/draw-battle" style={navLinkStyle}>
						Draw Battle
					</a>
					<a href="/updates" style={navLinkStyle}>
						Update Log
					</a>
					<a href="/admin" style={{ ...navLinkStyle, color: COLORS.textDim, fontWeight: 500 }}>
						Sign in
					</a>
				</nav>
			</header>

			{/* Body */}
			<div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 32px" }}>
				<h1
					className="ad-page-title"
					style={{
						fontFamily: "'Archivo Black', sans-serif",
						fontSize: 32,
						margin: "0 0 8px",
					}}
				>
					Rising Stars
				</h1>
				<p style={{ color: COLORS.textDim, fontSize: 15, marginBottom: 32 }}>
					Community favorites that reached {RISING_STAR_THRESHOLD}+ likes.
				</p>

				{items.length === 0 && (
					<p style={{ color: COLORS.textDim }}>
						No Rising Stars yet — the first piece to hit {RISING_STAR_THRESHOLD} likes will
						show up here.
					</p>
				)}

				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
						gap: 24,
						paddingTop: 40,
					}}
				>
					{items.map((item) => (
						<ArtCard
							key={item.key}
							title={item.title}
							artist={item.artist}
							imgKey={item.key}
							votes={item.votes}
							uploadedAt={item.uploadedAt}
							featuredAt={item.featuredAt}
							description={item.description}
							onOpen={() => setLightboxItem({ imgKey: item.key, title: item.title })}
						/>
					))}
				</div>
			</div>

			{lightboxItem && (
				<Lightbox
					imgKey={lightboxItem.imgKey}
					title={lightboxItem.title}
					onClose={() => setLightboxItem(null)}
				/>
			)}
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
	featuredAt,
	description,
	onOpen,
}: {
	title: string;
	artist: string;
	imgKey: string;
	votes: number;
	uploadedAt: string;
	featuredAt: string;
	description: string;
	onOpen: () => void;
}) {
	const [showDescription, setShowDescription] = useState(false);

	return (
		<div>
			<div
				onClick={onOpen}
				style={{
					position: "relative",
					aspectRatio: "1 / 1",
					borderRadius: 12,
					padding: 2,
					background: `linear-gradient(135deg, ${COLORS.violet}, ${COLORS.coral})`,
					cursor: "pointer",
				}}
			>
				{/* Rising Star medal — every piece on this page is featured, so
				    the badge always shows. Sized small and inset so it overlaps
				    the corner without covering meaningful thumbnail area. */}
				<img
					src="/rising-star-badge.png"
					alt="Rising Star"
					style={{
						position: "absolute",
						top: -14,
						right: -14,
						width: 66,
						height: 66,
						zIndex: 5,
						filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))",
						pointerEvents: "none",
					}}
				/>

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
						Uploaded {formatDate(uploadedAt)}
					</p>
					<p style={{ margin: "2px 2px 0", fontSize: 11, color: COLORS.violet, opacity: 0.9 }}>
						★ Featured {formatDate(featuredAt)}
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
							onClick={(e) => e.stopPropagation()}
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

					{/* Live vote button — matches Collection. Voting is no longer
					    frozen after featuring; only the one-time featuredAt stamp
					    (set in vote.$key.tsx) determines Rising Stars membership. */}
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

function Lightbox({
	imgKey,
	title,
	onClose,
}: {
	imgKey: string;
	title: string;
	onClose: () => void;
}) {
	const [size, setSize] = useState<{ width: number; height: number } | null>(null);

	return (
		<div
			onClick={onClose}
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0,0,0,0.88)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 100,
				padding: 24,
			}}
		>
			<button
				onClick={onClose}
				aria-label="Close"
				style={{
					position: "absolute",
					top: 20,
					right: 24,
					background: "transparent",
					border: "none",
					color: "#FFFFFF",
					fontSize: 32,
					lineHeight: 1,
					cursor: "pointer",
					fontFamily: "'Inter', sans-serif",
				}}
			>
				×
			</button>
			<img
				src={`/art/${imgKey}`}
				alt={title}
				onClick={(e) => e.stopPropagation()}
				onLoad={(e) => {
					const img = e.currentTarget;
					setSize({
						width: img.naturalWidth * 0.75,
						height: img.naturalHeight * 0.75,
					});
				}}
				style={
					size
						? {
								width: size.width,
								height: size.height,
								maxWidth: "100%",
								maxHeight: "100%",
								objectFit: "contain",
								borderRadius: 8,
							}
						: {
								maxWidth: "80%",
								maxHeight: "80%",
								objectFit: "contain",
								opacity: 0,
							}
				}
			/>
		</div>
	);
}

const navLinkStyle: React.CSSProperties = {
	color: COLORS.text,
	textDecoration: "none",
	fontWeight: 600,
	fontSize: 14,
};
