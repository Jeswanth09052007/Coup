import test from 'node:test';
import assert from 'node:assert/strict';
async function setup(t, { context = true, decode = true } = {}) {
 const calls = { clip: 0, fallback: 0, tones: 0, stopped: 0 };
 t.mock.method(globalThis, 'fetch', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }));
 const original = { Audio: globalThis.Audio, window: globalThis.window, localStorage: globalThis.localStorage };
 globalThis.localStorage = { getItem: () => null, setItem: () => {} };
 globalThis.Audio = class { pause() {} play() { calls.fallback++; return Promise.resolve(); } };
 class Context {
  state = 'running'; currentTime = 0; destination = {};
  decodeAudioData() { return decode ? Promise.resolve({ decoded: true }) : Promise.reject(new Error('Decode failed')); }
  createBufferSource() { return { connect() {}, disconnect() {}, start() { calls.clip++; }, stop() { calls.stopped++; } }; }
  createGain() { return { connect() {}, disconnect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
  createOscillator() { return { frequency: {}, connect() {}, start() { calls.tones++; }, stop() {} }; }
 }
 globalThis.window = context ? { AudioContext: Context } : {};
 t.after(() => { for (const [key, val] of Object.entries(original)) if (val === undefined) delete globalThis[key]; else globalThis[key] = val; });
 const audio = await import(`../src/audio.js?case=${context}-${decode}-${Math.random()}`);
 audio.unlockAudio(); await new Promise(setImmediate);
 return { audio, calls };
}
test('challenge result plays supplied audio through the unlocked context and then the existing celebration', async t => {
 const { audio, calls } = await setup(t);
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const cancel = audio.playChallengeResult();
 assert.equal(calls.clip, 1); assert.equal(calls.fallback, 0); assert.equal(calls.tones, 0);
 t.mock.timers.tick(1400); assert.ok(calls.tones > 0); cancel();
 audio.setSound(false); assert.ok(calls.stopped > 0);
 audio.playSound('loss'); assert.equal(calls.clip, 1);
});
test('HTML audio remains available if decoding fails or AudioContext is unsupported', async t => {
 for (const options of [{ context: true, decode: false }, { context: false }]) {
  await t.test(JSON.stringify(options), async t => {
   const { audio, calls } = await setup(t, options); audio.playSound('loss'); await new Promise(setImmediate);
   assert.equal(calls.clip, 0); assert.equal(calls.fallback, 1);
  });
 }
});
test('cancelled challenge effects do not leave a queued celebration behind', async t => {
 const { audio, calls } = await setup(t); t.mock.timers.enable({ apis: ['setTimeout'] });
 const cancel = audio.playChallengeResult(); cancel(); t.mock.timers.tick(2000);
 assert.equal(calls.clip, 1); assert.equal(calls.tones, 0);
});
