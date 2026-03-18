# AFC Card Studio

Refonte complète en **multi-pages** pour améliorer la prise en main :

- `index.html` + `assets/js/create.js` : création de carte et preview live.
- `profile.html` + `assets/js/profile.js` : gestion du pseudo joueur.
- `admin.html` + `assets/js/admin.js` : modération des cartes en attente.
- `booster.html` + `assets/js/booster.js` : ouverture d’un booster de 5 cartes depuis `cards` avec pondération par rareté.
- `assets/js/common.js` : logique partagée d'interface/auth.
- `assets/js/firebase.js` : intégration Firebase centralisée (Auth + Realtime DB).
- `assets/css/style.css` : design global, navigation et composants.

## Connexion Google (Firebase Auth)

La connexion utilise Firebase Auth avec :

- persistance locale (`browserLocalPersistence`)
- tentative popup (`signInWithPopup`)
- fallback automatique en redirect (`signInWithRedirect`) si popup bloquée

## Registre admin (Realtime Database)

- Les admins peuvent être déclarés par UID via `admins/{uid}: true`.
- Un registre par email est aussi utilisé via `adminRegistry/{email_normalisé}: true` (le point `.` est remplacé par `,`).
- Par défaut, `afc.cardgame@gmail.com` est automatiquement inscrit comme admin.


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
