import { auth, consumeRedirect, onAuthStateChanged, performGoogleSignIn, signOut } from './firebase.js';

const authStatus = document.getElementById('authStatus');
const googleLoginBtn = document.getElementById('googleLogin');
const logoutBtn = document.getElementById('logout');

const initCommon = async ({ onUserChanged } = {}) => {
  try {
    await consumeRedirect();
  } catch (error) {
    alert(error.message);
  }

  googleLoginBtn?.addEventListener('click', async () => {
    googleLoginBtn.disabled = true;
    try {
      await performGoogleSignIn();
    } catch (error) {
      alert(error.message);
    } finally {
      googleLoginBtn.disabled = false;
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
