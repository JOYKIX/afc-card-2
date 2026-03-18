import { db, equalTo, get, orderByChild, query, ref } from './firebase.js';
import { initCommon } from './common.js';

const openBoosterBtn = document.getElementById('openBooster');
const boosterHint = document.getElementById('boosterHint');
const boosterGrid = document.getElementById('boosterGrid');

const rankScale = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
const normalizeRarity = (card) => {
  const rarity = (card?.rarity || card?.rank || 'D').toString().toUpperCase();
  return rankScale.includes(rarity) ? rarity : 'D';
};

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
    weight: rarityWeights[normalizeRarity(card)] || 1
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

const cardTemplate = (card, index) => {
  const rank = normalizeRarity(card);
  const cardImage = card.cardImage || card.image || '';
  const imageMarkup = cardImage
    ? `<img src="${escapeHtml(cardImage)}" alt="Carte ${escapeHtml(card.name || 'AFC')}" loading="lazy">`
    : '<div class="booster-placeholder">Aucune image</div>';

  return `
    <article class="afc-card rank-${escapeHtml(rank)}" style="animation-delay:${index * 90}ms">
      <div class="holo"></div>
      <header class="card-header">
        <div class="meta-left">
          <span>${escapeHtml(card.cost ?? '-')}</span>
          <small>${escapeHtml(card.edition || '2e édition')}</small>
        </div>
        <div class="identity">
          <p class="kicker">${escapeHtml(card.type || 'équilibré')}</p>
          <h3>${escapeHtml(card.name || 'Carte AFC')}</h3>
          <p>${escapeHtml(card.role || 'Inconnue')}</p>
        </div>
        <div class="meta-right">
          <span>${escapeHtml(rank)}</span>
          <small>${escapeHtml(card.average ?? '-')}</small>
        </div>
      </header>

      <div class="portrait-shell">
        <div class="portrait">${imageMarkup}</div>
      </div>

      <section class="skills">
        <h4>Capacités</h4>
        <p>${escapeHtml(card.abilities || '-')}</p>
      </section>

      <footer class="stats">
        <div>
          <strong aria-label="Attaque">
            <svg class="stat-icon stat-icon--attack" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M13.91 2.91a1 1 0 0 1 1.41 0l5.77 5.77a1 1 0 0 1 0 1.41l-1.83 1.83a1 1 0 0 1-1.41 0l-.76-.76-2.12 2.12 2.12 2.12.76-.76a1 1 0 0 1 1.41 0l1.83 1.83a1 1 0 0 1 0 1.41l-1.41 1.41a1 1 0 0 1-1.41 0l-1.83-1.83a1 1 0 0 1 0-1.41l.76-.76-2.12-2.12-2.12 2.12.76.76a1 1 0 0 1 0 1.41l-1.83 1.83a1 1 0 0 1-1.41 0L7.5 18.09a1 1 0 0 1 0-1.41l1.83-1.83a1 1 0 0 1 1.41 0l.76.76 2.12-2.12-2.12-2.12-.76.76a1 1 0 0 1-1.41 0L7.5 10.09a1 1 0 0 1 0-1.41l1.41-1.41a1 1 0 0 1 1.41 0l1.83 1.83a1 1 0 0 1 0 1.41l-.76.76 2.12 2.12 2.12-2.12-.76-.76a1 1 0 0 1 0-1.41l1.83-1.83z"/>
              <path d="M4.21 3.79a1 1 0 0 1 1.41 0l3.17 3.17-1.41 1.41L5.62 6.62l-1.41 1.41 1.76 1.75-1.41 1.41L2.79 9.44a1 1 0 0 1 0-1.41l1.42-1.42L2.79 5.2a1 1 0 0 1 0-1.41l1.42-1.42z"/>
            </svg>
          </strong>
          <span>${escapeHtml(card.attack ?? '-')}</span>
        </div>
        <div>
          <strong aria-label="Défense">
            <svg class="stat-icon stat-icon--defense" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 2.2 5 5.3v6.03c0 4.43 2.99 8.57 7 9.67 4.01-1.1 7-5.24 7-9.67V5.3L12 2.2zm0 2.19 5 2.22v4.72c0 3.31-2.11 6.53-5 7.58-2.89-1.05-5-4.27-5-7.58V6.61l5-2.22z"/>
            </svg>
          </strong>
          <span>${escapeHtml(card.defense ?? '-')}</span>
        </div>
      </footer>

      <span class="serial">${escapeHtml(card.serial || 'AFC-EN-ATTENTE')}</span>
    </article>
  `;
};

const renderBooster = (cards) => {
  boosterGrid.innerHTML = cards.map((card, index) => cardTemplate(card, index)).join('');
};

const fetchApprovedCards = async () => {
  const approvedQuery = query(ref(db, 'cards'), orderByChild('status'), equalTo('approved'));
  const snapshot = await get(approvedQuery);

  if (snapshot.exists()) return Object.values(snapshot.val());

  const allCardsSnapshot = await get(ref(db, 'cards'));
  if (!allCardsSnapshot.exists()) return [];

  return Object.values(allCardsSnapshot.val()).filter((card) => {
    const status = (card?.status || '').toLowerCase();
    return status === 'approved' || status === '';
  });
};

const openBooster = async () => {
  openBoosterBtn.disabled = true;
  boosterHint.textContent = 'Ouverture en cours...';

  try {
    const cards = await fetchApprovedCards();

    if (cards.length === 0) {
      boosterHint.textContent = 'Aucune carte validée en base pour le moment.';
      boosterGrid.innerHTML = '';
      return;
    }

    const picks = pickUniqueCards(cards, 5);
    renderBooster(picks);
    boosterHint.textContent = `Booster ouvert : ${picks.length} carte(s) tirée(s).`;
  } catch (error) {
    console.error(error);
    boosterHint.textContent = 'Impossible d’ouvrir le booster pour le moment. Vérifie les droits Firebase.';
  } finally {
    openBoosterBtn.disabled = false;
  }
};

openBoosterBtn.addEventListener('click', openBooster);

await initCommon();
