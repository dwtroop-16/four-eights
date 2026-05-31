// lib/deck.js
// Standard 52-card deck with shuffle, deal, and discard/redraw helpers.

const SUITS = ['S', 'H', 'D', 'C']; // Spades, Hearts, Diamonds, Clubs
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

// Numeric rank values for comparison. Aces high.
const RANK_VALUE = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

const isWild = (card) => card.rank === '4' || card.rank === '8';

function buildDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ rank: r, suit: s, id: `${r}${s}` });
    }
  }
  return deck;
}

// Fisher-Yates shuffle. Uses crypto.randomInt on the server for fairness.
function shuffle(deck, rng = Math.random) {
  const arr = deck.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Deal `n` cards from the top of the deck. Returns [hand, remainingDeck].
function deal(deck, n) {
  return [deck.slice(0, n), deck.slice(n)];
}

// Replace specified card IDs in a hand with new cards from the deck.
// Returns [newHand, remainingDeck].
function discardAndRedraw(hand, discardIds, deck) {
  const kept = hand.filter((c) => !discardIds.includes(c.id));
  const [drawn, rest] = deal(deck, discardIds.length);
  return [[...kept, ...drawn], rest];
}

module.exports = {
  SUITS,
  RANKS,
  RANK_VALUE,
  isWild,
  buildDeck,
  shuffle,
  deal,
  discardAndRedraw,
};
