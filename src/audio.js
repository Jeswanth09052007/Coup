let ctx, lossBuffer, lossLoad, lossSource;
let enabled = localStorage.getItem('coup-sound') !== 'off';
let volume = Number(localStorage.getItem('coup-volume') ?? 0.45);
const loss = new Audio('/audio/challenge-lost.mp3');
export function settings() { return { enabled, volume }; }
export function setSound(on, level = volume) { enabled = on; volume = level; localStorage.setItem('coup-sound', on ? 'on' : 'off'); localStorage.setItem('coup-volume', String(level)); if (!on) { loss.pause(); lossSource?.stop(); lossSource = null; } }
export function unlockAudio() {
  try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume().catch(() => {}); } catch { /* Sound is optional. */ }
  // Decode the supplied clip early. The unlocked AudioContext can play it later
  // for remote challenge events, including on browsers that restrict Audio.play().
  if (ctx && !lossLoad) lossLoad = fetch('/audio/challenge-lost.mp3')
    .then(response => { if (!response.ok) throw new Error('Sound unavailable'); return response.arrayBuffer(); })
    .then(bytes => ctx.decodeAudioData(bytes)).then(buffer => { lossBuffer = buffer; return buffer; }).catch(() => null);
}
function playLoss() {
  if (!enabled) return;
  if (ctx && lossBuffer) {
    lossSource?.stop();
    const source = ctx.createBufferSource(), amp = ctx.createGain();
    source.buffer = lossBuffer; amp.gain.setValueAtTime(volume, ctx.currentTime);
    source.connect(amp); amp.connect(ctx.destination); source.start(); lossSource = source;
    source.onended = () => { if (lossSource === source) lossSource = null; source.disconnect(); amp.disconnect(); };
  } else { loss.pause(); loss.currentTime = 0; loss.volume = volume; loss.play().catch(() => {}); }
}
export function playChallengeResult() {
  // Both truthful claims and caught bluffs use the same cue in every game mode.
  playSound('loss');
  const timer = setTimeout(() => playSound('win'), 1400);
  return () => clearTimeout(timer);
}
function tone(freq, at, length, type = 'sine', gain = 0.14) {
  if (!ctx || !enabled) return;
  const osc = ctx.createOscillator(), amp = ctx.createGain();
  osc.type = type; osc.frequency.value = freq; amp.gain.setValueAtTime(0, at); amp.gain.linearRampToValueAtTime(gain * volume, at + 0.015); amp.gain.exponentialRampToValueAtTime(0.0001, at + length); osc.connect(amp); amp.connect(ctx.destination); osc.start(at); osc.stop(at + length);
}
export function playSound(kind) {
  if (!enabled) return; unlockAudio();
  if (kind === 'loss') { if (lossLoad && !lossBuffer) lossLoad.then(playLoss); else playLoss(); return; }
  if (!ctx) return;
  const now = ctx.currentTime;
  if (kind === 'challenge') {
    [220, 233.08, 174.61, 207.65].forEach((f, i) => tone(f, now + i * .16, .32, 'triangle', .22));
    tone(82.41, now, .9, 'sine', .28);
  } else if (kind === 'win' || kind === 'winner') {
    const notes = kind === 'winner' ? [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5] : [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => tone(f, now + i * .115, .4, 'triangle', .22));
    [261.63, 329.63, 392].forEach(f => tone(f, now + .36, .75, 'sine', .09));
  } else if (kind === 'card') [600, 900].forEach((f, i) => tone(f, now + i * .03, .07, 'triangle', .08));
  else tone(440, now, .08, 'sine', .09);
}
