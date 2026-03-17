import { checkAdmin, db, equalTo, get, orderByChild, query, ref, update } from './firebase.js';
import { initCommon } from './common.js';

const adminNotice = document.getElementById('adminNotice');
const pendingCards = document.getElementById('pendingCards');
let currentUser = null;
let isAdmin = false;

const loadPendingCards = async () => {
  if (!isAdmin || !currentUser) return;

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
      return;
    }

    isAdmin = await checkAdmin(user.uid);
    if (!isAdmin) {
      adminNotice.textContent = 'Accès refusé : ce compte n’est pas admin.';
      pendingCards.innerHTML = '';
      return;
    }

    adminNotice.textContent = 'Accès admin confirmé. Cartes en attente :';
    await loadPendingCards();
  }
});
