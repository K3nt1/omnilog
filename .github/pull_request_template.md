<!--
Titre de la PR = futur message de commit (squash). Format obligatoire :
  type(portée): description courte à l'impératif
Exemples :
  feat(roulette): ajouter le filtre "j'ai 20 minutes"
  fix(rappels): passer à S08E01 après le dernier épisode de S07
Types : feat · fix · perf · refactor · docs · test · build · ci · chore · style · revert
Changement cassant : ajouter "!" après le type (ex. feat!: ...) et le décrire plus bas.
-->

## 🎯 Quoi
<!-- Ce que fait cette PR, en 1 à 3 phrases. -->


## 🤔 Pourquoi
<!-- Le problème résolu ou le besoin. Lier l'issue : "Closes #12". -->


## 🛠️ Comment
<!-- Les choix techniques importants, les alternatives écartées. -->


## 📁 Fichiers modifiés
<!-- La liste complète est ajoutée automatiquement en commentaire par le bot.
     Ici, résume seulement les fichiers clés et leur rôle. -->
- 


## 🗄️ Base de données
- [ ] Aucune modification du schéma
- [ ] Nouvelle migration dans `migrations/` (testée en local avec `npm run db:migrate:local`)

## ✅ Vérifications
- [ ] Testé en local (`npm run dev` et `npm run preview`)
- [ ] `npm run lint` et `npm run typecheck` passent
- [ ] Aucune clé API ni secret dans le code
- [ ] Captures d'écran ajoutées si l'interface change

## 📸 Captures d'écran
<!-- Avant / après si l'UI change. Sinon, supprimer cette section. -->

## 💥 Changement cassant
<!-- Seulement si le titre contient "!". Sinon, supprimer cette section. -->
