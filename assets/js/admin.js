import {
  db,
  escapeHtml,
  formatCardNumber,
  equalTo,
  get,
  nicknameToKey,
  normalizeCardNumber,
  normalizeNickname,
  normalizeRank,
  normalizeRemainingStatRerolls,
  normalizeRoles,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  remove,
  runTransaction,
  set,
  update,
  updateCachedRoles,
  canAccessAdmin
} from './firebase.js';
import { initCommon } from './common.js';
import {
  CARD_NUMBER_REGISTRY_PATH,
  buildOwnershipIndex,
  normalizeCardNumberRegistry,
  normalizeCardRecord,
  normalizeOwnedCards
} from './lib/card-data.js';

let adminNotice;
let tinderReview;
let verificationCards;
let countPending;
let countApproved;
let countRejected;
let statusFilter;
let searchInput;
let roleForm;
let roleNickname;
let roleFeedback;
let roleCheckboxes = [];
let managedCards;
let managedSearchInput;
let managedStats;

const assignableRoles = ['vip', 'streamers', 'staff afc', 'creator', 'admin', 'african king'];
const getEntryTimestamp = (item = {}) => item.entry?.submittedAt || item.entry?.createdAt || item.card?.createdAt || item.entry?.updatedAt || item.card?.updatedAt || 0;
const sortByRecency = (entries = []) => [...entries].sort((a, b) => (b.entry?.updatedAt || b.entry?.submittedAt || b.entry?.createdAt || b.card?.updatedAt || 0) - (a.entry?.updatedAt || a.entry?.submittedAt || a.entry?.createdAt || a.card?.updatedAt || 0));
const sortByOldestSubmission = (entries = []) => [...entries].sort((a, b) => getEntryTimestamp(a) - getEntryTimestamp(b));

let currentUser = null;
let cardsById = {};
let verificationById = {};
let profilesByUid = {};
let pendingQueue = [];
let unsubs = [];
let moderationInFlight = false;
let cardManagementInFlight = false;

const getUsedNumbersMap = () => normalizeCardNumberRegistry({ usedNumbers: Object.fromEntries(
  Object.values(cardsById)
    .map((record) => normalizeCardRecord(record, record?.cardId || ''))
    .filter((record) => record.cardId && record.cardNumber)
    .map((record) => [String(record.cardNumber), record.cardId])
) }).usedNumbers;

const getLowestAvailableCardNumber = () => {
  const usedNumbers = new Set(Object.keys(getUsedNumbersMap()).map((value) => Number.parseInt(value, 10)).filter(Number.isInteger));
  let candidate = 1;
  while (usedNumbers.has(candidate)) candidate += 1;
  return candidate;
};

const formatOwnedBy = (owners = []) => owners.length
  ? owners.map((owner) => owner.nickname || owner.uid).join(', ')
  : 'Aucun profil';

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
  }, entry.cardSnapshot?.cardId || verificationId)
});

const setRoleFeedback = (message, isError = false) => {
  if (!roleFeedback) return;
  roleFeedback.textContent = message;
  roleFeedback.style.color = isError ? '#ff9eb7' : '';
};

const getSelectedRoles = () => normalizeRoles(roleCheckboxes.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value));

const getOwnersByCardId = () => buildOwnershipIndex(profilesByUid);

const refreshStats = () => {
  const verificationEntries = Object.values(verificationById);
  const approvedCards = Object.values(cardsById).map((record) => normalizeCardRecord(record, record?.cardId || ''));

  countPending.textContent = String(verificationEntries.filter((entry) => entry.status === 'pending').length);
  countApproved.textContent = String(approvedCards.length);
  countRejected.textContent = '0';

  if (managedStats) {
    const ownersByCardId = getOwnersByCardId();
    const managedOwnersCount = Object.values(ownersByCardId).reduce((sum, owners) => sum + owners.length, 0);
    managedStats.textContent = `${approvedCards.length} cartes validées · ${managedOwnersCount} possessions profil synchronisées`;
  }
};

const buildPendingQueue = () => {
  pendingQueue = sortByOldestSubmission(
    Object.entries(verificationById)
      .map(toVerificationRow)
      .filter(({ entry }) => entry.status === 'pending')
  );
};

const renderPreviewImage = (card, altText) => {
  if (!card.cardCapture) return '<div class="booster-placeholder">Aucune carte fournie</div>';
  return `<img src="${escapeHtml(card.cardCapture)}" alt="${escapeHtml(altText)}">`;
};

const renderCardAuditList = (card) => {
  const details = [
    ['Nom', card.cardName || card.name || '—'],
    ['Titre', card.title || '—'],
    ['Édition', card.edition || '—'],
    ['Capacité', card.abilities || '—'],
    ['Attaque', card.attack || 0],
    ['Défense', card.defense || 0],
    ['Moyenne', card.average ?? '—'],
    ['Type', card.type || '—'],
    ['Rang', card.rank || normalizeRank(card.rarity)],
    ['Owner UID', card.ownerUid || '—'],
    ['Pseudo', card.ownerNickname || card.creatorName || '—']
  ];

  return `<dl class="card-audit-list">${details.map(([label, value]) => `
    <div>
      <dt>${escapeHtml(String(label))}</dt>
      <dd>${escapeHtml(String(value))}</dd>
    </div>
  `).join('')}</dl>`;
};

const renderTinderCard = () => {
  tinderReview.innerHTML = '';

  if (pendingQueue.length === 0) {
    tinderReview.innerHTML = '<p class="hint">Plus aucune carte en attente. File de vérification vide.</p>';
    return;
  }

  const { card, entry } = pendingQueue[0];
  const nextCardNumber = getLowestAvailableCardNumber();

  tinderReview.innerHTML = `
    <article class="tinder-card rank-${escapeHtml(card.rank)}">
      <div class="tinder-image">${renderPreviewImage(card, `Carte ${card.rank} de ${card.creatorName}`)}</div>
      <div class="tinder-body">
        <h3>Carte ${escapeHtml(formatCardNumber(card.cardNumber))} · Rang ${escapeHtml(card.rank)}</h3>
        <p>Créateur : ${escapeHtml(card.creatorName)}</p>
        <p>Soumise le ${new Date(entry.submittedAt || card.createdAt || Date.now()).toLocaleString('fr-FR')}</p>
        <p>Numéro prévu à la validation : <strong>${escapeHtml(formatCardNumber(nextCardNumber))}</strong></p>
        ${renderCardAuditList(card)}
      </div>
      <div class="actions tinder-actions">
        <button type="button" data-moderation="approved" ${moderationInFlight ? 'disabled' : ''}>Valider et déplacer vers cards</button>
        <button type="button" class="danger" data-moderation="rejected" ${moderationInFlight ? 'disabled' : ''}>Refuser et supprimer</button>
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

    const haystack = `${entry.ownerNickname || ''} ${card.creatorName || ''} ${card.rank || ''} ${card.cardNumber || ''} ${card.cardId || ''} ${card.cardName || ''}`.toLowerCase();
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
      <div class="pending-thumb">${renderPreviewImage(card, `Carte ${card.rank} de ${card.creatorName}`)}</div>
      <div>
        <h3>${escapeHtml(card.cardName || card.name || 'Carte sans nom')}</h3>
        <p>ID fixe : <strong>${escapeHtml(card.cardId || 'non attribué')}</strong></p>
        <p>Numéro courant : <strong>${escapeHtml(formatCardNumber(card.cardNumber))}</strong></p>
        <p>Créateur : ${escapeHtml(card.creatorName)}</p>
        <p>Statut <strong>${escapeHtml(entry.status || 'pending')}</strong></p>
      </div>
    `;
    verificationCards.appendChild(item);
  });
};

const reserveLowestAvailableCardNumber = async () => {
  const registryRef = ref(db, CARD_NUMBER_REGISTRY_PATH);
  const marker = `pending:${currentUser?.uid || 'system'}:${Date.now()}`;
  const result = await runTransaction(registryRef, (currentValue) => {
    const registry = normalizeCardNumberRegistry(currentValue);
    const usedNumbers = { ...registry.usedNumbers };
    let candidate = 1;

    while (usedNumbers[String(candidate)]) candidate += 1;
    usedNumbers[String(candidate)] = marker;

    return {
      counter: Math.max(registry.counter || 0, candidate),
      usedNumbers
    };
  });

  if (!result.committed) {
    throw new Error('card-number-reservation-failed');
  }

  const registry = normalizeCardNumberRegistry(result.snapshot.val());
  const reservedNumber = Object.entries(registry.usedNumbers).find(([, value]) => value === marker)?.[0];
  const cardNumber = normalizeCardNumber(reservedNumber);
  if (!cardNumber) throw new Error('card-number-reservation-invalid');
  return cardNumber;
};

const finalizeReservedCardNumber = async (cardNumber, cardId) => {
  await update(ref(db, CARD_NUMBER_REGISTRY_PATH), {
    [`usedNumbers/${cardNumber}`]: cardId,
    counter: Math.max(cardNumber, getLowestAvailableCardNumber())
  });
};

const releaseCardNumber = async (cardNumber) => {
  const normalized = normalizeCardNumber(cardNumber);
  if (!normalized) return;
  await remove(ref(db, `${CARD_NUMBER_REGISTRY_PATH}/usedNumbers/${normalized}`));
};

const syncOwnershipForCard = async ({ cardId, cardNumber, removeOwnership = false }) => {
  const updates = {};
  Object.entries(profilesByUid).forEach(([uid, profile]) => {
    const ownedCards = normalizeOwnedCards(profile?.ownedCards);
    if (!ownedCards[cardId]) return;

    if (removeOwnership) {
      updates[`profiles/${uid}/ownedCards/${cardId}`] = null;
      return;
    }

    updates[`profiles/${uid}/ownedCards/${cardId}/cardNumber`] = normalizeCardNumber(cardNumber);
    updates[`profiles/${uid}/ownedCards/${cardId}/updatedAt`] = Date.now();
  });

  if (Object.keys(updates).length > 0) {
    await update(ref(db), updates);
  }
};

const moveApprovedCardToCollection = async (current, now) => {
  const approvedCardRef = push(ref(db, 'cards'));
  const cardId = approvedCardRef.key;
  const cardNumber = await reserveLowestAvailableCardNumber();
  const approvedPayload = normalizeCardRecord({
    ownerUid: current.entry.ownerUid || current.card.ownerUid,
    ownerNickname: current.entry.ownerNickname || current.card.ownerNickname,
    creatorName: current.card.creatorName,
    createdBy: current.card.creatorName,
    name: current.card.name || current.card.cardName || '',
    cardName: current.card.cardName || current.card.name || '',
    title: current.card.title || '',
    titleKey: current.card.titleKey || '',
    edition: current.card.edition || '',
    abilities: current.card.abilities || '',
    attack: current.card.attack,
    defense: current.card.defense,
    average: current.card.average,
    type: current.card.type,
    cardNumber,
    cardId,
    rank: current.card.rank,
    rarity: current.card.rank,
    cardCapture: current.card.cardCapture,
    status: 'approved',
    createdAt: current.entry.submittedAt || current.card.createdAt || now,
    updatedAt: now,
    moderatedAt: now,
    moderatedBy: currentUser.uid,
    sourceVerificationId: current.verificationId
  }, cardId);

  await set(approvedCardRef, approvedPayload);
  await finalizeReservedCardNumber(cardNumber, cardId);
  await remove(ref(db, `cardVerification/${current.verificationId}`));
};

const resetOwnerRerollsOnRejection = async (ownerUid) => {
  if (!ownerUid) return;

  const profileSnapshot = await get(ref(db, `profiles/${ownerUid}`));
  const profileData = profileSnapshot.exists() ? profileSnapshot.val() || {} : {};
  const nextRoles = normalizeRoles(profileData.roles, profileData);

  await update(ref(db, `profiles/${ownerUid}`), {
    remainingStatRerolls: normalizeRemainingStatRerolls(null, nextRoles),
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
  profilesByUid = {};
  pendingQueue = [];
  moderationInFlight = false;
  cardManagementInFlight = false;
  refreshStats();
  tinderReview.innerHTML = '';
  verificationCards.innerHTML = '';
  if (managedCards) managedCards.innerHTML = '';
};

const renderManagedCards = () => {
  if (!managedCards) return;

  const queryText = (managedSearchInput?.value || '').trim().toLowerCase();
  const ownersByCardId = getOwnersByCardId();
  const cards = Object.entries(cardsById)
    .map(([id, record]) => normalizeCardRecord(record, id))
    .sort((a, b) => {
      if (a.cardNumber && b.cardNumber) return a.cardNumber - b.cardNumber;
      if (a.cardNumber) return -1;
      if (b.cardNumber) return 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    })
    .filter((card) => {
      if (!queryText) return true;
      const haystack = [
        card.cardId,
        card.cardNumber,
        card.cardName,
        card.creatorName,
        formatOwnedBy(ownersByCardId[card.cardId] || [])
      ].join(' ').toLowerCase();
      return haystack.includes(queryText);
    });

  if (!cards.length) {
    managedCards.innerHTML = '<p class="hint">Aucune carte validée ne correspond à cette recherche.</p>';
    return;
  }

  managedCards.innerHTML = cards.map((card) => {
    const owners = ownersByCardId[card.cardId] || [];
    return `
      <article class="managed-card rank-${escapeHtml(card.rank)}">
        <div class="managed-card__media">${renderPreviewImage(card, `Carte ${card.rank} de ${card.creatorName}`)}</div>
        <div class="managed-card__body">
          <h3>${escapeHtml(card.cardName || card.name || 'Carte sans nom')}</h3>
          <p><strong>ID fixe :</strong> ${escapeHtml(card.cardId || '—')}</p>
          <p><strong>Créateur :</strong> ${escapeHtml(card.creatorName || '—')}</p>
          <p><strong>Possesseurs :</strong> ${escapeHtml(formatOwnedBy(owners))}</p>
          <label>CardNumber
            <input type="number" min="1" step="1" value="${escapeHtml(String(card.cardNumber || ''))}" data-card-number-input="${escapeHtml(card.cardId)}" ${cardManagementInFlight ? 'disabled' : ''} />
          </label>
          <div class="managed-card__actions">
            <button type="button" data-card-action="save-number" data-card-id="${escapeHtml(card.cardId)}" ${cardManagementInFlight ? 'disabled' : ''}>Modifier le numéro</button>
            <button type="button" class="danger" data-card-action="delete-card" data-card-id="${escapeHtml(card.cardId)}" ${cardManagementInFlight ? 'disabled' : ''}>Supprimer la carte</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  managedCards.querySelectorAll('[data-card-action="save-number"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const cardId = button.getAttribute('data-card-id') || '';
      const input = managedCards.querySelector(`[data-card-number-input="${CSS.escape(cardId)}"]`);
      await updateManagedCardNumber(cardId, input?.value);
    });
  });

  managedCards.querySelectorAll('[data-card-action="delete-card"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const cardId = button.getAttribute('data-card-id') || '';
      await deleteManagedCard(cardId);
    });
  });
};

const updateManagedCardNumber = async (cardId, nextValue) => {
  if (!cardId || cardManagementInFlight) return;
  const card = normalizeCardRecord(cardsById[cardId] || {}, cardId);
  const nextNumber = normalizeCardNumber(nextValue);

  if (!nextNumber) {
    alert('Renseigne un cardNumber valide (nombre entier > 0).');
    return;
  }

  const conflictingCardId = getUsedNumbersMap()[String(nextNumber)];
  if (conflictingCardId && conflictingCardId !== cardId) {
    alert(`Le numéro ${nextNumber} est déjà utilisé par une autre carte.`);
    return;
  }

  cardManagementInFlight = true;
  renderManagedCards();

  try {
    await update(ref(db, `cards/${cardId}`), {
      cardNumber: nextNumber,
      updatedAt: Date.now(),
      moderatedBy: currentUser?.uid || ''
    });

    if (card.cardNumber && card.cardNumber !== nextNumber) {
      await releaseCardNumber(card.cardNumber);
    }

    await update(ref(db, CARD_NUMBER_REGISTRY_PATH), {
      [`usedNumbers/${nextNumber}`]: cardId,
      counter: Math.max(nextNumber, getLowestAvailableCardNumber())
    });
    await syncOwnershipForCard({ cardId, cardNumber: nextNumber });
  } catch (error) {
    console.error('Erreur de mise à jour du numéro :', error);
    alert('Impossible de modifier le numéro pour le moment.');
  } finally {
    cardManagementInFlight = false;
    renderManagedCards();
  }
};

const deleteManagedCard = async (cardId) => {
  if (!cardId || cardManagementInFlight) return;
  const card = normalizeCardRecord(cardsById[cardId] || {}, cardId);
  if (!card.cardId) return;

  cardManagementInFlight = true;
  renderManagedCards();

  try {
    await remove(ref(db, `cards/${cardId}`));
    await releaseCardNumber(card.cardNumber);
    await syncOwnershipForCard({ cardId, cardNumber: null, removeOwnership: true });
  } catch (error) {
    console.error('Erreur suppression carte :', error);
    alert('Impossible de supprimer cette carte pour le moment.');
  } finally {
    cardManagementInFlight = false;
    renderManagedCards();
  }
};

const bindRealtime = () => {
  if (unsubs.length > 0) return;

  unsubs.push(
    onValue(ref(db, 'cards'), (snapshot) => {
      cardsById = snapshot.exists() ? snapshot.val() : {};
      refreshStats();
      renderTinderCard();
      renderVerificationSection();
      renderManagedCards();
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

  unsubs.push(
    onValue(ref(db, 'profiles'), (snapshot) => {
      profilesByUid = snapshot.exists() ? snapshot.val() : {};
      refreshStats();
      renderManagedCards();
    })
  );
};

const findProfileByNickname = async (nickname) => {
  const nicknameKey = nicknameToKey(nickname);
  if (!nicknameKey) return null;

  const nicknameSnapshot = await get(ref(db, `nicknameIndex/${nicknameKey}`));
  if (nicknameSnapshot.exists()) {
    const uid = nicknameSnapshot.val();
    const profileSnapshot = await get(ref(db, `profiles/${uid}`));
    return profileSnapshot.exists() ? { uid, profile: profileSnapshot.val() || {} } : null;
  }

  const profileQuery = query(ref(db, 'profiles'), orderByChild('nicknameKey'), equalTo(nicknameKey));
  const snapshot = await get(profileQuery);
  if (!snapshot.exists()) return null;

  const [uid, profile] = Object.entries(snapshot.val())[0] || [];
  return uid ? { uid, profile: profile || {} } : null;
};

const bindDomReferences = () => {
  adminNotice = document.getElementById('adminNotice');
  tinderReview = document.getElementById('tinderReview');
  verificationCards = document.getElementById('verificationCards');
  countPending = document.getElementById('countPending');
  countApproved = document.getElementById('countApproved');
  countRejected = document.getElementById('countRejected');
  statusFilter = document.getElementById('statusFilter');
  searchInput = document.getElementById('searchInput');
  roleForm = document.getElementById('roleForm');
  roleNickname = document.getElementById('roleNickname');
  roleFeedback = document.getElementById('roleFeedback');
  roleCheckboxes = Array.from(document.querySelectorAll('input[name="roleOption"]'));
  managedCards = document.getElementById('managedCards');
  managedSearchInput = document.getElementById('managedSearchInput');
  managedStats = document.getElementById('managedStats');
};

export const initAdminPage = async () => {
  bindDomReferences();

  const handleRoleSubmit = async (event) => {
    event.preventDefault();

    if (!currentUser) {
      setRoleFeedback('Connecte-toi avec un compte autorisé à gérer l’admin.', true);
      return;
    }

    const nickname = normalizeNickname(roleNickname?.value || '');
    const selectedRoles = getSelectedRoles().filter((role) => assignableRoles.includes(role));
    const nextRoles = normalizeRoles(selectedRoles);

    if (!nickname) {
      setRoleFeedback('Merci de renseigner un nickname valide.', true);
      return;
    }

    try {
      const profileEntry = await findProfileByNickname(nickname);
      if (!profileEntry) {
        setRoleFeedback('Aucun profil trouvé avec ce nickname.', true);
        return;
      }

      await update(ref(db, `profiles/${profileEntry.uid}`), {
        roles: nextRoles,
        admin: null,
        vip: null,
        remainingStatRerolls: normalizeRemainingStatRerolls(profileEntry.profile.remainingStatRerolls, nextRoles),
        updatedAt: Date.now()
      });

      if (profileEntry.uid === currentUser.uid) {
        updateCachedRoles(nextRoles);
      }

      roleForm.reset();
      setRoleFeedback(`${nickname} a maintenant les rôles : ${nextRoles.join(', ')}.`);
    } catch (error) {
      console.error('Erreur attribution rôle :', error);
      setRoleFeedback('Impossible de mettre à jour ces rôles pour le moment.', true);
    }
  };

  roleForm?.addEventListener('submit', handleRoleSubmit);
  statusFilter?.addEventListener('change', renderVerificationSection);
  searchInput?.addEventListener('input', renderVerificationSection);
  managedSearchInput?.addEventListener('input', renderManagedCards);

  const cleanupCommon = await initCommon({
    requireAuth: true,
    onUserChanged: async (user, context) => {
      currentUser = user;

      if (!user) {
        resetAdminScreen();
        adminNotice.textContent = 'Connecte-toi avec un compte admin ou african king.';
        return;
      }

      const roles = context?.session?.roles || [];
      const canManageAdmin = canAccessAdmin(roles);

      if (!canManageAdmin) {
        resetAdminScreen();
        adminNotice.textContent = 'Accès refusé : cet onglet est réservé aux rôles admin et african king.';
        return;
      }

      bindRealtime();
      adminNotice.textContent = 'Accès admin confirmé. Tu peux valider, supprimer et renuméroter les cartes, ainsi que gérer les rôles.';
    }
  });

  return () => {
    cleanupCommon?.();
    clearRealtime();
    roleForm?.removeEventListener('submit', handleRoleSubmit);
    statusFilter?.removeEventListener('change', renderVerificationSection);
    searchInput?.removeEventListener('input', renderVerificationSection);
    managedSearchInput?.removeEventListener('input', renderManagedCards);
  };
};
