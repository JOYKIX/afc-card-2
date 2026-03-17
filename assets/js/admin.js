import { checkAdmin, db, equalTo, get, orderByChild, query, ref, update } from './firebase.js';
import { initCommon } from './common.js';

const adminNotice = document.getElementById('adminNotice');
const pendingCards = document.getElementById('pendingCards');
const countPending = document.getElementById('countPending');
const countApproved = document.getElementById('countApproved');
const countRejected = document.getElementById('countRejected');
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

const loadPendingCards = async () => {
  if (!isAdmin || !currentUser) return;

  await updateReviewStats();

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
        <button type="button" data-action="approve">Valider</button>
        <button type="button" class="danger" data-action="reject">Refuser</button>
      </div>
    `;

    item.querySelector('[data-action="approve"]').addEventListener('click', async () => {
      await update(ref(db, `cards/${cardId}`), {
        status: 'approved',
        moderatedBy: currentUser.uid,
        moderatedAt: Date.now()
      });
      await loadPendingCards();
    });

    item.querySelector('[data-action="reject"]').addEventListener('click', async () => {
      await update(ref(db, `cards/${cardId}`), {
        status: 'rejected',
        moderatedBy: currentUser.uid,
        moderatedAt: Date.now()
      });
      await loadPendingCards();
    });

    pendingCards.appendChild(item);
  });
};

await initCommon({
  onUserChanged: async (user) => {
    currentUser = user;

    if (!user) {
      isAdmin = false;
      adminNotice.textContent = 'Connecte-toi avec un compte admin.';
      pendingCards.innerHTML = '';
      await updateReviewStats();
      return;
    }

    isAdmin = await checkAdmin(user.uid, user.email || '');
    if (!isAdmin) {
      adminNotice.textContent = 'Accès refusé : ce compte n’est pas admin.';
      pendingCards.innerHTML = '';
      await updateReviewStats();
      return;
    }

    adminNotice.textContent = 'Accès admin confirmé. Cartes en attente :';
    await loadPendingCards();
  }
});
