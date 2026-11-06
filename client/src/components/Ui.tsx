// Briques d'interface communes : boutons, fenêtres, pastilles, sélecteurs, le logo en cubes de bois,
// les avatars, les cubes animaux et les tickets du guichet.
import { X } from 'lucide-react';
import { useEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Animal } from '../../../shared/protocol';
import { ANIMAL_EMOJI, ANIMAL_NAME } from '../lib/text';
import { cls } from '../lib/util';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'soft';
  icon?: ReactNode;
}

export function Button({ variant = 'default', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cls('btn', `btn-${variant}`, className)} {...rest}>
      {icon}
      {children && <span className="btn-label">{children}</span>}
    </button>
  );
}

/** Le titre : trois cubes de bois peints, empilés comme des jouets. */
export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={cls('logo', `logo-${size}`)} role="img" aria-label="Zoo">
      <span className="logo-cube is-z" aria-hidden>
        Z
      </span>
      <span className="logo-cube is-o1" aria-hidden>
        O
      </span>
      <span className="logo-cube is-o2" aria-hidden>
        O
      </span>
    </div>
  );
}

/** Le décor : le mur de la salle de jeux, ses rayures et quelques empreintes. */
export function Backdrop({ children, className, quiet = false }: { children: ReactNode; className?: string; quiet?: boolean }) {
  return (
    <div className={cls('backdrop', quiet && 'is-quiet', className)}>
      <div className="wallpaper" aria-hidden />
      <div className="backdrop-body">{children}</div>
    </div>
  );
}

export function Pill({ tone, children, className }: { tone?: 'gold' | 'ink' | 'soft' | 'red'; children: ReactNode; className?: string }) {
  return <span className={cls('pill', tone && `pill-${tone}`, className)}>{children}</span>;
}

interface SegmentedOption<T> {
  value: T;
  label: string;
  sub?: string;
  disabled?: boolean;
}

export function Segmented<T extends string | number | boolean>({ options, value, onChange, disabled, label }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled || o.disabled}
          className={cls('seg', o.value === value && 'is-on')}
          onClick={() => onChange(o.value)}
        >
          <b>{o.label}</b>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

/**
 * Une fenêtre, rendue à la racine du document pour ne dépendre d'aucun parent.
 * Elle s'ouvre avec un petit mouvement en CSS et se ferme d'un coup.
 */
export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => box.current?.querySelector<HTMLElement>('[data-autofocus], .modal-body button, .modal-body input')?.focus({ preventScroll: true }), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      before?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div ref={box} className={cls('modal', wide && 'is-wide')} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export const AVATAR_EMOJI: Record<string, string> = {
  girafe: '🦒',
  zebre: '🦓',
  manchot: '🐧',
  flamant: '🦩',
  tortue: '🐢',
  hippo: '🦛',
  panda: '🐼',
  kangourou: '🦘',
  herisson: '🦔',
  phoque: '🦭',
  koala: '🐨',
  rhino: '🦏',
};

export const AVATAR_LABELS: Record<string, string> = {
  girafe: 'Girafe',
  zebre: 'Zèbre',
  manchot: 'Manchot',
  flamant: 'Flamant rose',
  tortue: 'Tortue',
  hippo: 'Hippopotame',
  panda: 'Panda',
  kangourou: 'Kangourou',
  herisson: 'Hérisson',
  phoque: 'Phoque',
  koala: 'Koala',
  rhino: 'Rhinocéros',
};

export function Avatar({ avatar, className }: { avatar: string; className?: string }) {
  return (
    <span className={cls('avatar', className)} aria-hidden>
      {AVATAR_EMOJI[avatar] ?? '🦒'}
    </span>
  );
}

/** La couleur de chaque place autour de la table, de 1 à 8 : des pastels de salle de jeux. */
export const SEAT_COLORS = ['#ff9f6b', '#7fd3e8', '#f7a8c8', '#b7e07a', '#c9a7f2', '#ffd166', '#8fd6b3', '#f4a259'];

export function seatColor(seat: number | null | undefined): string {
  return SEAT_COLORS[((seat ?? 1) - 1) % SEAT_COLORS.length];
}

/** Un cube de bois peint, avec l'animal en autocollant. Sa taille vient de --bs (ou de la case qui le contient). */
export function Block({ animal, ghost, className, style, title }: { animal: Animal; ghost?: boolean; className?: string; style?: CSSProperties; title?: string }) {
  return (
    <span className={cls('block', `is-${animal}`, ghost && 'is-ghost', className)} style={style} role="img" aria-label={title ?? ANIMAL_NAME[animal].one}>
      <span className="block-face" aria-hidden>
        {ANIMAL_EMOJI[animal]}
      </span>
    </span>
  );
}

/** Un ticket du guichet, avec son nombre. */
export function Ticket({ n, className, label }: { n: number | string; className?: string; label?: string }) {
  return (
    <span className={cls('ticket', className)} aria-label={label ?? `${n} ticket${typeof n === 'number' && n > 1 ? 's' : ''}`}>
      <b aria-hidden>{n}</b>
    </span>
  );
}
