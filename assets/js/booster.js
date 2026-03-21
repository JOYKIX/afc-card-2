import { escapeHtml, formatCardNumber } from './firebase.js';
import { initCommon } from './common.js';
import { BOOSTER_COST, loadProfileAlbum, saveAlbumDrops } from './lib/album-storage.js';
import { buildCardCatalogStats, getCardWeight, getDropRates, getDuplicateSellValue, loadApprovedCards, rarityRanks } from './lib/cards-catalog.js';

const SIGNAL_STEP_DELAY = 650;
const REVEAL_STEP_DELAY = 820;
const PACK_CHARGE_DELAY = 720;
const PACK_OPEN_DELAY = 1480;
const PAUSE_BETWEEN_SIGNAL_AND_REVEAL = 1200;
const FALLBACK_PROFILE = { droppedCardIds: [], coins: 50 };

const getSequenceDuration = (cardCount) => PACK_OPEN_DELAY + 220 + ((Math.max(0, cardCount - 1)) * SIGNAL_STEP_DELAY) + PAUSE_BETWEEN_SIGNAL_AND_REVEAL + (cardCount * REVEAL_STEP_DELAY);

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

const getRankPriority = (rank = 'D') => {
  const index = rarityRanks.indexOf(rank);
  return index >= 0 ? index : 0;
};

const getBestRank = (cards = []) => cards.reduce((best, card) => {
  if (!best) return card.rank;
  return getRankPriority(card.rank) > getRankPriority(best) ? card.rank : best;
}, '');

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
  const boosterCostLabel = document.getElementById('boosterCostLabel');
  const boosterCollectionProgress = document.getElementById('boosterCollectionProgress');
  const boosterExpectedValue = document.getElementById('boosterExpectedValue');
  const boosterAvailability = document.getElementById('boosterAvailability');
  const boosterResultStatus = document.getElementById('boosterResultStatus');
  const boosterResultNote = document.getElementById('boosterResultNote');
  const boosterResultBestRank = document.getElementById('boosterResultBestRank');
  const boosterResultNewCards = document.getElementById('boosterResultNewCards');
  const boosterResultDuplicates = document.getElementById('boosterResultDuplicates');
  const boosterResultRefund = document.getElementById('boosterResultRefund');

  let currentUser = null;
  let currentCoins = 50;
  let boosterEntries = [];
  let openingTimeouts = [];
  let approvedCards = [];
  let catalogStats = buildCardCatalogStats([]);
  let latestProfileAlbum = { ...FALLBACK_PROFILE };

  const handleBoosterError = (error, message = 'Impossible de charger les cartes.') => {
    console.error('Erreur booster :', error);
    resetBoosterStage(message);
    setHint(message, true);
    if (boosterAvailability) boosterAvailability.textContent = 'Erreur de synchronisation';
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
    document.body.classList.remove('modal-open');
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
    document.body.classList.add('modal-open');
  };

  const getBoosterSlots = () => Array.from(boosterGrid?.querySelectorAll('[data-booster-index]') || []);

  const setSlotInteractiveState = (slot, isInteractive) => {
    if (!(slot instanceof HTMLButtonElement)) return;
    slot.disabled = !isInteractive;
    slot.setAttribute('aria-disabled', String(!isInteractive));
  };

  const resetSessionSummary = () => {
    if (boosterResultStatus) boosterResultStatus.textContent = 'Aucun booster ouvert pour le moment.';
    if (boosterResultNote) boosterResultNote.textContent = 'Ouvre un pack pour voir le meilleur rang, les nouveaux drops et les doublons revendus.';
    if (boosterResultBestRank) boosterResultBestRank.textContent = '—';
    if (boosterResultNewCards) boosterResultNewCards.textContent = '0';
    if (boosterResultDuplicates) boosterResultDuplicates.textContent = '0';
    if (boosterResultRefund) boosterResultRefund.textContent = '0';
  };

  const updateAvailability = () => {
    if (!boosterAvailability) return;
    if (!currentUser) {
      boosterAvailability.textContent = 'Connexion requise';
      return;
    }
    if (!approvedCards.length) {
      boosterAvailability.textContent = 'Catalogue vide';
      return;
    }
    if (currentCoins < BOOSTER_COST) {
      boosterAvailability.textContent = `Solde insuffisant · ${currentCoins}/${BOOSTER_COST}`;
      return;
    }
    boosterAvailability.textContent = 'Pack disponible';
  };

  const resetBoosterStage = (message) => {
    clearOpeningTimers();
    boosterEntries = [];
    closeViewer();
    boosterStage?.classList.remove('is-opening', 'is-revealed', 'is-signaling');
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
    updateAvailability();
  };

  const renderDropRates = (cards) => {
    if (!dropRateList) return;

    const rates = getDropRates(cards);
    const visibleRates = rates.filter((entry) => entry.count > 0);
    dropRateList.innerHTML = visibleRates.length
      ? visibleRates.map((entry) => `
          <li class="booster-rate-row rank-${escapeHtml(entry.rank)}">
            <div class="booster-rate-row__head">
              <strong>${entry.rank}</strong>
              <span>${entry.chance.toFixed(1)}%</span>
            </div>
            <div class="booster-rate-row__bar" aria-hidden="true">
              <span style="width:${Math.max(4, Math.min(100, entry.chance))}%"></span>
            </div>
            <small>${entry.count} carte${entry.count > 1 ? 's' : ''} · doublon +${entry.sellValue}</small>
          </li>
        `).join('')
      : '<li>Aucune carte validée.</li>';

    if (catalogCount) {
      catalogCount.textContent = `${cards.length} carte${cards.length > 1 ? 's' : ''} validée${cards.length > 1 ? 's' : ''}`;
    }

    if (boosterExpectedValue) {
      boosterExpectedValue.textContent = `${Math.round(catalogStats.expectedValuePerBooster || 0)} coins`;
    }
  };

  const renderBoosterSlots = (cards, soldDuplicates = []) => {
    const soldIds = new Set(soldDuplicates.map((card) => String(card.uniqueId)));
    boosterEntries = cards;
    boosterGrid.innerHTML = '';

    cards.forEach((card, index) => {
      const isDuplicate = soldIds.has(String(card.uniqueId));
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `booster-capture booster-capture--mystery rank-${card.rank}`;
      item.dataset.boosterIndex = String(index);
      item.style.setProperty('--card-delay', `${index * 120}ms`);
      item.innerHTML = `
        <span class="booster-capture__flare" aria-hidden="true"></span>
        <span class="booster-capture__veil" aria-hidden="true">
          <span class="booster-capture__signal">Aura détectée</span>
          <strong class="booster-capture__teaser-rank">Rang ${escapeHtml(card.rank)}</strong>
          <small class="booster-capture__teaser-copy">${isDuplicate ? 'Doublon possible · compensation automatique' : 'Nouvelle chance de compléter ton classeur'}</small>
        </span>
        <span class="booster-capture__frame">
          <img src="${escapeHtml(card.cardCapture)}" alt="${escapeHtml(`Carte ${card.rank} de ${card.creatorName}`)}" loading="lazy">
        </span>
        <span class="booster-capture__meta">
          <strong>${escapeHtml(card.cardName || card.name || card.creatorName)}</strong>
          <small>${escapeHtml(formatCardNumber(card.cardNumber, 'Sans numéro'))} · ${escapeHtml(card.creatorName)}</small>
        </span>
        <span class="booster-capture__rank">${escapeHtml(card.rank)}${isDuplicate ? ` · +${escapeHtml(String(card.sellValue))}` : ''}</span>
      `;
      setSlotInteractiveState(item, false);
      boosterGrid.appendChild(item);
    });
  };

  const playOpeningSequence = (cards, soldDuplicates = []) => {
    clearOpeningTimers();
    boosterStage?.classList.remove('is-revealed');
    boosterStage?.classList.add('is-opening');
    boosterPack?.classList.remove('is-opened');
    boosterPack?.classList.add('is-opening');
    boosterGrid.innerHTML = '';

    setHint('Le booster se charge… laisse monter le suspense.');

    queueTimeout(() => {
      boosterPack?.classList.add('is-opened');
      setHint('Le sceau cède… des auras sortent une par une.');
    }, PACK_CHARGE_DELAY);

    queueTimeout(() => {
      renderBoosterSlots(cards, soldDuplicates);
      boosterStage?.classList.add('is-signaling');
    }, PACK_OPEN_DELAY);

    cards.forEach((card, index) => {
      queueTimeout(() => {
        const slot = getBoosterSlots()[index];
        slot?.classList.add('is-signaled');
        setHint(`Signal ${index + 1}/${cards.length} · rang ${card.rank} détecté.`);
      }, PACK_OPEN_DELAY + 220 + (index * SIGNAL_STEP_DELAY));
    });

    const revealStartDelay = getSequenceDuration(cards.length) - (cards.length * REVEAL_STEP_DELAY);

    cards.forEach((card, index) => {
      queueTimeout(() => {
        const slot = getBoosterSlots()[index];
        if (!slot) return;
        slot.classList.add('is-revealed');
        setSlotInteractiveState(slot, true);
        setHint(`Révélation ${index + 1}/${cards.length} · ${card.cardName || card.name || card.creatorName}.`);
      }, revealStartDelay + (index * REVEAL_STEP_DELAY));
    });

    queueTimeout(() => {
      boosterStage?.classList.remove('is-opening', 'is-signaling');
      boosterStage?.classList.add('is-revealed');
      boosterPack?.classList.remove('is-opening');
    }, revealStartDelay + (cards.length * REVEAL_STEP_DELAY));
  };

  const updateCollectionSummary = () => {
    const ownedCount = new Set(latestProfileAlbum.droppedCardIds || []).size;
    const totalCards = approvedCards.length;
    const completion = totalCards ? Math.round((ownedCount / totalCards) * 100) : 0;

    if (boosterCollectionProgress) {
      boosterCollectionProgress.textContent = `${completion}%`;
    }

    if (boosterCostLabel) {
      boosterCostLabel.textContent = `${BOOSTER_COST} coins`;
    }
  };

  const refreshCatalog = async () => {
    approvedCards = await loadApprovedCards();
    catalogStats = buildCardCatalogStats(approvedCards);
    renderDropRates(approvedCards);
    updateCollectionSummary();
    updateAvailability();
  };

  const refreshProfileStats = async () => {
    if (!currentUser) {
      latestProfileAlbum = { ...FALLBACK_PROFILE };
      setCoins(50);
      if (dailyRewardStatus) dailyRewardStatus.textContent = 'Connecte-toi pour recevoir tes 50 coins quotidiens.';
      updateCollectionSummary();
      return;
    }

    latestProfileAlbum = await loadProfileAlbum(currentUser.uid);
    setCoins(latestProfileAlbum.coins);
    if (dailyRewardStatus) {
      dailyRewardStatus.textContent = 'La connexion du jour crédite automatiquement 50 coins.';
    }
    updateCollectionSummary();
  };

  const updateSessionSummary = (pulls, outcome) => {
    if (!pulls.length) {
      resetSessionSummary();
      return;
    }

    const bestRank = getBestRank(pulls) || '—';
    const newCount = outcome.keptCards.length;
    const duplicateCount = outcome.soldDuplicates.length;

    if (boosterResultStatus) {
      boosterResultStatus.textContent = `${pulls.length} cartes révélées · ${newCount} nouvelle${newCount > 1 ? 's' : ''} entrée${newCount > 1 ? 's' : ''}`;
    }
    if (boosterResultNote) {
      boosterResultNote.textContent = duplicateCount
        ? `${duplicateCount} doublon${duplicateCount > 1 ? 's' : ''} automatiquement revendu${duplicateCount > 1 ? 's' : ''} pour ${outcome.duplicateCoins} coins.`
        : 'Session parfaite : aucune carte revendue automatiquement.';
    }
    if (boosterResultBestRank) boosterResultBestRank.textContent = bestRank;
    if (boosterResultNewCards) boosterResultNewCards.textContent = String(newCount);
    if (boosterResultDuplicates) boosterResultDuplicates.textContent = String(duplicateCount);
    if (boosterResultRefund) boosterResultRefund.textContent = String(outcome.duplicateCoins || 0);
  };

  const openBooster = async () => {
    if (!currentUser) {
      setHint('Connecte-toi pour ouvrir un booster.', true);
      updateAvailability();
      return;
    }

    if (currentCoins < BOOSTER_COST) {
      setHint(`Il te faut ${BOOSTER_COST} coins. Solde : ${currentCoins}.`, true);
      updateAvailability();
      return;
    }

    openBoosterBtn.disabled = true;
    setHint('Ouverture…');
    if (boosterAvailability) boosterAvailability.textContent = 'Ouverture en cours';

    try {
      await refreshCatalog();

      if (approvedCards.length === 0) {
        resetBoosterStage('Aucune carte validée pour le moment.');
        setHint('Aucune carte disponible.', true);
        updateAvailability();
        openBoosterBtn.disabled = false;
        return;
      }

      const pulls = buildBooster(approvedCards, 5, catalogStats).map((card) => ({
        ...card,
        sellValue: getDuplicateSellValue(card, catalogStats)
      }));
      const outcome = await saveAlbumDrops(currentUser.uid, pulls, { boosterCost: BOOSTER_COST });

      if (!outcome.ok) {
        if (outcome.reason === 'insufficient-coins') {
          setCoins(outcome.balance);
          resetBoosterStage('Pas assez de coins.');
          setHint(`Booster refusé : ${outcome.balance} coins.`, true);
          updateAvailability();
          return;
        }

        throw new Error('Impossible de sauvegarder l’ouverture du booster.');
      }

      setCoins(outcome.balance);
      latestProfileAlbum = {
        droppedCardIds: outcome.droppedCardIds,
        coins: outcome.balance
      };
      updateCollectionSummary();
      updateSessionSummary(pulls, outcome);
      playOpeningSequence(pulls, outcome.soldDuplicates);
    } catch (error) {
      handleBoosterError(error, 'Impossible d’ouvrir le booster.');
    } finally {
      if (!boosterStage?.classList.contains('is-opening') && currentCoins >= BOOSTER_COST) {
        openBoosterBtn.disabled = false;
      }
      updateAvailability();
    }
  };

  const onBoosterGridClick = (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-booster-index].is-revealed') : null;
    if (!target) return;
    openViewer(Number(target.getAttribute('data-booster-index')));
  };

  openBoosterBtn?.addEventListener('click', openBooster);
  boosterGrid?.addEventListener('click', onBoosterGridClick);
  closeBoosterViewerBtn?.addEventListener('click', closeViewer);
  boosterViewer?.addEventListener('click', (event) => {
    if (event.target instanceof HTMLElement && event.target.hasAttribute('data-close-booster-viewer')) {
      closeViewer();
    }
  });

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      closeViewer();
    }
  };
  document.addEventListener('keydown', onKeyDown);

  const cleanupCommon = await initCommon({
    requireAuth: false,
    onUserChanged: async (user) => {
      currentUser = user;

      try {
        await refreshCatalog();
        await refreshProfileStats();
      } catch (error) {
        handleBoosterError(error);
      }

      if (!currentUser) {
        resetBoosterStage('Connecte-toi pour ouvrir un booster de 5 cartes.');
        setHint(`Connexion requise · ${BOOSTER_COST} coins.`);
        return;
      }

      resetBoosterStage('Ouvre un booster pour découvrir 5 cartes.');
      setHint(`Prêt · ${BOOSTER_COST} coins.`);
      openBoosterBtn.disabled = currentCoins < BOOSTER_COST;
    }
  });

  resetSessionSummary();
  resetBoosterStage('Synchronisation du booster…');
  setHint(`Prêt · ${BOOSTER_COST} coins.`);
  updateAvailability();

  return () => {
    cleanupCommon?.();
    clearOpeningTimers();
    closeViewer();
    openBoosterBtn?.removeEventListener('click', openBooster);
    boosterGrid?.removeEventListener('click', onBoosterGridClick);
    closeBoosterViewerBtn?.removeEventListener('click', closeViewer);
    document.removeEventListener('keydown', onKeyDown);
  };
};
