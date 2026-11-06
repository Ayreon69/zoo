// Les mots de la table : noms, animaux, conditions, places et durée d'une partie.
import { ROUNDS, type Animal, type Condition, type RoomView, type TimerSetting } from '../../../shared/protocol';

export function nameOf(view: RoomView, id: string | undefined | null): string {
  if (!id) return '?';
  if (id === view.me) return 'toi';
  return view.players.find((p) => p.id === id)?.name ?? '?';
}

export function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** « Léa, Zino et Sam ». */
export function listing(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

/** « 1re », « 2e ». */
export function placeLabel(n: number): string {
  return n === 1 ? '1re' : `${n}e`;
}

export const ANIMAL_EMOJI: Record<Animal, string> = {
  serpent: '🐍',
  perroquet: '🦜',
  elephant: '🐘',
  lion: '🦁',
  singe: '🐒',
};

export const ANIMAL_NAME: Record<Animal, { one: string; many: string; art: string }> = {
  serpent: { one: 'serpent', many: 'serpents', art: 'le serpent' },
  perroquet: { one: 'perroquet', many: 'perroquets', art: 'le perroquet' },
  elephant: { one: 'éléphant', many: 'éléphants', art: 'l’éléphant' },
  lion: { one: 'lion', many: 'lions', art: 'le lion' },
  singe: { one: 'singe', many: 'singes', art: 'le singe' },
};

/** « plus de lions que de serpents » (sans élision : « que d'éléphants »). */
export function conditionText(c: Condition): string {
  const que = ANIMAL_NAME[c[1]].many.match(/^[aeéiou]/i) ? 'que d’' : 'que de ';
  const de = ANIMAL_NAME[c[0]].many.match(/^[aeéiou]/i) ? 'd’' : 'de ';
  return `plus ${de}${ANIMAL_NAME[c[0]].many} ${que}${ANIMAL_NAME[c[1]].many}`;
}

export const TIMER_LABEL: Record<TimerSetting, string> = { 45: '45 s', 90: '90 s', 0: 'Sans limite' };
export const TIMER_SUB: Record<TimerSetting, string> = { 45: 'nerveux', 90: 'conseillé', 0: 'on prend son temps' };

/**
 * La durée d'une partie : cinq manches, environ une enchère et demie par manche à cause des annulations,
 * et une vingtaine de secondes au guichet pour chacun, plus le temps de voir tomber les cubes.
 */
export function durationLine(players: number): string {
  const n = Math.max(3, players);
  const min = (ROUNDS * 1.5 * (n * 20 + 7)) / 60;
  return `${ROUNDS} manches : environ ${Math.max(5, Math.round(min / 5) * 5)} min de partie à ${n}.`;
}
