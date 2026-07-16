type CrazyGamesSdk = {
  init: () => Promise<void>;
  game: {
    settings?: { muteAudio?: boolean; disableChat?: boolean };
    addSettingsChangeListener?: (listener: (settings: { muteAudio?: boolean }) => void) => void;
    removeSettingsChangeListener?: (listener: (settings: { muteAudio?: boolean }) => void) => void;
    gameplayStart: () => void;
    gameplayStop: () => void;
    loadingStart?: () => void;
    loadingStop?: () => void;
  };
};

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazyGamesSdk };
  }
}

const SDK_URL = "https://sdk.crazygames.com/crazygames-sdk-v3.js";

export class PlatformBridge {
  private ready = false;
  private loading: Promise<void> | null = null;
  private platformMuted = false;
  private onMuteChange: ((muted: boolean) => void) | null = null;
  private settingsListener = (settings: { muteAudio?: boolean }) => {
    this.platformMuted = settings.muteAudio === true;
    this.onMuteChange?.(this.platformMuted);
  };

  setMuteListener(listener: ((muted: boolean) => void) | null) {
    this.onMuteChange = listener;
    listener?.(this.platformMuted);
  }

  isAudioMuted() {
    return this.platformMuted;
  }

  private connectSettings() {
    const game = window.CrazyGames?.SDK?.game;
    if (!game) return;
    this.settingsListener(game.settings ?? {});
    game.addSettingsChangeListener?.(this.settingsListener);
  }

  private shouldLoad() {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname.toLowerCase();
    const localPreview = host === "localhost" || host === "127.0.0.1";
    return host.endsWith("crazygames.com") || (localPreview && new URLSearchParams(window.location.search).has("crazygames-preview"));
  }

  async init() {
    if (!this.shouldLoad() || this.ready) return;
    if (this.loading) return this.loading;
    this.loading = new Promise<void>((resolve) => {
      const finish = async () => {
        try {
          if (window.CrazyGames?.SDK) {
            await window.CrazyGames.SDK.init();
            this.ready = true;
            this.connectSettings();
          }
        } catch {
          this.ready = false;
        }
        resolve();
      };

      if (window.CrazyGames?.SDK) {
        void finish();
        return;
      }
      const script = document.createElement("script");
      script.src = SDK_URL;
      script.async = true;
      script.addEventListener("load", () => void finish(), { once: true });
      script.addEventListener("error", () => resolve(), { once: true });
      document.head.appendChild(script);
    });
    return this.loading;
  }

  gameplayStart() {
    if (!this.ready) return;
    try {
      window.CrazyGames?.SDK?.game.gameplayStart();
    } catch {
      // Platform telemetry must never interrupt play.
    }
  }

  gameplayStop() {
    if (!this.ready) return;
    try {
      window.CrazyGames?.SDK?.game.gameplayStop();
    } catch {
      // Platform telemetry must never interrupt play.
    }
  }

  dispose() {
    try {
      window.CrazyGames?.SDK?.game.removeSettingsChangeListener?.(this.settingsListener);
    } catch {
      // The host may already have torn down the SDK frame.
    }
    this.onMuteChange = null;
    this.ready = false;
  }
}
