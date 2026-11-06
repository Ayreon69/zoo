// Une table de Zoo : salon, partie, passages au guichet chronométrés, bots, pilote automatique et vue de chacun.
// Personne ne voit les mises ni les tickets des autres : un passage au guichet ne change, chez les autres, que le tour.
import crypto from 'node:crypto';
import {
  AVATARS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SETUP_SECONDS,
  isTimer,
  type FinalView,
  type GameView,
  type PlayerStatus,
  type ResultView,
  type RoomView,
  type Settings,
  type Stage,
} from '../shared/protocol';
import { AUTOPILOT, botBid, botSuite, randomSkill, type Skill } from './bots';
import { Game, shuffle } from './game';

const BOT_NAMES = ['Caramel', 'Pistache', 'Noisette', 'Mangue', 'Biscotte', 'Moustache', 'Safari', 'Banane', 'Cacahuète', 'Papaye'];
const MAX_MEMBERS = 16;
/** Délai laissé à un joueur déconnecté avant que le pilote automatique ne prenne le relais. */
const GRACE_MS = 20_000;
/** Mode accéléré pour les tests locaux (ZO_FAST=1). */
const FAST = process.env.ZO_FAST === '1';
const T = {
  setup: FAST ? 1_500 : SETUP_SECONDS * 1000,
  /** Un humain qui a encore des tickets, en mode accéléré : de quoi jouer, pas de quoi traîner. */
  fastTurn: 2_000,
  finish: FAST ? 100 : 2_600,
  /** Un bot ou un absent passe au guichet après un temps de réflexion, comme une main. */
  autoMin: FAST ? 10 : 1_800,
  autoSpread: FAST ? 80 : 4_200,
  /** Sans tickets, on reste un moment au guichet : un passage éclair trahirait qu'on n'a plus rien. */
  emptyMin: FAST ? 10 : 4_000,
  emptySpread: FAST ? 80 : 7_000,
  setupBotMin: FAST ? 10 : 3_000,
  setupBotSpread: FAST ? 100 : 9_000,
};
/** Le rang de chaque étape, pour le numéro d'état public. */
const STAGE_STEP: Record<Stage, number> = { setup: 0, bid: 1, result: 2, over: 3 };

/** Le temps de lire un résultat : les cubes tombent un par un. */
function resultMs(r: ResultView): number {
  if (FAST) return 120;
  if (r.kind === 'won') return 3_000 + r.placed.length * 700;
  return 3_600;
}

export interface Player {
  id: string;
  token: string;
  name: string;
  avatar: string;
  isBot: boolean;
  sockets: Set<string>;
  connected: boolean;
  disconnectedAt: number;
  left: boolean;
  status: PlayerStatus;
}

function uid(): string {
  return crypto.randomBytes(9).toString('base64url');
}

export class Room {
  readonly code: string;
  hostId = '';
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  settings: Settings = { timer: 90 };
  players: Player[] = [];
  game: Game | null = null;
  final: FinalView | null = null;
  wins = new Map<string, number>();
  skills = new Map<string, Skill>();
  /** Fin de la composition, du tour au guichet ou du résultat (heure du serveur) ; 0 : pas de limite. */
  stageEndsAt = 0;
  /** Quand le joueur au guichet agit tout seul (bot, absent, ou sans tickets) ; 0 : on l'attend. */
  private autoAt = 0;
  /** Pendant la composition, quand chaque bot valide sa suite : pas tous à l'instant. */
  private setupAt = new Map<string, number>();
  finishAt = 0;
  lastActive = Date.now();
  onChange: () => void = () => {};
  /** Envoie sa vue à un seul joueur (un refus, par exemple : rien ne change chez les autres). */
  onPrivate: (playerId: string) => void = () => {};
  onEmote: (playerId: string, text: string) => void = () => {};

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string) {
    this.code = code;
  }

  // ───────────────────────────── Membres ─────────────────────────────

  get(id: string | undefined | null): Player | undefined {
    return id ? this.players.find((p) => p.id === id) : undefined;
  }

  findByToken(playerId: unknown, token: unknown): Player | undefined {
    if (typeof playerId !== 'string' || typeof token !== 'string') return undefined;
    const p = this.get(playerId);
    return p && !p.isBot && p.token === token ? p : undefined;
  }

  get seated(): Player[] {
    return this.players.filter((p) => p.status !== 'spectator');
  }

  get humansOnline(): number {
    return this.players.filter((p) => !p.isBot && p.connected).length;
  }

  touch(): void {
    this.lastActive = Date.now();
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  private makePlayer(name: string, avatar: string, isBot: boolean, status: PlayerStatus): Player {
    return {
      id: uid(),
      token: uid() + uid(),
      name: this.uniqueName(name),
      avatar,
      isBot,
      sockets: new Set(),
      connected: isBot,
      disconnectedAt: Date.now(),
      left: false,
      status,
    };
  }

  addHuman(name: string, avatar: string): Player | string {
    if (this.players.length >= MAX_MEMBERS) return 'Cette table est pleine.';
    if (this.phase === 'lobby' && this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const p = this.makePlayer(name, avatar, false, this.phase === 'lobby' ? 'lobby' : 'spectator');
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    return p;
  }

  addBot(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut ajouter des bots.";
    if (this.phase !== 'lobby') return 'On ajoute des bots dans le salon.';
    if (this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const used = new Set(this.players.map((p) => p.name));
    const names = BOT_NAMES.filter((n) => !used.has(n));
    const name = names.length ? names[crypto.randomInt(names.length)] : `Bot ${this.players.length + 1}`;
    const usedAvatars = new Set(this.players.map((p) => p.avatar));
    const free = AVATARS.filter((a) => !usedAvatars.has(a));
    const pool = free.length ? free : AVATARS;
    this.players.push(this.makePlayer(name, pool[crypto.randomInt(pool.length)], true, 'lobby'));
    return undefined;
  }

  kick(by: string, target: string): { sockets: string[] } | string {
    if (by !== this.hostId) return "Seul l'hôte peut retirer un joueur.";
    if (this.phase !== 'lobby') return 'On ne peut retirer un joueur que dans le salon.';
    const p = this.get(target);
    if (!p || p.id === by) return 'Joueur introuvable.';
    this.players = this.players.filter((x) => x.id !== p.id);
    return { sockets: [...p.sockets] };
  }

  leave(id: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.clear();
    p.connected = false;
    p.disconnectedAt = Date.now();
    // En partie, sa place reste à la table : le pilote automatique joue pour lui.
    if (this.phase === 'lobby' || p.status === 'spectator') this.players = this.players.filter((x) => x.id !== id);
    else p.left = true;
    if (this.hostId === id) this.transferHost();
  }

  private transferHost(): void {
    const next = this.players.find((p) => !p.isBot && !p.left && p.connected) ?? this.players.find((p) => !p.isBot && !p.left);
    this.hostId = next?.id ?? '';
  }

  connect(p: Player, socketId: string): void {
    p.sockets.add(socketId);
    p.connected = true;
    p.left = false;
    if (!this.hostId || !this.get(this.hostId) || this.get(this.hostId)?.left) this.hostId = p.id;
  }

  disconnect(id: string | undefined, socketId: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) {
      p.connected = false;
      p.disconnectedAt = Date.now();
    }
  }

  isAuto(p: Player): boolean {
    return p.isBot || p.left || (!p.connected && Date.now() - p.disconnectedAt >= GRACE_MS);
  }

  updateSettings(by: string, payload: Record<string, unknown>): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut changer les réglages.";
    if (this.phase !== 'lobby') return 'Les réglages se changent dans le salon.';
    if (isTimer(payload.timer)) this.settings.timer = payload.timer;
    return undefined;
  }

  // ───────────────────────────── Partie ─────────────────────────────

  start(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut lancer la partie.";
    if (this.phase !== 'lobby') return 'La partie est déjà lancée.';
    const seated = this.seated;
    if (seated.length < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs (ajoute un bot si besoin).`;
    for (const p of seated) p.status = 'playing';
    const order = shuffle(seated.map((p) => p.id));
    const spectators = this.players.filter((p) => p.status === 'spectator');
    this.players = [...order.map((id) => this.get(id)!), ...spectators];
    this.game = new Game(order);
    this.skills.clear();
    for (const p of this.players) if (p.isBot && p.status === 'playing') this.skills.set(p.id, randomSkill());
    this.phase = 'playing';
    this.final = null;
    const now = Date.now();
    this.stageEndsAt = this.settings.timer || FAST ? now + T.setup : 0;
    this.setupAt.clear();
    for (const id of order) this.setupAt.set(id, now + T.setupBotMin + crypto.randomInt(T.setupBotSpread));
    this.autoSetup(now);
    return undefined;
  }

  restart(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut relancer une partie.";
    if (this.phase === 'lobby') return undefined;
    this.clearTimer();
    this.players = this.players.filter((p) => !p.left);
    let seats = 0;
    for (const p of this.players) {
      p.status = seats < MAX_PLAYERS ? 'lobby' : 'spectator';
      if (p.status === 'lobby') seats++;
    }
    this.phase = 'lobby';
    this.game = null;
    this.final = null;
    this.skills.clear();
    this.autoAt = 0;
    this.stageEndsAt = 0;
    return undefined;
  }

  endEarly(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut arrêter la partie.";
    if (this.phase !== 'playing') return undefined;
    return this.restart(by);
  }

  /** Composition : les bots et les absents valident leur suite, chacun à son heure. */
  private autoSetup(now: number): void {
    const g = this.game!;
    if (g.stage !== 'setup') return;
    for (const id of g.order) {
      const p = this.get(id);
      if (!p || g.ready.has(id) || !this.isAuto(p) || (this.setupAt.get(id) ?? 0) > now) continue;
      const s = botSuite();
      g.setSuite(id, s.order, s.shown);
    }
    if (g.allReady) this.beginRounds();
  }

  /** Ranger sa suite et choisir la carte montrée. */
  setSuite(by: string, payload: Record<string, unknown>): string | undefined {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return "Aucune partie n'est en cours.";
    if (!g.has(by)) return 'Tu regardes la partie : tu joueras à la prochaine.';
    const err = g.setSuite(by, payload.order, payload.shown);
    if (err) return err;
    if (g.allReady) this.beginRounds();
    return undefined;
  }

  private beginRounds(): void {
    const g = this.game!;
    g.startRounds();
    this.enterTurn();
  }

  /** Un nouveau passage au guichet, ou le résultat si tout le monde est passé. */
  private enterTurn(): void {
    const g = this.game!;
    if (g.stage === 'result') {
      this.enterResult();
      return;
    }
    if (g.stage !== 'bid') return;
    const id = g.turn!;
    const p = this.get(id);
    const now = Date.now();
    const empty = g.ticketsOf(id) === 0;
    // Le même sablier pour tout le monde : un tour sans limite affichée trahirait un joueur sans tickets.
    this.stageEndsAt = this.turnDeadline(now);
    this.autoAt = 0;
    if (empty) this.autoAt = now + T.emptyMin + crypto.randomInt(T.emptySpread);
    else if (!p || this.isAuto(p)) this.autoAt = now + T.autoMin + crypto.randomInt(T.autoSpread);
    if (g.turnIdx === 0 && g.attempt === 0) this.botChatter();
  }

  private turnDeadline(now: number): number {
    if (FAST) return now + T.fastTurn;
    return this.settings.timer ? now + this.settings.timer * 1000 : 0;
  }

  /** Mise d'un humain au guichet. */
  bid(by: string, payload: Record<string, unknown>): string | undefined {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return "Aucune partie n'est en cours.";
    if (!g.has(by)) return 'Tu regardes la partie : tu joueras à la prochaine.';
    if (payload.round !== g.round || payload.attempt !== g.attempt) return 'Cette enchère est déjà passée.';
    const err = g.bid(by, payload.lot, payload.amount, payload.plan);
    if (err) return err;
    this.enterTurn();
    return undefined;
  }

  /** Le joueur au guichet agit tout seul : bot, absent, ou sans tickets ; ou le temps d'un humain est écoulé. */
  private autoAct(): void {
    const g = this.game!;
    const id = g.turn;
    if (!id) return;
    if (g.ticketsOf(id) === 0) g.passEmpty(id);
    else {
      const p = this.get(id);
      const skill = (p?.isBot && this.skills.get(id)) || AUTOPILOT;
      const choice = botBid(
        {
          board: g.board,
          lots: g.lots!,
          cards: g.cards.get(id)!,
          condition: g.conditions.get(id)!,
          tickets: g.ticketsOf(id),
          round: g.round,
          rounds: g.rounds,
          players: g.order.length,
          totalsHeard: g.totalsHeard,
          shownOthers: g.order.filter((x) => x !== id).map((x) => g.cards.get(x)![g.shown.get(x)!]),
        },
        skill,
      );
      const err = g.bid(id, choice.lot, choice.amount, choice.plan);
      if (err) throw new Error(`Mise automatique refusée : ${err}`);
    }
    this.enterTurn();
  }

  private enterResult(): void {
    const g = this.game!;
    this.autoAt = 0;
    this.stageEndsAt = Date.now() + resultMs(g.result!);
    this.botReacts();
  }

  private afterResult(): void {
    const g = this.game!;
    g.next();
    if (g.stage === 'over') {
      this.finishAt = Date.now() + T.finish;
      this.stageEndsAt = 0;
      return;
    }
    this.enterTurn();
  }

  /** À l'ouverture d'une manche, un bot annonce parfois le lot qu'il vise : vrai ou faux, on ne le saura pas. */
  private botChatter(): void {
    if (FAST) return;
    const g = this.game!;
    for (const id of g.order) {
      const p = this.get(id);
      if (!p?.isBot || Math.random() > 0.22) continue;
      const line = pickOne(['Je prends A', 'Je prends B', 'On s’allie ?', 'Fais-moi confiance']);
      setTimeout(() => this.onEmote(id, line), 900 + crypto.randomInt(3_500));
    }
  }

  /** Parfois, un bot réagit au résultat, sans rien trahir : il ne sait pas plus que les autres qui l'a emporté. */
  private botReacts(): void {
    if (FAST) return;
    const g = this.game!;
    const bots = g.order.map((id) => this.get(id)).filter((p): p is Player => !!p?.isBot);
    if (!bots.length || Math.random() > 0.3) return;
    const r = g.result!;
    const pool = r.kind === 'won' ? ['🐾', '😏', '🙈', 'Menteur !', 'Bien joué'] : ['😱', '🙈', 'Menteur !'];
    setTimeout(() => this.onEmote(pickOne(bots).id, pickOne(pool)), 1_500 + crypto.randomInt(1_500));
  }

  private finishGame(): void {
    const g = this.game;
    if (!g) return;
    const rows = g.standings();
    for (const r of rows) if (r.place === 1) this.wins.set(r.id, (this.wins.get(r.id) ?? 0) + 1);
    this.final = {
      board: [...g.board],
      history: g.history.map((h) => ({ ...h, totals: { ...h.totals }, bids: h.bids.map((b) => ({ ...b })) })),
      players: rows.map((r) => {
        const p = this.get(r.id);
        return {
          id: r.id,
          name: p?.name ?? '?',
          avatar: p?.avatar ?? AVATARS[0],
          seat: g.order.indexOf(r.id) + 1,
          cards: r.cards,
          shown: r.shown,
          condition: r.condition,
          conditionMet: r.conditionMet,
          lines: r.lines,
          points: r.points,
          tickets: r.tickets,
          place: r.place,
          wins: this.wins.get(r.id) ?? 0,
          winner: r.place === 1,
        };
      }),
    };
    this.phase = 'finished';
    this.clearTimer();
  }

  // ───────────────────────────── Minuteries ─────────────────────────────

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** À appeler après chaque changement : planifie la prochaine échéance puis diffuse l'état, à tous ou seulement à certains. */
  commit(scope: string[] | null = null): void {
    this.reschedule();
    if (scope) for (const id of scope) this.onPrivate(id);
    else this.onChange();
  }

  /** La prochaine échéance : fin d'étape, bot qui agit, absent qui passe en pilote automatique, ou fin de partie. */
  private dueAt(): number {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return Infinity;
    if (g.stage === 'over') return this.finishAt;
    let due = this.stageEndsAt || Infinity;
    const now = Date.now();
    if (g.stage === 'setup') {
      for (const id of g.order) {
        const p = this.get(id);
        if (!p || g.ready.has(id)) continue;
        if (this.isAuto(p)) due = Math.min(due, this.setupAt.get(id) ?? now);
        else if (!p.isBot && !p.left && !p.connected) due = Math.min(due, p.disconnectedAt + GRACE_MS);
      }
    }
    if (g.stage === 'bid') {
      if (this.autoAt) due = Math.min(due, this.autoAt);
      const p = this.get(g.turn);
      // Le joueur au guichet est parti, ou absent depuis trop longtemps : le pilote automatique le remplace.
      if (p && !this.autoAt) {
        if (this.isAuto(p)) due = Math.min(due, now);
        else if (!p.connected) due = Math.min(due, p.disconnectedAt + GRACE_MS);
      }
    }
    return due;
  }

  private reschedule(): void {
    this.clearTimer();
    const due = this.dueAt();
    if (!Number.isFinite(due)) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      // Une minuterie peut sonner une milliseconde trop tôt : on se rendort, sinon on diffuserait un état inchangé à toute la table.
      if (Date.now() < due) {
        this.reschedule();
        return;
      }
      try {
        this.tick();
      } catch (e) {
        console.error(`[room ${this.code}]`, e);
      }
      this.commit();
    }, Math.max(0, Math.min(due - Date.now(), 2_147_000_000)));
  }

  /** Fait avancer la table. */
  tick(): void {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return;
    const now = Date.now();
    switch (g.stage) {
      case 'setup':
        if (this.stageEndsAt && now >= this.stageEndsAt) {
          // Le temps est écoulé : chacun garde ses cartes dans l'ordre du tirage, et montre la première.
          for (const id of g.order) if (!g.ready.has(id)) g.setSuite(id, [0, 1, 2], 0);
          this.beginRounds();
        } else this.autoSetup(now);
        return;
      case 'bid': {
        const p = this.get(g.turn);
        if (this.autoAt && now >= this.autoAt) {
          // Revenu à temps, avec des tickets : il reprend la main.
          if (p && !this.isAuto(p) && g.ticketsOf(p.id) > 0) this.autoAt = 0;
          else this.autoAct();
        } else if (this.stageEndsAt && now >= this.stageEndsAt) this.autoAct();
        else if (p && !this.autoAt && this.isAuto(p)) {
          this.stageEndsAt = 0;
          this.autoAt = now + T.autoMin + crypto.randomInt(T.autoSpread);
        }
        return;
      }
      case 'result':
        if (now >= this.stageEndsAt) this.afterResult();
        return;
      case 'over':
        if (now >= this.finishAt) this.finishGame();
        return;
    }
  }

  dispose(): void {
    this.clearTimer();
  }

  // ───────────────────────────── Vue personnalisée ─────────────────────────────

  private gameView(g: Game, viewerId: string): GameView {
    const seated = g.has(viewerId);
    const showResult = g.stage === 'result' || g.stage === 'over';
    return {
      order: [...g.order],
      turnOrder: [...g.turnOrder],
      stage: g.stage,
      round: g.round,
      rounds: g.rounds,
      attempt: g.attempt,
      board: [...g.board],
      lots: g.lots ? { A: [...g.lots.A], B: [...g.lots.B] } : null,
      turn: g.turn,
      endsAt: g.stage === 'over' ? 0 : this.stageEndsAt,
      result: showResult && g.result ? { ...g.result, placed: g.result.placed.map((x) => ({ ...x })) } : null,
      me: seated
        ? {
            cards: [...g.cards.get(viewerId)!],
            shown: g.shown.get(viewerId) ?? 0,
            condition: g.conditions.get(viewerId)!,
            tickets: g.ticketsOf(viewerId),
            ready: g.ready.has(viewerId),
            bid: g.bids.has(viewerId) ? { ...g.bids.get(viewerId)!, plan: g.bids.get(viewerId)!.plan.map((d) => ({ ...d })) } : null,
            won: showResult && g.result?.kind === 'won' && g.lastWinner === viewerId,
          }
        : null,
      // Tiré de ce que tout le monde voit : manche, annulations, rang au guichet et étape.
      seq: ((g.round * 4 + g.attempt) * 16 + g.turnIdx) * 4 + STAGE_STEP[g.stage],
    };
  }

  viewFor(viewerId: string): RoomView {
    const g = this.phase === 'playing' ? this.game : null;
    return {
      code: this.code,
      phase: this.phase,
      me: viewerId,
      hostId: this.hostId,
      settings: { ...this.settings },
      players: this.players.map((p) => {
        const seat = g ? g.order.indexOf(p.id) : -1;
        const cards = g && seat >= 0 ? g.cards.get(p.id) : undefined;
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          isBot: p.isBot,
          isHost: p.id === this.hostId,
          connected: p.isBot || p.connected,
          autopilot: !p.isBot && p.status === 'playing' && this.isAuto(p),
          status: p.status,
          wins: this.wins.get(p.id) ?? 0,
          seat: seat >= 0 ? seat + 1 : null,
          shown: g && cards && g.stage !== 'setup' ? cards[g.shown.get(p.id) ?? 0] : null,
          ready: !!g && g.stage === 'setup' && g.ready.has(p.id),
          hasBid: !!g && g.stage === 'bid' && (g.bids.has(p.id) || g.empty.has(p.id)),
        };
      }),
      game: g ? this.gameView(g, viewerId) : null,
      final: this.final,
      serverNow: Date.now(),
    };
  }
}

function pickOne<T>(arr: T[]): T {
  return arr[crypto.randomInt(arr.length)];
}
