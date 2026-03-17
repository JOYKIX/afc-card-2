import { db, equalTo, get, orderByChild, query, ref } from './firebase.js';
import { initCommon } from './common.js';

const openBoosterBtn = document.getElementById('openBooster');
const boosterHint = document.getElementById('boosterHint');
const boosterGrid = document.getElementById('boosterGrid');

const rankClass = (rank = 'D') => `rank-${rank}`;

const shuffle = (items) => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const renderBooster = (cards) => {
  boosterGrid.innerHTML = '';

  cards.forEach((card) => {
    const article = document.createElement('article');
    article.className = `booster-card ${rankClass(card.rank)}`;
    const imageMarkup = card.image
      ? `<img src="${card.image}" alt="Carte ${card.name}">`
      : '<div class="booster-placeholder">Aucune image</div>';

    article.innerHTML = `
      <div class="booster-card-image">${imageMarkup}</div>
      <div class="booster-card-body">
        <p class="kicker">${card.role || 'Carte AFC'}</p>
        <h3>${card.name || 'Inconnue'}</h3>
        <p>Rang ${card.rank || 'D'} · Moyenne ${card.average ?? '-'}</p>
        <p>ATK ${card.attack ?? '-'} / DEF ${card.defense ?? '-'}</p>
      </div>
    `;
    boosterGrid.appendChild(article);
  });
};

const openBooster = async () => {
  openBoosterBtn.disabled = true;
  boosterHint.textContent = 'Ouverture en cours...';

  try {
    const approvedQuery = query(ref(db, 'cards'), orderByChild('status'), equalTo('approved'));
    const snapshot = await get(approvedQuery);

    if (!snapshot.exists()) {
      boosterHint.textContent = 'Aucune carte validée en base pour le moment.';
      boosterGrid.innerHTML = '';
      return;
    }

    const cards = Object.values(snapshot.val());
    const picks = shuffle(cards).slice(0, 5);

    renderBooster(picks);
    boosterHint.textContent = `Booster ouvert : ${picks.length} carte(s) récupérée(s).`;
  } catch (error) {
    console.error(error);
    boosterHint.textContent = 'Impossible d’ouvrir le booster pour le moment.';
  } finally {
    openBoosterBtn.disabled = false;
  }
};

openBoosterBtn.addEventListener('click', openBooster);

await initCommon();
