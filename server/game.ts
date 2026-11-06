// Moteur de Zoo, sans réseau ni horloge : cartes et conditions, caisses de cubes, passages au guichet,
// lot le moins cher adjugé, cubes qui tombent, annulations, points et classement. La table (room.ts) gère le temps.
import crypto from 'node:crypto';
import {
  ANIMALS,
  CARDS_PER_ANIMAL,
  CONDITIONS,
  LOT_SIZE,
  MAX_VOIDS,
  PER_ANIMAL_IN_CRATE,
  ROUNDS,
  START_TICKETS,
  applyPlan,
  emptyBoard,
  scoreOf,
  type Animal,
  type Board,
  type Condition,
  type Lot,
  type MyBid,
  type ResultView,
  type RevealAttempt,
  type Stage,
} from '../shared/protocol';

export type Rng = (n: number) => number;
export const cryptoRng: Rng = (n) => crypto.randomInt(n);

export function shuffle<T>(arr: readonly T[], rng: Rng = cryptoRng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface Standing {
  id: string;
  cards: Animal[];
  shown: number;
  condition: Condition;
  conditionMet: boolean;
  lines: number[][];
  points: number;
  tickets: number;
  place: number;
}

export class Game {
  readonly order: string[];
  readonly rounds = ROUNDS;
  stage: Stage = 'setup';
  /** 0 pendant la composition, puis 1 à 5. */
  round = 0;
  /** Enchères annulées dans la manche en cours. */
  attempt = 0;
  board: Board = emptyBoard();
  readonly crates: Record<Lot, Animal[]>;
  lots: Record<Lot, Animal[]> | null = null;
  /** La suite de chacun : ses trois cartes, dans l'ordre choisi. */
  readonly cards = new Map<string, Animal[]>();
  readonly shown = new Map<string, number>();
  readonly conditions = new Map<string, Condition>();
  /** Suites validées pendant la composition. */
  readonly ready = new Set<string>();
  readonly tickets = new Map<string, number>();
  turnOrder: string[] = [];
  turnIdx = 0;
  /** Les mises de l'enchère en cours ; les tickets sont retirés au guichet et rendus si l'enchère est annulée. */
  readonly bids = new Map<string, MyBid>();
  /** Ceux qui sont passés au guichet sans plus rien à miser. */
  readonly empty = new Set<string>();
  result: ResultView | null = null;
  /** Le gagnant du dernier lot posé : seul lui l'apprend. */
  lastWinner: string | null = null;
  /** Les totaux annoncés après chaque lot adjugé : tout le monde les a entendus. */
  readonly totalsHeard: number[] = [];
  readonly history: RevealAttempt[] = [];
  private readonly rng: Rng;

  constructor(order: string[], rng: Rng = cryptoRng) {
    this.order = [...order];
    this.rng = rng;
    const crate = () => shuffle(ANIMALS.flatMap((a) => Array.from({ length: PER_ANIMAL_IN_CRATE }, () => a)), rng);
    this.crates = { A: crate(), B: crate() };
    const deck = shuffle(ANIMALS.flatMap((a) => Array.from({ length: CARDS_PER_ANIMAL }, () => a)), rng);
    const conds = shuffle(CONDITIONS, rng);
    this.order.forEach((id, i) => {
      this.cards.set(id, deck.slice(i * 3, i * 3 + 3));
      this.shown.set(id, 0);
      this.conditions.set(id, conds[i % conds.length]);
      this.tickets.set(id, START_TICKETS);
    });
  }

  has(id: string): boolean {
    return this.order.includes(id);
  }

  ticketsOf(id: string): number {
    return this.tickets.get(id) ?? 0;
  }

  get turn(): string | null {
    return this.stage === 'bid' ? (this.turnOrder[this.turnIdx] ?? null) : null;
  }

  // ───────────────────────────── Composition ─────────────────────────────

  /** Range ses trois cartes en suite et choisit celle qu'on montre. */
  setSuite(id: string, order: unknown, shown: unknown): string | undefined {
    if (this.stage !== 'setup') return 'La composition est terminée.';
    const dealt = this.cards.get(id);
    if (!dealt) return "Tu n'as pas de cartes dans cette partie.";
    if (!Array.isArray(order) || order.length !== 3) return 'Range tes trois cartes.';
    const perm = order as unknown[];
    if (!perm.every((x) => Number.isInteger(x) && (x as number) >= 0 && (x as number) < 3) || new Set(perm).size !== 3) return 'Range tes trois cartes, chacune une fois.';
    if (!Number.isInteger(shown) || (shown as number) < 0 || (shown as number) > 2) return 'Choisis la carte que tu montres.';
    if (this.ready.has(id)) return 'Ta suite est déjà validée.';
    this.cards.set(id, (perm as number[]).map((i) => dealt[i]));
    this.shown.set(id, shown as number);
    this.ready.add(id);
    return undefined;
  }

  get allReady(): boolean {
    return this.order.every((id) => this.ready.has(id));
  }

  /** Fin de la composition : la première manche commence. */
  startRounds(): void {
    for (const id of this.order) this.ready.add(id);
    this.round = 1;
    this.attempt = 0;
    this.drawLots();
    this.openBidding();
  }

  private drawLots(): void {
    this.lots = {
      A: this.crates.A.splice(0, LOT_SIZE),
      B: this.crates.B.splice(0, LOT_SIZE),
    };
  }

  /** Le guichet ouvre : l'ordre de passage s'inverse à chaque manche, comme dans l'émission. */
  private openBidding(): void {
    this.stage = 'bid';
    this.turnOrder = this.round % 2 === 1 ? [...this.order].reverse() : [...this.order];
    this.turnIdx = 0;
    this.bids.clear();
    this.empty.clear();
    this.result = null;
    this.lastWinner = null;
    if (this.order.every((id) => this.ticketsOf(id) === 0)) this.discard(true);
  }

  // ───────────────────────────── Guichet ─────────────────────────────

  /** Une mise secrète : un lot, au moins un ticket, et la façon de poser ses cubes si on l'emporte. */
  bid(id: string, lot: unknown, amount: unknown, plan: unknown): string | undefined {
    if (this.stage !== 'bid' || !this.lots) return "Le guichet n'est pas ouvert.";
    if (this.turn !== id) return "Ce n'est pas ton tour au guichet.";
    if (lot !== 'A' && lot !== 'B') return 'Choisis le lot A ou le lot B.';
    const have = this.ticketsOf(id);
    if (have <= 0) return "Tu n'as plus de tickets.";
    if (!Number.isInteger(amount) || (amount as number) < 1) return 'Mise au moins un ticket.';
    if ((amount as number) > have) return `Tu n'as que ${have} ticket${have > 1 ? 's' : ''}.`;
    const placed = applyPlan(this.board, this.lots[lot], plan);
    if (typeof placed === 'string') return placed;
    this.bids.set(id, { lot, amount: amount as number, plan: (plan as { t: number; col: number }[]).map((d) => ({ t: d.t, col: d.col })) });
    this.tickets.set(id, have - (amount as number));
    this.turnIdx++;
    if (this.turnIdx >= this.turnOrder.length) this.resolve();
    return undefined;
  }

  /** Passer au guichet sans tickets : il faut tout de même y entrer, pour que personne ne le remarque. */
  passEmpty(id: string): string | undefined {
    if (this.stage !== 'bid') return "Le guichet n'est pas ouvert.";
    if (this.turn !== id) return "Ce n'est pas ton tour au guichet.";
    if (this.ticketsOf(id) > 0) return 'Tu as encore des tickets : il faut miser.';
    this.empty.add(id);
    this.turnIdx++;
    if (this.turnIdx >= this.turnOrder.length) this.resolve();
    return undefined;
  }

  totals(): Record<Lot, number> {
    const t: Record<Lot, number> = { A: 0, B: 0 };
    for (const b of this.bids.values()) t[b.lot] += b.amount;
    return t;
  }

  /** Le lot le moins cher est adjugé à son plus gros enchérisseur ; égalité ou lot sans preneur : tout est annulé. */
  private resolve(): void {
    const totals = this.totals();
    let winner: string | null = null;
    let lot: Lot | null = null;
    if (totals.A !== totals.B) {
      lot = totals.A < totals.B ? 'A' : 'B';
      const top = Math.max(0, ...[...this.bids.values()].filter((b) => b.lot === lot).map((b) => b.amount));
      const leaders = [...this.bids].filter(([, b]) => b.lot === lot && b.amount === top);
      if (top > 0 && leaders.length === 1) winner = leaders[0][0];
    }
    const record = (kind: RevealAttempt['kind']) =>
      this.history.push({
        round: this.round,
        attempt: this.attempt,
        kind,
        lot: kind === 'won' ? lot : null,
        winner,
        totals,
        bids: this.turnOrder.filter((id) => this.bids.has(id)).map((id) => ({ id, lot: this.bids.get(id)!.lot, amount: this.bids.get(id)!.amount })),
      });
    if (!winner || !lot) {
      // Annulée : chacun récupère sa mise.
      for (const [id, b] of this.bids) this.tickets.set(id, this.ticketsOf(id) + b.amount);
      const last = this.attempt + 1 >= MAX_VOIDS;
      record(last ? 'discarded' : 'void');
      this.stage = 'result';
      this.result = { round: this.round, attempt: this.attempt, kind: last ? 'discarded' : 'void', lot: null, total: null, placed: [], broke: false };
      return;
    }
    const plan = this.bids.get(winner)!.plan;
    const out = applyPlan(this.board, this.lots![lot], plan);
    if (typeof out === 'string') throw new Error(`Plan invalide au moment de poser : ${out}`);
    this.board = out.board;
    record('won');
    this.lastWinner = winner;
    const total = totals.A + totals.B;
    this.totalsHeard.push(total);
    this.stage = 'result';
    this.result = { round: this.round, attempt: this.attempt, kind: 'won', lot, total, placed: out.placed, broke: false };
  }

  /** Plus personne n'a de tickets : les lots partent sans enchère. */
  private discard(broke: boolean): void {
    this.history.push({ round: this.round, attempt: this.attempt, kind: 'discarded', lot: null, winner: null, totals: { A: 0, B: 0 }, bids: [] });
    this.stage = 'result';
    this.result = { round: this.round, attempt: this.attempt, kind: 'discarded', lot: null, total: null, placed: [], broke };
  }

  /** Après le résultat : on remise sur les mêmes lots, ou la manche suivante tire deux nouveaux lots, ou la partie s'arrête. */
  next(): void {
    if (this.stage !== 'result' || !this.result) return;
    if (this.result.kind === 'void') {
      this.attempt++;
      this.openBidding();
      return;
    }
    if (this.round >= this.rounds) {
      this.stage = 'over';
      return;
    }
    this.round++;
    this.attempt = 0;
    this.drawLots();
    this.openBidding();
  }

  // ───────────────────────────── Fin ─────────────────────────────

  scoreOf(id: string): ReturnType<typeof scoreOf> {
    return scoreOf(this.board, this.cards.get(id) ?? [], this.conditions.get(id) ?? CONDITIONS[0]);
  }

  /** Le classement : les points, rien d'autre ; à égalité, la place est partagée. */
  standings(): Standing[] {
    const rows = this.order.map((id) => {
      const s = this.scoreOf(id);
      return {
        id,
        cards: [...(this.cards.get(id) ?? [])],
        shown: this.shown.get(id) ?? 0,
        condition: this.conditions.get(id)!,
        conditionMet: s.met,
        lines: s.lines,
        points: s.points,
        tickets: this.ticketsOf(id),
        place: 0,
      };
    });
    rows.sort((a, b) => b.points - a.points);
    rows.forEach((r, i) => {
      r.place = i > 0 && rows[i - 1].points === r.points ? rows[i - 1].place : i + 1;
    });
    return rows;
  }
}

