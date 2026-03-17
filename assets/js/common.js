import { auth, checkAdmin, checkVip, consumeRedirect, onAuthStateChanged, performGoogleSignIn, signOut, syncProfileOnLogin } from './firebase.js';

const authStatus = document.getElementById('authStatus');
const googleLoginBtn = document.getElementById('googleLogin');
const logoutBtn = document.getElementById('logout');
const adminNavLinks = Array.from(document.querySelectorAll('[data-admin-link="true"]'));

const roleBadge = document.createElement('span');
roleBadge.id = 'userRoleBadge';
roleBadge.className = 'role-badge';
roleBadge.hidden = true;
authStatus?.insertAdjacentElement('afterend', roleBadge);

const toggleAdminNav = (visible) => {
  adminNavLinks.forEach((link) => {
    link.hidden = !visible;
  });
};

const setAuthUi = (user, { isAdmin = false, isVip = false } = {}) => {
  if (authStatus) authStatus.textContent = user ? user.displayName || user.email : 'Non connecté';
  if (logoutBtn) logoutBtn.disabled = !user;

  if (!user) {
    roleBadge.hidden = true;
    roleBadge.textContent = '';
    roleBadge.className = 'role-badge';
    return;
  }

  if (isAdmin) {
    roleBadge.hidden = false;
    roleBadge.textContent = 'ADMIN';
    roleBadge.className = 'role-badge role-admin';
    return;
  }

  if (isVip) {
    roleBadge.hidden = false;
    roleBadge.textContent = 'VIP';
    roleBadge.className = 'role-badge role-vip';
    return;
  }

  roleBadge.hidden = true;
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
    const canAccessVip = user ? await checkVip(user.uid, user.email || '') : false;
    toggleAdminNav(canAccessAdmin);
    setAuthUi(user, { isAdmin: canAccessAdmin, isVip: canAccessVip });

    if (onUserChanged) await onUserChanged(user);
  });
};

export { initCommon };
