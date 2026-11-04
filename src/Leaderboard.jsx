import React from 'react';
import { Trophy } from 'lucide-react';
import { TeamBadge } from './TeamBadge.jsx';

export function Leaderboard({ room }) {
  const board = room.leaderboard;
  const rows = board?.players || [];
  return <section className="panel leaderboard-panel" aria-label="Table leaderboard">
    <div className="public-head"><h3><Trophy size={16}/>Leaderboard</h3><span className="small-text muted">{room.gameMode === 'teams' ? 'Teams' : 'Individual'}</span></div>
    <p className="leaderboard-note">Wins at this table, across rematches.</p>
    {room.gameMode === 'teams' && <div className="team-scores">{(board?.teams || ['A', 'B'].map(team => ({ team, wins: 0, played: 0 }))).map(row => <div key={row.team}><TeamBadge team={row.team}/><strong>{row.wins}</strong><small>{row.wins === 1 ? 'win' : 'wins'} / {row.played} played</small></div>)}</div>}
    {rows.length ? <div className="leaderboard-scroll"><table><caption className="visually-hidden">{room.gameMode === 'teams' ? 'Player team victories' : 'Individual victories'}</caption><thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Wins</th><th scope="col">Played</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id} className={row.id === room.you ? 'you' : ''}><td>{index + 1}</td><th scope="row">{row.name}{row.id === room.you && <small> (you)</small>}</th><td>{row.wins}</td><td>{row.played}</td></tr>)}</tbody></table></div> : <p className="leaderboard-note">Results will appear after the first match.</p>}
    <p className="leaderboard-note">{board?.matches || 0} completed matches{room.gameMode === 'teams' ? ' · Every member of the winning team earns a win.' : ''}</p>
  </section>;
}
