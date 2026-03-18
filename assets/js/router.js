import { checkAuthFast } from './lib/auth-cache.js';

const routes = {
  creator: {
    key: 'creator',
    partial: 'pages/creator.html',
    title: 'AFC Card Studio · Création',
    requireAuth: true,
    init: () => import('./create.js').then((module) => module.initCreatePage())
  },
  profile: {
    key: 'profile',
    partial: 'pages/profile.html',
    title: 'AFC Card Studio · Profil',
    requireAuth: true,
    init: () => import('./profile.js').then((module) => module.initProfilePage())
  },
  booster: {
    key: 'booster',
    partial: 'pages/booster.html',
    title: 'AFC Card Studio · Booster',
    requireAuth: true,
    init: () => import('./booster.js').then((module) => module.initBoosterPage())
  },
  album: {
    key: 'album',
    partial: 'pages/album.html',
    title: 'AFC Card Studio · Album',
    requireAuth: true,
    init: () => import('./album.js').then((module) => module.initAlbumPage())
  },
  admin: {
    key: 'admin',
    partial: 'pages/admin.html',
    title: 'AFC Card Studio · Admin',
    requireAuth: true,
    init: () => import('./admin.js').then((module) => module.initAdminPage())
  },
  login: {
    key: 'login',
    title: 'AFC Card Studio · Connexion',
    workspaceClass: 'app-workspace--login',
    init: () => import('./login.js').then((module) => module.initLoginPage()),
    render: () => {
      const template = document.getElementById('loginViewTemplate');
      return template?.innerHTML || '<main></main>';
    }
  }
};

const legacyRouteAliases = {
  '': 'login',
  'index.html': 'login',
  'creator.html': 'creator',
  'profile.html': 'profile',
  'booster.html': 'booster',
  'album.html': 'album',
  'admin.html': 'admin',
  'login.html': 'login'
};

const app = document.getElementById('app');
const workspace = document.getElementById('appWorkspace');
let currentCleanup = null;
let activeNavigationId = 0;
let initialViewRevealed = false;

const revealApp = () => {
  if (initialViewRevealed) return;
  initialViewRevealed = true;
  document.body.classList.add('app-ready');
};

const getFastUser = () => checkAuthFast();

const getUrlForRoute = (routeKey, currentUrl = new URL(window.location.href)) => {
  const url = new URL(currentUrl.href);

  if (!routeKey || routeKey === 'login') {
    url.searchParams.delete('page');
  } else {
    url.searchParams.set('page', routeKey);
  }

  return `${url.pathname}${url.search}${url.hash}`;
};

const normalizeRouteKey = (rawRouteKey = '') => {
  const direct = String(rawRouteKey || '').trim().toLowerCase();
  if (routes[direct]) return direct;
  return legacyRouteAliases[direct] || null;
};

const getRouteKeyFromUrl = (target = window.location.href) => {
  const url = target instanceof URL ? target : new URL(target, window.location.href);
  const page = normalizeRouteKey(url.searchParams.get('page') || '');
  if (page) return page;

  const basename = url.pathname.split('/').pop() || 'index.html';
  return normalizeRouteKey(basename) || null;
};

const getResolvedRouteKey = (requestedRouteKey) => {
  const fastUser = getFastUser();

  if (!requestedRouteKey || requestedRouteKey === 'login') {
    return fastUser ? 'creator' : 'login';
  }

  const route = routes[requestedRouteKey];
  if (!route) return fastUser ? 'creator' : 'login';
  if (route.requireAuth && !fastUser) return 'login';

  return requestedRouteKey;
};

const buildNavigationState = (target = window.location.href) => {
  const url = target instanceof URL ? target : new URL(target, window.location.href);
  const requestedRouteKey = getRouteKeyFromUrl(url) || 'login';
  const routeKey = getResolvedRouteKey(requestedRouteKey);
  const route = routes[routeKey];

  return {
    requestedRouteKey,
    route,
    routeKey,
    url,
    href: getUrlForRoute(routeKey, url)
  };
};

const setActiveNavLink = (routeKey) => {
  document.querySelectorAll('[data-route]').forEach((link) => {
    link.classList.toggle('active', link.dataset.route === routeKey);
  });
};

const swapContent = async (html, { immediate = false } = {}) => {
  if (!immediate) {
    app.classList.add('is-leaving');
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }

  app.innerHTML = html;
  app.classList.remove('is-leaving');
  app.classList.add('is-entering');
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      app.classList.remove('is-entering');
    });
  });
};

const loadPage = async (routeKey, { immediate = false } = {}) => {
  const route = routes[routeKey] || routes.login;

  if (route.render) {
    await swapContent(route.render(), { immediate });
    return route;
  }

  const response = await fetch(route.partial, {
    headers: { 'X-Requested-With': 'partial-router' }
  });

  if (!response.ok) {
    throw new Error(`Impossible de charger ${route.partial}`);
  }

  const html = await response.text();
  await swapContent(html, { immediate });
  return route;
};

const updateShellForRoute = (route) => {
  workspace?.classList.toggle('app-workspace--login', Boolean(route.workspaceClass));
  document.body.dataset.route = route.key;
  document.title = route.title;
  setActiveNavLink(route.key);
};

const runRouteInit = async (route) => {
  currentCleanup?.();
  currentCleanup = null;
  currentCleanup = (await route.init?.()) || null;
};

const renderNavigationError = () => {
  app.innerHTML = `
    <main class="single-layout single-layout--narrow">
      <section class="panel glass profile-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Navigation</p>
            <h2>Impossible de charger cette page</h2>
          </div>
          <p class="subtitle">Recharge la page ou réessaie dans un instant.</p>
        </div>
      </section>
    </main>
  `;
  revealApp();
};

const navigate = async (target, { replace = false, immediate = false } = {}) => {
  const navigationId = ++activeNavigationId;
  const nextState = buildNavigationState(target);

  if (!app) return;

  try {
    const route = await loadPage(nextState.routeKey, { immediate });
    if (navigationId !== activeNavigationId) return;

    updateShellForRoute(route);
    revealApp();

    if (replace) {
      history.replaceState({ routeKey: route.key }, '', nextState.href);
    } else if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextState.href) {
      history.pushState({ routeKey: route.key }, '', nextState.href);
    }

    await runRouteInit(route);
  } catch (error) {
    console.error('Erreur de navigation :', error);
    renderNavigationError();
  }
};

const shouldHandleLink = (link) => {
  if (!link) return false;
  if (link.target && link.target !== '_self') return false;
  if (link.hasAttribute('download')) return false;

  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return false;

  return Boolean(getRouteKeyFromUrl(url));
};

const syncRouteWithAuthState = () => {
  const currentUrl = new URL(window.location.href);
  const currentRouteKey = getRouteKeyFromUrl(currentUrl) || 'login';
  const resolvedRouteKey = getResolvedRouteKey(currentRouteKey);

  if (currentRouteKey === 'login') return;

  if (currentRouteKey !== resolvedRouteKey && resolvedRouteKey === 'login') {
    currentUrl.searchParams.delete('page');
    currentUrl.searchParams.set('next', currentRouteKey);
    navigate(currentUrl.href, { replace: true, immediate: true });
  }
};

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href]');
  if (!shouldHandleLink(link)) return;

  event.preventDefault();
  navigate(link.href);
});

window.addEventListener('popstate', () => {
  navigate(window.location.href, { replace: true, immediate: true });
});

window.addEventListener('afc-auth-changed', () => {
  syncRouteWithAuthState();
});

window.__appRouter = {
  loadPage,
  navigate,
  getCurrentRouteKey: () => getRouteKeyFromUrl(window.location.href) || 'login',
  getUrlForRoute
};

navigate(window.location.href, { replace: true, immediate: true });
