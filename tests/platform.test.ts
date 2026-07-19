import assert from "node:assert/strict";
import test from "node:test";
import { PlatformBridge } from "../app/game/platform.ts";

type Settings = { muteAudio?: boolean };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function installHost(options: {
  hostname?: string;
  search?: string;
  init?: () => Promise<void>;
  settings?: Settings;
} = {}) {
  let starts = 0;
  let stops = 0;
  let initCalls = 0;
  let added: ((settings: Settings) => void) | null = null;
  let removed: ((settings: Settings) => void) | null = null;
  const sdk = {
    init: async () => {
      initCalls += 1;
      await (options.init?.() ?? Promise.resolve());
    },
    game: {
      settings: options.settings ?? {},
      gameplayStart: () => { starts += 1; },
      gameplayStop: () => { stops += 1; },
      addSettingsChangeListener: (listener: (settings: Settings) => void) => { added = listener; },
      removeSettingsChangeListener: (listener: (settings: Settings) => void) => { removed = listener; },
    },
  };
  let scripts = 0;
  const fakeDocument = {
    createElement: () => ({
      src: "",
      async: false,
      addEventListener() {},
      remove() {},
    }),
    head: { appendChild: () => { scripts += 1; } },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        hostname: options.hostname ?? "games.crazygames.com",
        search: options.search ?? "",
      },
      CrazyGames: { SDK: sdk },
    },
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: fakeDocument });
  return {
    sdk,
    counts: () => ({ starts, stops, initCalls, scripts }),
    added: () => added,
    removed: () => removed,
  };
}

test("loads only on an exact CrazyGames domain, not a lookalike suffix", async () => {
  const lookalike = installHost({ hostname: "notcrazygames.com" });
  const ignored = new PlatformBridge();
  await ignored.init();
  assert.equal(lookalike.counts().initCalls, 0);

  const real = installHost({ hostname: "www.crazygames.com" });
  const connected = new PlatformBridge();
  await connected.init();
  assert.equal(real.counts().initCalls, 1);
});

test("localhost requires the explicit crazygames-preview query flag", async () => {
  const normal = installHost({ hostname: "localhost" });
  await new PlatformBridge().init();
  assert.equal(normal.counts().initCalls, 0);

  const preview = installHost({ hostname: "localhost", search: "?crazygames-preview" });
  await new PlatformBridge().init();
  assert.equal(preview.counts().initCalls, 1);
});

test("a stop during delayed initialization prevents a late gameplay start", async () => {
  const gate = deferred();
  const host = installHost({ init: () => gate.promise });
  const bridge = new PlatformBridge();
  bridge.gameplayStart();
  const pending = bridge.init();
  bridge.gameplayStop();
  gate.resolve();
  await pending;
  assert.deepEqual(host.counts(), { starts: 0, stops: 0, initCalls: 1, scripts: 0 });
});

test("duplicate desired states emit one start and one stop", async () => {
  const host = installHost();
  const bridge = new PlatformBridge();
  await bridge.init();
  bridge.gameplayStart();
  bridge.gameplayStart();
  bridge.gameplayStop();
  bridge.gameplayStop();
  assert.equal(host.counts().starts, 1);
  assert.equal(host.counts().stops, 1);
});

test("an explicitly rejected SDK initialization can be retried", async () => {
  let attempt = 0;
  const host = installHost({
    init: () => {
      attempt += 1;
      if (attempt === 1) return Promise.reject(new Error("host rejected"));
      return Promise.resolve();
    },
  });
  const bridge = new PlatformBridge({ initTimeoutMs: 5 });
  await bridge.init();
  await bridge.init();
  bridge.gameplayStart();
  assert.equal(host.counts().initCalls, 2);
  assert.equal(host.counts().starts, 1);
});

test("caller timeouts do not duplicate a still-pending SDK initialization", async () => {
  const gate = deferred();
  const host = installHost({ init: () => gate.promise });
  const bridge = new PlatformBridge({ initTimeoutMs: 5 });

  bridge.gameplayStart();
  await bridge.init();
  await bridge.init();
  assert.deepEqual(host.counts(), { starts: 0, stops: 0, initCalls: 1, scripts: 0 });

  gate.resolve();
  await bridge.init();
  assert.deepEqual(host.counts(), { starts: 1, stops: 0, initCalls: 1, scripts: 0 });
});

test("platform mute state is forwarded and its listener is removed on dispose", async () => {
  const host = installHost({ settings: { muteAudio: true } });
  const bridge = new PlatformBridge();
  const observed: boolean[] = [];
  bridge.setMuteListener((muted) => observed.push(muted));
  await bridge.init();
  assert.equal(bridge.isAudioMuted(), true);
  host.added()?.({ muteAudio: false });
  assert.deepEqual(observed, [false, true, false]);
  const installedListener = host.added();
  bridge.dispose();
  assert.equal(host.removed(), installedListener);
});

test("dispose reports a final stop once and rejects later start requests", async () => {
  const host = installHost();
  const bridge = new PlatformBridge();
  await bridge.init();
  bridge.gameplayStart();
  bridge.dispose();
  bridge.gameplayStart();
  assert.equal(host.counts().starts, 1);
  assert.equal(host.counts().stops, 1);
});
