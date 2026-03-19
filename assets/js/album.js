import { escapeHtml, formatCardNumber, normalizeCardNumber } from './firebase.js';
import { initCommon } from './common.js';
import { loadAlbum } from './lib/album-storage.js';
import { loadApprovedCards } from './lib/cards-catalog.js';

export const initAlbumPage = async () => {
  const albumGrid = document.getElementById('albumGrid');
  const albumHint = document.getElementById('albumHint');
  const albumCount = document.getElementById('albumCount');
  const albumViewer = document.getElementById('albumViewer');
  const albumViewerMedia = document.getElementById('albumViewerMedia');
  const albumViewerImage = document.getElementById('albumViewerImage');
  const albumViewerTitle = document.getElementById('albumViewerTitle');
  const albumViewerSubtitle = document.getElementById('albumViewerSubtitle');
  const albumViewerRank = document.getElementById('albumViewerRank');
  const closeAlbumViewerBtn = document.getElementById('closeAlbumViewer');
  let albumEntries = [];

  const setHint = (message, isError = false) => {
    if (!albumHint) return;
    albumHint.textContent = message;
    albumHint.dataset.state = isError ? 'error' : 'ready';
  };

  const closeViewer = () => {
    if (!albumViewer || albumViewer.hidden) return;
    albumViewer.hidden = true;
    document.body.classList.remove('modal-open');
  };

  const openViewer = (index) => {
    const card = albumEntries[index];
    if (!card || !albumViewer || !albumViewerImage || !albumViewerTitle || !albumViewerSubtitle || !albumViewerRank || !albumViewerMedia) return;

    const cardNumber = normalizeCardNumber(card.cardNumber);
    albumViewerImage.src = card.cardCapture || '';
    albumViewerImage.alt = `Carte ${card.rank} de ${card.creatorName}`;
    albumViewerTitle.textContent = card.cardName || card.name || card.creatorName;
    albumViewerSubtitle.textContent = `${formatCardNumber(cardNumber, 'Sans numéro')} · ${card.creatorName}`;
    albumViewerRank.textContent = `Rang ${card.rank}`;
    albumViewerMedia.className = `card-viewer__media rank-${escapeHtml(card.rank)}`;
    albumViewer.hidden = false;
    document.body.classList.add('modal-open');
  };

  const renderEmpty = (message) => {
    albumGrid.innerHTML = `<article class="album-empty"><p>${escapeHtml(message)}</p></article>`;
    albumEntries = [];
    closeViewer();
  };

  const renderAlbum = (entries = [], { ownedCount = 0, totalCount = 0, source = 'database' } = {}) => {
    albumEntries = entries;

    if (albumCount) {
      albumCount.textContent = `${ownedCount} / ${totalCount} carte${totalCount > 1 ? 's' : ''}`;
    }

    if (!entries.length) {
      renderEmpty('Aucune carte enregistrée pour le moment.');
      setHint('Album vide.');
      return;
    }

    albumGrid.innerHTML = entries.map((card, index) => {
      const cardNumber = normalizeCardNumber(card.cardNumber);
      const displayName = card.cardName || card.name || card.creatorName;
      return `
        <button class="album-card rank-${escapeHtml(card.rank)}" type="button" data-album-index="${index}" aria-label="Voir ${escapeHtml(displayName)} en grand">
          <span class="album-card__frame">
            <img src="${escapeHtml(card.cardCapture)}" alt="${escapeHtml(`Carte ${card.rank} de ${card.creatorName}`)}" loading="lazy">
          </span>
          <span class="album-card__meta">
            <strong>${escapeHtml(displayName)}</strong>
            <small>${escapeHtml(formatCardNumber(cardNumber, 'Sans numéro'))} · ${escapeHtml(card.rank)}</small>
          </span>
        </button>
      `;
    }).join('');

    const newest = entries[0];
    const sourceMessage = source === 'local' ? ' Cache local.' : '';
    setHint(`${ownedCount} / ${totalCount} · ${newest.cardName || newest.name || newest.creatorName}${sourceMessage}`);
  };

  const onAlbumGridClick = (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-album-index]') : null;
    if (!target) return;
    openViewer(Number(target.getAttribute('data-album-index')));
  };

  albumGrid?.addEventListener('click', onAlbumGridClick);
  closeAlbumViewerBtn?.addEventListener('click', closeViewer);
  albumViewer?.addEventListener('click', (event) => {
    if (event.target instanceof HTMLElement && event.target.hasAttribute('data-close-album-viewer')) {
      closeViewer();
    }
  });

  const onKeyDown = (event) => {
    if (event.key === 'Escape') closeViewer();
  };
  document.addEventListener('keydown', onKeyDown);

  const cleanupCommon = await initCommon({
    requireAuth: true,
    onUserChanged: async (user) => {
      if (!user) {
        renderEmpty('Connecte-toi pour consulter ton album.');
        setHint('Connexion requise.', true);
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
    closeViewer();
    albumGrid?.removeEventListener('click', onAlbumGridClick);
    closeAlbumViewerBtn?.removeEventListener('click', closeViewer);
    document.removeEventListener('keydown', onKeyDown);
  };
};
