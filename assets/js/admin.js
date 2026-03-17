import { checkAdmin, db, equalTo, get, orderByChild, query, ref, update } from './firebase.js';
import { initCommon } from './common.js';

const adminNotice = document.getElementById('adminNotice');
const pendingCards = document.getElementById('pendingCards');
const verificationCards = document.getElementById('verificationCards');
const countPending = document.getElementById('countPending');
const countApproved = document.getElementById('countApproved');
const countRejected = document.getElementById('countRejected');
const cardModal = document.getElementById('cardModal');
const closeModalBtn = document.getElementById('closeCardModal');
const modalBody = document.getElementById('cardModalBody');
let currentUser = null;
let isAdmin = false;

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

const setModalOpen = (isOpen) => {
  cardModal.hidden = !isOpen;
  document.body.classList.toggle('modal-open', isOpen);
};

const openCardModal = (card) => {
  const imageMarkup = card.image
    ? `<img src="${card.image}" alt="Illustration de la carte ${card.name}">`
    : '<p class="hint">Aucune image fournie pour cette carte.</p>';

  modalBody.innerHTML = `
    <h3>${card.name || 'Carte'} · ${card.role || '-'}</h3>
    <p><strong>Propriétaire :</strong> ${card.ownerNickname || '-'}</p>
    <p><strong>Statut :</strong> ${card.status || 'pending'}</p>
    <p><strong>Rang :</strong> ${card.rank || '-'} · <strong>Type :</strong> ${card.type || '-'} · <strong>Coût :</strong> ${card.cost ?? '-'}</p>
    <p><strong>ATK:</strong> ${card.attack ?? '-'} · <strong>DEF:</strong> ${card.defense ?? '-'} · <strong>Moyenne:</strong> ${card.average ?? '-'}</p>
    <p><strong>Compétences :</strong></p>
    <p class="modal-abilities">${card.abilities || '-'}</p>
    <div class="modal-image">${imageMarkup}</div>
  `;

  setModalOpen(true);
};

const moderateCard = async (cardId, status) => {
  const now = Date.now();
  await update(ref(db, `cards/${cardId}`), {
    status,
    moderatedBy: currentUser.uid,
    moderatedAt: now,
    updatedAt: now
  });
  await update(ref(db, `cardVerification/${cardId}`), {
    status,
    moderatedBy: currentUser.uid,
    moderatedAt: now,
    updatedAt: now
  });
  await loadPendingCards();
};

const loadPendingCards = async () => {
  if (!isAdmin || !currentUser) return;

  await updateReviewStats();
  await renderVerificationSection();

  const pendingQuery = query(ref(db, 'cards'), orderByChild('status'), equalTo('pending'));
  const snapshot = await get(pendingQuery);

  pendingCards.innerHTML = '';
  if (!snapshot.exists()) {
    pendingCards.innerHTML = '<p>Aucune carte en attente.</p>';
    return;
  }

  Object.entries(snapshot.val()).forEach(([cardId, card]) => {
    const item = document.createElement('article');
    item.className = 'pending-item';
    item.innerHTML = `
      <h3>${card.name} · ${card.role}</h3>
      <p>Par ${card.ownerNickname} — Rang ${card.rank}, coût ${card.cost}, moyenne ${card.average}</p>
      <div class="actions">
        <button type="button" class="ghost" data-action="view">Voir</button>
        <button type="button" data-action="approve">Valider</button>
        <button type="button" class="danger" data-action="reject">Refuser</button>
      </div>
    `;

    item.querySelector('[data-action="view"]').addEventListener('click', () => openCardModal(card));

    item.querySelector('[data-action="approve"]').addEventListener('click', async () => {
      await moderateCard(cardId, 'approved');
    });

    item.querySelector('[data-action="reject"]').addEventListener('click', async () => {
      await moderateCard(cardId, 'rejected');
    });

    pendingCards.appendChild(item);
  });
};

closeModalBtn.addEventListener('click', () => setModalOpen(false));
cardModal.addEventListener('click', (event) => {
  if (event.target === cardModal) {
    setModalOpen(false);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !cardModal.hidden) {
    setModalOpen(false);
  }
});

await initCommon({
  onUserChanged: async (user) => {
    currentUser = user;

    if (!user) {
      isAdmin = false;
      adminNotice.textContent = 'Connecte-toi avec un compte admin.';
      pendingCards.innerHTML = '';
      verificationCards.innerHTML = '';
      await updateReviewStats();
      return;
    }

    isAdmin = await checkAdmin(user.uid, user.email || '');
    if (!isAdmin) {
      adminNotice.textContent = 'Accès refusé : ce compte n’est pas admin.';
      pendingCards.innerHTML = '';
      verificationCards.innerHTML = '';
      await updateReviewStats();
      return;
    }

    adminNotice.textContent = 'Accès admin confirmé. Cartes en attente :';
    await loadPendingCards();
  }
});
