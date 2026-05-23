// components/Seat.js
import Card from './Card';
import styles from '../styles/Seat.module.css';

export default function Seat({ player, isYou, isHost, phase }) {
  const decisionBadge =
    player.decision === 'IN'
      ? <span className={`${styles.badge} ${styles.in}`}>IN</span>
      : player.decision === 'OUT'
      ? <span className={`${styles.badge} ${styles.out}`}>OUT</span>
      : phase !== 'WAITING' && phase !== 'SETTLE'
      ? <span className={`${styles.badge} ${styles.pending}`}>Deciding…</span>
      : null;

  return (
    <div className={`${styles.seat} ${isYou ? styles.you : ''}`}>
      <div className={styles.header}>
        <span className={styles.name}>
          {player.name}
          {isYou && <span className={styles.youTag}> (you)</span>}
          {isHost && <span className={styles.hostTag}>★</span>}
        </span>
        <span className={styles.chips}>{player.chips} chips</span>
      </div>
      <div className={styles.hand}>
        {(player.hand || []).map((c, i) => (
          <div key={i} className={styles.miniWrap}>
            <Card card={c} />
          </div>
        ))}
      </div>
      <div className={styles.footer}>
        {decisionBadge}
        {player.hasDrawn && <span className={styles.drawn}>Drew</span>}
      </div>
    </div>
  );
}
