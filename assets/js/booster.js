import { db, get, ref } from './firebase.js';
import { initCommon } from './common.js';

const openBoosterBtn = document.getElementById('openBooster');
const boosterHint = document.getElementById('boosterHint');
const boosterGrid = document.getElementById('boosterGrid');

const rankScale = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
const rarityWeights = {
  D: 24,
  C: 16,
  B: 10,
  A: 6,
  S: 3,
  SS: 1.5,
  SSS: 0.75
};

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
const normalizeRank = (value = '') => {
  const upper = String(value || '').trim().toUpperCase();
  return rankScale.includes(upper) ? upper : 'D';
};

const normalizeCardRecord = ([id, record]) => ({
  id,
  rank: normalizeRank(record?.rank || record?.rarity),
  creatorName: record?.creatorName || record?.createdBy || record?.ownerNickname || 'Créateur inconnu',
  cardCapture: record?.cardCapture || record?.cardImage || record?.image || '',
  createdAt: record?.createdAt || record?.submittedAt || 0
});

const getCardWeight = (card) => rarityWeights[card.rank] ?? rarityWeights.D;

const setHint = (message, isError = false) => {
  if (!boosterHint) return;
  boosterHint.textContent = message;
  boosterHint.dataset.state = isError ? 'error' : 'ready';
};

const renderPlaceholder = (message) => {
  boosterGrid.innerHTML = `<article class="booster-capture"><div class="booster-capture__frame"><div class="booster-placeholder">${escapeHtml(message)}</div></div></article>`;
};

const renderBooster = (cards) => {
  boosterGrid.innerHTML = '';

  cards.forEach((card, index) => {
    const item = document.createElement('article');
    item.className = `booster-capture rank-${card.rank}`;
    item.innerHTML = `
      <div class="booster-capture__frame">
        <img src="${escapeHtml(card.cardCapture)}" alt="${escapeHtml(`Carte ${card.rank} de ${card.creatorName}`)}">
      </div>
      <div class="booster-capture__meta">
        <strong>#${index + 1} · ${escapeHtml(card.creatorName)}</strong>
        <small>Capture récupérée depuis la base Firebase</small>
      </div>
      <div class="booster-capture__rank">${escapeHtml(card.rank)}</div>
    `;
    boosterGrid.appendChild(item);
  });
};

const pickWeightedCard = (cards) => {
  const totalWeight = cards.reduce((sum, card) => sum + getCardWeight(card), 0);
  if (totalWeight <= 0) return cards[0];

  let threshold = Math.random() * totalWeight;
  for (const card of cards) {
    threshold -= getCardWeight(card);
    if (threshold <= 0) return card;
  }

  return cards[cards.length - 1];
};

const buildBooster = (cards, size = 5) => {
  if (cards.length === 0) return [];
  if (cards.length === 1) return Array.from({ length: size }, () => cards[0]);
  return Array.from({ length: size }, () => pickWeightedCard(cards));
};

const loadApprovedCards = async () => {
  const snapshot = await get(ref(db, 'cards'));
  if (!snapshot.exists()) return [];

  return Object.entries(snapshot.val())
    .map(normalizeCardRecord)
    .filter((card) => Boolean(card.cardCapture));
};

const openBooster = async () => {
  openBoosterBtn.disabled = true;
  setHint('Ouverture du booster… récupération des captures dans Firebase.');

  try {
    const cards = await loadApprovedCards();

    if (cards.length === 0) {
      renderPlaceholder('Aucune capture validée disponible dans la base.');
      setHint('Ajoute ou valide au moins une carte pour ouvrir un booster.', true);
      return;
    }

    const pulls = buildBooster(cards, 5);
    renderBooster(pulls);

    const uniqueCards = new Set(pulls.map((card) => card.id)).size;
    if (cards.length === 1) {
      setHint('Une seule carte existe dans la base : le booster affiche donc 5 fois la même capture.');
      return;
    }

    setHint(`${pulls.length} cartes tirées aléatoirement depuis la base, avec un drop pondéré par la rareté (${uniqueCards} carte(s) distincte(s)).`);
  } catch (error) {
    console.error('Erreur lors de l’ouverture du booster :', error);
    renderPlaceholder('Impossible de charger les captures pour le moment.');
    setHint('Erreur Firebase pendant l’ouverture du booster. Réessaie dans quelques secondes.', true);
  } finally {
    openBoosterBtn.disabled = false;
  }
};

openBoosterBtn?.addEventListener('click', openBooster);

await initCommon();
setHint('Prêt à découvrir ton tirage.');
