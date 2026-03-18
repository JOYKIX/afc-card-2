import {
  auth,
  checkAdmin,
  checkVip,
  clearAuthCache,
  consumeRedirect,
  loadAuthCache,
  normalizeNickname,
  onAuthStateChanged,
  performGoogleSignIn,
  saveAuthCache,
  signOut,
  syncProfileOnLogin
} from './firebase.js';

const authStatus = document.getElementById('authStatus');
const googleLoginBtn = document.getElementById('googleLogin');
const logoutBtn = document.getElementById('logout');
const adminNavLinks = Array.from(document.querySelectorAll('[data-admin-link="true"]'));

const roleBadge = document.createElement('span');
roleBadge.id = 'userRoleBadge';
roleBadge.className = 'role-badge';
roleBadge.hidden = true;
authStatus?.insertAdjacentElement('afterend', roleBadge);

const getDisplayIdentity = (session = {}) => normalizeNickname(session.nickname || '') || session.googleName || session.email || 'Non connecté';

const toggleAdminNav = (visible) => {
  adminNavLinks.forEach((link) => {
    link.hidden = !visible;
  });
};

const setAuthUi = (session = null) => {
  if (authStatus) authStatus.textContent = session ? getDisplayIdentity(session) : 'Non connecté';
  if (logoutBtn) logoutBtn.disabled = !session;

  if (!session) {
    roleBadge.hidden = true;
    roleBadge.textContent = '';
    roleBadge.className = 'role-badge';
    return;
  }

  if (session.isAdmin) {
    roleBadge.hidden = false;
    roleBadge.textContent = 'ADMIN';
    roleBadge.className = 'role-badge role-admin';
    return;
  }

  if (session.isVip) {
    roleBadge.hidden = false;
    roleBadge.textContent = 'VIP';
    roleBadge.className = 'role-badge role-vip';
    return;
  }

  roleBadge.hidden = true;
};

const redirectToLogin = () => {
  if (typeof window === 'undefined') return;

  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  if (currentPage === 'login.html') return;

  const next = `${currentPage}${window.location.search || ''}${window.location.hash || ''}`;
  window.location.href = `login.html?next=${encodeURIComponent(next)}`;
};

const getRedirectTarget = () => {
  if (typeof window === 'undefined') return 'index.html';

  const params = new URLSearchParams(window.location.search);
  const next = params.get('next') || 'index.html';
  return next.includes('login.html') ? 'index.html' : next;
};

const redirectAfterLogin = () => {
  if (typeof window === 'undefined') return;
  window.location.href = getRedirectTarget();
};

const initCommon = async ({ onUserChanged, requireAuth = false } = {}) => {
  const cachedSession = loadAuthCache();
  if (cachedSession) {
    toggleAdminNav(Boolean(cachedSession.isAdmin));
    setAuthUi(cachedSession);
  }

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
    clearAuthCache();
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      clearAuthCache();
      toggleAdminNav(false);
      setAuthUi(null);

      if (onUserChanged) await onUserChanged(null, null);
      if (requireAuth) redirectToLogin();
      return;
    }

    const profile = await syncProfileOnLogin(user);
    const nickname = normalizeNickname(profile?.nickname || '');
    const isAdmin = await checkAdmin(user.uid);
    const isVip = await checkVip(user.uid);
    const session = {
      uid: user.uid,
      email: (user.email || '').trim().toLowerCase(),
      googleName: user.displayName || '',
      nickname,
      isAdmin,
      isVip
    };

    saveAuthCache(session);
    toggleAdminNav(isAdmin);
    setAuthUi(session);

    if (onUserChanged) {
      await onUserChanged(user, {
        profile,
        session,
        redirectAfterLogin,
        redirectToLogin
      });
    }
  });
};

export { getRedirectTarget, initCommon, redirectAfterLogin, redirectToLogin };
