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

const state = {
  shellBound: false,
  shellController: null,
  redirectPromise: null,
  authUnsubscribe: null,
  authReady: false,
  currentUser: null,
  currentContext: null,
  currentHandler: null,
  currentRequireAuth: false,
  currentHandlerToken: null
};

const getShellElements = () => {
  const authStatus = document.getElementById('authStatus');
  const googleLoginBtn = document.getElementById('googleLogin');
  const logoutBtn = document.getElementById('logout');
  const profileLink = document.getElementById('profileLink');
  const authActions = authStatus?.closest('.auth-actions') || authStatus?.parentElement || null;
  const adminNavLinks = Array.from(document.querySelectorAll('[data-admin-link="true"]'));

  let roleBadge = document.getElementById('userRoleBadge');
  if (!roleBadge && authStatus) {
    roleBadge = document.createElement('span');
    roleBadge.id = 'userRoleBadge';
    roleBadge.className = 'role-badge';
    roleBadge.hidden = true;
    authStatus.insertAdjacentElement('afterend', roleBadge);
  }

  let authNotice = document.getElementById('authNotice');
  if (!authNotice && authActions) {
    authNotice = document.createElement('p');
    authNotice.id = 'authNotice';
    authNotice.className = 'auth-notice';
    authNotice.hidden = true;
    authActions.appendChild(authNotice);
  }

  return {
    adminNavLinks,
    authActions,
    authNotice,
    authStatus,
    googleLoginBtn,
    logoutBtn,
    profileLink,
    roleBadge
  };
};

const getDisplayIdentity = (session = {}) => normalizeNickname(session.nickname || '') || session.googleName || session.email || 'Non connecté';

const navigateTo = (target, { replace = false } = {}) => {
  if (typeof window === 'undefined') return;

  if (window.__appRouter?.navigate) {
    window.__appRouter.navigate(target, { replace });
    return;
  }

  if (replace) {
    window.location.replace(target);
    return;
  }

  window.location.href = target;
};

const setAuthNotice = (message = '', level = 'info') => {
  const { authNotice } = getShellElements();
  if (!authNotice) return;

  const normalizedMessage = String(message || '').trim();
  authNotice.hidden = !normalizedMessage;
  authNotice.textContent = normalizedMessage;
  authNotice.dataset.level = normalizedMessage ? level : '';
};

const toggleAdminNav = (visible) => {
  const { adminNavLinks } = getShellElements();
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
  const {
    authStatus,
    googleLoginBtn,
    logoutBtn,
    profileLink,
    roleBadge
  } = getShellElements();

  const isConnected = Boolean(session);

  if (authStatus) authStatus.textContent = isConnected ? getDisplayIdentity(session) : 'Non connecté';
  setButtonVisibility(googleLoginBtn, !isConnected);
  setButtonVisibility(logoutBtn, isConnected);
  setButtonVisibility(profileLink, isConnected);

  if (!roleBadge) return;

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

const getCurrentPage = () => {
  if (typeof window === 'undefined') return 'creator.html';
  return window.location.pathname.split('/').pop() || 'creator.html';
};

const redirectToLogin = () => {
  if (typeof window === 'undefined') return;

  const currentPage = getCurrentPage();
  if (currentPage === 'index.html' || currentPage === 'login.html') return;

  const next = `${currentPage}${window.location.search || ''}${window.location.hash || ''}`;
  navigateTo(`index.html?next=${encodeURIComponent(next)}`);
};

const getRedirectTarget = () => {
  if (typeof window === 'undefined') return 'creator.html';

  const params = new URLSearchParams(window.location.search);
  const next = params.get('next') || 'creator.html';
  return (next.includes('index.html') || next.includes('login.html')) ? 'creator.html' : next;
};

const redirectAfterLogin = () => {
  navigateTo(getRedirectTarget(), { replace: true });
};

const notifyCurrentHandler = async () => {
  if (!state.currentHandler) {
    if (!state.currentUser && state.currentRequireAuth) redirectToLogin();
    return;
  }

  await state.currentHandler(state.currentUser, state.currentContext);

  if (!state.currentUser && state.currentRequireAuth) {
    redirectToLogin();
  }
};

const syncUserSession = async (user) => {
  const runtimeState = getAuthRuntimeState();

  if (!user) {
    clearAuthCache();
    toggleAdminNav(false);
    setAuthUi(null);
    setAuthNotice(runtimeState.notice || '', runtimeState.level);
    state.currentUser = null;
    state.currentContext = null;
    await notifyCurrentHandler();
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

    state.currentUser = user;
    state.currentContext = {
      profile: { ...profile, roles },
      redirectAfterLogin,
      redirectToLogin,
      session
    };
    await notifyCurrentHandler();
  } catch (error) {
    console.error('Erreur de synchronisation de session :', error);
    clearAuthCache();
    toggleAdminNav(false);
    setAuthUi(null);
    setAuthNotice('Connexion Google établie, mais la synchronisation Firebase a échoué. Vérifie la connexion réseau puis recharge la page.', 'error');

    state.currentUser = user;
    state.currentContext = {
      profile: null,
      redirectAfterLogin,
      redirectToLogin,
      session: null
    };
    await notifyCurrentHandler();
  }
};

const ensureAuthBootstrap = async () => {
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
    toggleAdminNav(false);
    setAuthUi(null);
  }

  if (!state.redirectPromise) {
    state.redirectPromise = consumeRedirect().catch((error) => {
      setAuthNotice(error.message, 'error');
      alert(error.message);
    });
  }

  await state.redirectPromise;

  if (!state.authUnsubscribe) {
    state.authUnsubscribe = onAuthStateChanged(auth, async (user) => {
      state.authReady = true;
      await syncUserSession(user);
    });
  }
};

const bindShellActions = () => {
  if (state.shellBound) return;

  state.shellController = new AbortController();
  const { signal } = state.shellController;
  state.shellBound = true;

  document.addEventListener('click', async (event) => {
    const loginButton = event.target.closest('#googleLogin');
    if (loginButton) {
      loginButton.disabled = true;
      try {
        await performGoogleSignIn();
      } catch (error) {
        setAuthNotice(error.message, 'error');
        alert(error.message);
      } finally {
        if (!loginButton.hidden) loginButton.disabled = false;
      }
      return;
    }

    const logoutButton = event.target.closest('#logout');
    if (logoutButton) {
      if (!auth.currentUser) return;

      try {
        await signOut(auth);
        clearAuthCache();
        const runtimeState = getAuthRuntimeState();
        setAuthNotice(runtimeState.notice || '', runtimeState.level);
      } catch (error) {
        setAuthNotice('Impossible de fermer la session pour le moment.', 'error');
        console.error('Erreur de déconnexion :', error);
      }
    }
  }, { signal });
};

const initCommon = async ({ onUserChanged, requireAuth = false } = {}) => {
  bindShellActions();
  state.currentHandler = onUserChanged || null;
  state.currentRequireAuth = requireAuth;
  const handlerToken = Symbol('page-handler');
  state.currentHandlerToken = handlerToken;

  await ensureAuthBootstrap();

  if (state.authReady) {
    await notifyCurrentHandler();
  }

  return () => {
    if (state.currentHandlerToken !== handlerToken) return;
    state.currentHandler = null;
    state.currentRequireAuth = false;
    state.currentHandlerToken = null;
  };
};

export { getRedirectTarget, initCommon, navigateTo, redirectAfterLogin, redirectToLogin };
