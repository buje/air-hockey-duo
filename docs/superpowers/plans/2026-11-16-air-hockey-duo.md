# Air Hockey Duo : plan de construction

**But :** un air hockey web pour iPhone Duo ouvert à plat, où le pli de l'écran sert de filet.

**Architecture :** modules ES sans build ni dépendance. La physique, les règles et l'IA sont pures et testées sous Node. L'affichage WebGL2 lit l'état du jeu sans jamais le modifier.

**Spec :** `docs/superpowers/specs/2026-11-16-air-hockey-duo-design.md`

## Contraintes globales

- Aucune dimension d'appareil en dur : tout part de la taille de fenêtre mesurée.
- Aucun feature flag Safari requis.
- Le filet est toujours au centre de l'écran.
- `physics`, `game`, `ai` et `display` n'accèdent ni au DOM ni à WebGL.
- Date de mise à jour visible dans le menu (`src/version.js`).

## Points de vigilance en revue

1. Palet à vitesse maximale contre un mur ou un maillet : ne traverse jamais (tests `physics`).
2. Doigt qui sort de la table ou saute d'un camp à l'autre : le maillet reste dans son camp (tests `physics`).
3. Téléphone refermé en plein match : pause, puis reprise à l'ouverture (test de fumée).
4. Changement de forme de fenêtre en cours de partie : tout reste dans la table (test `game`).
5. Zones sûres inégales : le filet reste sur le pli (test `display`).

## Étapes

- [x] **1. Duel jouable.** `config`, `physics`, `game`, `display`, `input`, `renderer`, `shaders`, `main`, page et styles. Tests Node et test de fumée Chrome. Mise en ligne sur GitHub Pages.
- [x] **2. Solo et écrans.** IA à 3 niveaux (`ai`), écran fermé, menu avec démo en fond, pause, fin de partie. Avancé pendant l'étape 1.
- [ ] **3. Passe waouh.** Bloom en plusieurs passes, reflets sur la table, ralenti sur les buts, sons synthétisés (`audio`), allumage de la table à l'ouverture.
- [ ] **4. Finitions.** Service worker hors ligne, icônes d'écran d'accueil, qualité automatique selon la fluidité, réglages après essais sur le Duo (marges, tailles, vitesses, IA).

## Commandes

- `npm test` : tests de la physique, des règles et de la géométrie.
- `npm run smoke` : test de fumée dans Chrome sans écran, captures dans `/tmp/ah`.
- `python3 tests/smoke.py <url>` : même test contre la version en ligne.
