import { randomUUID } from 'node:crypto';

export function prepareSelection(room, shuffle) {
  const usedOrders = new Set();
  room.selectionLayouts = {};
  for (const player of room.players) {
    let order = shuffle(room.deck.map(card => card.id));
    // Even with an unlucky random shuffle, no two seats get the same order.
    while (usedOrders.has(order.join(','))) order = [...order.slice(1), order[0]];
    usedOrders.add(order.join(','));
    room.selectionLayouts[player.id] = order.map(cardId => ({ token: randomUUID(), cardId }));
  }
}

export function selectionView(room, playerId) {
  if (room.status !== 'selecting') return null;
  const available = new Set(room.deck.map(card => card.id));
  return (room.selectionLayouts?.[playerId] || []).map(slot => ({ id: slot.token, available: available.has(slot.cardId) }));
}

export function chooseHand(room, player, tokens) {
  if (player.handSelected) throw new Error('Your two cards are already confirmed.');
  if (!Array.isArray(tokens) || tokens.length !== 2 || new Set(tokens).size !== 2) throw new Error('Choose exactly two different face-down cards.');
  const layout = room.selectionLayouts?.[player.id] || [];
  const ids = tokens.map(token => layout.find(slot => slot.token === token)?.cardId);
  const cards = ids.map(id => room.deck.find(card => card.id === id));
  if (!cards.every(Boolean)) throw new Error('A card was taken or is invalid. Choose two available cards.');
  // Validate the whole pair before reserving either card; commands run serially.
  player.cards = cards;
  player.handSelected = true;
  room.deck = room.deck.filter(card => !ids.includes(card.id));
}

export function cancelSelection(room) {
  room.status = 'waiting'; room.phase = null; room.turnId = null;
  room.deck = []; room.selectionLayouts = null; room.matchPlayers = null;
  room.round = Math.max(0, room.round - 1);
  for (const p of room.players) { p.cards = []; p.coins = 0; p.ready = false; p.handSelected = false; }
}
