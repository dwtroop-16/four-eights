// components/Seat.js
import Card from './Card';
import Avatar from './Avatar';
import TurnTimer from './TurnTimer';
import styles from '../styles/Seat.module.css';

export default function Seat({ player, isYou, isHost, isDealer, isActive, turnDeadline, phase }) {
  const decisionBadge =
    player.decision === 'IN'
      ? <span className={`${styles.badge} ${styles.in}`}>IN</span>
      : player.decision === 'OUT'
      ? <span className={`${styles.badge} ${styles.out}`}>OUT</span>
      : phase !== 'WAITING' && phase !== 'SETTLE'
      ? <span className={`${styles.badge} ${styles.pending}`}>Pending</span>
      : null;

  return (
    <div className={`${styles.seat} ${isYou ? styles.you : ''} ${isActive ? styles.active : ''} ${!player.connected ? styles.gone : ''}`}>
      <div className={styles.header}>
        <Avatar avatar={player.avatar} size="md" dim={!player.connected} />
        <div className={styles.info}>
          <div className={styles.name}>
            {player.name}
            {isYou && <span className={styles.tag}> · you</span>}
            {isHost && <span className={styles.hostTag} title="Host">★</span>}
            {isDealer && <span className={styles.dealerTag} title="Dealer">D</span>}
          </div>
          <div className={styles.chips}>{player.chips} chips</div>
        </div>
        {isActive && turnDeadline && (
          <TurnTimer deadline={turnDeadline} />
        )}
      </div>
      <div className={styles.hand}>
        {(player.hand || []).map((c, i) => (
          <Card key={i} card={c} />
        ))}
      </div>
      <div className={styles.footer}>
        {!player.connected && <span className={styles.disc}>Disconnected</span>}
        {decisionBadge}
        {player.hasDrawn && phase === 'DRAW' && <span className={styles.drawn}>Drew</span>}
      </div>
    </div>
  );
}
