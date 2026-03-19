import { db, get, ref, runTransaction } from '../firebase.js';

const ALBUM_STORAGE_KEY = 'afc-card-album-v1';
const PROFILE_DROPPED_CARD_IDS_KEY = 'droppedCardIds';
const INITIAL_COINS = 50;
const BOOSTER_COST = 50;
const DAILY_LOGIN_REWARD = 50;

const getAlbumStorageKey = (uid = 'guest') => `${ALBUM_STORAGE_KEY}:${uid || 'guest'}`;

const normalizeDroppedCardIds = (value) => Array.isArray(value)
  ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
  : [];

const normalizeProfileCoins = (value, fallback = INITIAL_COINS) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(0, Math.floor(numericValue));
};

const normalizeAlbumEntry = (card = {}) => ({
  uniqueId: String(card.uniqueId || card.id || card.cardNumber || `${Date.now()}`),
  cardNumber: card.cardNumber ?? null,
  rank: card.rank || 'D',
  name: card.name || card.cardName || '',
  cardName: card.cardName || card.name || '',
  creatorName: card.creatorName || 'Créateur inconnu',
  cardCapture: card.cardCapture || '',
  droppedAt: Number(card.droppedAt || Date.now()),
  dropCount: Math.max(1, Number(card.dropCount || 1))
});

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

const summarizeAlbumEntries = (catalog = [], droppedCardIds = []) => {
  const cardById = new Map(catalog.map((card) => [String(card.uniqueId), card]));
  const counts = new Map();
  const newestAtById = new Map();

  droppedCardIds.forEach((cardId, index) => {
    const normalizedId = String(cardId || '').trim();
    if (!normalizedId) return;
    counts.set(normalizedId, (counts.get(normalizedId) || 0) + 1);
    newestAtById.set(normalizedId, index + 1);
  });

  return Array.from(counts.entries())
    .map(([uniqueId, dropCount]) => {
      const card = cardById.get(uniqueId);
      if (!card) return null;

      return normalizeAlbumEntry({
        ...card,
        uniqueId,
        dropCount,
        droppedAt: newestAtById.get(uniqueId) || Date.now()
      });
    })
    .filter(Boolean)
    .sort((a, b) => (b.droppedAt || 0) - (a.droppedAt || 0));
};

const loadProfileAlbum = async (uid) => {
  if (!uid) return { droppedCardIds: [], coins: INITIAL_COINS };

  try {
    const snapshot = await get(ref(db, `profiles/${uid}`));
    if (!snapshot.exists()) return { droppedCardIds: [], coins: INITIAL_COINS };

    const profile = snapshot.val() || {};
    return {
      droppedCardIds: normalizeDroppedCardIds(profile[PROFILE_DROPPED_CARD_IDS_KEY]),
      coins: normalizeProfileCoins(profile.coins, INITIAL_COINS)
    };
  } catch (error) {
    console.warn('Impossible de lire l’album en base :', error);
    return { droppedCardIds: [], coins: INITIAL_COINS };
  }
};

const loadAlbum = async (uid, catalog = []) => {
  const profileAlbum = await loadProfileAlbum(uid);
  const entries = summarizeAlbumEntries(catalog, profileAlbum.droppedCardIds);

  if (entries.length) {
    saveLocalAlbum(uid, entries);
    return {
      entries,
      droppedCardIds: profileAlbum.droppedCardIds,
      uniqueCount: new Set(profileAlbum.droppedCardIds).size,
      coins: profileAlbum.coins,
      source: 'database'
    };
  }

  const localEntries = loadLocalAlbum(uid);
  return {
    entries: localEntries,
    droppedCardIds: localEntries.map((entry) => entry.uniqueId),
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
      droppedCardIds: []
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
    droppedCardIds: []
  };

  const transaction = await runTransaction(profileRef, (currentProfile) => {
    const profile = currentProfile && typeof currentProfile === 'object' ? currentProfile : {};
    const existingDroppedCardIds = normalizeDroppedCardIds(profile[PROFILE_DROPPED_CARD_IDS_KEY]);
    const ownedUniqueIds = new Set(existingDroppedCardIds);
    const nextDroppedCardIds = [...existingDroppedCardIds];
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
      const uniqueId = String(card?.uniqueId || card?.id || card?.cardNumber || '').trim();
      if (!uniqueId) return;

      nextDroppedCardIds.push(uniqueId);

      if (ownedUniqueIds.has(uniqueId)) {
        soldDuplicates.push(card);
        return;
      }

      ownedUniqueIds.add(uniqueId);
      keptCards.push(card);
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

    return {
      ...profile,
      coins: nextCoins,
      [PROFILE_DROPPED_CARD_IDS_KEY]: nextDroppedCardIds,
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
  getTodayKey,
  loadAlbum,
  loadProfileAlbum,
  normalizeDroppedCardIds,
  normalizeProfileCoins,
  saveAlbumDrops,
  summarizeAlbumEntries
};
