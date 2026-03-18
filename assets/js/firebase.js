import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import {
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import {
  equalTo,
  get,
  getDatabase,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  remove,
  runTransaction,
  set,
  update
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

const AUTH_CACHE_KEY = 'afc-auth-cache-v3';
const DEFAULT_STAT_REROLLS = 3;
const EXTENDED_STAT_REROLLS = 10;
const DEFAULT_ROLE = 'african army';
const ROLE_PRIORITY = [
  'african army',
  'vip',
  'streamers',
  'staff afc',
  'creator',
  'admin',
  'african king'
];
const CARD_TITLES = ['viewer', 'streamer', 'responsable staff', 'gardien de l’AFC'];
const TITLE_LABELS = {
  viewer: 'Viewer',
  streamer: 'Streamer',
  'responsable staff': 'Responsable staff',
  'gardien de l’AFC': 'Gardien de l’AFC'
};
const ROLE_DEFINITIONS = {
  'african army': {
    badgeLabel: 'African Army',
    badgeClass: 'role-african-army',
    color: 'bleu',
    creationTitles: ['viewer'],
    rerolls: DEFAULT_STAT_REROLLS,
    adminAccess: false,
    validationAccess: false,
    unlimitedRerolls: false,
    unlimitedSubmissions: false
  },
  vip: {
    badgeLabel: 'VIP',
    badgeClass: 'role-vip',
    color: 'rose',
    creationTitles: ['viewer'],
    rerolls: EXTENDED_STAT_REROLLS,
    adminAccess: false,
    validationAccess: false,
    unlimitedRerolls: false,
    unlimitedSubmissions: true
  },
  streamers: {
    badgeLabel: 'Streamers',
    badgeClass: 'role-streamers',
    color: 'violet',
    creationTitles: ['streamer'],
    rerolls: EXTENDED_STAT_REROLLS,
    adminAccess: false,
    validationAccess: false,
    unlimitedRerolls: false,
    unlimitedSubmissions: true
  },
  'staff afc': {
    badgeLabel: 'Staff AFC',
    badgeClass: 'role-staff-afc',
    color: 'rouge',
    creationTitles: ['responsable staff', 'gardien de l’AFC'],
    rerolls: EXTENDED_STAT_REROLLS,
    adminAccess: false,
    validationAccess: false,
    unlimitedRerolls: false,
    unlimitedSubmissions: true
  },
  creator: {
    badgeLabel: 'Créateur',
    badgeClass: 'role-creator',
    color: 'cyan',
    creationTitles: [...CARD_TITLES],
    rerolls: Number.POSITIVE_INFINITY,
    adminAccess: false,
    validationAccess: false,
    unlimitedRerolls: true,
    unlimitedSubmissions: true
  },
  admin: {
    badgeLabel: 'Admin',
    badgeClass: 'role-admin',
    color: 'orange',
    creationTitles: [...CARD_TITLES],
    rerolls: Number.POSITIVE_INFINITY,
    adminAccess: true,
    validationAccess: true,
    unlimitedRerolls: true,
    unlimitedSubmissions: true
  },
  'african king': {
    badgeLabel: 'African King',
    badgeClass: 'role-african-king',
    color: 'rose foncé',
    creationTitles: [...CARD_TITLES],
    rerolls: Number.POSITIVE_INFINITY,
    adminAccess: true,
    validationAccess: true,
    unlimitedRerolls: true,
    unlimitedSubmissions: true
  }
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

await setPersistence(auth, browserLocalPersistence);

const getCurrentDomain = () => {
  if (typeof window === 'undefined' || !window.location?.hostname) return 'inconnu';
  return window.location.hostname;
};

const normalizeEmail = (email = '') => email.trim().toLowerCase();
const normalizeNickname = (nickname = '') => String(nickname).trim().replace(/\s+/g, ' ');
const nicknameToKey = (nickname = '') => normalizeNickname(nickname).toLowerCase();
const normalizeCardTitle = (title = '') => {
  const normalized = String(title).trim().replace(/\s+/g, ' ');
  if (!normalized) return '';

  const folded = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '’')
    .toLowerCase();

  if (folded === 'viewer') return 'viewer';
  if (folded === 'streamer' || folded === 'streamers') return 'streamer';
  if (folded === 'responsable staff') return 'responsable staff';
  if (folded === 'gardien de l’afc' || folded === 'gardien de l'afc') return 'gardien de l’AFC';
  return normalized;
};
const getRolePriority = (role = '') => {
  const index = ROLE_PRIORITY.indexOf(role);
  return index === -1 ? -1 : index;
};
const normalizeRoles = (value, legacyProfile = {}) => {
  const sourceRoles = Array.isArray(value) ? value : [];
  const next = new Set([DEFAULT_ROLE]);

  sourceRoles.forEach((role) => {
    const normalized = String(role || '').trim().toLowerCase();
    if (ROLE_DEFINITIONS[normalized]) next.add(normalized);
  });

  if (legacyProfile.admin === true) next.add('admin');
  if (legacyProfile.vip === true) next.add('vip');

  return [...next].sort((left, right) => getRolePriority(left) - getRolePriority(right));
};
const getHighestPriorityRole = (roles = []) => normalizeRoles(roles).reduce((highest, role) => {
  if (!highest) return role;
  return getRolePriority(role) > getRolePriority(highest) ? role : highest;
}, '');
const getRoleBadge = (roles = []) => {
  const highestRole = getHighestPriorityRole(roles);
  return highestRole ? { key: highestRole, ...ROLE_DEFINITIONS[highestRole] } : null;
};
const userHasRole = (roles = [], role) => normalizeRoles(roles).includes(role);
const canAccessAdmin = (roles = []) => normalizeRoles(roles).some((role) => ROLE_DEFINITIONS[role]?.adminAccess);
const canValidateCards = (roles = []) => normalizeRoles(roles).some((role) => ROLE_DEFINITIONS[role]?.validationAccess);
const hasUnlimitedStatAccessForRoles = (roles = []) => normalizeRoles(roles).some((role) => ROLE_DEFINITIONS[role]?.unlimitedRerolls);
const getAllowedCardTitlesForRoles = (roles = []) => {
  const normalizedRoles = normalizeRoles(roles);
  if (normalizedRoles.some((role) => ROLE_DEFINITIONS[role]?.creationTitles?.length === CARD_TITLES.length)) {
    return [...CARD_TITLES];
  }

  const titles = new Set();
  normalizedRoles.forEach((role) => {
    (ROLE_DEFINITIONS[role]?.creationTitles || []).forEach((title) => titles.add(title));
  });

  return CARD_TITLES.filter((title) => titles.has(title));
};
const getMaxPendingSubmissionsForRoles = (roles = []) => {
  const normalizedRoles = normalizeRoles(roles);
  return normalizedRoles.some((role) => ROLE_DEFINITIONS[role]?.unlimitedSubmissions) ? Number.POSITIVE_INFINITY : 1;
};
const getStoredRerollCapForRoles = (roles = []) => {
  const normalizedRoles = normalizeRoles(roles);
  if (normalizedRoles.some((role) => ROLE_DEFINITIONS[role]?.rerolls === EXTENDED_STAT_REROLLS)) {
    return EXTENDED_STAT_REROLLS;
  }
  return DEFAULT_STAT_REROLLS;
};
const normalizeRemainingStatRerolls = (value, roles = [DEFAULT_ROLE]) => {
  const parsed = Number.parseInt(value, 10);
  const cap = getStoredRerollCapForRoles(roles);
  if (!Number.isInteger(parsed) || parsed < 0) return cap;
  return Math.min(parsed, cap);
};
const getRerollDisplayValueForRoles = (roles = []) => {
  if (hasUnlimitedStatAccessForRoles(roles)) return Number.POSITIVE_INFINITY;
  return getStoredRerollCapForRoles(roles);
};

const loadAuthCache = () => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    console.warn('Impossible de lire le cache auth local :', error);
    return null;
  }
};

const saveAuthCache = (payload) => {
  if (typeof window === 'undefined') return;

  try {
    if (!payload) {
      window.localStorage.removeItem(AUTH_CACHE_KEY);
      return;
    }

    window.localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({
      ...payload,
      roles: normalizeRoles(payload.roles, payload),
      cachedAt: Date.now()
    }));
  } catch (error) {
    console.warn('Impossible de sauvegarder le cache auth local :', error);
  }
};

const clearAuthCache = () => saveAuthCache(null);

const toFriendlyAuthError = (error) => {
  if (!error?.code) {
    return new Error('Connexion Google impossible. Réessaie dans quelques secondes.');
  }

  if (error.code === 'auth/unauthorized-domain') {
    const domain = getCurrentDomain();
    return new Error(
      `Domaine non autorisé (${domain}). Ajoute ce domaine dans Firebase Console > Authentication > Settings > Domaines autorisés, puis réessaie.`
    );
  }

  if (error.code === 'auth/popup-closed-by-user') {
    return new Error('La fenêtre Google a été fermée avant la fin de la connexion.');
  }

  if (error.code === 'auth/network-request-failed') {
    return new Error('Erreur réseau pendant la connexion Google. Vérifie internet/VPN puis réessaie.');
  }

  return new Error(`Connexion Google impossible: ${error.message}`);
};

const performGoogleSignIn = async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    const popupBlocked = error?.code === 'auth/popup-blocked' || error?.code === 'auth/cancelled-popup-request';
    if (popupBlocked) {
      await signInWithRedirect(auth, provider);
      return;
    }

    throw toFriendlyAuthError(error);
  }
};

const consumeRedirect = async () => {
  try {
    await getRedirectResult(auth);
  } catch (error) {
    console.error('Erreur auth redirect:', error);
    throw toFriendlyAuthError(error);
  }
};

const getProfile = async (uid) => {
  if (!uid) return {};
  const snapshot = await get(ref(db, `profiles/${uid}`));
  if (!snapshot.exists()) return {};

  const profile = snapshot.val() || {};
  return {
    ...profile,
    roles: normalizeRoles(profile.roles, profile)
  };
};

const getProfileRoles = async (uid) => {
  const profile = await getProfile(uid);
  return normalizeRoles(profile.roles, profile);
};

const claimNickname = async ({ uid, nickname, previousNicknameKey = '' }) => {
  const normalizedNickname = normalizeNickname(nickname);
  const nicknameKey = nicknameToKey(normalizedNickname);
  const previousKey = String(previousNicknameKey || '').trim().toLowerCase();

  if (!uid) throw new Error('missing-uid');
  if (!nicknameKey) throw new Error('missing-nickname');

  const nicknameIndexRef = ref(db, `nicknameIndex/${nicknameKey}`);
  const result = await runTransaction(nicknameIndexRef, (currentValue) => {
    if (currentValue === null || currentValue === uid) {
      return uid;
    }
    return;
  });

  if (!result.committed) {
    throw new Error('nickname-already-taken');
  }

  if (previousKey && previousKey !== nicknameKey) {
    const previousRef = ref(db, `nicknameIndex/${previousKey}`);
    const previousSnapshot = await get(previousRef);
    if (previousSnapshot.exists() && previousSnapshot.val() === uid) {
      await remove(previousRef);
    }
  }

  return { nickname: normalizedNickname, nicknameKey };
};

const syncProfileOnLogin = async (user) => {
  if (!user?.uid) return null;

  const profileRef = ref(db, `profiles/${user.uid}`);
  const existingProfile = await getProfile(user.uid);
  const email = normalizeEmail(user.email || '');
  const nickname = normalizeNickname(existingProfile.nickname || '');
  const roles = normalizeRoles(existingProfile.roles, existingProfile);
  const timestamp = Date.now();
  let nicknameKey = nicknameToKey(nickname);

  if (nickname) {
    try {
      const claim = await claimNickname({ uid: user.uid, nickname, previousNicknameKey: existingProfile.nicknameKey || '' });
      nicknameKey = claim.nicknameKey;
    } catch (error) {
      console.warn('Impossible de synchroniser l’index du nickname :', error);
    }
  }

  const nextProfile = {
    nickname,
    nicknameKey,
    email,
    roles,
    admin: null,
    vip: null,
    remainingStatRerolls: normalizeRemainingStatRerolls(existingProfile.remainingStatRerolls, roles),
    createdAt: existingProfile.createdAt || timestamp,
    updatedAt: timestamp,
    lastLoginAt: timestamp
  };

  await update(profileRef, nextProfile);

  saveAuthCache({
    uid: user.uid,
    email,
    googleName: user.displayName || '',
    nickname,
    roles
  });

  return nextProfile;
};

const checkAdmin = async (uid) => canAccessAdmin(await getProfileRoles(uid));
const checkVip = async (uid) => userHasRole(await getProfileRoles(uid), 'vip');

const updateCachedNickname = (nickname = '') => {
  const currentCache = loadAuthCache();
  if (!currentCache) return;

  saveAuthCache({
    ...currentCache,
    nickname: normalizeNickname(nickname)
  });
};

const updateCachedRoles = (roles = []) => {
  const currentCache = loadAuthCache();
  if (!currentCache) return;

  saveAuthCache({
    ...currentCache,
    roles: normalizeRoles(roles)
  });
};

export {
  AUTH_CACHE_KEY,
  CARD_TITLES,
  DEFAULT_ROLE,
  DEFAULT_STAT_REROLLS,
  EXTENDED_STAT_REROLLS,
  ROLE_DEFINITIONS,
  TITLE_LABELS,
  app,
  auth,
  canAccessAdmin,
  canValidateCards,
  checkAdmin,
  checkVip,
  claimNickname,
  clearAuthCache,
  consumeRedirect,
  db,
  equalTo,
  get,
  getAllowedCardTitlesForRoles,
  getMaxPendingSubmissionsForRoles,
  getProfile,
  getProfileRoles,
  getRerollDisplayValueForRoles,
  getRoleBadge,
  hasUnlimitedStatAccessForRoles,
  initializeApp,
  loadAuthCache,
  nicknameToKey,
  normalizeCardTitle,
  normalizeEmail,
  normalizeNickname,
  normalizeRemainingStatRerolls,
  normalizeRoles,
  onAuthStateChanged,
  onValue,
  orderByChild,
  performGoogleSignIn,
  provider,
  push,
  query,
  ref,
  remove,
  runTransaction,
  saveAuthCache,
  set,
  signOut,
  syncProfileOnLogin,
  update,
  updateCachedNickname,
  updateCachedRoles,
  userHasRole
};
