// Réglages du flipper. Unités : le plateau fait 1 de large et H de haut (H = forme de l'écran).
// y descend vers le bas de l'écran. Le pli est à mi-hauteur.
export const CONFIG = {
  step: 1 / 480, // pas de temps fixe de la physique
  ballR: 0.028,
  // Téléphone plié : la moitié du haut est debout (la bille y tombe vite),
  // la moitié du bas est posée à plat (pente douce, comme un vrai plateau).
  gWall: 3.0,
  gFlat: 1.5,
  gUniform: 2.0, // téléphone à plat ou appareil sans pli
  maxSpeed: 4.6,
  wallBounce: 0.45,
  flipperBounce: 0.35,
  flipUp: 26, // vitesse de montée d'un batteur, en radians par seconde
  flipDown: 14,
  bumperKick: 2.3,
  balls: 3,
  maxMultiplier: 9,
  saveTime: 6, // secondes pendant lesquelles une bille perdue est rendue
  points: { bumper: 100, kicker: 30, target: 250, allTargets: 2000, fold: 50 },
};
