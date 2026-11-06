# Zoo

**Cache ta suite de trois animaux, fais-la tomber sur le plateau, et retiens qui dépense quoi : au guichet, c'est le lot le moins cher qui part.**

👉 **Jouer : https://zoo.onrender.com** (la première ouverture peut prendre jusqu'à une minute, le temps que le serveur gratuit se réveille)

Jeu d'enchères secrètes multijoueur, à jouer entre amis depuis un navigateur, sur téléphone ou ordinateur, sans compte ni installation.
D'après *Zoo*, l'épreuve du 4e jour de *The Devil's Plan* (saison 1, Netflix). Création de fans, non officielle, avec ses propres visuels.

## Règles en bref

- De 3 à 8 joueurs, en **5 manches**. Un plateau commun de 5 colonnes sur 5 : les cubes tombent tout en bas de leur colonne.
- **Avant la première manche**, chacun reçoit :
  - **trois cartes animaux** (serpent, perroquet, éléphant, lion, singe), qu'il range dans l'ordre de sa **suite secrète**, et dont il montre **une** à tout le monde ;
  - une **condition secrète**, du genre « plus de lions que de serpents sur le plateau à la fin » ;
  - **30 tickets** pour toute la partie.
- **Une manche** :
  1. deux **lots de quatre cubes** sont tirés, l'un de la caisse A, l'autre de la caisse B ;
  2. chacun passe **au guichet** à son tour (l'ordre s'inverse à chaque manche) et mise **en secret** : un lot, au moins 1 ticket, et l'endroit où tomberaient ses quatre cubes ;
  3. **le lot le moins cher**, celui qui a reçu le moins de tickets en tout, est adjugé **à sa plus grosse mise**, et ses cubes tombent selon son plan. L'autre lot est écarté ;
  4. on annonce le total des tickets misés sur les deux lots, mais **pas qui l'a emporté**.
- **Tous les tickets misés sont dépensés**, même ceux du lot qui n'est pas parti.
- **Enchère annulée** : les deux lots au même prix, personne sur le moins cher, ou deux plus grosses mises égales. Chacun récupère ses tickets et on remise sur les mêmes lots ; à la 3e annulation, les deux lots sont écartés.
- **Ce que l'on sait** : le plateau, les lots, l'animal montré par chacun, qui est déjà passé au guichet, et le total annoncé après chaque lot adjugé. Les mises, les tickets de chacun et les gagnants restent secrets : on retient et on calcule de tête.
- **À la fin**, chaque alignement de trois cases (ligne, colonne ou diagonale) qui montre sa suite, dans un sens ou dans l'autre, rapporte **1 point**. **La condition remplie double le tout.** Le plus de points gagne ; à égalité, la victoire est partagée. Tout est alors dévoilé.

Les règles suivent l'épreuve de l'émission : les cartes animaux rangées en suite, la carte montrée, les dix conditions, les deux caisses, les lots de quatre, la mise secrète au guichet avec son plan de chute, le lot le moins cher adjugé à la plus grosse mise, les tickets perdus par tous, l'annulation sur égalité et le total annoncé.

Sont des choix de ce jeu :

- **De 3 à 8 joueurs** ; ils étaient 9 dans l'émission.
- **Le temps au guichet** se règle dans le salon : 45 secondes, 90 secondes (conseillé) ou sans limite. On peut préparer son plan pendant que les autres passent. Une partie dure environ 10 minutes à 3, et 20 minutes à 8.
- **La composition** de sa suite laisse 90 secondes à chacun.
- **Après trois annulations de suite**, les deux lots sont écartés, pour qu'une manche finisse toujours. Si plus personne n'a de tickets, les lots restants sont écartés aussi.
- **La négociation se fait à voix haute** (ou en visio) : alliances, promesses, bluffs. L'appli garde les secrets ; rien n'oblige à tenir parole.
- **Un joueur absent plus de 20 secondes est remplacé par le pilote automatique** jusqu'à son retour ; le temps écoulé au guichet, il mise à sa place.

## Les bots

Ils ne savent que ce qu'un joueur saurait : le plateau, les lots, leur suite, leur condition, leurs tickets, les animaux montrés et les totaux annoncés.

- Pour chaque lot, ils cherchent la meilleure chute pour leur suite et leur condition, en comptant ce qu'il reste à tomber, et estiment ce que le lot rapporterait si un autre le posait ;
- ils imaginent les mises cachées des autres autour du prix des dernières manches, plafonnées par ce qu'il leur reste en moyenne, et choisissent le lot et la somme qui rapportent le plus. Le paradoxe du jeu en sort tout seul : miser gros sur un lot le renchérit, et c'est l'autre qui part ;
- un ticket gardé vaut de moins en moins au fil des manches : à la dernière, ils misent tout, sauf quand aucun lot ne les sert ;
- les « retors » devinent les envies des autres d'après l'animal qu'ils ont montré ; les « novices » calculent moins et se trompent plus.

Sur 200 parties par table (`npx tsx test/sim.ts 200 4`) :

| Joueurs | Bot « habile » contre le hasard | Part de chacun | Novice / habile / retors entre bots | Points du gagnant | Joueurs à 0 point | Annulations par partie |
|---|---|---|---|---|---|---|
| 3 | 71 % | 33 % | 26 / 38 / 36 % | 4,6 | 33 % | 2,7 |
| 4 | 47 % | 25 % | 25 / 20 / 31 % | 4,2 | 35 % | 2,2 |
| 6 | 29 % | 17 % | 19 / 14 / 17 % | 3,8 | 48 % | 2,6 |
| 8 | 15 % | 13 % | 10 / 14 / 14 % | 3,5 | 54 % | 3,2 |

Soyons honnêtes : **entre bots, la chance pèse lourd**. Le tirage des lots, les cartes et les mises des autres décident souvent plus que le calcul, et à 6 ou 8 le meilleur bot gagne à peine plus que sa part. Entre humains, ce sont la mémoire des totaux annoncés, la lecture des animaux montrés et la négociation qui font la différence.

## Fonctionnalités

- Tables privées avec code à 4 lettres, lien d'invitation, partage natif et QR code
- Partie contre 2 à 7 bots en un clic
- Une composition en deux touches : échanger deux cartes de sa suite, choisir celle qu'on montre
- Au guichet, un geste par cube : toucher un lot, puis une colonne du casier, et le cube y tombe en pointillés. Ce qui est jouable s'illumine. Reprendre, tout effacer, régler sa mise au ticket près
- Sur ordinateur : 1 à 5 pour les colonnes, A et B pour les lots, Retour arrière pour reprendre, Entrée pour miser
- Le lot adjugé tombe cube par cube dans le casier, tampons « Adjugé », « Écarté » et « Annulée » sur les caisses, et « C'est ton plan ! » avec des confettis quand c'est toi qui l'as emporté
- Fin de partie : le classement avec les suites, les conditions et les tickets restants, le plateau final avec les alignements de chacun, puis le grand dévoilement de chaque passage au guichet, manche par manche ; victoires de la soirée, revanche en un clic
- Réactions et phrases toutes faites (« On s'allie ? », « Menteur ! »), règles consultables en jeu
- Reprise automatique après une coupure, pilote automatique, spectateurs
- Sons de bois et de xylophone synthétisés, vibrations, animations réduites si le système le demande

## Développement

```bash
npm install
npm run dev:server   # serveur temps réel sur http://localhost:3250
npm run dev:client   # interface sur http://localhost:5204
npm test             # plateau, chutes, enchères, annulations, score, conditions, bots
npm run build && npm run e2e   # parties complètes avec de vrais clients, et chasse aux fuites d'information
npx tsx test/sim.ts 200 4      # force des bots : 200 parties à 4
```

`ZO_FAST=1` accélère les bots, les chronos et les résultats (tests locaux uniquement).

## Architecture

- `shared/` : contrat client/serveur, animaux, conditions, plateau et chute des cubes
- `server/` : Express + Socket.IO, moteur de partie (`game.ts`), bots (`bots.ts`), table et minuteries (`room.ts`). Le serveur fait autorité : chacun ne reçoit que sa vue. Pendant les enchères, un geste n'est renvoyé qu'à son auteur, et le gagnant d'un lot n'est connu que de lui
- `client/` : React + Vite + Framer Motion. Le casier et la chute des cubes sont dans `components/Board.tsx`, les cubes et les tickets dans `components/Ui.tsx`, le guichet et les caisses dans `screens/Table.tsx`
- Déploiement : un seul service Node (`npm ci && npm run build`, puis `npm start`)
