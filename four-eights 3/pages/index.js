// pages/index.js
import { useEffect, useState } from 'react';
import { getSocket, emitWithAck } from '../lib/socketClient';
import Card from '../components/Card';
import Seat from '../components/Seat';
import Avatar from '../components/Avatar';
import AvatarPicker from '../components/AvatarPicker';
import TurnTimer from '../components/TurnTimer';
import TopBar from '../components/TopBar';
import Scoreboard from '../components/Scoreboard';
import styles from '../styles/Table.module.css';

const DEFAULT_AVATAR = { kind: 'preset', emoji: '🦊', color: '#c49a57' };

export default function Home() {
  const [room, setRoom] = useState(null);
  const [me, setMe] = useState(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState(null);
  const [selectedDiscards, setSelectedDiscards] = useState(new Set());
  const [scoreboardCollapsed, setScoreboardCollapsed] = useState(false);

  useEffect(() => {
    const s = getSocket();
    s.on('room:update', setRoom);
    return () => s.off('room:update', setRoom);
  }, []);

  // Auto-fill join code from ?join=XXXX query parameter (used by Copy Invite links).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('join');
    if (code) setJoinCode(code.toUpperCase());
  }, []);

  async function leaveCurrentRoom() {
    if (!me) return;
    await emitWithAck(getSocket(), 'room:leave', {});
    setMe(null);
    setRoom(null);
    setSelectedDiscards(new Set());
    setError(null);
  }

  async function returnHome() {
    await leaveCurrentRoom();
    // Clear ?join= from URL if present
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
    setJoinCode('');
  }

  async function switchRoom() {
    await leaveCurrentRoom();
    // Keep them on the lobby — they'll type a new code or paste one.
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
    setJoinCode('');
  }

  async function togglePause() {
    if (!room) return;
    const event = room.paused ? 'room:resume' : 'room:pause';
    const res = await emitWithAck(getSocket(), event, {});
    if (!res.ok) setError(res.error);
  }


  async function createMulti() {
    setError(null);
    const res = await emitWithAck(getSocket(), 'room:create', {
      name: name || 'Host', avatar, mode: 'multi',
    });
    if (res.ok) setMe({ roomId: res.roomId, playerId: res.playerId });
    else setError(res.error);
  }

  async function createSolo() {
    setError(null);
    const res = await emitWithAck(getSocket(), 'room:create', {
      name: name || 'Player', avatar, mode: 'solo',
    });
    if (res.ok) setMe({ roomId: res.roomId, playerId: res.playerId });
    else setError(res.error);
  }

  async function joinRoom() {
    setError(null);
    const res = await emitWithAck(getSocket(), 'room:join', {
      roomId: joinCode.toUpperCase(),
      name: name || 'Player',
      avatar,
    });
    if (res.ok) setMe({ roomId: res.roomId, playerId: res.playerId });
    else setError(res.error);
  }

  async function startRound() {
    setError(null);
    const res = await emitWithAck(getSocket(), 'round:start', {});
    if (!res.ok) setError(res.error);
  }

  async function decide(decision) {
    setError(null);
    setSelectedDiscards(new Set());
    const res = await emitWithAck(getSocket(), 'player:decide', { decision });
    if (!res.ok) setError(res.error);
  }

  async function submitDraw() {
    setError(null);
    const res = await emitWithAck(getSocket(), 'player:draw', {
      discardIds: Array.from(selectedDiscards),
    });
    if (res.ok) setSelectedDiscards(new Set());
    else setError(res.error);
  }

  function toggleDiscard(cardId) {
    const next = new Set(selectedDiscards);
    if (next.has(cardId)) next.delete(cardId); else next.add(cardId);
    setSelectedDiscards(next);
  }

  // ---------- LOBBY ----------
  if (!me || !room) {
    return (
      <>
        <TopBar inRoom={false} />
        <div className={styles.lobby}>
          <div className={styles.lobbyCard}>
          <h1 className={styles.title}>Fours <span className={styles.amp}>&amp;</span> Eights</h1>
          <p className={styles.tagline}>A wild-card game of nerve and rollover.</p>

          <div className={styles.field}>
            <label>Your name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter name"
              maxLength={20}
            />
          </div>

          <div className={styles.field}>
            <label>Your avatar</label>
            <AvatarPicker value={avatar} onChange={setAvatar} />
          </div>

          <div className={styles.modeRow}>
            <button className={styles.primary} onClick={createMulti}>
              Open a Table
            </button>
            <button className={styles.secondary} onClick={createSolo}>
              Solo Practice
            </button>
          </div>

          <div className={styles.divider}>or join one</div>

          <div className={styles.joinRow}>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              className={styles.joinInput}
            />
            <button className={styles.joinBtn} onClick={joinRoom}>Join</button>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <details className={styles.rules}>
            <summary>House rules</summary>
            <ul>
              <li>4s and 8s are wild.</li>
              <li>Each player antes 1 chip and is dealt 4 cards.</li>
              <li>Turn order rotates left each round.</li>
              <li>You have 30 seconds to choose IN or OUT. Time out = OUT.</li>
              <li>IN-players take turns discarding and redrawing any number.</li>
              <li>Best hand wins: four of a kind &gt; three &gt; pair.</li>
              <li>Ties broken by drawing the top card.</li>
              <li>Losing IN-players each pay the pot amount from their stack; those chips carry to the next round.</li>
              <li>Folders earn a free-ante credit for the next round.</li>
              <li>One lone IN-player faces <em>The Bitch</em> — top 5 cards. She can hit five of a kind, beating four aces.</li>
              <li>If The Bitch wins, the lone player pays the pot amount out of their stack. Both the original pot and their replacement carry to next round, and everyone in the room earns a free-ante credit.</li>
              <li>If a player <em>beats</em> The Bitch, the game resets — fresh antes, no rollover.</li>
              <li>Solo Practice puts you head-to-head with the Bitch every hand.</li>
            </ul>
          </details>
          </div>
        </div>
      </>
    );
  }

  // ---------- TABLE ----------
  const youPlayer = room.players.find((p) => p.id === me.playerId);
  const others = room.players.filter((p) => p.id !== me.playerId);
  const isHost = room.hostId === me.playerId;
  const phase = room.phase;
  const isYourTurn = room.activePlayerId === me.playerId;
  const inDecision = phase === 'DECISION' && isYourTurn;
  const inDraw = phase === 'DRAW' && isYourTurn && !youPlayer?.hasDrawn;
  const showResult = (phase === 'SHOWDOWN' || phase === 'SETTLE') && room.lastResult;
  const isSoloMode = room.mode === 'solo';
  const dealerId = room.seatOrder[room.dealerIndex];

  // Active player's name for waiting message
  const activePlayer = room.players.find((p) => p.id === room.activePlayerId);

  return (
    <>
      <TopBar
        inRoom={true}
        isHost={isHost}
        paused={!!room.paused}
        phase={phase}
        roomId={room.roomId}
        locked={!!room.lockedToNewJoiners}
        onReturnHome={returnHome}
        onSwitchRoom={switchRoom}
        onPauseToggle={togglePause}
      />
      <div className={styles.table}>
        {room.paused && (
          <div className={styles.pausedOverlay}>
            <div className={styles.pausedCard}>
              <div className={styles.pausedIcon}>⏸</div>
              <h2>Game Paused</h2>
              <p>
                The host has paused the round. All actions are frozen until
                the host resumes.
              </p>
              {isHost && (
                <button className={styles.primary} onClick={togglePause}>
                  Resume the game
                </button>
              )}
            </div>
          </div>
        )}
        <header className={styles.header}>
        <div>
          <div className={styles.gameTitle}>Fours &amp; Eights</div>
          <div className={styles.roomCode}>
            {isSoloMode ? 'Solo Practice' : `Room ${room.roomId}`} · Round {room.round || '—'}
            {room.lockedToNewJoiners && !isSoloMode && (
              <span style={{ marginLeft: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(179, 20, 42, 0.2)', color: '#e57c8a', border: '1px solid rgba(179, 20, 42, 0.5)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                🔒 Locked — beat the Bitch to reopen
              </span>
            )}
          </div>
        </div>
        <div className={styles.potBox}>
          <div className={styles.potLabel}>POT</div>
          <div className={styles.potValue}>{room.pot}</div>
          {room.carryPot > 0 && <div className={styles.carry}>+{room.carryPot} carry</div>}
        </div>
      </header>

      {!isSoloMode && (
        <section className={styles.opponents}>
          {others.map((p) => (
            <Seat
              key={p.id}
              player={p}
              isHost={p.id === room.hostId}
              isDealer={p.id === dealerId}
              isActive={room.activePlayerId === p.id}
              turnDeadline={room.activePlayerId === p.id ? room.turnDeadline : null}
              phase={phase}
            />
          ))}
          {others.length === 0 && (
            <div className={styles.waiting}>
              Share room code <strong>{room.roomId}</strong> to invite players (2-10 total).
            </div>
          )}
        </section>
      )}

      <section className={styles.bitchArea}>
        {room.bitchHand && (
          <>
            <div className={styles.bitchLabel}>The Bitch</div>
            <div className={styles.bitchHand}>
              {room.bitchHand.map((c, i) => <Card key={i} card={c} />)}
            </div>
          </>
        )}
        {!room.bitchHand && phase !== 'WAITING' && !isYourTurn && activePlayer && (
          <div className={styles.waitingTurn}>
            Waiting on <strong>{activePlayer.name}</strong>…
            {room.turnDeadline && (
              <span className={styles.timerInline}>
                <TurnTimer deadline={room.turnDeadline} />
              </span>
            )}
          </div>
        )}
      </section>

      {showResult && (
        <section className={styles.result}>
          <h2>
            {room.lastResult.winnerIsBitch
              ? 'The Bitch takes it.'
              : room.lastResult.type === 'NO_PLAYERS'
              ? 'No takers. Pot carries.'
              : room.lastResult.playerBeatBitch
              ? (() => {
                  const winners = room.lastResult.winnerIds
                    .map((id) => room.players.find((p) => p.id === id)?.name)
                    .filter(Boolean)
                    .join(', ');
                  return `${winners} beat The Bitch.`;
                })()
              : (() => {
                  const winners = room.lastResult.winnerIds
                    .map((id) => room.players.find((p) => p.id === id)?.name)
                    .filter(Boolean)
                    .join(', ');
                  return `${winners} wins the pot.`;
                })()}
          </h2>
          <div className={styles.resultDetail}>
            Pot of {room.lastResult.potAmount} chips.
            {room.lastResult.freshStart && (
              <span> The game resets — next round everyone antes 1 fresh.</span>
            )}
            {!room.lastResult.freshStart && Object.keys(room.lastResult.rolloverOwed || {}).length > 0 && (
              <span>
                {' '}Rollover next round:{' '}
                {Object.entries(room.lastResult.rolloverOwed).map(([id, amt]) => {
                  const n = room.players.find((p) => p.id === id)?.name || 'Player';
                  return `${n} owes ${amt}`;
                }).join(', ')}.
              </span>
            )}
            {Object.keys(room.lastResult.freeAntesUsedThisRound || {}).length > 0 && (
              <span>
                {' '}Free antes used:{' '}
                {Object.entries(room.lastResult.freeAntesUsedThisRound).map(([id]) => {
                  const n = room.players.find((p) => p.id === id)?.name || 'Player';
                  return n;
                }).join(', ')}.
              </span>
            )}
            {Object.keys(room.lastResult.freeCreditsGranted || {}).length > 0 && (
              <span>
                {' '}Free credits earned by folders:{' '}
                {Object.entries(room.lastResult.freeCreditsGranted).map(([id]) => {
                  const n = room.players.find((p) => p.id === id)?.name || 'Player';
                  return n;
                }).join(', ')}.
              </span>
            )}
            {Object.keys(room.lastResult.buyInsThisRound || {}).length > 0 && (
              <span>
                {' '}Buy-ins granted:{' '}
                {Object.entries(room.lastResult.buyInsThisRound).map(([id, amt]) => {
                  const n = room.players.find((p) => p.id === id)?.name || 'Player';
                  return `${n} +${amt}`;
                }).join(', ')}.
              </span>
            )}
          </div>
        </section>
      )}

      <section className={`${styles.you} ${isYourTurn ? styles.yourTurn : ''}`}>
        <div className={styles.youHeader}>
          <Avatar avatar={youPlayer?.avatar} size="md" />
          <div className={styles.youInfo}>
            <div className={styles.youName}>
              {youPlayer?.name}
              {isHost && <span className={styles.hostStar}> ★</span>}
              {dealerId === me.playerId && <span className={styles.dealerStar}> D</span>}
            </div>
            <div className={styles.youChips}>
              {youPlayer?.chips} chips
              {youPlayer?.freeCredits > 0 && (
                <span style={{ marginLeft: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(127,199,119,0.18)', color: '#7fc777', border: '1px solid rgba(127,199,119,0.4)', fontSize: 11, fontWeight: 700 }}>
                  🎟 {youPlayer.freeCredits} free {youPlayer.freeCredits > 1 ? 'antes' : 'ante'}
                </span>
              )}
            </div>
          </div>
          {isYourTurn && room.turnDeadline && (
            <TurnTimer deadline={room.turnDeadline} />
          )}
        </div>

        <div className={styles.yourHand}>
          {(youPlayer?.hand || []).map((c) => (
            <Card
              key={c.id}
              card={c}
              selectable={inDraw}
              selected={selectedDiscards.has(c.id)}
              onClick={() => toggleDiscard(c.id)}
            />
          ))}
          {(youPlayer?.hand?.length || 0) === 0 && (
            <div className={styles.emptyHand}>No cards dealt yet.</div>
          )}
        </div>

        <div className={styles.actions}>
          {phase === 'WAITING' && isHost && (
            <button className={styles.primary} onClick={startRound}>
              Deal the round
            </button>
          )}
          {phase === 'SETTLE' && isHost && (
            <button className={styles.primary} onClick={startRound}>
              Next round
            </button>
          )}
          {inDecision && (
            <>
              <button className={styles.in} onClick={() => decide('IN')}>Stay IN</button>
              <button className={styles.out} onClick={() => decide('OUT')}>Fold OUT</button>
            </>
          )}
          {inDraw && (
            <button className={styles.primary} onClick={submitDraw}>
              {selectedDiscards.size === 0
                ? 'Stand pat'
                : `Discard ${selectedDiscards.size} & draw`}
            </button>
          )}
          {phase === 'DECISION' && !isYourTurn && (
            <div className={styles.waitingNote}>It's not your turn yet.</div>
          )}
          {phase === 'DRAW' && !isYourTurn && (
            <div className={styles.waitingNote}>Waiting on draws…</div>
          )}
        </div>
        {error && <div className={styles.error}>{error}</div>}
      </section>
      </div>
      <Scoreboard
        players={room.players}
        ledger={room.ledger || {}}
        collapsed={scoreboardCollapsed}
        onToggleCollapse={() => setScoreboardCollapsed((v) => !v)}
      />
    </>
  );
}
