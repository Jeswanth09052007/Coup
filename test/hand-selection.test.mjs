import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, start, move, view, timeout, forfeit, ROLES } from '../server/engine.mjs';
function table(n = 3, teams = false) {
 const r = createRoom('ABC234', { id: 'p0', name: 'Host', connected: true }, { maxPlayers: n, gameMode: teams ? 'teams' : 'free' });
 for (let i = 1; i < n; i++) r.players.push({ id: `p${i}`, name: `P${i}`, team: teams ? i % 2 ? 'B' : 'A' : null, ready: true, connected: true, coins: 0, cards: [] });
 start(r, 'p0'); return r;
}
const choose = (r, id, cardIds = view(r, id).handSelection.filter(c => c.available).slice(0, 2).map(c => c.id)) => move(r, id, { type: 'selectCards', phaseId: r.phase.id, cardIds });
function conserve(r, n) {
 const all = [...r.deck, ...r.players.flatMap(p => p.cards)], copies = 3 * Math.ceil(n / 6);
 assert.equal(all.length, 5 * copies); assert.equal(new Set(all.map(c => c.id)).size, all.length);
 for (const role of ROLES) assert.equal(all.filter(c => c.role === role).length, copies);
}

test('every supported table selects from a complete shared deck before the first turn', () => {
 for (const [n, teams] of [...Array.from({ length: 13 }, (_, i) => [i + 3, false]), ...[4,6,8,10,12,14].map(n => [n, true])]) {
  const r = table(n, teams), count = 15 * Math.ceil(n / 6);
  assert.equal(r.status, 'selecting'); assert.equal(r.phase.type, 'selectHands'); assert.equal(r.deck.length, count);
  assert.ok(r.players.every(p => p.cards.length === 0)); conserve(r, n);
  for (const [index, p] of r.players.entries()) {
   assert.equal(view(r, p.id).handSelection.length, count);
   choose(r, p.id); conserve(r, n);
   assert.equal(p.cards.length, 2);
   assert.equal(r.status, index === n - 1 ? 'playing' : 'selecting');
  }
  assert.equal(r.phase.type, 'turn'); assert.equal(r.selectionLayouts, null);
  assert.equal(view(r, 'p0').handSelection, null);
 }
});
test('all layouts have different orders and unlinkable handles without revealing roles or card IDs', () => {
 const r = table(6), orders = r.players.map(p => r.selectionLayouts[p.id].map(c => c.cardId).join(','));
 assert.equal(new Set(orders).size, 6);
 const handles = r.players.flatMap(p => view(r, p.id).handSelection.map(c => c.id)); assert.equal(new Set(handles).size, 90);
 const physical = new Set(r.deck.map(c => c.id)); assert.ok(handles.every(h => !physical.has(h)));
 for (const p of r.players) for (const slot of view(r, p.id).handSelection) assert.deepEqual(Object.keys(slot).sort(), ['available','id']);
 assert.ok(r.players.every(p => view(r, p.id).players.every(q => q.cards.length === 0)));
});
test('the confirmed pair is precisely the chosen cards; taken cards update every private layout', () => {
 const r = table(), slots = r.selectionLayouts.p0.slice(2,4), expected = slots.map(s => s.cardId);
 choose(r, 'p0', slots.map(s => s.token));
 assert.deepEqual(r.players[0].cards.map(c => c.id), expected);
 for (const p of r.players) {
  const state = view(r, p.id);
  const takenTokens = r.selectionLayouts[p.id].filter(s => expected.includes(s.cardId)).map(s => s.token);
  assert.ok(state.handSelection.filter(s => takenTokens.includes(s.id)).every(s => !s.available));
 }
 const before = JSON.stringify(r);
 const taken = r.selectionLayouts.p1.find(s => expected.includes(s.cardId)).token;
 const available = view(r, 'p1').handSelection.find(s => s.available).id;
 assert.throws(() => choose(r, 'p1', [taken, available]), /taken/);
 assert.equal(JSON.stringify(r), before);
 choose(r, 'p1'); choose(r, 'p2'); conserve(r, 3);
});
test('invalid, repeated, foreign-seat and stale picks do not alter hands or deck', () => {
 const r = table(), v = view(r, 'p0'), a = v.handSelection[0].id, b = v.handSelection[1].id;
 for (const pair of [[], [a], [a,a], [a,b,v.handSelection[2].id], ['fake',b], view(r,'p1').handSelection.slice(0,2).map(c=>c.id), r.deck.slice(0,2).map(c=>c.id)]) {
  const before=JSON.stringify(r); assert.throws(() => choose(r,'p0',pair)); assert.equal(JSON.stringify(r),before);
 }
 assert.throws(() => move(r, 'p0', { type:'selectCards', phaseId:'old', cardIds:[a,b] }), /moved on/);
 assert.throws(() => move(r, 'p0', { type:'action', phaseId:r.phase.id, kind:'income' }), /starting cards/);
 choose(r, 'p0', [a,b]); assert.throws(() => choose(r, 'p0', [a,b]), /already confirmed/);
 assert.throws(() => start(r,'p0'), /already in progress/);
});
test('refresh preserves both the private order and confirmed cards; only teammates see a selected hand', () => {
 const r = table(4,true), before=view(r,'p0').handSelection;
 choose(r,'p0'); const restored=JSON.parse(JSON.stringify(r));
 assert.deepEqual(view(restored,'p0').handSelection,view(r,'p0').handSelection);
 assert.deepEqual(view(restored,'p0').handSelection.map(s=>s.id),before.map(s=>s.id));
 assert.deepEqual(view(restored,'p2').players.find(p=>p.id==='p0').cards,r.players[0].cards);
 assert.deepEqual(view(restored,'p1').players.find(p=>p.id==='p0').cards,[{revealed:false},{revealed:false}]);
 assert.ok(!JSON.stringify(view(restored,'p1')).includes('selectionLayouts'));
 timeout(restored); assert.equal(restored.status,'playing'); conserve(restored,4);
});
test('timeout completes only missing hands and preserves a manually chosen hand and first turn', () => {
 const r=table(15); choose(r,'p0'); const cards=JSON.stringify(r.players[0].cards), first=r.turnId;
 timeout(r); assert.equal(r.status,'playing'); assert.equal(r.turnId,first); assert.equal(JSON.stringify(r.players[0].cards),cards); conserve(r,15);
 assert.equal(r.scores,undefined);
});
test('leaving during selection cancels without a score, and rematches create fresh layouts', () => {
 const r=table(4,true); choose(r,'p0'); const oldPhase=r.phase.id, oldTokens=view(r,'p0').handSelection.slice(0,2).map(c=>c.id);
 forfeit(r,'p1'); assert.equal(r.status,'waiting'); assert.equal(r.round,0); assert.equal(r.deck.length,0); assert.equal(r.scores,undefined);
 assert.ok(r.players.every(p=>p.cards.length===0&&!p.ready));
 r.players.forEach(p=>{p.ready=true;}); start(r,'p0');
 assert.notEqual(r.phase.id,oldPhase); assert.ok(view(r,'p0').handSelection.every(s=>!oldTokens.includes(s.id)));
 assert.throws(()=>move(r,'p0',{type:'selectCards',phaseId:oldPhase,cardIds:oldTokens}),/moved on/);
 timeout(r); forfeit(r,'p1'); forfeit(r,'p3'); assert.equal(r.scores.matches,1);
 r.players.forEach(p=>{p.ready=true;}); start(r,'p0'); assert.equal(r.scores.matches,1); assert.equal(r.round,2);
});
