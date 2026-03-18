const ALBUM_STORAGE_KEY = 'afc-card-album-v1';

const getAlbumStorageKey = (uid = 'guest') => `${ALBUM_STORAGE_KEY}:${uid || 'guest'}`;

const normalizeAlbumEntry = (card = {}) => ({
  uniqueId: String(card.uniqueId || card.id || card.cardNumber || `${Date.now()}`),
  cardNumber: card.cardNumber ?? null,
  rank: card.rank || 'D',
  creatorName: card.creatorName || 'Créateur inconnu',
  cardCapture: card.cardCapture || '',
  droppedAt: Number(card.droppedAt || Date.now()),
  dropCount: Math.max(1, Number(card.dropCount || 1))
});

const loadAlbum = (uid) => {
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

const saveAlbum = (uid, entries) => {
  try {
    window.localStorage.setItem(getAlbumStorageKey(uid), JSON.stringify(entries.map(normalizeAlbumEntry)));
  } catch (error) {
    console.warn("Impossible d'enregistrer l'album local :", error);
  }
};

const saveAlbumDrops = (uid, cards = []) => {
  const existing = loadAlbum(uid);
  const byId = new Map(existing.map((entry) => [entry.uniqueId, entry]));

  cards.forEach((card) => {
    const normalized = normalizeAlbumEntry(card);
    const previous = byId.get(normalized.uniqueId);
    byId.set(normalized.uniqueId, {
      ...previous,
      ...normalized,
      droppedAt: Date.now(),
      dropCount: (previous?.dropCount || 0) + 1
    });
  });

  const merged = Array.from(byId.values()).sort((a, b) => (b.droppedAt || 0) - (a.droppedAt || 0));
  saveAlbum(uid, merged);
  return merged;
};

export { loadAlbum, saveAlbumDrops };
