// Contrat partagé entre le serveur et le client : animaux, plateau, enchères, vues de table, réglages et constantes.

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

/** Les cinq animaux du zoo, dans l'ordre des cartes de l'émission. */
export const ANIMALS = ['serpent', 'perroquet', 'elephant', 'lion', 'singe'] as const;
export type Animal = (typeof ANIMALS)[number];

/** Le plateau : 5 colonnes de 5 cases ; les cubes tombent tout en bas de leur colonne. */
export const SIZE = 5;
export const CELLS = SIZE * SIZE;
export const ROUNDS = 5;
/** Chaque lot compte quatre cubes, tirés de sa caisse. */
export const LOT_SIZE = 4;
/** Chaque caisse contient quatre cubes de chaque animal. */
export const PER_ANIMAL_IN_CRATE = 4;
/** Les cartes animaux : six de chaque. */
export const CARDS_PER_ANIMAL = 6;
export const START_TICKETS = 30;
/** Au-delà de trois enchères annulées de suite, les deux lots sont écartés. */
export const MAX_VOIDS = 3;

/** Les dix conditions de l'émission : « plus de [0] que de [1] sur le plateau ». */
export const CONDITIONS: readonly (readonly [Animal, Animal])[] = [
  ['lion', 'serpent'],
  ['serpent', 'elephant'],
  ['lion', 'singe'],
  ['serpent', 'singe'],
  ['perroquet', 'lion'],
  ['elephant', 'perroquet'],
  ['elephant', 'serpent'],
  ['singe', 'serpent'],
  ['perroquet', 'elephant'],
  ['singe', 'lion'],
];
export type Condition = readonly [Animal, Animal];

export type Lot = 'A' | 'B';
export const LOTS: readonly Lot[] = ['A', 'B'];

/** Une case du plateau ; l'indice vaut ligne × 5 + colonne, la ligne 0 étant en bas. */
export type Board = (Animal | null)[];

/** Un cube lâché : le rang du cube dans son lot (0 à 3) et la colonne où il tombe (0 à 4). */
export interface Drop {
  t: number;
  col: number;
}

/** Le temps laissé à chacun pour miser, en secondes ; 0 : sans limite. */
export const TIMERS = [45, 90, 0] as const;
export type TimerSetting = (typeof TIMERS)[number];
/** Le temps pour composer sa suite au début de la partie, en secondes (sauf « sans limite »). */
export const SETUP_SECONDS = 90;

export const AVATARS = ['girafe', 'zebre', 'manchot', 'flamant', 'tortue', 'hippo', 'panda', 'kangourou', 'herisson', 'phoque', 'koala', 'rhino'] as const;
export const EMOTES = ['🐾', '😏', '🤝', '😱', '🙈', '🔥'] as const;
export const TAUNTS = ['Je prends A', 'Je prends B', 'On s’allie ?', 'Fais-moi confiance', 'Menteur !', 'Bien joué'] as const;

export type PlayerStatus = 'lobby' | 'playing' | 'spectator';

export interface Settings {
  timer: TimerSetting;
}

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  autopilot: boolean;
  status: PlayerStatus;
  /** Parties gagnées à cette table. */
  wins: number;
  /** Sa place autour de la table (1 à 8), null hors partie. */
  seat: number | null;
  /** L'animal qu'il a montré à tout le monde (une de ses trois cartes), null avant. */
  shown: Animal | null;
  /** Pendant la composition : sa suite est prête. */
  ready: boolean;
  /** Pendant une enchère : il est déjà passé au guichet. Rien de plus : ni le lot, ni la somme. */
  hasBid: boolean;
}

/**
 * setup : chacun range ses trois cartes en suite et choisit celle qu'il montre.
 * bid : chacun passe au guichet à son tour, et mise en secret sur un lot.
 * result : le lot le moins cher est adjugé, ou l'enchère est annulée.
 * over : la dernière manche est jouée.
 */
export type Stage = 'setup' | 'bid' | 'result' | 'over';

/** won : le lot le moins cher a un seul plus gros enchérisseur. void : égalité, ou lot sans preneur, tickets rendus. discarded : trop d'annulations, les lots sont écartés. */
export type ResultKind = 'won' | 'void' | 'discarded';

/** Un cube posé : l'animal, sa colonne, sa ligne (0 en bas). */
export interface Placed {
  animal: Animal;
  col: number;
  row: number;
}

export interface ResultView {
  round: number;
  attempt: number;
  kind: ResultKind;
  /** Le lot adjugé. */
  lot: Lot | null;
  /** Tous les tickets misés sur les deux lots (seulement si le lot est adjugé). */
  total: number | null;
  /** Les cubes posés, dans l'ordre de chute. */
  placed: Placed[];
  /** Lots écartés parce que plus personne n'avait de tickets. */
  broke: boolean;
}

/** Mon passage au guichet pour l'enchère en cours. */
export interface MyBid {
  lot: Lot;
  amount: number;
  plan: Drop[];
}

/** Ce que je sais de moi-même : mes cartes, ma condition, mes tickets. Les autres n'en voient rien. */
export interface MeView {
  /** Mes trois animaux, dans l'ordre de ma suite (ou l'ordre de tirage avant validation). */
  cards: Animal[];
  /** Le rang de la carte que je montre. */
  shown: number;
  condition: Condition;
  tickets: number;
  ready: boolean;
  /** Ma mise pour l'enchère en cours. */
  bid: MyBid | null;
  /** C'est moi qui ai remporté le lot qui vient d'être posé (connu de moi seul). */
  won: boolean;
}

export interface GameView {
  /** Les places autour de la table. */
  order: string[];
  /** L'ordre de passage au guichet pour cette manche (il s'inverse d'une manche à l'autre). */
  turnOrder: string[];
  stage: Stage;
  /** Manche en cours, de 1 à 5 (0 pendant la composition). */
  round: number;
  rounds: number;
  /** Enchères annulées dans cette manche. */
  attempt: number;
  board: Board;
  lots: Record<Lot, Animal[]> | null;
  /** Celui qui est au guichet. */
  turn: string | null;
  /** Heure du serveur : fin de la composition, du tour au guichet ou du résultat (0 : pas de limite). */
  endsAt: number;
  /** Le résultat de l'enchère qui vient de se jouer (pendant result et over). */
  result: ResultView | null;
  me: MeView | null;
  /** Numéro de l'état, tiré de ce qui est public : un geste envoyé pour un état passé est ignoré. */
  seq: number;
}

/** Le grand dévoilement : chaque passage au guichet. */
export interface RevealAttempt {
  round: number;
  attempt: number;
  kind: ResultKind;
  lot: Lot | null;
  winner: string | null;
  totals: Record<Lot, number>;
  bids: { id: string; lot: Lot; amount: number }[];
}

export interface FinalPlayer {
  id: string;
  name: string;
  avatar: string;
  seat: number;
  cards: Animal[];
  shown: number;
  condition: Condition;
  conditionMet: boolean;
  /** Les suites réussies, chacune par ses trois cases (indices du plateau). */
  lines: number[][];
  points: number;
  tickets: number;
  place: number;
  wins: number;
  winner: boolean;
}

export interface FinalView {
  board: Board;
  players: FinalPlayer[];
  history: RevealAttempt[];
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  me: string;
  hostId: string;
  settings: Settings;
  players: PlayerView[];
  game: GameView | null;
  final: FinalView | null;
  serverNow: number;
}

export type Ack<T = unknown> = (res: { ok: boolean; error?: string; data?: T }) => void;

export function isTimer(x: unknown): x is TimerSetting {
  return typeof x === 'number' && (TIMERS as readonly number[]).includes(x);
}

export function isLot(x: unknown): x is Lot {
  return x === 'A' || x === 'B';
}

export function isAnimal(x: unknown): x is Animal {
  return typeof x === 'string' && (ANIMALS as readonly string[]).includes(x);
}

// ───────────────────────────── Plateau ─────────────────────────────

export const cellIndex = (col: number, row: number): number => row * SIZE + col;

/** La ligne où tomberait un cube lâché dans cette colonne, ou -1 si elle est pleine. */
export function landingRow(board: Board, col: number): number {
  for (let row = 0; row < SIZE; row++) if (!board[cellIndex(col, row)]) return row;
  return -1;
}

/**
 * Lâche les cubes d'un lot selon un plan ; renvoie le nouveau plateau et les cubes posés,
 * ou un message si le plan n'est pas valable (cube oublié ou répété, colonne pleine).
 */
export function applyPlan(board: Board, lot: Animal[], plan: unknown): { board: Board; placed: Placed[] } | string {
  if (!Array.isArray(plan) || plan.length !== lot.length) return 'Place les quatre cubes du lot.';
  const next = [...board];
  const placed: Placed[] = [];
  const used = new Set<number>();
  for (const d of plan as unknown[]) {
    const t = (d as Drop)?.t;
    const col = (d as Drop)?.col;
    if (!Number.isInteger(t) || t < 0 || t >= lot.length || used.has(t)) return 'Chaque cube du lot se pose une fois.';
    if (!Number.isInteger(col) || col < 0 || col >= SIZE) return 'Colonne inconnue.';
    used.add(t);
    const row = landingRow(next, col);
    if (row < 0) return 'Cette colonne est pleine.';
    next[cellIndex(col, row)] = lot[t];
    placed.push({ animal: lot[t], col, row });
  }
  return { board: next, placed };
}

/** Les 48 alignements de trois cases : lignes, colonnes et les deux diagonales. */
export const WINDOWS: readonly (readonly [number, number, number])[] = (() => {
  const out: [number, number, number][] = [];
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (let row = 0; row < SIZE; row++)
    for (let col = 0; col < SIZE; col++)
      for (const [dc, dr] of dirs) {
        const c2 = col + 2 * dc;
        const r2 = row + 2 * dr;
        if (c2 < 0 || c2 >= SIZE || r2 < 0 || r2 >= SIZE) continue;
        out.push([cellIndex(col, row), cellIndex(col + dc, row + dr), cellIndex(c2, r2)]);
      }
  return out;
})();

/** Les alignements où l'on lit la suite, dans un sens ou dans l'autre (une suite symétrique ne compte qu'une fois). */
export function suiteLines(board: Board, suite: readonly Animal[]): number[][] {
  const lines: number[][] = [];
  for (const w of WINDOWS) {
    const a = board[w[0]];
    const b = board[w[1]];
    const c = board[w[2]];
    if (!a || !b || !c) continue;
    const forward = a === suite[0] && b === suite[1] && c === suite[2];
    const backward = c === suite[0] && b === suite[1] && a === suite[2];
    if (forward || backward) lines.push([...w]);
  }
  return lines;
}

export function countAnimal(board: Board, animal: Animal): number {
  let n = 0;
  for (const c of board) if (c === animal) n++;
  return n;
}

export function conditionMet(board: Board, cond: Condition): boolean {
  return countAnimal(board, cond[0]) > countAnimal(board, cond[1]);
}

/** Les points : une suite réussie vaut 1, et la condition remplie double le tout. */
export function scoreOf(board: Board, suite: readonly Animal[], cond: Condition): { lines: number[][]; met: boolean; points: number } {
  const lines = suiteLines(board, suite);
  const met = conditionMet(board, cond);
  return { lines, met, points: lines.length * (met ? 2 : 1) };
}

export function emptyBoard(): Board {
  return Array.from({ length: CELLS }, () => null);
}
