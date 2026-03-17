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

const normalizeEmail = (email = '') => email.trim().toLowerCase();
const emailToKey = (email = '') => normalizeEmail(email).replaceAll('.', ',');

const ensureDefaultAdminRegistry = async () => {
  const defaultAdminEmail = 'afc.cardgame@gmail.com';
  await set(ref(db, `adminRegistry/${emailToKey(defaultAdminEmail)}`), true);
};

const ensureDefaultVipRegistry = async () => {
  const defaultVipEmail = 'duveaubenoit@gmail.com';
  const emailKey = emailToKey(defaultVipEmail);
  await set(ref(db, `vipRegistry/${emailKey}`), true);
  await set(ref(db, `vipRegistery/${emailKey}`), true);
};

const checkAdmin = async (uid, email = '') => {
  const uidSnap = await get(ref(db, `admins/${uid}`));
  if (uidSnap.val() === true) return true;

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;

  const emailSnap = await get(ref(db, `adminRegistry/${emailToKey(normalizedEmail)}`));
  return emailSnap.val() === true;
};

const checkVip = async (uid, email = '') => {
  const uidSnap = await get(ref(db, `vips/${uid}`));
  if (uidSnap.val() === true) return true;

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;

  const emailKey = emailToKey(normalizedEmail);
  const emailSnap = await get(ref(db, `vipRegistry/${emailKey}`));
  if (emailSnap.val() === true) return true;

  const legacyEmailSnap = await get(ref(db, `vipRegistery/${emailKey}`));
  return legacyEmailSnap.val() === true;
};

const syncProfileOnLogin = async (user) => {
  if (!user?.uid) return;

  const profileRef = ref(db, `profiles/${user.uid}`);
  const profileSnapshot = await get(profileRef);
  const email = normalizeEmail(user.email || '');
  await ensureDefaultAdminRegistry();
  await ensureDefaultVipRegistry();
  const isAdmin = await checkAdmin(user.uid, email);
  const isVip = await checkVip(user.uid, email);
  const timestamp = Date.now();

  if (!profileSnapshot.exists()) {
    await set(profileRef, {
      nickname: '',
      email,
      admin: isAdmin,
      vip: isVip,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastLoginAt: timestamp
    });
    return;
  }

  await update(profileRef, {
    email,
    admin: isAdmin,
    vip: isVip,
    updatedAt: timestamp,
    lastLoginAt: timestamp
  });
};

export {
  auth,
  checkAdmin,
  checkVip,
  consumeRedirect,
  db,
  equalTo,
  get,
  onAuthStateChanged,
  onValue,
  orderByChild,
  performGoogleSignIn,
  push,
  query,
  ref,
  set,
  syncProfileOnLogin,
  signOut,
  update
};
