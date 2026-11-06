// Le plateau : un casier de bois de 5 colonnes sur 5, où les cubes tombent tout en bas de leur colonne.
// Il montre les cubes posés, le plan qu'on prépare en pointillés, la chute du lot adjugé et, à la fin, les suites réussies.
import { motion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { SIZE, cellIndex, landingRow, type Animal, type Board as BoardT, type Placed } from '../../../shared/protocol';
import { ANIMAL_NAME } from '../lib/text';
import { cls, noMouseFocus } from '../lib/util';
import { Block } from './Ui';

interface Props {
  board: BoardT;
  /** Mon plan, dans l'ordre de chute : des cubes en pointillés. */
  ghosts?: Placed[];
  /** Le lot qui vient d'être adjugé : ses cubes tombent un à un. */
  falling?: { key: string; placed: Placed[] } | null;
  /** Les suites à souligner (indices des cases). */
  lines?: number[][];
  /** Le cube qu'on s'apprête à lâcher : les colonnes deviennent des cibles. */
  pick?: Animal | null;
  onColumn?: (col: number) => void;
  /** Un cube qui touche le fond, pendant la chute du lot adjugé. */
  onLand?: (row: number) => void;
  className?: string;
  children?: ReactNode;
}

/** Hauteur de chute, en tailles de cube : de la case jusqu'au-dessus du casier. */
const fall = (row: number) => `${-(SIZE - row) * 112 - 20}%`;

export function Board({ board, ghosts = [], falling, lines = [], pick, onColumn, onLand, className, children }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const withGhosts = [...board];
  for (const gh of ghosts) withGhosts[cellIndex(gh.col, gh.row)] = gh.animal;
  const fallingAt = new Map((falling?.placed ?? []).map((p, i) => [cellIndex(p.col, p.row), i]));
  const ghostAt = new Map(ghosts.map((p, i) => [cellIndex(p.col, p.row), { p, i }]));
  const lineCells = new Set(lines.flat());
  const targets = !!(pick && onColumn);
  const open = Array.from({ length: SIZE }, (_, col) => landingRow(withGhosts, col));
  const preview = targets && hover !== null && open[hover] >= 0 ? cellIndex(hover, open[hover]) : -1;

  const cells: ReactNode[] = [];
  for (let row = SIZE - 1; row >= 0; row--) {
    for (let col = 0; col < SIZE; col++) {
      const idx = cellIndex(col, row);
      const real = board[idx];
      const gh = ghostAt.get(idx);
      const f = fallingAt.get(idx);
      let content: ReactNode = null;
      if (real && f !== undefined && falling) {
        content = (
          <motion.span
            key={`${falling.key}-${idx}`}
            className="cell-fill"
            initial={{ y: fall(row) }}
            animate={{ y: [fall(row), '0%', '-9%', '0%'] }}
            transition={{ delay: 0.35 + f * 0.55, duration: 0.6, times: [0, 0.68, 0.84, 1], ease: 'easeIn' }}
            onAnimationComplete={() => onLand?.(row)}
          >
            <Block animal={real} />
          </motion.span>
        );
      } else if (real) {
        content = (
          <span key={`b-${idx}`} className="cell-fill">
            <Block animal={real} />
          </span>
        );
      } else if (gh) {
        content = (
          <motion.span key={`g-${idx}-${gh.p.animal}-${gh.i}`} className="cell-fill" initial={{ y: fall(row) }} animate={{ y: '0%' }} transition={{ duration: 0.28, ease: 'easeIn' }}>
            <Block animal={gh.p.animal} ghost />
          </motion.span>
        );
      } else if (idx === preview && pick) {
        content = (
          <span key={`p-${idx}`} className="cell-fill is-preview">
            <Block animal={pick} ghost />
          </span>
        );
      }
      cells.push(
        <span key={idx} className={cls('cell', lineCells.has(idx) && 'is-line')}>
          <span className="cell-hole" />
          {content}
        </span>,
      );
    }
  }

  return (
    <div className={cls('rack', targets && 'is-targeting', className)}>
      <div className="rack-frame">
        <div className="rack-grid" role="img" aria-label={describe(board)}>
          {cells}
          {lines.length > 0 && (
            <svg className="rack-lines" viewBox={`0 0 ${SIZE} ${SIZE}`} preserveAspectRatio="none" aria-hidden>
              {lines.map((l, i) => {
                const a = l[0];
                const c = l[2];
                const x1 = (a % SIZE) + 0.5;
                const y1 = SIZE - 1 - Math.floor(a / SIZE) + 0.5;
                const x2 = (c % SIZE) + 0.5;
                const y2 = SIZE - 1 - Math.floor(c / SIZE) + 0.5;
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
              })}
            </svg>
          )}
        </div>
        {onColumn && (
          <div className="rack-cols">
            {open.map((row, col) => (
              <button
                key={col}
                type="button"
                {...noMouseFocus}
                className={cls('rack-col', targets && row >= 0 && 'is-open', hover === col && 'is-hover')}
                disabled={!targets || row < 0}
                aria-label={pick ? `Lâcher ${ANIMAL_NAME[pick].art} dans la colonne ${col + 1}` : `Colonne ${col + 1}`}
                onPointerEnter={(e) => {
                  if (e.pointerType === 'mouse') setHover(col);
                }}
                onPointerLeave={() => setHover((h) => (h === col ? null : h))}
                onClick={() => onColumn(col)}
              >
                <span className="rack-arrow" aria-hidden>
                  <ArrowDown size={16} strokeWidth={3} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function describe(board: BoardT): string {
  const n = board.filter(Boolean).length;
  return n === 0 ? 'Plateau vide' : `Plateau : ${n} cube${n > 1 ? 's' : ''} posé${n > 1 ? 's' : ''}`;
}
