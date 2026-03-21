import { db, get, ref } from '../firebase.js';
import { CARDS_PATH } from './firebase-paths.js';
import { normalizeRank } from './format.js';
import { normalizeCardRecord as normalizeCatalogCardRecord } from './card-data.js';

const rarityRanks = ['D', 'C', 'B', 'A', 'S', 'Ω'];
const TARGET_RANK_CARD_COUNT = 10;
const TARGET_BOOSTER_EV = 40;
const DROP_FACTOR_SMOOTHING = 0.5;
const MAX_BASE_PRICE_MULTIPLIER = 1.5;
const MIN_DUPLICATE_PRICE = 1;
const MIN_DROP_RATE = 0.0001;

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
  D: { basePrice: 4, targetDrop: 0.45, targetCount: TARGET_RANK_CARD_COUNT },
  C: { basePrice: 6, targetDrop: 0.25, targetCount: TARGET_RANK_CARD_COUNT },
  B: { basePrice: 9, targetDrop: 0.15, targetCount: TARGET_RANK_CARD_COUNT },
  A: { basePrice: 13, targetDrop: 0.08, targetCount: TARGET_RANK_CARD_COUNT },
  S: { basePrice: 19, targetDrop: 0.03, targetCount: TARGET_RANK_CARD_COUNT },
  Ω: { basePrice: 28, targetDrop: 0.01, targetCount: TARGET_RANK_CARD_COUNT }
};

const normalizeCardRecord = ([id, record]) => normalizeCatalogCardRecord(record, id);

const getCardWeight = (card = {}, catalogStats = null) => {
  const rank = normalizeRank(card?.rank);
  if (catalogStats?.perCardWeightByRank?.[rank] != null) {
    return catalogStats.perCardWeightByRank[rank];
  }
  return rarityWeights[rank] ?? rarityWeights.D;
};

const clampValue = (value, min, max) => Math.min(max, Math.max(min, value));

const getRankPriceConfig = (rank = 'D') => rarityPriceConfig[normalizeRank(rank)] ?? rarityPriceConfig.D;

const computeRawRankSellValue = (rank, catalogStats) => {
  const normalizedRank = normalizeRank(rank);
  const rankCount = Math.max(0, Number(catalogStats?.rankCounts?.[normalizedRank]) || 0);
  if (!rankCount) return 0;

  const { basePrice, targetDrop, targetCount } = getRankPriceConfig(normalizedRank);
  const actualDrop = Math.max(MIN_DROP_RATE, (Number(catalogStats?.rankChances?.[normalizedRank]) || 0) / 100);
  const dropFactor = Math.pow(targetDrop / actualDrop, DROP_FACTOR_SMOOTHING);
  const countFactor = Math.sqrt(rankCount / Math.max(1, targetCount));
  const unclampedPrice = basePrice * dropFactor * countFactor;

  return clampValue(unclampedPrice, MIN_DUPLICATE_PRICE, basePrice * MAX_BASE_PRICE_MULTIPLIER);
};

const normalizeRankSellValues = (rawSellValues = {}, catalogStats = {}) => {
  const rawExpectedValuePerCard = rarityRanks.reduce((sum, rank) => {
    const dropRate = Math.max(0, (Number(catalogStats?.rankChances?.[rank]) || 0) / 100);
    return sum + (dropRate * (rawSellValues[rank] || 0));
  }, 0);
  const scale = rawExpectedValuePerCard > 0 ? TARGET_BOOSTER_EV / (rawExpectedValuePerCard * 5) : 1;

  const scaledSellValues = {};
  let previousPrice = 0;

  rarityRanks.forEach((rank) => {
    const rankCount = Math.max(0, Number(catalogStats?.rankCounts?.[rank]) || 0);
    if (!rankCount) {
      scaledSellValues[rank] = 0;
      return;
    }

    const scaledPrice = Math.max(MIN_DUPLICATE_PRICE, Math.round((rawSellValues[rank] || 0) * scale));
    const stabilizedPrice = Math.max(previousPrice + 1, scaledPrice);
    scaledSellValues[rank] = stabilizedPrice;
    previousPrice = stabilizedPrice;
  });

  const expectedValuePerCard = rarityRanks.reduce((sum, rank) => {
    const dropRate = Math.max(0, (Number(catalogStats?.rankChances?.[rank]) || 0) / 100);
    return sum + (dropRate * (scaledSellValues[rank] || 0));
  }, 0);

  return {
    expectedValuePerCard,
    expectedValuePerBooster: expectedValuePerCard * 5,
    rawExpectedValuePerCard,
    rawExpectedValuePerBooster: rawExpectedValuePerCard * 5,
    scale,
    rawSellValues,
    scaledSellValues
  };
};

const buildCardCatalogStats = (cards = []) => {
  const totalCards = cards.length;
  const rankCounts = Object.fromEntries(rarityRanks.map((rank) => [rank, 0]));

  cards.forEach((card) => {
    const rank = normalizeRank(card?.rank);
    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
  });

  const activeRanks = rarityRanks.filter((rank) => rankCounts[rank] > 0);
  const floorTotal = activeRanks.reduce((sum, rank) => sum + (rarityDropFloor[rank] || 0), 0);
  const bonusScores = Object.fromEntries(
    rarityRanks.map((rank) => {
      const count = rankCounts[rank] || 0;
      const score = count > 0 ? Math.sqrt(count) * (rarityWeights[rank] ?? rarityWeights.D) : 0;
      return [rank, score];
    })
  );
  const bonusScoreTotal = Object.values(bonusScores).reduce((sum, score) => sum + score, 0);
  const remainingChance = Math.max(0, 100 - floorTotal);
  const rankChances = Object.fromEntries(
    rarityRanks.map((rank) => {
      if (!rankCounts[rank]) return [rank, 0];
      const floorChance = rarityDropFloor[rank] || 0;
      const bonusChance = bonusScoreTotal > 0 ? (remainingChance * bonusScores[rank]) / bonusScoreTotal : 0;
      return [rank, floorChance + bonusChance];
    })
  );
  const rankWeights = Object.fromEntries(rarityRanks.map((rank) => [rank, rankChances[rank] || 0]));
  const perCardWeightByRank = Object.fromEntries(
    rarityRanks.map((rank) => {
      const count = rankCounts[rank] || 0;
      return [rank, count > 0 ? (rankChances[rank] || 0) / count : 0];
    })
  );
  const rawSellValues = Object.fromEntries(
    rarityRanks.map((rank) => [rank, computeRawRankSellValue(rank, { rankCounts, rankChances })])
  );
  const sellValueStats = normalizeRankSellValues(rawSellValues, { rankCounts, rankChances });

  return {
    totalCards,
    totalWeight: Object.values(rankWeights).reduce((sum, weight) => sum + weight, 0),
    rankCounts,
    rankWeights,
    rankChances,
    perCardWeightByRank,
    rawSellValues: sellValueStats.rawSellValues,
    sellValuesByRank: sellValueStats.scaledSellValues,
    sellValueScale: sellValueStats.scale,
    expectedValuePerCard: sellValueStats.expectedValuePerCard,
    expectedValuePerBooster: sellValueStats.expectedValuePerBooster
  };
};

const getDuplicateSellValue = (card = {}, catalogStats = buildCardCatalogStats(card ? [card] : [])) => {
  const rank = normalizeRank(card?.rank);
  const rankCount = Math.max(0, Number(catalogStats?.rankCounts?.[rank]) || 0);

  if (!rankCount) return 0;
  if (catalogStats?.sellValuesByRank?.[rank] != null) {
    return catalogStats.sellValuesByRank[rank];
  }

  const rawPrice = computeRawRankSellValue(rank, catalogStats);
  const expectedValuePerCard = rarityRanks.reduce((sum, currentRank) => {
    const dropRate = Math.max(0, (Number(catalogStats?.rankChances?.[currentRank]) || 0) / 100);
    const referencePrice = currentRank === rank
      ? rawPrice
      : computeRawRankSellValue(currentRank, catalogStats);
    return sum + (dropRate * referencePrice);
  }, 0);
  const scale = expectedValuePerCard > 0 ? TARGET_BOOSTER_EV / (expectedValuePerCard * 5) : 1;

  return Math.max(MIN_DUPLICATE_PRICE, Math.round(rawPrice * scale));
};

const loadApprovedCards = async () => {
  const snapshot = await get(ref(db, CARDS_PATH));
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
  const catalogStats = buildCardCatalogStats(cards);

  return rarityRanks.map((rank) => ({
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
  rarityRanks,
  rarityWeights
};
