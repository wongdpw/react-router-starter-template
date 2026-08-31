/**
 * Tiny Web Audio helper for the canvas arcade games.
 *
 * Everything is synthesised — no audio files to ship or load. The context
 * is created lazily on the first real key press, because browsers refuse
 * to start audio before a user gesture.
 */

const MUTE_KEY = "adsArcadeMuted";

type Wave = OscillatorType;

class ArcadeAudio {
	private ac: AudioContext | null = null;
	private master: GainNode | null = null;
	private muted = false;
	private failed = false;

	constructor() {
		try {
			this.muted = window.localStorage.getItem(MUTE_KEY) === "1";
		} catch {
			this.muted = false;
		}
	}

	/** Safe to call on every key press; only the first one does any work. */
	init() {
		if (this.ac || this.failed) return;
		const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AC) {
			this.failed = true;
			return;
		}
		try {
			this.ac = new AC();
			this.master = this.ac.createGain();
			this.master.gain.value = 0.26;
			this.master.connect(this.ac.destination);
		} catch {
			this.failed = true;
		}
	}

	/** Browsers suspend the context when a tab is backgrounded. */
	resume() {
		if (this.ac?.state === "suspended") void this.ac.resume();
	}

	isMuted() {
		return this.muted;
	}

	toggleMute(): boolean {
		this.muted = !this.muted;
		try {
			window.localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
		} catch {
			/* storage blocked */
		}
		return this.muted;
	}

	private ready(): boolean {
		return !this.muted && !!this.ac && !!this.master;
	}

	/** A pitched blip, optionally sweeping from f0 to f1. */
	tone(f0: number, f1: number, dur: number, type: Wave = "square", vol = 0.2) {
		if (!this.ready()) return;
		const ac = this.ac!;
		const t = ac.currentTime;
		const osc = ac.createOscillator();
		const gain = ac.createGain();
		osc.type = type;
		osc.frequency.setValueAtTime(f0, t);
		if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		osc.connect(gain);
		gain.connect(this.master!);
		osc.start(t);
		osc.stop(t + dur + 0.02);
	}

	/** Filtered white noise — impacts, explosions, thumps. */
	noise(dur: number, vol: number, f0: number, f1: number) {
		if (!this.ready()) return;
		const ac = this.ac!;
		const t = ac.currentTime;
		const frames = Math.max(1, Math.floor(ac.sampleRate * dur));
		const buf = ac.createBuffer(1, frames, ac.sampleRate);
		const data = buf.getChannelData(0);
		for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
		const src = ac.createBufferSource();
		src.buffer = buf;
		const filter = ac.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.setValueAtTime(f0, t);
		filter.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
		const gain = ac.createGain();
		gain.gain.setValueAtTime(vol, t);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		src.connect(filter);
		filter.connect(gain);
		gain.connect(this.master!);
		src.start(t);
	}

	/** A short run of notes, used for fanfares. */
	arpeggio(notes: number[], step: number, type: Wave = "square", vol = 0.18) {
		notes.forEach((f, i) => {
			window.setTimeout(() => this.tone(f, f, step * 1.4, type, vol), i * step * 1000);
		});
	}

	/* ---- shared voices ------------------------------------------------ */

	shoot() {
		this.tone(880, 220, 0.06, "square", 0.11);
	}
	hitSmall() {
		// chipping a mushroom / clipping a wing
		this.noise(0.06, 0.16, 1800, 500);
	}
	hitEnemy() {
		this.tone(700, 180, 0.12, "square", 0.15);
		this.noise(0.12, 0.18, 2400, 400);
	}
	killBig() {
		// a chain head or a diving raider
		this.tone(520, 90, 0.26, "sawtooth", 0.17);
		this.noise(0.26, 0.24, 1800, 120);
	}
	playerDie() {
		this.tone(300, 40, 0.7, "sawtooth", 0.2);
		this.noise(0.7, 0.4, 900, 50);
	}
	waveUp() {
		this.arpeggio([523, 659, 784, 1046], 0.075, "square", 0.16);
	}
	gameOver() {
		this.arpeggio([440, 349, 262, 196], 0.16, "triangle", 0.18);
	}
	start() {
		this.arpeggio([392, 523, 659], 0.07, "square", 0.16);
	}
	/** Low pulse for the crawler's step / the swarm's sway. */
	march(step: number) {
		this.tone(step % 2 === 0 ? 90 : 74, step % 2 === 0 ? 84 : 68, 0.07, "triangle", 0.075);
	}
	dive() {
		this.tone(1000, 300, 0.3, "sawtooth", 0.1);
	}
	extraLife() {
		this.arpeggio([784, 988, 1174, 1568], 0.06, "triangle", 0.16);
	}
}

/** One shared instance: the games never both run at once. */
export const Sound = typeof window === "undefined" ? null : new ArcadeAudio();
