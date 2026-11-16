# Air Hockey Duo

Air hockey web pour iPhone Duo ouvert à plat : le pli de l'écran est le filet. Projet de Thomas (GitHub `buje`), maintenu par Claude.

- En ligne : https://buje.github.io/air-hockey-duo/ (GitHub Pages, branche `main`, racine)
- Conception : `docs/superpowers/specs/2026-11-16-air-hockey-duo-design.md`
- Plan et avancement : `docs/superpowers/plans/2026-11-16-air-hockey-duo.md`

## Règles du dépôt

- Zéro build. JavaScript en modules ES, WebGL2 sans bibliothèque. Une seule dépendance, PeerJS (`vendor/peerjs.min.js`), chargée uniquement pour le jeu à distance.
- `src/physics.js`, `src/game.js`, `src/ai.js`, `src/display.js`, `src/netgame.js` sont purs : ni DOM ni WebGL. Tout changement y est couvert par un test.
- `src/renderer.js` lit l'état du jeu et ne le modifie jamais.
- Tous les réglages de jeu sont dans `src/config.js`.
- Aucune dimension d'appareil en dur. Le filet reste au centre de l'écran.
- Textes en français. Pas de tiret cadratin, pas de virgule avant « et ».

## Avant chaque mise en ligne

1. Mettre à jour la date dans `src/version.js` (heure de La Réunion).
2. `npm test` puis `npm run smoke` : tout doit passer. Si le jeu à distance est touché : `python3 tests/net-smoke.py` (demande `npm i peer` dans `/tmp/pj`).
3. Pousser sur `main`. Thomas teste sur son iPhone Duo, le jeu ne se valide pas en local.
4. Vérifier la page en ligne : `python3 tests/smoke.py https://buje.github.io/air-hockey-duo/`.

## À savoir

- Jeu à distance : `src/netgame.js` (protocole, pur) et `src/net.js` (transport PeerJS). Chaque téléphone se voit joueur 0 et tout est retourné à l'arrivée. Le palet est calculé par le téléphone du camp où il se trouve, qui passe la main au filet (message `h`). Seul celui qui a la main compte les buts. Le canal doit rester fiable et ordonné. La mise en relation passe par le service public gratuit de PeerJS (choix de Thomas, qui ne veut rien héberger) : aucune garantie de disponibilité.
- Les deux téléphones jouent sur la même forme de table (la moins allongée des deux), d'où des bandes noires sur l'écran le plus allongé.
- Sons : `src/audio.js`, synthétisés avec Web Audio, déclenchés par les événements du jeu. La démo derrière le menu est muette.
- Vibrations : impossibles en web sur iPhone (Safari n'a pas `navigator.vibrate` et l'astuce de l'interrupteur a été corrigée par Apple dans iOS 26.5). `src/haptics.js` ne sert qu'aux navigateurs Android. Le vrai retour haptique demande une app native.
- Safari n'expose le pli que derrière des feature flags : le jeu déduit fermé ou ouvert de la taille de fenêtre (`classify` dans `display.js`).
- Le ressenti (tactile, gestes système, chauffe, fluidité) ne se juge que sur l'appareil de Thomas. Lui demander ses retours plutôt que deviner.
