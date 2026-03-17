# AFC Card Studio

Structure simplifiée du projet :

- `index.html` : point d’entrée de l’application avec onglets (création, profil, admin).
- `assets/css/style.css` : styles de l’éditeur, de la carte et de l’espace admin.
- `assets/js/script.js` : logique Firebase (Auth Google + Realtime Database), calculs automatiques et modération.
- `assets/data/rarity.json` : données de rareté.
- `assets/images/` : dossier réservé aux images.

## Lancer en local

Comme l’app charge les modules Firebase en `type="module"`, lance-la via un serveur HTTP :

```bash
python3 -m http.server 4173
```

Puis ouvre `http://localhost:4173`.
