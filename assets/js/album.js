import { escapeHtml, formatCardNumber, normalizeCardNumber } from './firebase.js';
import { initCommon } from './common.js';
import { loadAlbum } from './lib/album-storage.js';

export const initAlbumPage = async () => {
  const albumGrid = document.getElementById('albumGrid');
  const albumHint = document.getElementById('albumHint');
  const albumCount = document.getElementById('albumCount');

  const setHint = (message, isError = false) => {
    if (!albumHint) return;
    albumHint.textContent = message;
    albumHint.dataset.state = isError ? 'error' : 'ready';
  };

  const renderEmpty = (message) => {
    albumGrid.innerHTML = `<article class="album-empty"><p>${escapeHtml(message)}</p></article>`;
  };

  const renderAlbum = (entries = []) => {
    if (albumCount) albumCount.textContent = `${entries.length} carte${entries.length > 1 ? 's' : ''}`;

    if (!entries.length) {
      renderEmpty('Aucun drop enregistré pour le moment. Ouvre un booster pour remplir ton album.');
      setHint('Ton album est encore vide.');
      return;
    }

    albumGrid.innerHTML = entries.map((card) => {
      const cardNumber = normalizeCardNumber(card.cardNumber);
      return `
        <article class="album-card rank-${escapeHtml(card.rank)}">
          <div class="album-card__frame">
            <img src="${escapeHtml(card.cardCapture)}" alt="${escapeHtml(`Carte ${card.rank} de ${card.creatorName}`)}">
          </div>
          <div class="album-card__meta">
            <div>
              <strong>${escapeHtml(card.creatorName)}</strong>
              <small>${escapeHtml(formatCardNumber(cardNumber, 'Sans numéro'))} · rang ${escapeHtml(card.rank)}</small>
            </div>
            <span class="album-card__count">Drop x${escapeHtml(String(card.dropCount))}</span>
          </div>
        </article>
      `;
    }).join('');

    const newest = entries[0];
    setHint(`Dernier drop enregistré : ${newest.creatorName} · rang ${newest.rank}.`);
  };

  const cleanupCommon = await initCommon({
    requireAuth: true,
    onUserChanged: async (user) => {
      if (!user) {
        renderEmpty('Connecte-toi pour consulter ton album.');
        setHint("Connexion requise pour afficher l'album.", true);
        if (albumCount) albumCount.textContent = '0 carte';
        return;
      }

      renderAlbum(loadAlbum(user.uid));
    }
  });

  return () => {
    cleanupCommon?.();
  };
};
