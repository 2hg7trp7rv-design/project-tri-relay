import assert from "node:assert/strict";
import test from "node:test";
import { AudioDirector } from "../app/game/audio.ts";

class FakeAudioParam {
  value = 0;
  setTargetAtTime() {}
  setValueAtTime(value: number) {
    this.value = value;
  }
  exponentialRampToValueAtTime(value: number) {
    this.value = value;
  }
}

class FakeAudioNode {
  disconnects = 0;
  connect() {
    return this;
  }
  disconnect() {
    this.disconnects += 1;
  }
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam();
}

class FakeOscillatorNode extends FakeAudioNode {
  type: OscillatorType = "sine";
  frequency = new FakeAudioParam();
  starts = 0;
  stops = 0;
  start() {
    this.starts += 1;
  }
  stop() {
    this.stops += 1;
  }
}

class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = "lowpass";
  frequency = new FakeAudioParam();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: AudioContextState = "suspended";
  currentTime = 0;
  destination = new FakeAudioNode();
  master: FakeGainNode | null = null;
  oscillators: FakeOscillatorNode[] = [];
  resumes = 0;
  suspends = 0;
  closes = 0;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createGain() {
    const node = new FakeGainNode();
    if (!this.master) this.master = node;
    return node;
  }

  createOscillator() {
    const node = new FakeOscillatorNode();
    this.oscillators.push(node);
    return node;
  }

  createBiquadFilter() {
    return new FakeBiquadFilterNode();
  }

  async resume() {
    this.resumes += 1;
    this.state = "running";
  }

  async suspend() {
    this.suspends += 1;
    this.state = "suspended";
  }

  async close() {
    this.closes += 1;
    this.state = "closed";
  }
}

function installAudioContext() {
  FakeAudioContext.instances = [];
  (globalThis as unknown as { window: { AudioContext: typeof AudioContext } }).window = {
    AudioContext: FakeAudioContext as unknown as typeof AudioContext,
  };
}

test("audio remains suspended until an explicit unlock gesture", async () => {
  installAudioContext();
  const director = new AudioDirector();

  director.startDrone();
  const context = FakeAudioContext.instances[0];
  assert.ok(context);
  assert.equal(context.resumes, 0);
  assert.equal(context.state, "suspended");

  director.unlock();
  await Promise.resolve();
  assert.equal(context.resumes, 1);
  assert.equal(context.state, "running");
});

test("suspend, resume, and disposal release the mobile audio graph", async () => {
  installAudioContext();
  const director = new AudioDirector();

  director.unlock();
  await Promise.resolve();
  const context = FakeAudioContext.instances[0];
  director.startDrone();
  assert.equal(context.oscillators.length, 2);

  director.suspend();
  await Promise.resolve();
  assert.equal(context.suspends, 1);
  assert.equal(context.state, "suspended");

  director.resume();
  await Promise.resolve();
  assert.equal(context.resumes, 2);
  assert.equal(context.state, "running");

  director.dispose();
  await Promise.resolve();
  assert.equal(context.closes, 1);
  assert.equal(context.master?.disconnects, 1);
  assert.deepEqual(context.oscillators.map((node) => node.stops), [1, 1]);

  director.unlock();
  assert.equal(FakeAudioContext.instances.length, 2);
});
