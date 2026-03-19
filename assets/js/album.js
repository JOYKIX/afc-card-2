import { escapeHtml, formatCardNumber, normalizeCardNumber } from './firebase.js';
import { initCommon } from './common.js';
import { loadAlbum } from './lib/album-storage.js';
import { loadApprovedCards } from './lib/cards-catalog.js';

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

  const renderAlbum = (entries = [], { ownedCount = 0, totalCount = 0, source = 'database' } = {}) => {
    if (albumCount) {
      albumCount.textContent = `${ownedCount} / ${totalCount} carte${totalCount > 1 ? 's' : ''}`;
    }

    if (!entries.length) {
      renderEmpty('Aucune carte enregistrée pour le moment. Ouvre un booster pour remplir ton album.');
      setHint('Ton album est encore vide. Les cartes tirées sont maintenant sauvegardées sur ton profil en base.');
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
              <strong>${escapeHtml(card.cardName || card.name || card.creatorName)}</strong>
              <small>${escapeHtml(formatCardNumber(cardNumber, 'Sans numéro'))} · ${escapeHtml(card.creatorName)} · rang ${escapeHtml(card.rank)}</small>
            </div>
            <span class="album-card__count">Doublons x${escapeHtml(String(Math.max(0, (card.dropCount || 1) - 1)))}</span>
          </div>
        </article>
      `;
    }).join('');

    const newest = entries[0];
    const sourceMessage = source === 'local' ? ' Affichage de secours depuis le cache local.' : '';
    setHint(`Album complété à ${ownedCount} / ${totalCount}. Dernière nouvelle carte visible : ${newest.cardName || newest.name || newest.creatorName} · rang ${newest.rank}.${sourceMessage}`);
  };

  const cleanupCommon = await initCommon({
    requireAuth: true,
    onUserChanged: async (user) => {
      if (!user) {
        renderEmpty('Connecte-toi pour consulter ton album.');
        setHint("Connexion requise pour afficher l'album.", true);
        if (albumCount) albumCount.textContent = '0 / 0 carte';
        return;
      }

      const catalog = await loadApprovedCards();
      const album = await loadAlbum(user.uid, catalog);
      renderAlbum(album.entries, {
        ownedCount: album.uniqueCount,
        totalCount: catalog.length,
        source: album.source
      });
    }
  });

  return () => {
    cleanupCommon?.();
  };
};
