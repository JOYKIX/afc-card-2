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

const AUTH_CACHE_KEY = 'afc-auth-cache-v2';
const DEFAULT_STAT_REROLLS = 3;

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
const normalizeRemainingStatRerolls = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) return DEFAULT_STAT_REROLLS;
  return Math.min(parsed, DEFAULT_STAT_REROLLS);
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
  return snapshot.exists() ? snapshot.val() || {} : {};
};

const checkAdmin = async (uid) => {
  const profile = await getProfile(uid);
  return profile.admin === true;
};

const checkVip = async (uid) => {
  const profile = await getProfile(uid);
  return profile.vip === true;
};

const syncProfileOnLogin = async (user) => {
  if (!user?.uid) return null;

  const profileRef = ref(db, `profiles/${user.uid}`);
  const existingProfile = await getProfile(user.uid);
  const email = normalizeEmail(user.email || '');
  const nickname = normalizeNickname(existingProfile.nickname || '');
  const timestamp = Date.now();
  const isAdmin = existingProfile.admin === true;
  const isVip = existingProfile.vip === true;

  const nextProfile = {
    nickname,
    nicknameKey: nicknameToKey(nickname),
    email,
    admin: isAdmin,
    vip: isVip,
    remainingStatRerolls: normalizeRemainingStatRerolls(existingProfile.remainingStatRerolls),
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
    isAdmin,
    isVip
  });

  return nextProfile;
};

const updateCachedNickname = (nickname = '') => {
  const currentCache = loadAuthCache();
  if (!currentCache) return;

  saveAuthCache({
    ...currentCache,
    nickname: normalizeNickname(nickname)
  });
};

const updateCachedRoles = ({ isAdmin, isVip } = {}) => {
  const currentCache = loadAuthCache();
  if (!currentCache) return;

  saveAuthCache({
    ...currentCache,
    isAdmin: typeof isAdmin === 'boolean' ? isAdmin : currentCache.isAdmin,
    isVip: typeof isVip === 'boolean' ? isVip : currentCache.isVip
  });
};

export {
  AUTH_CACHE_KEY,
  DEFAULT_STAT_REROLLS,
  auth,
  checkAdmin,
  checkVip,
  clearAuthCache,
  consumeRedirect,
  db,
  equalTo,
  get,
  loadAuthCache,
  nicknameToKey,
  normalizeEmail,
  normalizeNickname,
  normalizeRemainingStatRerolls,
  onAuthStateChanged,
  onValue,
  orderByChild,
  performGoogleSignIn,
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
  updateCachedRoles
};
