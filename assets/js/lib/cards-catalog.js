import { db, get, normalizeCardNumber, normalizeRank, ref } from '../firebase.js';

const rarityWeights = {
  D: 24,
  C: 16,
  B: 10,
  A: 6,
  S: 3,
  Ω: 0.75
};

const duplicateSellValues = {
  D: 5,
  C: 8,
  B: 12,
  A: 18,
  S: 30,
  Ω: 50
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
const getDuplicateSellValue = (card = {}) => duplicateSellValues[card.rank] ?? duplicateSellValues.D;

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
  const totalWeight = cards.reduce((sum, card) => sum + getCardWeight(card), 0);
  const ranks = ['D', 'C', 'B', 'A', 'S', 'Ω'];

  return ranks.map((rank) => {
    const rankCards = cards.filter((card) => card.rank === rank);
    const rankWeight = rankCards.reduce((sum, card) => sum + getCardWeight(card), 0);

    return {
      rank,
      count: rankCards.length,
      weight: rankWeight,
      chance: totalWeight > 0 ? (rankWeight / totalWeight) * 100 : 0,
      sellValue: duplicateSellValues[rank] ?? duplicateSellValues.D
    };
  });
};

export {
  duplicateSellValues,
  getCardWeight,
  getDropRates,
  getDuplicateSellValue,
  loadApprovedCards,
  normalizeCardRecord,
  rarityWeights
};
