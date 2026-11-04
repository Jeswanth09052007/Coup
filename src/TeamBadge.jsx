import React from 'react';
export function TeamBadge({ team }) { return team ? <span className={`team-badge team-${team}`}>Team {team}</span> : null; }
