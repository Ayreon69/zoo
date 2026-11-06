// Test de bout en bout sur le serveur compilé, en mode accéléré (ZO_FAST=1 : deux secondes au guichet, résultats éclair).
// Partie 1 : 3 humains (socket.io) + 2 bots ; un spectateur arrive en route, un joueur se déconnecte puis revient,
// une session volée est refusée, des gestes interdits sont refusés sans rien diffuser aux autres.
// Partie 2 : revanche à 8, la table pleine, sans limite de temps (le mode accéléré garde ses deux secondes).
// Les humains composent leur suite (ou laissent le temps filer), misent au hasard, parfois tout, parfois rien
// (le pilote automatique joue alors pour eux). À chaque état reçu, on vérifie qu'aucune information cachée ne fuit ;
// à la fin, on rejoue tout le grand dévoilement selon les règles. Usage : npm run build && npm run e2e
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['dist/server/index.mjs'], {
  env: { ...process.env, PORT: String(PORT), ZO_FAST: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  server.kill();
  process.exit(1);
};
setTimeout(() => fail('délai dépassé (5 min)'), 300_000).unref();

await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('prêt') && resolve()));

// Recopié des règles, pour ne pas dépendre du code testé.
const SIZE = 5;
const ROUNDS = 5;
const START = 30;
const LOT = 4;
const MAX_VOIDS = 3;
const ME_KEYS = 'bid,cards,condition,ready,shown,tickets,won';
const PLAYER_KEYS = 'autopilot,avatar,connected,hasBid,id,isBot,isHost,name,ready,seat,shown,status,wins';
const ANIMALS = ['serpent', 'perroquet', 'elephant', 'lion', 'singe'];
const stats = { states: 0, bids: 0, allIn: 0, idle: 0, refused: 0, suites: 0, wonSeen: 0, plansChecked: 0 };
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const cell = (col, row) => row * SIZE + col;

function landing(board, col) {
  for (let row = 0; row < SIZE; row++) if (!board[cell(col, row)]) return row;
  return -1;
}
function drop(board, lot, plan) {
  const b = [...board];
  const placed = [];
  for (const d of plan) {
    const row = landing(b, d.col);
    if (row < 0) return null;
    b[cell(d.col, row)] = lot[d.t];
    placed.push({ animal: lot[d.t], col: d.col, row });
  }
  return { board: b, placed };
}
function randomPlan(board, lot) {
  for (;;) {
    const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    const plan = order.map((t) => ({ t, col: Math.floor(Math.random() * SIZE) }));
    if (drop(board, lot, plan)) return plan;
  }
}
function lines(board, suite) {
  const out = [];
  for (let row = 0; row < SIZE; row++)
    for (let col = 0; col < SIZE; col++)
      for (const [dc, dr] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1],
      ]) {
        const c2 = col + 2 * dc;
        const r2 = row + 2 * dr;
        if (c2 < 0 || c2 >= SIZE || r2 < 0 || r2 >= SIZE) continue;
        const w = [cell(col, row), cell(col + dc, row + dr), cell(c2, r2)].map((i) => board[i]);
        if (w.some((x) => !x)) continue;
        if ((w[0] === suite[0] && w[1] === suite[1] && w[2] === suite[2]) || (w[2] === suite[0] && w[1] === suite[1] && w[0] === suite[2])) out.push(1);
      }
  return out.length;
}
const count = (board, a) => board.filter((x) => x === a).length;

function client(name, { player = true, avatar = 'girafe' } = {}) {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { name, socket, view: null, avatar, player, session: null, sent: new Map(), seen: new Map(), lastGesture: 0, suiteSent: false, boards: new Map() };
  socket.on('state', (v) => {
    const prev = c.view;
    c.view = v;
    audit(c, prev, v);
    if (c.player) play(c);
  });
  socket.on('disconnect', () => {
    c.view = null;
  });
  c.call = (event, payload = {}) => new Promise((res) => socket.emit(event, payload, res));
  c.reset = () => {
    c.sent.clear();
    c.seen.clear();
    c.boards.clear();
    c.suiteSent = false;
  };
  return c;
}

/** Ce que tout le monde voit : la vue sans « me » ni l'heure du serveur. */
const publicPart = (v) => JSON.stringify({ ...v, serverNow: 0, game: v.game ? { ...v.game, me: null } : null });

function audit(c, prev, v) {
  stats.states++;
  const json = JSON.stringify(v);
  for (const word of ['"token":', '"skill', '"autoAt"', '"crates"', '"lastWinner"', '"conditions"', '"setupAt"']) if (json.includes(word)) fail(`la vue de ${c.name} contient ${word}`);
  if (!v.final) for (const word of ['"bids"', '"history"', '"winner"', '"conditionMet"']) if (json.includes(word)) fail(`la vue de ${c.name} contient ${word} avant la fin`);
  for (const p of v.players) if (Object.keys(p).sort().join(',') !== PLAYER_KEYS) fail(`un joueur vu par ${c.name} contient ${Object.keys(p)}`);
  const g = v.game;
  if (v.phase !== 'playing') {
    if (g) fail('une partie visible hors jeu');
    return;
  }
  if (!g) fail('une partie sans état de jeu');
  const seated = g.order.includes(v.me);
  if (!!g.me !== seated) fail(`${c.name} : « me » ne suit pas le siège`);
  if (g.me && Object.keys(g.me).sort().join(',') !== ME_KEYS) fail(`« me » contient ${Object.keys(g.me)}`);
  if (g.me && (g.me.tickets < 0 || g.me.tickets > START)) fail(`${c.name} a ${g.me.tickets} tickets`);
  for (const p of v.players) {
    const sits = g.order.includes(p.id);
    if (g.stage === 'setup' ? p.shown !== null : sits !== (p.shown !== null)) fail(`animal montré mal publié pour ${p.name} pendant ${g.stage}`);
    if (p.shown !== null && !ANIMALS.includes(p.shown)) fail(`animal montré inconnu : ${p.shown}`);
    if (p.ready && g.stage !== 'setup') fail(`« prêt » visible pendant ${g.stage}`);
    if (p.hasBid && g.stage !== 'bid') fail(`« passé au guichet » visible pendant ${g.stage}`);
  }
  if (g.me && g.stage !== 'setup') {
    const mine = v.players.find((p) => p.id === v.me);
    if (mine.shown !== g.me.cards[g.me.shown]) fail(`${c.name} montre ${mine.shown}, mais sa carte montrée est ${g.me.cards[g.me.shown]}`);
  }
  if (!!g.result !== (g.stage === 'result' || g.stage === 'over')) fail(`résultat visible pendant ${g.stage}`);
  if (g.me?.won && g.result?.kind !== 'won') fail(`${c.name} croit avoir gagné un lot ${g.result?.kind}`);
  if ((g.stage === 'setup') !== (g.round === 0) || (g.stage === 'setup') !== !g.lots) fail(`manche ${g.round} pendant ${g.stage}`);
  if (g.stage === 'bid' && !g.turn) fail('personne au guichet');
  if (g.stage !== 'bid' && g.turn) fail(`quelqu'un au guichet pendant ${g.stage}`);
  const filled = g.board.filter(Boolean).length;
  if (filled % LOT) fail(`${filled} cubes sur le plateau`);
  for (let col = 0; col < SIZE; col++) for (let row = 1; row < SIZE; row++) if (g.board[cell(col, row)] && !g.board[cell(col, row - 1)]) fail('un cube flotte');
  if (g.stage === 'bid') c.boards.set(`${g.round}:${g.attempt}`, [...g.board]);
  if (g.result && g.me) {
    const key = `${g.result.round}:${g.result.attempt}`;
    if (!c.seen.has(key)) {
      c.seen.set(key, { kind: g.result.kind, lot: g.result.lot, total: g.result.total, won: g.me.won });
      if (g.me.won) {
        stats.wonSeen++;
        // Mon plan est tombé : les cubes posés suivent ce que j'ai envoyé (ou ce que le pilote a choisi pour moi).
        const before = c.boards.get(key);
        const plan = g.me.bid?.plan;
        if (before && plan && g.me.bid.lot === g.result.lot) {
          const out = drop(before, g.lots[g.result.lot], plan);
          if (!out || JSON.stringify(out.placed) !== JSON.stringify(g.result.placed)) fail(`${c.name} : le lot n'est pas tombé selon son plan`);
          stats.plansChecked++;
        }
      }
    }
  }

  // L'envoi même d'un état trahit un geste caché : pendant une mise, un état sans rien de neuf pour tout le monde
  // ne doit arriver qu'à celui qui vient d'agir.
  const pg = prev?.game;
  if (pg && prev.phase === 'playing' && pg.stage === g.stage && g.stage !== 'setup' && publicPart(prev) === publicPart(v) && Date.now() - c.lastGesture > 500)
    fail(`${c.name} a reçu pendant ${g.stage} un état qui ne lui apprend rien : un geste caché a été diffusé`);
}

function play(c) {
  const v = c.view;
  const g = v?.game;
  if (!v || v.phase !== 'playing' || !g?.me) return;
  if (g.stage === 'setup' && !g.me.ready && !c.suiteSent) {
    c.suiteSent = true;
    if (Math.random() < 0.15) return; // il laisse filer le temps : ses cartes restent dans l'ordre du tirage
    const order = [0, 1, 2].sort(() => Math.random() - 0.5);
    const shown = Math.floor(Math.random() * 3);
    setTimeout(async () => {
      c.lastGesture = Date.now();
      const res = await c.call('game:suite', { order, shown });
      if (!res?.ok) fail(`${c.name} : suite refusée (${res?.error})`);
      stats.suites++;
      // Une seconde fois : refusée, et elle ne change rien.
      c.lastGesture = Date.now();
      if ((await c.call('game:suite', { order: [0, 1, 2], shown: 0 })).ok) fail('une suite validée deux fois');
      stats.refused++;
    }, Math.random() * 400);
    return;
  }
  if (g.stage !== 'bid' || g.turn !== v.me || g.me.bid || g.me.tickets === 0) return;
  const key = `${g.round}:${g.attempt}`;
  if (c.sent.has(key)) return;
  if (Math.random() < 0.08) {
    // Il ne fait rien : au bout de ses deux secondes, le pilote automatique mise pour lui.
    c.sent.set(key, 'idle');
    stats.idle++;
    return;
  }
  const lot = pick(['A', 'B']);
  const plan = randomPlan(g.board, g.lots[lot]);
  const allIn = g.round === ROUNDS ? Math.random() < 0.6 : Math.random() < 0.06;
  const amount = allIn ? g.me.tickets : 1 + Math.floor(Math.random() * Math.min(g.me.tickets, 8));
  c.sent.set(key, { lot, amount, plan });
  setTimeout(async () => {
    if (!c.socket.connected || !c.view) {
      // Coupé entre-temps : le pilote automatique jouera pour lui.
      c.sent.set(key, 'late');
      return;
    }
    c.lastGesture = Date.now();
    // D'abord des gestes interdits : plan incomplet, trop de tickets, enchère passée.
    if (Math.random() < 0.3) {
      if ((await c.call('game:bid', { round: g.round, attempt: g.attempt, lot, amount, plan: plan.slice(1) })).ok) fail('un plan incomplet accepté');
      if ((await c.call('game:bid', { round: g.round, attempt: g.attempt, lot, amount: g.me.tickets + 1, plan })).ok) fail('une mise au-delà des tickets acceptée');
      if ((await c.call('game:bid', { round: g.round, attempt: g.attempt + 7, lot, amount, plan })).ok) fail('une mise pour une autre enchère acceptée');
      stats.refused += 3;
      c.lastGesture = Date.now();
    }
    const res = await c.call('game:bid', { round: g.round, attempt: g.attempt, lot, amount, plan });
    if (!res?.ok) {
      // Le pilote automatique a pu jouer à sa place juste avant (deux secondes en mode accéléré).
      if (!/pas ton tour|déjà passée|plus à cette table|ne répond pas/.test(res?.error ?? '')) fail(`${c.name} : mise refusée (${res?.error})`);
      c.sent.set(key, 'late');
      return;
    }
    stats.bids++;
    if (allIn) stats.allIn++;
  }, Math.random() * 700);
}

const waitPhase = (c, phase) =>
  new Promise((resolve) => {
    const check = setInterval(() => {
      if (c.view?.phase === phase) {
        clearInterval(check);
        resolve();
      }
    }, 50);
  });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Le grand dévoilement, rejoué selon les règles : mises, totaux, lots adjugés, annulations, tickets, puis les points. */
function checkFinal(final, players, humans) {
  if (!final || final.players.length !== players) fail(`table finale incomplète (${final?.players.length})`);
  const ids = final.players.map((p) => p.id);
  const tickets = new Map(ids.map((id) => [id, START]));
  const kinds = { won: 0, void: 0, discarded: 0, broke: 0 };
  let round = 1;
  let attempt = 0;
  let wins = 0;
  for (const h of final.history) {
    if (h.round !== round || h.attempt !== attempt) fail(`passage au guichet hors d'ordre : manche ${h.round}, essai ${h.attempt} (attendu ${round}, ${attempt})`);
    const rich = ids.filter((id) => tickets.get(id) > 0);
    if (!rich.length) {
      if (h.kind !== 'discarded' || h.bids.length) fail(`manche ${h.round} : personne n'a de tickets, mais ${h.kind}`);
      kinds.broke++;
    } else {
      const bidders = h.bids.map((b) => b.id);
      if (new Set(bidders).size !== bidders.length || bidders.sort().join() !== [...rich].sort().join()) fail(`manche ${h.round} : tous ceux qui ont des tickets doivent miser, une fois`);
      const totals = { A: 0, B: 0 };
      for (const b of h.bids) {
        if (!Number.isInteger(b.amount) || b.amount < 1 || b.amount > tickets.get(b.id)) fail(`manche ${h.round} : ${b.amount} misés avec ${tickets.get(b.id)}`);
        totals[b.lot] += b.amount;
      }
      if (totals.A !== h.totals.A || totals.B !== h.totals.B) fail(`manche ${h.round} : totaux faux`);
      let winner = null;
      let lot = null;
      if (totals.A !== totals.B) {
        lot = totals.A < totals.B ? 'A' : 'B';
        const on = h.bids.filter((b) => b.lot === lot);
        const top = Math.max(0, ...on.map((b) => b.amount));
        const best = on.filter((b) => b.amount === top);
        if (best.length === 1) winner = best[0].id;
      }
      const kind = winner ? 'won' : attempt + 1 >= MAX_VOIDS ? 'discarded' : 'void';
      if (h.kind !== kind || h.winner !== winner || h.lot !== (winner ? lot : null)) fail(`manche ${h.round}, essai ${h.attempt} mal jugé : ${JSON.stringify(h)}`);
      if (kind === 'won') {
        for (const b of h.bids) tickets.set(b.id, tickets.get(b.id) - b.amount);
        wins++;
      }
    }
    kinds[h.kind]++;
    if (h.kind === 'void') attempt++;
    else {
      round++;
      attempt = 0;
    }
  }
  if (round !== ROUNDS + 1) fail(`${round - 1} manches jouées sur ${ROUNDS}`);
  const board = final.board;
  if (board.filter(Boolean).length !== wins * LOT) fail(`${board.filter(Boolean).length} cubes pour ${wins} lots adjugés`);
  for (const a of ANIMALS) if (count(board, a) > 8) fail(`${count(board, a)} ${a} sur le plateau`);
  for (const p of final.players) {
    if (p.tickets !== tickets.get(p.id)) fail(`${p.name} : ${p.tickets} tickets au lieu de ${tickets.get(p.id)}`);
    const n = lines(board, p.cards);
    const met = count(board, p.condition[0]) > count(board, p.condition[1]);
    if (p.lines.length !== n || p.conditionMet !== met || p.points !== n * (met ? 2 : 1)) fail(`${p.name} : ${p.points} points annoncés, ${n * (met ? 2 : 1)} comptés`);
    if (p.cards[p.shown] === undefined) fail(`${p.name} : carte montrée inconnue`);
  }
  const rows = final.players;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i - 1].points < rows[i].points) fail('classement mal rangé');
    const tied = rows[i - 1].points === rows[i].points;
    if (tied ? rows[i].place !== rows[i - 1].place : rows[i].place !== i + 1) fail(`places incohérentes : ${rows.map((x) => x.place)}`);
  }
  if (rows[0].place !== 1 || rows.some((p) => p.winner !== (p.place === 1))) fail('gagnants mal marqués');
  // Les conditions sont toutes différentes, comme les cartes de l'émission.
  const conds = new Set(rows.map((p) => p.condition.join('>')));
  if (conds.size !== rows.length) fail('deux joueurs ont la même condition');

  // Ce que chaque humain a vu et fait colle au dévoilement.
  for (const c of humans) {
    const id = c.session?.playerId;
    if (!id || !ids.includes(id)) continue;
    for (const h of final.history) {
      const seen = c.seen.get(`${h.round}:${h.attempt}`);
      if (seen) {
        if (seen.kind !== h.kind || seen.lot !== h.lot) fail(`${c.name} a vu un autre résultat (manche ${h.round}, essai ${h.attempt})`);
        if (seen.won !== (h.winner === id)) fail(`${c.name} ${seen.won ? 'croyait avoir' : "ne savait pas avoir"} gagné la manche ${h.round}`);
        if (h.kind === 'won' && seen.total !== h.totals.A + h.totals.B) fail('total annoncé faux');
        if (h.kind !== 'won' && seen.total !== null) fail('un total annoncé sur une enchère annulée');
      }
      const sent = c.sent.get(`${h.round}:${h.attempt}`);
      const mine = h.bids.find((b) => b.id === id);
      // Une mise partie trop tard (le pilote a joué avant) est marquée « late » : seules les mises acceptées comptent ici.
      if (sent && typeof sent === 'object' && (!mine || mine.lot !== sent.lot || mine.amount !== sent.amount)) fail(`${c.name} : sa mise de la manche ${h.round} n'est pas celle dévoilée`);
    }
  }
  return { winner: rows[0], kinds, wins };
}

// ── Partie 1 : 3 humains + 2 bots ──
const host = client('Ana');
await new Promise((r) => host.socket.on('connect', r));
if ((await host.call('game:bid', { round: 1, attempt: 0, lot: 'A', amount: 1, plan: [] })).ok) fail('une mise acceptée sans table');
const created = await host.call('room:create', { name: 'Ana', avatar: 'girafe', bots: 2 });
if (!created.ok) fail(`création : ${created.error}`);
host.session = created.data;
const code = created.data.code;
const bob = client('Bob', { avatar: 'zebre' });
const chloe = client('Chloé', { avatar: 'panda' });
await Promise.all([bob, chloe].map((c) => new Promise((r) => c.socket.on('connect', r))));
for (const c of [bob, chloe]) {
  const res = await c.call('room:join', { code, name: c.name, avatar: c.avatar });
  if (!res.ok) fail(`arrivée de ${c.name} : ${res.error}`);
  c.session = res.data;
}
if ((await host.call('game:suite', { order: [0, 1, 2], shown: 0 })).ok) fail('une suite acceptée dans le salon');
if (!(await host.call('room:settings', { timer: 45 })).ok) fail('réglages refusés');
await host.call('room:settings', { timer: 3600 });
await pause(100);
if (host.view.settings.timer !== 45) fail('une durée inconnue a été acceptée');
if ((await bob.call('room:settings', { timer: 0 })).ok) fail('un invité a changé les réglages');
if ((await bob.call('game:start')).ok) fail('un invité a lancé la partie');
const heard = new Promise((r) => bob.socket.once('emote', r));
host.socket.emit('emote', { emoji: 'Je prends A' });
if ((await heard).emoji !== 'Je prends A') fail('réaction perdue');
const start = await host.call('game:start');
if (!start.ok) fail(`lancement : ${start.error}`);

// Un spectateur arrive en cours de partie : il voit le plateau, sans siège ni fiche, et ne peut pas miser.
await pause(2500);
const watcher = client('Dora', { player: false, avatar: 'koala' });
await new Promise((r) => watcher.socket.on('connect', r));
const joined = await watcher.call('room:join', { code, name: 'Dora', avatar: 'koala' });
if (!joined.ok) fail(`spectateur : ${joined.error}`);
watcher.session = joined.data;
await pause(100);
const dora = watcher.view.players.find((p) => p.name === 'Dora');
if (dora?.status !== 'spectator' || dora.seat !== null) fail('la retardataire devrait regarder');
if (!watcher.view.game || watcher.view.game.me !== null) fail('le spectateur ne voit pas la partie, ou s’y voit assis');
watcher.lastGesture = Date.now();
const wg = watcher.view.game;
if ((await watcher.call('game:bid', { round: wg.round, attempt: wg.attempt, lot: 'A', amount: 1, plan: [] })).ok) fail('le spectateur a misé');

// Bob se déconnecte un moment, puis revient avec sa session ; Chloé tente de la voler.
await pause(1500);
bob.socket.disconnect();
await pause(900);
bob.socket.connect();
await new Promise((r) => bob.socket.on('connect', r));
const back = await bob.call('room:join', { code, playerId: bob.session.playerId, token: bob.session.token, resumeOnly: true });
if (!back.ok) fail(`retour de Bob : ${back.error}`);
chloe.lastGesture = Date.now();
const intruder = await chloe.call('room:join', { code, playerId: bob.session.playerId, token: 'faux', resumeOnly: true });
if (intruder.ok) fail('une session volée a été acceptée');

await waitPhase(host, 'finished');
const humans1 = [host, bob, chloe];
const r1 = checkFinal(host.view.final, 5, humans1);
if (!host.view.players.some((p) => p.wins >= 1)) fail('la victoire n’est pas comptée');
for (const c of [bob, chloe, watcher]) if (JSON.stringify(c.view.final) !== JSON.stringify(host.view.final)) fail(`${c.name} ne voit pas le même dévoilement`);

// ── Partie 2 : revanche à 8, la table pleine (Dora s'assoit, deux bots de plus), sans limite ──
if ((await bob.call('game:restart')).ok) fail('un invité a relancé la partie');
if (!(await host.call('game:restart')).ok) fail('revanche refusée');
await pause(150);
if (host.view.phase !== 'lobby' || host.view.final) fail('la revanche ne ramène pas au salon');
for (const c of [host, bob, chloe, watcher]) c.reset();
watcher.player = true;
for (let i = 0; i < 2; i++) if (!(await host.call('room:addBot')).ok) fail('ajout de bot refusé');
await pause(150);
const seatedNow = host.view.players.filter((p) => p.status !== 'spectator').length;
if (seatedNow !== 8) fail(`8 joueurs attendus au salon, ${seatedNow} trouvés`);
if ((await host.call('room:addBot')).ok) fail('un neuvième joueur a été accepté');
if (!(await host.call('room:settings', { timer: 0 })).ok) fail('réglages de la revanche refusés');
if (!(await host.call('game:start')).ok) fail('lancement de la revanche refusé');
await pause(50);
if (host.view.game.order.length !== 8 || host.view.game.stage !== 'setup') fail('mise en place de la revanche fausse');

await waitPhase(host, 'finished');
const r2 = checkFinal(host.view.final, 8, [host, bob, chloe, watcher]);
if (r1.wins + r2.wins === 0) fail('aucun lot adjugé en deux parties : suspect');

const line = (r) => `${r.kinds.won} lots adjugés, ${r.kinds.void} enchères annulées, ${r.kinds.discarded} manches écartées ; ${r.winner.name} gagne avec ${r.winner.points} point(s)`;
console.log(`✓ partie 1 (5 joueurs) : ${line(r1)}.`);
console.log(`✓ partie 2 (8 joueurs) : ${line(r2)}.`);
console.log(
  `  Humains : ${stats.suites} suites rangées, ${stats.bids} mises (${stats.allIn} à tapis), ${stats.idle} tours laissés au pilote, ${stats.refused} gestes interdits refusés ; ${stats.wonSeen} lots gagnés vus en secret (${stats.plansChecked} plans vérifiés) ; ${stats.states} états vérifiés.`,
);
for (const c of [host, bob, chloe, watcher]) c.socket.close();
server.kill();
process.exit(0);
