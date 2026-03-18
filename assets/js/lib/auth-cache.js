import { normalizeNickname } from './format.js';
import { normalizeRoles } from './roles.js';

const AUTH_CACHE_KEY = 'afc-auth-cache-v4';
const AUTH_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

const normalizeAuthCachePayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;

  const uid = String(payload.uid || '').trim();
  if (!uid) return null;

  const cachedAt = Number(payload.cachedAt);
  if (!Number.isFinite(cachedAt)) return null;

  const tokenExpiresAt = Number(payload.tokenExpiresAt);

  return {
    uid,
    email: String(payload.email || '').trim().toLowerCase(),
    googleName: String(payload.googleName || '').trim(),
    nickname: normalizeNickname(payload.nickname || ''),
    photoURL: String(payload.photoURL || '').trim(),
    roles: normalizeRoles(payload.roles, payload),
    token: String(payload.token || '').trim(),
    tokenExpiresAt: Number.isFinite(tokenExpiresAt) ? tokenExpiresAt : 0,
    cachedAt
  };
};

const loadAuthCache = () => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    return normalizeAuthCachePayload(JSON.parse(raw));
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

    const normalized = normalizeAuthCachePayload({
      ...payload,
      cachedAt: Date.now()
    });

    if (!normalized) {
      window.localStorage.removeItem(AUTH_CACHE_KEY);
      return;
    }

    window.localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.warn('Impossible de sauvegarder le cache auth local :', error);
  }
};

const clearAuthCache = () => saveAuthCache(null);

const checkAuthFast = () => {
  const cachedSession = loadAuthCache();
  if (!cachedSession) return null;

  const age = Date.now() - cachedSession.cachedAt;
  if (age > AUTH_CACHE_MAX_AGE_MS) {
    clearAuthCache();
    return null;
  }

  if (cachedSession.tokenExpiresAt && cachedSession.tokenExpiresAt <= Date.now()) {
    saveAuthCache({
      ...cachedSession,
      token: '',
      tokenExpiresAt: 0
    });

    return {
      ...cachedSession,
      token: '',
      tokenExpiresAt: 0
    };
  }

  return cachedSession;
};

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
  AUTH_CACHE_MAX_AGE_MS,
  checkAuthFast,
  clearAuthCache,
  loadAuthCache,
  saveAuthCache,
  updateCachedNickname,
  updateCachedRoles
};
