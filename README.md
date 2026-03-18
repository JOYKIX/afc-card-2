# AFC Card Studio

Refonte complète en **multi-pages** pour améliorer la prise en main :

- `index.html` + `assets/js/create.js` : création de carte et preview live.
- `profile.html` + `assets/js/profile.js` : gestion du pseudo joueur.
- `admin.html` + `assets/js/admin.js` : modération des cartes en attente.
- `booster.html` + `assets/js/booster.js` : ouverture d’un booster de 5 cartes depuis `cards` avec pondération par rareté.
- `assets/js/common.js` : logique partagée d'interface/auth.
- `assets/js/firebase.js` : intégration auth/base centralisée et synchronisation des profils.
- `assets/css/style.css` : design global, navigation et composants.

## Système de grade

- Progression actuelle : `D → C → B → A → S → Ω`.
- Le rang `Ω` est exclusivement réservé aux cartes avec une moyenne exacte de `100`.
- Les stats d’attaque et de défense sont bornées entre `1` et `100`.
- Les plages de moyenne sont rééquilibrées ainsi : `D` (1-19), `C` (20-39), `B` (40-59), `A` (60-79), `S` (80-99), `Ω` (100).
- Les rerolls génèrent désormais des stats rééquilibrées pour mieux répartir les rangs `D` à `S`, avec `Ω` conservé comme tirage exceptionnel.
- Les anciennes cartes `SS` et `SSS` sont normalisées en `S` à l’affichage et dans les outils d’admin/booster.

## Rerolls de stats

- Chaque profil conserve désormais `profiles/{uid}/remainingStatRerolls` en base, avec un plafond de `3`.
- Un reroll consommé sur la page de création décrémente ce compteur pour les comptes standards.
- Si une carte est refusée côté admin, le compteur du créateur est automatiquement remis à `3`.
- Les comptes VIP et Admin disposent de rerolls infinis et peuvent saisir manuellement l’attaque et la défense.

## Connexion Google

La connexion utilise Google avec :

- persistance de session (`browserLocalPersistence`)
- tentative popup (`signInWithPopup`)
- fallback automatique en redirect (`signInWithRedirect`) si popup bloquée

## Rôles via profils

- Les droits sont désormais portés directement par `profiles/{uid}`.
- Le booléen `admin` ouvre l’accès à la console admin.
- Le booléen `vip` débloque les avantages VIP sur la création de cartes.
- La console admin retrouve un profil par `nicknameKey` puis met à jour ces deux champs sur le profil concerné.


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
