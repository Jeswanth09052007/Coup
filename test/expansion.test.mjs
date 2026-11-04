import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, start, move, timeout, forfeit, view, alive, ROLES } from '../server/engine.mjs';

function table(n, teams = false) {
  const r = createRoom('ABC234', { id: 'p0', name: 'P0', connected: true }, { maxPlayers: n, gameMode: teams ? 'teams' : 'free' });
  for (let i = 1; i < n; i++) r.players.push({ id: `p${i}`, name: `P${i}`, team: teams ? (i % 2 ? 'B' : 'A') : null, ready: true, connected: true });
  start(r, 'p0'); r.turnId = 'p0'; return r;
}
function command(r, id, cmd) { move(r, id, { phaseId: r.phase.id, ...cmd }); }
function conservation(r, n) {
  const held = r.players.flatMap(p => p.cards);
  const borrowed = r.phase?.type === 'exchange' ? r.phase.pool.filter(c => !held.some(x => x.id === c.id)) : [];
  const cards = [...held, ...r.deck, ...borrowed], copies = 3 * Math.ceil(n / 6);
  assert.equal(cards.length, copies * 5); assert.equal(new Set(cards.map(c => c.id)).size, cards.length);
  for (const role of ROLES) assert.equal(cards.filter(c => c.role === role).length, copies);
}

test('all 3–15 player tables deal and complete while preserving the expanded deck', () => {
  for (let n = 3; n <= 15; n++) {
    const r = table(n); conservation(r, n);
    assert.ok(r.deck.length >= 3);
    command(r, 'p0', { type: 'action', kind: 'exchange' });
    while (r.phase.type === 'challengeAction') timeout(r);
    assert.equal(r.phase.type, 'exchange'); conservation(r, n);
    assert.equal(view(r, 'p1').phase.pool, undefined);
    timeout(r); conservation(r, n);
    let turns = 0;
    while (r.status === 'playing' && turns++ < 10000) { timeout(r); conservation(r, n); }
    assert.equal(r.status, 'finished'); assert.equal(r.players.filter(alive).length, 1);
  }
});
test('capacity is bounded and team tables require equal valid teams', () => {
  assert.equal(createRoom('X', {}, { maxPlayers: 100 }).maxPlayers, 15);
  assert.equal(createRoom('X', {}, { maxPlayers: 15, gameMode: 'teams' }).maxPlayers, 14);
  assert.equal(createRoom('X', {}, { maxPlayers: 5.9, gameMode: 'teams' }).maxPlayers, 4);
  const r = table(4, true); r.status = 'waiting'; r.players[0].team = 'B';
  assert.throws(() => start(r, 'p0'), /equal teams/);
  r.players[0].team = null; assert.throws(() => start(r, 'p0'), /equal teams/);
});
test('teammates cannot attack, challenge, or block each other; timeout coup chooses a rival', () => {
  const r = table(4, true); const ally = r.players.find(p => p.id !== 'p0' && p.team === 'A');
  for (const kind of ['steal', 'assassinate', 'coup']) {
    r.players[0].coins = 9;
    assert.throws(() => command(r, 'p0', { type: 'action', kind, targetId: ally.id }), /living opponent/);
    assert.equal(r.players[0].coins, 9);
  }
  r.players[0].coins = 2;
  command(r, 'p0', { type: 'action', kind: 'tax' });
  assert.ok(!r.phase.eligible.includes(ally.id));
  assert.throws(() => command(r, ally.id, { type: 'challenge' }), /cannot challenge/);
  timeout(r); r.turnId = 'p0';
  command(r, 'p0', { type: 'action', kind: 'aid' });
  assert.ok(!r.phase.eligible.includes(ally.id));
  assert.throws(() => command(r, ally.id, { type: 'block', role: 'Duke' }), /cannot block/);
  const blocker = r.players.find(p => p.team === 'B');
  command(r, blocker.id, { type: 'block', role: 'Duke' });
  assert.ok(r.phase.eligible.every(id => r.players.find(p => p.id === id).team === 'A'));
  timeout(r); r.turnId = 'p0'; r.players[0].coins = 10;
  // Put an ally immediately next in seat order: timeout must still skip that ally.
  r.players = [r.players[0], ally, ...r.players.filter(p => p.team === 'B')];
  timeout(r); assert.equal(r.action.kind, 'coup'); assert.equal(r.players.find(p => p.id === r.action.targetId).team, 'B');
});
test('all team sizes finish with a team winner, preserve privacy and reset on rematch', () => {
  for (let n = 4; n <= 14; n += 2) {
    const r = table(n, true);
    assert.deepEqual(r.players.map(p => p.team), Array.from({ length: n }, (_, i) => i % 2 ? 'B' : 'A'));
    const projected = view(r, 'p0'), ally = projected.players.find(p => p.id !== 'p0' && p.team === 'A');
    assert.equal(ally.coins, 2); assert.ok(ally.cards.every(c => c.role && c.id));
    const enemy = projected.players.find(p => p.team === 'B');
    assert.equal(enemy.coins, null); assert.deepEqual(enemy.cards, [{ revealed: false }, { revealed: false }]);
    let turns = 0;
    while (r.status === 'playing' && turns++ < 10000) { timeout(r); conservation(r, n); }
    assert.equal(r.status, 'finished');
    assert.ok(['A', 'B'].includes(r.winnerTeam));
    assert.equal(new Set(r.players.filter(alive).map(p => p.team)).size, 1);
    r.players.forEach(p => { p.ready = true; }); start(r, 'p0');
    assert.equal(r.winnerTeam, null); assert.equal(r.winnerId, null);
  }
});
test('a whole team wins when the opposing team forfeits', () => {
  const r = table(4, true);
  for (const p of r.players.filter(p => p.team === 'B')) forfeit(r, p.id);
  assert.equal(r.status, 'finished'); assert.equal(r.winnerTeam, 'A');
  assert.equal(r.players.filter(alive).length, 2);
  assert.equal(view(r, 'p0').events.at(-1).winnerTeam, 'A');
});
