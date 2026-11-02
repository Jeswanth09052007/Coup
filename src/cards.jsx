import React from 'react';
export const roleInfo = {
  Duke: { color: '#a48bea', title: 'The financier', power: 'Take 3 coins', block: 'Blocks foreign aid', mark: 'I' },
  Assassin: { color: '#d67c89', title: 'The silent blade', power: 'Pay 3 • Take an influence', block: 'Risk has its rewards', mark: 'II' },
  Captain: { color: '#6ea6cd', title: 'The opportunist', power: 'Steal up to 2 coins', block: 'Blocks stealing', mark: 'III' },
  Ambassador: { color: '#6aafa0', title: 'The negotiator', power: 'Exchange your cards', block: 'Blocks stealing', mark: 'IV' },
  Contessa: { color: '#d0a16f', title: 'The untouchable', power: 'Block an assassination', block: 'Your elegant escape', mark: 'V' },
};
export function RoleArt({ role = 'Duke' }) {
  const c = roleInfo[role]?.color || '#dfbd77';
  return <svg viewBox="0 0 200 200" className="role-art" aria-hidden="true">
    <circle cx="100" cy="94" r="69" fill={c} opacity=".08"/><circle cx="100" cy="94" r="61" fill="none" stroke={c} opacity=".25" strokeWidth=".7"/>
    <path d="M100 12v16m0 132v20M20 94h16m128 0h16M43 37l12 12m90 90 12 12M43 151l12-12m90-90 12-12" stroke={c} opacity=".3"/>
    <path d="M36 185q3-39 39-48h50q36 9 39 48" fill="#151722" stroke={c} strokeWidth="1.5"/>
    <path d="m75 137 25 44 25-44-12-14H87Z" fill={c} opacity=".3"/>
    <path d="M86 117v20l14 15 14-15v-20" fill="#b59b83"/><path d="M72 74q0-38 28-38t28 38v27q-3 28-28 35-25-7-28-35Z" fill="#d0b69b"/>
    {role === 'Duke' && <><path d="M66 68 59 35l23 13 18-27 18 27 23-13-7 33Z" fill="#8a744e" stroke="#dfbd77" strokeWidth="2"/><path d="M72 67h56" stroke="#dfbd77" strokeWidth="5"/><path d="M74 99q8 26 26 32 20-6 26-32l-15 11-11-4-11 4Z" fill="#48404b"/><path d="m77 141-16 41m62-41 16 41" stroke={c} strokeWidth="9"/><circle cx="100" cy="168" r="6" fill="#dfbd77"/></>}
    {role === 'Assassin' && <><path d="M51 132q-8-60 12-93L100 19l37 20q20 33 12 93l-26-18 5-42-28-25-28 25 5 42Z" fill="#282431" stroke={c} strokeWidth="1.5"/><path d="m71 94 29 8 29-8-10 31-19 11-19-11Z" fill="#34303b"/><path d="m79 79 15 4m12 0 15-4" stroke="#4d3443" strokeWidth="3"/><path d="m133 173 21-74 5 2-15 76" fill="#b6afab"/><path d="m128 165 25 7" stroke="#dfbd77" strokeWidth="4"/></>}
    {role === 'Captain' && <><path d="M49 58q15-10 17-30l34 15 34-15q2 20 17 30l-23 18H72Z" fill="#293b49" stroke={c} strokeWidth="1.8"/><path d="M65 61h70" stroke="#dfbd77" strokeWidth="3"/><path d="m73 74 55 22m-21-11 11-3" stroke="#283441" strokeWidth="4"/><path d="M75 98q3 29 25 34 22-5 25-34l-14 10H89Z" fill="#605047"/><path d="m61 148 80 34" stroke="#947958" strokeWidth="10"/><circle cx="102" cy="167" r="6" fill="#dfbd77"/></>}
    {role === 'Ambassador' && <><path d="M67 75q-8-44 33-49 41 5 33 49l-9-17-24-9-24 9Z" fill="#d3c5ad"/><path d="M73 95q-3 25 27 43 30-18 27-43l-14 17-13 7-13-7Z" fill="#b6ac98"/><path d="M67 145q3 19 33 31 30-12 33-31" fill="none" stroke="#dfbd77" strokeWidth="2"/><path d="M44 161h28v28H44Z" fill="#a99b77" stroke="#dfbd77"/><path d="M49 165h18m-18 5h18m-18 5h12" stroke="#554c3b"/><circle cx="100" cy="174" r="5" fill="#dfbd77"/></>}
    {role === 'Contessa' && <><path d="M62 124q-12-49 4-77 34-42 68 0 16 28 4 77l-17-7 6-42-27-27-27 27 6 42Z" fill="#4a3640"/><path d="M68 53q32-24 64 0l-8-24-16 7-8-18-8 18-16-7Z" fill="#a48659" stroke="#dfbd77"/><path d="m88 109 12 3 12-3q-12 14-24 0" fill="#9c5d66"/><path d="M78 145q22 28 44 0" fill="none" stroke="#dfbd77" strokeWidth="3"/><path d="m100 160-4 8 4 8 4-8Z" fill={c}/><path d="m137 179-29-38 50 8Z" fill="#96785b" stroke="#dfbd77"/><path d="m137 179-15-32m15 32 0-30m0 30 12-29" stroke="#dfbd77" strokeWidth=".7"/></>}
    <path d="M84 83h10m12 0h10" stroke="#584a46" strokeWidth="2"/><path d="m100 85-3 12h6" fill="none" stroke="#9c806d" strokeWidth="1"/>
    <path d="M45 185h110" stroke={c} opacity=".6"/>
  </svg>;
}
export function CardBack() {
  return <div className="card-back"><svg viewBox="0 0 150 210" aria-hidden="true"><rect x="9" y="9" width="132" height="192" rx="8" fill="none" stroke="currentColor" opacity=".5"/><path d="M75 25 126 105 75 185 24 105Z M75 42 115 105 75 168 35 105Z M75 59 104 105 75 151 46 105Z" fill="none" stroke="currentColor" opacity=".25"/><path d="m48 92 13 12 14-23 14 23 13-12-7 31H55Z" fill="currentColor"/><path d="M57 132h36" stroke="currentColor" strokeWidth="2"/><circle cx="75" cy="105" r="48" fill="none" stroke="currentColor" opacity=".25"/><path d="M22 25h12m-12 0v12m106-12h-12m12 0v12M22 185h12m-12 0v-12m106 12h-12m12 0v-12" stroke="currentColor"/></svg><span>COUP ROYALE</span></div>;
}
export function CharacterCard({ role, hidden = false, revealed = false, selected = false, onClick, compact = false, label, style }) {
  const info = roleInfo[role] || { color: '#b49b69', title: '', power: '', mark: '' };
  const Tag = onClick ? 'button' : 'div';
  return <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={`character-card ${hidden ? 'is-hidden' : 'is-face'} ${revealed ? 'is-revealed' : ''} ${selected ? 'is-selected' : ''} ${compact ? 'compact' : ''} ${onClick ? 'selectable' : ''}`} style={{ '--role-color': info.color, ...style }} aria-label={label || (hidden ? 'Hidden influence' : `${role}${revealed ? ', lost influence' : ''}`)} aria-pressed={onClick ? selected : undefined}>
    <div className="card-inner"><div className="card-side card-front" aria-hidden={hidden}><div className="card-corners"><span>{info.mark}</span><span>♜</span></div><RoleArt role={role}/><div className="card-caption"><small>{info.title}</small><strong>{role}</strong>{!compact && <span>{info.power}</span>}</div>{revealed && <div className="lost-stamp">LOST</div>}</div><div className="card-side card-reverse" aria-hidden={!hidden}><CardBack/></div></div>
  </Tag>;
}
