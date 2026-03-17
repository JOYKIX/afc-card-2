import { auth, consumeRedirect, onAuthStateChanged, performGoogleSignIn, signOut } from './firebase.js';

const authStatus = document.getElementById('authStatus');
const googleLoginBtn = document.getElementById('googleLogin');
const logoutBtn = document.getElementById('logout');

const initCommon = async ({ onUserChanged } = {}) => {
  await consumeRedirect();

  googleLoginBtn?.addEventListener('click', async () => {
    try {
      await performGoogleSignIn();
    } catch (error) {
      alert(`Connexion Google impossible: ${error.message}`);
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    await signOut(auth);
  });

  onAuthStateChanged(auth, async (user) => {
    if (authStatus) {
      authStatus.textContent = user ? user.displayName || user.email : 'Non connecté';
    }

    if (onUserChanged) {
      await onUserChanged(user);
    }
  });
};

export { initCommon };
