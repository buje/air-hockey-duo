# Jeux pour iPhone Duo

Deux jeux web pensés pour l'iPhone Duo (écran pliable). Projet de Thomas (GitHub `buje`), maintenu par Claude.

- En ligne : https://buje.github.io/air-hockey-duo/ (GitHub Pages, branche `main`, racine). La racine est une page d'accueil qui liste les jeux.
- `air-hockey/` : air hockey, téléphone ouvert à plat, le pli est le filet. https://buje.github.io/air-hockey-duo/air-hockey/
- `flipper/` : flipper, téléphone plié comme un ordinateur portable. https://buje.github.io/air-hockey-duo/flipper/
- `shared/` : ce que les jeux ont en commun (`sound.js` moteur audio, `ui.css` panneaux et boutons).
- `tests/` : tests des deux jeux.
- Conception du air hockey : `docs/superpowers/specs/2026-11-16-air-hockey-duo-design.md`
- Plan et avancement : `docs/superpowers/plans/2026-11-16-air-hockey-duo.md`

## Règles du dépôt

- Zéro build. JavaScript en modules ES, WebGL2 sans bibliothèque. Une seule dépendance, PeerJS (`air-hockey/vendor/peerjs.min.js`), chargée uniquement pour le jeu à distance.
- Dans `air-hockey/src/` : `physics.js`, `game.js`, `ai.js`, `display.js`, `netgame.js` sont purs. Dans `flipper/src/` : `config.js`, `table.js`, `physics.js`, `game.js` et les calculs de `view.js` sont purs : ni DOM ni WebGL. Tout changement y est couvert par un test.
- Les `renderer.js` lisent l'état du jeu et ne le modifient jamais.
- Tous les réglages de jeu sont dans le `config.js` de chaque jeu.
- Aucune dimension d'appareil en dur. Le filet reste au centre de l'écran.
- Textes en français. Pas de tiret cadratin, pas de virgule avant « et ».

## Avant chaque mise en ligne

1. Mettre à jour la date dans le `src/version.js` de chaque jeu modifié (heure de La Réunion).
2. `npm test`, `npm run smoke` (air hockey) et `python3 tests/flipper-smoke.py` (flipper et page d'accueil) : tout doit passer. Si le jeu à distance est touché : `python3 tests/net-smoke.py` (demande `npm i peer` dans `/tmp/pj`).
3. Pousser sur `main`. Thomas teste sur son iPhone Duo, le jeu ne se valide pas en local.
4. Vérifier en ligne : `python3 tests/smoke.py https://buje.github.io/air-hockey-duo/air-hockey/` et `python3 tests/flipper-smoke.py https://buje.github.io/air-hockey-duo/`.

## À savoir

- Flipper : le plateau fait 1 de large et H de haut, le pli est à mi-hauteur. Quand le téléphone est plié, la moitié du haut (debout) a une gravité forte et celle du bas (posée) une pente douce (`gWall`, `gFlat`). La posture vient de l'API Device Posture de Safari, qui n'existe que derrière des feature flags (Réglages > Apps > Safari > Avancé > Feature Flags). `decide()` dans `flipper/src/view.js` choisit entre jouer et demander de plier. Sans l'API, un écran de type Duo ouvert tenu en hauteur est supposé plié. Rendu en Canvas 2D, plateau fixe dessiné une fois dans une image de fond.
- Prochaine étape envisagée pour le flipper : une app native où l'angle de la charnière règle la pente du plateau (impossible en web).
- Air hockey à distance : `air-hockey/src/netgame.js` (protocole, pur) et `air-hockey/src/net.js` (transport PeerJS). Chaque téléphone se voit joueur 0 et tout est retourné à l'arrivée. Le palet est calculé par le téléphone du camp où il se trouve, qui passe la main au filet (message `h`). Seul celui qui a la main compte les buts. Le canal doit rester fiable et ordonné. La mise en relation passe par le service public gratuit de PeerJS (choix de Thomas, qui ne veut rien héberger) : aucune garantie de disponibilité.
- Les deux téléphones jouent sur la même forme de table (la moins allongée des deux), d'où des bandes noires sur l'écran le plus allongé.
- Sons : `shared/sound.js` (moteur) et le `audio.js` de chaque jeu, synthétisés avec Web Audio, déclenchés par les événements du jeu. La démo derrière le menu est muette.
- Vibrations : impossibles en web sur iPhone (Safari n'a pas `navigator.vibrate` et l'astuce de l'interrupteur a été corrigée par Apple dans iOS 26.5). `air-hockey/src/haptics.js` ne sert qu'aux navigateurs Android. Le vrai retour haptique demande une app native.
- Safari n'expose le pli que derrière des feature flags : le jeu déduit fermé ou ouvert de la taille de fenêtre (`classify` dans `air-hockey/src/display.js`).
- Le ressenti (tactile, gestes système, chauffe, fluidité) ne se juge que sur l'appareil de Thomas. Lui demander ses retours plutôt que deviner.
