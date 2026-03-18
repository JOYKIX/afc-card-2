import { checkVip, db, equalTo, get, onValue, orderByChild, push, query, ref, set } from './firebase.js';
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
const portraitImage = document.getElementById('portraitImage');
const verificationStatusText = document.getElementById('verificationStatusText');
const renderEngineStatus = document.getElementById('renderEngineStatus');
const cardElement = document.getElementById('afcCard');

const rankScale = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
const titleOptions = new Set(['Responsable staff', "Gardien de l'AFC", 'Streamers', 'Viewers']);
const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

let currentUser = null;
let currentNickname = '';
let currentUserIsVip = false;
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

const normalizeText = (value = '') => value.trim().replace(/\s+/g, ' ');
const sanitizeFilename = (value = '') => normalizeText(value).toLowerCase().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'afc-card';
const normalizeRank = (value = '') => {
  const upper = String(value || '').trim().toUpperCase();
  return rankScale.includes(upper) ? upper : 'D';
};

const setRenderStatus = (message, isError = false) => {
  if (!renderEngineStatus) return;
  renderEngineStatus.textContent = message;
  renderEngineStatus.dataset.state = isError ? 'error' : 'ready';
};

const toFriendlySubmissionError = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  const messageLower = message.toLowerCase();

  if (code.includes('PERMISSION_DENIED') || messageLower.includes('permission_denied')) {
    return 'Échec de l’envoi : la base refuse cette écriture (règles Firebase). Contacte un admin.';
  }

  if (code.includes('NETWORK_ERROR') || messageLower.includes('network')) {
    return 'Échec de l’envoi : connexion réseau instable. Réessaie dans quelques secondes.';
  }

  if (messageLower.includes('quota') || messageLower.includes('too large')) {
    return 'Échec de l’envoi : image trop lourde pour la base. Choisis une photo plus légère.';
  }

  return 'Échec de l’envoi en vérification. Réessaie dans quelques secondes.';
};

const applyRankTheme = (rank) => {
  cardElement.classList.remove(...rankScale.map((value) => `rank-${value}`));
  cardElement.classList.add(`rank-${rank}`);
};

const render = () => {
  const average = getAverage();
  const rank = getRank(average);

  applyRankTheme(rank);
  output.cost.textContent = getCost(rank);
  output.edition.textContent = fields.edition.value;
  output.name.textContent = fields.name.value;
  output.title.textContent = fields.title.value;
  output.average.textContent = average;
  output.abilities.textContent = fields.abilities.value;
  output.rank.textContent = rank;
  output.topType.textContent = computeType();
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
  currentNickname = profileSnapshot.exists() ? normalizeText(profileSnapshot.val().nickname || '') : '';
};

const getCardRecordSummary = (record) => {
  if (!record) return null;

  const capture = record.cardCapture || record.cardImage || record.image || '';
  const rank = normalizeRank(record.rank || record.rarity);
  const creatorName = normalizeText(record.creatorName || record.createdBy || record.ownerNickname || '');

  return {
    ...record,
    cardCapture: capture,
    rank,
    creatorName,
    displayName: creatorName || 'Créateur inconnu',
    updatedAt: record.updatedAt || record.submittedAt || record.createdAt || 0,
    status: record.status || 'approved'
  };
};

const formatVerificationText = (record) => {
  const summary = getCardRecordSummary(record);
  if (!summary) return 'Aucune carte envoyée pour le moment.';

  if (summary.status === 'pending') {
    return `En vérification : capture ${summary.rank} envoyée par ${summary.displayName}.`;
  }

  if (summary.status === 'approved') {
    return `Validée : capture ${summary.rank} de ${summary.displayName} disponible dans les boosters.`;
  }

  if (summary.status === 'rejected') {
    return `Refusée : capture ${summary.rank} de ${summary.displayName}. Tu peux en envoyer une nouvelle.`;
  }

  return `Statut inconnu pour la capture ${summary.rank} de ${summary.displayName}.`;
};

const sortByRecency = (items = []) => [...items].sort((a, b) => (b.updatedAt || b.submittedAt || b.createdAt || 0) - (a.updatedAt || a.submittedAt || a.createdAt || 0));

const watchVerificationStatus = (uid) => {
  if (verificationUnsubscribe) {
    verificationUnsubscribe();
    verificationUnsubscribe = null;
  }

  verificationStatusText.textContent = 'Chargement du suivi de vérification...';

  let latestVerification = null;
  let latestApprovedCard = null;

  const updateStatus = () => {
    verificationStatusText.textContent = formatVerificationText(latestVerification || latestApprovedCard);
  };

  const unsubs = [];

  const userCardsQuery = query(ref(db, 'cards'), orderByChild('ownerUid'), equalTo(uid));
  unsubs.push(onValue(userCardsQuery, (snapshot) => {
    if (!snapshot.exists()) {
      latestApprovedCard = null;
      updateStatus();
      return;
    }

    const cards = sortByRecency(Object.values(snapshot.val()).map(getCardRecordSummary));
    latestApprovedCard = cards[0] || null;
    updateStatus();
  }));

  const verificationQuery = query(ref(db, 'cardVerification'), orderByChild('ownerUid'), equalTo(uid));
  unsubs.push(onValue(verificationQuery, (snapshot) => {
    if (!snapshot.exists()) {
      latestVerification = null;
      updateStatus();
      return;
    }

    const verifications = sortByRecency(
      Object.values(snapshot.val()).map((entry) => getCardRecordSummary({
        ...(entry.cardSnapshot || {}),
        ownerUid: entry.ownerUid,
        ownerNickname: entry.ownerNickname,
        creatorName: entry.creatorName || entry.ownerNickname || entry.cardSnapshot?.creatorName || entry.cardSnapshot?.createdBy,
        status: entry.status || 'pending',
        submittedAt: entry.submittedAt,
        updatedAt: entry.updatedAt
      }))
    );

    latestVerification = verifications[0] || null;
    updateStatus();
  }));

  verificationUnsubscribe = () => {
    unsubs.forEach((unsubscribe) => unsubscribe());
  };
};

const hasPendingVerification = async (uid) => {
  const verificationQuery = query(ref(db, 'cardVerification'), orderByChild('ownerUid'), equalTo(uid));
  const snapshot = await get(verificationQuery);

  if (!snapshot.exists()) return false;
  return Object.values(snapshot.val()).some((entry) => entry.status === 'pending');
};

const canSubmitCard = async (uid, isVip) => {
  if (isVip) return true;
  return !(await hasPendingVerification(uid));
};

const ensureExportableCanvas = (canvas) => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas-context-unavailable');

  const points = [
    [Math.floor(canvas.width * 0.5), Math.floor(canvas.height * 0.5)],
    [Math.floor(canvas.width * 0.2), Math.floor(canvas.height * 0.2)],
    [Math.floor(canvas.width * 0.8), Math.floor(canvas.height * 0.8)]
  ];

  const luminance = points.map(([x, y]) => {
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    return (pixel[0] + pixel[1] + pixel[2]) / 3;
  });

  const average = luminance.reduce((sum, value) => sum + value, 0) / luminance.length;
  if (average < 3) throw new Error('black-export-detected');
};

const inlineComputedStyles = (sourceRoot, cloneRoot) => {
  const sourceNodes = [sourceRoot, ...sourceRoot.querySelectorAll('*')];
  const cloneNodes = [cloneRoot, ...cloneRoot.querySelectorAll('*')];

  sourceNodes.forEach((sourceNode, index) => {
    const cloneNode = cloneNodes[index];
    if (!cloneNode || cloneNode.nodeType !== Node.ELEMENT_NODE) return;

    const computed = window.getComputedStyle(sourceNode);
    const styleText = Array.from(computed)
      .map((property) => `${property}:${computed.getPropertyValue(property)};`)
      .join('');

    cloneNode.setAttribute('style', styleText);
  });
};

const renderCardJpeg = async ({ simplified = false } = {}) => {
  const bounds = cardElement.getBoundingClientRect();
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));

  const exportClone = cardElement.cloneNode(true);
  exportClone.classList.add('is-exporting');
  if (simplified) exportClone.classList.add('is-exporting-lite');

  inlineComputedStyles(cardElement, exportClone);
  exportClone.style.margin = '0';
  exportClone.style.transform = 'none';
  exportClone.style.width = `${width}px`;
  exportClone.style.height = `${height}px`;

  const serialized = new XMLSerializer().serializeToString(exportClone);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#0f1733" />
      <foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${serialized}</div></foreignObject>
    </svg>
  `;

  const image = await new Promise((resolve, reject) => {
    const picture = new Image();
    picture.onload = () => resolve(picture);
    picture.onerror = () => reject(new Error('svg-render-failed'));
    picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-context-unavailable');

  ctx.fillStyle = '#0f1733';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(2, 2);
  ctx.drawImage(image, 0, 0, width, height);

  ensureExportableCanvas(canvas);
  return canvas.toDataURL('image/jpeg', 0.94);
};

const exportCardAsJpeg = async () => {
  setRenderStatus('Moteur export : préparation du rendu...', false);

  try {
    const jpeg = await renderCardJpeg();
    setRenderStatus('Moteur export : SVG natif prêt.', false);
    return jpeg;
  } catch (error) {
    console.warn('Export premium échoué, tentative simplifiée :', error);
    setRenderStatus('Export premium indisponible, tentative sécurisée...', true);
    const fallback = await renderCardJpeg({ simplified: true });
    setRenderStatus('Moteur export : SVG sécurisé actif.', false);
    return fallback;
  }
};

const fileLooksSupported = (file) => supportedImageTypes.has(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name || '');

const buildCardPayload = async () => {
  const average = getAverage();
  const rank = getRank(average);
  const createdAt = Date.now();
  const cardCapture = await exportCardAsJpeg();

  return {
    ownerUid: currentUser.uid,
    ownerNickname: currentNickname,
    creatorName: currentNickname,
    createdBy: currentNickname,
    rank,
    rarity: rank,
    cardCapture,
    createdAt,
    updatedAt: createdAt,
    status: 'pending'
  };
};

form.addEventListener('input', render);
rollStatsBtn.addEventListener('click', rollStats);

imageInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!fileLooksSupported(file)) {
    alert('Format refusé. Utilise JPG/JPEG, PNG ou WEBP.');
    event.target.value = '';
    portraitDataUrl = '';
    portrait.style.backgroundImage = '';
    if (portraitImage) {
      portraitImage.src = '';
      portraitImage.hidden = true;
    }
    return;
  }

  const reader = new FileReader();
  reader.onload = (readerEvent) => {
    portraitDataUrl = readerEvent.target?.result || '';
    portrait.style.backgroundImage = portraitDataUrl ? `url('${portraitDataUrl}')` : '';
    if (portraitImage) {
      portraitImage.src = portraitDataUrl || '';
      portraitImage.hidden = !portraitDataUrl;
    }
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

  if (!(await canSubmitCard(currentUser.uid, currentUserIsVip))) {
    alert('Compte standard : une seule carte en attente autorisée. Attends la validation ou passe VIP pour envoyer sans limite.');
    return;
  }

  submitCardBtn.disabled = true;

  try {
    const payload = await buildCardPayload();
    const verificationRef = push(ref(db, 'cardVerification'));

    await set(verificationRef, {
      ownerUid: currentUser.uid,
      ownerNickname: currentNickname,
      creatorName: currentNickname,
      rank: payload.rank,
      status: 'pending',
      submittedAt: payload.createdAt,
      updatedAt: payload.updatedAt,
      cardSnapshot: payload
    });

    alert('Capture de carte envoyée en attente de vérification admin.');
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
    link.download = `${sanitizeFilename(fields.name.value)}.jpg`;
    link.href = jpegDataUrl;
    link.click();
  } catch (error) {
    console.error('Export JPEG indisponible :', error);
    alert('Export indisponible pour le moment. Recharge la page puis réessaie.');
  }
});

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
    currentUserIsVip = await checkVip(user.uid, user.email || '');
  }
});

fields.abilities.value = `Cri du Raptor : Baisse la défense adverse de 10 points.

Stream Ban : Met hors combat la carte adverse. Peut être utilisé deux fois.`;
setRenderStatus('Moteur export : SVG natif prêt.', false);
rollStats();
render();
