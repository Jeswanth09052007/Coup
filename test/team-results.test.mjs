import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, start, move, timeout, view, forfeit } from '../server/engine.mjs';
import { recordResult } from '../server/leaderboard.mjs';
function table(teams = false) {
 const r = createRoom('ABC234', { id: 'p0', name: 'Host', connected: true }, { gameMode: teams ? 'teams' : 'free', maxPlayers: 4 });
 for (let i = 1; i < (teams ? 4 : 3); i++) r.players.push({ id: `p${i}`, name: `P${i}`, team: teams ? i % 2 ? 'B' : 'A' : null, ready: true, connected: true });
 start(r, 'p0'); r.turnId = 'p0'; return r;
}
const cmd = (r, id, c) => move(r, id, { phaseId: r.phase.id, ...c });

test('all team members can inspect current ally cards and coins; enemies and free-for-all rivals cannot', () => {
 const r = table(true);
 r.players[0].coins = 8;
 const v = view(r, 'p2'), host = v.players.find(p => p.id === 'p0');
 assert.equal(host.coins, 8); assert.deepEqual(host.cards, r.players[0].cards);
 const enemy = view(r, 'p1').players.find(p => p.id === 'p0');
 assert.equal(enemy.coins, null); assert.deepEqual(enemy.cards, [{ revealed: false }, { revealed: false }]);
 const solo = table(); assert.equal(view(solo, 'p1').players[0].coins, null);
 r.players[2].cards.forEach(c => { c.revealed = true; });
 assert.ok(view(r, 'p2').players.find(p => p.id === 'p0').cards.every(c => c.role));
 assert.ok(!JSON.stringify(v).includes('tokenHash'));
 // Switching sides between rounds immediately changes access, with no cached ally hand.
 r.status = 'waiting'; r.players[2].team = 'B';
 assert.equal(view(r, 'p2').players.find(p => p.id === 'p0').coins, null);
 assert.ok(view(r, 'p2').players.find(p => p.id === 'p0').cards.every(c => !c.role));
});
test('ally view tracks an exchange without exposing the unchosen court pool', () => {
 const r = table(true); cmd(r, 'p0', { type: 'action', kind: 'exchange' }); timeout(r);
 assert.equal(r.phase.type, 'exchange');
 const teammate = view(r, 'p2'); assert.equal(teammate.phase.pool, undefined);
 assert.deepEqual(teammate.players[0].cards, r.players[0].cards);
 const chosen = r.phase.pool.slice(-2).map(c => c.id);
 cmd(r, 'p0', { type: 'exchange', cardIds: chosen });
 assert.deepEqual(view(r, 'p2').players[0].cards.map(c => c.id), chosen);
});
test('individual leaderboard records each completed round once and survives rematches', () => {
 const r = table(); forfeit(r, 'p1'); forfeit(r, 'p2');
 let board = view(r, 'p0').leaderboard;
 assert.equal(board.matches, 1); assert.deepEqual(board.players.find(p => p.id === 'p0'), { id: 'p0', name: 'Host', wins: 1, played: 1 });
 assert.equal(board.players.find(p => p.id === 'p1').wins, 0);
 recordResult(r); assert.equal(view(r, 'p0').leaderboard.matches, 1);
 r.players.forEach(p => { p.ready = true; }); start(r, 'p0'); forfeit(r, 'p0'); forfeit(r, 'p2');
 board = view(r, 'p1').leaderboard;
 assert.equal(board.matches, 2); assert.ok(board.players.every(p => p.played === 2));
 assert.equal(board.players.find(p => p.id === 'p0').wins, 1); assert.equal(board.players.find(p => p.id === 'p1').wins, 1);
 const restored = JSON.parse(JSON.stringify(r)); assert.deepEqual(view(restored, 'p1').leaderboard, board);
});
test('team leaderboard awards eliminated teammates, counts forfeits and preserves a departed player result', () => {
 const r = table(true); forfeit(r, 'p2'); forfeit(r, 'p1'); forfeit(r, 'p3');
 const board = view(r, 'p0').leaderboard;
 assert.equal(board.matches, 1);
 assert.ok(board.players.filter(p => ['p0','p2'].includes(p.id)).every(p => p.wins === 1 && p.played === 1));
 assert.deepEqual(board.teams, [{ team: 'A', wins: 1, played: 1 }, { team: 'B', wins: 0, played: 1 }]);
 r.players = r.players.filter(p => p.id !== 'p2');
 assert.equal(view(r, 'p0').leaderboard.players.find(p => p.id === 'p2').wins, 1);
 assert.deepEqual(view(JSON.parse(JSON.stringify(r)), 'p0').leaderboard, board);
});
test('existing room snapshots without leaderboard fields remain usable', () => {
 const r = table(true); delete r.scores; delete r.matchPlayers; delete r.scoredRound;
 assert.equal(view(r, 'p0').leaderboard.matches, 0);
 forfeit(r, 'p1'); forfeit(r, 'p3');
 assert.equal(view(r, 'p0').leaderboard.matches, 1);
});
test('truthful and bluff team claims emit the same public challenge-result events for every seat', () => {
 for (const truth of [true, false]) {
  const r = table(true);
  r.players[0].cards[0].role = truth ? 'Duke' : 'Captain'; r.players[0].cards[1].role = 'Contessa';
  cmd(r, 'p0', { type: 'action', kind: 'tax' });
  assert.throws(() => cmd(r, 'p2', { type: 'challenge' }), /cannot challenge/);
  cmd(r, 'p1', { type: 'challenge' });
  const result = view(r, 'p0').events.find(e => e.type === 'challengeResult');
  assert.equal(!!result.provenRole, truth);
  for (const p of r.players) assert.deepEqual(view(r, p.id).events.find(e => e.type === 'challengeResult'), result);
 }
});

test('shared ally card IDs cannot be used to choose their loss or control their exchange', () => {
 const r = table(true);
 r.players[0].cards.forEach(c => { c.role = 'Contessa'; });
 cmd(r, 'p0', { type: 'action', kind: 'tax' }); cmd(r, 'p1', { type: 'challenge' });
 const own = r.players.find(p => p.id === 'p0'), ally = r.players.find(p => p.id === 'p2');
 assert.throws(() => cmd(r, 'p2', { type: 'lose', cardId: own.cards[0].id }), /not choosing/);
 assert.throws(() => cmd(r, 'p0', { type: 'lose', cardId: ally.cards[0].id }), /your hidden cards/);
 assert.ok(own.cards.every(c => !c.revealed)); assert.ok(ally.cards.every(c => !c.revealed));
 const second = table(true); cmd(second, 'p0', { type: 'action', kind: 'exchange' }); timeout(second);
 assert.throws(() => cmd(second, 'p2', { type: 'exchange', cardIds: second.phase.pool.slice(0,2).map(c => c.id) }), /not exchanging/);
});
