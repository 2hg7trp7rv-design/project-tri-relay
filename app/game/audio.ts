import type { EngineEvent } from "./model.ts";

type BrowserAudioContext = typeof AudioContext;

export class AudioDirector {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private drone: OscillatorNode[] = [];
  private muted = false;

  setMuted(value: boolean) {
    this.muted = value;
    if (this.master) {
      this.master.gain.setTargetAtTime(value ? 0 : 0.16, this.context?.currentTime ?? 0, 0.02);
    }
  }

  isMuted() {
    return this.muted;
  }

  private ensure() {
    if (typeof window === "undefined") return null;
    if (this.context?.state === "closed") {
      this.context = null;
      this.master = null;
      this.drone = [];
    }
    if (!this.context) {
      const AudioCtor = (window.AudioContext ||
        (window as unknown as { webkitAudioContext?: BrowserAudioContext }).webkitAudioContext) as
        | BrowserAudioContext
        | undefined;
      if (!AudioCtor) return null;
      this.context = new AudioCtor();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.16;
      this.master.connect(this.context.destination);
    }
    return this.context;
  }

  /**
   * Must be called synchronously from a user gesture. Mobile browsers are free
   * to reject this request, so audio can never be allowed to block gameplay.
   */
  unlock() {
    const context = this.ensure();
    // WebKit can temporarily report a non-standard "interrupted" state on
    // iOS; resume every non-running, non-closed context for the same reason.
    if (context && context.state !== "running" && context.state !== "closed") {
      void context.resume().catch(() => {
        // A later user gesture will retry the unlock.
      });
    }
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType = "sine",
    volume = 0.28,
    slide = 0,
    delay = 0,
  ) {
    const context = this.ensure();
    if (!context || !this.master || this.muted) return;
    const at = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(0.025, duration / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  startDrone() {
    if (this.muted) return;
    const context = this.ensure();
    if (!context || !this.master || this.drone.length) return;
    [43.65, 65.41].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      oscillator.type = index ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      filter.type = "lowpass";
      filter.frequency.value = 220;
      gain.gain.value = index ? 0.025 : 0.04;
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(this.master!);
      oscillator.start();
      this.drone.push(oscillator);
    });
  }

  stopDrone() {
    this.drone.forEach((oscillator) => {
      try {
        oscillator.stop();
      } catch {
        // Already stopped by the browser.
      }
    });
    this.drone = [];
  }

  suspend() {
    if (this.context?.state === "running") {
      void this.context.suspend().catch(() => {
        // Lifecycle suspension is best-effort and must not interrupt saving.
      });
    }
  }

  resume() {
    this.unlock();
  }

  dispose() {
    this.stopDrone();
    const context = this.context;
    this.context = null;
    if (this.master) {
      try {
        this.master.disconnect();
      } catch {
        // The graph may already have been released by the browser.
      }
    }
    this.master = null;
    if (context && context.state !== "closed") {
      void context.close().catch(() => {
        // The browser owns final cleanup if closing is rejected.
      });
    }
  }

  play(events: EngineEvent[]) {
    events.forEach((event) => {
      switch (event.kind) {
        case "rotate":
          this.tone(170, 0.07, "square", 0.16, 70);
          break;
        case "pulse":
          this.tone(290, 0.08, "sine", 0.12, 80);
          break;
        case "overdrive":
          this.tone(310, 0.12, "triangle", 0.18, 310);
          this.tone(620, 0.2, "sine", 0.16, 260, 0.08);
          break;
        case "extract":
          this.tone(96, 0.16, "sawtooth", 0.2, -24);
          this.tone(190, 0.08, "square", 0.09, 20, 0.08);
          break;
        case "fabricate":
          this.tone(150, 0.08, "square", 0.13, 30);
          this.tone(225, 0.11, "triangle", 0.15, 75, 0.08);
          break;
        case "defend":
          this.tone(440, 0.07, "sawtooth", 0.2, -260);
          this.tone(82, 0.12, "square", 0.16, -30, 0.02);
          break;
        case "fail":
          this.tone(115, 0.14, "square", 0.11, -35);
          break;
        case "kill":
          this.tone(520, 0.08, "triangle", 0.12, 210);
          break;
        case "breach":
          this.tone(70, 0.28, "sawtooth", 0.3, -30);
          break;
        case "jam":
          this.tone(125, 0.1, "square", 0.13, -45);
          this.tone(92, 0.12, "square", 0.1, 30, 0.13);
          break;
        case "wave":
        case "upgrade":
          this.tone(260, 0.12, "sine", 0.12, 140);
          this.tone(390, 0.18, "sine", 0.12, 160, 0.1);
          break;
        case "win":
          [220, 330, 440, 660].forEach((frequency, index) =>
            this.tone(frequency, 0.26, "triangle", 0.11, 80, index * 0.12),
          );
          break;
        case "lose":
          this.tone(170, 0.5, "sawtooth", 0.2, -120);
          break;
        default:
          break;
      }
    });
  }
}
