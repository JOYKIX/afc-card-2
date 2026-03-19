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
  let currentUser = null;
  let currentCoins = 50;

  const setHint = (message, isError = false) => {
    if (!boosterHint) return;
    boosterHint.textContent = message;
    boosterHint.dataset.state = isError ? 'error' : 'ready';
  };

  const renderPlaceholder = (message) => {
    boosterGrid.innerHTML = `<article class="booster-capture"><div class="booster-capture__frame"><div class="booster-placeholder">${escapeHtml(message)}</div></div></article>`;
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
          .map((entry) => `<li><strong>${entry.rank}</strong> · ${entry.chance.toFixed(1)}% de chance · ${entry.count} carte${entry.count > 1 ? 's' : ''} dispo · doublon revendu ${entry.sellValue} coins</li>`)
          .join('')
      : '<li>Aucune carte validée pour calculer le taux de drop.</li>';

    if (catalogCount) {
      catalogCount.textContent = `${cards.length} carte${cards.length > 1 ? 's' : ''} validée${cards.length > 1 ? 's' : ''}`;
    }
  };

  const renderBooster = (cards, soldDuplicates = []) => {
    boosterGrid.innerHTML = '';
    const soldIds = new Set(soldDuplicates.map((card) => String(card.uniqueId)));

    cards.forEach((card, index) => {
      const isDuplicate = soldIds.has(String(card.uniqueId));
      const item = document.createElement('article');
      item.className = `booster-capture rank-${card.rank}`;
      item.innerHTML = `
        <div class="booster-capture__frame">
          <img src="${escapeHtml(card.cardCapture)}" alt="${escapeHtml(`Carte ${card.rank} de ${card.creatorName}`)}">
        </div>
        <div class="booster-capture__meta">
          <strong>#${index + 1} · ${escapeHtml(card.cardName || card.name || card.creatorName)}</strong>
          <small>Carte ${escapeHtml(formatCardNumber(card.cardNumber, 'Sans numéro'))} · ${escapeHtml(card.creatorName)} · ${isDuplicate ? 'doublon revendu automatiquement' : 'ajoutée à ton album'}</small>
        </div>
        <div class="booster-capture__rank">${escapeHtml(card.rank)}${isDuplicate ? ` · +${escapeHtml(String(card.sellValue))}` : ''}</div>
      `;
      boosterGrid.appendChild(item);
    });
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
      dailyRewardStatus.textContent = 'La connexion du jour crédite automatiquement 50 coins si elle n’a pas encore été comptée aujourd’hui.';
    }
  };

  const openBooster = async () => {
    if (!currentUser) {
      setHint('Connecte-toi pour ouvrir un booster et créditer tes coins.', true);
      return;
    }

    if (currentCoins < BOOSTER_COST) {
      setHint(`Il te faut ${BOOSTER_COST} coins pour ouvrir un booster. Solde actuel : ${currentCoins} coins.`, true);
      return;
    }

    openBoosterBtn.disabled = true;
    setHint(`Ouverture du booster… ${BOOSTER_COST} coins vont être consommés.`);

    try {
      const cards = await loadApprovedCards();
      renderDropRates(cards);

      if (cards.length === 0) {
        renderPlaceholder('Aucune carte validée disponible pour le moment.');
        setHint('Ajoute ou valide au moins une carte pour ouvrir un booster.', true);
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
        renderPlaceholder('Pas assez de coins pour ouvrir ce booster.');
        setHint(`Booster refusé : il faut ${BOOSTER_COST} coins, mais ton solde est de ${outcome.balance} coins.`, true);
        return;
      }

      renderBooster(pulls, outcome.soldDuplicates);
      setCoins(outcome.balance);

      const duplicateCount = outcome.soldDuplicates.length;
      const uniqueCards = new Set(pulls.map((card) => card.uniqueId)).size;
      const resaleSummary = duplicateCount > 0
        ? ` ${duplicateCount} doublon(s) revendu(s) pour ${outcome.duplicateCoins} coins.`
        : '';

      if (cards.length === 1) {
        setHint(`Une seule carte est disponible : le booster affiche donc 5 fois la même carte.${resaleSummary} Solde restant : ${outcome.balance} coins.`);
        return;
      }

      setHint(`${pulls.length} cartes tirées (${uniqueCards} carte(s) distincte(s) dans le booster). ${outcome.keptCards.length} nouvelle(s) carte(s) ajoutée(s) à ton album.${resaleSummary} Solde restant : ${outcome.balance} coins.`);
    } catch (error) {
      console.error('Erreur lors de l’ouverture du booster :', error);
      renderPlaceholder('Impossible de charger les cartes pour le moment.');
      setHint('Impossible d’ouvrir le booster pour le moment. Réessaie dans quelques secondes.', true);
    } finally {
      if (currentCoins >= BOOSTER_COST) {
        openBoosterBtn.disabled = false;
      }
    }
  };

  openBoosterBtn?.addEventListener('click', openBooster);

  const cleanupCommon = await initCommon({
    requireAuth: true,
    onUserChanged: async (user) => {
      currentUser = user;
      const cards = await loadApprovedCards();
      renderDropRates(cards);
      await refreshProfileStats();
    }
  });

  renderPlaceholder('Ouvre un booster pour découvrir 5 cartes.');
  setHint(`Prêt à découvrir ton tirage. Chaque booster coûte ${BOOSTER_COST} coins.`);

  return () => {
    cleanupCommon?.();
    openBoosterBtn?.removeEventListener('click', openBooster);
  };
};
