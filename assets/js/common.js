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

const setAuthUi = (user) => {
  if (authStatus) authStatus.textContent = user ? user.displayName || user.email : 'Non connecté';
  if (logoutBtn) logoutBtn.disabled = !user;
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
    if (!auth.currentUser) return;
    await signOut(auth);
  });

  onAuthStateChanged(auth, async (user) => {
    if (user) await syncProfileOnLogin(user);

    const canAccessAdmin = user ? await checkAdmin(user.uid, user.email || '') : false;
    toggleAdminNav(canAccessAdmin);
    setAuthUi(user);

    if (onUserChanged) await onUserChanged(user);
  });
};

export { initCommon };
