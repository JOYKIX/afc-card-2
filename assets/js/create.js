import {
  CARD_TITLES,
  DEFAULT_STAT_REROLLS,
  TITLE_LABELS,
  db,
  equalTo,
  get,
  getAllowedCardTitlesForRoles,
  getMaxPendingSubmissionsForRoles,
  getProfileRoles,
  getRerollDisplayValueForRoles,
  hasUnlimitedStatAccessForRoles,
  normalizeCardNumber,
  normalizeCardTitle,
  normalizeRank,
  normalizeRemainingStatRerolls,
  normalizeText,
  rankScale,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  runTransaction,
  set,
  update
} from './firebase.js';
import { initCommon } from './common.js';

const CARD_DRAFT_STORAGE_KEY = 'afc-card-draft-v2';

let fields = {};

let output = {};

let form;
let rollStatsBtn;
let submitCardBtn;
let downloadCardBtn;
let imageInput;
let portrait;
let portraitImage;
let resetPortraitPositionBtn;
let openPortraitCropModalBtn;
let portraitCropModal;
let closePortraitCropModalBtn;
let cancelPortraitCropModalBtn;
let applyPortraitCropModalBtn;
let resetPortraitCropModalBtn;
let portraitCropFrame;
let portraitCropImage;
let cropPortraitZoomRange;
let cropZoomInPortraitBtn;
let cropZoomOutPortraitBtn;
let cropPortraitZoomValue;
let verificationStatusText;
let renderEngineStatus;
let cardElement;
let rerollBadge;
let rerollStatusText;
let manualStatsBox;
let manualAttackInput;
let manualDefenseInput;

const titleOptions = new Set(CARD_TITLES);
const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIN_STAT = 1;
const MAX_STAT = 100;
const RANK_RANGES = [
  { rank: 'D', minAverage: 1, maxAverage: 19.5 },
  { rank: 'C', minAverage: 20, maxAverage: 39.5 },
  { rank: 'B', minAverage: 40, maxAverage: 59.5 },
  { rank: 'A', minAverage: 60, maxAverage: 79.5 },
  { rank: 'S', minAverage: 80, maxAverage: 99.5 },
  { rank: 'Ω', minAverage: 100, maxAverage: 100 }
];

let currentUser = null;
let currentNickname = '';
let currentUserRoles = ['african army'];
let remainingStatRerolls = DEFAULT_STAT_REROLLS;
let attack = 0;
let defense = 0;
let portraitDataUrl = '';
let portraitSourceDataUrl = '';
let portraitPosition = { x: 50, y: 50 };
let portraitZoom = 1;
let portraitNaturalSize = { width: 0, height: 0 };
let portraitCropState = null;
let portraitCropDragState = null;
let verificationUnsubscribe = null;

const getAverage = () => (attack + defense) / 2;

const getRank = (average) => {
  const matchedRange = RANK_RANGES.find(({ minAverage, maxAverage }) => average >= minAverage && average <= maxAverage);
  return matchedRange?.rank || 'D';
};

const getCost = (rank) => rankScale.indexOf(rank) + 1;
const computeType = () => (attack > defense ? 'attaquant' : defense > attack ? 'défenseur' : 'équilibré');
const hasUnlimitedStatAccess = () => hasUnlimitedStatAccessForRoles(currentUserRoles);

const saveDraft = () => {
  try {
    window.localStorage.setItem(CARD_DRAFT_STORAGE_KEY, JSON.stringify({
      name: fields.name.value,
      title: fields.title.value,
      edition: fields.edition.value,
      abilities: fields.abilities.value,
      attack,
      defense,
      portraitDataUrl,
      portraitSourceDataUrl,
      portraitPosition,
      portraitZoom,
      savedAt: Date.now()
    }));
  } catch (error) {
    console.warn('Impossible de sauvegarder le brouillon local :', error);
  }
};

const restoreDraft = async () => {
  try {
    const raw = window.localStorage.getItem(CARD_DRAFT_STORAGE_KEY);
    if (!raw) return false;

    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== 'object') return false;

    fields.name.value = draft.name || fields.name.value;
    fields.title.value = titleOptions.has(draft.title) ? draft.title : fields.title.value;
    fields.edition.value = draft.edition || fields.edition.value;
    fields.abilities.value = draft.abilities || '';
    portraitDataUrl = draft.portraitDataUrl || '';
    portraitSourceDataUrl = draft.portraitSourceDataUrl || draft.portraitDataUrl || '';
    portraitPosition = {
      x: Number.isFinite(Number(draft?.portraitPosition?.x)) ? Number(draft.portraitPosition.x) : 50,
      y: Number.isFinite(Number(draft?.portraitPosition?.y)) ? Number(draft.portraitPosition.y) : 50
    };
    portraitZoom = Number.isFinite(Number(draft?.portraitZoom)) ? Math.min(3, Math.max(1, Number(draft.portraitZoom))) : 1;

    applyPortraitImage();

    if (portraitSourceDataUrl && portraitPosition && portraitZoom) {
      try {
        portraitDataUrl = await renderPortraitCropAsset({
          dataUrl: portraitSourceDataUrl,
          position: portraitPosition,
          zoom: portraitZoom
        });
        applyPortraitImage();
      } catch (error) {
        console.warn('Impossible de recalculer le portrait du brouillon :', error);
      }
    }

    if (draft.attack != null || draft.defense != null) {
      setStats({
        attackValue: draft.attack ?? attack,
        defenseValue: draft.defense ?? defense
      });
    }

    return true;
  } catch (error) {
    console.warn('Impossible de restaurer le brouillon local :', error);
    return false;
  }
};
const sanitizeFilename = (value = '') => normalizeText(value).toLowerCase().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'afc-card';
const clampPercent = (value) => Math.min(100, Math.max(0, Number(value) || 0));
const clampPortraitZoom = (value) => Math.min(3, Math.max(1, Number(value) || 1));
const formatPortraitZoomValue = (value) => `${Math.round(clampPortraitZoom(value) * 100)}%`;
const formatCardNumber = (value) => {
  const cardNumber = normalizeCardNumber(value);
  return cardNumber ? `#${cardNumber}` : 'non attribué';
};
const clampStat = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return MIN_STAT;
  return Math.min(MAX_STAT, Math.max(MIN_STAT, parsed));
};

const setRenderStatus = (message, isError = false) => {
  if (!renderEngineStatus) return;
  renderEngineStatus.textContent = message;
  renderEngineStatus.dataset.state = isError ? 'error' : 'ready';
};

const syncManualStatInputs = () => {
  if (manualAttackInput) manualAttackInput.value = String(attack);
  if (manualDefenseInput) manualDefenseInput.value = String(defense);
};

const syncPortraitActionUi = () => {
  if (openPortraitCropModalBtn) openPortraitCropModalBtn.disabled = !(portraitSourceDataUrl || portraitDataUrl);
};

const syncCropZoomUi = () => {
  if (!portraitCropState) return;
  if (cropPortraitZoomRange) cropPortraitZoomRange.value = String(clampPortraitZoom(portraitCropState.zoom));
  if (cropPortraitZoomValue) cropPortraitZoomValue.textContent = formatPortraitZoomValue(portraitCropState.zoom);
};

const applyPortraitImage = () => {
  portrait.style.backgroundImage = '';
  portrait.style.backgroundPosition = '50% 50%';
  portrait.style.setProperty('--portrait-zoom', '1');
  syncPortraitActionUi();

  if (!portraitImage) return;

  portraitImage.src = portraitDataUrl || '';
  portraitImage.hidden = !portraitDataUrl;
  portraitImage.style.objectPosition = '50% 50%';
};

const loadImageElement = (dataUrl) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('portrait-image-load-failed'));
  image.src = dataUrl;
});

const getPortraitFrameSize = () => {
  const bounds = portrait?.getBoundingClientRect?.();
  const width = Math.max(1, Math.round(bounds?.width || 234));
  const height = Math.max(1, Math.round(bounds?.height || 280));

  return { width, height };
};

const renderPortraitCropAsset = async ({
  dataUrl,
  position = { x: 50, y: 50 },
  zoom = 1
} = {}) => {
  if (!dataUrl) return '';

  const image = await loadImageElement(dataUrl);
  const { width: frameWidth, height: frameHeight } = getPortraitFrameSize();
  const safeX = clampPercent(position?.x ?? 50);
  const safeY = clampPercent(position?.y ?? 50);
  const safeZoom = clampPortraitZoom(zoom);
  const baseScale = Math.max(frameWidth / image.naturalWidth, frameHeight / image.naturalHeight);
  const scale = baseScale * safeZoom;
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  const offsetX = (frameWidth - drawnWidth) * (safeX / 100);
  const offsetY = (frameHeight - drawnHeight) * (safeY / 100);
  const cropWidth = Math.min(image.naturalWidth, frameWidth / scale);
  const cropHeight = Math.min(image.naturalHeight, frameHeight / scale);
  const maxSourceX = Math.max(0, image.naturalWidth - cropWidth);
  const maxSourceY = Math.max(0, image.naturalHeight - cropHeight);
  const sourceX = Math.min(maxSourceX, Math.max(0, -offsetX / scale));
  const sourceY = Math.min(maxSourceY, Math.max(0, -offsetY / scale));
  const outputWidth = Math.max(1, frameWidth * 3);
  const outputHeight = Math.max(1, frameHeight * 3);
  const canvas = document.createElement('canvas');

  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-context-unavailable');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    0,
    0,
    outputWidth,
    outputHeight
  );

  return canvas.toDataURL('image/jpeg', 0.94);
};

const syncPortraitCropFrameRatio = () => {
  if (!portraitCropFrame) return;
  const bounds = portrait?.getBoundingClientRect?.();
  const width = Math.max(1, Math.round(bounds?.width || 234));
  const height = Math.max(1, Math.round(bounds?.height || 280));
  portraitCropFrame.style.setProperty('--crop-frame-ratio', `${width} / ${height}`);
};

const applyPortraitCropPreview = () => {
  if (!portraitCropFrame || !portraitCropImage) return;

  const safeX = clampPercent(portraitCropState?.position?.x ?? 50);
  const safeY = clampPercent(portraitCropState?.position?.y ?? 50);
  const safeZoom = clampPortraitZoom(portraitCropState?.zoom ?? 1);
  const dataUrl = portraitCropState?.dataUrl || '';

  portraitCropFrame.style.setProperty('--portrait-zoom', String(safeZoom));
  portraitCropImage.src = dataUrl;
  portraitCropImage.hidden = !dataUrl;
  portraitCropImage.style.objectPosition = `${safeX}% ${safeY}%`;
  syncCropZoomUi();
};

const createPortraitCropState = ({ dataUrl = portraitSourceDataUrl || portraitDataUrl, position = portraitPosition, zoom = portraitZoom, naturalSize = portraitNaturalSize } = {}) => ({
  dataUrl,
  position: {
    x: clampPercent(position?.x ?? 50),
    y: clampPercent(position?.y ?? 50)
  },
  zoom: clampPortraitZoom(zoom),
  naturalSize: {
    width: Math.max(0, Number(naturalSize?.width) || 0),
    height: Math.max(0, Number(naturalSize?.height) || 0)
  }
});

const closePortraitCropModal = () => {
  portraitCropModal.hidden = true;
  portraitCropDragState = null;
  portraitCropFrame?.classList.remove('is-dragging');
  document.body.classList.remove('modal-open');
};

const openPortraitCropModal = (options = {}) => {
  const nextDataUrl = options.dataUrl ?? portraitSourceDataUrl ?? portraitDataUrl;
  if (!nextDataUrl) return;

  portraitCropState = createPortraitCropState({
    dataUrl: nextDataUrl,
    position: options.position ?? (options.reset ? { x: 50, y: 50 } : portraitPosition),
    zoom: options.zoom ?? (options.reset ? 1 : portraitZoom),
    naturalSize: options.naturalSize ?? (options.reset ? { width: 0, height: 0 } : portraitNaturalSize)
  });

  syncPortraitCropFrameRatio();
  applyPortraitCropPreview();
  portraitCropModal.hidden = false;
  document.body.classList.add('modal-open');
};

const commitPortraitCrop = async () => {
  if (!portraitCropState?.dataUrl) return;

  portraitSourceDataUrl = portraitCropState.dataUrl;
  portraitPosition = { ...portraitCropState.position };
  portraitZoom = clampPortraitZoom(portraitCropState.zoom);
  portraitNaturalSize = { ...portraitCropState.naturalSize };
  portraitDataUrl = await renderPortraitCropAsset({
    dataUrl: portraitSourceDataUrl,
    position: portraitPosition,
    zoom: portraitZoom
  });
  applyPortraitImage();
  saveDraft();
};

const resetPortraitPosition = async () => {
  if (!portraitSourceDataUrl) {
    portraitPosition = { x: 50, y: 50 };
    portraitZoom = 1;
    portraitDataUrl = '';
    applyPortraitImage();
    saveDraft();
    return;
  }

  portraitPosition = { x: 50, y: 50 };
  portraitZoom = 1;
  portraitDataUrl = await renderPortraitCropAsset({
    dataUrl: portraitSourceDataUrl,
    position: portraitPosition,
    zoom: portraitZoom
  });
  applyPortraitImage();
  saveDraft();
};

const resetPortraitCropState = () => {
  if (!portraitCropState) return;
  portraitCropState.position = { x: 50, y: 50 };
  portraitCropState.zoom = 1;
  applyPortraitCropPreview();
};

const setCropPortraitZoom = (value) => {
  if (!portraitCropState) return;
  portraitCropState.zoom = clampPortraitZoom(value);
  applyPortraitCropPreview();
};

const adjustCropPortraitZoom = (delta) => {
  if (!portraitCropState) return;
  setCropPortraitZoom(portraitCropState.zoom + delta);
};

const getPortraitCropOverflow = () => {
  if (!portraitCropFrame || !portraitCropState?.naturalSize?.width || !portraitCropState?.naturalSize?.height) {
    return { overflowX: 0, overflowY: 0 };
  }

  const bounds = portraitCropFrame.getBoundingClientRect();
  const baseScale = Math.max(bounds.width / portraitCropState.naturalSize.width, bounds.height / portraitCropState.naturalSize.height);
  const scale = baseScale * clampPortraitZoom(portraitCropState.zoom);

  return {
    overflowX: Math.max(0, (portraitCropState.naturalSize.width * scale) - bounds.width),
    overflowY: Math.max(0, (portraitCropState.naturalSize.height * scale) - bounds.height)
  };
};

const startPortraitCropDrag = (event) => {
  if (!portraitCropState?.dataUrl) return;

  const pointer = event.touches?.[0] || event;
  const { overflowX, overflowY } = getPortraitCropOverflow();

  portraitCropDragState = {
    startX: pointer.clientX,
    startY: pointer.clientY,
    originX: portraitCropState.position.x,
    originY: portraitCropState.position.y,
    overflowX,
    overflowY
  };

  portraitCropFrame.classList.add('is-dragging');
};

const movePortraitCrop = (event) => {
  if (!portraitCropDragState || !portraitCropState) return;

  const pointer = event.touches?.[0] || event;
  const deltaX = pointer.clientX - portraitCropDragState.startX;
  const deltaY = pointer.clientY - portraitCropDragState.startY;

  portraitCropState.position = {
    x: portraitCropDragState.overflowX > 0 ? clampPercent(portraitCropDragState.originX - ((deltaX / portraitCropDragState.overflowX) * 100)) : 50,
    y: portraitCropDragState.overflowY > 0 ? clampPercent(portraitCropDragState.originY - ((deltaY / portraitCropDragState.overflowY) * 100)) : 50
  };

  applyPortraitCropPreview();
  if (event.cancelable) event.preventDefault();
};

const stopPortraitCropDrag = () => {
  if (!portraitCropDragState) return;
  portraitCropDragState = null;
  portraitCropFrame?.classList.remove('is-dragging');
};

const handlePortraitCropWheel = (event) => {
  if (!portraitCropState?.dataUrl) return;
  if (event.cancelable) event.preventDefault();

  const step = event.deltaY < 0 ? 0.1 : -0.1;
  adjustCropPortraitZoom(step);
};

const syncAvailableTitles = () => {
  if (!fields.title) return;

  const allowedTitles = getAllowedCardTitlesForRoles(currentUserRoles);
  const selectedTitle = normalizeCardTitle(fields.title.value);

  Array.from(fields.title.options).forEach((option) => {
    const normalized = normalizeCardTitle(option.value);
    const isAllowed = allowedTitles.includes(normalized);
    option.disabled = !isAllowed;
    option.hidden = !isAllowed;
    option.textContent = TITLE_LABELS[normalized] || option.textContent;
  });

  if (!allowedTitles.includes(selectedTitle)) {
    const fallback = allowedTitles[0] || CARD_TITLES[0];
    fields.title.value = fallback;
  }

  render();
};

const updateRerollUi = () => {
  const unlimited = hasUnlimitedStatAccess();

  if (rerollBadge) {
    rerollBadge.textContent = unlimited ? 'Rerolls infinis' : `${remainingStatRerolls}/${getRerollDisplayValueForRoles(currentUserRoles)} rerolls`;
  }

  if (rerollStatusText) {
    if (!currentUser) {
      rerollStatusText.textContent = 'Connecte-toi pour voir ton nombre de rerolls restants.';
    } else if (unlimited) {
      rerollStatusText.textContent = 'Compte privilégié : rerolls illimités et modification manuelle des stats activée.';
    } else {
      rerollStatusText.textContent = `Il te reste ${remainingStatRerolls} reroll${remainingStatRerolls > 1 ? 's' : ''} disponible${remainingStatRerolls > 1 ? 's' : ''}.`;
    }
  }

  if (rollStatsBtn) {
    rollStatsBtn.disabled = Boolean(currentUser && !unlimited && remainingStatRerolls <= 0);
  }

  if (manualStatsBox) {
    manualStatsBox.hidden = !unlimited;
  }
};

const setStats = ({ attackValue, defenseValue, syncInputs = true } = {}) => {
  attack = clampStat(attackValue);
  defense = clampStat(defenseValue);
  if (syncInputs) syncManualStatInputs();
  render();
  saveDraft();
};

const toFriendlySubmissionError = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  const messageLower = message.toLowerCase();

  if (code.includes('PERMISSION_DENIED') || messageLower.includes('permission_denied')) {
    return 'Échec de l’envoi : tu n’as pas les droits nécessaires. Contacte un admin.';
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
  output.title.textContent = TITLE_LABELS[normalizeCardTitle(fields.title.value)] || fields.title.value;
  output.average.textContent = Number.isInteger(average) ? String(average) : average.toFixed(1);
  output.abilities.textContent = fields.abilities.value;
  output.rank.textContent = rank;
  output.topType.textContent = computeType();
  output.attack.textContent = attack;
  output.defense.textContent = defense;
};

const getRandomStat = () => Math.floor(Math.random() * (MAX_STAT - MIN_STAT + 1)) + MIN_STAT;

const drawTargetRank = () => {
  const roll = Math.random();

  if (roll < 0.01) return 'Ω';
  if (roll < 0.208) return 'S';
  if (roll < 0.406) return 'A';
  if (roll < 0.604) return 'B';
  if (roll < 0.802) return 'C';
  return 'D';
};

const randomizeStats = () => {
  const targetRank = drawTargetRank();
  const targetRange = RANK_RANGES.find(({ rank }) => rank === targetRank) || RANK_RANGES[0];

  if (targetRank === 'Ω') {
    return { attackValue: MAX_STAT, defenseValue: MAX_STAT };
  }

  for (let attempt = 0; attempt < 500; attempt += 1) {
    const attackValue = getRandomStat();
    const defenseValue = getRandomStat();
    const average = (attackValue + defenseValue) / 2;

    if (average >= targetRange.minAverage && average <= targetRange.maxAverage) {
      return { attackValue, defenseValue };
    }
  }

  const fallbackAverage = Math.round((targetRange.minAverage + targetRange.maxAverage) / 2);
  return {
    attackValue: fallbackAverage,
    defenseValue: fallbackAverage
  };
};

const ensureProfileRerollCount = async (uid) => {
  const profileRef = ref(db, `profiles/${uid}`);
  const profileSnapshot = await get(profileRef);
  const profileData = profileSnapshot.exists() ? profileSnapshot.val() || {} : {};
  const profileRoles = currentUserRoles.length > 0 ? currentUserRoles : await getProfileRoles(uid);
  const normalized = normalizeRemainingStatRerolls(profileData.remainingStatRerolls, profileRoles);

  remainingStatRerolls = normalized;

  if (!profileSnapshot.exists() || profileData.remainingStatRerolls !== normalized) {
    await update(profileRef, {
      remainingStatRerolls: normalized,
      updatedAt: Date.now()
    });
  }

  updateRerollUi();
};

const consumeStoredReroll = async () => {
  if (!currentUser || hasUnlimitedStatAccess()) return true;

  const rerollRef = ref(db, `profiles/${currentUser.uid}/remainingStatRerolls`);
  const result = await runTransaction(rerollRef, (currentValue) => {
    const normalized = normalizeRemainingStatRerolls(currentValue, currentUserRoles);
    if (normalized <= 0) return;
    return normalized - 1;
  });

  if (!result.committed) return false;

  remainingStatRerolls = normalizeRemainingStatRerolls(result.snapshot.val(), currentUserRoles);
  updateRerollUi();
  return true;
};

const rollStats = async ({ consumeReroll = true } = {}) => {
  if (consumeReroll && !hasUnlimitedStatAccess()) {
    const hasReroll = await consumeStoredReroll();
    if (!hasReroll) {
      remainingStatRerolls = 0;
      updateRerollUi();
      alert('Tu n’as plus de rerolls disponibles. Si ta carte est refusée en vérification, ton compteur remontera à 3.');
      return false;
    }
  }

  setStats(randomizeStats());
  return true;
};

const refreshProfile = async (uid) => {
  const profileSnapshot = await get(ref(db, `profiles/${uid}`));
  currentNickname = profileSnapshot.exists() ? normalizeText(profileSnapshot.val().nickname || '') : '';
  remainingStatRerolls = profileSnapshot.exists()
    ? normalizeRemainingStatRerolls(profileSnapshot.val().remainingStatRerolls, currentUserRoles)
    : getRerollDisplayValueForRoles(currentUserRoles);
  updateRerollUi();
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
    cardNumber: normalizeCardNumber(record.cardNumber ?? record.cardId),
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
    return `Validée : carte ${formatCardNumber(summary.cardNumber)} · capture ${summary.rank} de ${summary.displayName} disponible dans les boosters.`;
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

const canSubmitCard = async (uid, roles) => {
  if (getMaxPendingSubmissionsForRoles(roles) === Number.POSITIVE_INFINITY) return true;
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
    name: normalizeText(fields.name.value),
    cardName: normalizeText(fields.name.value),
    rank,
    rarity: rank,
    cardCapture,
    createdAt,
    updatedAt: createdAt,
    status: 'pending'
  };
};


const bindDomReferences = () => {
  fields = {
    name: document.getElementById('name'),
    title: document.getElementById('title'),
    edition: document.getElementById('edition'),
    abilities: document.getElementById('abilities')
  };

  output = {
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

  form = document.getElementById('cardForm');
  rollStatsBtn = document.getElementById('rollStats');
  submitCardBtn = document.getElementById('submitCard');
  downloadCardBtn = document.getElementById('downloadCard');
  imageInput = document.getElementById('imageInput');
  portrait = document.getElementById('portrait');
  portraitImage = document.getElementById('portraitImage');
  resetPortraitPositionBtn = document.getElementById('resetPortraitPosition');
  openPortraitCropModalBtn = document.getElementById('openPortraitCropModal');
  portraitCropModal = document.getElementById('portraitCropModal');
  closePortraitCropModalBtn = document.getElementById('closePortraitCropModal');
  cancelPortraitCropModalBtn = document.getElementById('cancelPortraitCropModal');
  applyPortraitCropModalBtn = document.getElementById('applyPortraitCropModal');
  resetPortraitCropModalBtn = document.getElementById('resetPortraitCropModal');
  portraitCropFrame = document.getElementById('portraitCropFrame');
  portraitCropImage = document.getElementById('portraitCropImage');
  cropPortraitZoomRange = document.getElementById('cropPortraitZoomRange');
  cropZoomInPortraitBtn = document.getElementById('cropZoomInPortrait');
  cropZoomOutPortraitBtn = document.getElementById('cropZoomOutPortrait');
  cropPortraitZoomValue = document.getElementById('cropPortraitZoomValue');
  verificationStatusText = document.getElementById('verificationStatusText');
  renderEngineStatus = document.getElementById('renderEngineStatus');
  cardElement = document.getElementById('afcCard');
  rerollBadge = document.getElementById('rerollBadge');
  rerollStatusText = document.getElementById('rerollStatusText');
  manualStatsBox = document.getElementById('manualStatsBox');
  manualAttackInput = document.getElementById('manualAttack');
  manualDefenseInput = document.getElementById('manualDefense');
};

export const initCreatePage = async () => {
  bindDomReferences();
  applyPortraitImage();
  const abortController = new AbortController();
  const { signal } = abortController;

  form.addEventListener('input', () => {
    render();
    saveDraft();
  }, { signal });

  rollStatsBtn.addEventListener('click', async () => {
    await rollStats();
  }, { signal });

  manualAttackInput?.addEventListener('input', () => {
    if (!hasUnlimitedStatAccess()) return;
    setStats({
      attackValue: manualAttackInput.value,
      defenseValue: manualDefenseInput?.value ?? defense,
      syncInputs: false
    });
  }, { signal });

  manualDefenseInput?.addEventListener('input', () => {
    if (!hasUnlimitedStatAccess()) return;
    setStats({
      attackValue: manualAttackInput?.value ?? attack,
      defenseValue: manualDefenseInput.value,
      syncInputs: false
    });
  }, { signal });

  imageInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!fileLooksSupported(file)) {
      alert('Format refusé. Utilise JPG/JPEG, PNG ou WEBP.');
      event.target.value = '';
      portraitDataUrl = '';
      portraitSourceDataUrl = '';
      portraitNaturalSize = { width: 0, height: 0 };
      portraitZoom = 1;
      portraitPosition = { x: 50, y: 50 };
      applyPortraitImage();
      saveDraft();
      return;
    }

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const nextPortraitDataUrl = readerEvent.target?.result || '';
      if (!nextPortraitDataUrl) return;
      openPortraitCropModal({
        dataUrl: nextPortraitDataUrl,
        reset: true,
        naturalSize: { width: 0, height: 0 }
      });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }, { signal });

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
      window.__appRouter?.navigate?.('profile');
      return;
    }

    const selectedTitle = normalizeCardTitle(fields.title.value);
    const allowedTitles = getAllowedCardTitlesForRoles(currentUserRoles);

    if (!titleOptions.has(selectedTitle)) {
      alert('Rôle invalide.');
      return;
    }

    if (!allowedTitles.includes(selectedTitle)) {
      alert(`Ton rôle actuel ne permet pas de créer une carte "${TITLE_LABELS[selectedTitle] || selectedTitle}".`);
      return;
    }

    if (!(await canSubmitCard(currentUser.uid, currentUserRoles))) {
      alert('Compte African Army : une seule carte en attente autorisée. Attends la validation ou obtiens un rôle supérieur pour envoyer sans limite.');
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

      alert('Capture de carte envoyée en attente de vérification.');
    } catch (error) {
      console.error('Erreur lors de la soumission :', error);
      alert(toFriendlySubmissionError(error));
    } finally {
      submitCardBtn.disabled = false;
    }
  }, { signal });

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
  }, { signal });

  resetPortraitPositionBtn?.addEventListener('click', async () => {
    try {
      await resetPortraitPosition();
    } catch (error) {
      console.error('Réinitialisation du portrait impossible :', error);
      alert('Impossible de réinitialiser le cadrage pour le moment.');
    }
  }, { signal });
  openPortraitCropModalBtn?.addEventListener('click', () => {
    openPortraitCropModal();
  }, { signal });
  closePortraitCropModalBtn?.addEventListener('click', closePortraitCropModal, { signal });
  cancelPortraitCropModalBtn?.addEventListener('click', closePortraitCropModal, { signal });
  applyPortraitCropModalBtn?.addEventListener('click', async () => {
    try {
      applyPortraitCropModalBtn.disabled = true;
      await commitPortraitCrop();
      closePortraitCropModal();
    } catch (error) {
      console.error('Application du rognage impossible :', error);
      alert('Impossible d’appliquer ce cadrage pour le moment.');
    } finally {
      applyPortraitCropModalBtn.disabled = false;
    }
  }, { signal });
  resetPortraitCropModalBtn?.addEventListener('click', resetPortraitCropState, { signal });
  cropPortraitZoomRange?.addEventListener('input', (event) => {
    setCropPortraitZoom(event.target.value);
  }, { signal });
  cropZoomInPortraitBtn?.addEventListener('click', () => {
    adjustCropPortraitZoom(0.1);
  }, { signal });
  cropZoomOutPortraitBtn?.addEventListener('click', () => {
    adjustCropPortraitZoom(-0.1);
  }, { signal });

  portraitImage?.addEventListener('load', () => {
    portraitNaturalSize = {
      width: portraitImage.naturalWidth || 0,
      height: portraitImage.naturalHeight || 0
    };
    applyPortraitImage();
  }, { signal });

  portraitCropImage?.addEventListener('load', () => {
    if (!portraitCropState) return;
    portraitCropState.naturalSize = {
      width: portraitCropImage.naturalWidth || 0,
      height: portraitCropImage.naturalHeight || 0
    };
    applyPortraitCropPreview();
  }, { signal });

  portraitCropModal?.addEventListener('click', (event) => {
    if (event.target instanceof HTMLElement && event.target.hasAttribute('data-close-portrait-modal')) {
      closePortraitCropModal();
    }
  }, { signal });

  portraitCropFrame?.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    startPortraitCropDrag(event);
  }, { signal });
  portraitCropFrame?.addEventListener('wheel', handlePortraitCropWheel, { passive: false, signal });

  window.addEventListener('pointermove', movePortraitCrop, { passive: false, signal });
  window.addEventListener('pointerup', stopPortraitCropDrag, { signal });
  window.addEventListener('pointercancel', stopPortraitCropDrag, { signal });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && portraitCropModal && !portraitCropModal.hidden) {
      closePortraitCropModal();
    }
  }, { signal });
  window.addEventListener('resize', syncPortraitCropFrameRatio, { signal });

  const cleanupCommon = await initCommon({
    requireAuth: true,
    onUserChanged: async (user) => {
      currentUser = user;

      if (!user) {
        currentNickname = '';
        currentUserRoles = ['african army'];
        remainingStatRerolls = DEFAULT_STAT_REROLLS;
        verificationStatusText.textContent = 'Connecte-toi pour voir le statut de ta carte.';
        if (verificationUnsubscribe) {
          verificationUnsubscribe();
          verificationUnsubscribe = null;
        }
        syncAvailableTitles();
        updateRerollUi();
        return;
      }

      currentUserRoles = await getProfileRoles(user.uid);
      syncAvailableTitles();
      await refreshProfile(user.uid);
      watchVerificationStatus(user.uid);
      await ensureProfileRerollCount(user.uid);
      syncManualStatInputs();
      updateRerollUi();
    }
  });

  const restoredDraft = await restoreDraft();
  applyPortraitImage();

  if (!restoredDraft && !fields.abilities.value.trim()) {
    fields.abilities.value = `Cri du Raptor : Baisse la défense adverse de 10 points.

Stream Ban : Met hors combat la carte adverse. Peut être utilisé deux fois.`;
  }

  setRenderStatus('Moteur export : SVG natif prêt.', false);
  if (!restoredDraft) {
    await rollStats({ consumeReroll: false });
  }
  syncAvailableTitles();
  render();
  saveDraft();

  return () => {
    cleanupCommon?.();
    abortController.abort();
    stopPortraitCropDrag();
    if (verificationUnsubscribe) {
      verificationUnsubscribe();
      verificationUnsubscribe = null;
    }
  };
};
