import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import {
  getDatabase,
  get,
  push,
  query,
  ref,
  set,
  update,
  orderByChild,
  equalTo
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyD6fflHphjbeMI6dqNG817sk2K_b3ORAGQ',
  authDomain: 'afc-cardgame.firebaseapp.com',
  databaseURL: 'https://afc-cardgame-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'afc-cardgame',
  storageBucket: 'afc-cardgame.firebasestorage.app',
  messagingSenderId: '608410673000',
  appId: '1:608410673000:web:3dc41b1500257aa64180dd'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const googleProvider = new GoogleAuthProvider();

const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');
const adminTabBtn = document.getElementById('adminTabBtn');
const pendingCards = document.getElementById('pendingCards');

const authStatus = document.getElementById('authStatus');
const googleLoginBtn = document.getElementById('googleLogin');
const logoutBtn = document.getElementById('logout');
const saveProfileBtn = document.getElementById('saveProfile');
const nicknameInput = document.getElementById('nickname');

const form = document.getElementById('cardForm');
const rollStatsBtn = document.getElementById('rollStats');
const submitCardBtn = document.getElementById('submitCard');
const downloadCardBtn = document.getElementById('downloadCard');
const imageInput = document.getElementById('imageInput');
const portrait = document.getElementById('portrait');

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

const titleOptions = new Set([
  'Responsable staff',
  "Gardien de l'AFC",
  'Streamers',
  'Viewers'
]);

let currentUser = null;
let currentNickname = '';
let isAdmin = false;
let attack = 0;
let defense = 0;
let portraitDataUrl = '';

const rankScale = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

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

const computeType = () => {
  if (attack > defense) return 'attaquant';
  if (defense > attack) return 'défenseur';
  return 'équilibré';
};

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

const activateTab = (tabId) => {
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabId));
  tabContents.forEach((content) => content.classList.toggle('active', content.id === tabId));
};

tabs.forEach((tab) => {
  tab.addEventListener('click', () => activateTab(tab.dataset.tab));
});

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

googleLoginBtn.addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    alert(`Connexion Google impossible: ${error.message}`);
  }
});

logoutBtn.addEventListener('click', async () => {
  await signOut(auth);
});

saveProfileBtn.addEventListener('click', async () => {
  if (!currentUser) {
    alert('Connecte-toi d\'abord avec Google.');
    return;
  }

  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    alert('Le pseudo est obligatoire.');
    return;
  }

  await set(ref(db, `profiles/${currentUser.uid}`), {
    nickname,
    email: currentUser.email || '',
    updatedAt: Date.now()
  });

  currentNickname = nickname;
  alert('Pseudo enregistré.');
});

const computeSerial = async (createdAt, cardKey) => {
  const snapshot = await get(ref(db, 'cards'));
  if (!snapshot.exists()) {
    return { index: 1, total: 1 };
  }

  const entries = Object.entries(snapshot.val()).map(([key, value]) => ({
    key,
    createdAt: value.createdAt || 0
  }));

  entries.sort((a, b) => a.createdAt - b.createdAt || a.key.localeCompare(b.key));

  const index = entries.findIndex((entry) => entry.key === cardKey && entry.createdAt === createdAt) + 1;
  return { index: Math.max(index, 1), total: entries.length };
};

submitCardBtn.addEventListener('click', async () => {
  if (!currentUser) {
    alert('Connexion Google obligatoire pour créer une carte.');
    return;
  }

  if (!currentNickname) {
    alert('Choisis un pseudo dans l\'onglet Profil avant de soumettre une carte.');
    activateTab('profileTab');
    return;
  }

  if (!titleOptions.has(fields.title.value)) {
    alert('Rôle invalide.');
    return;
  }

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

  const { index, total } = await computeSerial(createdAt, cardRef.key);
  await update(ref(db, `cards/${cardRef.key}`), { serialIndex: index, serialTotal: total });

  output.serial.textContent = `${pad2(index)}/${pad2(total)}`;
  alert('Carte envoyée en attente de vérification admin.');

  if (isAdmin) {
    await loadPendingCards();
  }
});

const loadPendingCards = async () => {
  if (!isAdmin) return;

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
      <h4>${card.name} · ${card.role}</h4>
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

const refreshProfile = async (uid) => {
  const profileSnapshot = await get(ref(db, `profiles/${uid}`));
  if (!profileSnapshot.exists()) {
    currentNickname = '';
    nicknameInput.value = '';
    return;
  }

  currentNickname = profileSnapshot.val().nickname || '';
  nicknameInput.value = currentNickname;
};

const refreshAdmin = async (uid) => {
  const adminSnapshot = await get(ref(db, `admins/${uid}`));
  isAdmin = adminSnapshot.val() === true;
  adminTabBtn.classList.toggle('hidden', !isAdmin);
  if (!isAdmin && document.getElementById('adminTab').classList.contains('active')) {
    activateTab('createTab');
  }
  if (isAdmin) {
    await loadPendingCards();
  }
};

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    authStatus.textContent = 'Non connecté';
    currentNickname = '';
    nicknameInput.value = '';
    isAdmin = false;
    adminTabBtn.classList.add('hidden');
    pendingCards.innerHTML = '';
    return;
  }

  authStatus.textContent = `${user.displayName || user.email}`;
  await refreshProfile(user.uid);
  await refreshAdmin(user.uid);
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

fields.abilities.value = `Cri du Raptor : Baisse la défense adverse de 10 points.\n\nStream Ban : Met hors combat la carte adverse. Peut être utilisé deux fois.`;
rollStats();
render();
