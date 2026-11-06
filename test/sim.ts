// Force des bots : des parties entières sans réseau. Usage : npx tsx test/sim.ts [parties] [joueurs]
// 1. un bot « habile » contre des joueurs au hasard ; 2. le hasard contre le hasard (référence) ;
// 3. novice, habile et retors à la même table. Les victoires partagées comptent pour une part.
import { botBid, botSuite, randomBid, type BotSeen, type Skill } from '../server/bots';
import { Game } from '../server/game';
import { seeded } from './rng';

type Brain = Skill | 'hasard';

function play(brains: Brain[], seed: number): { shares: number[]; points: number[]; voids: number; discarded: number; tiles: number } {
  const ids = brains.map((_, i) => `p${i}`);
  const rng = seeded(seed);
  const rand = () => rng(1_000_000) / 1_000_000;
  const g = new Game(ids, rng);
  for (const id of ids) {
    const s = botSuite(rand);
    g.setSuite(id, s.order, s.shown);
  }
  g.startRounds();
  let voids = 0;
  let discarded = 0;
  while (g.stage !== 'over') {
    if (g.stage === 'result') {
      if (g.result?.kind === 'void') voids++;
      if (g.result?.kind === 'discarded') discarded++;
      g.next();
      continue;
    }
    const id = g.turn!;
    if (g.ticketsOf(id) === 0) {
      g.passEmpty(id);
      continue;
    }
    const seen: BotSeen = {
      board: g.board,
      lots: g.lots!,
      cards: g.cards.get(id)!,
      condition: g.conditions.get(id)!,
      tickets: g.ticketsOf(id),
      round: g.round,
      rounds: g.rounds,
      players: ids.length,
      totalsHeard: g.totalsHeard,
    };
    const brain = brains[ids.indexOf(id)];
    const b = brain === 'hasard' ? randomBid(seen, rand) : botBid(seen, brain, rand);
    const err = g.bid(id, b.lot, b.amount, b.plan);
    if (err) throw new Error(err);
  }
  const rows = g.standings();
  const winners = rows.filter((r) => r.place === 1).map((r) => r.id);
  return {
    shares: ids.map((id) => (winners.includes(id) ? 1 / winners.length : 0)),
    points: ids.map((id) => rows.find((r) => r.id === id)!.points),
    voids,
    discarded,
    tiles: g.board.filter(Boolean).length,
  };
}

const games = Number(process.argv[2]) || 200;
const players = Number(process.argv[3]) || 5;
const pct = (x: number) => `${Math.round(x * 100)} %`;

function table(label: string, brains: Brain[]): number[] {
  const wins = brains.map(() => 0);
  const avg = brains.map(() => 0);
  let pts = 0;
  let zero = 0;
  let voids = 0;
  let discarded = 0;
  let tiles = 0;
  const t0 = Date.now();
  for (let s = 0; s < games; s++) {
    // On fait tourner les places pour que l'ordre de passage ne favorise personne.
    const shift = s % brains.length;
    const seatBrains = brains.map((_, i) => brains[(i + shift) % brains.length]);
    const r = play(seatBrains, 1000 + s);
    r.shares.forEach((x, i) => (wins[(i + shift) % brains.length] += x));
    r.points.forEach((x, i) => (avg[(i + shift) % brains.length] += x));
    pts += Math.max(...r.points);
    zero += r.points.filter((p) => p === 0).length / r.points.length;
    voids += r.voids;
    discarded += r.discarded;
    tiles += r.tiles;
  }
  console.log(
    `${label} : ${brains.map((b, i) => `${b} ${pct(wins[i] / games)} (${(avg[i] / games).toFixed(1)} pt)`).join(', ')} · points du gagnant ${(pts / games).toFixed(1)} · joueurs à 0 point ${pct(zero / games)} · annulations ${(voids / games).toFixed(1)}, lots écartés ${(discarded / games).toFixed(2)}, cubes posés ${(tiles / games).toFixed(1)} · ${Math.round((Date.now() - t0) / games)} ms par partie`,
  );
  return wins.map((w) => w / games);
}

console.log(`${games} parties à ${players} joueurs`);
table('Habile contre le hasard', ['habile', ...Array.from({ length: players - 1 }, () => 'hasard' as Brain)]);
table('Hasard contre le hasard', Array.from({ length: players }, () => 'hasard' as Brain));
const levels: Skill[] = ['novice', 'habile', 'retors'];
table('Entre bots', Array.from({ length: players }, (_, i) => levels[i % 3]));
