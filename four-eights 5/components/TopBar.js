// components/TopBar.js
// Persistent top navigation. Shows in lobby and at the table.
// Buttons adapt to context (some hidden when not in a room).

import { useState } from 'react';
import styles from '../styles/TopBar.module.css';

export default function TopBar({
  inRoom,
  isHost,
  paused,
  phase,
  roomId,
  onReturnHome,
  onSwitchRoom,
  onPauseToggle,
}) {
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'home' | 'switch' | null

  // We only need to confirm if we're mid-round (not lobby, not waiting, not settle).
  const needsConfirm = inRoom && phase && phase !== 'WAITING' && phase !== 'SETTLE';

  function handleHome() {
    if (needsConfirm) setConfirm('home');
    else onReturnHome();
  }
  function handleSwitch() {
    if (needsConfirm) setConfirm('switch');
    else onSwitchRoom();
  }
  function confirmYes() {
    if (confirm === 'home') onReturnHome();
    else if (confirm === 'switch') onSwitchRoom();
    setConfirm(null);
  }

  async function copyLink() {
    if (!roomId) return;
    const url = `${window.location.origin}/?join=${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback for non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <>
      <nav className={styles.bar}>
        <div className={styles.left}>
          <span className={styles.brand}>4 &amp; 8</span>
        </div>
        <div className={styles.right}>
          {inRoom && (
            <button className={styles.btn} onClick={copyLink} title="Copy invite link">
              {copied ? '✓ Copied' : 'Copy invite'}
            </button>
          )}
          {inRoom && isHost && (
            <button
              className={`${styles.btn} ${paused ? styles.btnActive : ''}`}
              onClick={onPauseToggle}
              disabled={phase === 'WAITING'}
              title={paused ? 'Resume the game' : 'Pause the game'}
            >
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
          )}
          {inRoom && (
            <>
              <button className={styles.btn} onClick={handleSwitch} title="Leave and join another room">
                Switch room
              </button>
              <button className={styles.btn} onClick={handleHome} title="Leave and return to lobby">
                Home
              </button>
            </>
          )}
        </div>
      </nav>

      {confirm && (
        <div className={styles.modalBackdrop} onClick={() => setConfirm(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>Leave the round?</h3>
            <p>
              A round is in progress. If you leave now, any chips you've put
              into the pot stay there — they don't come back with you.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setConfirm(null)}>
                Stay
              </button>
              <button className={styles.leaveBtn} onClick={confirmYes}>
                {confirm === 'home' ? 'Leave & go home' : 'Leave & switch room'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
