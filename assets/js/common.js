import {
  auth,
  canAccessAdmin,
  checkAuthFast,
  clearAuthCache,
  consumeRedirect,
  getAuthRuntimeState,
  getRoleBadge,
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
  bootstrapPromise: null,
  currentUser: null,
  currentContext: null,
  currentHandler: null,
  currentRequireAuth: false,
  currentHandlerToken: null
};

const emitAuthChanged = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('afc-auth-changed'));
};

const getShellElements = () => {
  const authStatus = document.getElementById('authStatus');
  const googleLoginBtn = document.getElementById('googleLogin');
  const logoutBtn = document.getElementById('logout');
  const authMenu = document.querySelector('[data-auth-menu]');
  const authMenuTrigger = document.getElementById('authMenuTrigger');
  const authMenuPanel = document.getElementById('authMenuPanel');
  const authActions = authStatus?.closest('.auth-actions') || authStatus?.parentElement || null;
  const navLinks = Array.from(document.querySelectorAll('.site-nav [data-route]'));
  const adminNavLinks = navLinks.filter((link) => link.dataset.adminLink === 'true');
  const roleBadge = document.getElementById('userRoleBadge');

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
    authMenu,
    authMenuPanel,
    authMenuTrigger,
    authNotice,
    authStatus,
    googleLoginBtn,
    logoutBtn,
    navLinks,
    roleBadge
  };
};

const getDisplayIdentity = (session = {}) => normalizeNickname(session.nickname || '') || session.googleName || session.email || 'Non connecté';

const routesLikeKey = (value = '') => ['login', 'creator', 'profile', 'booster', 'album', 'admin'].includes(String(value || '').trim().toLowerCase());

const navigateTo = (target, { replace = false } = {}) => {
  if (typeof window === 'undefined') return;

  const normalizedTarget = routesLikeKey(target) && window.__appRouter?.getUrlForRoute
    ? window.__appRouter.getUrlForRoute(target)
    : target;

  if (window.__appRouter?.navigate) {
    window.__appRouter.navigate(normalizedTarget, { replace });
    return;
  }

  if (replace) {
    window.location.replace(normalizedTarget);
    return;
  }

  window.location.href = normalizedTarget;
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

const closeAuthMenu = () => {
  const { authMenu, authMenuPanel, authMenuTrigger } = getShellElements();
  if (authMenu) authMenu.dataset.open = 'false';
  if (authMenuPanel) authMenuPanel.hidden = true;
  if (authMenuTrigger) authMenuTrigger.setAttribute('aria-expanded', 'false');
};

const openAuthMenu = () => {
  const { authMenu, authMenuPanel, authMenuTrigger } = getShellElements();
  if (authMenu) authMenu.dataset.open = 'true';
  if (authMenuPanel) authMenuPanel.hidden = false;
  if (authMenuTrigger) authMenuTrigger.setAttribute('aria-expanded', 'true');
};

const toggleAuthMenu = (force) => {
  const { authMenuPanel } = getShellElements();
  const shouldOpen = typeof force === 'boolean' ? force : Boolean(authMenuPanel?.hidden);

  if (shouldOpen) {
    openAuthMenu();
    return;
  }

  closeAuthMenu();
};

const setAuthUi = (session = null) => {
  const {
    authMenu,
    authStatus,
    authMenuTrigger,
    googleLoginBtn,
    navLinks,
    roleBadge
  } = getShellElements();

  const isConnected = Boolean(session);

  if (authStatus) authStatus.textContent = isConnected ? getDisplayIdentity(session) : 'Mon compte';

  setButtonVisibility(googleLoginBtn, !isConnected);

  if (authMenuTrigger) authMenuTrigger.hidden = !isConnected;
  if (authMenu) authMenu.hidden = !isConnected;

  if (!isConnected) {
    closeAuthMenu();
  }

  navLinks.forEach((link) => {
    if (link.dataset.route === 'login') return;
    link.hidden = !isConnected && link.dataset.adminLink !== 'true';
  });

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

const getCurrentRouteKey = () => {
  if (typeof window === 'undefined') return 'creator';
  return window.__appRouter?.getCurrentRouteKey?.() || 'login';
};

const getRedirectTarget = () => {
  if (typeof window === 'undefined') return 'creator';

  const params = new URLSearchParams(window.location.search);
  const next = String(params.get('next') || '').trim().toLowerCase();
  return next && next !== 'login' ? next : 'creator';
};

const redirectToLogin = () => {
  if (typeof window === 'undefined') return;
  const currentRouteKey = getCurrentRouteKey();
  if (currentRouteKey === 'login') return;
  navigateTo(`./?next=${encodeURIComponent(currentRouteKey)}`, { replace: true });
};

const redirectAfterLogin = () => {
  navigateTo(`./?page=${encodeURIComponent(getRedirectTarget())}`, { replace: true });
};

const buildCachedUser = (session) => {
  if (!session?.uid) return null;
  return {
    uid: session.uid,
    email: session.email || '',
    displayName: session.googleName || session.nickname || '',
    photoURL: session.photoURL || '',
    isLocalCache: true
  };
};

const applySessionState = ({ user = null, session = null, profile = null, notice = '' } = {}) => {
  const runtimeState = getAuthRuntimeState();
  const normalizedSession = session ? { ...session, roles: normalizeRoles(session.roles, session) } : null;

  state.currentUser = user;
  state.currentContext = normalizedSession
    ? {
        profile: profile || normalizedSession,
        redirectAfterLogin,
        redirectToLogin,
        session: normalizedSession,
        isFastAuth: Boolean(user?.isLocalCache)
      }
    : null;

  toggleAdminNav(canAccessAdmin(normalizedSession?.roles || []));
  setAuthUi(normalizedSession);
  setAuthNotice(notice || runtimeState.notice || '', runtimeState.level);
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
    applySessionState({ user: null, session: null, profile: null, notice: runtimeState.notice || '' });
    emitAuthChanged();
    await notifyCurrentHandler();
    return;
  }

  try {
    const profile = await syncProfileOnLogin(user);
    const nickname = normalizeNickname(profile?.nickname || '');
    const roles = normalizeRoles(profile?.roles || []);
    const cachedSession = checkAuthFast();
    const session = {
      uid: user.uid,
      email: (user.email || '').trim().toLowerCase(),
      googleName: user.displayName || '',
      nickname,
      photoURL: user.photoURL || '',
      roles,
      token: cachedSession?.token || '',
      tokenExpiresAt: cachedSession?.tokenExpiresAt || 0
    };

    saveAuthCache(session);
    applySessionState({ user, session, profile: { ...profile, roles }, notice: runtimeState.notice || '' });
    emitAuthChanged();
    await notifyCurrentHandler();
  } catch (error) {
    console.error('Erreur de synchronisation de session :', error);
    clearAuthCache();
    applySessionState({
      user,
      session: null,
      profile: null,
      notice: 'Connexion Google établie, mais la synchronisation Firebase a échoué. Vérifie la connexion réseau puis recharge la page.'
    });
    emitAuthChanged();
    await notifyCurrentHandler();
  }
};

const bootstrapAuth = () => {
  if (state.bootstrapPromise) return state.bootstrapPromise;

  const runtimeState = getAuthRuntimeState();
  const cachedSession = checkAuthFast();
  applySessionState({
    user: buildCachedUser(cachedSession),
    session: cachedSession,
    profile: cachedSession,
    notice: runtimeState.notice || ''
  });

  state.bootstrapPromise = (async () => {
    if (!state.redirectPromise) {
      state.redirectPromise = consumeRedirect().catch((error) => {
        setAuthNotice(error.message, 'error');
        alert(error.message);
      });
    }

    await state.redirectPromise;

    if (!state.authUnsubscribe) {
      state.authUnsubscribe = onAuthStateChanged(auth, async (user) => {
        await syncUserSession(user);
      });
    }
  })();

  return state.bootstrapPromise;
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
        const authResult = await performGoogleSignIn();
        const signedUser = authResult?.user || auth.currentUser;

        if (signedUser?.uid) {
          const quickSession = {
            uid: signedUser.uid,
            email: (signedUser.email || '').trim().toLowerCase(),
            googleName: signedUser.displayName || '',
            nickname: '',
            photoURL: signedUser.photoURL || '',
            roles: []
          };

          saveAuthCache(quickSession);
          applySessionState({
            user: signedUser,
            session: quickSession,
            profile: quickSession,
            notice: getAuthRuntimeState().notice || ''
          });
          await notifyCurrentHandler();
        }
      } catch (error) {
        setAuthNotice(error.message, 'error');
        alert(error.message);
      } finally {
        if (!loginButton.hidden) loginButton.disabled = false;
      }
      return;
    }

    const menuTrigger = event.target.closest('#authMenuTrigger');
    if (menuTrigger) {
      event.preventDefault();
      toggleAuthMenu();
      return;
    }

    const profileMenuItem = event.target.closest('#authMenuPanel [data-route="profile"]');
    if (profileMenuItem) {
      closeAuthMenu();
      return;
    }

    const clickedInsideMenu = event.target.closest('[data-auth-menu]');
    if (!clickedInsideMenu) {
      closeAuthMenu();
    }

    const logoutButton = event.target.closest('#logout');
    if (logoutButton) {
      closeAuthMenu();
      try {
        if (auth.currentUser) {
          await signOut(auth);
        }

        clearAuthCache();
        applySessionState({ user: null, session: null, profile: null, notice: getAuthRuntimeState().notice || '' });
        emitAuthChanged();
        await notifyCurrentHandler();
      } catch (error) {
        setAuthNotice('Impossible de fermer la session pour le moment.', 'error');
        console.error('Erreur de déconnexion :', error);
      }
    }
  }, { signal });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAuthMenu();
    }
  }, { signal });
};

const initCommon = async ({ onUserChanged, requireAuth = false } = {}) => {
  bindShellActions();
  state.currentHandler = onUserChanged || null;
  state.currentRequireAuth = requireAuth;

  const handlerToken = Symbol('page-handler');
  state.currentHandlerToken = handlerToken;

  bootstrapAuth().catch((error) => {
    console.error('Erreur pendant le bootstrap auth :', error);
  });

  queueMicrotask(() => {
    notifyCurrentHandler().catch((error) => {
      console.error('Erreur dans le handler auth :', error);
    });
  });

  return () => {
    if (state.currentHandlerToken !== handlerToken) return;
    state.currentHandler = null;
    state.currentRequireAuth = false;
    state.currentHandlerToken = null;
  };
};

export { getRedirectTarget, initCommon, navigateTo, redirectAfterLogin, redirectToLogin };
