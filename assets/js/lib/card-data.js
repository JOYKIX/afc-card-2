import { normalizeCardNumber, normalizeRank, normalizeText } from './format.js';

const CARD_NUMBER_REGISTRY_PATH = 'metadata/cardNumbers';

const normalizeCardRecord = (record = {}, id = '') => {
  const cardId = String(record.cardId || id || '').trim();

  return {
    ...record,
    id: String(id || record.id || cardId).trim(),
    cardId,
    cardNumber: normalizeCardNumber(record.cardNumber),
    uniqueId: cardId || String(id || record.id || '').trim(),
    name: normalizeText(record.name || record.cardName || ''),
    cardName: normalizeText(record.cardName || record.name || ''),
    title: normalizeText(record.title || ''),
    edition: normalizeText(record.edition || ''),
    abilities: normalizeText(record.abilities || ''),
    rank: normalizeRank(record.rank || record.rarity),
    rarity: normalizeRank(record.rarity || record.rank),
    creatorName: normalizeText(record.creatorName || record.createdBy || record.ownerNickname || 'Créateur inconnu'),
    ownerNickname: normalizeText(record.ownerNickname || record.creatorName || record.createdBy || ''),
    cardCapture: record.cardCapture || record.cardImage || record.image || '',
    attack: Number.isFinite(Number(record.attack)) ? Number(record.attack) : 0,
    defense: Number.isFinite(Number(record.defense)) ? Number(record.defense) : 0,
    average: Number.isFinite(Number(record.average)) ? Number(record.average) : null,
    type: normalizeText(record.type || ''),
    createdAt: Number(record.createdAt || record.submittedAt || 0) || 0,
    updatedAt: Number(record.updatedAt || record.submittedAt || record.createdAt || 0) || 0,
    moderatedAt: Number(record.moderatedAt || 0) || 0,
    status: String(record.status || 'approved').trim().toLowerCase() || 'approved'
  };
};

const normalizeOwnedCards = (value) => {
  if (!value || typeof value !== 'object') return {};

  return Object.entries(value).reduce((accumulator, [rawCardId, rawEntry]) => {
    const cardId = String(rawCardId || rawEntry?.cardId || '').trim();
    if (!cardId) return accumulator;

    accumulator[cardId] = {
      cardId,
      cardNumber: normalizeCardNumber(rawEntry?.cardNumber),
      obtainedAt: Number(rawEntry?.obtainedAt || rawEntry?.droppedAt || 0) || 0,
      updatedAt: Number(rawEntry?.updatedAt || rawEntry?.obtainedAt || rawEntry?.droppedAt || 0) || 0
    };

    return accumulator;
  }, {});
};

const normalizeCardNumberRegistry = (value) => {
  const registry = value && typeof value === 'object' ? value : {};
  const usedNumbersSource = registry.usedNumbers && typeof registry.usedNumbers === 'object' ? registry.usedNumbers : {};
  const usedNumbers = Object.entries(usedNumbersSource).reduce((accumulator, [rawNumber, rawCardId]) => {
    const number = normalizeCardNumber(rawNumber);
    const cardId = String(rawCardId || '').trim();
    if (!number || !cardId) return accumulator;
    accumulator[String(number)] = cardId;
    return accumulator;
  }, {});

  return {
    counter: normalizeCardNumber(registry.counter) || 0,
    usedNumbers
  };
};

const buildOwnershipIndex = (profiles = {}) => Object.entries(profiles || {}).reduce((accumulator, [uid, profile]) => {
  const nickname = normalizeText(profile?.nickname || '');
  const ownedCards = normalizeOwnedCards(profile?.ownedCards);

  Object.entries(ownedCards).forEach(([cardId, entry]) => {
    if (!accumulator[cardId]) accumulator[cardId] = [];
    accumulator[cardId].push({
      uid,
      nickname: nickname || uid,
      cardId,
      cardNumber: entry.cardNumber,
      obtainedAt: entry.obtainedAt
    });
  });

  return accumulator;
}, {});

export {
  CARD_NUMBER_REGISTRY_PATH,
  buildOwnershipIndex,
  normalizeCardNumberRegistry,
  normalizeCardRecord,
  normalizeOwnedCards
};
