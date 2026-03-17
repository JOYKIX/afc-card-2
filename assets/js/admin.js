import { checkAdmin, db, onValue, push, ref, remove, set, update } from './firebase.js';
import { initCommon } from './common.js';

const adminNotice = document.getElementById('adminNotice');
const tinderReview = document.getElementById('tinderReview');
const verificationCards = document.getElementById('verificationCards');
const countPending = document.getElementById('countPending');
const countApproved = document.getElementById('countApproved');
const countRejected = document.getElementById('countRejected');
const statusFilter = document.getElementById('statusFilter');
const searchInput = document.getElementById('searchInput');
const roleForm = document.getElementById('roleForm');
const roleEmail = document.getElementById('roleEmail');
const roleType = document.getElementById('roleType');
const roleFeedback = document.getElementById('roleFeedback');

let currentUser = null;
let cardsById = {};
let verificationById = {};
let pendingQueue = [];
let unsubs = [];

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
const normalizeEmail = (email = '') => email.trim().toLowerCase();
const emailToKey = (email = '') => normalizeEmail(email).replaceAll('.', ',');

const setRoleFeedback = (message, isError = false) => {
  if (!roleFeedback) return;
  roleFeedback.textContent = message;
  roleFeedback.style.color = isError ? '#ff9eb7' : '';
};

const refreshStats = () => {
  const stats = {
    pending: Object.values(verificationById).filter((entry) => entry.status === 'pending').length,
    approved: Object.values(cardsById).length,
    rejected: Object.values(verificationById).filter((entry) => entry.status === 'rejected').length
  };

  countPending.textContent = String(stats.pending);
  countApproved.textContent = String(stats.approved);
  countRejected.textContent = String(stats.rejected);
};

const buildPendingQueue = () => {
  pendingQueue = Object.entries(verificationById)
    .map(([verificationId, entry]) => ({ verificationId, entry, card: entry.cardSnapshot || {} }))
    .filter(({ entry }) => entry.status === 'pending')
    .sort((a, b) => (a.entry.submittedAt || 0) - (b.entry.submittedAt || 0));
};

const renderTinderCard = () => {
  tinderReview.innerHTML = '';

  if (pendingQueue.length === 0) {
    tinderReview.innerHTML = '<p class="hint">Plus aucune carte en attente. File d\'attente vide ✅</p>';
    return;
  }

  const { card, entry } = pendingQueue[0];
  const imageMarkup = card.image
    ? `<img src="${escapeHtml(card.image)}" alt="Illustration de ${escapeHtml(card.name || 'la carte')}">`
    : '<div class="booster-placeholder">Aucune image fournie</div>';

  tinderReview.innerHTML = `
    <article class="tinder-card rank-${escapeHtml(card.rank || 'D')}">
      <div class="tinder-image">${imageMarkup}</div>
      <div class="tinder-body">
        <h3>${escapeHtml(card.name || 'Carte')} · ${escapeHtml(card.role || '-')}</h3>
        <p>Par ${escapeHtml(entry.ownerNickname || '-')}</p>
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
    .map(([verificationId, entry]) => ({ verificationId, entry, card: entry.cardSnapshot || {} }))
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
    await update(ref(db, `cardVerification/${current.verificationId}`), {
      status,
      moderatedBy: currentUser.uid,
      moderatedAt: now,
      updatedAt: now
    });

    if (status === 'approved') {
      const cardRef = push(ref(db, 'cards'));
      await set(cardRef, {
        ...current.card,
        ownerUid: current.entry.ownerUid,
        ownerNickname: current.entry.ownerNickname,
        status: 'approved',
        createdAt: current.entry.submittedAt || now,
        moderatedBy: currentUser.uid,
        moderatedAt: now,
        updatedAt: now
      });
    }

    await remove(ref(db, `cardVerification/${current.verificationId}`));
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
      refreshStats();
      buildPendingQueue();
      renderTinderCard();
      renderVerificationSection();
    })
  );
};

roleForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!currentUser) {
    setRoleFeedback('Connecte-toi avec un compte admin.', true);
    return;
  }

  const email = normalizeEmail(roleEmail?.value || '');
  const selectedRole = roleType?.value === 'vip' ? 'vip' : 'admin';

  if (!email || !email.includes('@')) {
    setRoleFeedback('Merci de renseigner un email valide.', true);
    return;
  }

  const rolePath = selectedRole === 'admin' ? 'adminRegistry' : 'vipRegistry';
  const legacyVipPath = selectedRole === 'vip' ? 'vipRegistery' : null;
  const emailKey = emailToKey(email);

  try {
    await set(ref(db, `${rolePath}/${emailKey}`), true);
    if (legacyVipPath) {
      await set(ref(db, `${legacyVipPath}/${emailKey}`), true);
    }

    setRoleFeedback(`Accès ${selectedRole.toUpperCase()} ajouté pour ${email}.`);
    roleForm.reset();
  } catch (error) {
    console.error('Erreur ajout rôle:', error);
    setRoleFeedback('Impossible d’ajouter cet accès pour le moment.', true);
  }
});

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
