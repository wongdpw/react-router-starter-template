import type { Route } from "./+types/board";
import { Form, useNavigation } from "react-router";
import { useState } from "react";

export function meta({}: Route.MetaArgs) {
	return [{ title: "Bulletin Board — ArtDrop Spot" }];
}

const MAX_ATTEMPTS_WINDOW_SEC = 30;

function wordCount(text: string): number {
	return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

function getClientIp(request: Request): string {
	return (
		request.headers.get("CF-Connecting-IP") ??
		request.headers.get("X-Forwarded-For") ??
		"unknown"
	);
}

export async function loader({ context }: Route.LoaderArgs) {
	const listed = await context.cloudflare.env.ART_BUCKET.list({
		prefix: "board/",
	});

	const posts = await Promise.all(
		listed.objects
			.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime())
			.slice(0, 100)
			.map(async (obj) => {
				const object = await context.cloudflare.env.ART_BUCKET.get(obj.key);
				if (!object) return null;
				const data = await object.json<{
					handle: string;
					message: string;
					emoji: string;
					postedAt: string;
				}>();
				return { key: obj.key, ...data };
			})
	);

	return { posts: posts.filter((p): p is NonNullable<typeof p> => p !== null) };
}

export async function action({ request, context }: Route.ActionArgs) {
	try {
		const bucket = context.cloudflare.env.ART_BUCKET;

		const formData = await request.formData();
		const handle = (formData.get("handle") as string | null)?.trim() ?? "";
		const message = (formData.get("message") as string | null)?.trim() ?? "";
		const emoji = (formData.get("emoji") as string | null) ?? "💬";

		const missing: string[] = [];
		if (!handle) missing.push("Display name");
		if (!message) missing.push("Message");

		if (missing.length > 0) {
			return { error: `Please provide: ${missing.join(", ")}.` };
		}

		if (handle.length > 30) {
			return { error: "Display name must be 30 characters or fewer." };
		}

		if (wordCount(message) > 100) {
			return { error: "Message must be 100 words or fewer." };
		}

		// Rate limit check happens after formData is read, matching the
		// pattern used elsewhere in the app.
		const ip = getClientIp(request);
		const lastPostKey = `board-last-post/${ip}.json`;
		const lastPostObj = await bucket.get(lastPostKey);
		if (lastPostObj) {
			const data = await lastPostObj.json<{ postedAt: number }>();
			const elapsedMs = Date.now() - data.postedAt;
			const windowMs = MAX_ATTEMPTS_WINDOW_SEC * 1000;
			if (elapsedMs < windowMs) {
				const secondsLeft = Math.ceil((windowMs - elapsedMs) / 1000);
				return { error: `Please wait ${secondsLeft}s before posting again.` };
			}
		}

		const postedAt = new Date().toISOString();
		const postKey = `board/${Date.now()}-${crypto.randomUUID()}.json`;
		await bucket.put(postKey, JSON.stringify({ handle, message, emoji, postedAt }));
		await bucket.put(lastPostKey, JSON.stringify({ postedAt: Date.now() }));

		return { success: true };
	} catch (err) {
		console.error("Board post action failed:", err);
		return {
			error: `Something went wrong: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
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

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
	{
		label: "Smileys",
		emojis: ["😀", "😄", "😂", "🥲", "😉", "😍", "🤩", "😎", "🥳", "🤔", "😴", "🤯", "🥰", "😇", "🙃", "😅"],
	},
	{
		label: "Gestures",
		emojis: ["👍", "👎", "👏", "🙌", "🤝", "🙏", "✌️", "🤘", "👋", "💪", "🫡", "🤙"],
	},
	{
		label: "Hearts",
		emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💖", "💕", "💗", "💯"],
	},
	{
		label: "Creative",
		emojis: ["🎨", "🖌️", "✏️", "🖍️", "📸", "🎭", "🎬", "✨", "🌟", "💡", "🔥", "⚡"],
	},
	{
		label: "Nature",
		emojis: ["🌸", "🌻", "🌈", "🌙", "☀️", "🌊", "🍀", "🌿", "🦋", "🐉", "🐱", "🦄"],
	},
	{
		label: "Objects",
		emojis: ["🎉", "🎁", "🏆", "🚀", "📌", "💬", "🔖", "📷", "🧵", "🖼️", "🗂️", "📚"],
	},
];

export default function Board({ loaderData, actionData }: Route.ComponentProps) {
	const { posts } = loaderData;
	const navigation = useNavigation();
	const isSubmitting = navigation.state === "submitting";

	const [message, setMessage] = useState("");
	const [selectedEmoji, setSelectedEmoji] = useState("💬");
	const [pickerOpen, setPickerOpen] = useState(false);

	const msgWordCount = wordCount(message);
	const overLimit = msgWordCount > 100;

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
							style={{ width: 30, height: 30, borderRadius: 8, objectFit: "cover" }}
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
					<a href="/board" style={{ ...navLinkStyle, color: COLORS.violet }}>Bulletin Board</a>
					<a href="/draw-battle" style={navLinkStyle}>Draw Battle</a>
					<a href="/updates" style={navLinkStyle}>Update Log</a>
					<a href="/admin" style={{ ...navLinkStyle, color: COLORS.textDim, fontWeight: 500 }}>Sign in</a>
				</nav>
			</header>

			<div style={{ maxWidth: 700, margin: "0 auto", padding: "48px 24px" }}>
				<h1
					style={{
						fontFamily: "'Archivo Black', sans-serif",
						fontSize: 32,
						margin: "0 0 8px",
					}}
				>
					Bulletin Board
				</h1>
				<p style={{ color: COLORS.textDim, fontSize: 15, marginBottom: 32 }}>
					Say hi, share a thought, or just drop an emoji.
				</p>

				{/* Post form */}
				<Form
					method="post"
					onSubmit={() => {
						setTimeout(() => {
							setMessage("");
							setSelectedEmoji("💬");
						}, 0);
					}}
					style={{
						background: COLORS.bgPanel,
						border: `1px solid ${COLORS.border}`,
						borderRadius: 14,
						padding: 20,
						marginBottom: 32,
					}}
				>
					<label style={labelStyle}>
						Display name
						<input
							type="text"
							name="handle"
							required
							maxLength={30}
							placeholder="Your name or handle"
							style={inputStyle}
						/>
					</label>

					<label style={{ ...labelStyle, marginBottom: 4 }}>
						Message
						<textarea
							name="message"
							required
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							placeholder="What's on your mind?"
							rows={3}
							style={{ ...inputStyle, resize: "vertical" }}
						/>
					</label>
					<span
						style={{
							display: "block",
							marginBottom: 16,
							fontSize: 12,
							color: overLimit ? COLORS.coral : COLORS.textDim,
						}}
					>
						{msgWordCount}/100 words
					</span>

					{/* Emoji picker */}
					<div style={{ position: "relative", marginBottom: 20 }}>
						<label style={{ ...labelStyle, marginBottom: 8 }}>Pick an emoji</label>
					<input type="hidden" name="emoji" value={selectedEmoji} />
						<button
							type="button"
							onClick={() => setPickerOpen((v) => !v)}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								padding: "10px 14px",
								borderRadius: 8,
								border: `1px solid ${COLORS.border}`,
								background: COLORS.bg,
								color: COLORS.text,
								cursor: "pointer",
								fontSize: 14,
								fontFamily: "'Inter', sans-serif",
							}}
						>
							<span style={{ fontSize: 20 }}>{selectedEmoji}</span>
							<span style={{ color: COLORS.textDim }}>Choose emoji</span>
						</button>

						{pickerOpen && (
							<div
								style={{
									position: "absolute",
									top: "calc(100% + 8px)",
									left: 0,
									zIndex: 30,
									width: 300,
									maxHeight: 260,
									overflowY: "auto",
									background: COLORS.bg,
									border: `1px solid ${COLORS.border}`,
									borderRadius: 10,
									padding: 12,
									boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
								}}
							>
								{EMOJI_CATEGORIES.map((cat) => (
									<div key={cat.label} style={{ marginBottom: 12 }}>
										<p
											style={{
												margin: "0 0 6px",
												fontSize: 11,
												color: COLORS.textDim,
												textTransform: "uppercase",
												letterSpacing: 0.5,
											}}
										>
											{cat.label}
										</p>
										<div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
											{cat.emojis.map((e) => (
												<button
													key={e}
													type="button"
													onClick={() => {
														setSelectedEmoji(e);
														setPickerOpen(false);
													}}
													style={{
														width: 32,
														height: 32,
														display: "flex",
														alignItems: "center",
														justifyContent: "center",
														fontSize: 18,
														background: e === selectedEmoji ? COLORS.violet : "transparent",
														border: "none",
														borderRadius: 6,
														cursor: "pointer",
													}}
												>
													{e}
												</button>
											))}
										</div>
									</div>
								))}
							</div>
						)}
					</div>

					<button
						type="submit"
						disabled={isSubmitting || overLimit}
						style={{
							width: "100%",
							padding: "12px 0",
							borderRadius: 999,
							border: "none",
							background: isSubmitting || overLimit ? COLORS.border : COLORS.violet,
							color: "#0A0A0A",
							fontWeight: 700,
							fontSize: 15,
							cursor: isSubmitting || overLimit ? "default" : "pointer",
							fontFamily: "'Inter', sans-serif",
						}}
					>
						{isSubmitting ? "Posting..." : "Post to board"}
					</button>

					{actionData?.error && (
						<p
							style={{
								color: COLORS.coral,
								background: "rgba(250,204,21,0.1)",
								border: `1px solid ${COLORS.coral}`,
								borderRadius: 8,
								padding: "10px 12px",
								marginTop: 16,
								fontSize: 13,
							}}
						>
							{actionData.error}
						</p>
					)}

					{actionData?.success && (
						<p
							style={{
								color: "#4ADE80",
								background: "rgba(74,222,128,0.1)",
								border: "1px solid #4ADE80",
								borderRadius: 8,
								padding: "10px 12px",
								marginTop: 16,
								fontSize: 13,
							}}
						>
							Posted!
						</p>
					)}
				</Form>

				{/* Feed */}
				{posts.length === 0 ? (
					<p style={{ color: COLORS.textDim }}>No posts yet — be the first to say hi.</p>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
						{posts.map((post) => (
							<div
								key={post.key}
								style={{
									background: COLORS.bgPanel,
									border: `1px solid ${COLORS.border}`,
									borderRadius: 12,
									padding: 16,
									display: "flex",
									gap: 12,
								}}
							>
								<span style={{ fontSize: 24, flexShrink: 0 }}>{post.emoji}</span>
								<div style={{ minWidth: 0 }}>
									<div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
										<span style={{ fontWeight: 700, fontSize: 14 }}>{post.handle}</span>
										<span style={{ fontSize: 11, color: COLORS.textDim }}>
											{formatDate(post.postedAt)}
										</span>
									</div>
									<p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
										{post.message}
									</p>
								</div>
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

const labelStyle: React.CSSProperties = {
	display: "block",
	marginBottom: 16,
	fontSize: 13,
	fontWeight: 600,
	color: COLORS.textDim,
};

const inputStyle: React.CSSProperties = {
	display: "block",
	width: "100%",
	marginTop: 6,
	padding: "11px 12px",
	borderRadius: 8,
	border: `1px solid ${COLORS.border}`,
	background: COLORS.bg,
	color: COLORS.text,
	fontSize: 14,
	fontFamily: "'Inter', sans-serif",
	boxSizing: "border-box",
};
