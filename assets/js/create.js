import { checkAdmin, db, equalTo, get, onValue, orderByChild, push, query, ref, set, update } from './firebase.js';
import { initCommon } from './common.js';

const fields = {
  name: document.getElementById('name'),
  title: document.getElementById('title'),
  edition: document.getElementById('edition'),
  abilities: document.getElementById('abilities')
};

const output = {
  cost: document.getElementById('cardCost'),
  edition: document.getElementById('cardEdition'),
  name: document.getElementById('cardName'),
  title: document.getElementById('cardTitle'),
  average: document.getElementById('cardAverage'),
  abilities: document.getElementById('cardAbilities'),
  type: document.getElementById('cardType'),
  rank: document.getElementById('cardRank'),
  attack: document.getElementById('attack'),
  defense: document.getElementById('defense'),
  serial: document.getElementById('cardSerial'),
  topType: document.getElementById('cardTypeTop')
};

const form = document.getElementById('cardForm');
const rollStatsBtn = document.getElementById('rollStats');
const submitCardBtn = document.getElementById('submitCard');
const downloadCardBtn = document.getElementById('downloadCard');
const imageInput = document.getElementById('imageInput');
const portrait = document.getElementById('portrait');
const verificationStatusText = document.getElementById('verificationStatusText');

const rankScale = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
const titleOptions = new Set(['Responsable staff', "Gardien de l'AFC", 'Streamers', 'Viewers']);

let currentUser = null;
let currentNickname = '';
let attack = 0;
let defense = 0;
let portraitDataUrl = '';
let verificationUnsubscribe = null;

const getAverage = () => Math.round((attack + defense) / 2);
const getRank = (average) => {
  if (average >= 90) return 'SSS';
  if (average >= 80) return 'SS';
  if (average >= 70) return 'S';
  if (average >= 60) return 'A';
  if (average >= 50) return 'B';
  if (average >= 40) return 'C';
  return 'D';
};

const getCost = (rank) => rankScale.indexOf(rank) + 1;
const computeType = () => (attack > defense ? 'attaquant' : defense > attack ? 'défenseur' : 'équilibré');
const pad2 = (n) => String(n).padStart(2, '0');

const applyRankTheme = (rank) => {
  const card = document.getElementById('afcCard');
  card.classList.remove(...rankScale.map((value) => `rank-${value}`));
  card.classList.add(`rank-${rank}`);
};

const render = () => {
  const average = getAverage();
  const rank = getRank(average);
  const cost = getCost(rank);
  const cardType = computeType();

  applyRankTheme(rank);
  output.cost.textContent = cost;
  output.edition.textContent = fields.edition.value;
  output.name.textContent = fields.name.value;
  output.title.textContent = fields.title.value;
  output.average.textContent = average;
  output.abilities.textContent = fields.abilities.value;
  output.rank.textContent = rank;
  output.type.textContent = cardType;
  output.topType.textContent = cardType;
  output.attack.textContent = attack;
  output.defense.textContent = defense;
};

const rollStats = () => {
  attack = Math.floor(Math.random() * 61) + 30;
  defense = Math.floor(Math.random() * 61) + 30;
  render();
};

const refreshProfile = async (uid) => {
  const profileSnapshot = await get(ref(db, `profiles/${uid}`));
  currentNickname = profileSnapshot.exists() ? profileSnapshot.val().nickname || '' : '';
};

const getVerificationText = (card) => {
  if (!card) {
    return 'Aucune carte envoyée pour le moment.';
  }

  if (card.status === 'pending') {
    return `En vérification: ${card.name} (${card.rank}) est en attente de validation admin.`;
  }

  if (card.status === 'approved') {
    return `Validée ✅ ${card.name} (${card.rank}) est approuvée et visible.`;
  }

  if (card.status === 'rejected') {
    return `Refusée ❌ ${card.name} (${card.rank}) a été refusée. Tu peux envoyer une nouvelle carte.`;
  }

  return `Statut inconnu pour ${card.name}.`;
};

const watchVerificationStatus = (uid) => {
  if (verificationUnsubscribe) {
    verificationUnsubscribe();
    verificationUnsubscribe = null;
  }

  verificationStatusText.textContent = 'Chargement du suivi de vérification...';

  const userCardsQuery = query(ref(db, 'cards'), orderByChild('ownerUid'), equalTo(uid));
  verificationUnsubscribe = onValue(userCardsQuery, (snapshot) => {
    if (!snapshot.exists()) {
      verificationStatusText.textContent = 'Aucune carte envoyée pour le moment.';
      return;
    }

    const cards = Object.values(snapshot.val()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    verificationStatusText.textContent = getVerificationText(cards[0]);
  });
};

const canSubmitCard = async (uid) => {
  const userCardsQuery = query(ref(db, 'cards'), orderByChild('ownerUid'), equalTo(uid));
  const snapshot = await get(userCardsQuery);
  if (!snapshot.exists()) return true;

  const cards = Object.values(snapshot.val());
  return !cards.some((card) => card.status !== 'rejected');
};

const computeSerial = async (createdAt, cardKey) => {
  const snapshot = await get(ref(db, 'cards'));
  if (!snapshot.exists()) return { index: 1, total: 1 };

  const entries = Object.entries(snapshot.val()).map(([key, value]) => ({
    key,
    createdAt: value.createdAt || 0
  }));

  entries.sort((a, b) => a.createdAt - b.createdAt || a.key.localeCompare(b.key));
  const index = entries.findIndex((entry) => entry.key === cardKey && entry.createdAt === createdAt) + 1;
  return { index: Math.max(index, 1), total: entries.length };
};

form.addEventListener('input', render);
rollStatsBtn.addEventListener('click', rollStats);

imageInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const valid = ['image/jpeg', 'image/webp'].includes(file.type);
  if (!valid) {
    alert('Format refusé. Utilise JPG/JPEG ou WEBP (pas de PNG).');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    portraitDataUrl = e.target?.result || '';
    portrait.style.backgroundImage = `url('${portraitDataUrl}')`;
  };
  reader.readAsDataURL(file);
});

submitCardBtn.addEventListener('click', async () => {
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  if (!currentUser) {
    alert('Connexion Google obligatoire pour créer une carte.');
    return;
  }

  if (!currentNickname) {
    alert('Configure ton pseudo sur la page Profil avant de soumettre une carte.');
    window.location.href = 'profile.html';
    return;
  }

  if (!titleOptions.has(fields.title.value)) {
    alert('Rôle invalide.');
    return;
  }

  const allowedToSubmit = await canSubmitCard(currentUser.uid);
  if (!allowedToSubmit) {
    alert('Tu as déjà une carte en vérification ou validée. Tu peux en renvoyer une uniquement si la précédente est refusée.');
    return;
  }

  submitCardBtn.disabled = true;

  try {
    const average = getAverage();
    const rank = getRank(average);
    const cost = getCost(rank);
    const createdAt = Date.now();

    const payload = {
      ownerUid: currentUser.uid,
      ownerNickname: currentNickname,
      name: fields.name.value.trim(),
      role: fields.title.value,
      edition: '2e édition',
      abilities: fields.abilities.value.trim(),
      image: portraitDataUrl,
      attack,
      defense,
      average,
      rank,
      cost,
      type: computeType(),
      status: 'pending',
      createdAt,
      updatedAt: createdAt
    };

    const cardRef = push(ref(db, 'cards'));
    await set(cardRef, payload);
    await set(ref(db, `cardVerification/${cardRef.key}`), {
      cardId: cardRef.key,
      ownerUid: currentUser.uid,
      ownerNickname: currentNickname,
      status: 'pending',
      submittedAt: createdAt,
      updatedAt: createdAt,
      cardSnapshot: {
        name: payload.name,
        role: payload.role,
        rank: payload.rank,
        average: payload.average,
        cost: payload.cost,
        attack: payload.attack,
        defense: payload.defense,
        type: payload.type,
        edition: payload.edition
      }
    });

    try {
      const { index, total } = await computeSerial(createdAt, cardRef.key);
      await update(ref(db, `cards/${cardRef.key}`), { serialIndex: index, serialTotal: total });
      output.serial.textContent = `${pad2(index)}/${pad2(total)}`;
    } catch (serialError) {
      console.warn('Numérotation non disponible pour cette soumission :', serialError);
      output.serial.textContent = '--/--';
    }

    alert('Carte envoyée en attente de vérification admin.');
  } catch (error) {
    console.error('Erreur lors de la soumission :', error);
    alert('Échec de l’envoi en vérification. Réessaie dans quelques secondes.');
  } finally {
    submitCardBtn.disabled = false;
  }
});

downloadCardBtn.addEventListener('click', async () => {
  if (!window.html2canvas) {
    alert('Export indisponible: html2canvas non chargé.');
    return;
  }

  const card = document.getElementById('afcCard');
  const canvas = await window.html2canvas(card, { backgroundColor: null, scale: 2 });
  const link = document.createElement('a');
  link.download = `${fields.name.value || 'afc-card'}.jpg`;
  link.href = canvas.toDataURL('image/jpeg', 0.94);
  link.click();
});

const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
script.defer = true;
document.head.appendChild(script);

await initCommon({
  onUserChanged: async (user) => {
    currentUser = user;
    if (!user) {
      currentNickname = '';
      verificationStatusText.textContent = 'Connecte-toi pour voir le statut de ta carte.';
      if (verificationUnsubscribe) {
        verificationUnsubscribe();
        verificationUnsubscribe = null;
      }
      return;
    }

    await refreshProfile(user.uid);
    watchVerificationStatus(user.uid);
    await checkAdmin(user.uid, user.email || '');
  }
});

fields.abilities.value = `Cri du Raptor : Baisse la défense adverse de 10 points.\n\nStream Ban : Met hors combat la carte adverse. Peut être utilisé deux fois.`;
rollStats();
render();
