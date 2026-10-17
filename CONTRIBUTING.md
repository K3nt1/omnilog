# Workflow Git de Omnilog

## Branches

| Branche | Rôle | Déployée sur |
|---|---|---|
| `main` | Production, uniquement des versions publiées | `omnilog.<sous-domaine>.workers.dev` (à chaque release) |
| `develop` | Intégration, toujours fonctionnelle | `omnilog-staging.<sous-domaine>.workers.dev` (à chaque merge) |
| `feat/<sujet>` | Nouvelle fonctionnalité | — |
| `fix/<sujet>` | Correction de bug | — |
| `chore/<sujet>`, `docs/<sujet>`, `refactor/<sujet>` | Le reste | — |
| `hotfix/<sujet>` | Bug urgent en prod, part de `main` | — |

Personne ne pousse directement sur `main` ni sur `develop` : tout passe par une PR.

## Cycle d'une fonctionnalité

```bash
git switch develop && git pull
git switch -c feat/roulette-filtres
# ... travail, commits libres ...
git push -u origin feat/roulette-filtres
gh pr create --base develop --fill   # puis compléter le template
```

1. PR `feat/...` → `develop`, titre conventionnel (`feat(roulette): ajouter le filtre par durée`).
2. La CI passe, tu relis l'onglet *Files changed*.
3. **Squash and merge** : le titre de la PR devient l'unique commit dans `develop`.
4. Déploiement automatique en staging : tu testes sur l'URL staging.

## Publier une version

1. PR `develop` → `main`, titre `chore: préparer la prochaine release`.
2. **Create a merge commit** (pas de squash, sinon release-please perd le détail des commits).
3. release-please ouvre ou met à jour une PR `chore(main): release X.Y.Z` avec le CHANGELOG.
4. Quand tu veux publier : merge cette Release PR → tag `vX.Y.Z`, GitHub Release, déploiement prod.
5. Merge la PR automatique « synchroniser develop avec la release » (merge commit).

## Hotfix

`hotfix/...` part de `main`, PR vers `main` (squash, titre `fix: ...`), puis release comme ci-dessus.
La PR de synchronisation ramène le correctif dans `develop`.

## Versions (SemVer, automatique)

| Titre de PR | Effet avant 1.0.0 | Effet après 1.0.0 |
|---|---|---|
| `fix: ...` | 0.1.0 → 0.1.1 | 1.2.0 → 1.2.1 |
| `feat: ...` | 0.1.0 → 0.2.0 | 1.2.0 → 1.3.0 |
| `feat!: ...` | 0.1.0 → 0.2.0 | 1.2.0 → 2.0.0 |

Pour passer en 1.0.0 : ajoute `Release-As: 1.0.0` dans le corps d'un commit.

## Base de données

```bash
npx wrangler d1 migrations create DB nom_de_la_migration   # crée migrations/000X_nom.sql
npm run db:migrate:local                                     # teste en local
```

Les migrations sont appliquées automatiquement avant chaque déploiement (staging puis prod).
Ne jamais modifier une migration déjà mergée : en créer une nouvelle.
