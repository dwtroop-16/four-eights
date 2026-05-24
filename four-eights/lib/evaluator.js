// lib/evaluator.js
// Evaluates poker-style hands with 4s and 8s wild.
//
// Hand categories (highest to lowest):
//   5 - Five of a Kind   (only possible for The Bitch, who gets 5 cards)
//   4 - Four of a Kind
//   3 - Three of a Kind
//   2 - Pair
//   1 - High Card (used for tiebreak draws)
//
// Strategy: enumerate all ways to assign each wild card to a natural rank,
// then return the best result. For up to 5 cards with at most ~4 wilds,
// the search space is tiny (13^4 = 28,561 worst case for 4 wilds), so this
// brute-force is fast and provably optimal.

const { isWild, RANK_VALUE, RANKS } = require('./deck');

const CATEGORY = {
  FIVE_OF_A_KIND: 5,
  FOUR_OF_A_KIND: 4,
  THREE_OF_A_KIND: 3,
  PAIR: 2,
  HIGH_CARD: 1,
};

const CATEGORY_NAME = {
  5: 'Five of a Kind',
  4: 'Four of a Kind',
  3: 'Three of a Kind',
  2: 'Pair',
  1: 'High Card',
};

// Evaluate a single concrete assignment (no wilds) and return its rank profile.
// Returns { category, primaryRank, kickers } where primaryRank is the rank
// value of the n-of-a-kind group, and kickers are the remaining card values
// sorted descending for tiebreaking inside the hand itself.
function evaluateConcrete(cards) {
  const counts = {}; // rankValue -> count
  for (const c of cards) {
    const v = RANK_VALUE[c.rank];
    counts[v] = (counts[v] || 0) + 1;
  }
  // Find the largest group; on ties, prefer higher rank.
  let bestCount = 0;
  let bestRank = 0;
  for (const [rank, count] of Object.entries(counts)) {
    const r = Number(rank);
    if (count > bestCount || (count === bestCount && r > bestRank)) {
      bestCount = count;
      bestRank = r;
    }
  }
  const category = Math.min(bestCount, 5); // 5,4,3,2,1
  const kickers = Object.entries(counts)
    .filter(([r]) => Number(r) !== bestRank)
    .map(([r]) => Number(r))
    .sort((a, b) => b - a);
  return { category, primaryRank: bestRank, kickers };
}

// Compare two evaluation results. Returns positive if a is better than b,
// negative if worse, 0 if exactly tied (tie-broken externally by drawing).
function compare(a, b) {
  if (a.category !== b.category) return a.category - b.category;
  if (a.primaryRank !== b.primaryRank) return a.primaryRank - b.primaryRank;
  // Same category and primary rank: compare kickers.
  const len = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < len; i++) {
    const av = a.kickers[i] ?? 0;
    const bv = b.kickers[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

// Evaluate a hand containing wild cards. Tries every assignment for wilds
// and returns the best evaluation found.
function evaluateHand(hand) {
  const wilds = hand.filter(isWild);
  const naturals = hand.filter((c) => !isWild(c));

  if (wilds.length === 0) {
    return { ...evaluateConcrete(hand), hand };
  }

  // Candidate ranks for wilds: any of the 13 ranks. But the optimal choice
  // for each wild is always one of the ranks already present in `naturals`
  // (to extend an existing group) or an ace (to maximize a fresh group).
  // For correctness we just enumerate all 13.
  const candidateValues = RANKS.map((r) => RANK_VALUE[r]);

  let best = null;

  function recurse(idx, assignedValues) {
    if (idx === wilds.length) {
      // Build a concrete hand: naturals + wilds-as-assigned.
      const concrete = [
        ...naturals,
        ...wilds.map((w, i) => ({
          rank: Object.keys(RANK_VALUE).find((k) => RANK_VALUE[k] === assignedValues[i]),
          suit: w.suit,
          id: w.id,
          wildAs: Object.keys(RANK_VALUE).find((k) => RANK_VALUE[k] === assignedValues[i]),
        })),
      ];
      const result = evaluateConcrete(concrete);
      if (best === null || compare(result, best) > 0) {
        best = result;
      }
      return;
    }
    for (const v of candidateValues) {
      assignedValues.push(v);
      recurse(idx + 1, assignedValues);
      assignedValues.pop();
    }
  }
  recurse(0, []);

  return { ...best, hand };
}

// Evaluate The Bitch — top 5 cards, find the best 4-of-a-kind / 5-of-a-kind / etc.
// Same routine as evaluateHand; the only difference is hand size.
function evaluateBitch(fiveCards) {
  return evaluateHand(fiveCards);
}

// Determine the winner among an array of { playerId, evaluation } entries.
// Returns { winnerIds, needsTiebreak } where winnerIds is the set with the
// top evaluation. If more than one, a tiebreak draw is required.
function findWinners(entries) {
  if (entries.length === 0) return { winnerIds: [], needsTiebreak: false };
  let topEntries = [entries[0]];
  for (let i = 1; i < entries.length; i++) {
    const cmp = compare(entries[i].evaluation, topEntries[0].evaluation);
    if (cmp > 0) topEntries = [entries[i]];
    else if (cmp === 0) topEntries.push(entries[i]);
  }
  return {
    winnerIds: topEntries.map((e) => e.playerId),
    needsTiebreak: topEntries.length > 1,
  };
}

module.exports = {
  CATEGORY,
  CATEGORY_NAME,
  evaluateHand,
  evaluateBitch,
  evaluateConcrete,
  compare,
  findWinners,
};
