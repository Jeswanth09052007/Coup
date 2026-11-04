// Results belong to this table and survive rematches and stored room snapshots.
const empty = () => ({ matches: 0, players: [], teams: { A: { wins: 0, played: 0 }, B: { wins: 0, played: 0 } } });
export function recordResult(room) {
  if (room.scoredRound === room.round) return;
  const scores = room.scores ||= empty();
  const roster = room.matchPlayers || room.players;
  for (const player of roster) {
    let row = scores.players.find(p => p.id === player.id);
    if (!row) { row = { id: player.id, name: player.name, wins: 0, played: 0 }; scores.players.push(row); }
    row.name = player.name;
    row.played++;
    if (room.winnerTeam ? player.team === room.winnerTeam : player.id === room.winnerId) row.wins++;
  }
  if (room.gameMode === 'teams') {
    for (const team of ['A', 'B']) { scores.teams[team].played++; if (room.winnerTeam === team) scores.teams[team].wins++; }
  }
  scores.matches++;
  room.scoredRound = room.round;
}
export function leaderboard(room) {
  const scores = room.scores || empty();
  const players = [...scores.players.map(p => ({ id: p.id, name: p.name, wins: p.wins, played: p.played }))];
  for (const p of room.players) if (!players.some(row => row.id === p.id)) players.push({ id: p.id, name: p.name, wins: 0, played: 0 });
  players.sort((a, b) => b.wins - a.wins || (b.played ? b.wins / b.played : 0) - (a.played ? a.wins / a.played : 0) || a.name.localeCompare(b.name));
  return { matches: scores.matches, players, teams: room.gameMode === 'teams' ? ['A', 'B'].map(team => ({ team, wins: scores.teams[team].wins, played: scores.teams[team].played })) : [] };
}
