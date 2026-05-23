// pages/index.js
import { useEffect, useState } from 'react';
import { getSocket, emitWithAck } from '../lib/socketClient';
import Card from '../components/Card';
import Seat from '../components/Seat';
import styles from '../styles/Table.module.css';

export default function Home() {
  const [room, setRoom] = useState(null);
  const [me, setMe] = useState(null); // { roomId, playerId }
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState(null);
  const [selectedDiscards, setSelectedDiscards] = useState(new Set());

  useEffect(() => {
    const s = getSocket();
    s.on('room:update', setRoom);
    return () => s.off('room:update', setRoom);
  }, []);

  async function createRoom() {
    setError(null);
    const s = getSocket();
    const res = await emitWithAck(s, 'room:create', { name: name || 'Host' });
    if (res.ok) setMe({ roomId: res.roomId, playerId: res.playerId });
    else setError(res.error);
  }

  async function joinRoom() {
    setError(null);
    const s = getSocket();
    const res = await emitWithAck(s, 'room:join', {
      roomId: joinCode.toUpperCase(),
      name: name || 'Player',
    });
    if (res.ok) setMe({ roomId: res.roomId, playerId: res.playerId });
    else setError(res.error);
  }

  async function startRound() {
    setError(null);
    const s = getSocket();
    const res = await emitWithAck(s, 'round:start', {});
    if (!res.ok) setError(res.error);
  }

  async function decide(decision) {
    setError(null);
    setSelectedDiscards(new Set());
    const s = getSocket();
    const res = await emitWithAck(s, 'player:decide', { decision });
    if (!res.ok) setError(res.error);
  }

  async function submitDraw() {
    setError(null);
    const s = getSocket();
    const res = await emitWithAck(s, 'player:draw', {
      discardIds: Array.from(selectedDiscards),
    });
    if (res.ok) setSelectedDiscards(new Set());
    else setError(res.error);
  }

  function toggleDiscard(cardId) {
    const next = new Set(selectedDiscards);
    if (next.has(cardId)) next.delete(cardId);
    else next.add(cardId);
    setSelectedDiscards(next);
  }

  // ---------- LOBBY ----------
  if (!me || !room) {
    return (
      <div className={styles.lobby}>
        <div className={styles.lobbyCard}>
          <h1 className={styles.title}>
            Fours <span className={styles.amp}>&amp;</span> Eights
          </h1>
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
          <button className={styles.primary} onClick={createRoom}>
            Open a Table
          </button>
          <div className={styles.divider}>or</div>
          <div className={styles.field}>
            <label>Room code</label>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
            />
          </div>
          <button className={styles.secondary} onClick={joinRoom}>
            Join a Table
          </button>
          {error && <div className={styles.error}>{error}</div>}
          <details className={styles.rules}>
            <summary>House rules</summary>
            <ul>
              <li>4s and 8s are wild.</li>
              <li>Each player antes 1 chip and is dealt 4 cards.</li>
              <li>Choose IN or OUT after seeing your hand.</li>
              <li>If you stay IN, you may discard and redraw any number.</li>
              <li>Best hand wins: four of a kind &gt; three &gt; pair.</li>
              <li>Ties broken by drawing the top card.</li>
              <li>Losing IN-players each owe the pot amount into next round.</li>
              <li>If only one player stays IN, they face <em>The Bitch</em> — top 5 cards. She can hit five of a kind, beating four aces.</li>
            </ul>
          </details>
        </div>
      </div>
    );
  }

  // ---------- TABLE ----------
  const youPlayer = room.players.find((p) => p.id === me.playerId);
  const others = room.players.filter((p) => p.id !== me.playerId);
  const isHost = room.hostId === me.playerId;
  const phase = room.phase;
  const inDecision = phase === 'DECISION' && youPlayer?.decision === 'PENDING';
  const inDraw = phase === 'DRAW' && youPlayer?.decision === 'IN' && !youPlayer.hasDrawn;
  const showResult = (phase === 'SHOWDOWN' || phase === 'SETTLE') && room.lastResult;

  return (
    <div className={styles.table}>
      <header className={styles.header}>
        <div>
          <div className={styles.gameTitle}>Fours &amp; Eights</div>
          <div className={styles.roomCode}>Room {room.roomId} · Round {room.round}</div>
        </div>
        <div className={styles.potBox}>
          <div className={styles.potLabel}>POT</div>
          <div className={styles.potValue}>{room.pot}</div>
          {room.carryPot > 0 && (
            <div className={styles.carry}>+{room.carryPot} carry</div>
          )}
        </div>
      </header>

      <section className={styles.opponents}>
        {others.map((p) => (
          <Seat key={p.id} player={p} isHost={p.id === room.hostId} phase={phase} />
        ))}
        {others.length === 0 && (
          <div className={styles.waiting}>
            Share room code <strong>{room.roomId}</strong> with friends.
          </div>
        )}
      </section>

      <section className={styles.bitchArea}>
        {room.bitchHand && (
          <>
            <div className={styles.bitchLabel}>The Bitch</div>
            <div className={styles.bitchHand}>
              {room.bitchHand.map((c, i) => (
                <Card key={i} card={c} />
              ))}
            </div>
          </>
        )}
      </section>

      {showResult && (
        <section className={styles.result}>
          <h2>
            {room.lastResult.winnerIsBitch
              ? 'The Bitch takes it.'
              : room.lastResult.type === 'NO_PLAYERS'
              ? 'No takers. Pot carries.'
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
            {Object.keys(room.lastResult.rolloverOwed || {}).length > 0 && (
              <span>
                {' '}Rollover next round:{' '}
                {Object.entries(room.lastResult.rolloverOwed).map(([id, amt]) => {
                  const name = room.players.find((p) => p.id === id)?.name || 'Player';
                  return `${name} owes ${amt}`;
                }).join(', ')}.
              </span>
            )}
          </div>
        </section>
      )}

      <section className={styles.you}>
        <div className={styles.youHeader}>
          <span className={styles.youName}>
            {youPlayer?.name} {isHost && <span className={styles.hostStar}>★</span>}
          </span>
          <span className={styles.youChips}>{youPlayer?.chips} chips</span>
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
              <button className={styles.in} onClick={() => decide('IN')}>
                Stay IN
              </button>
              <button className={styles.out} onClick={() => decide('OUT')}>
                Fold OUT
              </button>
            </>
          )}
          {inDraw && (
            <button className={styles.primary} onClick={submitDraw}>
              {selectedDiscards.size === 0
                ? 'Stand pat'
                : `Discard ${selectedDiscards.size} & draw`}
            </button>
          )}
          {phase === 'DECISION' && youPlayer?.decision !== 'PENDING' && (
            <div className={styles.waitingNote}>Waiting on other players…</div>
          )}
          {phase === 'DRAW' && (youPlayer?.decision === 'OUT' || youPlayer?.hasDrawn) && (
            <div className={styles.waitingNote}>Waiting on draws…</div>
          )}
        </div>
        {error && <div className={styles.error}>{error}</div>}
      </section>
    </div>
  );
}
