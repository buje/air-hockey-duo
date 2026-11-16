# Air hockey pour iPhone Duo : « le pli est le filet »

Document de conception, 16 novembre 2026. Statut : en attente de validation par Thomas.

Légende : **[Thomas]** = décidé par Thomas. **[Proposition]** = choix de Claude, à corriger si besoin.

## 1. Intention

Une webapp de air hockey pensée pour l'iPhone Duo ouvert à plat sur une table. Deux joueurs face à face, chacun sa moitié d'écran, le pli de l'écran sert de ligne médiane. **[Thomas]**

Pourquoi : faire une app simple qui n'a de sens que sur cet appareil, dans l'esprit de ce que Netflix a fait avec les postures. **[Thomas]**

Trois exigences **[Thomas]** :
1. On doit vraiment pouvoir jouer (pas une démo).
2. Effet waouh.
3. Claude maintient et met à jour le code dans la durée.

## 2. Objectifs, non-objectifs, anti-objectifs

**Objectifs**
- Une partie à deux agréable du premier au dernier point : palet nerveux, maillets qui répondent au doigt sans retard, aucun palet qui traverse un mur ou un maillet.
- Un mode solo contre une IA, 3 niveaux. **[Proposition]**
- Un rendu qui donne envie de filmer l'écran.
- Fonctionne sans aucun réglage sur le Duo de n'importe qui (pas de feature flag Safari requis).

**Non-objectifs (pour cette version)**
- Jeu en ligne, comptes, classements.
- Publication sur l'App Store.
- Utilisation de l'angle de la charnière (non exposé au web).
- Skins, boutique, monétisation.

**Anti-objectifs (ce serait un échec même si ça marche)**
- Un palet mou ou un maillet en retard sur le doigt.
- Des effets qui font chuter la fluidité ou chauffer le téléphone au bout de 2 minutes.
- Un jeu qui ne se lance correctement qu'après une manipulation dans les réglages.
- Un code que seul son auteur du jour peut reprendre.

## 3. Contraintes connues

- Écran interne 7,6 pouces, 120 Hz, ratio proche de 1,42. Viewports web annoncés avant la sortie : environ 466 x 678 fermé et 890 x 626 ouvert. **À mesurer sur l'appareil de Thomas**, le code ne doit coder aucune de ces valeurs en dur.
- Safari 27.1 n'expose la posture et la position du pli que derrière des feature flags. Le jeu s'en passe : il déduit « fermé » ou « ouvert » de la taille et du ratio de la fenêtre et place le filet au milieu.
- Gestes système iOS sur les bords (barre d'accueil, centre de contrôle) : risque de sortie du jeu en plein match. Marge de sécurité autour de la table, à régler sur l'appareil réel.
- Retour haptique : non garanti dans Safari. Le ressenti des chocs repose sur le son et l'image.
- Comportement du tactile exactement sur le pli : inconnu, à tester. Les maillets ne peuvent de toute façon pas atteindre le pli.

## 4. Approches envisagées

| | Approche | Pour | Contre |
|---|---|---|---|
| A | Canvas 2D, physique maison | Simple, rapide à corriger | Pas de vrais effets de lumière |
| **B** | **WebGL avec shaders, physique maison** | **Bloom réel, onde de choc, reflets : le plus spectaculaire** | **Plus de code, bugs plus durs à diagnostiquer, risque de chauffe** |
| C | Moteur de jeu (Phaser ou équivalent) | Physique et scènes fournies | Lourd pour un seul écran, palet au ressenti générique |

**Choix : B. [Thomas]** Claude recommandait A avec bascule possible vers B. Thomas a préféré viser directement le rendu le plus spectaculaire.

Conséquence assumée : la jouabilité (physique, tactile, IA) reste strictement séparée du rendu, pour que les bugs d'affichage ne touchent jamais au jeu.

## 5. Le jeu

**Disposition.** Téléphone ouvert à plat, en paysage. Les buts sont sur les deux petits côtés. Le pli traverse la table au milieu. Scores et messages tournés vers chaque joueur.

```
        joueur A                      joueur B
   ┌──────────────────┬──────────────────┐
   │                  ┊                  │
  ▐│      ◉           ┊           ◉      │▌
 but│          ●       ┊                  │but
  ▐│                  ┊                  │▌
   │                  ┊                  │
   └──────────────────┴──────────────────┘
                 le pli = le filet
```

**Règles. [Proposition]**
- Premier à 7 buts.
- Un maillet par joueur, piloté par un doigt, limité à sa moitié.
- Après un but, le palet est remis du côté de celui qui a encaissé.
- Vitesse du palet plafonnée pour rester lisible.
- Si le palet reste bloqué plus de quelques secondes dans un coin, il est relancé.

**Écrans.**
1. Téléphone fermé (écran externe) : titre du jeu et invitation « Ouvre pour jouer ».
2. Ouverture : la table s'allume, menu Duel / Solo (facile, moyen, difficile).
3. Match.
4. But : ralenti bref, onde de choc, score.
5. Victoire : animation, rejouer ou menu.
6. Si le téléphone est refermé en plein match : pause automatique, reprise à la réouverture.

**Sur un autre appareil. [Proposition]** Le jeu reste jouable en paysage sur n'importe quel téléphone, tablette ou ordinateur (souris = mode solo), avec le filet dessiné au centre. Ça sert surtout à tester et à montrer le jeu à quelqu'un qui n'a pas de Duo.

## 6. L'effet waouh

Propre au Duo :
- Le match démarre en ouvrant le téléphone.
- Le pli est un filet de néon qui ondule et s'illumine quand le palet le traverse.

Rendu :
- Bloom réel sur le palet, les maillets, les bords et le filet.
- Traînée lumineuse derrière le palet, dont la couleur change avec la vitesse.
- Onde de choc qui déforme la table sur les gros impacts et les buts.
- Étincelles aux chocs, proportionnelles à la force.
- Reflet léger des objets sur la surface de la table.
- Secousse d'écran et bref ralenti sur les buts.

Son : sons synthétisés en direct (choc maillet, rebond, but, victoire) dont la hauteur varie avec la vitesse. Aucun fichier audio à charger.

Garde-fou : un réglage de qualité automatique baisse les effets si la fluidité chute. Le jeu passe avant le spectacle.

## 7. Technique

**Stack. [Proposition]**
- JavaScript en modules ES, sans framework ni étape de build. On ouvre `index.html` et ça tourne.
- WebGL2 sans bibliothèque. Aucune dépendance = rien qui casse lors d'une mise à jour tierce, et un code que Claude peut relire en entier à chaque intervention.
- Shaders GLSL dans des fichiers séparés.
- Web Audio pour le son.
- PWA : manifeste, plein écran une fois ajoutée à l'écran d'accueil, service worker pour jouer hors ligne.

**Modules.**

| Module | Rôle | Dépend de |
|---|---|---|
| `physics` | Palet, maillets, murs, buts. Pas de temps fixe, détection de collision continue. Aucun accès au DOM. | rien |
| `game` | États (menu, match, but, victoire, pause), score, règles. | physics |
| `input` | Doigts vers maillets, un doigt par moitié, vitesse du maillet transmise au palet. | game |
| `ai` | Adversaire solo, 3 niveaux. | physics |
| `display` | Fermé / ouvert / autre appareil, taille de table, marges de sécurité. Utilise l'API de posture si elle est disponible, sans en dépendre. | rien |
| `renderer` | Tout l'affichage WebGL. Lit l'état du jeu, ne le modifie jamais. | game (lecture seule) |
| `audio` | Sons déclenchés par les événements du jeu. | game (événements) |
| `ui` | Menus et scores en HTML par-dessus le canvas. | game |

Règle d'architecture : `physics`, `game` et `ai` ne connaissent ni l'écran ni WebGL. Ils se testent sans navigateur.

**Tests.**
- Tests automatiques de la physique et des règles (le palet ne traverse jamais un mur ni un maillet, même à vitesse maximale ; un but est compté une seule fois ; un maillet ne franchit pas le filet).
- Test de fumée dans un navigateur sans écran : la page se charge, WebGL démarre, une partie IA contre IA va au bout sans erreur.
- Le ressenti (tactile, fluidité, gestes système, chauffe) ne se valide que sur le Duo de Thomas.

**Hébergement et livraison. [Proposition]**
- Dépôt dédié sur le compte GitHub de Thomas (`buje`), publié avec GitHub Pages pour avoir une URL en HTTPS à ouvrir sur le Duo.
- Claude pousse directement : le jeu ne peut être vérifié que sur le téléphone, donc pas d'étape de validation en local avant mise en ligne.
- Date et heure de dernière modification affichées dans un coin du menu.
- Ce document est versionné dans le dépôt.

## 8. Risques

| Risque | Parade |
|---|---|
| Chauffe ou chute de fluidité avec les effets | Qualité automatique, effets coupables un par un |
| Gestes système qui sortent du jeu | Marges de sécurité, mode plein écran PWA, réglage sur appareil |
| Viewports réels différents des chiffres annoncés | Rien en dur, écran de diagnostic affichant les dimensions mesurées |
| WebGL2 indisponible | Message clair, pas de version dégradée dans cette version |
| Tactile imprécis près du pli | Maillets tenus à distance du filet |

## 9. Laissé au constructeur

- Valeurs de réglage : vitesses, frottement, taille des maillets et des buts, durée des ralentis.
- Palette exacte et typographie.
- Comportement détaillé de l'IA par niveau.
- Nom du jeu et du dépôt (nom de travail : `air-hockey-duo`).

## 10. Ordre de construction proposé

1. Table, physique, tactile et duel jouable avec un rendu WebGL simple. Premier test sur le Duo.
2. Mode solo et écrans (fermé, menu, but, victoire, pause).
3. Passe waouh : bloom, traînées, onde de choc, filet vivant, son.
4. PWA, hors ligne, réglages de qualité, finitions après retours sur appareil.

Chaque étape est mise en ligne et testable sur le téléphone.
