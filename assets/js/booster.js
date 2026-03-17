import { db, equalTo, get, orderByChild, query, ref } from './firebase.js';
import { initCommon } from './common.js';

const openBoosterBtn = document.getElementById('openBooster');
const boosterHint = document.getElementById('boosterHint');
const boosterGrid = document.getElementById('boosterGrid');

const rankScale = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

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
  const safeName = (card.name || 'AFC').replace(/"/g, '&quot;');
  const imageMarkup = cardImage
    ? `<img src="${cardImage}" alt="Carte ${safeName}" loading="lazy">`
    : '<div class="booster-placeholder">Aucune image</div>';

  return `
    <article class="afc-card rank-${rank}" style="animation-delay:${index * 90}ms">
      <div class="holo"></div>
      <header class="card-header">
        <div class="meta-left">
          <span>${card.cost ?? '-'}</span>
          <small>${card.edition || '2e édition'}</small>
        </div>
        <div class="identity">
          <p class="kicker">${card.type || 'équilibré'}</p>
          <h3>${card.name || 'Carte AFC'}</h3>
          <p>${card.role || 'Inconnue'}</p>
        </div>
        <div class="meta-right">
          <span>${rank}</span>
          <small>${card.average ?? '-'}</small>
        </div>
      </header>

      <div class="portrait-shell">
        <div class="portrait">${imageMarkup}</div>
      </div>

      <section class="skills">
        <h4>Capacités</h4>
        <p>${card.abilities || '-'}</p>
      </section>

      <footer class="stats">
        <div>
          <strong><span aria-hidden="true">⚔️</span></strong>
          <span>${card.attack ?? '-'}</span>
        </div>
        <div>
          <strong><span class="material-icons" aria-hidden="true">shield</span></strong>
          <span>${card.defense ?? '-'}</span>
        </div>
      </footer>

      <span class="serial">${card.serial || 'AFC-EN-ATTENTE'}</span>
    </article>
  `;
};

const renderBooster = (cards) => {
  boosterGrid.innerHTML = cards.map((card, index) => cardTemplate(card, index)).join('');
};

const fetchApprovedCards = async () => {
  const approvedQuery = query(ref(db, 'cards'), orderByChild('status'), equalTo('approved'));
  const snapshot = await get(approvedQuery);

  if (snapshot.exists()) {
    return Object.values(snapshot.val());
  }

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
