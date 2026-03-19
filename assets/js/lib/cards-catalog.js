import { db, get, normalizeCardNumber, normalizeRank, ref } from '../firebase.js';

const rarityWeights = {
  D: 48,
  C: 24,
  B: 12,
  A: 5,
  S: 1.75,
  Ω: 0.35
};

const rarityDropFloor = {
  D: 35,
  C: 20,
  B: 10,
  A: 4,
  S: 1,
  Ω: 0.1
};

const rarityPriceConfig = {
  D: { multiplier: 0.7, min: 1, max: 12 },
  C: { multiplier: 0.95, min: 1, max: 18 },
  B: { multiplier: 1.3, min: 1, max: 30 },
  A: { multiplier: 1.8, min: 1, max: 55 },
  S: { multiplier: 2.5, min: 2, max: 90 },
  Ω: { multiplier: 3.4, min: 2, max: 180 }
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

const getCardWeight = (card = {}, catalogStats = null) => {
  const rank = normalizeRank(card?.rank);
  if (catalogStats?.perCardWeightByRank?.[rank] != null) {
    return catalogStats.perCardWeightByRank[rank];
  }
  return rarityWeights[rank] ?? rarityWeights.D;
};

const buildCardCatalogStats = (cards = []) => {
  const ranks = ['D', 'C', 'B', 'A', 'S', 'Ω'];
  const totalCards = cards.length;
  const rankCounts = Object.fromEntries(ranks.map((rank) => [rank, 0]));

  cards.forEach((card) => {
    const rank = normalizeRank(card?.rank);
    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
  });

  const activeRanks = ranks.filter((rank) => rankCounts[rank] > 0);
  const floorTotal = activeRanks.reduce((sum, rank) => sum + (rarityDropFloor[rank] || 0), 0);
  const bonusScores = Object.fromEntries(
    ranks.map((rank) => {
      const count = rankCounts[rank] || 0;
      const score = count > 0 ? Math.sqrt(count) * (rarityWeights[rank] ?? rarityWeights.D) : 0;
      return [rank, score];
    })
  );
  const bonusScoreTotal = Object.values(bonusScores).reduce((sum, score) => sum + score, 0);
  const remainingChance = Math.max(0, 100 - floorTotal);
  const rankChances = Object.fromEntries(
    ranks.map((rank) => {
      if (!rankCounts[rank]) return [rank, 0];
      const floorChance = rarityDropFloor[rank] || 0;
      const bonusChance = bonusScoreTotal > 0 ? (remainingChance * bonusScores[rank]) / bonusScoreTotal : 0;
      return [rank, floorChance + bonusChance];
    })
  );
  const rankWeights = Object.fromEntries(ranks.map((rank) => [rank, rankChances[rank] || 0]));
  const perCardWeightByRank = Object.fromEntries(
    ranks.map((rank) => {
      const count = rankCounts[rank] || 0;
      return [rank, count > 0 ? (rankChances[rank] || 0) / count : 0];
    })
  );

  return {
    totalCards,
    totalWeight: Object.values(rankWeights).reduce((sum, weight) => sum + weight, 0),
    rankCounts,
    rankWeights,
    rankChances,
    perCardWeightByRank
  };
};

const getDuplicateSellValue = (card = {}, catalogStats = buildCardCatalogStats(card ? [card] : [])) => {
  const rank = normalizeRank(card?.rank);
  const config = rarityPriceConfig[rank] ?? rarityPriceConfig.D;
  const totalCards = Math.max(1, Number(catalogStats?.totalCards) || 1);
  const rankCount = Math.max(1, Number(catalogStats?.rankCounts?.[rank]) || 0);
  const rankChance = Math.max(rarityDropFloor[rank] || 0.1, Number(catalogStats?.rankChances?.[rank]) || 0);

  const catalogPressure = Math.pow(Math.expm1(totalCards / 40), 1.35);
  const dropPressure = Math.pow(100 / rankChance, 0.28);
  const scarcityPressure = Math.pow(totalCards / rankCount, 0.18);
  const price = Math.round(1 + (config.multiplier * catalogPressure * dropPressure * scarcityPressure));

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
  rarityDropFloor,
  rarityPriceConfig,
  rarityWeights
};
