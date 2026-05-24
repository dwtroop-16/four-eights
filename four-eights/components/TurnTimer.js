// components/TurnTimer.js
import { useEffect, useState } from 'react';
import styles from '../styles/TurnTimer.module.css';

// Animated countdown ring driven by room.turnDeadline (epoch ms).
export default function TurnTimer({ deadline, totalMs = 30000 }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!deadline) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const ms = Math.max(0, deadline - Date.now());
      setRemaining(ms);
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) return null;
  const seconds = Math.ceil(remaining / 1000);
  const fraction = remaining / totalMs;
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - fraction);
  const danger = seconds <= 5;

  return (
    <div className={styles.wrap}>
      <svg width="52" height="52" className={styles.svg}>
        <circle
          cx="26" cy="26" r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="3"
        />
        <circle
          cx="26" cy="26" r={radius}
          fill="none"
          stroke={danger ? '#e57c8a' : '#c49a57'}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 26 26)"
          className={styles.ring}
        />
      </svg>
      <span className={`${styles.label} ${danger ? styles.danger : ''}`}>{seconds}</span>
    </div>
  );
}
