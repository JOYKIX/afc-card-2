import { checkAuthFast } from './lib/auth-cache.js';

const routes = {
  '': {
    key: 'create',
    path: 'creator.html',
    partial: 'pages/creator.html',
    title: 'AFC Card Studio · Création',
    requireAuth: true,
    init: () => import('./create.js').then((module) => module.initCreatePage())
  },
  'index.html': {
    key: 'index',
    path: 'index.html',
    partial: 'pages/login.html',
    title: 'AFC Card Studio',
    init: async () => null
  },
  'creator.html': {
    key: 'create',
    path: 'creator.html',
    partial: 'pages/creator.html',
    title: 'AFC Card Studio · Création',
    requireAuth: true,
    init: () => import('./create.js').then((module) => module.initCreatePage())
  },
  'profile.html': {
    key: 'profile',
    path: 'profile.html',
    partial: 'pages/profile.html',
    title: 'AFC Card Studio · Profil',
    requireAuth: true,
    init: () => import('./profile.js').then((module) => module.initProfilePage())
  },
  'booster.html': {
    key: 'booster',
    path: 'booster.html',
    partial: 'pages/booster.html',
    title: 'AFC Card Studio · Booster',
    requireAuth: true,
    init: () => import('./booster.js').then((module) => module.initBoosterPage())
  },
  'album.html': {
    key: 'album',
    path: 'album.html',
    partial: 'pages/album.html',
    title: 'AFC Card Studio · Album',
    requireAuth: true,
    init: () => import('./album.js').then((module) => module.initAlbumPage())
  },
  'admin.html': {
    key: 'admin',
    path: 'admin.html',
    partial: 'pages/admin.html',
    title: 'AFC Card Studio · Admin',
    requireAuth: true,
    init: () => import('./admin.js').then((module) => module.initAdminPage())
  },
  'login.html': {
    key: 'login',
    path: 'login.html',
    partial: 'pages/login.html',
    title: 'AFC Card Studio · Login',
    workspaceClass: 'app-workspace--login',
    init: () => import('./login.js').then((module) => module.initLoginPage())
  }
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

const getRouteFromTarget = (target) => {
  const url = new URL(target, window.location.href);
  const basename = url.pathname.split('/').pop() || 'index.html';
  const route = routes[basename] || routes['creator.html'];
  return {
    route,
    url,
    href: `${route.path}${url.search}${url.hash}`
  };
};

const setActiveNavLink = (path) => {
  document.querySelectorAll('[data-route]').forEach((link) => {
    link.classList.toggle('active', link.getAttribute('href') === path);
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

const toLoginHref = (targetHref) => {
  const loginUrl = new URL('login.html', window.location.href);
  loginUrl.searchParams.set('next', targetHref || 'creator.html');
  return `${loginUrl.pathname.split('/').pop()}${loginUrl.search}${loginUrl.hash}`;
};

const resolveProtectedHref = (href, route) => {
  const fastUser = checkAuthFast();
  if (route.requireAuth && !fastUser) {
    return toLoginHref(href);
  }

  if (route.key === 'login' && fastUser) {
    return 'creator.html';
  }

  return href;
};

const navigate = async (target, { replace = false, immediate = false } = {}) => {
  const navigationId = ++activeNavigationId;
  let { route, href } = getRouteFromTarget(target);
  const resolvedHref = resolveProtectedHref(href, route);

  if (resolvedHref !== href) {
    ({ route, href } = getRouteFromTarget(resolvedHref));
  }

  if (!app) return;

  try {
    const response = await fetch(route.partial, { headers: { 'X-Requested-With': 'partial-router' } });
    if (!response.ok) {
      throw new Error(`Impossible de charger ${route.partial}`);
    }

    const html = await response.text();
    if (navigationId !== activeNavigationId) return;

    currentCleanup?.();
    currentCleanup = null;

    await swapContent(html, { immediate });

    workspace?.classList.toggle('app-workspace--login', Boolean(route.workspaceClass));
    document.body.dataset.route = route.key;
    document.title = route.title;
    setActiveNavLink(route.path);
    revealApp();

    if (replace) {
      history.replaceState({ path: href }, '', href);
    } else if (`${window.location.pathname.split('/').pop() || 'index.html'}${window.location.search}${window.location.hash}` !== href) {
      history.pushState({ path: href }, '', href);
    }

    currentCleanup = (await route.init()) || null;
  } catch (error) {
    console.error('Erreur de navigation :', error);
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
  }
};

const shouldHandleLink = (link) => {
  if (!link) return false;
  if (link.target && link.target !== '_self') return false;
  if (link.hasAttribute('download')) return false;

  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return false;

  const basename = url.pathname.split('/').pop() || 'index.html';
  return Boolean(routes[basename]);
};

const resolveInitialTarget = () => {
  const current = new URL(window.location.href);
  const params = new URLSearchParams(current.search);
  const page = params.get('page');

  if (page && routes[page]) {
    params.delete('page');
    const suffix = `${params.toString() ? `?${params.toString()}` : ''}${current.hash || ''}`;
    return resolveProtectedHref(`${page}${suffix}`, routes[page]);
  }

  const basename = current.pathname.split('/').pop() || 'index.html';
  if (basename === 'index.html' || basename === '') {
    return checkAuthFast() ? 'creator.html' : 'login.html';
  }

  if (routes[basename]) {
    return resolveProtectedHref(`${basename}${current.search}${current.hash}`, routes[basename]);
  }

  return checkAuthFast() ? `creator.html${current.search}${current.hash}` : toLoginHref(`creator.html${current.search}${current.hash}`);
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

window.__appRouter = { navigate };

navigate(resolveInitialTarget(), { replace: true, immediate: true });
