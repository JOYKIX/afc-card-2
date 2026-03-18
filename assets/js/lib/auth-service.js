import { checkAuthFast, clearAuthCache, loadAuthCache, saveAuthCache } from './auth-cache.js';
import { DEPLOYED_HOSTS } from './firebase-config.js';
import { auth, authRuntimeState, db, provider } from './firebase-core.js';
import { nicknameToKey, normalizeEmail, normalizeNickname } from './format.js';
import { canAccessAdmin, normalizeRemainingStatRerolls, normalizeRoles, userHasRole } from './roles.js';
import {
  browserSessionPersistence,
  get,
  getRedirectResult,
  inMemoryPersistence,
  onAuthStateChanged,
  ref,
  remove,
  runTransaction,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  update
} from './firebase-sdk.js';

const getCurrentOrigin = () => {
  if (typeof window === 'undefined' || !window.location?.origin) return 'origine inconnue';
  return window.location.origin;
};

const getCurrentDomain = () => {
  if (typeof window === 'undefined' || !window.location?.hostname) return 'inconnu';
  return window.location.hostname;
};

const configureAuthPersistence = async () => {
  const persistenceOptions = [
    {
      mode: 'session',
      label: 'session limitée à cet onglet',
      persistence: browserSessionPersistence
    },
    {
      mode: 'memory',
      label: 'session temporaire jusqu’au rechargement',
      persistence: inMemoryPersistence
    }
  ];

  for (const option of persistenceOptions) {
    try {
      await setPersistence(auth, option.persistence);
      authRuntimeState.persistence = option.mode;
      authRuntimeState.level = option.mode === 'session' ? 'info' : 'warning';
      authRuntimeState.notice = option.mode === 'session'
        ? ''
        : `Le navigateur limite la session Firebase : ${option.label}.`;
      return;
    } catch (error) {
      console.warn(`Persistence auth indisponible (${option.mode}) :`, error);
    }
  }

  authRuntimeState.persistence = 'unknown';
  authRuntimeState.level = 'error';
  authRuntimeState.notice = 'Impossible d’initialiser une session Firebase fiable dans ce navigateur.';
};

await configureAuthPersistence();

const getAuthRuntimeState = () => ({ ...authRuntimeState });

const toFriendlyAuthError = (error) => {
  if (!error?.code) {
    return new Error('Connexion Google impossible. Réessaie dans quelques secondes.');
  }

  if (error.code === 'auth/operation-not-supported-in-this-environment') {
    return new Error('Connexion Google impossible dans ce navigateur/contexte. Active les cookies, désactive le mode navigation privée strict ou change de navigateur.');
  }

  if (error.code === 'auth/web-storage-unsupported') {
    return new Error('Le navigateur bloque le stockage requis par Firebase. Autorise les cookies/localStorage puis recharge la page.');
  }

  if (error.code === 'auth/unauthorized-domain') {
    const domain = getCurrentDomain();
    const origin = getCurrentOrigin();
    return new Error(
      `Domaine non autorisé (${domain}) pour l’origine ${origin}. Autorise ${DEPLOYED_HOSTS.join(', ')} dans Firebase Console > Authentication > Settings > Domaines autorisés, puis réessaie.`
    );
  }

  if (error.code === 'auth/popup-closed-by-user') {
    return new Error('La fenêtre Google a été fermée avant la fin de la connexion.');
  }

  if (error.code === 'auth/network-request-failed') {
    return new Error('Erreur réseau pendant la connexion Google. Vérifie internet/VPN puis réessaie.');
  }

  if (error.code === 'auth/too-many-requests') {
    return new Error('Trop de tentatives de connexion ont été détectées. Patiente quelques minutes puis réessaie.');
  }

  return new Error(`Connexion Google impossible: ${error.message}`);
};

const isAllowedAuthHost = (hostname = '') => DEPLOYED_HOSTS.includes(hostname);

const performGoogleSignIn = async () => {
  if (typeof window !== 'undefined') {
    const hostname = window.location?.hostname || '';
    const protocol = window.location?.protocol || '';

    if (protocol === 'file:' || !isAllowedAuthHost(hostname)) {
      throw new Error(`La connexion Google est disponible uniquement sur ${DEPLOYED_HOSTS.map((host) => `https://${host}`).join(' ou ')}.`);
    }
  }

  try {
    return await signInWithPopup(auth, provider);
  } catch (error) {
    const popupBlocked = error?.code === 'auth/popup-blocked' || error?.code === 'auth/cancelled-popup-request';
    if (popupBlocked) {
      try {
        await signInWithRedirect(auth, provider);
        return null;
      } catch (redirectError) {
        throw toFriendlyAuthError(redirectError);
      }
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
    return undefined;
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

const getFirebaseTokenSnapshot = async (user) => {
  if (!user?.getIdTokenResult) {
    return { token: '', tokenExpiresAt: 0 };
  }

  try {
    const tokenResult = await user.getIdTokenResult();
    const tokenExpiresAt = Date.parse(tokenResult?.expirationTime || '');
    return {
      token: tokenResult?.token || '',
      tokenExpiresAt: Number.isFinite(tokenExpiresAt) ? tokenExpiresAt : 0
    };
  } catch (error) {
    console.warn('Impossible de récupérer le token Firebase en cache :', error);
    return { token: '', tokenExpiresAt: 0 };
  }
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

  const tokenSnapshot = await getFirebaseTokenSnapshot(user);

  saveAuthCache({
    uid: user.uid,
    email,
    googleName: user.displayName || '',
    nickname,
    photoURL: user.photoURL || '',
    roles,
    token: tokenSnapshot.token,
    tokenExpiresAt: tokenSnapshot.tokenExpiresAt
  });

  return nextProfile;
};

const checkAdmin = async (uid) => canAccessAdmin(await getProfileRoles(uid));
const checkVip = async (uid) => userHasRole(await getProfileRoles(uid), 'vip');

export {
  auth,
  checkAdmin,
  checkVip,
  claimNickname,
  clearAuthCache,
  consumeRedirect,
  db,
  getAuthRuntimeState,
  getProfile,
  getProfileRoles,
  checkAuthFast,
  loadAuthCache,
  onAuthStateChanged,
  performGoogleSignIn,
  provider,
  saveAuthCache,
  syncProfileOnLogin
};
