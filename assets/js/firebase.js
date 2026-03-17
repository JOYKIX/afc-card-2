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

const performGoogleSignIn = async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    const popupBlocked = error?.code === 'auth/popup-blocked' || error?.code === 'auth/cancelled-popup-request';
    if (popupBlocked) {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw error;
  }
};

const consumeRedirect = async () => {
  try {
    await getRedirectResult(auth);
  } catch (error) {
    console.error('Erreur auth redirect:', error);
  }
};

const checkAdmin = async (uid) => {
  const snap = await get(ref(db, `admins/${uid}`));
  return snap.val() === true;
};

export {
  auth,
  checkAdmin,
  consumeRedirect,
  db,
  equalTo,
  get,
  onAuthStateChanged,
  orderByChild,
  performGoogleSignIn,
  push,
  query,
  ref,
  set,
  signOut,
  update
};
