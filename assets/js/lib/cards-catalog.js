import { db, get, normalizeCardNumber, normalizeRank, ref } from '../firebase.js';

const rarityWeights = {
  D: 24,
  C: 16,
  B: 10,
  A: 6,
  S: 3,
  Ω: 0.75
};

const rarityPriceConfig = {
  D: { base: 4, rarityFactor: 0.9, min: 4, max: 14 },
  C: { base: 6, rarityFactor: 1.05, min: 6, max: 18 },
  B: { base: 9, rarityFactor: 1.2, min: 9, max: 24 },
  A: { base: 13, rarityFactor: 1.4, min: 13, max: 34 },
  S: { base: 20, rarityFactor: 1.8, min: 20, max: 54 },
  Ω: { base: 32, rarityFactor: 2.4, min: 32, max: 84 }
};

const normalizeCardRecord = ([id, record]) => {
  const cardNumber = normalizeCardNumber(record?.cardNumber ?? record?.cardId);

  return {
    id,
    cardNumber,
    uniqueId: cardNumber || id,
    name: record?.name || record?.cardName || '',
    cardName: record?.cardName || record?.name || '',
    rank: normalizeRank(record?.rank || record?.rarity),
    creatorName: record?.creatorName || record?.createdBy || record?.ownerNickname || 'Créateur inconnu',
    cardCapture: record?.cardCapture || record?.cardImage || record?.image || '',
    createdAt: record?.createdAt || record?.submittedAt || 0
  };
};

const getCardWeight = (card = {}) => rarityWeights[card.rank] ?? rarityWeights.D;

const buildCardCatalogStats = (cards = []) => {
  const ranks = ['D', 'C', 'B', 'A', 'S', 'Ω'];
  const totalCards = cards.length;
  const rankCounts = Object.fromEntries(ranks.map((rank) => [rank, 0]));
  const rankWeights = Object.fromEntries(ranks.map((rank) => [rank, 0]));

  cards.forEach((card) => {
    const rank = normalizeRank(card?.rank);
    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
    rankWeights[rank] = (rankWeights[rank] || 0) + getCardWeight({ rank });
  });

  const totalWeight = Object.values(rankWeights).reduce((sum, weight) => sum + weight, 0);
  const rankChances = Object.fromEntries(
    ranks.map((rank) => [rank, totalWeight > 0 ? ((rankWeights[rank] || 0) / totalWeight) * 100 : 0])
  );

  return {
    totalCards,
    totalWeight,
    rankCounts,
    rankWeights,
    rankChances
  };
};

const getDuplicateSellValue = (card = {}, catalogStats = buildCardCatalogStats(card ? [card] : [])) => {
  const rank = normalizeRank(card?.rank);
  const config = rarityPriceConfig[rank] ?? rarityPriceConfig.D;
  const totalCards = Math.max(1, Number(catalogStats?.totalCards) || 1);
  const rankCount = Math.max(1, Number(catalogStats?.rankCounts?.[rank]) || 0);
  const rankChance = Math.max(0.1, Number(catalogStats?.rankChances?.[rank]) || 0);

  const scarcityScore = Math.log2((totalCards / rankCount) + 1);
  const dropScore = Math.log2((100 / rankChance) + 1);
  const price = Math.round(
    config.base
      + (scarcityScore * 1.2)
      + (dropScore * 1.8)
      + ((config.rarityFactor - 1) * 6)
  );

  return Math.max(config.min, Math.min(config.max, price));
};

const loadApprovedCards = async () => {
  const snapshot = await get(ref(db, 'cards'));
  if (!snapshot.exists()) return [];

  return Object.entries(snapshot.val())
    .map(normalizeCardRecord)
    .filter((card) => Boolean(card.cardCapture))
    .sort((a, b) => {
      if (a.cardNumber && b.cardNumber) return a.cardNumber - b.cardNumber;
      if (a.cardNumber) return -1;
      if (b.cardNumber) return 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
};

const getDropRates = (cards = []) => {
  const ranks = ['D', 'C', 'B', 'A', 'S', 'Ω'];
  const catalogStats = buildCardCatalogStats(cards);

  return ranks.map((rank) => ({
    rank,
    count: catalogStats.rankCounts[rank] || 0,
    weight: catalogStats.rankWeights[rank] || 0,
    chance: catalogStats.rankChances[rank] || 0,
    sellValue: getDuplicateSellValue({ rank }, catalogStats)
  }));
};

export {
  buildCardCatalogStats,
  getCardWeight,
  getDropRates,
  getDuplicateSellValue,
  loadApprovedCards,
  normalizeCardRecord,
  rarityPriceConfig,
  rarityWeights
};
