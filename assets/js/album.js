import { escapeHtml, formatCardNumber, normalizeCardNumber } from './firebase.js';
import { initCommon } from './common.js';
import { loadAlbum } from './lib/album-storage.js';
import { loadApprovedCards, rarityRanks } from './lib/cards-catalog.js';

const CARDS_PER_PAGE = 9;
const PAGE_TURN_ANIMATION_MS = 560;

const getDisplayName = (card = {}) => card.cardName || card.name || card.creatorName || 'Carte';
const rankOrder = Object.fromEntries(rarityRanks.map((rank, index) => [rank, index]));

const buildAlbumSlots = (catalog = [], ownedEntries = []) => {
  const ownedById = new Map(ownedEntries.map((entry) => [String(entry.uniqueId), entry]));

  return [...catalog]
    .sort((a, b) => {
      const left = normalizeCardNumber(a.cardNumber);
      const right = normalizeCardNumber(b.cardNumber);
      if (left && right) return left - right;
      if (left) return -1;
      if (right) return 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    })
    .map((card) => {
      const uniqueId = String(card.uniqueId || card.id || card.cardNumber || '');
      const owned = ownedById.get(uniqueId);
      return {
        ...card,
        ...owned,
        uniqueId,
        owned: Boolean(owned),
        cardNumber: normalizeCardNumber(card.cardNumber ?? owned?.cardNumber),
        cardName: card.cardName || owned?.cardName || card.name || owned?.name || '',
        name: card.name || owned?.name || card.cardName || owned?.cardName || '',
        creatorName: card.creatorName || owned?.creatorName || 'Créateur inconnu',
        cardCapture: owned?.cardCapture || card.cardCapture || ''
      };
    });
};

const sortAlbumEntries = (entries = []) => [...entries].sort((left, right) => {
  if (left.owned !== right.owned) return left.owned ? -1 : 1;

  const leftRank = rankOrder[left.rank] ?? -1;
  const rightRank = rankOrder[right.rank] ?? -1;
  if (leftRank !== rightRank) return rightRank - leftRank;

  const leftNumber = normalizeCardNumber(left.cardNumber);
  const rightNumber = normalizeCardNumber(right.cardNumber);
  if (leftNumber && rightNumber) return leftNumber - rightNumber;
  if (leftNumber) return -1;
  if (rightNumber) return 1;

  return getDisplayName(left).localeCompare(getDisplayName(right), 'fr');
});

export const initAlbumPage = async () => {
  const albumGrid = document.getElementById('albumGrid');
  const albumHint = document.getElementById('albumHint');
  const albumCount = document.getElementById('albumCount');
  const albumPageIndicator = document.getElementById('albumPageIndicator');
  const albumPrevPage = document.getElementById('albumPrevPage');
  const albumNextPage = document.getElementById('albumNextPage');
  const albumViewer = document.getElementById('albumViewer');
  const albumViewerMedia = document.getElementById('albumViewerMedia');
  const albumViewerImage = document.getElementById('albumViewerImage');
  const albumViewerTitle = document.getElementById('albumViewerTitle');
  const albumViewerSubtitle = document.getElementById('albumViewerSubtitle');
  const albumViewerRank = document.getElementById('albumViewerRank');
  const closeAlbumViewerBtn = document.getElementById('closeAlbumViewer');
  const albumCompletionPercent = document.getElementById('albumCompletionPercent');
  const albumCompletionText = document.getElementById('albumCompletionText');
  const albumCompletionBar = document.getElementById('albumCompletionBar');
  const albumOwnedCount = document.getElementById('albumOwnedCount');
  const albumMissingCount = document.getElementById('albumMissingCount');
  const albumRecentCard = document.getElementById('albumRecentCard');
  const albumSearch = document.getElementById('albumSearch');
  const albumOwnershipFilter = document.getElementById('albumOwnershipFilter');
  const albumRankFilter = document.getElementById('albumRankFilter');
  const albumFilterSummary = document.getElementById('albumFilterSummary');

  let allAlbumEntries = [];
  let albumEntries = [];
  let currentPage = 0;
  let totalPages = 1;
  let pageTurnTimer = null;
  let currentFilters = { search: '', ownership: 'all', rank: 'all' };

  const handleAlbumError = (error, message = 'Impossible de charger l’album.') => {
    console.error('Erreur album :', error);
    renderEmpty(message);
    setHint(message, true);
    if (albumCount) albumCount.textContent = '0 / 0 carte';
    updateOverviewStats({ ownedCount: 0, totalCount: 0 });
  };

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

  const updatePaginationUi = () => {
    totalPages = Math.max(1, Math.ceil(albumEntries.length / CARDS_PER_PAGE));
    currentPage = Math.min(currentPage, totalPages - 1);

    if (albumPageIndicator) {
      albumPageIndicator.textContent = `Page ${totalPages ? currentPage + 1 : 0} / ${totalPages}`;
    }

    if (albumPrevPage) albumPrevPage.disabled = currentPage <= 0;
    if (albumNextPage) albumNextPage.disabled = currentPage >= totalPages - 1;
  };

  const updateOverviewStats = ({ ownedCount = 0, totalCount = 0 } = {}) => {
    const missingCount = Math.max(0, totalCount - ownedCount);
    const completion = totalCount ? Math.round((ownedCount / totalCount) * 100) : 0;
    const mostRecentOwned = [...allAlbumEntries]
      .filter((entry) => entry.owned)
      .sort((left, right) => (Number(right.droppedAt) || 0) - (Number(left.droppedAt) || 0))[0];

    if (albumCompletionPercent) albumCompletionPercent.textContent = `${completion}%`;
    if (albumCompletionText) {
      albumCompletionText.textContent = totalCount
        ? `${ownedCount} carte${ownedCount > 1 ? 's' : ''} obtenue${ownedCount > 1 ? 's' : ''} sur ${totalCount}.`
        : 'Aucune carte synchronisée pour le moment.';
    }
    if (albumCompletionBar) albumCompletionBar.style.width = `${completion}%`;
    if (albumOwnedCount) albumOwnedCount.textContent = String(ownedCount);
    if (albumMissingCount) albumMissingCount.textContent = String(missingCount);
    if (albumRecentCard) albumRecentCard.textContent = mostRecentOwned ? getDisplayName(mostRecentOwned) : '—';
  };

  const openViewer = (index) => {
    const card = albumEntries[index];
    if (!card || !card.owned || !albumViewer || !albumViewerImage || !albumViewerTitle || !albumViewerSubtitle || !albumViewerRank || !albumViewerMedia) return;

    const cardNumber = normalizeCardNumber(card.cardNumber);
    albumViewerImage.src = card.cardCapture || '';
    albumViewerImage.alt = `Carte ${card.rank} de ${card.creatorName}`;
    albumViewerTitle.textContent = getDisplayName(card);
    albumViewerSubtitle.textContent = `${formatCardNumber(cardNumber, 'Sans numéro')} · ${card.creatorName}`;
    albumViewerRank.textContent = `Rang ${card.rank}`;
    albumViewerMedia.className = `card-viewer__media rank-${escapeHtml(card.rank)}`;
    albumViewer.hidden = false;
    document.body.classList.add('modal-open');
  };

  const animatePageTurn = (direction = 'next') => {
    if (!albumGrid) return;
    albumGrid.classList.remove('is-turning-next', 'is-turning-prev');
    void albumGrid.offsetWidth;
    albumGrid.classList.add(direction === 'prev' ? 'is-turning-prev' : 'is-turning-next');
    window.clearTimeout(pageTurnTimer);
    pageTurnTimer = window.setTimeout(() => {
      albumGrid.classList.remove('is-turning-next', 'is-turning-prev');
    }, PAGE_TURN_ANIMATION_MS);
  };

  const updateFilterSummary = () => {
    if (!albumFilterSummary) return;

    const labels = [];
    if (currentFilters.ownership === 'owned') labels.push('obtenues');
    if (currentFilters.ownership === 'missing') labels.push('manquantes');
    if (currentFilters.rank !== 'all') labels.push(`rang ${currentFilters.rank}`);
    if (currentFilters.search) labels.push(`"${currentFilters.search}"`);

    albumFilterSummary.textContent = `${albumEntries.length} carte${albumEntries.length > 1 ? 's' : ''} affichée${albumEntries.length > 1 ? 's' : ''}${labels.length ? ` · ${labels.join(' · ')}` : ''}`;
  };

  const renderEmpty = (message) => {
    if (!albumGrid) return;
    albumGrid.innerHTML = `<article class="album-empty"><p>${escapeHtml(message)}</p></article>`;
    albumEntries = [];
    currentPage = 0;
    updatePaginationUi();
    updateFilterSummary();
    closeViewer();
  };

  const renderCurrentPage = () => {
    if (!albumGrid) return;

    updatePaginationUi();
    updateFilterSummary();

    const pageEntries = albumEntries.slice(currentPage * CARDS_PER_PAGE, (currentPage + 1) * CARDS_PER_PAGE);
    const pageMarkup = pageEntries.map((card, pageIndex) => {
      const absoluteIndex = (currentPage * CARDS_PER_PAGE) + pageIndex;
      const cardNumber = normalizeCardNumber(card.cardNumber);
      const displayName = getDisplayName(card);
      const creatorName = card.creatorName || 'Créateur inconnu';
      const label = card.owned
        ? `Voir ${displayName} en grand`
        : `Emplacement vide ${formatCardNumber(cardNumber, 'Sans numéro')}`;

      return `
        <button class="album-card rank-${escapeHtml(card.rank)}${card.owned ? '' : ' album-card--missing'}" type="button" data-album-index="${absoluteIndex}" aria-label="${escapeHtml(label)}" ${card.owned ? '' : 'disabled'}>
          <span class="album-card__frame">
            <span class="album-card__number">${escapeHtml(formatCardNumber(cardNumber, 'Sans numéro'))}</span>
            ${card.owned ? `
              <img src="${escapeHtml(card.cardCapture)}" alt="${escapeHtml(`Carte ${card.rank} de ${card.creatorName}`)}" loading="lazy">
            ` : `
              <span class="album-card__placeholder" aria-hidden="true"><span>?</span></span>
            `}
          </span>
          <span class="album-card__meta">
            <span class="album-card__status">${card.owned ? 'Obtenue' : 'À découvrir'}</span>
            <strong>${escapeHtml(card.owned ? displayName : 'Nom masqué')}</strong>
            <small>${escapeHtml(card.owned ? `${creatorName} · rang ${card.rank}` : `Créateur masqué · rang ${card.rank}`)}</small>
          </span>
        </button>
      `;
    });

    while (pageMarkup.length < CARDS_PER_PAGE) {
      pageMarkup.push('<article class="album-card album-card--filler" aria-hidden="true"></article>');
    }

    albumGrid.innerHTML = pageMarkup.join('');
  };

  const applyFilters = ({ preservePage = false } = {}) => {
    const search = currentFilters.search.trim().toLowerCase();

    albumEntries = sortAlbumEntries(allAlbumEntries.filter((card) => {
      if (currentFilters.ownership === 'owned' && !card.owned) return false;
      if (currentFilters.ownership === 'missing' && card.owned) return false;
      if (currentFilters.rank !== 'all' && card.rank !== currentFilters.rank) return false;
      if (!search) return true;

      const haystack = [
        getDisplayName(card),
        card.creatorName,
        formatCardNumber(card.cardNumber, ''),
        card.rank,
        card.uniqueId
      ].join(' ').toLowerCase();

      return haystack.includes(search);
    }));

    if (!preservePage) currentPage = 0;

    if (!albumEntries.length) {
      renderEmpty('Aucune carte ne correspond à ces filtres.');
      setHint('Ajuste tes filtres pour voir plus de cartes.', true);
      return;
    }

    renderCurrentPage();
    setHint(`Collection triée et filtrée · ${albumEntries.length} résultat${albumEntries.length > 1 ? 's' : ''}.`);
  };

  const renderAlbum = (entries = [], { ownedCount = 0, totalCount = 0, source = 'database' } = {}) => {
    allAlbumEntries = entries;
    updateOverviewStats({ ownedCount, totalCount });

    if (albumCount) {
      albumCount.textContent = `${ownedCount} / ${totalCount} carte${totalCount > 1 ? 's' : ''}`;
    }

    if (!entries.length) {
      renderEmpty('Aucune carte validée n’est disponible pour le moment.');
      setHint('Album indisponible.');
      return;
    }

    applyFilters();

    const sourceMessage = source === 'local' ? ' · Cache local utilisé.' : '';
    setHint(`Collection triée par progression et rareté · ${ownedCount} carte${ownedCount > 1 ? 's' : ''} obtenue${ownedCount > 1 ? 's' : ''}${sourceMessage}`);
  };

  const onAlbumGridClick = (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-album-index]') : null;
    if (!target || target.hasAttribute('disabled')) return;
    openViewer(Number(target.getAttribute('data-album-index')));
  };

  const changePage = (nextPage, direction = 'next') => {
    const boundedPage = Math.max(0, Math.min(nextPage, totalPages - 1));
    if (boundedPage === currentPage) return;
    currentPage = boundedPage;
    animatePageTurn(direction);
    renderCurrentPage();
  };

  albumGrid?.addEventListener('click', onAlbumGridClick);
  albumPrevPage?.addEventListener('click', () => changePage(currentPage - 1, 'prev'));
  albumNextPage?.addEventListener('click', () => changePage(currentPage + 1, 'next'));
  closeAlbumViewerBtn?.addEventListener('click', closeViewer);
  albumViewer?.addEventListener('click', (event) => {
    if (event.target instanceof HTMLElement && event.target.hasAttribute('data-close-album-viewer')) {
      closeViewer();
    }
  });

  albumSearch?.addEventListener('input', (event) => {
    currentFilters.search = event.target.value || '';
    applyFilters();
  });

  albumOwnershipFilter?.addEventListener('change', (event) => {
    currentFilters.ownership = event.target.value || 'all';
    applyFilters();
  });

  albumRankFilter?.addEventListener('change', (event) => {
    currentFilters.rank = event.target.value || 'all';
    applyFilters();
  });

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      closeViewer();
      return;
    }

    if (event.key === 'ArrowLeft') {
      changePage(currentPage - 1, 'prev');
    }

    if (event.key === 'ArrowRight') {
      changePage(currentPage + 1, 'next');
    }
  };
  document.addEventListener('keydown', onKeyDown);

  const cleanupCommon = await initCommon({
    requireAuth: true,
    onUserChanged: async (user) => {
      if (!user) {
        allAlbumEntries = [];
        renderEmpty('Connecte-toi pour consulter ton album.');
        setHint('Connexion requise.', true);
        if (albumCount) albumCount.textContent = '0 / 0 carte';
        updateOverviewStats({ ownedCount: 0, totalCount: 0 });
        return;
      }

      try {
        const catalog = await loadApprovedCards();
        const album = await loadAlbum(user.uid, catalog);
        const slots = buildAlbumSlots(catalog, album.entries);
        renderAlbum(slots, {
          ownedCount: album.uniqueCount,
          totalCount: catalog.length,
          source: album.source
        });
      } catch (error) {
        handleAlbumError(error);
      }
    }
  });

  return () => {
    cleanupCommon?.();
    closeViewer();
    window.clearTimeout(pageTurnTimer);
    albumGrid?.removeEventListener('click', onAlbumGridClick);
    closeAlbumViewerBtn?.removeEventListener('click', closeViewer);
    document.removeEventListener('keydown', onKeyDown);
  };
};
