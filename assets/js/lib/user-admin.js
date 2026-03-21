import { db, get, ref } from '../firebase.js';
import { USER_ADMIN_ENTRIES_PATH, getUserAdminEntryPath } from './firebase-paths.js';
import { getMaxPendingSubmissionsForRoles } from './roles.js';

const getUserAdminEntryRef = (uid = '') => ref(db, getUserAdminEntryPath(uid));

const getDefaultCardCreationLimitForRoles = (roles = []) => (
  getMaxPendingSubmissionsForRoles(roles) === Number.POSITIVE_INFINITY
    ? Number.POSITIVE_INFINITY
    : 1
);

const normalizeCardCreationLimit = (value, fallback = 1) => {
  if (value === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
};

const loadUserAdminEntry = async (uid, roles = []) => {
  if (!uid) {
    return {
      cardCreationLimit: getDefaultCardCreationLimitForRoles(roles)
    };
  }

  try {
    const snapshot = await get(getUserAdminEntryRef(uid));
    const rawEntry = snapshot.exists() ? snapshot.val() || {} : {};
    const fallback = getDefaultCardCreationLimitForRoles(roles);

    return {
      ...rawEntry,
      cardCreationLimit: normalizeCardCreationLimit(rawEntry.cardCreationLimit, fallback)
    };
  } catch (error) {
    console.warn('Impossible de charger les paramètres admin du compte :', error);
    return {
      cardCreationLimit: getDefaultCardCreationLimitForRoles(roles)
    };
  }
};

const loadUserCardCreationLimit = async (uid, roles = []) => {
  const entry = await loadUserAdminEntry(uid, roles);
  return entry.cardCreationLimit;
};

export {
  USER_ADMIN_ENTRIES_PATH,
  getDefaultCardCreationLimitForRoles,
  getUserAdminEntryRef,
  loadUserAdminEntry,
  loadUserCardCreationLimit,
  normalizeCardCreationLimit
};
