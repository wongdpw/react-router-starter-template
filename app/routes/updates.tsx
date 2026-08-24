import type { Route } from "./+types/updates";

export function meta({}: Route.MetaArgs) {
	return [{ title: "Update Log — ArtDrop Spot" }];
}

export async function loader({ context }: Route.LoaderArgs) {
	const listed = await context.cloudflare.env.ART_BUCKET.list({
		prefix: "updates/",
	});

	const entries = await Promise.all(
		listed.objects
			.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime())
			.map(async (obj) => {
				const object = await context.cloudflare.env.ART_BUCKET.get(obj.key);
				if (!object) return null;
				const data = await object.json<{ message: string; postedAt: string }>();
				return { key: obj.key, ...data };
			})
	);

	return { entries: entries.filter((e): e is NonNullable<typeof e> => e !== null) };
}

const COLORS = {
	bg: "#0A0A0A",
	bgPanel: "#1A1A1A",
	violet: "#FACC15",
	text: "#FFFFFF",
	textDim: "#9CA3AF",
	border: "#2E2E2E",
};

export default function Updates({ loaderData }: Route.ComponentProps) {
	const { entries } = loaderData;

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
					<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
						<img
							src="/artdropspot-logo.png"
							alt="ArtDrop Spot logo"
							style={{
								width: 30,
								height: 30,
								borderRadius: 8,
								objectFit: "cover",
							}}
						/>
						<span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 17 }}>
							ArtDrop <span style={{ color: COLORS.violet }}>Spot</span>
						</span>
					</div>
				</a>
				<nav className="ad-nav" style={{ display: "flex", alignItems: "center", gap: 32 }}>
					<a href="/upload" style={navLinkStyle}>Upload</a>
					<a href="/gallery" style={navLinkStyle}>Collection</a>
					<a href="/rising-stars" style={navLinkStyle}>Rising Stars</a>
					<a href="/board" style={navLinkStyle}>Bulletin Board</a>
					<a href="/games" style={navLinkStyle}>Games</a>
					<a href="/updates" style={{ ...navLinkStyle, color: COLORS.violet }}>Update Log</a>
					<a href="/admin" style={{ ...navLinkStyle, color: COLORS.textDim, fontWeight: 500 }}>Sign in</a>
				</nav>
			</header>

			{/* Body */}
			<div style={{ maxWidth: 700, margin: "0 auto", padding: "48px 32px" }}>
				<h1
					style={{
						fontFamily: "'Archivo Black', sans-serif",
						fontSize: 32,
						margin: "0 0 8px",
					}}
				>
					Update Log
				</h1>
				<p style={{ color: COLORS.textDim, fontSize: 15, marginBottom: 40 }}>
					What's new at ArtDrop Spot.
				</p>

				{entries.length === 0 ? (
					<p style={{ color: COLORS.textDim }}>No updates posted yet.</p>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
						{entries.map((entry) => (
							<div
								key={entry.key}
								style={{
									background: COLORS.bgPanel,
									border: `1px solid ${COLORS.border}`,
									borderRadius: 12,
									padding: 20,
								}}
							>
								<p
									style={{
										margin: "0 0 8px",
										fontSize: 13,
										color: COLORS.violet,
										fontWeight: 700,
									}}
								>
									{formatDate(entry.postedAt)}
								</p>
								<p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
									{entry.message}
								</p>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function formatDate(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleString(undefined, {
		year: "numeric",
		month: "long",
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
