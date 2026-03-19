import { escapeHtml, formatCardNumber } from './firebase.js';
import { initCommon } from './common.js';
import { BOOSTER_COST, loadProfileAlbum, saveAlbumDrops } from './lib/album-storage.js';
import { buildCardCatalogStats, getCardWeight, getDropRates, getDuplicateSellValue, loadApprovedCards } from './lib/cards-catalog.js';

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
  let currentUser = null;
  let currentCoins = 50;
  let boosterEntries = [];
  let openingTimeouts = [];

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

  const resetBoosterStage = (message) => {
    clearOpeningTimers();
    boosterEntries = [];
    closeViewer();
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

  const playOpeningSequence = (cards, soldDuplicates = []) => {
    clearOpeningTimers();
    boosterStage?.classList.remove('is-revealed');
    boosterStage?.classList.add('is-opening');
    boosterPack?.classList.remove('is-opened');
    boosterPack?.classList.add('is-opening');
    boosterGrid.innerHTML = '';

    queueTimeout(() => {
      boosterPack?.classList.add('is-opened');
    }, 520);

    queueTimeout(() => {
      renderBoosterCards(cards, soldDuplicates);
      boosterStage?.classList.add('is-revealed');
    }, 880);

    queueTimeout(() => {
      boosterStage?.classList.remove('is-opening');
      boosterPack?.classList.remove('is-opening');
    }, 1700);
  };

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

      playOpeningSequence(pulls, outcome.soldDuplicates);
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
      console.error('Erreur lors de l’ouverture du booster :', error);
      resetBoosterStage('Impossible de charger les cartes.');
      setHint('Impossible d’ouvrir le booster.', true);
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
    if (event.key === 'Escape') closeViewer();
  };

  openBoosterBtn?.addEventListener('click', openBooster);
  boosterGrid?.addEventListener('click', onBoosterGridClick);
  closeBoosterViewerBtn?.addEventListener('click', closeViewer);
  boosterViewer?.addEventListener('click', (event) => {
    if (event.target instanceof HTMLElement && event.target.hasAttribute('data-close-booster-viewer')) {
      closeViewer();
    }
  });
  document.addEventListener('keydown', onKeyDown);

  const cleanupCommon = await initCommon({
    requireAuth: true,
    onUserChanged: async (user) => {
      currentUser = user;
      const cards = await loadApprovedCards();
      renderDropRates(cards);
      await refreshProfileStats();
    }
  });

  resetBoosterStage('Ouvre un booster pour découvrir 5 cartes.');
  setHint(`Prêt · ${BOOSTER_COST} coins.`);

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
