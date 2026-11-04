import React, { useEffect, useState } from 'react';
import { Check, Hourglass, LockKeyhole } from 'lucide-react';
import { CardBack, CharacterCard } from './cards.jsx';
import { TeamBadge } from './TeamBadge.jsx';
import { Leaderboard } from './Leaderboard.jsx';

export function HandSelection({ room, busy, send }) {
  const me = room.players.find(p => p.id === room.you);
  const choices = room.handSelection || [];
  const [kept, setKept] = useState([]), [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  useEffect(() => { setKept(current => current.filter(id => choices.some(card => card.id === id && card.available))); }, [room.handSelection]);
  const left = Math.max(0, Math.ceil((room.phase.deadline - now) / 1000));
  const picked = room.players.filter(p => p.handSelected).length;
  const allies = room.gameMode === 'teams' ? room.players.filter(p => p.id !== room.you && p.team === me.team && p.handSelected) : [];
  return <main className="selection-main">
    <div className="selection-title"><div><span className="eyebrow">YOUR FIRST MOVE</span><h1>Choose your two influences.</h1><p className="muted">Every card is face down. Pick two, then confirm your hand.</p></div><span className={`timer ${left < 6 ? 'urgent' : ''}`}><Hourglass size={14}/>{left}s</span></div>
    <div className="selection-layout"><section className="panel selection-panel">
      <div className="public-head"><h3>{me.handSelected ? 'Your hand is ready' : `${choices.length} face-down cards`}</h3><span className="small-text muted">{picked}/{room.players.length} players ready</span></div>
      {me.handSelected ? <div className="selected-hand"><Check size={28}/><h2>Your cards are chosen.</h2><div className="selection-hand">{me.cards.map(card => <CharacterCard key={card.id} role={card.role}/>)}</div><p className="muted">Waiting for the other players. The match starts when everyone has a hand.</p></div> : <>
        <p className="selection-note">{choices.length / 5} of each character • {room.courtCount} cards still available. Everyone sees a different shuffled order.</p>
        <div className="selection-grid" role="group" aria-label="Choose two face-down cards">{choices.map((card, index) => <button type="button" key={card.id} className={`choice-card ${kept.includes(card.id) ? 'picked' : ''} ${!card.available ? 'taken' : ''}`} aria-label={`Face-down card ${index + 1}${!card.available ? ', taken' : ''}`} aria-pressed={kept.includes(card.id)} disabled={busy || !card.available || (kept.length === 2 && !kept.includes(card.id))} onClick={() => setKept(current => current.includes(card.id) ? current.filter(id => id !== card.id) : [...current, card.id])}><CardBack/><span className="choice-number">{index + 1}</span>{kept.includes(card.id) && <span className="choice-selected"><Check size={18}/></span>}{!card.available && <span className="choice-taken">Taken</span>}</button>)}</div>
        <div className="selection-confirm"><button className="button primary full" disabled={busy || kept.length !== 2} onClick={() => send('game:move', { type: 'selectCards', cardIds: kept })}>Confirm my two cards ({kept.length}/2)<Check size={16}/></button><p className="form-note"><LockKeyhole size={12}/>The server reserves your pair when you confirm. If a card is taken first, choose another.</p></div>
      </>}
      <p className="selection-note">When the timer ends, any missing hand is picked automatically. Refreshing keeps your seat and confirmed cards.</p>
    </section><aside className="selection-sidebar"><section className="panel"><div className="public-head"><h3>At the table</h3></div><div className="selection-players">{room.players.map(p => <div key={p.id}><span>{p.name}{p.id === room.you ? ' (you)' : ''} <TeamBadge team={p.team}/></span><strong>{p.handSelected ? '2/2 chosen' : 'Choosing…'}</strong></div>)}</div></section>
      {allies.length > 0 && <section className="panel shared-selection"><div className="public-head"><h3>Your teammates’ hands</h3></div>{allies.map(p => <div key={p.id}><p>{p.name} · {p.coins} coins</p><div className="selection-hand">{p.cards.map(card => <CharacterCard key={card.id} compact role={card.role}/>)}</div></div>)}</section>}
      <Leaderboard room={room}/>
    </aside></div>
  </main>;
}
