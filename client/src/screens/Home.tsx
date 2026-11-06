// Accueil : des cubes qui tombent jusqu'à aligner une suite ; pseudo + avatar, créer / rejoindre une table, jouer contre des bots, règles.
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Bot, House, LogIn, MessageSquare, Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AVATARS, MAX_PLAYERS, MIN_PLAYERS, cellIndex, emptyBoard, landingRow, suiteLines, type Animal, type Board as BoardT, type Placed } from '../../../shared/protocol';
import { Board } from '../components/Board';
import { AVATAR_EMOJI, AVATAR_LABELS, Backdrop, Block, Button, Logo } from '../components/Ui';
import { cls, reducedMotion } from '../lib/util';
import { codeFromUrl, createRoom, joinRoom } from '../net';
import { useStore } from '../store';

const BOTS_KEY = 'zo.bots';
const MAX_BOTS = MAX_PLAYERS - 1;
const MIN_BOTS = MIN_PLAYERS - 1;

function savedBots(): number {
  try {
    const n = Number(localStorage.getItem(BOTS_KEY));
    return n >= MIN_BOTS && n <= MAX_BOTS ? n : 4;
  } catch {
    return 4;
  }
}

/** La démonstration : des cubes tombent dans le casier jusqu'à aligner une suite, qui se surligne, puis tout recommence. */
const DEMO_SUITE: Animal[] = ['serpent', 'perroquet', 'elephant'];
const DEMO_DROPS: [number, Animal][] = [
  [0, 'lion'],
  [1, 'singe'],
  [2, 'serpent'],
  [0, 'serpent'],
  [4, 'perroquet'],
  [1, 'perroquet'],
  [3, 'elephant'],
  [2, 'elephant'],
];

function demoBoard(n: number): { board: BoardT; last: Placed | null } {
  const board = emptyBoard();
  let last: Placed | null = null;
  for (const [col, animal] of DEMO_DROPS.slice(0, n)) {
    const row = landingRow(board, col);
    board[cellIndex(col, row)] = animal;
    last = { animal, col, row };
  }
  return { board, last };
}

function HeroDrops() {
  const still = reducedMotion();
  const total = DEMO_DROPS.length;
  // n : cubes tombés ; n = total + 1 : la suite s'allume, une fois le dernier cube posé.
  const [n, setN] = useState(still ? total + 1 : 0);
  const [loop, setLoop] = useState(0);
  useEffect(() => {
    if (still) return;
    const t = window.setTimeout(
      () => {
        if (n > total) {
          setN(0);
          setLoop((x) => x + 1);
        } else setN(n + 1);
      },
      n > total ? 3000 : n === total ? 1000 : n === 0 ? 900 : 720,
    );
    return () => window.clearTimeout(t);
  }, [n, still, total]);
  const { board, last } = demoBoard(Math.min(n, total));
  const done = n > total;
  const lines = done ? suiteLines(board, DEMO_SUITE) : [];
  return (
    <div className={cls('hero-drops', done && 'is-done')} aria-hidden>
      <Board key={loop} board={board} lines={lines} falling={last && !still && n <= total ? { key: `${loop}-${n}`, placed: [last] } : null} />
      <div className="hero-caption">
        <span className="mini-line">
          {DEMO_SUITE.map((a) => (
            <Block key={a} animal={a} />
          ))}
        </span>
        <AnimatePresence mode="wait">
          <motion.span key={done ? 'done' : 'run'} className="hero-hint" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {done ? (
              <>
                <b>Suite alignée :</b> 1 point !
              </>
            ) : (
              'Ta suite secrète : aligne-la sur le plateau.'
            )}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

export function Home() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const conn = useStore((s) => s.conn);
  const [invited, setInvited] = useState(codeFromUrl);
  const [code, setCode] = useState('');
  const [bots, setBots] = useState(savedBots);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setInvited(codeFromUrl());
    window.addEventListener('zo:url', sync);
    return () => window.removeEventListener('zo:url', sync);
  }, []);
  const nameOk = profile.name.trim().length > 0;

  const run = async (key: string, fn: () => Promise<boolean>) => {
    if (busy) return;
    if (!nameOk) {
      useStore.getState().showToast('Choisis d’abord un pseudo.', 'info');
      document.getElementById('pseudo')?.focus();
      return;
    }
    setBusy(key);
    await fn();
    setBusy(null);
  };

  const changeBots = (d: number) => {
    const n = Math.max(MIN_BOTS, Math.min(MAX_BOTS, bots + d));
    setBots(n);
    try {
      localStorage.setItem(BOTS_KEY, String(n));
    } catch {
      /* stockage indisponible */
    }
  };

  const cleanCode = code.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);

  return (
    <Backdrop className="home">
      <div className="home-links">
        <a className="all-games" href="https://akhis-games.onrender.com">
          <House size={16} aria-hidden /> Tous les jeux
        </a>
        <a className="all-games" href="https://akhis-games.onrender.com/feedback.html?jeu=zoo">
          <MessageSquare size={16} aria-hidden /> Feedback
        </a>
      </div>
      <header className="home-hero">
        <motion.div initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
          <Logo size="lg" />
        </motion.div>
        <p className="tagline">
          À chaque manche, deux lots de cubes animaux. On mise <b>en secret</b>, et c’est <b>le lot le moins cher</b> qui est adjugé. Fais tomber tes trois animaux <b>en ligne</b>.
        </p>
        <HeroDrops />
      </header>

      <motion.section className="panel home-panel" initial={{ y: 26, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15, duration: 0.45 }}>
        {invited && (
          <div className="invite-banner">
            Invitation à la table <b>{invited}</b> : choisis ton pseudo et entre !
          </div>
        )}
        <label className="field-label" htmlFor="pseudo">
          Ton pseudo
        </label>
        <input
          id="pseudo"
          className="input input-lg"
          placeholder="Ex. Pistache"
          value={profile.name}
          maxLength={16}
          autoComplete="nickname"
          onChange={(e) => setProfile({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && invited) void run('join', () => joinRoom(invited));
          }}
        />
        <span className="field-label" id="avatar-label">
          Ton avatar
        </span>
        <div className="avatar-picker" role="radiogroup" aria-labelledby="avatar-label">
          {AVATARS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={profile.avatar === a} aria-label={AVATAR_LABELS[a]} className={cls('avatar-opt', profile.avatar === a && 'is-on')} onClick={() => setProfile({ avatar: a })}>
              {AVATAR_EMOJI[a]}
            </button>
          ))}
        </div>

        {invited ? (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<LogIn size={20} />} disabled={!!busy} onClick={() => run('join', () => joinRoom(invited))}>
              {busy === 'join' ? 'Connexion…' : `Rejoindre la table ${invited}`}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                window.history.replaceState(null, '', '/');
                setInvited(null);
              }}
            >
              Créer ma propre table à la place
            </Button>
          </div>
        ) : (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<Plus size={20} />} disabled={!!busy} onClick={() => run('create', () => createRoom())}>
              {busy === 'create' ? 'Création…' : 'Créer une table'}
            </Button>
            <div className="join-row">
              <input
                className="input code-input"
                placeholder="CODE"
                value={cleanCode}
                maxLength={4}
                aria-label="Code de la table"
                autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && cleanCode.length === 4) void run('join', () => joinRoom(cleanCode));
                }}
              />
              <Button icon={<LogIn size={18} />} disabled={cleanCode.length !== 4 || !!busy} onClick={() => run('join', () => joinRoom(cleanCode))}>
                Rejoindre
              </Button>
            </div>
            <div className="bots-row">
              <Button className="bots-go" icon={<Bot size={18} />} disabled={!!busy} onClick={() => run('bots', () => createRoom({ bots, autostart: true }))}>
                {busy === 'bots' ? 'Préparation…' : `Jouer contre ${bots} bot${bots > 1 ? 's' : ''}`}
              </Button>
              <div className="stepper" role="group" aria-label="Nombre de bots">
                <button type="button" className="icon-btn" aria-label="Un bot de moins" disabled={bots <= MIN_BOTS} onClick={() => changeBots(-1)}>
                  <Minus size={16} />
                </button>
                <button type="button" className="icon-btn" aria-label="Un bot de plus" disabled={bots >= MAX_BOTS} onClick={() => changeBots(1)}>
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
        <Button variant="ghost" className="rules-link" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
          Les règles en 2 minutes
        </Button>
        {conn !== 'online' && (
          <p className="wake-note" role="status">
            <span className="spinner" /> Réveil du serveur… (jusqu'à une minute la première fois)
          </p>
        )}
      </motion.section>

      <footer className="home-foot">
        D'après l'épreuve <i>Zoo</i> du 4e jour de <i>The Devil's Plan</i> (Netflix, saison 1). Création de fans, non officielle.
      </footer>
    </Backdrop>
  );
}
