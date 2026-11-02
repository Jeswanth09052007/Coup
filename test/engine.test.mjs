import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, start, move, view, timeout, forfeit, living, ROLES } from '../server/engine.mjs';
const room = (n = 3) => {
  const r = createRoom('ABC234', { id: 'p0', name: 'Jessie', connected: true });
  for (let i = 1; i < n; i++) r.players.push({ id: `p${i}`, name: `Player ${i}`, connected: true, ready: true });
  start(r, 'p0'); r.turnId = 'p0'; return r;
};
const doMove = (r, id, cmd) => move(r, id, { ...cmd, phaseId: r.phase.id });
const act = (r, kind, targetId = 'p1') => doMove(r, r.turnId, { type: 'action', kind, targetId });
function pass(r) { const id = r.phase.id; for (const p of [...(r.phase.eligible || [])]) if (r.phase.id === id && !r.phase.passed.includes(p)) doMove(r, p, { type: 'pass' }); }
function lose(r, index = 0) { const p = r.players.find(p => p.id === r.phase.playerId); doMove(r, p.id, { type: 'lose', cardId: p.cards.filter(c => !c.revealed)[index].id }); }
function hands(r, assignments) {
  const all = [...r.deck, ...r.players.flatMap(p => p.cards)]; r.deck = all;
  for (let i = 0; i < r.players.length; i++) {
    r.players[i].cards = (assignments[i] || ['Duke', 'Contessa']).map(role => { const index = r.deck.findIndex(c => c.role === role); assert.notEqual(index, -1); return r.deck.splice(index, 1)[0]; });
  }
}
function conserve(r) {
  const borrowed = r.phase?.type === 'exchange' ? r.phase.pool.filter(c => !r.players.flatMap(p => p.cards).some(x => x.id === c.id)) : [];
  const all = [...r.deck, ...r.players.flatMap(p => p.cards), ...borrowed];
  assert.equal(all.length, 15); assert.equal(new Set(all.map(c => c.id)).size, 15);
  for (const role of ROLES) assert.equal(all.filter(c => c.role === role).length, 3);
  assert.ok(r.players.every(p => p.coins >= 0));
}
test('minimum three; all opponents ready and connected', () => {
  const r = createRoom('ABC234', { id: 'a', name: 'A', connected: true });
  assert.throws(() => start(r, 'a'), /3–6/);
  r.players.push({ id: 'b', connected: true, ready: true }, { id: 'c', connected: false, ready: true });
  assert.throws(() => start(r, 'a'), /reconnect/);
  r.players[2].connected = true; r.players[2].ready = false;
  assert.throws(() => start(r, 'a'), /ready/);
});
test('deals 2 cards and 2 coins, preserves all 15 cards, private projections', () => {
  const r = room(6); conserve(r);
  for (const p of r.players) { assert.equal(p.cards.length, 2); assert.equal(p.coins, 2); }
  const v = view(r, 'p0'); assert.equal(v.players[0].coins, 2); assert.equal(v.players[1].coins, null);
  assert.deepEqual(v.players[1].cards, [{ revealed: false }, { revealed: false }]);
  const json = JSON.stringify(v); assert.ok(!json.includes('tokenHash')); assert.ok(!json.includes('continuation')); assert.equal(v.courtCount, 3);
});
test('income instant and cannot challenge; foreign aid can be blocked by a rival Duke', () => {
  const r = room(); act(r, 'income'); assert.equal(r.players[0].coins, 3); assert.equal(r.turnId, 'p1');
  act(r, 'aid'); assert.equal(r.phase.type, 'block'); doMove(r, 'p2', { type: 'block', role: 'Duke' });
  pass(r); assert.equal(r.players[1].coins, 2); assert.equal(r.turnId, 'p2');
});
test('tax may be bluffed when unchallenged', () => {
  const r = room(); hands(r, [['Captain', 'Contessa'], ['Duke', 'Contessa'], ['Assassin', 'Ambassador']]);
  act(r, 'tax'); pass(r); assert.equal(r.players[0].coins, 5); assert.equal(r.turnId, 'p1'); conserve(r);
});
test('truthful challenge replaces proof, challenger chooses loss, original action proceeds', () => {
  const r = room(); hands(r, [['Duke', 'Captain'], ['Contessa', 'Assassin'], ['Duke', 'Ambassador']]);
  act(r, 'tax'); doMove(r, 'p2', { type: 'challenge' }); assert.equal(r.phase.playerId, 'p2');
  assert.equal(r.events.at(-1).winnerId, 'p0'); lose(r); assert.equal(r.players[0].coins, 5); assert.equal(r.players[2].cards.filter(c => c.revealed).length, 1); conserve(r);
});
test('bluffed Assassin challenge fails, cost refunded, loses influence', () => {
  const r = room(); hands(r, [['Duke', 'Captain'], ['Contessa', 'Assassin'], ['Duke', 'Ambassador']]); r.players[0].coins = 5;
  act(r, 'assassinate'); assert.equal(r.players[0].coins, 2); doMove(r, 'p1', { type: 'challenge' }); lose(r);
  assert.equal(r.players[0].coins, 5); assert.equal(r.players[0].cards.filter(c => c.revealed).length, 1); assert.equal(r.players[1].cards.filter(c => c.revealed).length, 0); conserve(r);
});
test('blocked assassination remains paid; bystander cannot block it', () => {
  const r = room(); r.players[0].coins = 3; act(r, 'assassinate'); pass(r);
  assert.throws(() => doMove(r, 'p2', { type: 'block', role: 'Contessa' }), /cannot block/);
  doMove(r, 'p1', { type: 'block', role: 'Contessa' }); pass(r); assert.equal(r.players[0].coins, 0); assert.equal(living(r).length, 3); conserve(r);
});
test('failed Assassin challenge can remove both target influences', () => {
  const r = room(); hands(r, [['Assassin', 'Duke'], ['Captain', 'Ambassador'], ['Contessa', 'Duke']]); r.players[0].coins = 3;
  act(r, 'assassinate'); doMove(r, 'p1', { type: 'challenge' }); lose(r); assert.equal(r.phase.type, 'block'); pass(r); assert.equal(r.phase.type, 'lose'); lose(r);
  assert.equal(living(r).length, 2); assert.equal(r.players[1].coins, 0); conserve(r);
});
test('false Contessa block costs two influences when challenged', () => {
  const r = room(); hands(r, [['Assassin', 'Duke'], ['Captain', 'Ambassador'], ['Contessa', 'Duke']]); r.players[0].coins = 3;
  act(r, 'assassinate'); pass(r); doMove(r, 'p1', { type: 'block', role: 'Contessa' }); doMove(r, 'p0', { type: 'challenge' }); lose(r); assert.equal(r.phase.type, 'lose'); lose(r); assert.equal(living(r).length, 2); conserve(r);
});
test('truthful block replaces card and penalizes challenger; any opponent may challenge a block', () => {
  const r = room(); hands(r, [['Duke', 'Captain'], ['Contessa', 'Captain'], ['Assassin', 'Ambassador']]); r.players[0].coins = 3;
  act(r, 'assassinate'); pass(r); doMove(r, 'p1', { type: 'block', role: 'Contessa' }); doMove(r, 'p2', { type: 'challenge' }); lose(r);
  assert.equal(r.players[0].coins, 0); assert.equal(r.players[2].cards.filter(c => c.revealed).length, 1); assert.equal(r.players[1].cards.filter(c => c.revealed).length, 0); conserve(r);
});
test('steal uses target coins, target can block with Captain or Ambassador', () => {
  for (const role of ['Captain', 'Ambassador']) { const r = room(); act(r, 'steal'); pass(r); doMove(r, 'p1', { type: 'block', role }); pass(r); assert.equal(r.players[0].coins, 2); }
  const r = room(); r.players[1].coins = 1; act(r, 'steal'); pass(r); pass(r); assert.equal(r.players[0].coins, 3); assert.equal(r.players[1].coins, 0);
});
test('coup mandatory at ten, unchallengeable, unaffordable actions rejected', () => {
  const r = room(); assert.throws(() => act(r, 'coup'), /enough coins/); r.players[0].coins = 10;
  assert.throws(() => act(r, 'income'), /must coup/); act(r, 'coup'); assert.equal(r.phase.type, 'lose'); assert.equal(r.players[0].coins, 3); lose(r); assert.equal(r.turnId, 'p1');
});
test('exchange options are private; keep live count only and return exactly two, including at one influence', () => {
  for (const lost of [false, true]) {
    const r = room(); if (lost) r.players[0].cards[0].revealed = true;
    act(r, 'exchange'); pass(r); const s = r.phase;
    assert.equal(s.type, 'exchange'); assert.equal(s.count, lost ? 1 : 2); assert.equal(view(r, 'p1').phase.pool, undefined); assert.equal(view(r, 'p1').phase.count, undefined);
    const ids = s.pool.slice(-s.count).map(c => c.id);
    assert.throws(() => doMove(r, 'p0', { type: 'exchange', cardIds: ['invented'] }), /Choose exactly/);
    doMove(r, 'p0', { type: 'exchange', cardIds: ids }); conserve(r); assert.equal(r.players[0].cards.filter(c => !c.revealed).length, lost ? 1 : 2);
  }
});
test('stale phase, out of turn, invalid target, forged IDs, inherited action keys rejected', () => {
  const r = room(); const old = r.phase.id;
  assert.throws(() => doMove(r, 'p1', { type: 'action', kind: 'income' }), /your turn/);
  assert.throws(() => act(r, 'steal', 'p0'), /living opponent/);
  assert.throws(() => act(r, '__proto__'), /Unknown action/);
  act(r, 'income'); assert.throws(() => move(r, 'p1', { phaseId: old, type: 'action', kind: 'income' }), /moved on/);
});
test('timeout handles turn, forced coup, response, loss and exchange', () => {
  const r = room(); timeout(r); assert.equal(r.players[0].coins, 3); r.players[1].coins = 10; timeout(r); assert.equal(r.phase.type, 'lose'); timeout(r);
  act(r, 'exchange'); timeout(r); assert.equal(r.phase.type, 'exchange'); timeout(r); assert.equal(r.phase.type, 'turn'); conserve(r);
});
test('forfeiting while exchanging conserves borrowed cards; last survivor wins', () => {
  const r = room(); act(r, 'exchange'); pass(r); forfeit(r, 'p0'); conserve(r); assert.equal(r.turnId, 'p1'); forfeit(r, 'p1'); assert.equal(r.status, 'finished'); assert.equal(r.winnerId, 'p2');
});
test('forfeiting actor does not erase another player’s pending challenge penalty', () => {
  const r = room(4); act(r, 'tax'); // Ensure truth before challenge.
  // Restart the claim with deterministic hands without changing phase metadata.
  hands(r, [['Duke', 'Captain'], ['Contessa', 'Assassin'], ['Duke', 'Ambassador'], ['Captain', 'Contessa']]);
  doMove(r, 'p1', { type: 'challenge' }); forfeit(r, 'p0'); assert.equal(r.phase.type, 'lose'); assert.equal(r.phase.playerId, 'p1'); lose(r); assert.equal(r.players[1].cards.filter(c => c.revealed).length, 1); conserve(r);
});
test('simulated games conserve cards and terminate with one winner', () => {
  for (let trial = 0; trial < 30; trial++) {
    const r = room(3 + trial % 4);
    let steps = 0;
    while (r.status === 'playing' && steps++ < 1200) {
      const s = r.phase;
      if (s.type === 'turn') {
        const p = r.players.find(p => p.id === r.turnId), rivals = living(r).filter(q => q.id !== p.id);
        const kind = p.coins >= 7 ? 'coup' : ['tax', 'exchange', 'steal', 'income'][steps % 4];
        act(r, kind, rivals[steps % rivals.length].id);
      } else if (['challengeAction', 'challengeBlock'].includes(s.type) && steps % 3 === 0) doMove(r, s.eligible[0], { type: 'challenge' });
      else if (s.type === 'block' && steps % 3 === 0) doMove(r, s.eligible[0], { type: 'block', role: r.action.kind === 'aid' ? 'Duke' : r.action.kind === 'steal' ? 'Ambassador' : 'Contessa' });
      else timeout(r);
      conserve(r);
    }
    assert.equal(r.status, 'finished'); assert.equal(living(r).length, 1);
  }
});
test('a second opponent can block foreign aid after a first bluff block is exposed', () => {
  const r = room(4); hands(r, [['Assassin', 'Duke'], ['Captain', 'Contessa'], ['Duke', 'Ambassador'], ['Assassin', 'Captain']]);
  act(r, 'aid'); doMove(r, 'p1', { type: 'block', role: 'Duke' }); doMove(r, 'p0', { type: 'challenge' }); lose(r);
  assert.equal(r.phase.type, 'block'); assert.ok(!r.phase.eligible.includes('p1'));
  doMove(r, 'p2', { type: 'block', role: 'Duke' }); pass(r); assert.equal(r.players[0].coins, 2); assert.equal(r.turnId, 'p1'); conserve(r);
});
test('the previous winner opens a rematch if still seated', () => {
  const r = room(); forfeit(r, 'p0'); forfeit(r, 'p1'); assert.equal(r.winnerId, 'p2');
  r.status = 'waiting'; r.winnerId = null; r.players.forEach(p => { p.ready = true; }); start(r, 'p0'); assert.equal(r.turnId, 'p2'); conserve(r);
});
