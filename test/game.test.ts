// Tests du moteur : tirage, suites, chute des cubes, alignements, condition, guichet, lot le moins cher,
// annulations, lots écartés, ordre de passage, classement, et les bots.
import { describe, expect, it } from 'vitest';
import {
  ANIMALS,
  CONDITIONS,
  START_TICKETS,
  WINDOWS,
  applyPlan,
  cellIndex,
  emptyBoard,
  scoreOf,
  suiteLines,
  type Animal,
  type Board,
  type Drop,
  type Lot,
} from '../shared/protocol';
import { botBid, botSuite, evaluate, randomBid, type BotSeen } from '../server/bots';
import { Game } from '../server/game';
import { seeded } from './rng';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const STRAIGHT: Drop[] = [
  { t: 0, col: 0 },
  { t: 1, col: 1 },
  { t: 2, col: 2 },
  { t: 3, col: 3 },
];

/** Une partie prête à miser, composition faite. */
function started(n = 4, seed = 1): Game {
  const g = new Game(ids(n), seeded(seed));
  for (const id of g.order) g.setSuite(id, [0, 1, 2], 0);
  g.startRounds();
  return g;
}

/** Tout le monde passe au guichet, dans l'ordre de la manche. */
function attempt(g: Game, bids: Record<string, [Lot, number, Drop[]?]>): void {
  for (const id of [...g.turnOrder]) {
    const b = bids[id];
    const err = b ? g.bid(id, b[0], b[1], b[2] ?? STRAIGHT) : g.passEmpty(id);
    expect(err).toBeUndefined();
  }
}

function boardOf(rows: Record<number, string>): Board {
  // rows[0] est la ligne du bas ; une lettre par colonne : s p e l m, ou « . ».
  const map: Record<string, Animal> = { s: 'serpent', p: 'perroquet', e: 'elephant', l: 'lion', m: 'singe' };
  const b = emptyBoard();
  for (const [r, line] of Object.entries(rows)) [...line].forEach((ch, c) => (b[cellIndex(c, Number(r))] = map[ch] ?? null));
  return b;
}

describe('le tirage', () => {
  it('donne trois cartes, une condition différente et 30 tickets à chacun, et remplit deux caisses de 20 cubes', () => {
    const g = new Game(ids(8), seeded(3));
    const conds = new Set<string>();
    const counts = Object.fromEntries(ANIMALS.map((a) => [a, 0]));
    for (const id of g.order) {
      expect(g.cards.get(id)).toHaveLength(3);
      for (const a of g.cards.get(id)!) counts[a]++;
      conds.add(g.conditions.get(id)!.join('>'));
      expect(g.ticketsOf(id)).toBe(START_TICKETS);
    }
    expect(conds.size).toBe(8);
    for (const a of ANIMALS) expect(counts[a]).toBeLessThanOrEqual(6);
    for (const lot of ['A', 'B'] as Lot[]) {
      expect(g.crates[lot]).toHaveLength(20);
      for (const a of ANIMALS) expect(g.crates[lot].filter((x) => x === a)).toHaveLength(4);
    }
  });
  it('reprend les dix conditions de l’émission, toutes différentes', () => {
    expect(new Set(CONDITIONS.map((c) => c.join('>'))).size).toBe(10);
    expect(CONDITIONS.every(([a, b]) => a !== b)).toBe(true);
  });
});

describe('la composition', () => {
  it('range les cartes dans l’ordre choisi et retient celle qu’on montre', () => {
    const g = new Game(ids(3), seeded(5));
    const dealt = [...g.cards.get('p0')!];
    expect(g.setSuite('p0', [2, 0, 1], 1)).toBeUndefined();
    expect(g.cards.get('p0')).toEqual([dealt[2], dealt[0], dealt[1]]);
    expect(g.shown.get('p0')).toBe(1);
    expect(g.ready.has('p0')).toBe(true);
  });
  it('refuse un ordre qui n’est pas une permutation, ou une carte montrée qui n’existe pas', () => {
    const g = new Game(ids(3), seeded(5));
    expect(g.setSuite('p0', [0, 0, 1], 0)).toBeTruthy();
    expect(g.setSuite('p0', [0, 1], 0)).toBeTruthy();
    expect(g.setSuite('p0', [0, 1, 2], 3)).toBeTruthy();
    expect(g.setSuite('p0', [0, 1, 2], 0)).toBeUndefined();
    expect(g.setSuite('p0', [0, 1, 2], 0)).toBeTruthy();
  });
});

describe('les cubes', () => {
  it('tombent tout en bas de leur colonne, dans l’ordre du plan', () => {
    const lot: Animal[] = ['lion', 'singe', 'serpent', 'lion'];
    const out = applyPlan(emptyBoard(), lot, [
      { t: 2, col: 4 },
      { t: 0, col: 4 },
      { t: 1, col: 0 },
      { t: 3, col: 4 },
    ]);
    if (typeof out === 'string') throw new Error(out);
    expect(out.board[cellIndex(4, 0)]).toBe('serpent');
    expect(out.board[cellIndex(4, 1)]).toBe('lion');
    expect(out.board[cellIndex(4, 2)]).toBe('lion');
    expect(out.board[cellIndex(0, 0)]).toBe('singe');
    expect(out.placed.map((p) => p.row)).toEqual([0, 1, 0, 2]);
  });
  it('refusent une colonne pleine, un cube oublié ou posé deux fois', () => {
    const full = boardOf({ 0: 'l....', 1: 'l....', 2: 'l....', 3: 'l....', 4: 'l....' });
    const lot: Animal[] = ['lion', 'singe', 'serpent', 'lion'];
    expect(typeof applyPlan(full, lot, [{ t: 0, col: 0 }, { t: 1, col: 1 }, { t: 2, col: 2 }, { t: 3, col: 3 }])).toBe('string');
    expect(typeof applyPlan(emptyBoard(), lot, [{ t: 0, col: 0 }, { t: 0, col: 1 }, { t: 2, col: 2 }, { t: 3, col: 3 }])).toBe('string');
    expect(typeof applyPlan(emptyBoard(), lot, STRAIGHT.slice(0, 3))).toBe('string');
    expect(typeof applyPlan(emptyBoard(), lot, STRAIGHT)).toBe('object');
  });
});

describe('les suites', () => {
  it('comptent 48 alignements possibles sur un plateau de 5 × 5', () => {
    expect(WINDOWS).toHaveLength(48);
  });
  it('se lisent en ligne, en colonne et en diagonale, dans les deux sens', () => {
    const suite: Animal[] = ['lion', 'singe', 'serpent'];
    expect(suiteLines(boardOf({ 0: 'lms..' }), suite)).toHaveLength(1);
    expect(suiteLines(boardOf({ 0: '..sml' }), suite)).toHaveLength(1);
    expect(suiteLines(boardOf({ 0: 'l....', 1: 'm....', 2: 's....' }), suite)).toHaveLength(1);
    expect(suiteLines(boardOf({ 0: 'l....', 1: '.m...', 2: '..s..' }), suite)).toHaveLength(1);
    expect(suiteLines(boardOf({ 0: '..s..', 1: '.m...', 2: 'l....' }), suite)).toHaveLength(1);
    expect(suiteLines(boardOf({ 0: 'lsm..' }), suite)).toHaveLength(0);
  });
  it('comptent une fois chaque alignement, même pour une suite symétrique, et plusieurs fois sur une longue rangée', () => {
    expect(suiteLines(boardOf({ 0: 'lml..' }), ['lion', 'singe', 'lion'])).toHaveLength(1);
    expect(suiteLines(boardOf({ 0: 'lmlml' }), ['lion', 'singe', 'lion'])).toHaveLength(2);
    expect(suiteLines(boardOf({ 0: 'lllll' }), ['lion', 'lion', 'lion'])).toHaveLength(3);
  });
  it('doublent les points quand la condition est remplie, et seulement si elle l’est strictement', () => {
    const suite: Animal[] = ['lion', 'singe', 'serpent'];
    const b = boardOf({ 0: 'lms.l', 1: 'lms..' });
    expect(scoreOf(b, suite, ['lion', 'serpent'])).toMatchObject({ met: true, points: 4 });
    expect(scoreOf(b, suite, ['serpent', 'singe'])).toMatchObject({ met: false, points: 2 });
    expect(scoreOf(boardOf({ 0: 'lms..' }), suite, ['lion', 'serpent']).met).toBe(false);
  });
});

describe('le guichet', () => {
  it('passe dans l’ordre inverse à la première manche, puis à l’endroit, puis de nouveau à l’envers', () => {
    const g = started(4);
    expect(g.turnOrder).toEqual(['p3', 'p2', 'p1', 'p0']);
    attempt(g, { p0: ['A', 5], p1: ['B', 1], p2: ['B', 2], p3: ['A', 1] });
    g.next();
    expect(g.round).toBe(2);
    expect(g.turnOrder).toEqual(['p0', 'p1', 'p2', 'p3']);
  });
  it('refuse une mise hors de son tour, sans ticket, ou au-delà de ce qu’on a', () => {
    const g = started(3);
    expect(g.bid('p0', 'A', 3, STRAIGHT)).toBeTruthy();
    expect(g.bid('p2', 'A', 0, STRAIGHT)).toBeTruthy();
    expect(g.bid('p2', 'C', 3, STRAIGHT)).toBeTruthy();
    expect(g.bid('p2', 'A', 31, STRAIGHT)).toBeTruthy();
    expect(g.bid('p2', 'A', 30, STRAIGHT)).toBeUndefined();
    expect(g.ticketsOf('p2')).toBe(0);
  });
  it('adjuge le lot le moins cher à son plus gros enchérisseur, et chacun paie sa mise, gagnant ou non', () => {
    const g = started(4);
    const lotB = [...g.lots!.B];
    attempt(g, { p0: ['A', 9], p1: ['B', 4], p2: ['B', 2], p3: ['A', 1] });
    expect(g.result).toMatchObject({ kind: 'won', lot: 'B', total: 16 });
    expect(g.lastWinner).toBe('p1');
    expect(g.board[cellIndex(0, 0)]).toBe(lotB[0]);
    expect(g.board.filter(Boolean)).toHaveLength(4);
    expect([0, 1, 2, 3].map((i) => g.ticketsOf(`p${i}`))).toEqual([21, 26, 28, 29]);
    expect(g.totalsHeard).toEqual([16]);
  });
  it('pose le lot selon le plan du gagnant', () => {
    const g = started(3);
    const lot = [...g.lots!.A];
    const plan: Drop[] = [
      { t: 3, col: 2 },
      { t: 2, col: 2 },
      { t: 1, col: 2 },
      { t: 0, col: 4 },
    ];
    attempt(g, { p0: ['B', 6], p1: ['A', 3, plan], p2: ['A', 1] });
    expect(g.lastWinner).toBe('p1');
    expect([0, 1, 2].map((r) => g.board[cellIndex(2, r)])).toEqual([lot[3], lot[2], lot[1]]);
    expect(g.board[cellIndex(4, 0)]).toBe(lot[0]);
  });
});

describe('les annulations', () => {
  it('annulent l’enchère à égalité des totaux, rendent tout et remisent sur les mêmes lots, dans le même ordre', () => {
    const g = started(4);
    const lots = { A: [...g.lots!.A], B: [...g.lots!.B] };
    attempt(g, { p0: ['A', 3], p1: ['B', 2], p2: ['B', 2], p3: ['A', 1] });
    expect(g.result?.kind).toBe('void');
    for (const id of g.order) expect(g.ticketsOf(id)).toBe(30);
    expect(g.board.filter(Boolean)).toHaveLength(0);
    g.next();
    expect(g.stage).toBe('bid');
    expect(g.round).toBe(1);
    expect(g.attempt).toBe(1);
    expect(g.lots).toEqual(lots);
    expect(g.turnOrder).toEqual(['p3', 'p2', 'p1', 'p0']);
  });
  it('annulent l’enchère quand le lot le moins cher a deux plus gros enchérisseurs', () => {
    const g = started(4);
    attempt(g, { p0: ['A', 9], p1: ['B', 3], p2: ['B', 3], p3: ['A', 1] });
    expect(g.result?.kind).toBe('void');
  });
  it('annulent l’enchère quand personne n’a misé sur le lot le moins cher', () => {
    const g = started(3);
    attempt(g, { p0: ['A', 2], p1: ['A', 1], p2: ['A', 4] });
    expect(g.result?.kind).toBe('void');
    expect(g.ticketsOf('p2')).toBe(30);
  });
  it('écartent les deux lots à la troisième annulation, et la manche suivante tire deux nouveaux lots', () => {
    const g = started(3);
    for (let i = 0; i < 3; i++) {
      attempt(g, { p0: ['A', 2], p1: ['A', 1], p2: ['A', 4] });
      expect(g.result?.kind).toBe(i < 2 ? 'void' : 'discarded');
      g.next();
    }
    expect(g.round).toBe(2);
    expect(g.attempt).toBe(0);
    expect(g.crates.A).toHaveLength(12);
    expect(g.board.filter(Boolean)).toHaveLength(0);
  });
  it('écartent les lots d’office quand plus personne n’a de tickets', () => {
    const g = started(3);
    attempt(g, { p0: ['A', 30], p1: ['B', 30], p2: ['B', 30] });
    expect(g.result).toMatchObject({ kind: 'won', lot: 'A' });
    g.next();
    expect(g.round).toBe(2);
    expect(g.result).toMatchObject({ kind: 'discarded', broke: true });
    expect(g.stage).toBe('result');
  });
});

describe('le guichet sans tickets', () => {
  it('fait passer son tour à qui n’a plus rien, et refuse de le faire passer s’il lui en reste', () => {
    const g = started(3);
    attempt(g, { p0: ['B', 5], p1: ['A', 2], p2: ['A', 30] });
    g.next();
    expect(g.ticketsOf('p2')).toBe(0);
    expect(g.passEmpty('p0')).toBeTruthy();
    expect(g.bid('p0', 'A', 1, STRAIGHT)).toBeUndefined();
    expect(g.passEmpty('p1')).toBeTruthy();
    expect(g.bid('p1', 'B', 1, STRAIGHT)).toBeUndefined();
    expect(g.passEmpty('p2')).toBeUndefined();
    expect(g.empty.has('p2')).toBe(true);
    expect(g.stage).toBe('result');
  });
});

describe('le classement', () => {
  it('classe aux points et partage la place à égalité', () => {
    const g = started(3);
    g.board = boardOf({ 0: 'lms..' });
    g.cards.set('p0', ['lion', 'singe', 'serpent']);
    g.cards.set('p1', ['serpent', 'singe', 'lion']);
    g.cards.set('p2', ['perroquet', 'perroquet', 'perroquet']);
    g.conditions.set('p0', ['lion', 'elephant']);
    g.conditions.set('p1', ['elephant', 'lion']);
    g.conditions.set('p2', ['perroquet', 'singe']);
    const rows = g.standings();
    expect(rows.map((r) => [r.id, r.points, r.place])).toEqual([
      ['p0', 2, 1],
      ['p1', 1, 2],
      ['p2', 0, 3],
    ]);
    g.conditions.set('p1', ['serpent', 'elephant']);
    expect(g.standings().filter((r) => r.place === 1).map((r) => r.id).sort()).toEqual(['p0', 'p1']);
  });
});

describe('les bots', () => {
  const seen = (g: Game, id: string): BotSeen => ({
    board: g.board,
    lots: g.lots!,
    cards: g.cards.get(id)!,
    condition: g.conditions.get(id)!,
    tickets: g.ticketsOf(id),
    round: g.round,
    rounds: g.rounds,
    players: g.order.length,
    totalsHeard: g.totalsHeard,
  });

  it('préfèrent un plateau où leur suite est faite, et plus encore avec la condition', () => {
    const suite: Animal[] = ['lion', 'singe', 'serpent'];
    const empty = evaluate(emptyBoard(), suite, ['lion', 'elephant'], 12);
    const done = evaluate(boardOf({ 0: 'lms..' }), suite, ['lion', 'elephant'], 12);
    const doneAndCond = evaluate(boardOf({ 0: 'lms..', 1: 'l....' }), suite, ['lion', 'elephant'], 12);
    expect(done).toBeGreaterThan(empty + 0.5);
    expect(doneAndCond).toBeGreaterThan(done);
  });
  it('rangent leurs cartes en une permutation, et montrent une carte', () => {
    const s = botSuite(() => 0.7);
    expect([...s.order].sort()).toEqual([0, 1, 2]);
    expect(s.shown).toBeGreaterThanOrEqual(0);
  });
  it('misent toujours un coup valable, et vident presque toujours leur bourse à la dernière manche', () => {
    // Les tickets ne valent rien à la fin : un bot réfléchi mise tout, sauf quand aucun lot ne le sert.
    const allIn = { novice: [0, 0], habile: [0, 0], retors: [0, 0] };
    for (let seed = 1; seed <= 90; seed++) {
      const rand = seeded(seed + 100);
      const g = new Game(ids(5), seeded(seed));
      for (const id of g.order) {
        const s = botSuite(() => rand(1000) / 1000);
        g.setSuite(id, s.order, s.shown);
      }
      g.startRounds();
      let guard = 0;
      while (g.stage !== 'over' && guard++ < 200) {
        if (g.stage === 'result') {
          g.next();
          continue;
        }
        const id = g.turn!;
        if (g.ticketsOf(id) === 0) {
          expect(g.passEmpty(id)).toBeUndefined();
          continue;
        }
        const level = (['novice', 'habile', 'retors'] as const)[seed % 3];
        const b = botBid(seen(g, id), level, () => rand(1000) / 1000);
        const last = g.round === g.rounds;
        const before = g.ticketsOf(id);
        expect(g.bid(id, b.lot, b.amount, b.plan)).toBeUndefined();
        expect(b.amount).toBeLessThanOrEqual(before);
        if (last) {
          allIn[level][1]++;
          if (b.amount === before) allIn[level][0]++;
        }
      }
      expect(g.stage).toBe('over');
      expect(g.board.filter(Boolean).length).toBeLessThanOrEqual(20);
    }
    expect(allIn.habile[0] / allIn.habile[1]).toBeGreaterThan(0.7);
    expect(allIn.retors[0] / allIn.retors[1]).toBeGreaterThan(0.7);
  });
  it('le hasard de référence mise aussi des coups valables', () => {
    const g = started(4, 9);
    const rand = seeded(42);
    while (g.stage === 'bid') {
      const id = g.turn!;
      const b = randomBid(seen(g, id), () => rand(1000) / 1000);
      expect(g.bid(id, b.lot, b.amount, b.plan)).toBeUndefined();
    }
  });
});
