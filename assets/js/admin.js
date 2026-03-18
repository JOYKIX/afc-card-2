import { DEFAULT_STAT_REROLLS, checkAdmin, db, get, onValue, push, ref, remove, runTransaction, set, update } from './firebase.js';
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
const roleNickname = document.getElementById('roleNickname');
const roleType = document.getElementById('roleType');
const roleFeedback = document.getElementById('roleFeedback');

const rankScale = ['D', 'C', 'B', 'A', 'S', 'Ω'];
const cardNumberCounterRef = ref(db, 'metadata/cardNumberCounter');

let currentUser = null;
let cardsById = {};
let verificationById = {};
let pendingQueue = [];
let unsubs = [];
let moderationInFlight = false;
let deletedRejectedCount = 0;

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
const normalizeNickname = (nickname = '') => String(nickname).trim().replace(/\s+/g, ' ');
const nicknameToKey = (nickname = '') => normalizeNickname(nickname).toLowerCase();
const normalizeRank = (value = '') => {
  const upper = String(value || '').trim().toUpperCase();
  if (upper === 'SS' || upper === 'SSS') return 'S';
  return rankScale.includes(upper) ? upper : 'D';
};
const normalizeCardNumber = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const formatCardNumber = (value) => {
  const cardNumber = normalizeCardNumber(value);
  return cardNumber ? `#${cardNumber}` : 'Non attribué';
};
const getHighestAssignedCardNumber = (records = {}) => Object.values(records).reduce((max, record) => {
  const cardNumber = normalizeCardNumber(record?.cardNumber ?? record?.cardId);
  return cardNumber ? Math.max(max, cardNumber) : max;
}, 0);
const sortByRecency = (entries = []) => [...entries].sort((a, b) => (b.entry.updatedAt || b.entry.submittedAt || b.entry.createdAt || 0) - (a.entry.updatedAt || a.entry.submittedAt || a.entry.createdAt || 0));

const normalizeCardRecord = (record = {}) => ({
  ...record,
  rank: normalizeRank(record.rank || record.rarity),
  creatorName: record.creatorName || record.createdBy || record.ownerNickname || 'Créateur inconnu',
  cardCapture: record.cardCapture || record.cardImage || record.image || '',
  cardNumber: normalizeCardNumber(record.cardNumber ?? record.cardId),
  createdAt: record.createdAt || record.submittedAt || 0,
  updatedAt: record.updatedAt || record.submittedAt || record.createdAt || 0
});

const toVerificationRow = ([verificationId, entry]) => ({
  verificationId,
  entry,
  card: normalizeCardRecord({
    ...(entry.cardSnapshot || {}),
    ownerUid: entry.ownerUid,
    ownerNickname: entry.ownerNickname,
    creatorName: entry.creatorName || entry.ownerNickname || entry.cardSnapshot?.creatorName || entry.cardSnapshot?.createdBy,
    rank: entry.rank || entry.cardSnapshot?.rank,
    status: entry.status || 'pending',
    submittedAt: entry.submittedAt,
    updatedAt: entry.updatedAt
  })
});

const setRoleFeedback = (message, isError = false) => {
  if (!roleFeedback) return;
  roleFeedback.textContent = message;
  roleFeedback.style.color = isError ? '#ff9eb7' : '';
};

const refreshStats = () => {
  const verificationEntries = Object.values(verificationById);
  const approvedCards = Object.values(cardsById).map(normalizeCardRecord);

  countPending.textContent = String(verificationEntries.filter((entry) => entry.status === 'pending').length);
  countApproved.textContent = String(approvedCards.length);
  countRejected.textContent = String(deletedRejectedCount);
};

const buildPendingQueue = () => {
  pendingQueue = sortByRecency(
    Object.entries(verificationById)
      .map(toVerificationRow)
      .filter(({ entry }) => entry.status === 'pending')
  );
};

const renderPreviewImage = (card, altText) => {
  if (!card.cardCapture) return '<div class="booster-placeholder">Aucune capture fournie</div>';
  return `<img src="${escapeHtml(card.cardCapture)}" alt="${escapeHtml(altText)}">`;
};

const renderTinderCard = () => {
  tinderReview.innerHTML = '';

  if (pendingQueue.length === 0) {
    tinderReview.innerHTML = '<p class="hint">Plus aucune carte en attente. File de vérification vide.</p>';
    return;
  }

  const { card, entry } = pendingQueue[0];
  const nextCardNumber = getHighestAssignedCardNumber(cardsById) + 1;

  tinderReview.innerHTML = `
    <article class="tinder-card rank-${escapeHtml(card.rank)}">
      <div class="tinder-image">${renderPreviewImage(card, `Capture ${card.rank} de ${card.creatorName}`)}</div>
      <div class="tinder-body">
        <h3>Carte ${escapeHtml(formatCardNumber(card.cardNumber))} · Capture ${escapeHtml(card.rank)}</h3>
        <p>Créateur : ${escapeHtml(card.creatorName)}</p>
        <p>Soumise le ${new Date(entry.submittedAt || card.createdAt || Date.now()).toLocaleString('fr-FR')}</p>
        <p>Numéro prévu à la validation : <strong>${escapeHtml(formatCardNumber(nextCardNumber))}</strong></p>
      </div>
      <div class="actions tinder-actions">
        <button type="button" data-moderation="approved" ${moderationInFlight ? 'disabled' : ''}>Valider et déplacer vers cards</button>
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

  const merged = sortByRecency(Object.entries(verificationById).map(toVerificationRow));

  const filtered = merged.filter(({ entry, card }) => {
    if (statusValue !== 'all' && entry.status !== statusValue) return false;
    if (!queryText) return true;

    const haystack = `${entry.ownerNickname || ''} ${card.creatorName || ''} ${card.rank || ''} ${card.cardNumber || ''}`.toLowerCase();
    return haystack.includes(queryText);
  });

  verificationCards.innerHTML = '';
  if (filtered.length === 0) {
    verificationCards.innerHTML = '<p class="hint">Aucune entrée ne correspond à tes filtres.</p>';
    return;
  }

  filtered.forEach(({ entry, card }) => {
    const item = document.createElement('article');
    item.className = 'pending-item pending-item--visual';
    item.innerHTML = `
      <div class="pending-thumb">${renderPreviewImage(card, `Capture ${card.rank} de ${card.creatorName}`)}</div>
      <div>
        <h3>Carte ${escapeHtml(formatCardNumber(card.cardNumber))} · Capture ${escapeHtml(card.rank)}</h3>
        <p>Créateur : ${escapeHtml(card.creatorName)}</p>
        <p>Statut <strong>${escapeHtml(entry.status || 'pending')}</strong></p>
      </div>
    `;
    verificationCards.appendChild(item);
  });
};

const reserveNextCardNumber = async () => {
  const floor = getHighestAssignedCardNumber(cardsById);
  const result = await runTransaction(cardNumberCounterRef, (currentValue) => {
    const currentCounter = normalizeCardNumber(currentValue) || 0;
    return Math.max(currentCounter, floor) + 1;
  });

  if (!result.committed) {
    throw new Error('card-number-reservation-failed');
  }

  return normalizeCardNumber(result.snapshot.val());
};

const moveApprovedCardToCollection = async (current, now) => {
  const approvedCardRef = push(ref(db, 'cards'));
  const cardNumber = await reserveNextCardNumber();
  const approvedPayload = normalizeCardRecord({
    ownerUid: current.entry.ownerUid || current.card.ownerUid,
    ownerNickname: current.entry.ownerNickname || current.card.ownerNickname,
    creatorName: current.card.creatorName,
    createdBy: current.card.creatorName,
    cardNumber,
    cardId: cardNumber,
    rank: current.card.rank,
    rarity: current.card.rank,
    cardCapture: current.card.cardCapture,
    status: 'approved',
    createdAt: current.entry.submittedAt || current.card.createdAt || now,
    updatedAt: now,
    moderatedAt: now,
    moderatedBy: currentUser.uid,
    sourceVerificationId: current.verificationId
  });

  await set(approvedCardRef, approvedPayload);
  await remove(ref(db, `cardVerification/${current.verificationId}`));
};

const resetOwnerRerollsOnRejection = async (ownerUid) => {
  if (!ownerUid) return;

  await update(ref(db, `profiles/${ownerUid}`), {
    remainingStatRerolls: DEFAULT_STAT_REROLLS,
    updatedAt: Date.now()
  });
};

const moderateCurrentCard = async (status) => {
  const current = pendingQueue[0];
  if (!current || !currentUser || moderationInFlight) return;

  moderationInFlight = true;
  renderTinderCard();

  const now = Date.now();

  try {
    if (status === 'approved') {
      await moveApprovedCardToCollection(current, now);
    } else {
      await resetOwnerRerollsOnRejection(current.entry.ownerUid || current.card.ownerUid);
      await remove(ref(db, `cardVerification/${current.verificationId}`));
      deletedRejectedCount += 1;
      refreshStats();
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
  deletedRejectedCount = 0;
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

  const nickname = normalizeNickname(roleNickname?.value || '');
  const selectedRole = roleType?.value === 'vip' ? 'vip' : 'admin';

  if (!nickname) {
    setRoleFeedback('Merci de renseigner un nickname valide.', true);
    return;
  }

  const rolePath = selectedRole === 'admin' ? 'adminRegistry' : 'vipRegistry';

  try {
    await set(ref(db, `${rolePath}/${nicknameToKey(nickname)}`), true);
    roleForm.reset();
    setRoleFeedback(`${selectedRole.toUpperCase()} ajouté pour ${nickname}.`);
  } catch (error) {
    console.error('Erreur attribution rôle :', error);
    setRoleFeedback('Impossible d’ajouter ce rôle pour le moment.', true);
  }
});

await initCommon({
  requireAuth: true,
  onUserChanged: async (user) => {
    currentUser = user;

    if (!user) {
      resetAdminScreen();
      adminNotice.textContent = 'Connecte-toi avec un compte admin.';
      return;
    }

    const nicknameSnapshot = await get(ref(db, `profiles/${user.uid}/nickname`));
    const profileNickname = nicknameSnapshot.val() || '';
    const isAdmin = await checkAdmin(user.uid, profileNickname, user.email || '');

    if (!isAdmin) {
      resetAdminScreen();
      adminNotice.textContent = 'Accès refusé : ce compte n’est pas admin.';
      return;
    }

    bindRealtime();
    adminNotice.textContent = 'Accès admin confirmé. Les cartes validées reçoivent désormais un numéro unique puis vont dans cards.';
  }
});

statusFilter?.addEventListener('change', renderVerificationSection);
searchInput?.addEventListener('input', renderVerificationSection);
