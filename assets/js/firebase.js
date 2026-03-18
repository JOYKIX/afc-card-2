export { app, auth, db, provider } from './lib/firebase-core.js';
export {
  checkAdmin,
  checkVip,
  claimNickname,
  checkAuthFast,
  clearAuthCache,
  consumeRedirect,
  getAuthRuntimeState,
  getProfile,
  getProfileRoles,
  loadAuthCache,
  onAuthStateChanged,
  performGoogleSignIn,
  saveAuthCache,
  syncProfileOnLogin
} from './lib/auth-service.js';
export {
  AUTH_CACHE_KEY,
  AUTH_CACHE_MAX_AGE_MS,
  updateCachedNickname,
  updateCachedRoles
} from './lib/auth-cache.js';
export {
  CARD_TITLES,
  DEFAULT_ROLE,
  DEFAULT_STAT_REROLLS,
  EXTENDED_STAT_REROLLS,
  ROLE_DEFINITIONS,
  TITLE_LABELS,
  canAccessAdmin,
  canValidateCards,
  getAllowedCardTitlesForRoles,
  getMaxPendingSubmissionsForRoles,
  getRerollDisplayValueForRoles,
  getRoleBadge,
  hasUnlimitedStatAccessForRoles,
  normalizeRemainingStatRerolls,
  normalizeRoles,
  userHasRole
} from './lib/roles.js';
export {
  escapeHtml,
  formatCardNumber,
  nicknameToKey,
  normalizeCardNumber,
  normalizeCardTitle,
  normalizeEmail,
  normalizeNickname,
  normalizeRank,
  normalizeText,
  rankScale
} from './lib/format.js';
export {
  equalTo,
  get,
  initializeApp,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  remove,
  runTransaction,
  set,
  signOut,
  update
} from './lib/firebase-sdk.js';
