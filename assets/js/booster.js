import { db, equalTo, get, orderByChild, query, ref } from './firebase.js';
import { initCommon } from './common.js';

const openBoosterBtn = document.getElementById('openBooster');
const boosterHint = document.getElementById('boosterHint');
const boosterGrid = document.getElementById('boosterGrid');

const rankScale = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
const normalizeRank = (value = '') => {
  const upper = String(value || '').trim().toUpperCase();
  return rankScale.includes(upper) ? upper : 'D';
};
const normalizeCardRecord = (card = {}) => ({
  ...card,
  rank: normalizeRank(card.rank || card.rarity),
  creatorName: card.creatorName || card.createdBy || card.ownerNickname || 'Créateur inconnu',
  cardCapture: card.cardCapture || card.cardImage || card.image || '',
  updatedAt: card.updatedAt || card.moderatedAt || card.createdAt || 0
});

const rarityWeights = {
  D: 34,
  C: 24,
  B: 16,
  A: 11,
  S: 8,
  SS: 5,
  SSS: 2
};

const weightedPick = (cards) => {
  const weightedCards = cards.map((card) => ({
    card,
    weight: rarityWeights[card.rank] || 1
  }));

  const totalWeight = weightedCards.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const item of weightedCards) {
    roll -= item.weight;
    if (roll <= 0) return item.card;
  }

  return weightedCards[weightedCards.length - 1]?.card || null;
};

const pickUniqueCards = (cards, count = 5) => {
  const pool = [...cards];
  const picks = [];

  while (pool.length > 0 && picks.length < count) {
    const selected = weightedPick(pool);
    if (!selected) break;

    picks.push(selected);
    const idx = pool.indexOf(selected);
    if (idx >= 0) pool.splice(idx, 1);
  }

  return picks;
};

const buildCaptureMarkup = (card) => {
  if (!card.cardCapture) return '<div class="booster-placeholder">Capture indisponible</div>';
  return `<img src="${escapeHtml(card.cardCapture)}" alt="Capture ${escapeHtml(card.rank)} de ${escapeHtml(card.creatorName)}" loading="lazy">`;
};

const cardTemplate = (card, index) => `
  <article class="booster-capture rank-${escapeHtml(card.rank)}" style="animation-delay:${index * 90}ms">
    <div class="booster-capture__frame">
      ${buildCaptureMarkup(card)}
    </div>
    <div class="booster-capture__meta">
      <span class="booster-capture__rank">${escapeHtml(card.rank)}</span>
      <strong>${escapeHtml(card.creatorName)}</strong>
      <small>Capture validée prête à jouer</small>
    </div>
  </article>
`;

const renderBooster = (cards) => {
  boosterGrid.innerHTML = cards.map((card, index) => cardTemplate(card, index)).join('');
};

const fetchApprovedCards = async () => {
  const approvedQuery = query(ref(db, 'cards'), orderByChild('status'), equalTo('approved'));
  const snapshot = await get(approvedQuery);

  if (snapshot.exists()) return Object.values(snapshot.val()).map(normalizeCardRecord).filter((card) => card.cardCapture);

  const allCardsSnapshot = await get(ref(db, 'cards'));
  if (!allCardsSnapshot.exists()) return [];

  return Object.values(allCardsSnapshot.val())
    .map(normalizeCardRecord)
    .filter((card) => card.cardCapture && ['approved', ''].includes((card.status || '').toLowerCase()));
};

const openBooster = async () => {
  openBoosterBtn.disabled = true;
  boosterHint.textContent = 'Ouverture en cours...';

  try {
    const cards = await fetchApprovedCards();

    if (cards.length === 0) {
      boosterHint.textContent = 'Aucune capture validée en base pour le moment.';
      boosterGrid.innerHTML = '';
      return;
    }

    const picks = pickUniqueCards(cards, 5);
    renderBooster(picks);
    boosterHint.textContent = `Booster ouvert : ${picks.length} capture(s) tirée(s) depuis cards.`;
  } catch (error) {
    console.error(error);
    boosterHint.textContent = 'Impossible d’ouvrir le booster pour le moment. Vérifie les droits Firebase.';
  } finally {
    openBoosterBtn.disabled = false;
  }
};

openBoosterBtn.addEventListener('click', openBooster);

await initCommon();
