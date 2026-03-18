import { normalizeNickname } from './format.js';
import { normalizeRoles } from './roles.js';

const AUTH_CACHE_KEY = 'afc-auth-cache-v3';

const loadAuthCache = () => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    console.warn('Impossible de lire le cache auth local :', error);
    return null;
  }
};

const saveAuthCache = (payload) => {
  if (typeof window === 'undefined') return;

  try {
    if (!payload) {
      window.localStorage.removeItem(AUTH_CACHE_KEY);
      return;
    }

    window.localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({
      ...payload,
      roles: normalizeRoles(payload.roles, payload),
      cachedAt: Date.now()
    }));
  } catch (error) {
    console.warn('Impossible de sauvegarder le cache auth local :', error);
  }
};

const clearAuthCache = () => saveAuthCache(null);

const updateCachedNickname = (nickname = '') => {
  const currentCache = loadAuthCache();
  if (!currentCache) return;

  saveAuthCache({
    ...currentCache,
    nickname: normalizeNickname(nickname)
  });
};

const updateCachedRoles = (roles = []) => {
  const currentCache = loadAuthCache();
  if (!currentCache) return;

  saveAuthCache({
    ...currentCache,
    roles: normalizeRoles(roles)
  });
};

export {
  AUTH_CACHE_KEY,
  clearAuthCache,
  loadAuthCache,
  saveAuthCache,
  updateCachedNickname,
  updateCachedRoles
};
