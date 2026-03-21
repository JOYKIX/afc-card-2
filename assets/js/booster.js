import { escapeHtml, formatCardNumber } from './firebase.js';
import { initCommon } from './common.js';
import { BOOSTER_COST, loadProfileAlbum, saveAlbumDrops } from './lib/album-storage.js';
import { buildCardCatalogStats, getCardWeight, getDropRates, getDuplicateSellValue, loadApprovedCards } from './lib/cards-catalog.js';

const rarityPresentation = {
  D: { label: 'Commune', flavor: 'Flux stable', accent: '#8aa0ff' },
  C: { label: 'Peu commune', flavor: 'Signal brillant', accent: '#53ebff' },
  B: { label: 'Rare', flavor: 'Impact énergique', accent: '#79f5be' },
  A: { label: 'Épique', flavor: 'Aura premium', accent: '#ff73bb' },
  S: { label: 'Légendaire', flavor: 'Explosion divine', accent: '#ffd969' },
  Ω: { label: 'Mythique Ω', flavor: 'Distorsion cosmique', accent: '#c796ff' }
};

const pickWeightedCard = (cards, catalogStats) => {
  const totalWeight = cards.reduce((sum, card) => sum + getCardWeight(card, catalogStats), 0);
  if (totalWeight <= 0) return cards[0];

  let threshold = Math.random() * totalWeight;
  for (const card of cards) {
    threshold -= getCardWeight(card, catalogStats);
    if (threshold <= 0) return card;
  }

  return cards[cards.length - 1];
};

const buildBooster = (cards, size = 5, catalogStats = buildCardCatalogStats(cards)) => {
  if (cards.length === 0) return [];
  if (cards.length === 1) return Array.from({ length: size }, () => cards[0]);
  return Array.from({ length: size }, () => pickWeightedCard(cards, catalogStats));
};

export const initBoosterPage = async () => {
  const openBoosterBtn = document.getElementById('openBooster');
  const boosterHint = document.getElementById('boosterHint');
  const boosterGrid = document.getElementById('boosterGrid');
  const boosterCoins = document.getElementById('boosterCoins');
  const dailyRewardStatus = document.getElementById('dailyRewardStatus');
  const catalogCount = document.getElementById('catalogCount');
  const dropRateList = document.getElementById('dropRateList');
  const boosterStage = document.getElementById('boosterStage');
  const boosterPack = document.getElementById('boosterPack');
  const boosterViewer = document.getElementById('boosterViewer');
  const boosterViewerMedia = document.getElementById('boosterViewerMedia');
  const boosterViewerImage = document.getElementById('boosterViewerImage');
  const boosterViewerTitle = document.getElementById('boosterViewerTitle');
  const boosterViewerSubtitle = document.getElementById('boosterViewerSubtitle');
  const boosterViewerRank = document.getElementById('boosterViewerRank');
  const closeBoosterViewerBtn = document.getElementById('closeBoosterViewer');
  const boosterOpeningModal = document.getElementById('boosterOpeningModal');
  const boosterOpeningDialog = document.getElementById('boosterOpeningDialog');
  const boosterOpeningPack = document.getElementById('boosterOpeningPack');
  const boosterOpeningStatus = document.getElementById('boosterOpeningStatus');
  const boosterOpeningSpotlight = document.getElementById('boosterOpeningSpotlight');
  const boosterOpeningSpotlightRank = document.getElementById('boosterOpeningSpotlightRank');
  const boosterOpeningSpotlightLabel = document.getElementById('boosterOpeningSpotlightLabel');
  const boosterOpeningSpotlightText = document.getElementById('boosterOpeningSpotlightText');
  const boosterRarityTrack = document.getElementById('boosterRarityTrack');
  const closeBoosterOpeningBtn = document.getElementById('closeBoosterOpening');
  let currentUser = null;
  let currentCoins = 50;
  let boosterEntries = [];
  let openingTimeouts = [];
  let boosterOpeningCanClose = true;

  const handleCloseOpeningModal = () => closeOpeningModal();
  const syncBodyModalState = () => {
    const hasViewerOpen = Boolean(boosterViewer && !boosterViewer.hidden);
    const hasOpeningModalOpen = Boolean(boosterOpeningModal && !boosterOpeningModal.hidden);
    document.body.classList.toggle('modal-open', hasViewerOpen || hasOpeningModalOpen);
  };

  const handleBoosterError = (error, message = 'Impossible de charger les cartes.') => {
    console.error('Erreur booster :', error);
    resetBoosterStage(message);
    setHint(message, true);
  };

  const clearOpeningTimers = () => {
    openingTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    openingTimeouts = [];
  };

  const queueTimeout = (callback, delay) => {
    const timeoutId = window.setTimeout(callback, delay);
    openingTimeouts.push(timeoutId);
    return timeoutId;
  };

  const setHint = (message, isError = false) => {
    if (!boosterHint) return;
    boosterHint.textContent = message;
    boosterHint.dataset.state = isError ? 'error' : 'ready';
  };

  const closeViewer = () => {
    if (!boosterViewer || boosterViewer.hidden) return;
    boosterViewer.hidden = true;
    syncBodyModalState();
  };

  const closeOpeningModal = ({ force = false } = {}) => {
    if (!boosterOpeningModal || boosterOpeningModal.hidden) return;
    if (!force && !boosterOpeningCanClose) return;

    boosterOpeningModal.hidden = true;
    boosterOpeningDialog?.classList.remove('is-animating', 'is-revealed');
    boosterOpeningPack?.classList.remove('is-pulsing', 'is-opening');
    boosterOpeningStatus?.removeAttribute('data-rank');
    boosterOpeningSpotlight?.removeAttribute('data-rank');
    boosterRarityTrack?.classList.remove('is-reveal-phase');
    syncBodyModalState();
  };

  const showOpeningModal = () => {
    if (!boosterOpeningModal || !boosterOpeningDialog) return;
    boosterOpeningCanClose = false;
    boosterOpeningModal.hidden = false;
    boosterOpeningDialog.classList.add('is-animating');
    boosterOpeningDialog.classList.remove('is-revealed');
    boosterOpeningPack?.classList.add('is-pulsing');
    boosterRarityTrack?.classList.remove('is-reveal-phase');
    syncBodyModalState();
  };

  const updateSpotlight = (rank = 'D', description = '') => {
    const presentation = rarityPresentation[rank] || rarityPresentation.D;

    if (boosterOpeningStatus) boosterOpeningStatus.dataset.rank = rank;
    if (boosterOpeningSpotlight) boosterOpeningSpotlight.dataset.rank = rank;
    if (boosterOpeningSpotlightRank) boosterOpeningSpotlightRank.textContent = rank;
    if (boosterOpeningSpotlightLabel) boosterOpeningSpotlightLabel.textContent = presentation.label;
    if (boosterOpeningSpotlightText) boosterOpeningSpotlightText.textContent = description || presentation.flavor;
  };

  const openViewer = (index) => {
    const card = boosterEntries[index];
    if (!card || !boosterViewer || !boosterViewerMedia || !boosterViewerImage || !boosterViewerTitle || !boosterViewerSubtitle || !boosterViewerRank) return;

    boosterViewerImage.src = card.cardCapture || '';
    boosterViewerImage.alt = `Carte ${card.rank} de ${card.creatorName}`;
    boosterViewerTitle.textContent = card.cardName || card.name || card.creatorName;
    boosterViewerSubtitle.textContent = `${formatCardNumber(card.cardNumber, 'Sans numéro')} · ${card.creatorName}`;
    boosterViewerRank.textContent = `Rang ${card.rank}`;
    boosterViewerMedia.className = `card-viewer__media rank-${card.rank}`;
    boosterViewer.hidden = false;
    syncBodyModalState();
  };

  const resetBoosterStage = (message) => {
    clearOpeningTimers();
    boosterEntries = [];
    closeViewer();
    closeOpeningModal({ force: true });
    boosterStage?.classList.remove('is-opening', 'is-revealed');
    boosterPack?.classList.remove('is-opening', 'is-opened');
    boosterGrid.innerHTML = `<article class="booster-empty"><p>${escapeHtml(message)}</p></article>`;
  };

  const setCoins = (coins) => {
    currentCoins = Math.max(0, Number(coins) || 0);
    if (boosterCoins) {
      boosterCoins.textContent = `${currentCoins} coin${currentCoins > 1 ? 's' : ''}`;
    }
    if (openBoosterBtn) {
      openBoosterBtn.disabled = currentCoins < BOOSTER_COST;
    }
  };

  const renderDropRates = (cards) => {
    if (!dropRateList) return;

    const rates = getDropRates(cards);
    const visibleRates = rates.filter((entry) => entry.count > 0);
    dropRateList.innerHTML = visibleRates.length
      ? visibleRates
          .map((entry) => `<li><strong>${entry.rank}</strong> · ${entry.chance.toFixed(1)}% · ${entry.count} carte${entry.count > 1 ? 's' : ''} · +${entry.sellValue}</li>`)
          .join('')
      : '<li>Aucune carte validée.</li>';

    if (catalogCount) {
      catalogCount.textContent = `${cards.length} carte${cards.length > 1 ? 's' : ''} validée${cards.length > 1 ? 's' : ''}`;
    }
  };

  const renderBoosterCards = (cards, soldDuplicates = []) => {
    const soldIds = new Set(soldDuplicates.map((card) => String(card.uniqueId)));
    boosterEntries = cards;
    boosterGrid.innerHTML = '';

    cards.forEach((card, index) => {
      const isDuplicate = soldIds.has(String(card.uniqueId));
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `booster-capture rank-${card.rank}`;
      item.dataset.boosterIndex = String(index);
      item.style.setProperty('--card-delay', `${index * 120}ms`);
      item.innerHTML = `
        <span class="booster-capture__frame">
          <img src="${escapeHtml(card.cardCapture)}" alt="${escapeHtml(`Carte ${card.rank} de ${card.creatorName}`)}" loading="lazy">
        </span>
        <span class="booster-capture__meta">
          <strong>${escapeHtml(card.cardName || card.name || card.creatorName)}</strong>
          <small>${escapeHtml(formatCardNumber(card.cardNumber, 'Sans numéro'))} · ${escapeHtml(card.creatorName)}</small>
        </span>
        <span class="booster-capture__rank">${escapeHtml(card.rank)}${isDuplicate ? ` · +${escapeHtml(String(card.sellValue))}` : ''}</span>
      `;
      boosterGrid.appendChild(item);
    });
  };

  const renderOpeningTrack = (cards, soldDuplicates = []) => {
    if (!boosterRarityTrack) return;

    const soldIds = new Set(soldDuplicates.map((card) => String(card.uniqueId)));
    boosterRarityTrack.innerHTML = '';

    cards.forEach((card, index) => {
      const presentation = rarityPresentation[card.rank] || rarityPresentation.D;
      const isDuplicate = soldIds.has(String(card.uniqueId));
      const item = document.createElement('article');
      item.className = 'booster-opening-card';
      item.dataset.rank = card.rank;
      item.style.setProperty('--reveal-delay', `${index * 180}ms`);
      item.innerHTML = `
        <div class="booster-opening-card__rarity">
          <span class="booster-opening-card__rarity-rank">${escapeHtml(card.rank)}</span>
          <strong>${escapeHtml(presentation.label)}</strong>
          <small>${escapeHtml(presentation.flavor)}</small>
        </div>
        <div class="booster-opening-card__reveal">
          <span class="booster-opening-card__shine"></span>
          <img src="${escapeHtml(card.cardCapture)}" alt="${escapeHtml(`Carte ${card.rank} de ${card.creatorName}`)}" loading="lazy">
          <div class="booster-opening-card__meta">
            <strong>${escapeHtml(card.cardName || card.name || card.creatorName)}</strong>
            <small>${escapeHtml(formatCardNumber(card.cardNumber, 'Sans numéro'))} · ${escapeHtml(card.creatorName)}${isDuplicate ? ` · +${escapeHtml(String(card.sellValue))} coins` : ''}</small>
          </div>
        </div>
      `;
      boosterRarityTrack.appendChild(item);
    });
  };

  const playOpeningSequence = (cards, soldDuplicates = []) => new Promise((resolve) => {
    clearOpeningTimers();
    renderOpeningTrack(cards, soldDuplicates);
    showOpeningModal();
    boosterStage?.classList.remove('is-revealed');
    boosterStage?.classList.add('is-opening');
    boosterPack?.classList.remove('is-opened');
    boosterPack?.classList.add('is-opening');
    boosterGrid.innerHTML = '';
    if (boosterOpeningStatus) {
      boosterOpeningStatus.textContent = 'Calibrage du noyau booster...';
    }
    updateSpotlight('D', 'Analyse des fréquences en cours…');

    queueTimeout(() => {
      boosterPack?.classList.add('is-opened');
      boosterOpeningPack?.classList.add('is-opening');
      if (boosterOpeningStatus) {
        boosterOpeningStatus.textContent = 'Compression d’énergie... attention au drop.';
      }
    }, 300);

    cards.forEach((card, index) => {
      queueTimeout(() => {
        const currentCard = boosterRarityTrack?.children[index];
        currentCard?.classList.add('is-rarity-visible');
        updateSpotlight(card.rank, `${rarityPresentation[card.rank]?.label || `Rang ${card.rank}`} détecté pour la carte ${index + 1}.`);
        if (boosterOpeningStatus) {
          boosterOpeningStatus.textContent = `Signature ${card.rank} repérée · slot ${index + 1}/5`;
        }
      }, 850 + (index * 260));
    });

    queueTimeout(() => {
      boosterRarityTrack?.classList.add('is-reveal-phase');
      boosterOpeningPack?.classList.remove('is-pulsing');
      renderBoosterCards(cards, soldDuplicates);
      boosterStage?.classList.add('is-revealed');
      if (boosterOpeningStatus) {
        boosterOpeningStatus.textContent = 'Révélation totale du booster.';
      }
    }, 2300);

    cards.forEach((card, index) => {
      queueTimeout(() => {
        const currentCard = boosterRarityTrack?.children[index];
        currentCard?.classList.add('is-card-visible');
        updateSpotlight(card.rank, `${card.cardName || card.name || card.creatorName} sort du portail.`);
      }, 2450 + (index * 220));
    });

    queueTimeout(() => {
      boosterStage?.classList.remove('is-opening');
      boosterPack?.classList.remove('is-opening');
      boosterOpeningDialog?.classList.add('is-revealed');
      boosterOpeningCanClose = true;
    }, 3600);

    queueTimeout(() => {
      resolve();
    }, 3650);
  });

  const refreshProfileStats = async () => {
    if (!currentUser) {
      setCoins(50);
      if (dailyRewardStatus) dailyRewardStatus.textContent = 'Connecte-toi pour recevoir tes 50 coins quotidiens.';
      return;
    }

    const profileAlbum = await loadProfileAlbum(currentUser.uid);
    setCoins(profileAlbum.coins);
    if (dailyRewardStatus) {
      dailyRewardStatus.textContent = 'La connexion du jour crédite automatiquement 50 coins.';
    }
  };

  const openBooster = async () => {
    if (!currentUser) {
      setHint('Connecte-toi pour ouvrir un booster.', true);
      return;
    }

    if (currentCoins < BOOSTER_COST) {
      setHint(`Il te faut ${BOOSTER_COST} coins. Solde : ${currentCoins}.`, true);
      return;
    }

    openBoosterBtn.disabled = true;
    setHint('Ouverture…');

    try {
      const cards = await loadApprovedCards();
      renderDropRates(cards);

      if (cards.length === 0) {
        resetBoosterStage('Aucune carte validée pour le moment.');
        setHint('Aucune carte disponible.', true);
        openBoosterBtn.disabled = false;
        return;
      }

      const catalogStats = buildCardCatalogStats(cards);
      const pulls = buildBooster(cards, 5, catalogStats).map((card) => ({
        ...card,
        sellValue: getDuplicateSellValue(card, catalogStats)
      }));

      const outcome = await saveAlbumDrops(currentUser.uid, pulls, { boosterCost: BOOSTER_COST });

      if (!outcome.ok && outcome.reason === 'insufficient-coins') {
        setCoins(outcome.balance);
        resetBoosterStage('Pas assez de coins.');
        setHint(`Booster refusé : ${outcome.balance} coins.`, true);
        return;
      }

      await playOpeningSequence(pulls, outcome.soldDuplicates);
      setCoins(outcome.balance);

      const duplicateCount = outcome.soldDuplicates.length;
      const uniqueCards = new Set(pulls.map((card) => card.uniqueId)).size;
      const resaleSummary = duplicateCount > 0 ? ` · +${outcome.duplicateCoins} coins` : '';

      if (cards.length === 1) {
        setHint(`5 cartes tirées · 1 seule carte dispo${resaleSummary}`);
        return;
      }

      setHint(`${pulls.length} cartes · ${uniqueCards} distincte(s) · ${outcome.keptCards.length} nouvelle(s)${resaleSummary}`);
    } catch (error) {
      handleBoosterError(error, 'Impossible d’ouvrir le booster.');
    } finally {
      if (currentCoins >= BOOSTER_COST) {
        openBoosterBtn.disabled = false;
      }
    }
  };

  const onBoosterGridClick = (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-booster-index]') : null;
    if (!target) return;
    openViewer(Number(target.getAttribute('data-booster-index')));
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      closeViewer();
      closeOpeningModal();
    }
  };

  openBoosterBtn?.addEventListener('click', openBooster);
  boosterGrid?.addEventListener('click', onBoosterGridClick);
  closeBoosterViewerBtn?.addEventListener('click', closeViewer);
  closeBoosterOpeningBtn?.addEventListener('click', handleCloseOpeningModal);
  boosterViewer?.addEventListener('click', (event) => {
    if (event.target instanceof HTMLElement && event.target.hasAttribute('data-close-booster-viewer')) {
      closeViewer();
    }
  });
  boosterOpeningModal?.addEventListener('click', (event) => {
    if (event.target instanceof HTMLElement && event.target.hasAttribute('data-close-booster-opening')) {
      handleCloseOpeningModal();
    }
  });
  document.addEventListener('keydown', onKeyDown);

  const cleanupCommon = await initCommon({
    requireAuth: true,
    onUserChanged: async (user) => {
      currentUser = user;
      try {
        const cards = await loadApprovedCards();
        renderDropRates(cards);
        await refreshProfileStats();
      } catch (error) {
        handleBoosterError(error);
      }
    }
  });

  resetBoosterStage('Ouvre un booster pour découvrir 5 cartes.');
  setHint(`Prêt · ${BOOSTER_COST} coins.`);

  return () => {
    cleanupCommon?.();
    clearOpeningTimers();
    closeViewer();
    closeOpeningModal({ force: true });
    openBoosterBtn?.removeEventListener('click', openBooster);
    boosterGrid?.removeEventListener('click', onBoosterGridClick);
    closeBoosterViewerBtn?.removeEventListener('click', closeViewer);
    closeBoosterOpeningBtn?.removeEventListener('click', handleCloseOpeningModal);
    document.removeEventListener('keydown', onKeyDown);
  };
};
