// Les bots de Zoo. Ils ne savent que ce qu'un joueur saurait : le plateau, les deux lots, leurs propres cartes et condition,
// leurs tickets, et les totaux annoncés après chaque lot adjugé. Ils ne voient ni les mises ni les tickets des autres.
import {
  LOT_SIZE,
  START_TICKETS,
  SIZE,
  WINDOWS,
  applyPlan,
  countAnimal,
  landingRow,
  suiteLines,
  type Animal,
  type Board,
  type Condition,
  type Drop,
  type Lot,
} from '../shared/protocol';

export type Skill = 'novice' | 'habile' | 'retors';
export const AUTOPILOT: Skill = 'habile';
const SKILLS: Skill[] = ['novice', 'habile', 'habile', 'retors'];

export type Rand = () => number;

export function randomSkill(rand: Rand = Math.random): Skill {
  return SKILLS[Math.floor(rand() * SKILLS.length)];
}

/** Ce que voit un bot au guichet. */
export interface BotSeen {
  board: Board;
  lots: Record<Lot, Animal[]>;
  cards: Animal[];
  condition: Condition;
  tickets: number;
  round: number;
  rounds: number;
  players: number;
  /** Les totaux annoncés après chaque lot adjugé. */
  totalsHeard: number[];
  /** L'animal montré par chacun des autres. */
  shownOthers?: Animal[];
}

export interface BotBid {
  lot: Lot;
  amount: number;
  plan: Drop[];
}

/** Ranger ses cartes : l'ordre compte peu au départ ; un bot montre une carte au hasard. */
export function botSuite(rand: Rand = Math.random): { order: number[]; shown: number } {
  const order = [0, 1, 2];
  for (let i = 2; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { order, shown: Math.floor(rand() * 3) };
}

/** La chance que la condition tienne à la fin, d'après l'écart du moment et le nombre de cubes encore à venir. */
function conditionChance(board: Board, cond: Condition, tilesLeft: number): number {
  const d = countAnimal(board, cond[0]) - countAnimal(board, cond[1]);
  if (tilesLeft <= 0) return d > 0 ? 1 : 0;
  const k = 1.1 + 6 / (tilesLeft + 2);
  return 1 / (1 + Math.exp(-k * (d - 0.5)));
}

/**
 * Ce que vaut un plateau pour une suite : les suites déjà faites, plus les alignements en bonne voie
 * (deux ou un animal à leur place, les autres cases encore vides et pas trop hautes), le tout doublé selon la condition.
 */
export function evaluate(board: Board, suite: readonly Animal[], cond: Condition, tilesLeft: number): number {
  const done = suiteLines(board, suite).length;
  let potential = 0;
  if (tilesLeft > 0) {
    const heights = Array.from({ length: SIZE }, (_, col) => {
      const r = landingRow(board, col);
      return r < 0 ? SIZE : r;
    });
    for (const w of WINDOWS) {
      let best = -1;
      let gap = 0;
      for (const pattern of [suite, [suite[2], suite[1], suite[0]]]) {
        let k = 0;
        let ok = true;
        let g = 0;
        for (let i = 0; i < 3; i++) {
          const cell = board[w[i]];
          if (cell === null) {
            const col = w[i] % SIZE;
            const row = Math.floor(w[i] / SIZE);
            g += row - heights[col];
          } else if (cell === pattern[i]) k++;
          else {
            ok = false;
            break;
          }
        }
        if (ok && k < 3 && k > best) {
          best = k;
          gap = g;
        }
      }
      if (best < 0) continue;
      const weight = best === 2 ? 0.5 : best === 1 ? 0.12 : 0.025;
      potential += weight * Math.pow(0.55, gap);
    }
    potential *= Math.min(1, tilesLeft / 8);
  }
  return (done + potential) * (1 + conditionChance(board, cond, tilesLeft));
}

/**
 * Toutes les poses distinctes d'un lot. Deux cubes lâchés dans des colonnes différentes donnent le même plateau
 * dans un ordre ou dans l'autre : seul compte l'empilement dans chaque colonne. On range donc les cubes en piles
 * (5 × 6 × 7 × 8 = 1 680 façons pour quatre cubes), et l'on saute les plateaux déjà vus (cubes identiques).
 */
function* plans(board: Board, lot: Animal[]): Generator<{ plan: Drop[]; board: Board }> {
  const room = Array.from({ length: SIZE }, (_, col) => {
    const r = landingRow(board, col);
    return r < 0 ? 0 : SIZE - r;
  });
  const stacks: number[][] = Array.from({ length: SIZE }, () => []);
  const seen = new Set<string>();
  function* place(i: number): Generator<{ plan: Drop[]; board: Board }> {
    if (i === lot.length) {
      const key = stacks.map((s) => s.map((t) => lot[t][0] + lot[t][1]).join('')).join('|');
      if (seen.has(key)) return;
      seen.add(key);
      const plan: Drop[] = [];
      stacks.forEach((s, col) => s.forEach((t) => plan.push({ t, col })));
      const out = applyPlan(board, lot, plan);
      if (typeof out !== 'string') yield { plan, board: out.board };
      return;
    }
    for (let col = 0; col < SIZE; col++) {
      const s = stacks[col];
      if (s.length >= room[col]) continue;
      for (let pos = 0; pos <= s.length; pos++) {
        s.splice(pos, 0, i);
        yield* place(i + 1);
        s.splice(pos, 1);
      }
    }
  }
  yield* place(0);
}

/** La meilleure pose d'un lot pour soi ; le novice se contente d'une des bonnes. */
export function bestPlan(seen: BotSeen, lot: Lot, skill: Skill, rand: Rand): { plan: Drop[]; value: number } {
  const tilesLeft = (seen.rounds - seen.round) * LOT_SIZE;
  const scored: { plan: Drop[]; value: number }[] = [];
  for (const p of plans(seen.board, seen.lots[lot])) scored.push({ plan: p.plan, value: evaluate(p.board, seen.cards, seen.condition, tilesLeft) + rand() * 1e-6 });
  scored.sort((a, b) => b.value - a.value);
  if (skill === 'novice') return scored[Math.floor(rand() * Math.min(6, scored.length))];
  return scored[0];
}

/** Un plan quelconque, valable. */
export function randomPlan(board: Board, lot: Animal[], rand: Rand): Drop[] {
  for (;;) {
    const order = [0, 1, 2, 3].slice(0, lot.length);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const plan = order.map((t) => ({ t, col: Math.floor(rand() * SIZE) }));
    if (typeof applyPlan(board, lot, plan) !== 'string') return plan;
  }
}

/** Le prix habituel d'un lot gagné, d'après les totaux entendus : un peu moins de deux fois la mise moyenne. */
function usualPrice(seen: BotSeen): number {
  if (!seen.totalsHeard.length) return 5;
  const recent = seen.totalsHeard.slice(-3);
  const avg = recent.reduce((s, x) => s + x, 0) / recent.length;
  return Math.max(2, (avg / seen.players) * 1.8);
}

/** Ce que rapporte en moyenne un lot posé par quelqu'un d'autre, qui le pose pour lui : on l'estime au hasard. */
function othersGain(seen: BotSeen, lot: Lot, base: number, rand: Rand, samples: number): number {
  const tilesLeft = (seen.rounds - seen.round) * LOT_SIZE;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const out = applyPlan(seen.board, seen.lots[lot], randomPlan(seen.board, seen.lots[lot], rand));
    if (typeof out !== 'string') sum += evaluate(out.board, seen.cards, seen.condition, tilesLeft) - base;
  }
  return sum / samples;
}

const AMOUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 17, 20, 24, 30];
/** Réglages des bots, ajustés par simulation (test/sim.ts). */
export const TUNE: { ticket: Record<Skill, number>; spread: number } = { ticket: { novice: 0.35, habile: 0.6, retors: 0.6 }, spread: 1.4 };

/**
 * La mise d'un bot. Il connaît ce que lui rapporterait chaque lot s'il le posait lui-même, et à peu près ce qu'il en
 * resterait si un autre le posait. Il imagine ensuite les mises cachées des autres (autour du prix habituel, ou tout ce
 * qu'il leur reste à la dernière manche), et choisit le lot et la somme qui lui rapportent le plus en moyenne, en comptant
 * ce que valent les tickets gardés pour la suite. Le paradoxe du jeu en sort tout seul : miser gros sur un lot le renchérit,
 * et c'est l'autre qui part ; miser sur le lot qu'on ne veut pas peut faire partir celui qu'on veut.
 * Le retors devine les envies des autres d'après l'animal qu'ils ont montré ; le novice calcule moins et se trompe plus.
 */
export function botBid(seen: BotSeen, skill: Skill, rand: Rand = Math.random): BotBid {
  const t = seen.tickets;
  const tilesNow = (seen.rounds - seen.round + 1) * LOT_SIZE;
  const base = evaluate(seen.board, seen.cards, seen.condition, tilesNow);
  const lots: Lot[] = ['A', 'B'];
  const mine = {} as Record<Lot, { plan: Drop[]; gain: number }>;
  const theirs = {} as Record<Lot, number>;
  for (const lot of lots) {
    const best = bestPlan(seen, lot, skill, rand);
    const slip = skill === 'novice' ? (rand() - 0.5) * 0.7 : 0;
    mine[lot] = { plan: best.plan, gain: best.value - base + slip };
    theirs[lot] = othersGain(seen, lot, base, rand, skill === 'novice' ? 6 : 14);
  }
  const roundsLeft = seen.rounds - seen.round + 1;
  const last = roundsLeft <= 1;
  // Ce que vaut un ticket gardé : rien à la dernière manche ; sinon, à peu près un gain ordinaire pour une mise de manche.
  const perRound = Math.max(2, t / roundsLeft);
  const ticketValue = last ? 0 : TUNE.ticket[skill] / perRound;

  // Les autres : un lot chacun, et une mise autour du prix habituel, plafonnée par ce qu'il leur reste en moyenne.
  const others = seen.players - 1;
  const spent = seen.totalsHeard.reduce((s, x) => s + x, 0);
  const avgLeft = Math.max(1, START_TICKETS - spent / seen.players);
  const price = usualPrice(seen);
  const prefs: number[] = Array.from({ length: others }, (_, j) => {
    if (skill !== 'retors' || !seen.shownOthers?.[j]) return 0.5;
    const a = seen.shownOthers[j];
    const diff = seen.lots.A.filter((x) => x === a).length - seen.lots.B.filter((x) => x === a).length;
    return Math.max(0.2, Math.min(0.8, 0.5 + diff * 0.15));
  });
  const samples = skill === 'novice' ? 80 : skill === 'habile' ? 220 : 320;
  const candidates: { lot: Lot; amount: number }[] = [];
  for (const lot of lots) {
    const seenAmounts = new Set<number>();
    for (const a of [...AMOUNTS, t]) {
      const amount = Math.min(t, a);
      if (amount < 1 || seenAmounts.has(amount)) continue;
      seenAmounts.add(amount);
      candidates.push({ lot, amount });
    }
  }
  const ev = candidates.map(() => 0);
  for (let s = 0; s < samples; s++) {
    const tot: Record<Lot, number> = { A: 0, B: 0 };
    const top: Record<Lot, number> = { A: 0, B: 0 };
    const tied: Record<Lot, boolean> = { A: false, B: false };
    for (let j = 0; j < others; j++) {
      const lot: Lot = rand() < prefs[j] ? 'A' : 'B';
      const cap = Math.max(1, Math.round(avgLeft * (0.6 + rand() * 0.8)));
      const amount = last ? cap : Math.max(1, Math.min(cap, Math.round(price * (0.2 + rand() * TUNE.spread))));
      tot[lot] += amount;
      if (amount > top[lot]) {
        top[lot] = amount;
        tied[lot] = false;
      } else if (amount === top[lot]) tied[lot] = true;
    }
    candidates.forEach((c, i) => {
      const A = tot.A + (c.lot === 'A' ? c.amount : 0);
      const B = tot.B + (c.lot === 'B' ? c.amount : 0);
      if (A === B) return; // annulée : chacun reprend sa mise, rien ne change
      const sold: Lot = A < B ? 'A' : 'B';
      let value: number;
      if (sold === c.lot) {
        if (c.amount > top[sold]) value = mine[sold].gain;
        else if (c.amount === top[sold] || tied[sold]) return;
        else value = theirs[sold];
      } else {
        if (top[sold] === 0 || tied[sold]) return;
        value = theirs[sold];
      }
      ev[i] += value - ticketValue * c.amount;
    });
  }
  const ranked = candidates.map((c, i) => ({ ...c, ev: ev[i] / samples - c.amount * 1e-4 })).sort((a, b) => b.ev - a.ev);
  const pick = skill === 'novice' ? ranked[Math.floor(rand() * Math.min(3, ranked.length))] : ranked[0];
  return { lot: pick.lot, amount: pick.amount, plan: mine[pick.lot].plan };
}

/** Le hasard pur, pour mesurer les bots : un lot au hasard, une mise au hasard, une pose au hasard. */
export function randomBid(seen: BotSeen, rand: Rand = Math.random): BotBid {
  const lot: Lot = rand() < 0.5 ? 'A' : 'B';
  const amount = 1 + Math.floor(rand() * Math.min(seen.tickets, 8));
  return { lot, amount: Math.min(amount, seen.tickets), plan: randomPlan(seen.board, seen.lots[lot], rand) };
}

