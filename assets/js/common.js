import { auth, checkAdmin, consumeRedirect, onAuthStateChanged, performGoogleSignIn, signOut, syncProfileOnLogin } from './firebase.js';

const authStatus = document.getElementById('authStatus');
const googleLoginBtn = document.getElementById('googleLogin');
const logoutBtn = document.getElementById('logout');
const adminNavLinks = Array.from(document.querySelectorAll('[data-admin-link="true"]'));

const toggleAdminNav = (visible) => {
  adminNavLinks.forEach((link) => {
    link.hidden = !visible;
  });
};

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
    if (user) {
      await syncProfileOnLogin(user);
    }

    let canAccessAdmin = false;
    if (user) {
      canAccessAdmin = await checkAdmin(user.uid, user.email || '');
    }
    toggleAdminNav(canAccessAdmin);

    if (authStatus) {
      authStatus.textContent = user ? user.displayName || user.email : 'Non connecté';
    }

    if (onUserChanged) {
      await onUserChanged(user);
    }
  });
};

export { initCommon };
