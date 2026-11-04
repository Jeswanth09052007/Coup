import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGameServer } from '../server/index.mjs';
const connect = (url, opts = {}) => new Promise((resolve, reject) => { const s = io(url, { forceNew: true, reconnection: false, ...opts }); s.on('room:state', state => { s.lastState = state; }); s.once('connect', () => resolve(s)); s.once('connect_error', reject); });
const call = (s, event, data = {}) => new Promise((resolve, reject) => s.timeout(4000).emit(event, data, (err, reply) => err ? reject(err) : resolve(reply)));
async function service(options = {}) { const game = createGameServer({ dataDir: null, ...options }); await new Promise(resolve => game.http.listen(0, '127.0.0.1', resolve)); return { game, url: `http://127.0.0.1:${game.http.address().port}` }; }
const waitFor = (s, event, predicate = () => true) => new Promise((resolve, reject) => { const timer = setTimeout(() => { s.off(event, handler); reject(new Error(`Timed out waiting for ${event}`)); }, 4000); function handler(value) { if (predicate(value)) { clearTimeout(timer); s.off(event, handler); resolve(value); } } s.on(event, handler); });
async function selectHands(clients) {
  const code = clients.find(s => s.lastState?.status === 'selecting')?.lastState.code;
  let picked = Math.max(0, ...clients.filter(s => s.lastState?.code === code).map(s => s.lastState.players.filter(p => p.handSelected).length));
  for (const s of clients) {
    if (s.lastState?.code !== code) continue;
    if (s.lastState.status !== 'selecting' || s.lastState.players.filter(p => p.handSelected).length < picked)
      await waitFor(s, 'room:state', state => state.status === 'selecting' && state.players.filter(p => p.handSelected).length >= picked);
    const state = s.lastState;
    if (state.players.find(p => p.id === state.you).handSelected) continue;
    const reply = await call(s, 'game:move', { type: 'selectCards', phaseId: state.phase.id, cardIds: state.handSelection.filter(slot => slot.available).slice(0, 2).map(slot => slot.id) });
    assert.equal(reply.ok, true, reply.error); picked++;
  }
}
test('three real sockets: discovery, private seats, ready/start, move, reconnect, chat and rematch', async t => {
  const { game, url } = await service(); const clients = [];
  t.after(async () => { clients.forEach(s => s.disconnect()); await game.close(); });
  for (let i = 0; i < 4; i++) clients.push(await connect(url));
  const [a, b, c, outsider] = clients;
  const created = await call(a, 'room:create', { name: 'Jessie', title: 'The test table', visibility: 'public' }); assert.equal(created.ok, true);
  const list = await call(outsider, 'rooms:get'); assert.equal(list.rooms.length, 1); assert.equal(list.rooms[0].code, created.code); assert.ok(!JSON.stringify(list).includes(created.token));
  assert.equal((await call(a, 'room:start')).ok, false);
  const joinedB = await call(b, 'room:join', { code: created.code, name: 'Tony' });
  const joinedC = await call(c, 'room:join', { code: created.code, name: 'Loki' });
  assert.equal(joinedB.ok, true); assert.equal(joinedC.ok, true);
  assert.equal((await call(outsider, 'room:resume', { code: created.code, token: 'a'.repeat(64) })).ok, false);
  await call(b, 'room:ready'); await call(c, 'room:ready');
  const started = waitFor(a, 'room:state', s => s.status === 'playing'); assert.equal((await call(a, 'room:start')).ok, true); await selectHands([a, b, c]); const state = await started;
  assert.equal(state.players.find(p => p.id === state.you).coins, 2); assert.equal(state.players.find(p => p.id !== state.you).coins, null);
  assert.ok(state.players.filter(p => p.id !== state.you).every(p => p.cards.every(c => !('role' in c) && !('id' in c))));
  const connections = new Map([[created.playerId, a], [joinedB.playerId, b], [joinedC.playerId, c]]);
  const current = connections.get(state.turnId); const next = waitFor(a, 'room:state', s => s.turnId !== state.turnId);
  assert.equal((await call(current, 'game:move', { type: 'action', kind: 'income', phaseId: state.phase.id })).ok, true); await next;
  assert.equal((await call(outsider, 'game:move', { type: 'action', kind: 'income', phaseId: state.phase.id })).ok, false);
  const chatted = waitFor(a, 'room:state', s => s.chat.some(m => m.text === 'Your move, genius.'));
  await call(b, 'room:chat', { text: 'Your move, genius.' }); await chatted;
  const offline = waitFor(a, 'room:state', s => !s.players.find(p => p.id === joinedB.playerId).connected); b.disconnect(); await offline;
  const replacement = await connect(url); clients.push(replacement);
  const resume = await call(replacement, 'room:resume', { code: created.code, token: joinedB.token }); assert.equal(resume.ok, true); assert.equal(resume.state.you, joinedB.playerId);
  assert.equal(resume.state.players.find(p => p.id === joinedB.playerId).cards.length, 2);
  await call(replacement, 'room:leave');
  const finished = waitFor(a, 'room:state', s => s.status === 'finished'); await call(c, 'room:leave'); const won = await finished; assert.equal(won.winnerId, created.playerId);
  assert.equal((await call(a, 'room:lobby')).ok, true);
  assert.equal((await call(outsider, 'rooms:get')).rooms.length, 1);
});
test('private rooms never appear in discovery; capacity and duplicate names enforced', async t => {
  const { game, url } = await service(); const clients = await Promise.all(Array.from({ length: 4 }, () => connect(url)));
  t.after(async () => { clients.forEach(s => s.disconnect()); await game.close(); });
  const r = await call(clients[0], 'room:create', { name: 'Host', maxPlayers: 3 });
  assert.equal((await call(clients[3], 'rooms:get')).rooms.length, 0);
  assert.equal((await call(clients[1], 'room:join', { code: r.code, name: 'host' })).ok, false);
  await call(clients[1], 'room:join', { code: r.code, name: 'A' }); await call(clients[2], 'room:join', { code: r.code, name: 'B' });
  assert.equal((await call(clients[3], 'room:join', { code: r.code, name: 'C' })).ok, false);
});
test('snapshot restores game, hidden data and secure seat across server restart', async t => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'coup-test-')); const first = await service({ dataDir });
  const clients = await Promise.all(Array.from({ length: 3 }, () => connect(first.url)));
  const host = await call(clients[0], 'room:create', { name: 'Host' });
  await call(clients[1], 'room:join', { code: host.code, name: 'A' }); await call(clients[2], 'room:join', { code: host.code, name: 'B' });
  await call(clients[1], 'room:ready'); await call(clients[2], 'room:ready'); await call(clients[0], 'room:start'); await selectHands(clients);
  clients.forEach(s => s.disconnect()); await first.game.close();
  const second = await service({ dataDir }); const s = await connect(second.url);
  t.after(async () => { s.disconnect(); await second.game.close(); rmSync(dataDir, { recursive: true, force: true }); });
  const r = await call(s, 'room:resume', { code: host.code, token: host.token }); assert.equal(r.ok, true); assert.equal(r.state.status, 'playing'); assert.equal(r.state.players[0].cards.length, 2);
});
test('unapproved browser origins rejected for WebSocket upgrade', async t => {
  const { game, url } = await service(); t.after(async () => game.close());
  await assert.rejects(connect(url, { transports: ['websocket'], extraHeaders: { Origin: 'https://unapproved.example' }, timeout: 1500 }));
});


test('15 real clients fill expanded table and a sixteenth cannot join', async t => {
  const { game, url } = await service(); const clients = [];
  t.after(async () => { clients.forEach(s => s.disconnect()); await game.close(); });
  for (let i = 0; i < 16; i++) clients.push(await connect(url));
  const r = await call(clients[0], 'room:create', { name: 'Host15', maxPlayers: 15 });
  for (let i = 1; i < 15; i++) {
    assert.equal((await call(clients[i], 'room:join', { code: r.code, name: `Guest${i}` })).ok, true);
    await call(clients[i], 'room:ready');
  }
  assert.equal((await call(clients[15], 'room:join', { code: r.code, name: 'Overflow' })).ok, false);
  const playing = waitFor(clients[0], 'room:state', s => s.status === 'playing');
  assert.equal((await call(clients[0], 'room:start')).ok, true); await selectHands(clients);
  const state = await playing; assert.equal(state.players.length, 15); assert.equal(state.courtCount, 15);
  assert.equal(state.gameMode, 'free');
});

test('team changes validate membership, reset readiness and survive disk restore', async t => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'coup-teams-')); const first = await service({ dataDir });
  const clients = await Promise.all(Array.from({ length: 4 }, () => connect(first.url)));
  const r = await call(clients[0], 'room:create', { name: 'TeamHost', gameMode: 'teams', maxPlayers: 4 });
  const credentials = [r];
  for (let i = 1; i < 4; i++) credentials.push(await call(clients[i], 'room:join', { code: r.code, name: `TeamGuest${i}` }));
  assert.equal((await call(clients[1], 'room:team', { team: 'C' })).ok, false);
  await call(clients[2], 'room:ready');
  const switched = waitFor(clients[0], 'room:state', s => s.players[0].team === 'B');
  await call(clients[0], 'room:team', { team: 'B' });
  assert.ok((await switched).players.every(p => !p.ready));
  for (let i = 1; i < 4; i++) await call(clients[i], 'room:ready');
  assert.equal((await call(clients[0], 'room:start')).ok, false);
  await call(clients[0], 'room:team', { team: 'A' });
  for (let i = 1; i < 4; i++) await call(clients[i], 'room:ready');
  assert.equal((await call(clients[0], 'room:start')).ok, true); await selectHands(clients);
  assert.equal((await call(clients[0], 'room:team', { team: 'B' })).ok, false);
  clients.forEach(s => s.disconnect()); await first.game.close();
  const second = await service({ dataDir }); const s = await connect(second.url);
  t.after(async () => { s.disconnect(); await second.game.close(); rmSync(dataDir, { recursive: true, force: true }); });
  const resumed = await call(s, 'room:resume', { code: r.code, token: r.token });
  assert.equal(resumed.ok, true); assert.equal(resumed.state.gameMode, 'teams');
  assert.deepEqual(resumed.state.players.map(p => p.team), ['A', 'B', 'A', 'B']);
  assert.equal(resumed.state.players[2].coins, 2);
  assert.ok(resumed.state.players[2].cards.every(c => c.role && c.id));
  assert.equal(resumed.state.players[1].coins, null);
  assert.deepEqual(resumed.state.players[1].cards, [{ revealed: false }, { revealed: false }]);
});

test('team leaderboard reaches real sockets and survives a server restart after a finished match', async t => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'coup-board-')); const first = await service({ dataDir });
  const clients = await Promise.all(Array.from({ length: 4 }, () => connect(first.url)));
  const host = await call(clients[0], 'room:create', { name: 'ScoreHost', gameMode: 'teams', maxPlayers: 4 });
  for (let i = 1; i < 4; i++) { await call(clients[i], 'room:join', { code: host.code, name: `ScoreGuest${i}` }); await call(clients[i], 'room:ready'); }
  await call(clients[0], 'room:start'); await selectHands(clients);
  const finished = waitFor(clients[0], 'room:state', state => state.status === 'finished');
  await call(clients[1], 'room:leave'); await call(clients[3], 'room:leave');
  const state = await finished;
  assert.equal(state.winnerTeam, 'A'); assert.equal(state.leaderboard.matches, 1);
  assert.equal(state.leaderboard.players.find(p => p.id === host.playerId).wins, 1);
  clients.forEach(s => s.disconnect()); await first.game.close();
  const second = await service({ dataDir }); const s = await connect(second.url);
  t.after(async () => { s.disconnect(); await second.game.close(); rmSync(dataDir, { recursive: true, force: true }); });
  const resumed = await call(s, 'room:resume', { code: host.code, token: host.token });
  assert.deepEqual(resumed.state.leaderboard, state.leaderboard);
  assert.equal((await call(s, 'room:lobby')).ok, true);
  assert.equal(second.game.rooms.get(host.code).scores.matches, 1);
});

test('simultaneous private picks cannot duplicate cards; selection blocks lobby controls and survives reconnect', async t => {
 const {game,url}=await service(); const clients=await Promise.all(Array.from({length:4},()=>connect(url)));
 t.after(async()=>{clients.forEach(s=>s.disconnect());await game.close();});
 const created=await call(clients[0],'room:create',{name:'Picker',maxPlayers:3});
 for(let i=1;i<3;i++){await call(clients[i],'room:join',{name:`Picker${i}`,code:created.code});await call(clients[i],'room:ready');}
 assert.equal((await call(clients[0],'room:start')).ok,true);
 const r=game.rooms.get(created.code), first=r.selectionLayouts[created.playerId].slice(0,2).map(s=>s.cardId);
 const seats=r.players.slice(0,2);
 const replies=await Promise.all(seats.map((p,i)=>call(clients[i],'game:move',{type:'selectCards',phaseId:r.phase.id,cardIds:r.selectionLayouts[p.id].filter(s=>first.includes(s.cardId)).map(s=>s.token)})));
 assert.equal(replies.filter(x=>x.ok).length,1); assert.equal(r.deck.length,13);
 assert.equal((await call(clients[0],'room:start')).ok,false);
 assert.equal((await call(clients[1],'room:ready')).ok,false);
 assert.equal((await call(clients[0],'room:kick',{playerId:r.players[1].id})).ok,false);
 assert.equal((await call(clients[3],'room:join',{name:'Late',code:created.code})).ok,false);
 await selectHands(clients.slice(0,3)); assert.equal(r.status,'playing');
 assert.equal(new Set(r.players.flatMap(p=>p.cards.map(c=>c.id))).size,6);
});
test('an unfinished selection restores the same private tokens after a server restart', async t => {
 const dataDir=mkdtempSync(path.join(tmpdir(),'coup-pick-'));const first=await service({dataDir});
 const clients=await Promise.all(Array.from({length:3},()=>connect(first.url)));
 const host=await call(clients[0],'room:create',{name:'RestorePicker'});
 for(let i=1;i<3;i++){await call(clients[i],'room:join',{name:`Restore${i}`,code:host.code});await call(clients[i],'room:ready');}
 await call(clients[0],'room:start'); const state=clients[0].lastState;
 const ids=state.handSelection.filter(s=>s.available).slice(0,2).map(s=>s.id);
 await call(clients[0],'game:move',{type:'selectCards',phaseId:state.phase.id,cardIds:ids});
 const selected=clients[0].lastState;clients.forEach(s=>s.disconnect());await first.game.close();
 const second=await service({dataDir});const sock=await connect(second.url);
 t.after(async()=>{sock.disconnect();await second.game.close();rmSync(dataDir,{recursive:true,force:true});});
 const resumed=await call(sock,'room:resume',{code:host.code,token:host.token});
 assert.equal(resumed.state.status,'selecting');assert.deepEqual(resumed.state.handSelection,selected.handSelection);
 assert.deepEqual(resumed.state.players[0].cards,selected.players[0].cards);
 assert.equal((await call(sock,'room:leave')).ok,true);
 const r=second.game.rooms.get(host.code);assert.equal(r.status,'waiting');assert.ok(r.players.every(p=>p.cards.length===0));assert.equal(r.scores,undefined);
});
