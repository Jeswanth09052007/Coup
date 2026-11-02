import { randomInt, randomUUID } from 'node:crypto';

export const ROLES = ['Duke', 'Assassin', 'Captain', 'Ambassador', 'Contessa'];
export const ACTIONS = {
  income: { label: 'Income', gain: 1 }, aid: { label: 'Foreign aid', gain: 2 },
  tax: { label: 'Tax', role: 'Duke', gain: 3 }, steal: { label: 'Steal', role: 'Captain' },
  assassinate: { label: 'Assassinate', role: 'Assassin', cost: 3 },
  exchange: { label: 'Exchange', role: 'Ambassador' }, coup: { label: 'Coup', cost: 7 },
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
export const alive = p => !!p?.cards?.some(c => !c.revealed);
export const living = r => r.players.filter(alive);
export const player = (r, id) => r.players.find(p => p.id === id);
export function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function event(r, type, text, extra = {}) {
  r.events.push({ id: ++r.seq, type, text, at: Date.now(), ...extra });
  r.events = r.events.slice(-100);
}
export function phase(r, type, extra = {}) {
  const duration = ['turn', 'lose', 'exchange'].includes(type) ? 60000 : r.responseSeconds * 1000;
  r.phase = { id: randomUUID(), type, deadline: Date.now() + duration, ...extra };
}
export function createRoom(code, host, options = {}) {
  return { code, title: options.title || `${host.name}'s table`, visibility: options.visibility === 'public' ? 'public' : 'private',
    maxPlayers: Math.max(3, Math.min(6, Number(options.maxPlayers) || 6)), responseSeconds: [15, 20, 30].includes(Number(options.responseSeconds)) ? Number(options.responseSeconds) : 20,
    hostId: host.id, players: [{ ...host, ready: false, coins: 0, cards: [] }], status: 'waiting',
    round: 0, seq: 0, events: [], chat: [], createdAt: Date.now(), updatedAt: Date.now(), phase: null, turnId: null, action: null, block: null, deck: [] };
}
export function start(r, actorId) {
  assert(actorId === r.hostId, 'Only the host can start the match.');
  assert(r.status !== 'playing', 'A match is already in progress.');
  assert(r.players.length >= 3 && r.players.length <= r.maxPlayers, 'You need 3–6 players to start.');
  assert(r.players.every(p => p.connected), 'Wait for everyone to reconnect or remove offline players.');
  assert(r.players.every(p => p.id === r.hostId || p.ready), 'Everyone must be ready.');
  r.deck = shuffle(ROLES.flatMap(role => Array.from({ length: 3 }, () => ({ id: randomUUID(), role, revealed: false }))));
  for (const p of r.players) { p.coins = 2; p.cards = [r.deck.pop(), r.deck.pop()]; p.ready = false; }
  r.status = 'playing'; r.round++; r.action = null; r.block = null; r.winnerId = null;
  r.turnId = r.players.some(p => p.id === r.lastWinnerId) ? r.lastWinnerId : r.players[randomInt(r.players.length)].id;
  event(r, 'deal', `Match ${r.round} begins. Trust no one.`);
  phase(r, 'turn');
}
function winner(r) {
  const survivors = living(r);
  if (survivors.length > 1) return false;
  r.status = 'finished'; r.winnerId = survivors[0]?.id || null; r.lastWinnerId = r.winnerId;
  r.phase = null; r.action = null; r.block = null;
  event(r, 'winner', survivors.length ? `${survivors[0].name} rules the table!` : 'The table is empty.', { winnerId: r.winnerId });
  return true;
}
function finishTurn(r) {
  if (winner(r)) return;
  const i = r.players.findIndex(p => p.id === r.turnId);
  for (let step = 1; step <= r.players.length; step++) {
    const p = r.players[(i + step) % r.players.length];
    if (alive(p)) { r.turnId = p.id; break; }
  }
  r.action = null; r.block = null;
  phase(r, 'turn');
}
function requestLoss(r, id, reason, continuation) {
  const p = player(r, id);
  if (!p || !alive(p)) return resume(r, continuation);
  phase(r, 'lose', { playerId: id, reason, continuation });
}
function resolveAction(r) {
  const a = r.action;
  if (!a || !alive(player(r, a.actorId))) return finishTurn(r);
  const actor = player(r, a.actorId), target = player(r, a.targetId);
  if (['income', 'aid', 'tax'].includes(a.kind)) {
    actor.coins += ACTIONS[a.kind].gain;
    event(r, 'coins', `${actor.name} collects ${ACTIONS[a.kind].gain} coin${ACTIONS[a.kind].gain > 1 ? 's' : ''}.`);
  } else if (a.kind === 'steal' && target && alive(target)) {
    const amount = Math.min(2, target.coins); target.coins -= amount; actor.coins += amount;
    // Exact amount remains public because the action itself is observable; balances stay private.
    event(r, 'coins', `${actor.name} steals ${amount} coin${amount === 1 ? '' : 's'} from ${target.name}.`);
  } else if (['coup', 'assassinate'].includes(a.kind) && target && alive(target)) {
    return requestLoss(r, target.id, a.kind === 'coup' ? 'You were targeted by a coup.' : 'The assassination succeeded.', { type: 'finish' });
  } else if (a.kind === 'exchange') {
    const drawn = [r.deck.pop(), r.deck.pop()];
    assert(drawn.every(Boolean), 'Not enough cards in the court.');
    const pool = [...actor.cards.filter(c => !c.revealed), ...drawn];
    return phase(r, 'exchange', { playerId: actor.id, pool, count: actor.cards.filter(c => !c.revealed).length });
  }
  finishTurn(r);
}
function afterClaim(r) {
  const a = r.action;
  if (!a || !alive(player(r, a.actorId))) return finishTurn(r);
  let eligible = [];
  if (a.kind === 'aid') eligible = living(r).filter(p => p.id !== a.actorId && !(a.blockedBy || []).includes(p.id) && !(a.blockPassed || []).includes(p.id)).map(p => p.id);
  else if (['steal', 'assassinate'].includes(a.kind) && alive(player(r, a.targetId))) eligible = [a.targetId];
  if (eligible.length) { r.block = null; phase(r, 'block', { eligible, passed: [] }); }
  else resolveAction(r);
}
function resume(r, continuation) {
  if (winner(r)) return;
  if (continuation.type === 'afterClaim') return afterClaim(r);
  if (continuation.type === 'execute') return resolveAction(r);
  if (continuation.type === 'cancel') {
    if (continuation.refund && r.action && alive(player(r, r.action.actorId))) player(r, r.action.actorId).coins += r.action.paid;
    event(r, 'cancelled', continuation.reason || 'The action does not go through.');
  }
  finishTurn(r);
}
function challenge(r, challengerId, isBlock) {
  const a = r.action, claim = isBlock ? r.block : { by: a.actorId, role: ACTIONS[a.kind].role };
  const claimant = player(r, claim.by), challenger = player(r, challengerId);
  event(r, 'challenge', `${challenger.name} challenges ${claimant.name}'s ${claim.role}!`, { challengerId, claimantId: claimant.id, role: claim.role });
  const card = claimant.cards.find(c => !c.revealed && c.role === claim.role);
  if (card) {
    // Shuffle the proof into the court BEFORE drawing the replacement (it may be drawn again).
    const index = claimant.cards.indexOf(card);
    r.deck.push(card); shuffle(r.deck); claimant.cards[index] = r.deck.pop();
    event(r, 'challengeResult', `${claimant.name} proves ${claim.role}. ${challenger.name} loses the challenge.`, { winnerId: claimant.id, loserId: challenger.id, provenRole: claim.role });
    requestLoss(r, challenger.id, 'You challenged a truthful claim.', isBlock ? { type: 'cancel', reason: `${claimant.name}'s block stands.` } : { type: 'afterClaim' });
  } else {
    event(r, 'challengeResult', `${claimant.name} was bluffing! ${challenger.name} wins the challenge.`, { winnerId: challenger.id, loserId: claimant.id });
    requestLoss(r, claimant.id, 'Your bluff was caught.', isBlock ? { type: a.kind === 'aid' ? 'afterClaim' : 'execute' } : { type: 'cancel', refund: true, reason: `${claimant.name}'s action fails. Its cost is refunded.` });
  }
}
export function move(r, id, cmd) {
  assert(r.status === 'playing', 'There is no live match.');
  const p = player(r, id);
  assert(p && alive(p), 'You are out of this match.');
  assert(cmd && typeof cmd === 'object', 'Invalid move.');
  assert(cmd.phaseId === r.phase?.id, 'The game has moved on. Please try the current prompt.');
  const s = r.phase;
  if (cmd.type === 'action') {
    assert(s.type === 'turn' && r.turnId === id, 'Wait for your turn.');
    assert(Object.hasOwn(ACTIONS, cmd.kind), 'Unknown action.');
    const def = ACTIONS[cmd.kind];
    assert(p.coins < 10 || cmd.kind === 'coup', 'You have 10 or more coins. You must coup.');
    assert(p.coins >= (def.cost || 0), 'You do not have enough coins.');
    if (['steal', 'assassinate', 'coup'].includes(cmd.kind)) {
      const target = player(r, cmd.targetId);
      assert(target && target.id !== id && alive(target), 'Choose a living opponent.');
    }
    p.coins -= def.cost || 0;
    r.action = { actorId: id, kind: cmd.kind, targetId: ['steal', 'assassinate', 'coup'].includes(cmd.kind) ? cmd.targetId : null, paid: def.cost || 0 };
    r.block = null;
    event(r, 'action', `${p.name} chooses ${def.label}${r.action.targetId ? ` against ${player(r, r.action.targetId).name}` : ''}${def.role ? `, claiming ${def.role}` : ''}.`, { actorId: id, kind: cmd.kind });
    if (def.role) phase(r, 'challengeAction', { eligible: living(r).filter(q => q.id !== id).map(q => q.id), passed: [] });
    else if (cmd.kind === 'aid') afterClaim(r);
    else resolveAction(r);
  } else if (cmd.type === 'pass') {
    assert(['challengeAction', 'challengeBlock', 'block'].includes(s.type) && s.eligible.includes(id) && !s.passed.includes(id), 'You cannot pass this prompt.');
    s.passed.push(id);
    if (s.eligible.every(x => s.passed.includes(x) || !alive(player(r, x)))) {
      if (s.type === 'challengeAction') afterClaim(r);
      else if (s.type === 'challengeBlock') resume(r, { type: 'cancel', reason: 'The block is accepted.' });
      else resolveAction(r);
    }
  } else if (cmd.type === 'challenge') {
    assert(['challengeAction', 'challengeBlock'].includes(s.type) && s.eligible.includes(id) && !s.passed.includes(id), 'You cannot challenge now.');
    challenge(r, id, s.type === 'challengeBlock');
  } else if (cmd.type === 'block') {
    assert(s.type === 'block' && s.eligible.includes(id) && !s.passed.includes(id), 'You cannot block now.');
    const allowed = r.action.kind === 'aid' ? ['Duke'] : r.action.kind === 'steal' ? ['Captain', 'Ambassador'] : ['Contessa'];
    assert(allowed.includes(cmd.role), 'That character cannot block this action.');
    r.block = { by: id, role: cmd.role };
    r.action.blockedBy = [...(r.action.blockedBy || []), id];
    r.action.blockPassed = [...new Set([...(r.action.blockPassed || []), ...s.passed])];
    event(r, 'block', `${p.name} blocks with ${cmd.role}.`, { actorId: id, role: cmd.role });
    phase(r, 'challengeBlock', { eligible: living(r).filter(q => q.id !== id).map(q => q.id), passed: [] });
  } else if (cmd.type === 'lose') {
    assert(s.type === 'lose' && s.playerId === id, 'You are not choosing a lost influence.');
    const card = p.cards.find(c => c.id === cmd.cardId && !c.revealed);
    assert(card, 'Choose one of your hidden cards.');
    card.revealed = true;
    event(r, 'reveal', `${p.name} loses ${card.role}.`, { actorId: id, role: card.role });
    if (!alive(p)) { p.coins = 0; event(r, 'eliminated', `${p.name} is eliminated.`, { actorId: id }); }
    resume(r, s.continuation);
  } else if (cmd.type === 'exchange') {
    assert(s.type === 'exchange' && s.playerId === id, 'You are not exchanging.');
    assert(Array.isArray(cmd.cardIds) && cmd.cardIds.length === s.count && new Set(cmd.cardIds).size === s.count && cmd.cardIds.every(x => s.pool.some(c => c.id === x)), `Choose exactly ${s.count} cards to keep.`);
    p.cards = [...p.cards.filter(c => c.revealed), ...s.pool.filter(c => cmd.cardIds.includes(c.id))];
    r.deck.push(...s.pool.filter(c => !cmd.cardIds.includes(c.id))); shuffle(r.deck);
    event(r, 'exchange', `${p.name} completes an exchange.`, { actorId: id }); finishTurn(r);
  } else throw new Error('Unknown move.');
  r.updatedAt = Date.now();
}
export function timeout(r) {
  if (r.status !== 'playing' || !r.phase) return;
  const s = r.phase;
  if (s.type === 'turn') {
    const p = player(r, r.turnId);
    event(r, 'timeout', `${p.name}'s timer expired. An automatic action is taken.`);
    move(r, p.id, { phaseId: s.id, type: 'action', kind: p.coins >= 10 ? 'coup' : 'income', targetId: r.players.slice(r.players.indexOf(p) + 1).concat(r.players.slice(0, r.players.indexOf(p))).find(alive)?.id });
  } else if (s.type === 'lose') move(r, s.playerId, { phaseId: s.id, type: 'lose', cardId: player(r, s.playerId).cards.find(c => !c.revealed).id });
  else if (s.type === 'exchange') move(r, s.playerId, { phaseId: s.id, type: 'exchange', cardIds: s.pool.slice(0, s.count).map(c => c.id) });
  else {
    for (const id of [...s.eligible]) {
      if (r.phase?.id !== s.id) break;
      if (!s.passed.includes(id) && alive(player(r, id))) move(r, id, { phaseId: s.id, type: 'pass' });
    }
  }
}
export function forfeit(r, id) {
  const p = player(r, id); if (!p || r.status !== 'playing' || !alive(p)) return;
  // Return any borrowed exchange cards before eliminating an exchanging player.
  if (r.phase.type === 'exchange' && r.phase.playerId === id) {
    r.deck.push(...r.phase.pool.filter(c => !p.cards.some(x => x.id === c.id))); shuffle(r.deck);
  }
  p.cards.forEach(c => { c.revealed = true; }); p.coins = 0;
  event(r, 'eliminated', `${p.name} forfeits the match.`, { actorId: id });
  if (winner(r)) return;
  const s = r.phase;
  if (s.type === 'lose' && s.playerId === id) resume(r, s.continuation);
  else if (s.type === 'lose') { /* Complete the pending challenge penalty before continuing. */ }
  else if ((s.type === 'turn' && r.turnId === id) || (s.type === 'exchange' && s.playerId === id) || r.action?.actorId === id) finishTurn(r);
  else if (s.eligible) {
    s.eligible = s.eligible.filter(x => x !== id);
    if (s.eligible.every(x => s.passed.includes(x))) {
      if (s.type === 'challengeAction') afterClaim(r);
      else if (s.type === 'challengeBlock') resume(r, { type: 'cancel' });
      else resolveAction(r);
    }
  }
}
export function view(r, id) {
  const me = player(r, id);
  assert(me, 'You are not seated at this table.');
  let s = r.phase ? { id: r.phase.id, type: r.phase.type, deadline: r.phase.deadline, eligible: r.phase.eligible, passed: r.phase.passed, playerId: r.phase.playerId, reason: r.phase.reason } : null;
  if (s?.type === 'exchange' && s.playerId === id) { s.pool = r.phase.pool; s.count = r.phase.count; }
  return { code: r.code, title: r.title, visibility: r.visibility, maxPlayers: r.maxPlayers, responseSeconds: r.responseSeconds,
    hostId: r.hostId, status: r.status, round: r.round, turnId: r.turnId, phase: s,
    action: r.action ? { actorId: r.action.actorId, kind: r.action.kind, targetId: r.action.targetId, paid: r.action.paid } : null, block: r.block, winnerId: r.winnerId, events: r.events, chat: r.chat,
    players: r.players.map(p => ({ id: p.id, name: p.name, ready: p.ready, connected: p.connected,
      coins: p.id === id ? p.coins : null,
      cards: p.cards.map(c => p.id === id || c.revealed ? { id: c.id, role: c.role, revealed: c.revealed } : { revealed: false }) })),
    you: id, courtCount: r.deck.length };
}
