import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomBytes, randomInt, createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoom, start, move, view, timeout, forfeit, event } from './engine.mjs';

const hash = s => createHash('sha256').update(s).digest('hex');
const clean = (s, max, fallback = '') => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) || fallback : fallback;
const check = (v, m) => { if (!v) throw new Error(m); };
export function createGameServer({ dataDir = process.env.DATA_DIR || path.resolve('.data'), origins = (process.env.CLIENT_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',').map(x => x.trim()), serveStatic = true } = {}) {
  const rooms = new Map(), seats = new Map(), ipCreates = new Map();
  const app = express(); app.disable('x-powered-by');
  app.get('/health', (_, res) => res.json({ ok: true, game: 'Coup Royale' }));
  if (serveStatic && existsSync('dist/index.html')) app.use(express.static('dist'));
  const http = createServer(app);
  const io = new Server(http, { maxHttpBufferSize: 12000, cors: { origin: origins },
    allowRequest: (req, cb) => cb(null, !req.headers.origin || origins.includes(req.headers.origin)),
    pingInterval: 10000, pingTimeout: 20000 });
  if (dataDir) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    for (const name of readdirSync(dataDir).filter(n => /^[A-Z2-9]{6}\.json$/.test(n))) {
      const r = JSON.parse(readFileSync(path.join(dataDir, name), 'utf8'));
      r.players.forEach(p => { p.connected = false; }); rooms.set(r.code, r);
    }
  }
  function save(r) {
    r.updatedAt = Date.now();
    if (!dataDir) return;
    const dest = path.join(dataDir, `${r.code}.json`);
    writeFileSync(`${dest}.tmp`, JSON.stringify(r), { mode: 0o600 }); renameSync(`${dest}.tmp`, dest);
  }
  function deleteRoom(r) {
    rooms.delete(r.code);
    if (dataDir && existsSync(path.join(dataDir, `${r.code}.json`))) unlinkSync(path.join(dataDir, `${r.code}.json`));
  }
  const lobby = () => [...rooms.values()].filter(r => r.visibility === 'public' && r.status === 'waiting' && r.players.length < r.maxPlayers && r.players.some(p => p.connected)).map(r => ({ code: r.code, title: r.title, players: r.players.length, maxPlayers: r.maxPlayers, gameMode: r.gameMode || 'free', responseSeconds: r.responseSeconds }));
  function broadcast(r) {
    for (const p of r.players) {
      const sock = seats.get(`${r.code}:${p.id}`);
      if (sock) sock.emit('room:state', view(r, p.id));
    }
    io.emit('rooms:list', lobby());
  }
  function seated(socket) {
    const r = rooms.get(socket.data.code), p = r?.players.find(p => p.id === socket.data.playerId);
    check(r && p && seats.get(`${r.code}:${p.id}`) === socket, 'Your seat is no longer active. Join the room again.');
    return { r, p };
  }
  function attach(socket, r, p) {
    const key = `${r.code}:${p.id}`, old = seats.get(key);
    if (old && old.id !== socket.id) { old.emit('seat:replaced'); old.data.code = null; }
    seats.set(key, socket); socket.data.code = r.code; socket.data.playerId = p.id; p.connected = true;
    if (!r.players.find(q => q.id === r.hostId)?.connected) r.hostId = p.id;
  }
  function hostTransfer(r) {
    if (!r.players.find(p => p.id === r.hostId)?.connected) r.hostId = r.players.find(p => p.connected)?.id || r.players[0]?.id;
  }
  io.on('connection', socket => {
    socket.emit('rooms:list', lobby());
    let allowance = 35, last = Date.now();
    const on = (name, fn) => socket.on(name, (payload, ack) => {
      try {
        const now = Date.now(); allowance = Math.min(35, allowance + (now - last) / 200); last = now;
        check(allowance >= 1, 'Slow down a little.'); allowance--;
        const result = fn(payload && typeof payload === 'object' ? payload : {});
        if (typeof ack === 'function') ack({ ok: true, ...result });
      } catch (e) { if (typeof ack === 'function') ack({ ok: false, error: e.message }); }
    });
    on('rooms:get', () => ({ rooms: lobby() }));
    on('room:create', payload => {
      check(!socket.data.code, 'Leave your current room first.'); check(rooms.size < 500, 'All tables are busy. Try again later.');
      const ip = socket.handshake.address, recent = (ipCreates.get(ip) || []).filter(t => t > Date.now() - 3600000);
      check(recent.length < 12, 'Room creation limit reached. Join an existing room or try later.'); recent.push(Date.now()); ipCreates.set(ip, recent);
      const name = clean(payload.name, 20); check(name, 'Enter your nickname.');
      let code; do { code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join(''); } while (rooms.has(code));
      const token = randomBytes(32).toString('hex');
      const p = { id: randomUUID(), name, tokenHash: hash(token), connected: true };
      const r = createRoom(code, p, { ...payload, title: clean(payload.title, 40, `${name}'s table`) });
      rooms.set(code, r); attach(socket, r, r.players[0]); save(r); broadcast(r);
      return { token, code, playerId: p.id, state: view(r, p.id) };
    });
    on('room:join', payload => {
      check(!socket.data.code, 'Leave your current room first.');
      const code = clean(payload.code, 6).toUpperCase(), r = rooms.get(code);
      check(r, 'That room was not found. Check the room code.');
      check(r.status === 'waiting', 'This match has already started.'); check(r.players.length < r.maxPlayers, 'This room is full.');
      const name = clean(payload.name, 20); check(name, 'Enter your nickname.');
      check(!r.players.some(p => p.name.toLowerCase() === name.toLowerCase()), 'That nickname is already taken at this table.');
      const token = randomBytes(32).toString('hex'); const p = { id: randomUUID(), name, tokenHash: hash(token), connected: true, ready: false, coins: 0, cards: [] };
      p.team = r.gameMode === 'teams' ? (r.players.filter(q => q.team === 'A').length <= r.players.filter(q => q.team === 'B').length ? 'A' : 'B') : null;
      r.players.push(p); attach(socket, r, p); event(r, 'joined', `${name} takes a seat.`); save(r); broadcast(r);
      return { token, code, playerId: p.id, state: view(r, p.id) };
    });
    on('room:resume', payload => {
      check(!socket.data.code, 'You already have an active seat.');
      check(typeof payload.token === 'string' && /^[a-f0-9]{64}$/.test(payload.token), 'Invalid session.');
      const r = rooms.get(clean(payload.code, 6).toUpperCase()), p = r?.players.find(p => p.tokenHash === hash(payload.token));
      check(p, 'Your previous room is no longer available.'); attach(socket, r, p); save(r); broadcast(r);
      return { state: view(r, p.id) };
    });
    on('room:ready', () => {
      const { r, p } = seated(socket); check(['waiting', 'finished'].includes(r.status), 'The match is in progress.'); p.ready = !p.ready; save(r); broadcast(r);
    });
    on('room:team', payload => {
      const { r, p } = seated(socket);
      check(r.status === 'waiting' && r.gameMode === 'teams', 'Teams can only be changed in a team lobby.');
      check(['A', 'B'].includes(payload.team), 'Choose Team A or Team B.');
      check(r.players.filter(q => q.id !== p.id && q.team === payload.team).length < 7, 'This team already has seven players.');
      if (p.team !== payload.team) { p.team = payload.team; r.players.forEach(q => { q.ready = false; }); }
      save(r); broadcast(r);
    });
    on('room:start', () => {
      const { r, p } = seated(socket); start(r, p.id); save(r); broadcast(r);
    });
    on('game:move', payload => {
      const { r, p } = seated(socket); move(r, p.id, payload); save(r); broadcast(r);
    });
    on('room:chat', payload => {
      const { r, p } = seated(socket); const text = clean(payload.text, 240); check(text, 'Write a message first.');
      r.chat.push({ id: randomUUID(), playerId: p.id, name: p.name, text, at: Date.now() }); r.chat = r.chat.slice(-60); save(r); broadcast(r);
    });
    on('room:kick', payload => {
      const { r, p } = seated(socket); check(p.id === r.hostId && ['waiting', 'finished'].includes(r.status), 'Only the host can remove players between matches.');
      check(payload.playerId !== p.id, 'Use Leave table to leave.');
      const target = r.players.find(q => q.id === payload.playerId); check(target, 'Player not found.');
      const other = seats.get(`${r.code}:${target.id}`);
      if (other) { other.emit('seat:removed'); other.data.code = null; seats.delete(`${r.code}:${target.id}`); }
      r.players = r.players.filter(q => q.id !== target.id); save(r); broadcast(r);
    });
    on('room:leave', () => {
      const { r, p } = seated(socket);
      if (r.status === 'selecting') forfeit(r, p.id);
      if (r.status === 'playing') { forfeit(r, p.id); p.connected = false; p.tokenHash = ''; }
      else r.players = r.players.filter(q => q.id !== p.id);
      seats.delete(`${r.code}:${p.id}`); socket.data.code = null; hostTransfer(r);
      if (!r.players.length || r.players.every(q => !q.connected && !q.tokenHash)) deleteRoom(r);
      else { save(r); broadcast(r); }
      io.emit('rooms:list', lobby());
    });
    on('room:lobby', () => {
      const { r, p } = seated(socket); check(p.id === r.hostId && r.status === 'finished', 'Only the host can reopen a finished table.');
      r.status = 'waiting'; r.phase = null; r.action = null; r.block = null;
      r.players = r.players.filter(q => q.tokenHash); r.players.forEach(q => { q.cards = []; q.coins = 0; q.ready = false; q.handSelected = false; });
      r.deck = []; r.selectionLayouts = null; r.winnerId = null; r.winnerTeam = null; hostTransfer(r); save(r); broadcast(r);
    });
    socket.on('disconnect', () => {
      try {
        const { r, p } = seated(socket); p.connected = false; seats.delete(`${r.code}:${p.id}`); hostTransfer(r); save(r); broadcast(r);
      } catch { /* Replaced sockets have no seat. */ }
    });
  });
  const interval = setInterval(() => {
    for (const r of rooms.values()) {
      try {
        const offline = r.players.every(p => !p.connected), age = Date.now() - r.updatedAt;
        if (offline && age > (['playing', 'selecting'].includes(r.status) ? 24 * 3600000 : 2 * 3600000)) { deleteRoom(r); continue; }
        // Pause fully offline games. Resume with the existing deadline on rejoin.
        if (!offline && ['playing', 'selecting'].includes(r.status) && r.phase?.deadline <= Date.now()) { timeout(r); save(r); broadcast(r); }
      } catch (e) { console.error('Room maintenance failed:', e.message); }
    }
    for (const [ip, times] of ipCreates) if (times.every(t => t < Date.now() - 3600000)) ipCreates.delete(ip);
  }, 500); interval.unref();
  return { app, http, io, rooms, close: async () => { clearInterval(interval); await new Promise(resolve => io.close(resolve)); } };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const game = createGameServer();
  const port = Number(process.env.PORT || 3001);
  game.http.listen(port, '0.0.0.0', () => console.log(`Coup Royale server listening on ${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await game.close(); process.exit(0); });
}
