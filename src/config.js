// Tous les réglages de jeu. Unités : la table fait 1 de haut et `aspect` de large.
// Les vitesses sont en unités de table par seconde.
export const CONFIG = {
  winScore: 7,
  step: 1 / 240, // pas de temps fixe de la physique
  puckR: 0.05,
  malletR: 0.09,
  goalHalf: 0.21, // demi-ouverture du but
  netGap: 0.012, // distance minimale entre un maillet et le filet
  puckMaxSpeed: 4.2,
  malletMaxSpeed: 9,
  restitutionWall: 0.92,
  restitutionMallet: 0.9,
  damping: 0.32,
  goalPause: 1.3, // secondes entre un but et la remise en jeu
  stuckSpeed: 0.03,
  stuckTime: 4,
  aiSpeed: [1.5, 2.6, 4.2], // facile, moyen, difficile
};
