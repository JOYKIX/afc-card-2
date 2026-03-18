import { checkAdmin, db, onValue, push, ref, set, update } from './firebase.js';
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
let moderationInFlight = false;

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
const normalizeEmail = (email = '') => email.trim().toLowerCase();
const emailToKey = (email = '') => normalizeEmail(email).replaceAll('.', ',');
const sortByRecency = (entries = []) => [...entries].sort((a, b) => (b.entry.updatedAt || b.entry.submittedAt || 0) - (a.entry.updatedAt || a.entry.submittedAt || 0));

const setRoleFeedback = (message, isError = false) => {
  if (!roleFeedback) return;
  roleFeedback.textContent = message;
  roleFeedback.style.color = isError ? '#ff9eb7' : '';
};

const refreshStats = () => {
  const verificationEntries = Object.values(verificationById);
  const approvedCards = Object.values(cardsById).filter((card) => (card.status || 'approved') === 'approved');

  countPending.textContent = String(verificationEntries.filter((entry) => entry.status === 'pending').length);
  countApproved.textContent = String(approvedCards.length);
  countRejected.textContent = String(verificationEntries.filter((entry) => entry.status === 'rejected').length);
};

const buildPendingQueue = () => {
  pendingQueue = sortByRecency(
    Object.entries(verificationById)
      .map(([verificationId, entry]) => ({ verificationId, entry, card: entry.cardSnapshot || {} }))
      .filter(({ entry }) => entry.status === 'pending')
  );
};

const renderTinderCard = () => {
  tinderReview.innerHTML = '';

  if (pendingQueue.length === 0) {
    tinderReview.innerHTML = '<p class="hint">Plus aucune carte en attente. File d\'attente vide.</p>';
    return;
  }

  const { card, entry } = pendingQueue[0];
  const imageSource = card.cardImage || card.image || '';
  const imageMarkup = imageSource
    ? `<img src="${escapeHtml(imageSource)}" alt="Rendu JPEG de ${escapeHtml(card.name || 'la carte')}">`
    : '<div class="booster-placeholder">Aucune image fournie</div>';

  tinderReview.innerHTML = `
    <article class="tinder-card rank-${escapeHtml(card.rank || 'D')}">
      <div class="tinder-image">${imageMarkup}</div>
      <div class="tinder-body">
        <h3>${escapeHtml(card.name || 'Carte')} · ${escapeHtml(card.role || '-')}</h3>
        <p>Par ${escapeHtml(entry.ownerNickname || '-')}</p>
        <p>Rang ${escapeHtml(card.rank || '-')} · ${escapeHtml(card.average ?? '-')} de moyenne</p>
      </div>
      <div class="actions tinder-actions">
        <button type="button" data-moderation="approved" ${moderationInFlight ? 'disabled' : ''}>Valider</button>
        <button type="button" class="danger" data-moderation="rejected" ${moderationInFlight ? 'disabled' : ''}>Refuser</button>
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

  const merged = sortByRecency(
    Object.entries(verificationById).map(([verificationId, entry]) => ({ verificationId, entry, card: entry.cardSnapshot || {} }))
  );

  const filtered = merged.filter(({ entry, card }) => {
    if (statusValue !== 'all' && entry.status !== statusValue) return false;
    if (!queryText) return true;

    const haystack = `${entry.ownerNickname || ''} ${card.name || ''} ${card.role || ''} ${card.rank || ''}`.toLowerCase();
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
      <h3>${escapeHtml(card.name || 'Carte')} · ${escapeHtml(card.role || '-')}</h3>
      <p>Par ${escapeHtml(entry.ownerNickname || card.ownerNickname || '-')} — Statut <strong>${escapeHtml(entry.status || 'pending')}</strong></p>
      <p>Rang ${escapeHtml(card.rank || '-')} · Attaque ${escapeHtml(card.attack ?? '-')} · Défense ${escapeHtml(card.defense ?? '-')}</p>
    `;
    verificationCards.appendChild(item);
  });
};

const moderateCurrentCard = async (status) => {
  const current = pendingQueue[0];
  if (!current || !currentUser || moderationInFlight) return;

  moderationInFlight = true;
  renderTinderCard();

  const now = Date.now();

  try {
    await update(ref(db, `cardVerification/${current.verificationId}`), {
      status,
      moderatedBy: currentUser.uid,
      moderatedAt: now,
      updatedAt: now
    });

    if (status === 'approved') {
      const approvedCardRef = push(ref(db, 'cards'));
      await set(approvedCardRef, {
        ...current.card,
        ownerUid: current.entry.ownerUid,
        ownerNickname: current.entry.ownerNickname,
        status: 'approved',
        rarity: current.card.rarity || current.card.rank || 'D',
        cardImage: current.card.cardImage || '',
        portraitImage: current.card.portraitImage || current.card.image || '',
        createdAt: current.entry.submittedAt || current.card.createdAt || now,
        moderatedBy: currentUser.uid,
        moderatedAt: now,
        updatedAt: now
      });
    }
  } catch (error) {
    console.error('Erreur de modération :', error);
    alert('Impossible de modérer cette carte pour le moment. Réessaie.');
  } finally {
    moderationInFlight = false;
    renderTinderCard();
  }
};

const clearRealtime = () => {
  unsubs.forEach((unsubscribe) => unsubscribe());
  unsubs = [];
};

const resetAdminScreen = () => {
  clearRealtime();
  cardsById = {};
  verificationById = {};
  pendingQueue = [];
  moderationInFlight = false;
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

  try {
    await set(ref(db, `${rolePath}/${emailToKey(email)}`), true);
    setRoleFeedback(`Accès ${selectedRole.toUpperCase()} ajouté pour ${email}.`);
    roleForm.reset();
  } catch (error) {
    console.error('Erreur ajout rôle :', error);
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
