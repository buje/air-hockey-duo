# Air Hockey Duo

Un air hockey pensé pour l'iPhone Duo. Ouvre le téléphone, pose-le à plat sur la table : le pli de l'écran est le filet.

**Jouer :** https://buje.github.io/air-hockey-duo/

- Duel à deux, un joueur de chaque côté, premier à 7.
- Solo contre une IA, trois niveaux.
- À distance contre un ami sur un autre téléphone : un code à 4 lettres ou un lien, sans compte.
- Fonctionne aussi sur un autre téléphone, une tablette ou un ordinateur.

Pour le plein écran sur iPhone : Partager, puis « Sur l'écran d'accueil ».

## Développement

Aucune dépendance et aucune étape de build. Servir le dossier avec n'importe quel serveur statique.

```
npm test        # physique, règles, géométrie
npm run smoke   # test dans Chrome sans écran
```
