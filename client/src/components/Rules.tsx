// Les règles, lisibles en deux minutes et consultables à tout moment.
import { Ban, Brain, Gavel, Layers, Ticket as TicketIcon, Trophy } from 'lucide-react';
import { MAX_VOIDS, START_TICKETS, type Animal } from '../../../shared/protocol';
import { useStore } from '../store';
import { Block, Modal, Ticket } from './Ui';

const EXAMPLE: Animal[] = ['lion', 'singe', 'perroquet'];

export function RulesModal() {
  const open = useStore((s) => s.rulesOpen);
  const setOpen = useStore((s) => s.setRulesOpen);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Les règles" wide>
      <div className="rules">
        <section className="rule-hero">
          <p>
            Chacun cache une <b>suite de trois animaux</b>. En cinq manches, on enchérit sur des lots de cubes qui <b>tombent sur un plateau de 5 × 5</b>. À la fin, chaque fois que ta suite est alignée sur le plateau, tu marques <b>1 point</b>. Le plus de points gagne.
          </p>
        </section>

        <section>
          <h3>
            <Layers size={18} aria-hidden /> Avant la première manche
          </h3>
          <ol className="rule-steps">
            <li>
              Tu reçois <b>trois cartes animaux</b>. Range-les dans l’ordre de ta suite, et choisis-en <b>une que tout le monde verra</b>. L’ordre et les deux autres restent secrets.
            </li>
            <li>
              Tu reçois une <b>condition secrète</b>, du genre « plus de lions que de serpents » sur le plateau à la fin. Remplie, elle <b>double tes points</b>.
            </li>
            <li>
              Tu reçois <b>{START_TICKETS} tickets</b> pour toute la partie.
            </li>
          </ol>
          <div className="rule-example" aria-label="Exemple de suite">
            <span className="mini-line" aria-hidden>
              {EXAMPLE.map((a) => (
                <Block key={a} animal={a} />
              ))}
            </span>
            <p>
              Avec la suite lion, singe, perroquet, trois cases alignées <b>en ligne, en colonne ou en diagonale</b> qui montrent lion-singe-perroquet, ou perroquet-singe-lion, rapportent 1 point chacune.
            </p>
          </div>
        </section>

        <section>
          <h3>
            <Gavel size={18} aria-hidden /> Une manche
          </h3>
          <ol className="rule-steps">
            <li>
              Deux <b>lots de quatre cubes</b> sont tirés, l’un de la caisse A, l’autre de la caisse B. Tout le monde les voit.
            </li>
            <li>
              Chacun passe <b>au guichet</b> à son tour, et l’ordre s’inverse à chaque manche. Au guichet, on mise <b>en secret</b> : un lot, au moins 1 ticket, et l’endroit où tomberaient ses quatre cubes. Ils tombent tout en bas de leur colonne.
            </li>
            <li>
              Quand tout le monde est passé, <b>le lot le moins cher</b>, celui qui a reçu le moins de tickets en tout, est adjugé <b>à sa plus grosse mise</b>. L’autre lot est écarté.
            </li>
            <li>
              Les cubes tombent selon le plan du gagnant. On annonce le total des tickets misés sur les deux lots, mais <b>personne ne sait qui l’a emporté</b>.
            </li>
          </ol>
          <div className="rule-example" aria-label="Exemple d’enchère">
            <span className="rule-lots" aria-hidden>
              <span>
                A <Ticket n={3} /> <Ticket n={5} />
              </span>
              <span>
                B <Ticket n={4} /> <Ticket n={2} /> <Ticket n={7} />
              </span>
            </span>
            <p>
              Le lot A a reçu 8 tickets, le lot B 13 : <b>le lot A, le moins cher, part à la mise de 5</b>. On annonce 21 tickets misés en tout : ils sont tous dépensés, ceux du lot B aussi.
            </p>
          </div>
        </section>

        <section className="rule-split">
          <div className="rule-case">
            <h3>
              <Ban size={18} aria-hidden /> Enchère annulée
            </h3>
            <p>
              Les deux lots au même prix, personne sur le moins cher, ou deux plus grosses mises égales : l’enchère est annulée, <b>chacun récupère ses tickets</b> et on remise sur les mêmes lots. Au bout de {MAX_VOIDS} annulations, les deux lots sont écartés.
            </p>
          </div>
          <div className="rule-case">
            <h3>
              <TicketIcon size={18} aria-hidden /> Les tickets
            </h3>
            <p>
              Les tickets misés sont <b>perdus, même si ton lot n’est pas adjugé</b>. Tu peux tout miser d’un coup. Sans tickets, tu passes quand même au guichet, sans rien miser.
            </p>
          </div>
        </section>

        <section className="rule-warn">
          <h3>
            <Brain size={18} aria-hidden /> Ce que l’on sait
          </h3>
          <ul>
            <li>Le plateau, les deux lots, l’animal montré par chacun, et qui est déjà passé au guichet.</li>
            <li>Après un lot adjugé : le total des tickets misés sur les deux lots. Après une annulation : rien d’autre, pas même la raison.</li>
            <li>
              Restent secrets : les suites, les conditions, les tickets de chacun, les mises, et le gagnant de chaque lot. <b>Aucun compteur ne t’aide</b> : retiens et calcule de tête.
            </li>
          </ul>
        </section>

        <section>
          <h3>
            <Trophy size={18} aria-hidden /> La fin
          </h3>
          <p>
            Après la cinquième manche, chacun compte ses suites alignées, et double le tout si sa condition est remplie. <b>Le plus de points gagne</b> ; à égalité, la victoire est partagée. Tout est alors dévoilé : les suites, les conditions, les tickets restants, et chaque mise de chaque passage au guichet.
          </p>
        </section>

        <section className="rule-memory">
          <h3>Dans cette version</h3>
          <ul>
            <li>De 3 à 8 joueurs ; dans l’émission, ils étaient 9.</li>
            <li>Le temps au guichet se règle dans le salon : 45 secondes, 90 secondes ou sans limite. Tu peux préparer ta mise pendant que les autres passent.</li>
            <li>Négociez à voix haute : alliances, promesses, bluffs. Rien n’oblige à tenir parole.</li>
            <li>Un joueur absent plus de 20 secondes est remplacé par le pilote automatique jusqu’à son retour.</li>
            <li>Sur ordinateur : les touches 1 à 5 lâchent un cube dans une colonne, A et B choisissent le lot, Retour arrière reprend le dernier cube, Entrée mise.</li>
          </ul>
        </section>

        <p className="rule-foot">
          D’après <i>Zoo</i>, épreuve du 4e jour de <i>The Devil’s Plan</i> (Netflix, saison 1). Création de fans, non officielle, avec ses propres visuels.
        </p>
      </div>
    </Modal>
  );
}
