import { checkAdmin, db, onValue, ref, update } from './firebase.js';
import { initCommon } from './common.js';

const adminNotice = document.getElementById('adminNotice');
const tinderReview = document.getElementById('tinderReview');
const verificationCards = document.getElementById('verificationCards');
const countPending = document.getElementById('countPending');
const countApproved = document.getElementById('countApproved');
const countRejected = document.getElementById('countRejected');
const statusFilter = document.getElementById('statusFilter');
const searchInput = document.getElementById('searchInput');

let currentUser = null;
let cardsById = {};
let verificationById = {};
let pendingQueue = [];
let unsubs = [];

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);

const refreshStats = () => {
  const stats = Object.values(cardsById).reduce(
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

const buildPendingQueue = () => {
  pendingQueue = Object.entries(cardsById)
    .map(([cardId, card]) => ({ cardId, card }))
    .filter(({ card }) => card.status === 'pending')
    .sort((a, b) => (a.card.createdAt || 0) - (b.card.createdAt || 0));
};

const renderTinderCard = () => {
  tinderReview.innerHTML = '';

  if (pendingQueue.length === 0) {
    tinderReview.innerHTML = '<p class="hint">Plus aucune carte en attente. File d\'attente vide ✅</p>';
    return;
  }

  const { card } = pendingQueue[0];
  const imageMarkup = card.image
    ? `<img src="${escapeHtml(card.image)}" alt="Illustration de ${escapeHtml(card.name || 'la carte')}">`
    : '<div class="booster-placeholder">Aucune image fournie</div>';

  tinderReview.innerHTML = `
    <article class="tinder-card rank-${escapeHtml(card.rank || 'D')}">
      <div class="tinder-image">${imageMarkup}</div>
      <div class="tinder-body">
        <h3>${escapeHtml(card.name || 'Carte')} · ${escapeHtml(card.role || '-')}</h3>
        <p>Par ${escapeHtml(card.ownerNickname || '-')}</p>
        <p>Rang ${escapeHtml(card.rank || '-')} · Type ${escapeHtml(card.type || '-')} · Coût ${card.cost ?? '-'}</p>
        <p>ATK ${card.attack ?? '-'} / DEF ${card.defense ?? '-'} · Moyenne ${card.average ?? '-'}</p>
        <p class="modal-abilities">${escapeHtml(card.abilities || '-')}</p>
      </div>
      <div class="actions tinder-actions">
        <button type="button" data-moderation="approved">Valider</button>
        <button type="button" class="danger" data-moderation="rejected">Refuser</button>
      </div>
    </article>
  `;

  tinderReview.querySelectorAll('[data-moderation]').forEach((button) => {
    button.addEventListener('click', async () => {
      await moderateCurrentCard(button.getAttribute('data-moderation'));
    });
  });
};

const renderVerificationSection = () => {
  const statusValue = statusFilter?.value || 'all';
  const queryText = (searchInput?.value || '').trim().toLowerCase();

  const merged = Object.entries(verificationById)
    .map(([cardId, entry]) => ({ cardId, entry, card: cardsById[cardId] || {} }))
    .sort((a, b) => (b.entry.updatedAt || 0) - (a.entry.updatedAt || 0));

  const filtered = merged.filter(({ entry, card }) => {
    if (statusValue !== 'all' && entry.status !== statusValue) return false;
    if (!queryText) return true;
    const haystack = `${entry.ownerNickname || ''} ${card.name || ''} ${card.role || ''}`.toLowerCase();
    return haystack.includes(queryText);
  });

  verificationCards.innerHTML = '';
  if (filtered.length === 0) {
    verificationCards.innerHTML = '<p class="hint">Aucune carte ne correspond à tes filtres.</p>';
    return;
  }

  filtered.forEach(({ entry, card }) => {
    const item = document.createElement('article');
    item.className = 'pending-item';
    item.innerHTML = `
      <h3>${escapeHtml(card.name || entry.cardSnapshot?.name || 'Carte')} · ${escapeHtml(card.role || entry.cardSnapshot?.role || '-')}</h3>
      <p>Par ${escapeHtml(entry.ownerNickname || card.ownerNickname || '-')} — Statut <strong>${escapeHtml(entry.status || 'pending')}</strong></p>
      <p>ATK ${card.attack ?? entry.cardSnapshot?.attack ?? '-'} / DEF ${card.defense ?? entry.cardSnapshot?.defense ?? '-'} · Rang ${escapeHtml(card.rank || entry.cardSnapshot?.rank || '-')}</p>
    `;
    verificationCards.appendChild(item);
  });
};

const moderateCurrentCard = async (status) => {
  const current = pendingQueue[0];
  if (!current || !currentUser) return;

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
  } catch (error) {
    console.error('Erreur de modération:', error);
    alert('Impossible de modérer cette carte pour le moment. Réessaie.');
  }
};

const clearRealtime = () => {
  unsubs.forEach((fn) => fn());
  unsubs = [];
};

const resetAdminScreen = () => {
  clearRealtime();
  cardsById = {};
  verificationById = {};
  pendingQueue = [];
  refreshStats();
  tinderReview.innerHTML = '';
  verificationCards.innerHTML = '';
};

const bindRealtime = () => {
  if (unsubs.length > 0) return;

  unsubs.push(
    onValue(ref(db, 'cards'), (snapshot) => {
      cardsById = snapshot.exists() ? snapshot.val() : {};
      refreshStats();
      buildPendingQueue();
      renderTinderCard();
      renderVerificationSection();
    })
  );

  unsubs.push(
    onValue(ref(db, 'cardVerification'), (snapshot) => {
      verificationById = snapshot.exists() ? snapshot.val() : {};
      renderVerificationSection();
    })
  );
};

statusFilter?.addEventListener('change', renderVerificationSection);
searchInput?.addEventListener('input', renderVerificationSection);

await initCommon({
  onUserChanged: async (user) => {
    currentUser = user;

    if (!user) {
      adminNotice.textContent = 'Connecte-toi avec un compte admin.';
      resetAdminScreen();
      return;
    }

    const isAdmin = await checkAdmin(user.uid, user.email || '');
    if (!isAdmin) {
      adminNotice.textContent = 'Accès refusé : ce compte n’est pas admin.';
      resetAdminScreen();
      return;
    }

    adminNotice.textContent = 'Accès admin confirmé. Modération en temps réel activée.';
    bindRealtime();
  }
});
