import { checkAdmin, checkVip, db, equalTo, get, onValue, orderByChild, push, query, ref, set } from './firebase.js';
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
  rank: document.getElementById('cardRank'),
  attack: document.getElementById('attack'),
  defense: document.getElementById('defense'),
  topType: document.getElementById('cardTypeTop')
};

const form = document.getElementById('cardForm');
const rollStatsBtn = document.getElementById('rollStats');
const submitCardBtn = document.getElementById('submitCard');
const downloadCardBtn = document.getElementById('downloadCard');
const imageInput = document.getElementById('imageInput');
const portrait = document.getElementById('portrait');
const verificationStatusText = document.getElementById('verificationStatusText');
const renderEngineStatus = document.getElementById('renderEngineStatus');

const rankScale = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
const titleOptions = new Set(['Responsable staff', "Gardien de l'AFC", 'Streamers', 'Viewers']);

let currentUser = null;
let currentNickname = '';
let attack = 0;
let defense = 0;
let portraitDataUrl = '';
let verificationUnsubscribe = null;
let currentUserIsVip = false;
let renderEngine = 'unavailable';
let html2canvasReady = null;

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

const setRenderStatus = (message, isError = false) => {
  if (!renderEngineStatus) return;
  renderEngineStatus.textContent = message;
  renderEngineStatus.dataset.state = isError ? 'error' : 'ready';
};

const toFriendlySubmissionError = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');

  if (code.includes('PERMISSION_DENIED') || message.includes('permission_denied')) {
    return 'Échec de l’envoi: la base refuse cette écriture (règles Firebase). Contacte un admin.';
  }

  if (code.includes('NETWORK_ERROR') || message.toLowerCase().includes('network')) {
    return 'Échec de l’envoi: connexion réseau instable. Réessaie dans quelques secondes.';
  }

  if (message.toLowerCase().includes('quota') || message.toLowerCase().includes('too large')) {
    return 'Échec de l’envoi: image trop lourde pour la base. Choisis une photo plus légère.';
  }

  return 'Échec de l’envoi en vérification. Réessaie dans quelques secondes.';
};



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
    return `Validée ${card.name} (${card.rank}) est approuvée et visible.`;
  }

  if (card.status === 'rejected') {
    return `Refusée ${card.name} (${card.rank}) a été refusée. Tu peux envoyer une nouvelle carte.`;
  }

  return `Statut inconnu pour ${card.name}.`;
};

const watchVerificationStatus = (uid) => {
  if (verificationUnsubscribe) {
    verificationUnsubscribe();
    verificationUnsubscribe = null;
  }

  verificationStatusText.textContent = 'Chargement du suivi de vérification...';

  let latestPending = null;
  let latestCard = null;

  const updateStatus = () => {
    if (latestPending) {
      verificationStatusText.textContent = `En vérification: ${latestPending.name} (${latestPending.rank}) est en attente de validation admin.`;
      return;
    }

    verificationStatusText.textContent = getVerificationText(latestCard);
  };

  const unsubs = [];

  const userCardsQuery = query(ref(db, 'cards'), orderByChild('ownerUid'), equalTo(uid));
  unsubs.push(onValue(userCardsQuery, (snapshot) => {
    if (!snapshot.exists()) {
      latestCard = null;
      updateStatus();
      return;
    }

    const cards = Object.values(snapshot.val()).sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    latestCard = cards[0];
    updateStatus();
  }));

  const verificationQuery = query(ref(db, 'cardVerification'), orderByChild('ownerUid'), equalTo(uid));
  unsubs.push(onValue(verificationQuery, (snapshot) => {
    if (!snapshot.exists()) {
      latestPending = null;
      updateStatus();
      return;
    }

    const pendingCards = Object.values(snapshot.val())
      .filter((entry) => entry.status === 'pending')
      .sort((a, b) => (b.updatedAt || b.submittedAt || 0) - (a.updatedAt || a.submittedAt || 0));

    const pending = pendingCards[0]?.cardSnapshot;
    latestPending = pending ? { ...pending, status: 'pending' } : null;
    updateStatus();
  }));

  verificationUnsubscribe = () => unsubs.forEach((fn) => fn());
};

const hasPendingVerification = async (uid) => {
  const verificationQuery = query(ref(db, 'cardVerification'), orderByChild('ownerUid'), equalTo(uid));
  const snapshot = await get(verificationQuery);
  return snapshot.exists();
};

const canSubmitCard = async (uid, isVip) => {
  if (isVip) return true;

  const pendingVerification = await hasPendingVerification(uid);
  return !pendingVerification;
};

const renderCardJpeg = async () => {
  if (renderEngine === 'svg-foreignobject') {
    const card = document.getElementById('afcCard');
    const bounds = card.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    const clone = card.cloneNode(true);

    clone.style.margin = '0';
    clone.style.transform = 'none';

    const xhtml = new XMLSerializer().serializeToString(clone);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml">${xhtml}</div>
        </foreignObject>
      </svg>`;

    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    const img = await new Promise((resolve, reject) => {
      const picture = new Image();
      picture.onload = () => resolve(picture);
      picture.onerror = () => reject(new Error('fallback-serializer-failed'));
      picture.src = dataUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('canvas-context-unavailable');
    }
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.94);
  }

  if (!window.html2canvas) {
    throw new Error('html2canvas non chargé.');
  }

  const card = document.getElementById('afcCard');
  const canvas = await window.html2canvas(card, {
    backgroundColor: null,
    scale: 2,
    useCORS: true,
    logging: false,
    imageTimeout: 12000
  });
  return canvas.toDataURL('image/jpeg', 0.94);
};


const exportCardAsJpeg = async () => {
  try {
    renderEngine = 'html2canvas';
    return await renderCardJpeg();
  } catch (primaryError) {
    console.warn('Export html2canvas échoué, fallback SVG activé:', primaryError);
    renderEngine = 'svg-foreignobject';
    setRenderStatus('Moteur export fallback actif (qualité réduite).', true);
    return renderCardJpeg();
  }
};


form.addEventListener('input', render);
rollStatsBtn.addEventListener('click', rollStats);

imageInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const valid = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (!valid) {
    alert('Format refusé. Utilise JPG/JPEG, PNG ou WEBP.');
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

  const allowedToSubmit = await canSubmitCard(currentUser.uid, currentUserIsVip);
  if (!allowedToSubmit) {
    alert('Compte standard : une seule carte en attente autorisée. Attends la validation ou passe VIP pour envoyer sans limite.');
    return;
  }

  submitCardBtn.disabled = true;

  try {
    const average = getAverage();
    const rank = getRank(average);
    const cost = getCost(rank);
    const createdAt = Date.now();
    const cardImage = await exportCardAsJpeg();

    const payload = {
      ownerUid: currentUser.uid,
      ownerNickname: currentNickname,
      name: fields.name.value.trim(),
      role: fields.title.value,
      edition: '2e édition',
      abilities: fields.abilities.value.trim(),
      attack,
      defense,
      average,
      rank,
      cost,
      type: computeType(),
      rarity: rank,
      cardImage,
      createdBy: currentNickname,
      creatorName: currentNickname,
      status: 'pending',
      createdAt,
      updatedAt: createdAt
    };

    const cardRef = push(ref(db, 'cardVerification'));
    await set(cardRef, {
      ownerUid: currentUser.uid,
      ownerNickname: currentNickname,
      status: 'pending',
      submittedAt: createdAt,
      updatedAt: createdAt,
      cardSnapshot: {
        name: payload.name,
        role: payload.role,
        rank: payload.rank,
        rarity: payload.rarity,
        cardImage: payload.cardImage,
        creatorName: payload.creatorName
      }
    });

    alert('Carte envoyée en attente de vérification admin.');
  } catch (error) {
    console.error('Erreur lors de la soumission :', error);
    alert(toFriendlySubmissionError(error));
  } finally {
    submitCardBtn.disabled = false;
  }
});

downloadCardBtn.addEventListener('click', async () => {
  try {
    const jpegDataUrl = await exportCardAsJpeg();
    const link = document.createElement('a');
    link.download = `${fields.name.value || 'afc-card'}.jpg`;
    link.href = jpegDataUrl;
    link.click();
  } catch (error) {
    console.error('Export JPEG indisponible:', error);
    alert('Export indisponible pour le moment. Recharge la page puis réessaie.');
  }
});

const script = document.createElement('script');
script.src = 'assets/vendor/html2canvas.min.js';
html2canvasReady = new Promise((resolve, reject) => {
  script.onload = resolve;
  script.onerror = reject;
});
document.head.appendChild(script);

await initCommon({
  onUserChanged: async (user) => {
    currentUser = user;
    if (!user) {
      currentNickname = '';
      currentUserIsVip = false;
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
    currentUserIsVip = await checkVip(user.uid, user.email || '');
  }
});

fields.abilities.value = `Cri du Raptor : Baisse la défense adverse de 10 points.\n\nStream Ban : Met hors combat la carte adverse. Peut être utilisé deux fois.`;
try {
  await html2canvasReady;
  if (typeof window.html2canvas === 'function') {
    renderEngine = 'html2canvas';
    setRenderStatus('Moteur export: html2canvas chargé (offline).');
  } else {
    renderEngine = 'svg-foreignobject';
    setRenderStatus('Moteur export fallback actif (qualité réduite).', true);
  }
} catch (error) {
  renderEngine = 'svg-foreignobject';
  console.error('Chargement html2canvas impossible, fallback activé:', error);
  setRenderStatus('Moteur export fallback actif (qualité réduite).', true);
}
rollStats();
render();
