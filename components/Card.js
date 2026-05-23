// components/Card.js
import styles from '../styles/Card.module.css';

const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RED_SUITS = new Set(['H', 'D']);

export default function Card({ card, selectable, selected, onClick, faceDown }) {
  if (!card || card.hidden || faceDown) {
    return <div className={`${styles.card} ${styles.back}`} />;
  }
  const isWild = card.rank === '4' || card.rank === '8';
  const color = RED_SUITS.has(card.suit) ? styles.red : styles.black;
  return (
    <button
      type="button"
      className={`${styles.card} ${color} ${selected ? styles.selected : ''} ${
        selectable ? styles.selectable : ''
      } ${isWild ? styles.wild : ''}`}
      onClick={onClick}
      disabled={!selectable}
    >
      <span className={styles.cornerTop}>
        <span className={styles.rank}>{card.rank}</span>
        <span className={styles.suit}>{SUIT_GLYPH[card.suit]}</span>
      </span>
      <span className={styles.center}>{SUIT_GLYPH[card.suit]}</span>
      <span className={styles.cornerBottom}>
        <span className={styles.rank}>{card.rank}</span>
        <span className={styles.suit}>{SUIT_GLYPH[card.suit]}</span>
      </span>
      {isWild && <span className={styles.wildBadge}>WILD</span>}
    </button>
  );
}
