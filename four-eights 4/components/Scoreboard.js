// components/Scoreboard.js
// Always-visible scoreboard sidebar with four views:
//   Chips   - current chip stacks (includes buy-in indicators)
//   Delta   - true chip movement: chips - startingChips - buyIns
//             (a "-45" here means you're actually down 45 from your starting position,
//              accounting for any auto buy-ins you took)
//   Net     - peer-only won/lost totals (excludes Bitch losses)
//   Pairs   - full per-pair ledger matrix

import { useState } from 'react';
import Avatar from './Avatar';
import styles from '../styles/Scoreboard.module.css';

const BITCH_ID = '__BITCH__';

function computeNetTotals(ledger, participantIds) {
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

function computeChipDelta(p) {
  const starting = p.startingChips ?? 100;
  const buyIns = p.buyIns ?? 0;
  return (p.chips ?? 0) - starting - buyIns;
}

export default function Scoreboard({ players, ledger, collapsed, onToggleCollapse }) {
  const [view, setView] = useState('chips');

  const allPlayers = players;
  const ids = allPlayers.map((p) => p.id);
  const net = computeNetTotals(ledger, ids);

  const sortedByChips = [...allPlayers].sort((a, b) => (b.chips || 0) - (a.chips || 0));
  const sortedByDelta = [...allPlayers].sort((a, b) => computeChipDelta(b) - computeChipDelta(a));
  const sortedByNet = [...allPlayers].sort((a, b) => (net[b.id] || 0) - (net[a.id] || 0));

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

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${view === 'chips' ? styles.tabActive : ''}`}
          onClick={() => setView('chips')}
        >
          Chips
        </button>
        <button
          type="button"
          className={`${styles.tab} ${view === 'delta' ? styles.tabActive : ''}`}
          onClick={() => setView('delta')}
        >
          Delta
        </button>
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
          Pairs
        </button>
      </div>

      {view === 'chips' && (
        <div className={styles.netList}>
          {sortedByChips.map((p) => (
            <div key={p.id} className={styles.netRow}>
              <Avatar avatar={p.avatar} size="sm" />
              <span className={styles.netName}>{p.name}</span>
              <span className={styles.netValue}>
                {p.chips}
                {p.buyIns > 0 && (
                  <span className={styles.buyInBadge} title={`Auto buy-ins: ${p.buyIns}`}>
                    +{p.buyIns} BI
                  </span>
                )}
              </span>
            </div>
          ))}
          <div className={styles.footnote}>Buy-ins granted automatically when chips run out.</div>
        </div>
      )}

      {view === 'delta' && (
        <div className={styles.netList}>
          <div className={styles.deltaHint}>
            Chips gained or lost, counting buy-ins as debt.
          </div>
          {sortedByDelta.map((p) => {
            const value = computeChipDelta(p);
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

      {view === 'net' && (
        <div className={styles.netList}>
          <div className={styles.deltaHint}>
            Peer-to-peer only. Bitch losses aren't counted here.
          </div>
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
    </aside>
  );
}
