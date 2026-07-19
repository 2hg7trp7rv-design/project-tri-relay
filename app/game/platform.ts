type CrazyGamesSettings = {
  muteAudio?: boolean;
  disableChat?: boolean;
};

type CrazyGamesSdk = {
  init: () => Promise<void>;
  game: {
    settings?: CrazyGamesSettings;
    addSettingsChangeListener?: (listener: (settings: CrazyGamesSettings) => void) => void;
    removeSettingsChangeListener?: (listener: (settings: CrazyGamesSettings) => void) => void;
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
const DEFAULT_INIT_TIMEOUT_MS = 8_000;

type PlatformBridgeOptions = {
  /** Kept injectable so a stalled host SDK can be covered without slow tests. */
  initTimeoutMs?: number;
};

function isCrazyGamesHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === "crazygames.com" || host.endsWith(".crazygames.com");
}

function isLocalPreview(location: Location) {
  const host = location.hostname.toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  return local && new URLSearchParams(location.search).has("crazygames-preview");
}

/**
 * A desired-state bridge around the optional CrazyGames SDK.
 *
 * `gameplayStart()` records that play should be active even while the SDK is
 * loading. A later `gameplayStop()` clears that desire, so a delayed SDK init
 * can never report a stale start after the game has already paused.
 */
export class PlatformBridge {
  private ready = false;
  private loading: Promise<void> | null = null;
  private sdkInitialization: Promise<boolean> | null = null;
  private desiredPlaying = false;
  private reportedPlaying = false;
  private disposed = false;
  private generation = 0;
  private settingsConnected = false;
  private platformMuted = false;
  private onMuteChange: ((muted: boolean) => void) | null = null;
  private readonly initTimeoutMs: number;
  private settingsListener = (settings: CrazyGamesSettings) => {
    this.platformMuted = settings.muteAudio === true;
    this.onMuteChange?.(this.platformMuted);
  };

  constructor(options: PlatformBridgeOptions = {}) {
    this.initTimeoutMs = Math.max(1, options.initTimeoutMs ?? DEFAULT_INIT_TIMEOUT_MS);
  }

  setMuteListener(listener: ((muted: boolean) => void) | null) {
    this.onMuteChange = listener;
    listener?.(this.platformMuted);
  }

  isAudioMuted() {
    return this.platformMuted;
  }

  private shouldLoad() {
    if (typeof window === "undefined") return false;
    return isCrazyGamesHost(window.location.hostname) || isLocalPreview(window.location);
  }

  private disconnectSettings() {
    if (!this.settingsConnected || typeof window === "undefined") return;
    try {
      window.CrazyGames?.SDK?.game.removeSettingsChangeListener?.(this.settingsListener);
    } catch {
      // The host may already have torn down its iframe.
    }
    this.settingsConnected = false;
  }

  private connectSettings() {
    const game = window.CrazyGames?.SDK?.game;
    if (!game || this.settingsConnected) return;
    this.settingsListener(game.settings ?? {});
    try {
      game.addSettingsChangeListener?.(this.settingsListener);
      this.settingsConnected = true;
    } catch {
      this.settingsConnected = false;
    }
  }

  private reconcileGameplay() {
    if (!this.ready || typeof window === "undefined") return;
    const game = window.CrazyGames?.SDK?.game;
    if (!game || this.reportedPlaying === this.desiredPlaying) return;

    // Update first. If a host callback throws, repeated React renders must not
    // produce duplicate start/stop reports.
    this.reportedPlaying = this.desiredPlaying;
    try {
      if (this.desiredPlaying) game.gameplayStart();
      else game.gameplayStop();
    } catch {
      // Platform reporting must never interrupt or resume the simulation.
    }
  }

  private getOrStartSdkInitialization(generation: number) {
    if (this.sdkInitialization) return this.sdkInitialization;

    const sdk = window.CrazyGames?.SDK;
    if (!sdk) return null;

    // Keep the host's underlying init operation distinct from the timeout used
    // by each caller. A caller may stop waiting, but starting sdk.init() again
    // while the first promise is still pending can corrupt SDK host state.
    const initialization = Promise.resolve()
      .then(() => sdk.init())
      .then(
        () => {
          if (this.disposed || generation !== this.generation) return false;
          this.ready = true;
          this.connectSettings();
          this.reconcileGameplay();
          return true;
        },
        () => {
          if (generation === this.generation) this.ready = false;
          return false;
        },
      );

    this.sdkInitialization = initialization;
    void initialization.then(() => {
      if (this.sdkInitialization === initialization) this.sdkInitialization = null;
    });
    return initialization;
  }

  private async initializeSdk(generation: number) {
    const initialization = this.getOrStartSdkInitialization(generation);
    if (!initialization) return false;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const timedOut = new Promise<false>((resolve) => {
        timeoutId = setTimeout(() => resolve(false), this.initTimeoutMs);
      });
      return await Promise.race([initialization, timedOut]);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }

  private loadScript(generation: number) {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const script = document.createElement("script");
      const finish = (loaded: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        if (!loaded) script.remove?.();
        resolve(loaded && !this.disposed && generation === this.generation);
      };
      const timeoutId = setTimeout(() => finish(false), this.initTimeoutMs);
      script.src = SDK_URL;
      script.async = true;
      script.addEventListener("load", () => finish(true), { once: true });
      script.addEventListener("error", () => finish(false), { once: true });
      document.head.appendChild(script);
    });
  }

  async init() {
    if (!this.shouldLoad() || this.disposed) return;
    if (this.ready) {
      this.reconcileGameplay();
      return;
    }
    if (this.loading) return this.loading;

    const generation = this.generation;
    this.loading = (async () => {
      if (!window.CrazyGames?.SDK) {
        const loaded = await this.loadScript(generation);
        if (!loaded) return;
      }
      await this.initializeSdk(generation);
    })().finally(() => {
      // Release the caller-facing wait. A rejected init can start a new host
      // attempt; a timeout reuses sdkInitialization until that promise settles.
      if (generation === this.generation) this.loading = null;
    });
    return this.loading;
  }

  gameplayStart() {
    if (this.disposed) return;
    this.desiredPlaying = true;
    this.reconcileGameplay();
    if (!this.ready) void this.init();
  }

  gameplayStop() {
    this.desiredPlaying = false;
    this.reconcileGameplay();
  }

  dispose() {
    this.desiredPlaying = false;
    this.reconcileGameplay();
    this.disconnectSettings();
    this.onMuteChange = null;
    this.platformMuted = false;
    this.ready = false;
    this.reportedPlaying = false;
    this.disposed = true;
    this.generation += 1;
    this.loading = null;
    this.sdkInitialization = null;
  }
}

export const PLATFORM_SDK_URL = SDK_URL;
