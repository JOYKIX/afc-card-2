import {
  auth,
  canAccessAdmin,
  clearAuthCache,
  consumeRedirect,
  getAuthRuntimeState,
  getRoleBadge,
  loadAuthCache,
  normalizeNickname,
  normalizeRoles,
  onAuthStateChanged,
  performGoogleSignIn,
  saveAuthCache,
  signOut,
  syncProfileOnLogin
} from './firebase.js';

const authStatus = document.getElementById('authStatus');
const googleLoginBtn = document.getElementById('googleLogin');
const logoutBtn = document.getElementById('logout');
const profileLink = document.getElementById('profileLink');
const adminNavLinks = Array.from(document.querySelectorAll('[data-admin-link="true"]'));

const roleBadge = document.createElement('span');
roleBadge.id = 'userRoleBadge';
roleBadge.className = 'role-badge';
roleBadge.hidden = true;
authStatus?.insertAdjacentElement('afterend', roleBadge);

const authNotice = document.createElement('p');
authNotice.id = 'authNotice';
authNotice.className = 'auth-notice';
authNotice.hidden = true;
(authStatus?.closest('.auth-actions') || authStatus?.parentElement)?.appendChild(authNotice);

const getDisplayIdentity = (session = {}) => normalizeNickname(session.nickname || '') || session.googleName || session.email || 'Non connecté';

const setAuthNotice = (message = '', level = 'info') => {
  if (!authNotice) return;

  const normalizedMessage = String(message || '').trim();
  authNotice.hidden = !normalizedMessage;
  authNotice.textContent = normalizedMessage;
  authNotice.dataset.level = normalizedMessage ? level : '';
};

const toggleAdminNav = (visible) => {
  adminNavLinks.forEach((link) => {
    link.hidden = !visible;
  });
};

const setButtonVisibility = (element, visible) => {
  if (!element) return;
  element.hidden = !visible;
  if ('disabled' in element) element.disabled = !visible;
};

const setAuthUi = (session = null) => {
  const isConnected = Boolean(session);

  if (authStatus) authStatus.textContent = isConnected ? getDisplayIdentity(session) : 'Non connecté';
  setButtonVisibility(googleLoginBtn, !isConnected);
  setButtonVisibility(logoutBtn, isConnected);
  setButtonVisibility(profileLink, isConnected);

  if (!isConnected) {
    roleBadge.hidden = true;
    roleBadge.textContent = '';
    roleBadge.className = 'role-badge';
    return;
  }

  const badge = getRoleBadge(session.roles || []);
  if (!badge) {
    roleBadge.hidden = true;
    roleBadge.textContent = '';
    roleBadge.className = 'role-badge';
    return;
  }

  roleBadge.hidden = false;
  roleBadge.textContent = badge.badgeLabel;
  roleBadge.className = `role-badge ${badge.badgeClass}`;
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
  const runtimeState = getAuthRuntimeState();
  if (runtimeState.notice) {
    setAuthNotice(runtimeState.notice, runtimeState.level);
  }

  const cachedSession = loadAuthCache();
  if (cachedSession) {
    const cachedRoles = normalizeRoles(cachedSession.roles, cachedSession);
    toggleAdminNav(canAccessAdmin(cachedRoles));
    setAuthUi({ ...cachedSession, roles: cachedRoles });
  } else {
    setAuthUi(null);
  }

  try {
    await consumeRedirect();
  } catch (error) {
    setAuthNotice(error.message, 'error');
    alert(error.message);
  }

  googleLoginBtn?.addEventListener('click', async () => {
    googleLoginBtn.disabled = true;
    try {
      await performGoogleSignIn();
    } catch (error) {
      setAuthNotice(error.message, 'error');
      alert(error.message);
    } finally {
      if (!googleLoginBtn.hidden) googleLoginBtn.disabled = false;
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    if (!auth.currentUser) return;

    try {
      await signOut(auth);
      clearAuthCache();
      setAuthNotice(runtimeState.notice || '', runtimeState.level);
    } catch (error) {
      setAuthNotice('Impossible de fermer la session pour le moment.', 'error');
      console.error('Erreur de déconnexion :', error);
    }
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

    try {
      const profile = await syncProfileOnLogin(user);
      const nickname = normalizeNickname(profile?.nickname || '');
      const roles = normalizeRoles(profile?.roles || []);
      const session = {
        uid: user.uid,
        email: (user.email || '').trim().toLowerCase(),
        googleName: user.displayName || '',
        nickname,
        roles
      };

      saveAuthCache(session);
      toggleAdminNav(canAccessAdmin(roles));
      setAuthUi(session);
      setAuthNotice(runtimeState.notice || '', runtimeState.level);

      if (onUserChanged) {
        await onUserChanged(user, {
          profile: { ...profile, roles },
          session,
          redirectAfterLogin,
          redirectToLogin
        });
      }
    } catch (error) {
      console.error('Erreur de synchronisation de session :', error);
      clearAuthCache();
      toggleAdminNav(false);
      setAuthUi(null);
      setAuthNotice('Connexion Google établie, mais la synchronisation Firebase a échoué. Vérifie la connexion réseau puis recharge la page.', 'error');

      if (onUserChanged) {
        await onUserChanged(user, {
          profile: null,
          session: null,
          redirectAfterLogin,
          redirectToLogin
        });
      }
    }
  });
};

export { getRedirectTarget, initCommon, redirectAfterLogin, redirectToLogin };
