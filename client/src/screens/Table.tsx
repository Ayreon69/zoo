// La table : la file du guichet, le casier de bois, les deux caisses de cubes, ma fiche secrète et ma mise.
// On prépare sa mise pendant que les autres passent : choisir un lot, lâcher ses quatre cubes, régler ses tickets.
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Bot, Check, Eraser, Eye, Flag, LogOut, Minus, MoreHorizontal, Plus, Smile, Undo2, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  EMOTES,
  LOTS,
  MAX_VOIDS,
  SETUP_SECONDS,
  SIZE,
  TAUNTS,
  cellIndex,
  landingRow,
  type Animal,
  type Board as BoardT,
  type Drop,
  type GameView,
  type Lot,
  type MeView,
  type Placed,
  type PlayerView,
  type RoomView,
} from '../../../shared/protocol';
import { Board } from '../components/Board';
import { Avatar, Block, Button, Logo, Modal, Ticket, seatColor } from '../components/Ui';
import { sfx } from '../lib/sound';
import { ANIMAL_EMOJI, ANIMAL_NAME, conditionText, listing, nameOf } from '../lib/text';
import { cls, noMouseFocus, plural, reducedMotion, secondsLeft, useTick, vibrate } from '../lib/util';
import { leaveRoom, send, socket } from '../net';
import { useStore, type Emote } from '../store';

const CONFETTI = ['#e8473b', '#f6b326', '#3faa55', '#3c7fd8', '#9058c8', '#fffaf0'];

function burst(el: Element | null, count = 110): void {
  if (!el || reducedMotion()) return;
  const r = el.getBoundingClientRect();
  void confetti({
    particleCount: count,
    spread: 85,
    startVelocity: 32,
    origin: { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 3) / window.innerHeight },
    colors: CONFETTI,
    shapes: ['square'],
    scalar: 1,
    disableForReducedMotion: true,
  });
}

/** Les cubes d'un plan, posés un à un ; s'arrête à la première colonne pleine. */
function project(board: BoardT, lot: Animal[], plan: Drop[]): Placed[] {
  const b = [...board];
  const out: Placed[] = [];
  for (const d of plan) {
    const row = landingRow(b, d.col);
    if (row < 0 || !lot[d.t]) break;
    b[cellIndex(d.col, row)] = lot[d.t];
    out.push({ animal: lot[d.t], col: d.col, row });
  }
  return out;
}

/** Le temps qui file : « 0:42 ». */
function clockText(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ───────────────────────────── Morceaux de la table ─────────────────────────────

function ReactionTray({ onClose }: { onClose: () => void }) {
  const emit = (emoji: string) => {
    socket.emit('emote', { emoji });
    onClose();
  };
  return (
    <motion.div className="reactions" role="menu" aria-label="Réactions" initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
      <div className="reaction-emojis">
        {EMOTES.map((e) => (
          <button key={e} type="button" role="menuitem" onClick={() => emit(e)} aria-label={`Réaction ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="reaction-taunts">
        {TAUNTS.map((t) => (
          <button key={t} type="button" role="menuitem" onClick={() => emit(t)}>
            {t}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

function Bubbles({ emotes }: { emotes: Emote[] }) {
  return (
    <AnimatePresence>
      {emotes.slice(-1).map((e) => (
        <motion.span key={e.id} className={cls('bubble', e.emoji.length > 3 && 'is-text')} initial={{ scale: 0.4, y: 6, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ opacity: 0, y: -6 }}>
          {e.emoji}
        </motion.span>
      ))}
    </AnimatePresence>
  );
}

/** Un joueur de la file : son avatar, son nom, l'animal qu'il montre, et où il en est au guichet. */
function PlayerChip({ view, p, emotes, state }: { view: RoomView; p: PlayerView; emotes: Emote[]; state: 'turn' | 'done' | 'wait' | 'ready' | 'setup' | 'idle' }) {
  const me = p.id === view.me;
  // Seul celui qui est au guichet porte une étiquette ; la coche verte dit qui est passé ou prêt.
  const tag = state === 'turn' ? 'au guichet' : null;
  return (
    <li className={cls('pchip', `is-${state}`, me && 'is-me', !p.connected && 'is-off')} style={{ ['--seat' as string]: seatColor(p.seat) }}>
      <span className="pchip-face">
        <Avatar avatar={p.avatar} className="pchip-avatar" />
        {p.shown && <Block animal={p.shown} className="pchip-shown" title={`Montre ${ANIMAL_NAME[p.shown].art}`} />}
        {(state === 'done' || state === 'ready') && (
          <span className="pchip-check" aria-hidden>
            <Check size={11} strokeWidth={4} />
          </span>
        )}
      </span>
      <span className="pchip-name">
        <b>{me ? 'Toi' : p.name}</b>
        {p.autopilot ? <Bot size={12} className="pchip-state" aria-label="Pilote automatique" /> : !p.connected ? <WifiOff size={12} className="pchip-state" aria-label="Absent" /> : null}
      </span>
      {tag && <small className="pchip-tag">{tag}</small>}
      <Bubbles emotes={emotes} />
    </li>
  );
}

function Players({ view, emotes }: { view: RoomView; emotes: Emote[] }) {
  const g = view.game!;
  const ids = g.stage === 'setup' ? g.order : g.turnOrder;
  const players = ids.map((id) => view.players.find((p) => p.id === id)).filter((p): p is PlayerView => !!p);
  const stateOf = (p: PlayerView) => {
    if (g.stage === 'setup') return p.ready ? 'ready' : 'setup';
    if (g.stage !== 'bid') return 'idle';
    if (g.turn === p.id) return 'turn';
    return p.hasBid ? 'done' : 'wait';
  };
  return (
    <ol className={cls('players', `has-${players.length}`)} aria-label={g.stage === 'setup' ? 'Les joueurs' : 'La file du guichet, dans l’ordre de passage'}>
      {players.map((p) => (
        <PlayerChip key={p.id} view={view} p={p} emotes={emotes.filter((e) => e.playerId === p.id)} state={stateOf(p)} />
      ))}
    </ol>
  );
}

/** Les manches, en petits cubes : jouées, en cours, à venir. */
function RoundDots({ g }: { g: GameView }) {
  return (
    <span className="round-dots" role="img" aria-label={`Manche ${g.round} sur ${g.rounds}`}>
      {Array.from({ length: g.rounds }, (_, i) => (
        <i key={i} className={cls(i + 1 < g.round && 'is-done', i + 1 === g.round && 'is-now')} />
      ))}
    </span>
  );
}

/** Le sablier commun : la même barre pour tout le monde, quel que soit celui qui est au guichet. */
function Timer({ endsAt, total, now }: { endsAt: number; total: number; now: number }) {
  if (!endsAt) return null;
  const left = secondsLeft(endsAt, now);
  return (
    <span className={cls('timer', left <= 10 && 'is-low')} role="timer" aria-label={`${left} secondes`}>
      <span className="timer-bar" aria-hidden>
        <span style={{ width: `${Math.min(100, ((endsAt - now) / (total * 1000)) * 100)}%` }} />
      </span>
      <b>{clockText(left)}</b>
    </span>
  );
}

/** Une caisse de bois : ses quatre cubes, son étiquette, et son tampon quand l'enchère est jouée. */
function Crate({
  lot,
  blocks,
  chosen,
  used,
  pick,
  interactive,
  stamp,
  leaving,
  onChoose,
  onPick,
}: {
  lot: Lot;
  blocks: Animal[];
  chosen: boolean;
  used: Set<number>;
  pick: number | null;
  interactive: boolean;
  stamp: { text: string; tone: 'won' | 'off' | 'void' } | null;
  leaving: boolean;
  onChoose: () => void;
  onPick: (t: number) => void;
}) {
  return (
    <div className={cls('crate', `is-${lot}`, chosen && 'is-chosen', interactive && 'is-live', stamp && `is-${stamp.tone}`)} onClick={interactive ? onChoose : undefined}>
      <button type="button" className="crate-tag" {...noMouseFocus} disabled={!interactive} aria-pressed={chosen} onClick={(e) => (e.stopPropagation(), onChoose())}>
        Lot {lot}
      </button>
      <div className="crate-blocks">
        {blocks.map((a, t) => (
          <button
            key={t}
            type="button"
            {...noMouseFocus}
            className={cls('crate-slot', used.has(t) && 'is-used', chosen && pick === t && 'is-pick', leaving && 'is-leaving')}
            style={leaving ? { animationDelay: `${0.35 + t * 0.55}s` } : undefined}
            disabled={!interactive || used.has(t)}
            aria-label={`Lot ${lot} : ${ANIMAL_NAME[a].one}${used.has(t) ? ', déjà placé' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onPick(t);
            }}
          >
            <Block animal={a} />
          </button>
        ))}
      </div>
      <AnimatePresence>
        {stamp && (
          <motion.span key={stamp.text} className={cls('crate-stamp', `is-${stamp.tone}`)} initial={{ scale: 1.6, rotate: -14, opacity: 0 }} animate={{ scale: 1, rotate: -7, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }}>
            {stamp.text}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Ma fiche, que moi seul vois : ma suite, l'animal que je montre, ma condition, mes tickets. */
function Sheet({ me }: { me: MeView }) {
  const [a, b] = me.condition;
  return (
    <section className="sheet" aria-label="Ma fiche secrète">
      <div className="sheet-part sheet-suite">
        <small>Ta suite</small>
        <span className="suite-row">
          {me.cards.map((x, i) => (
            <span key={i} className={cls('suite-card', i === me.shown && 'is-shown')}>
              <Block animal={x} />
              {i === me.shown && (
                <span className="suite-eye" aria-label="La carte que tu montres">
                  <Eye size={10} strokeWidth={3} />
                </span>
              )}
            </span>
          ))}
        </span>
      </div>
      <div className="sheet-part sheet-cond" title={`Ta condition : ${conditionText(me.condition)}`}>
        <small>Ta condition</small>
        <span className="cond-row" aria-label={conditionText(me.condition)}>
          <Block animal={a} />
          <b aria-hidden>&gt;</b>
          <Block animal={b} />
        </span>
      </div>
      <div className="sheet-part sheet-tickets">
        <small>Tes tickets</small>
        <Ticket n={me.tickets} />
      </div>
    </section>
  );
}

/** La composition : ranger ses trois cartes en suite, choisir celle qu'on montre, découvrir sa condition. */
function SetupPanel({ view, me }: { view: RoomView; me: MeView }) {
  const [order, setOrder] = useState<number[]>([0, 1, 2]);
  const [shown, setShown] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const g = view.game!;
  const cards = me.ready ? me.cards : order.map((i) => me.cards[i]);
  const shownIdx = me.ready ? me.shown : shown;
  const waiting = view.players.filter((p) => g.order.includes(p.id) && p.id !== view.me && !p.ready).map((p) => p.name);

  const tap = (i: number) => {
    if (me.ready) return;
    if (sel === null) {
      setSel(i);
      sfx.pick();
      return;
    }
    if (sel !== i) {
      const next = [...order];
      [next[sel], next[i]] = [next[i], next[sel]];
      setOrder(next);
      // L'œil suit la carte, pas la place.
      if (shown === sel) setShown(i);
      else if (shown === i) setShown(sel);
      sfx.drop(1);
    }
    setSel(null);
  };

  const validate = async () => {
    setBusy(true);
    // La carte montrée se désigne par son rang dans la suite.
    const ok = await send('game:suite', { order, shown });
    setBusy(false);
    if (ok) sfx.ready();
  };

  return (
    <section className="setup panel">
      <header className="setup-head">
        <h2>{me.ready ? 'Ta suite est prête' : 'Compose ta suite'}</h2>
        <p>
          {me.ready ? (
            waiting.length ? (
              <>On attend {listing(waiting)}…</>
            ) : (
              'Tout le monde est prêt : la première manche commence.'
            )
          ) : (
            <>
              Range tes trois animaux dans l’ordre de ta suite : <b>touche deux cartes pour les échanger</b>. Puis choisis, avec l’œil, celle que tout le monde verra.
            </>
          )}
        </p>
      </header>

      <ol className={cls('setup-cards', me.ready && 'is-locked')}>
        {cards.map((a, i) => (
          <li key={`${i}-${a}`} className="setup-slot">
            <span className="setup-rank">{i + 1}</span>
            <motion.button layout type="button" className={cls('setup-card', sel === i && 'is-sel', i === shownIdx && 'is-shown')} disabled={me.ready} aria-pressed={sel === i} aria-label={`${i + 1}re carte : ${ANIMAL_NAME[a].one}${sel === i ? ', choisie pour l’échange' : ''}`} onClick={() => tap(i)}>
              <Block animal={a} />
              <span className="setup-name">{ANIMAL_NAME[a].one}</span>
            </motion.button>
            <button type="button" className={cls('eye-btn', i === shownIdx && 'is-on')} disabled={me.ready} aria-pressed={i === shownIdx} onClick={() => setShown(i)}>
              <Eye size={15} strokeWidth={2.6} aria-hidden /> {i === shownIdx ? 'Montrée' : 'Montrer'}
            </button>
          </li>
        ))}
      </ol>

      <div className="setup-rules">
        <div className="setup-explain">
          <span className="mini-line" aria-hidden>
            {cards.map((a, i) => (
              <Block key={i} animal={a} />
            ))}
          </span>
          <p>
            Trois cases alignées du plateau, <b>en ligne, en colonne ou en diagonale</b>, dans un sens ou dans l’autre : <b>1 point</b> à chaque fois.
          </p>
        </div>
        <div className="setup-cond">
          <span className="cond-row" aria-hidden>
            <Block animal={me.condition[0]} />
            <b>&gt;</b>
            <Block animal={me.condition[1]} />
          </span>
          <p>
            Ta condition secrète : à la fin, <b>{conditionText(me.condition)}</b> sur le plateau. Remplie, elle <b>double tes points</b>.
          </p>
        </div>
        <p className="setup-tickets">
          <Ticket n={me.tickets} /> <span>tickets pour toute la partie. Personne d’autre ne connaît ton compte.</span>
        </p>
      </div>

      {!me.ready && (
        <Button variant="primary" className="btn-lg btn-wide" icon={<Check size={20} />} disabled={busy} onClick={() => void validate()}>
          Valider ma suite
        </Button>
      )}
    </section>
  );
}

// ───────────────────────────── L'écran ─────────────────────────────

interface Draft {
  key: string;
  lot: Lot | null;
  plans: Record<Lot, Drop[]>;
  pick: number | null;
}

export function Table({ view }: { view: RoomView }) {
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const emotes = useStore((s) => s.emotes);
  const [menu, setMenu] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [react, setReact] = useState(false);
  const g = view.game!;
  const me = g.me;
  const seated = !!me;
  const isHost = view.hostId === view.me;
  const now = useTick(250);
  const boardRef = useRef<HTMLDivElement>(null);

  // ── Le brouillon de ma mise : il survit aux enchères annulées (mêmes lots, même plateau) ──
  const draftKey = `${g.round}:${g.board.map((c) => c ?? '-').join('')}`;
  const [draft, setDraft] = useState<Draft>({ key: draftKey, lot: null, plans: { A: [], B: [] }, pick: null });
  const d: Draft = draft.key === draftKey ? draft : { key: draftKey, lot: null, plans: { A: [], B: [] }, pick: null };
  const [amount, setAmount] = useState(1);
  const [busy, setBusy] = useState(false);
  const sentFor = useRef('');
  const bidKey = `${g.round}:${g.attempt}`;

  const lots = g.lots;
  const myTurn = g.stage === 'bid' && g.turn === view.me;
  const tickets = me?.tickets ?? 0;
  const canCompose = g.stage === 'bid' && !!me && !me.bid && tickets > 0 && !!lots;
  const plan = d.lot ? d.plans[d.lot] : [];
  const used = new Set(plan.map((x) => x.t));
  const pick = canCompose && d.lot && lots ? (d.pick !== null && !used.has(d.pick) ? d.pick : lots[d.lot].findIndex((_, t) => !used.has(t))) : -1;
  const pickAnimal = canCompose && d.lot && lots && pick >= 0 ? lots[d.lot][pick] : null;
  const planReady = !!d.lot && lots !== null && plan.length === lots[d.lot].length;
  const amt = Math.max(1, Math.min(amount, Math.max(1, tickets)));

  const update = (fn: (x: Draft) => Draft) => setDraft(fn(d));
  const chooseLot = (lot: Lot) => {
    if (!canCompose || d.lot === lot) return;
    sfx.crate();
    update((x) => ({ ...x, lot, pick: null }));
  };
  const pickBlock = (lot: Lot, t: number) => {
    if (!canCompose) return;
    sfx.pick();
    update((x) => ({ ...x, lot, pick: t }));
  };
  const dropIn = (col: number) => {
    if (!canCompose || !d.lot || !lots || pick < 0) return;
    const ghosts = project(g.board, lots[d.lot], plan);
    const b = [...g.board];
    for (const p of ghosts) b[cellIndex(p.col, p.row)] = p.animal;
    const row = landingRow(b, col);
    if (row < 0) return;
    sfx.drop(row);
    vibrate(8);
    const lot = d.lot;
    update((x) => ({ ...x, plans: { ...x.plans, [lot]: [...x.plans[lot], { t: pick, col }] }, pick: null }));
  };
  const undo = () => {
    if (!d.lot || !plan.length) return;
    sfx.undo();
    const lot = d.lot;
    update((x) => ({ ...x, plans: { ...x.plans, [lot]: x.plans[lot].slice(0, -1) }, pick: null }));
  };
  const clear = () => {
    if (!d.lot || !plan.length) return;
    sfx.undo();
    const lot = d.lot;
    update((x) => ({ ...x, plans: { ...x.plans, [lot]: [] }, pick: null }));
  };
  const confirm = async () => {
    if (!myTurn || !planReady || !d.lot || busy) return;
    setBusy(true);
    sentFor.current = bidKey;
    const ok = await send('game:bid', { round: g.round, attempt: g.attempt, lot: d.lot, amount: amt, plan });
    setBusy(false);
    if (ok) {
      sfx.bid();
      vibrate(14);
    } else sentFor.current = '';
  };

  // Au clavier : 1 à 5 lâchent le cube dans une colonne, A et B choisissent le lot, Retour arrière reprend, Entrée mise.
  const keys = useRef({ dropIn, undo, confirm, chooseLot });
  keys.current = { dropIn, undo, confirm, chooseLot };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && ((t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range') || t.tagName === 'TEXTAREA' || document.querySelector('.modal-back'))) return;
      const n = Number(e.key);
      if (n >= 1 && n <= SIZE) keys.current.dropIn(n - 1);
      else if (e.key === 'a' || e.key === 'A') keys.current.chooseLot('A');
      else if (e.key === 'b' || e.key === 'B') keys.current.chooseLot('B');
      else if (e.key === 'Backspace') keys.current.undo();
      else if (e.key === 'Enter' && !(t && t.tagName === 'BUTTON')) void keys.current.confirm();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Sons et vibrations, tirés de l'état ──
  const began = useRef(false);
  useEffect(() => {
    if (began.current) return;
    began.current = true;
    if (g.stage === 'setup') sfx.start();
  }, [g.stage]);
  const turnKey = g.stage === 'bid' ? `${bidKey}:${g.turn}` : '';
  useEffect(() => {
    if (myTurn) {
      sfx.turn();
      vibrate([20, 60, 20]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey]);
  const left = g.endsAt ? secondsLeft(g.endsAt, now) : -1;
  useEffect(() => {
    if (myTurn && left > 0 && left <= 5) sfx.tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);
  const r = g.result;
  const resultKey = r ? `${r.round}:${r.attempt}:${r.kind}` : '';
  const [landed, setLanded] = useState('');
  useEffect(() => {
    if (!r || (g.stage !== 'result' && g.stage !== 'over')) return;
    if (r.kind === 'won') sfx.stamp(false);
    else if (r.kind === 'void') sfx.void();
    else sfx.discard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey]);
  // Mon plan est tombé : moi seul le sais.
  const mineLanded = !!r && r.kind === 'won' && !!me?.won && landed === resultKey;
  useEffect(() => {
    if (!mineLanded) return;
    sfx.stamp(true);
    vibrate([30, 40, 90]);
    burst(boardRef.current);
  }, [mineLanded]);
  const landCount = useRef({ key: '', n: 0 });
  const onLand = (row: number) => {
    sfx.drop(row);
    if (landCount.current.key !== resultKey) landCount.current = { key: resultKey, n: 0 };
    landCount.current.n++;
    if (r && landCount.current.n >= r.placed.length) setLanded(resultKey);
  };

  // ── Ce que montre la table ──
  const showResult = (g.stage === 'result' || g.stage === 'over') && !!r;
  const falling = showResult && r.kind === 'won' ? { key: resultKey, placed: r.placed } : null;
  let ghosts: Placed[] = [];
  if (g.stage === 'bid' && lots && me) {
    if (me.bid) ghosts = project(g.board, lots[me.bid.lot], me.bid.plan);
    else if (canCompose && d.lot) ghosts = project(g.board, lots[d.lot], plan);
  }
  const turnName = g.turn ? nameOf(view, g.turn) : '';
  const autoBid = !!me?.bid && sentFor.current !== bidKey;

  let kicker: string;
  let message: ReactNode;
  if (g.stage === 'setup') {
    kicker = 'Composition';
    message = !seated ? 'Chacun range ses trois cartes en suite…' : me.ready ? 'Suite validée : la première manche commence quand tout le monde est prêt.' : 'La première manche commence quand tout le monde est prêt.';
  } else if (g.stage === 'bid') {
    kicker = g.attempt > 0 ? `Au guichet · ${g.attempt + 1}e essai` : 'Au guichet';
    if (myTurn) message = <b>À toi ! Mise en secret sur un lot.</b>;
    else if (me?.bid) message = autoBid ? `Temps écoulé : le pilote automatique a misé pour toi. ${capitalName(turnName)} est au guichet.` : `Ta mise est faite. ${capitalName(turnName)} est au guichet.`;
    else if (seated && tickets === 0) message = `Tu n’as plus de tickets : ton passage au guichet se fera tout seul. ${capitalName(turnName)} est au guichet.`;
    else message = `${capitalName(turnName)} est au guichet.${seated ? ' Prépare ta mise en attendant.' : ''}`;
  } else {
    kicker = `Manche ${r?.round ?? g.round} jouée`;
    if (!r) message = '';
    else if (r.kind === 'won')
      message = (
        <>
          Le lot {r.lot} est adjugé : <b>{plural(r.total ?? 0, 'ticket')}</b> misés en tout.
        </>
      );
    else if (r.kind === 'void') message = `Enchère annulée : chacun récupère ses tickets, et on remise sur les mêmes lots${r.attempt + 2 >= MAX_VOIDS ? ' (dernier essai)' : ''}.`;
    else message = r.broke ? 'Plus personne n’a de tickets : les deux lots sont écartés.' : `${MAX_VOIDS} enchères annulées : les deux lots sont écartés.`;
    if (g.stage === 'over') message = <>{message} C’était la dernière manche : on compte les points…</>;
  }

  const stampFor = (lot: Lot): { text: string; tone: 'won' | 'off' | 'void' } | null => {
    if (!showResult) return null;
    if (r.kind === 'won') return r.lot === lot ? { text: 'Adjugé', tone: 'won' } : { text: 'Écarté', tone: 'off' };
    if (r.kind === 'void') return { text: 'Annulée', tone: 'void' };
    return { text: 'Écarté', tone: 'off' };
  };

  let hint: ReactNode = null;
  let cta = '';
  if (canCompose && lots) {
    if (!d.lot) {
      hint = 'Choisis un lot : touche la caisse A ou la caisse B.';
      cta = 'Choisis un lot';
    } else if (!planReady) {
      hint = pickAnimal ? (
        <>
          Touche une colonne du plateau pour y lâcher <b>{ANIMAL_NAME[pickAnimal].art}</b> {ANIMAL_EMOJI[pickAnimal]}. Touche un autre cube du lot pour changer.
        </>
      ) : null;
      const k = lots[d.lot].length - plan.length;
      cta = `Place encore ${plural(k, 'cube')}`;
    } else {
      hint = (
        <>
          Plan prêt pour le lot {d.lot}. S’il est adjugé à ta mise, tes cubes tomberont ainsi. <b>Le lot le moins cher est adjugé</b>, à sa plus grosse mise.
        </>
      );
      cta = myTurn ? `Miser ${plural(amt, 'ticket')} sur le lot ${d.lot}` : 'Prêt : attends ton tour';
    }
  }

  const total = g.stage === 'setup' ? SETUP_SECONDS : view.settings.timer || 90;

  return (
    <div className={cls('table-screen', `stage-${g.stage}`, myTurn && 'is-my-turn')}>
      <header className="table-top">
        <span className="table-logo">
          <Logo size="sm" />
        </span>
        {g.round > 0 && (
          <span className="round-chip">
            <small>Manche</small>
            <b>
              {g.round}
              <i>/{g.rounds}</i>
            </b>
            <RoundDots g={g} />
          </span>
        )}
        <div className="table-tools">
          <button type="button" className={cls('icon-btn', react && 'is-on')} aria-label="Réagir" aria-expanded={react} onClick={() => setReact((x) => !x)}>
            <Smile size={20} />
          </button>
          <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setMenu(true)}>
            <MoreHorizontal size={20} />
          </button>
        </div>
        {react && <ReactionTray onClose={() => setReact(false)} />}
      </header>

      <div className="table-body">
        <div className="table-main">
          <section className={cls('status', myTurn && 'is-mine')} aria-live="polite">
            <div className="status-head">
              <span className="status-kicker">{kicker}</span>
              {(g.stage === 'setup' || g.stage === 'bid') && <Timer endsAt={g.endsAt} total={total} now={now} />}
            </div>
            <p className="status-msg">{message}</p>
          </section>

          {g.stage === 'setup' ? (
            seated ? (
              <SetupPanel view={view} me={me} />
            ) : (
              <p className="watch-note panel">Tu regardes la partie : tu joueras à la prochaine.</p>
            )
          ) : (
            <>
              <div className="board-wrap" ref={boardRef}>
                <Board board={g.board} ghosts={ghosts} falling={falling} pick={pickAnimal} onColumn={canCompose ? dropIn : undefined} onLand={onLand}>
                  <AnimatePresence>
                    {mineLanded && (
                      <motion.span key={resultKey} className="mine-badge" initial={{ scale: 0.5, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 16 }}>
                        C’est ton plan !<small>toi seul le sais</small>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Board>
              </div>
              {lots && (
                <div className="crates">
                  {LOTS.map((lot) => (
                    <Crate
                      key={lot}
                      lot={lot}
                      blocks={lots[lot]}
                      chosen={(canCompose && d.lot === lot) || (!!me?.bid && me.bid.lot === lot && g.stage === 'bid')}
                      used={canCompose && d.lot === lot ? used : new Set()}
                      pick={d.lot === lot ? pick : null}
                      interactive={canCompose}
                      stamp={stampFor(lot)}
                      leaving={!!falling && r?.lot === lot}
                      onChoose={() => chooseLot(lot)}
                      onPick={(t) => pickBlock(lot, t)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="table-side">
          <Players view={view} emotes={emotes} />
          {seated && g.stage !== 'setup' && <Sheet me={me} />}
          {seated && g.stage === 'bid' && (
            <section className={cls('composer', myTurn && 'is-mine')}>
              {canCompose ? (
                <>
                  {hint && <p className="composer-hint">{hint}</p>}
                  {d.lot && (
                    <div className="composer-tools">
                      <Button variant="soft" {...noMouseFocus} icon={<Undo2 size={16} />} disabled={!plan.length} onClick={undo}>
                        Reprendre
                      </Button>
                      <Button variant="soft" {...noMouseFocus} icon={<Eraser size={16} />} disabled={!plan.length} onClick={clear}>
                        Tout effacer
                      </Button>
                    </div>
                  )}
                  <div className="amount" role="group" aria-label="Ta mise">
                    <span className="amount-label">Ta mise</span>
                    <button type="button" className="icon-btn amount-step amount-minus" {...noMouseFocus} aria-label="Un ticket de moins" disabled={amt <= 1} onClick={() => setAmount(amt - 1)}>
                      <Minus size={18} strokeWidth={3} />
                    </button>
                    <Ticket n={amt} className="amount-ticket" />
                    <button type="button" className="icon-btn amount-step amount-plus" {...noMouseFocus} aria-label="Un ticket de plus" disabled={amt >= tickets} onClick={() => setAmount(amt + 1)}>
                      <Plus size={18} strokeWidth={3} />
                    </button>
                    <input className="amount-range" type="range" min={1} max={Math.max(1, tickets)} value={amt} aria-label="Nombre de tickets misés" onChange={(e) => setAmount(Number(e.target.value))} />
                  </div>
                  <Button variant="primary" className="btn-lg btn-wide composer-go" disabled={!myTurn || !planReady || busy} onClick={() => void confirm()}>
                    {busy ? 'Au guichet…' : cta}
                  </Button>
                  <p className="composer-note">Tes tickets misés sont perdus, même si ton lot n’est pas adjugé. Ils ne te reviennent que si l’enchère est annulée.</p>
                </>
              ) : me.bid ? (
                <div className="my-bid">
                  <Ticket n={me.bid.amount} />
                  <p>
                    {autoBid ? 'Le pilote automatique a misé' : 'Tu as misé'} <b>{plural(me.bid.amount, 'ticket')}</b> sur le <b>lot {me.bid.lot}</b>. Ton plan est en pointillés sur le plateau.
                  </p>
                </div>
              ) : (
                <p className="composer-hint">Plus de tickets : tu ne peux plus miser, mais tu passes au guichet comme tout le monde, pour que personne ne le sache.</p>
              )}
            </section>
          )}
          {!seated && g.stage !== 'setup' && <p className="watch-note">Tu regardes la partie : tu joueras à la prochaine.</p>}
        </div>
      </div>

      <Modal
        open={menu}
        onClose={() => {
          setMenu(false);
          setConfirmStop(false);
        }}
        title="Menu"
      >
        <div className="menu-list">
          <Button icon={prefs.sound ? <Volume2 size={18} /> : <VolumeX size={18} />} onClick={() => setPrefs({ sound: !prefs.sound })}>
            Son : {prefs.sound ? 'activé' : 'coupé'}
          </Button>
          <Button
            icon={<BookOpen size={18} />}
            onClick={() => {
              setMenu(false);
              setRulesOpen(true);
            }}
          >
            Les règles
          </Button>
          {isHost && (
            <Button
              variant="danger"
              icon={<Flag size={18} />}
              onClick={() => {
                // Deux appuis : un geste malheureux ne doit pas couper la partie de toute la table.
                if (!confirmStop) {
                  setConfirmStop(true);
                  return;
                }
                setConfirmStop(false);
                setMenu(false);
                void send('game:end');
              }}
            >
              {confirmStop ? 'Confirmer : arrêter pour tout le monde' : 'Arrêter la partie'}
            </Button>
          )}
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter la table
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function capitalName(s: string): string {
  return s === 'toi' ? 'Toi' : s;
}
