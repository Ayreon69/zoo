// Fin de partie : le classement aux points, puis tout est dévoilé. Les suites de chacun se surlignent sur le plateau,
// les conditions secrètes et les tickets restants se montrent, et le grand tableau rejoue chaque passage au guichet.
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { Check, Eye, LogOut, RotateCcw, Trophy, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FinalPlayer, RevealAttempt, RoomView } from '../../../shared/protocol';
import { Board } from '../components/Board';
import { Avatar, Backdrop, Block, Button, Logo, Ticket, seatColor } from '../components/Ui';
import { sfx } from '../lib/sound';
import { conditionText, listing, placeLabel } from '../lib/text';
import { cls, plural, reducedMotion } from '../lib/util';
import { leaveRoom, send } from '../net';

/** Pourquoi une enchère a été annulée, enfin dévoilé. */
function voidReason(h: RevealAttempt): string {
  if (!h.bids.length) return 'plus personne n’avait de tickets';
  if (h.totals.A === h.totals.B) return 'les deux lots au même prix';
  const cheap = h.totals.A < h.totals.B ? 'A' : 'B';
  const on = h.bids.filter((b) => b.lot === cheap);
  if (!on.length) return `personne sur le lot ${cheap}, le moins cher`;
  return `plus grosse mise à égalité sur le lot ${cheap}`;
}

function Detail({ p }: { p: FinalPlayer }) {
  const n = p.lines.length;
  if (!n) return <>aucune suite</>;
  return (
    <>
      {plural(n, 'suite')}
      {p.conditionMet ? ' × 2' : ''}
    </>
  );
}

export function Final({ view }: { view: RoomView }) {
  const final = view.final!;
  const isHost = view.hostId === view.me;
  const mine = final.players.find((p) => p.id === view.me);
  const winners = final.players.filter((p) => p.winner);
  const good = !!mine?.winner;
  const once = useRef(false);
  const byId = new Map(final.players.map((p) => [p.id, p]));
  const [focus, setFocus] = useState(() => (winners[0]?.points ? winners[0].id : (mine?.id ?? winners[0]?.id ?? '')));
  const focused = byId.get(focus);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    sfx.fanfare(good);
    if (reducedMotion() || !good) return;
    const t = window.setTimeout(() => {
      void confetti({ particleCount: 170, spread: 100, origin: { y: 0.3 }, colors: ['#e8473b', '#f6b326', '#3faa55', '#3c7fd8', '#9058c8', '#fffaf0'], shapes: ['square'], scalar: 1, disableForReducedMotion: true });
    }, 400);
    return () => window.clearTimeout(t);
  }, [good]);

  const who = (p: FinalPlayer | undefined) => (!p ? '?' : p.id === view.me ? 'Toi' : p.name);
  const top = winners[0];
  let title: string;
  if (!top || top.points === 0) title = 'Personne ne marque';
  else if (winners.length > 1) title = winners.some((w) => w.id === view.me) ? 'Victoire partagée !' : `Égalité : ${listing(winners.map((w) => w.name))}`;
  else if (good) title = 'Tu gagnes !';
  else title = `${top.name} gagne`;
  let reason = '';
  if (top && top.points === 0) reason = 'Aucune suite sur le plateau : tout le monde finit à 0 point, à égalité.';
  else if (top) reason = `${plural(top.points, 'point')}${winners.length > 1 ? ' chacun' : ''} : ${plural(top.lines.length, 'suite')} sur le plateau${top.conditionMet ? ', et la condition remplie double le tout' : ''}.`;

  const rounds = [...new Set(final.history.map((h) => h.round))];

  return (
    <Backdrop quiet>
      <div className="final">
        <header className="final-top">
          <Logo size="sm" />
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
        </header>

        <motion.section className={cls('final-hero', good && 'is-good')} initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
          <span className="eyebrow">Partie terminée</span>
          <h1>{title}</h1>
          <p className="final-reason">{reason}</p>
        </motion.section>

        <div className="final-grid">
          <section className="panel final-board">
            <h3>Le plateau final</h3>
            {focused && (
              <p className="final-focus">
                <span className="mini-line" aria-hidden>
                  {focused.cards.map((a, i) => (
                    <Block key={i} animal={a} />
                  ))}
                </span>
                <span>
                  {focused.lines.length ? (
                    <>
                      Les suites {focused.id === view.me ? 'de ta suite' : `de ${focused.name}`} : <b>{plural(focused.lines.length, 'alignement')}</b>.
                    </>
                  ) : (
                    <>{focused.id === view.me ? 'Ta suite' : `La suite de ${focused.name}`} n’apparaît nulle part.</>
                  )}
                </span>
              </p>
            )}
            <Board board={final.board} lines={focused?.lines ?? []} />
            <p className="muted small">Touche un joueur du classement pour voir ses suites.</p>
          </section>

          <section className="panel final-table">
            <h3>Le classement</h3>
            <p className="muted small">Une suite alignée vaut 1 point, et la condition remplie double le tout. Tout est dévoilé : les suites, les conditions secrètes et les tickets restants.</p>
            <ol className="final-list">
              {final.players.map((p, i) => (
                <motion.li key={p.id} initial={{ x: -14, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.25 + i * 0.07 }}>
                  <button
                    type="button"
                    className={cls('final-row', p.winner && p.points > 0 && 'is-winner', p.id === view.me && 'is-me', p.id === focus && 'is-focus')}
                    style={{ ['--seat' as string]: seatColor(p.seat) }}
                    aria-pressed={p.id === focus}
                    onClick={() => setFocus(p.id)}
                  >
                    <span className="final-place">{placeLabel(p.place)}</span>
                    <span className="final-who">
                      <b className="final-name">
                        <Avatar avatar={p.avatar} /> {who(p)}
                        {p.wins > 0 && (
                          <span className="final-wins" title="Parties gagnées à cette table, ce soir">
                            <Trophy size={12} aria-hidden /> {p.wins}
                          </span>
                        )}
                      </b>
                      <span className="final-cards">
                        <span className="mini-line">
                          {p.cards.map((a, k) => (
                            <span key={k} className={cls('suite-card', k === p.shown && 'is-shown')}>
                              <Block animal={a} />
                              {k === p.shown && (
                                <span className="suite-eye" aria-label="La carte montrée">
                                  <Eye size={9} strokeWidth={3} />
                                </span>
                              )}
                            </span>
                          ))}
                        </span>
                        <span className={cls('final-cond', p.conditionMet ? 'is-met' : 'is-missed')} title={conditionText(p.condition)} aria-label={`${conditionText(p.condition)} : ${p.conditionMet ? 'remplie' : 'manquée'}`}>
                          <Block animal={p.condition[0]} />
                          <i aria-hidden>&gt;</i>
                          <Block animal={p.condition[1]} />
                          {p.conditionMet ? <Check size={14} strokeWidth={3.5} aria-hidden /> : <X size={14} strokeWidth={3.5} aria-hidden />}
                        </span>
                      </span>
                    </span>
                    <span className="final-score">
                      <b>{p.points}</b>
                      <small>
                        <Detail p={p} />
                      </small>
                    </span>
                    <Ticket n={p.tickets} className="final-tickets" label={`${plural(p.tickets, 'ticket')} restants`} />
                  </button>
                </motion.li>
              ))}
            </ol>
            <p className="muted small">Le trophée compte les parties gagnées à cette table ; le ticket, ce qu’il restait à chacun.</p>
          </section>
        </div>

        <section className="panel reveal">
          <h3>Le grand dévoilement</h3>
          <p className="muted small">Chaque passage au guichet : qui a misé combien, et sur quel lot. Le lot le moins cher partait à sa plus grosse mise.</p>
          {rounds.map((round) => (
            <div key={round} className="reveal-round">
              <h4>Manche {round}</h4>
              <ol className="reveal-list">
                {final.history
                  .filter((h) => h.round === round)
                  .map((h) => {
                    const winner = h.winner ? byId.get(h.winner) : undefined;
                    return (
                      <li key={`${h.round}-${h.attempt}`} className={cls('reveal-row', `is-${h.kind}`)}>
                        <div className="reveal-head">
                          <b>
                            {h.kind === 'won' ? (
                              <>
                                Lot {h.lot} adjugé à {who(winner)}
                              </>
                            ) : h.kind === 'void' ? (
                              'Annulée'
                            ) : (
                              'Lots écartés'
                            )}
                          </b>
                          {h.kind !== 'won' && <small>{voidReason(h)}</small>}
                          {h.bids.length > 0 && (
                            <span className="reveal-totals">
                              A&nbsp;<b>{h.totals.A}</b> · B&nbsp;<b>{h.totals.B}</b>
                            </span>
                          )}
                        </div>
                        {h.bids.length > 0 && (
                          <span className="reveal-bids">
                            {h.bids.map((b) => {
                              const p = byId.get(b.id);
                              return (
                                <span key={b.id} className={cls('reveal-bid', h.kind === 'won' && h.winner === b.id && 'is-won')} style={{ ['--seat' as string]: seatColor(p?.seat) }}>
                                  <Avatar avatar={p?.avatar ?? ''} />
                                  <span className="reveal-name">{who(p)}</span>
                                  <b>{b.amount}</b>
                                  <i>{b.lot}</i>
                                </span>
                              );
                            })}
                          </span>
                        )}
                      </li>
                    );
                  })}
              </ol>
            </div>
          ))}
        </section>

        <div className="lobby-cta">
          {isHost ? (
            <Button variant="primary" className="btn-lg btn-wide" icon={<RotateCcw size={20} />} onClick={() => void send('game:restart')}>
              Rejouer
            </Button>
          ) : (
            <div className="waiting" role="status">
              <span className="spinner" /> En attente de la revanche…
            </div>
          )}
        </div>
      </div>
    </Backdrop>
  );
}
