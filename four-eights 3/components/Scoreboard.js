// components/Scoreboard.js
// Always-visible per-pair ledger sidebar.
//
// Shows two views:
//   1. NET TOTALS — each player's net position vs. all others combined,
//      plus The Bitch's running take from the room.
//   2. PER-PAIR LEDGER — a matrix showing "Row has won N from Column".
//
// The scoreboard reads from room.ledger which is updated on settle.

import { useState } from 'react';
import Avatar from './Avatar';
import styles from '../styles/Scoreboard.module.css';

const BITCH_ID = '__BITCH__';

function computeNetTotals(ledger, participantIds) {
  // For each participant: total won - total lost (across all opponents).
  // Bitch entries (if any historical state has them) are ignored.
  const net = {};
  for (const id of participantIds) net[id] = 0;
  for (const winnerId of Object.keys(ledger)) {
    if (winnerId === BITCH_ID) continue;
    for (const [loserId, amount] of Object.entries(ledger[winnerId])) {
      if (loserId === BITCH_ID) continue;
      if (winnerId in net) net[winnerId] += amount;
      if (loserId in net) net[loserId] -= amount;
    }
  }
  return net;
}

export default function Scoreboard({ players, ledger, collapsed, onToggleCollapse }) {
  const [view, setView] = useState('net'); // 'net' | 'matrix'

  // The Bitch is not a ledger participant. Scoreboard shows real players only.
  const allPlayers = players;
  const ids = allPlayers.map((p) => p.id);
  const net = computeNetTotals(ledger, ids);

  // Sort: by net descending so leaders are at the top
  const sortedByNet = [...allPlayers].sort((a, b) => (net[b.id] || 0) - (net[a.id] || 0));

  const hasAnyEntries = Object.keys(ledger).length > 0;

  if (collapsed) {
    return (
      <button className={styles.collapsedTab} onClick={onToggleCollapse} title="Show scoreboard">
        <span className={styles.collapsedIcon}>📒</span>
        <span className={styles.collapsedLabel}>Scoreboard</span>
      </button>
    );
  }

  return (
    <aside className={styles.panel}>
      <header className={styles.header}>
        <h3 className={styles.title}>Scoreboard</h3>
        <button className={styles.collapseBtn} onClick={onToggleCollapse} title="Hide">
          ✕
        </button>
      </header>

      {!hasAnyEntries && (
        <div className={styles.empty}>
          <p>No rounds settled yet.</p>
          <p className={styles.emptyHint}>Play a hand to see the ledger fill in.</p>
        </div>
      )}

      {hasAnyEntries && (
        <>
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${view === 'net' ? styles.tabActive : ''}`}
              onClick={() => setView('net')}
            >
              Net
            </button>
            <button
              type="button"
              className={`${styles.tab} ${view === 'matrix' ? styles.tabActive : ''}`}
              onClick={() => setView('matrix')}
            >
              Pair Ledger
            </button>
          </div>

          {view === 'net' && (
            <div className={styles.netList}>
              {sortedByNet.map((p) => {
                const value = net[p.id] || 0;
                return (
                  <div key={p.id} className={styles.netRow}>
                    <Avatar avatar={p.avatar} size="sm" />
                    <span className={styles.netName}>{p.name}</span>
                    <span
                      className={`${styles.netValue} ${
                        value > 0 ? styles.netPos : value < 0 ? styles.netNeg : styles.netZero
                      }`}
                    >
                      {value > 0 ? '+' : ''}{value}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {view === 'matrix' && (
            <div className={styles.matrixWrap}>
              <div className={styles.matrixHint}>
                Read as: <em>row</em> has won this much from <em>column</em>.
              </div>
              <table className={styles.matrix}>
                <thead>
                  <tr>
                    <th></th>
                    {allPlayers.map((p) => (
                      <th key={p.id} title={p.name} className={styles.colHeader}>
                        <Avatar avatar={p.avatar} size="sm" />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allPlayers.map((winner) => (
                    <tr key={winner.id}>
                      <th className={styles.rowHeader} title={winner.name}>
                        <Avatar avatar={winner.avatar} size="sm" />
                      </th>
                      {allPlayers.map((loser) => {
                        if (winner.id === loser.id) {
                          return <td key={loser.id} className={styles.diagonal}>—</td>;
                        }
                        const amount = (ledger[winner.id] && ledger[winner.id][loser.id]) || 0;
                        return (
                          <td
                            key={loser.id}
                            className={amount > 0 ? styles.cellPositive : styles.cellEmpty}
                          >
                            {amount > 0 ? amount : '·'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
