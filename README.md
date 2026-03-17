# AFC Card Studio

Refonte complète en **multi-pages** pour améliorer la prise en main :

- `index.html` + `assets/js/create.js` : création de carte et preview live.
- `profile.html` + `assets/js/profile.js` : gestion du pseudo joueur.
- `admin.html` + `assets/js/admin.js` : modération des cartes en attente.
- `assets/js/common.js` : logique partagée d'interface/auth.
- `assets/js/firebase.js` : intégration Firebase centralisée (Auth + Realtime DB).
- `assets/css/style.css` : design global, navigation et composants.

## Connexion Google (Firebase Auth)

La connexion utilise Firebase Auth avec :

- persistance locale (`browserLocalPersistence`)
- tentative popup (`signInWithPopup`)
- fallback automatique en redirect (`signInWithRedirect`) si popup bloquée

## Lancer en local

```bash
python3 -m http.server 4173
```

Puis ouvre :

- `http://localhost:4173/index.html`
- `http://localhost:4173/profile.html`
- `http://localhost:4173/admin.html`
