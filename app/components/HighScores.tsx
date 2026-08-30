import { useCallback, useEffect, useRef, useState } from "react";
import type { GameId } from "../lib/game-ids";
import {
	HIGH_SCORE_SLOTS,
	INITIALS_LENGTH,
	madeTheBoard,
	normalizeInitials,
	type ScoreBoard,
} from "../lib/high-scores";

const COLORS = {
	bgPanel: "#1A1A1A",
	accent: "#FACC15",
	text: "#FFFFFF",
	textDim: "#9CA3AF",
	border: "#2E2E2E",
};

const INITIALS_KEY = "adsArcadeInitials";

function rememberedInitials(): string {
	try {
		return window.localStorage.getItem(INITIALS_KEY) ?? "";
	} catch {
		return "";
	}
}

/**
 * Everything the arcade scoreboard needs, kept out of the game files:
 * loads the board, decides whether a finished run earned a place, and
 * submits the initials.
 */
export function useHighScores(game: GameId) {
	const [board, setBoard] = useState<ScoreBoard>([]);
	const [pending, setPending] = useState<number | null>(null);
	const [justRanked, setJustRanked] = useState<number | null>(null);
	const boardRef = useRef<ScoreBoard>([]);
	boardRef.current = board;

	const refresh = useCallback(async () => {
		try {
			const res = await fetch("/api/high-scores");
			const all = (await res.json()) as Record<string, ScoreBoard>;
			setBoard(all[game] ?? []);
		} catch {
			/* leave the board as it is */
		}
	}, [game]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	/** Call once when a run ends; opens the initials prompt if it qualified. */
	const finishRun = useCallback((score: number) => {
		if (madeTheBoard(boardRef.current, score)) {
			setPending(score);
			setJustRanked(null);
		}
	}, []);

	const submit = useCallback(
		async (rawInitials: string) => {
			if (pending === null) return;
			const who = normalizeInitials(rawInitials);
			try {
				window.localStorage.setItem(INITIALS_KEY, who);
			} catch {
				/* storage blocked */
			}
			try {
				const res = await fetch("/api/high-scores", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ game, who, score: pending }),
				});
				const data = (await res.json()) as { board?: ScoreBoard; rank?: number | null };
				if (data.board) setBoard(data.board);
				setJustRanked(data.rank ?? null);
			} catch {
				/* a lost score must never break the game */
			}
			setPending(null);
		},
		[game, pending]
	);

	const dismiss = useCallback(() => setPending(null), []);

	return { board, pendingScore: pending, justRanked, finishRun, submit, dismiss, refresh };
}

/** The classic "ENTER YOUR INITIALS" prompt. */
export function InitialsPrompt({
	score,
	onSubmit,
	onCancel,
}: {
	score: number;
	onSubmit: (initials: string) => void;
	onCancel: () => void;
}) {
	const [value, setValue] = useState(() => rememberedInitials());
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	function keyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		// The game listens on window; keep its controls out of this box.
		e.stopPropagation();
		if (e.key === "Enter") onSubmit(value);
		if (e.key === "Escape") onCancel();
	}

	return (
		<div
			style={{
				background: COLORS.bgPanel,
				border: `2px solid ${COLORS.accent}`,
				borderRadius: 14,
				padding: "20px 22px",
				maxWidth: 360,
				margin: "0 auto 20px",
				textAlign: "center",
			}}
		>
			<div
				style={{
					fontFamily: "'Archivo Black', sans-serif",
					fontSize: 16,
					color: COLORS.accent,
					letterSpacing: "0.08em",
					marginBottom: 6,
				}}
			>
				NEW HIGH SCORE
			</div>
			<p style={{ color: COLORS.textDim, fontSize: 13.5, margin: "0 0 14px" }}>
				{score.toLocaleString()} points — enter your initials
			</p>
			<input
				ref={inputRef}
				value={value}
				maxLength={INITIALS_LENGTH}
				onChange={(e) => setValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
				onKeyDown={keyDown}
				placeholder="AAA"
				aria-label="Your three initials"
				style={{
					width: 140,
					textAlign: "center",
					fontFamily: "'Archivo Black', sans-serif",
					fontSize: 30,
					letterSpacing: "0.3em",
					textIndent: "0.3em",
					padding: "10px 0",
					borderRadius: 10,
					border: `1px solid ${COLORS.border}`,
					background: "#0A0A0A",
					color: COLORS.accent,
					marginBottom: 14,
				}}
			/>
			<div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
				<button onClick={() => onSubmit(value)} style={promptButton(true)}>
					Save score
				</button>
				<button onClick={onCancel} style={promptButton(false)}>
					Skip
				</button>
			</div>
		</div>
	);
}

/** The top-ten table itself. */
export function HighScoreBoard({ board, highlight }: { board: ScoreBoard; highlight?: number | null }) {
	const rows = Array.from({ length: HIGH_SCORE_SLOTS }, (_, i) => board[i] ?? null);

	return (
		<div
			style={{
				background: COLORS.bgPanel,
				border: `1px solid ${COLORS.border}`,
				borderRadius: 14,
				padding: "18px 20px",
				maxWidth: 360,
				margin: "22px auto 0",
				textAlign: "left",
			}}
		>
			<div
				style={{
					fontFamily: "'Archivo Black', sans-serif",
					fontSize: 14,
					color: COLORS.accent,
					letterSpacing: "0.14em",
					textAlign: "center",
					marginBottom: 12,
				}}
			>
				HIGH SCORES
			</div>

			{board.length === 0 ? (
				<p style={{ color: COLORS.textDim, fontSize: 13, textAlign: "center", margin: 0 }}>
					No scores yet — the board is yours to take.
				</p>
			) : (
				<ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
					{rows.map((entry, i) => {
						const isTop = i === 0 && entry;
						const isMine = highlight === i;
						return (
							<li
								key={i}
								style={{
									display: "flex",
									alignItems: "baseline",
									gap: 10,
									padding: "5px 8px",
									borderRadius: 6,
									fontFamily: "'Courier New', monospace",
									fontSize: 14.5,
									background: isMine ? "rgba(250,204,21,0.14)" : "transparent",
									color: entry ? (isTop ? COLORS.accent : COLORS.text) : COLORS.textDim,
									opacity: entry ? 1 : 0.45,
								}}
							>
								<span style={{ width: 26, color: COLORS.textDim }}>{String(i + 1).padStart(2, "0")}</span>
								<span style={{ letterSpacing: "0.18em", fontWeight: 700 }}>{entry ? entry.who : "---"}</span>
								<span style={{ marginLeft: "auto" }}>
									{entry ? entry.score.toLocaleString() : "—"}
								</span>
								{isTop && <span aria-hidden>👑</span>}
							</li>
						);
					})}
				</ol>
			)}
		</div>
	);
}

function promptButton(primary: boolean): React.CSSProperties {
	return {
		padding: "9px 18px",
		borderRadius: 999,
		border: primary ? "1px solid transparent" : `1px solid ${COLORS.border}`,
		background: primary ? COLORS.accent : "transparent",
		color: primary ? "#0A0A0A" : COLORS.text,
		fontWeight: 700,
		fontSize: 13.5,
		cursor: "pointer",
		fontFamily: "'Inter', sans-serif",
	};
}
