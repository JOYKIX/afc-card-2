# AFC Card Studio

Refonte complète en **multi-pages** pour améliorer la prise en main :

- `index.html` + `assets/js/create.js` : création de carte et preview live.
- `profile.html` + `assets/js/profile.js` : gestion du pseudo joueur.
- `admin.html` + `assets/js/admin.js` : modération des cartes en attente.
- `booster.html` + `assets/js/booster.js` : ouverture d’un booster de 5 cartes depuis `cards` avec pondération par rareté.
- `assets/js/common.js` : logique partagée d'interface/auth.
- `assets/js/firebase.js` : intégration auth/base centralisée et synchronisation des profils.
- `assets/css/styles.css` : design global, navigation et composants.

## Système de grade

- Progression actuelle : `D → C → B → A → S → Ω`.
- Le rang `Ω` est exclusivement réservé aux cartes avec une moyenne exacte de `100`.
- Les stats d’attaque et de défense sont bornées entre `1` et `100`.
- Les plages de moyenne sont rééquilibrées ainsi : `D` (1-19), `C` (20-39), `B` (40-59), `A` (60-79), `S` (80-99), `Ω` (100).
- Les rerolls génèrent désormais des stats rééquilibrées pour mieux répartir les rangs `D` à `S`, avec `Ω` conservé comme tirage exceptionnel.
- Les anciennes cartes `SS` et `SSS` sont normalisées en `S` à l’affichage et dans les outils d’admin/booster.

## Nicknames

- Chaque pseudo est désormais réservé dans `nicknameIndex/{nicknameKey}`.
- L’unicité est **insensible à la casse** : `joykix`, `JOYKIX` et `JoYkIx` sont considérés comme identiques.
- La page login et la page profil refusent immédiatement un pseudo déjà pris.

## Rôles via profils

- Les droits sont désormais portés par `profiles/{uid}/roles`.
- Tous les comptes reçoivent automatiquement le rôle `african army`.
- Les anciens booléens `admin` et `vip` sont migrés au login vers le tableau `roles`.
- La console admin retrouve un profil via `nicknameIndex` puis met à jour le tableau `roles`.

### Priorité des badges et droits

1. `african army` : badge bleu, cartes `viewer`, `3` rerolls.
2. `vip` : badge rose, cartes `viewer`, `10` rerolls.
3. `streamers` : badge violet, cartes `streamer`, `10` rerolls.
4. `staff afc` : badge rouge, cartes `responsable staff` et `gardien de l’AFC`, `10` rerolls.
5. `creator` : badge cyan, toutes les cartes, rerolls infinis, sans accès admin/validation.
6. `admin` : badge orange, tous les droits, validation et panel admin.
7. `african king` : badge rose foncé, mêmes droits que `admin`.

## Rerolls de stats

- Chaque profil conserve `profiles/{uid}/remainingStatRerolls` en base.
- Le plafond est automatiquement recalculé selon les rôles : `3`, `10` ou infini.
- Un reroll consommé sur la page de création décrémente ce compteur pour les comptes limités.
- Si une carte est refusée côté admin, le compteur du créateur est automatiquement remis au maximum permis par ses rôles.
- Les rôles `creator`, `admin` et `african king` disposent de rerolls infinis et peuvent saisir manuellement l’attaque et la défense.

## Connexion Google

La connexion utilise Google avec :

- persistance de session (`browserLocalPersistence`)
- tentative popup (`signInWithPopup`)
- fallback automatique en redirect (`signInWithRedirect`) si popup bloquée

### Domaine GitHub Pages (important)

Si le site est publié sur `*.github.io`, ajoute **exactement** ton domaine (ex: `joykix.github.io`) dans:

`Firebase Console > Authentication > Settings > Domaines autorisés`

Sinon Firebase renvoie l'erreur `auth/unauthorized-domain` au clic sur **Connexion Google**.

## Lancer en local

```bash
python3 -m http.server 4173
```

Puis ouvre :

- `http://localhost:4173/index.html`
- `http://localhost:4173/profile.html`
- `http://localhost:4173/admin.html`
