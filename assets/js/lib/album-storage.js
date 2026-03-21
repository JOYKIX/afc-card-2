import { db, get, ref, runTransaction } from '../firebase.js';
import { normalizeCardNumber, normalizeText } from './format.js';
import { normalizeCardRecord, normalizeOwnedCards } from './card-data.js';

const ALBUM_STORAGE_KEY = 'afc-card-album-v1';
const PROFILE_DROPPED_CARD_IDS_KEY = 'droppedCardIds';
const PROFILE_OWNED_CARDS_KEY = 'ownedCards';
const INITIAL_COINS = 50;
const BOOSTER_COST = 50;
const DAILY_LOGIN_REWARD = 50;

const getAlbumStorageKey = (uid = 'guest') => `${ALBUM_STORAGE_KEY}:${uid || 'guest'}`;

const normalizeDroppedCardIds = (value) => {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  return value
    .map((entry) => String(entry || '').trim())
    .filter((entry) => {
      if (!entry || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
};

const normalizeProfileCoins = (value, fallback = INITIAL_COINS) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(0, Math.floor(numericValue));
};

const normalizeAlbumEntry = (card = {}) => {
  const normalizedCard = normalizeCardRecord(card, card.id || card.cardId || card.uniqueId || '');

  return {
    uniqueId: String(card.uniqueId || normalizedCard.cardId || normalizedCard.id || `${Date.now()}`),
    cardId: String(card.cardId || normalizedCard.cardId || normalizedCard.id || ''),
    cardNumber: normalizeCardNumber(card.cardNumber ?? normalizedCard.cardNumber),
    rank: normalizedCard.rank || 'D',
    name: normalizedCard.name || normalizedCard.cardName || '',
    cardName: normalizedCard.cardName || normalizedCard.name || '',
    creatorName: normalizedCard.creatorName || 'Créateur inconnu',
    cardCapture: normalizedCard.cardCapture || '',
    droppedAt: Number(card.droppedAt || card.obtainedAt || Date.now()),
    dropCount: Math.max(1, Number(card.dropCount || 1))
  };
};

const getTodayKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const loadLocalAlbum = (uid) => {
  try {
    const raw = window.localStorage.getItem(getAlbumStorageKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeAlbumEntry).sort((a, b) => (b.droppedAt || 0) - (a.droppedAt || 0));
  } catch (error) {
    console.warn("Impossible de lire l'album local :", error);
    return [];
  }
};

const saveLocalAlbum = (uid, entries) => {
  try {
    window.localStorage.setItem(getAlbumStorageKey(uid), JSON.stringify(entries.map(normalizeAlbumEntry)));
  } catch (error) {
    console.warn("Impossible d'enregistrer l'album local :", error);
  }
};

const summarizeAlbumEntries = (catalog = [], album = {}) => {
  const cardById = new Map();
  const cardByLegacyNumber = new Map();

  catalog.forEach((card) => {
    const normalized = normalizeCardRecord(card, card.id || card.cardId || card.uniqueId || '');
    const cardId = String(normalized.cardId || normalized.uniqueId || '').trim();
    if (cardId) cardById.set(cardId, normalized);
    if (normalized.cardNumber) cardByLegacyNumber.set(String(normalized.cardNumber), normalized);
  });

  const ownedCards = normalizeOwnedCards(album.ownedCards);
  const legacyIds = normalizeDroppedCardIds(album.droppedCardIds);
  const entriesById = new Map();

  Object.entries(ownedCards).forEach(([cardId, ownership]) => {
    const card = cardById.get(cardId);
    if (!card) return;

    entriesById.set(cardId, normalizeAlbumEntry({
      ...card,
      cardId,
      uniqueId: cardId,
      cardNumber: ownership.cardNumber ?? card.cardNumber,
      obtainedAt: ownership.obtainedAt,
      droppedAt: ownership.obtainedAt || Date.now()
    }));
  });

  legacyIds.forEach((legacyId, index) => {
    const normalizedLegacyId = String(legacyId || '').trim();
    if (!normalizedLegacyId || entriesById.has(normalizedLegacyId)) return;

    const card = cardById.get(normalizedLegacyId) || cardByLegacyNumber.get(normalizedLegacyId);
    if (!card) return;

    const cardId = String(card.cardId || card.uniqueId || normalizedLegacyId).trim();
    if (!cardId || entriesById.has(cardId)) return;

    entriesById.set(cardId, normalizeAlbumEntry({
      ...card,
      cardId,
      uniqueId: cardId,
      droppedAt: index + 1 || Date.now()
    }));
  });

  return Array.from(entriesById.values()).sort((a, b) => (b.droppedAt || 0) - (a.droppedAt || 0));
};

const loadProfileAlbum = async (uid) => {
  if (!uid) return { droppedCardIds: [], ownedCards: {}, coins: INITIAL_COINS };

  try {
    const snapshot = await get(ref(db, `profiles/${uid}`));
    if (!snapshot.exists()) return { droppedCardIds: [], ownedCards: {}, coins: INITIAL_COINS };

    const profile = snapshot.val() || {};
    return {
      droppedCardIds: normalizeDroppedCardIds(profile[PROFILE_DROPPED_CARD_IDS_KEY]),
      ownedCards: normalizeOwnedCards(profile[PROFILE_OWNED_CARDS_KEY]),
      coins: normalizeProfileCoins(profile.coins, INITIAL_COINS)
    };
  } catch (error) {
    console.warn('Impossible de lire l’album en base :', error);
    return { droppedCardIds: [], ownedCards: {}, coins: INITIAL_COINS };
  }
};

const loadAlbum = async (uid, catalog = []) => {
  const profileAlbum = await loadProfileAlbum(uid);
  const entries = summarizeAlbumEntries(catalog, profileAlbum);
  const ownedCardIds = Object.keys(normalizeOwnedCards(profileAlbum.ownedCards));
  const uniqueOwnedIds = new Set([...profileAlbum.droppedCardIds, ...ownedCardIds]);

  if (entries.length) {
    saveLocalAlbum(uid, entries);
    return {
      entries,
      droppedCardIds: profileAlbum.droppedCardIds,
      ownedCards: normalizeOwnedCards(profileAlbum.ownedCards),
      uniqueCount: uniqueOwnedIds.size,
      coins: profileAlbum.coins,
      source: 'database'
    };
  }

  const localEntries = loadLocalAlbum(uid);
  return {
    entries: localEntries,
    droppedCardIds: localEntries.map((entry) => entry.uniqueId),
    ownedCards: Object.fromEntries(localEntries.map((entry) => [String(entry.cardId || entry.uniqueId), {
      cardId: String(entry.cardId || entry.uniqueId),
      cardNumber: normalizeCardNumber(entry.cardNumber),
      obtainedAt: Number(entry.droppedAt || Date.now())
    }])),
    uniqueCount: localEntries.length,
    coins: profileAlbum.coins,
    source: localEntries.length ? 'local' : 'database'
  };
};

const saveAlbumDrops = async (uid, cards = [], { boosterCost = BOOSTER_COST } = {}) => {
  if (!uid) {
    return {
      ok: false,
      reason: 'missing-uid',
      soldDuplicates: [],
      keptCards: cards,
      coinsSpent: 0,
      duplicateCoins: 0,
      balance: INITIAL_COINS,
      droppedCardIds: [],
      ownedCards: {}
    };
  }

  const profileRef = ref(db, `profiles/${uid}`);
  const timestamp = Date.now();
  const outcome = {
    ok: false,
    reason: '',
    soldDuplicates: [],
    keptCards: [],
    coinsSpent: 0,
    duplicateCoins: 0,
    balance: INITIAL_COINS,
    droppedCardIds: [],
    ownedCards: {}
  };

  const transaction = await runTransaction(profileRef, (currentProfile) => {
    const profile = currentProfile && typeof currentProfile === 'object' ? currentProfile : {};
    const existingDroppedCardIds = normalizeDroppedCardIds(profile[PROFILE_DROPPED_CARD_IDS_KEY]);
    const existingOwnedCards = normalizeOwnedCards(profile[PROFILE_OWNED_CARDS_KEY]);
    const ownedUniqueIds = new Set(existingDroppedCardIds);
    const ownedCardIds = new Set(Object.keys(existingOwnedCards));
    const nextDroppedCardIds = [...existingDroppedCardIds];
    const nextOwnedCards = { ...existingOwnedCards };
    const currentCoins = normalizeProfileCoins(profile.coins, INITIAL_COINS);

    if (currentCoins < boosterCost) {
      outcome.reason = 'insufficient-coins';
      outcome.balance = currentCoins;
      outcome.droppedCardIds = existingDroppedCardIds;
      return undefined;
    }

    const soldDuplicates = [];
    const keptCards = [];

    cards.forEach((card) => {
      const normalizedCard = normalizeCardRecord(card, card?.id || card?.cardId || card?.uniqueId || '');
      const uniqueId = String(normalizedCard.cardId || normalizedCard.uniqueId || '').trim();
      const legacyNumberId = normalizedCard.cardNumber ? String(normalizedCard.cardNumber) : '';
      if (!uniqueId) return;

      if (ownedCardIds.has(uniqueId) || (legacyNumberId && ownedUniqueIds.has(legacyNumberId))) {
        soldDuplicates.push(card);
        return;
      }

      ownedCardIds.add(uniqueId);
      ownedUniqueIds.add(uniqueId);
      nextDroppedCardIds.push(uniqueId);
      nextOwnedCards[uniqueId] = {
        cardId: uniqueId,
        cardNumber: normalizedCard.cardNumber,
        obtainedAt: timestamp,
        updatedAt: timestamp
      };
      keptCards.push({
        ...card,
        uniqueId,
        cardId: uniqueId,
        cardNumber: normalizedCard.cardNumber
      });
    });

    const duplicateCoins = soldDuplicates.reduce((sum, card) => sum + Math.max(0, Number(card?.sellValue || 0)), 0);
    const nextCoins = Math.max(0, currentCoins - boosterCost + duplicateCoins);

    outcome.ok = true;
    outcome.soldDuplicates = soldDuplicates;
    outcome.keptCards = keptCards;
    outcome.coinsSpent = boosterCost;
    outcome.duplicateCoins = duplicateCoins;
    outcome.balance = nextCoins;
    outcome.droppedCardIds = nextDroppedCardIds;
    outcome.ownedCards = nextOwnedCards;

    return {
      ...profile,
      coins: nextCoins,
      [PROFILE_DROPPED_CARD_IDS_KEY]: nextDroppedCardIds,
      [PROFILE_OWNED_CARDS_KEY]: nextOwnedCards,
      updatedAt: timestamp
    };
  });

  if (!transaction.committed || !outcome.ok) {
    return outcome;
  }

  return outcome;
};

export {
  BOOSTER_COST,
  DAILY_LOGIN_REWARD,
  INITIAL_COINS,
  PROFILE_DROPPED_CARD_IDS_KEY,
  PROFILE_OWNED_CARDS_KEY,
  getTodayKey,
  loadAlbum,
  loadProfileAlbum,
  normalizeDroppedCardIds,
  normalizeProfileCoins,
  saveAlbumDrops,
  summarizeAlbumEntries
};
