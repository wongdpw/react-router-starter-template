const COLORS = {
	violet: "#FACC15",
	text: "#FFFFFF",
	textDim: "#9CA3AF",
	border: "#2E2E2E",
};

const navLink: React.CSSProperties = {
	color: COLORS.text,
	textDecoration: "none",
	fontWeight: 600,
	fontSize: 14,
};

/** Shared site chrome for the Draw Battle pages. */
export function BattleHeader() {
	return (
		<header
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: 20,
				padding: "16px 28px",
				borderBottom: `1px solid ${COLORS.border}`,
				position: "sticky",
				top: 0,
				background: "rgba(10,10,10,0.88)",
				backdropFilter: "blur(10px)",
				zIndex: 30,
			}}
		>
			<a
				href="/"
				style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 10 }}
			>
				<img
					src="/artdropspot-logo.png"
					alt="ArtDrop Spot logo"
					style={{ width: 30, height: 30, borderRadius: 8, objectFit: "cover" }}
				/>
				<span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 17, letterSpacing: 0.3 }}>
					ArtDrop <span style={{ color: COLORS.violet }}>Spot</span>
				</span>
			</a>
			<nav className="db-nav" style={{ display: "flex", alignItems: "center", gap: 26 }}>
				<a href="/upload" style={navLink}>Upload</a>
				<a href="/gallery" style={navLink}>Collection</a>
				<a href="/rising-stars" style={navLink}>Rising Stars</a>
				<a href="/board" style={navLink}>Bulletin Board</a>
				<a href="/draw-battle" style={{ ...navLink, color: COLORS.violet }}>Draw Battle</a>
				<a href="/updates" style={navLink}>Update Log</a>
				<a href="/admin" style={{ ...navLink, color: COLORS.textDim, fontWeight: 500 }}>Sign in</a>
			</nav>
		</header>
	);
}
