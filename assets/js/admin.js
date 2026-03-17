import { checkAdmin, db, get, ref, update } from './firebase.js';
import { initCommon } from './common.js';

const adminNotice = document.getElementById('adminNotice');
const tinderReview = document.getElementById('tinderReview');
const verificationCards = document.getElementById('verificationCards');
const countPending = document.getElementById('countPending');
const countApproved = document.getElementById('countApproved');
const countRejected = document.getElementById('countRejected');

let currentUser = null;
let isAdmin = false;
let pendingQueue = [];

const updateReviewStats = async () => {
  if (!isAdmin || !currentUser) {
    countPending.textContent = '0';
    countApproved.textContent = '0';
    countRejected.textContent = '0';
    return;
  }

  const cardsSnapshot = await get(ref(db, 'cards'));
  if (!cardsSnapshot.exists()) {
    countPending.textContent = '0';
    countApproved.textContent = '0';
    countRejected.textContent = '0';
    return;
  }

  const stats = Object.values(cardsSnapshot.val()).reduce(
    (acc, card) => {
      if (card.status === 'pending') acc.pending += 1;
      if (card.status === 'approved') acc.approved += 1;
      if (card.status === 'rejected') acc.rejected += 1;
      return acc;
    },
    { pending: 0, approved: 0, rejected: 0 }
  );

  countPending.textContent = String(stats.pending);
  countApproved.textContent = String(stats.approved);
  countRejected.textContent = String(stats.rejected);
};

const renderVerificationSection = async () => {
  const snapshot = await get(ref(db, 'cardVerification'));
  verificationCards.innerHTML = '';

  if (!snapshot.exists()) {
    verificationCards.innerHTML = '<p>Aucune entrée de vérification.</p>';
    return;
  }

  const entries = Object.values(snapshot.val()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  entries.forEach((entry) => {
    const item = document.createElement('article');
    item.className = 'pending-item';
    const info = entry.cardSnapshot || {};
    item.innerHTML = `
      <h3>${info.name || 'Carte'} · ${info.role || '-'}</h3>
      <p>Par ${entry.ownerNickname || '-'} — Statut <strong>${entry.status || 'pending'}</strong></p>
      <p>ATK ${info.attack ?? '-'} / DEF ${info.defense ?? '-'} · Rang ${info.rank || '-'} · Moyenne ${info.average ?? '-'}</p>
    `;
    verificationCards.appendChild(item);
  });
};

const renderTinderCard = () => {
  tinderReview.innerHTML = '';

  if (pendingQueue.length === 0) {
    tinderReview.innerHTML = '<p class="hint">Plus aucune carte en attente. Tu peux souffler 😌</p>';
    return;
  }

  const current = pendingQueue[0];
  const card = current.card;
  const imageMarkup = card.image
    ? `<img src="${card.image}" alt="Illustration de la carte ${card.name}">`
    : '<div class="booster-placeholder">Aucune image fournie</div>';

  tinderReview.innerHTML = `
    <article class="tinder-card rank-${card.rank || 'D'}">
      <div class="tinder-image">${imageMarkup}</div>
      <div class="tinder-body">
        <h3>${card.name || 'Carte'} · ${card.role || '-'}</h3>
        <p>Par ${card.ownerNickname || '-'}</p>
        <p>Rang ${card.rank || '-'} · Type ${card.type || '-'} · Coût ${card.cost ?? '-'}</p>
        <p>ATK ${card.attack ?? '-'} / DEF ${card.defense ?? '-'} · Moyenne ${card.average ?? '-'}</p>
        <p class="modal-abilities">${card.abilities || '-'}</p>
      </div>
      <div class="actions tinder-actions">
        <button type="button" data-moderation="approve">Validé</button>
        <button type="button" class="danger" data-moderation="reject">Refusé</button>
      </div>
    </article>
  `;

  tinderReview.querySelector('[data-moderation="approve"]').addEventListener('click', async () => {
    await moderateCurrentCard('approved');
  });

  tinderReview.querySelector('[data-moderation="reject"]').addEventListener('click', async () => {
    await moderateCurrentCard('rejected');
  });
};

const moderateCurrentCard = async (status) => {
  const current = pendingQueue[0];
  if (!current) return;

  const now = Date.now();

  try {
    await update(ref(db, `cards/${current.cardId}`), {
      status,
      moderatedBy: currentUser.uid,
      moderatedAt: now,
      updatedAt: now
    });

    await update(ref(db, `cardVerification/${current.cardId}`), {
      status,
      moderatedBy: currentUser.uid,
      moderatedAt: now,
      updatedAt: now
    });

    pendingQueue.shift();
    renderTinderCard();
    await updateReviewStats();
    await renderVerificationSection();
  } catch (error) {
    console.error('Erreur de modération:', error);
    alert('Impossible de valider/refuser cette carte pour le moment. Réessaie.');
  }
};

const loadPendingCards = async () => {
  if (!isAdmin || !currentUser) return;

  await updateReviewStats();
  await renderVerificationSection();

  try {
    const snapshot = await get(ref(db, 'cards'));

    if (!snapshot.exists()) {
      pendingQueue = [];
      renderTinderCard();
      return;
    }

    pendingQueue = Object.entries(snapshot.val())
      .map(([cardId, card]) => ({ cardId, card }))
      .filter(({ card }) => card.status === 'pending')
      .sort((a, b) => (a.card.createdAt || 0) - (b.card.createdAt || 0));

    renderTinderCard();
  } catch (error) {
    console.error('Chargement des cartes en attente impossible:', error);
    pendingQueue = [];
    tinderReview.innerHTML = '<p class="hint">Impossible de charger les cartes en attente.</p>';
  }
};

await initCommon({
  onUserChanged: async (user) => {
    currentUser = user;

    if (!user) {
      isAdmin = false;
      adminNotice.textContent = 'Connecte-toi avec un compte admin.';
      tinderReview.innerHTML = '';
      verificationCards.innerHTML = '';
      await updateReviewStats();
      return;
    }

    isAdmin = await checkAdmin(user.uid, user.email || '');
    if (!isAdmin) {
      adminNotice.textContent = 'Accès refusé : ce compte n’est pas admin.';
      tinderReview.innerHTML = '';
      verificationCards.innerHTML = '';
      await updateReviewStats();
      return;
    }

    adminNotice.textContent = 'Accès admin confirmé. Passe les cartes une par une :';
    await loadPendingCards();
  }
});
