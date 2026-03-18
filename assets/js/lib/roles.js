const DEFAULT_STAT_REROLLS = 3;
const EXTENDED_STAT_REROLLS = 10;
const DEFAULT_ROLE = 'african army';
const ROLE_PRIORITY = [
  'african army',
  'vip',
  'streamers',
  'staff afc',
  'creator',
  'admin',
  'african king'
];
const CARD_TITLES = ['viewer', 'streamer', 'responsable staff', 'gardien de l’AFC'];
const TITLE_LABELS = {
  viewer: 'Viewer',
  streamer: 'Streamer',
  'responsable staff': 'Responsable staff',
  'gardien de l’AFC': 'Gardien de l’AFC'
};
const ROLE_DEFINITIONS = {
  'african army': {
    badgeLabel: 'African Army',
    badgeClass: 'role-african-army',
    color: 'bleu',
    creationTitles: ['viewer'],
    rerolls: DEFAULT_STAT_REROLLS,
    adminAccess: false,
    validationAccess: false,
    unlimitedRerolls: false,
    unlimitedSubmissions: false
  },
  vip: {
    badgeLabel: 'VIP',
    badgeClass: 'role-vip',
    color: 'rose',
    creationTitles: ['viewer'],
    rerolls: EXTENDED_STAT_REROLLS,
    adminAccess: false,
    validationAccess: false,
    unlimitedRerolls: false,
    unlimitedSubmissions: true
  },
  streamers: {
    badgeLabel: 'Streamers',
    badgeClass: 'role-streamers',
    color: 'violet',
    creationTitles: ['streamer'],
    rerolls: EXTENDED_STAT_REROLLS,
    adminAccess: false,
    validationAccess: false,
    unlimitedRerolls: false,
    unlimitedSubmissions: true
  },
  'staff afc': {
    badgeLabel: 'Staff AFC',
    badgeClass: 'role-staff-afc',
    color: 'rouge',
    creationTitles: ['responsable staff', 'gardien de l’AFC'],
    rerolls: EXTENDED_STAT_REROLLS,
    adminAccess: false,
    validationAccess: false,
    unlimitedRerolls: false,
    unlimitedSubmissions: true
  },
  creator: {
    badgeLabel: 'Créateur',
    badgeClass: 'role-creator',
    color: 'cyan',
    creationTitles: [...CARD_TITLES],
    rerolls: Number.POSITIVE_INFINITY,
    adminAccess: false,
    validationAccess: false,
    unlimitedRerolls: true,
    unlimitedSubmissions: true
  },
  admin: {
    badgeLabel: 'Admin',
    badgeClass: 'role-admin',
    color: 'orange',
    creationTitles: [...CARD_TITLES],
    rerolls: Number.POSITIVE_INFINITY,
    adminAccess: true,
    validationAccess: true,
    unlimitedRerolls: true,
    unlimitedSubmissions: true
  },
  'african king': {
    badgeLabel: 'African King',
    badgeClass: 'role-african-king',
    color: 'rose foncé',
    creationTitles: [...CARD_TITLES],
    rerolls: Number.POSITIVE_INFINITY,
    adminAccess: true,
    validationAccess: true,
    unlimitedRerolls: true,
    unlimitedSubmissions: true
  }
};

const getRolePriority = (role = '') => {
  const index = ROLE_PRIORITY.indexOf(role);
  return index === -1 ? -1 : index;
};

const normalizeRoles = (value, legacyProfile = {}) => {
  const sourceRoles = Array.isArray(value) ? value : [];
  const next = new Set([DEFAULT_ROLE]);

  sourceRoles.forEach((role) => {
    const normalized = String(role || '').trim().toLowerCase();
    if (ROLE_DEFINITIONS[normalized]) next.add(normalized);
  });

  if (legacyProfile.admin === true) next.add('admin');
  if (legacyProfile.vip === true) next.add('vip');

  return [...next].sort((left, right) => getRolePriority(left) - getRolePriority(right));
};

const getHighestPriorityRole = (roles = []) => normalizeRoles(roles).reduce((highest, role) => {
  if (!highest) return role;
  return getRolePriority(role) > getRolePriority(highest) ? role : highest;
}, '');

const getRoleBadge = (roles = []) => {
  const highestRole = getHighestPriorityRole(roles);
  return highestRole ? { key: highestRole, ...ROLE_DEFINITIONS[highestRole] } : null;
};

const userHasRole = (roles = [], role) => normalizeRoles(roles).includes(role);
const canAccessAdmin = (roles = []) => normalizeRoles(roles).some((role) => ROLE_DEFINITIONS[role]?.adminAccess);
const canValidateCards = (roles = []) => normalizeRoles(roles).some((role) => ROLE_DEFINITIONS[role]?.validationAccess);
const hasUnlimitedStatAccessForRoles = (roles = []) => normalizeRoles(roles).some((role) => ROLE_DEFINITIONS[role]?.unlimitedRerolls);

const getAllowedCardTitlesForRoles = (roles = []) => {
  const normalizedRoles = normalizeRoles(roles);
  if (normalizedRoles.some((role) => ROLE_DEFINITIONS[role]?.creationTitles?.length === CARD_TITLES.length)) {
    return [...CARD_TITLES];
  }

  const titles = new Set();
  normalizedRoles.forEach((role) => {
    (ROLE_DEFINITIONS[role]?.creationTitles || []).forEach((title) => titles.add(title));
  });

  return CARD_TITLES.filter((title) => titles.has(title));
};

const getMaxPendingSubmissionsForRoles = (roles = []) => {
  const normalizedRoles = normalizeRoles(roles);
  return normalizedRoles.some((role) => ROLE_DEFINITIONS[role]?.unlimitedSubmissions) ? Number.POSITIVE_INFINITY : 1;
};

const getStoredRerollCapForRoles = (roles = []) => {
  const normalizedRoles = normalizeRoles(roles);
  if (normalizedRoles.some((role) => ROLE_DEFINITIONS[role]?.rerolls === EXTENDED_STAT_REROLLS)) {
    return EXTENDED_STAT_REROLLS;
  }
  return DEFAULT_STAT_REROLLS;
};

const normalizeRemainingStatRerolls = (value, roles = [DEFAULT_ROLE]) => {
  const parsed = Number.parseInt(value, 10);
  const cap = getStoredRerollCapForRoles(roles);
  if (!Number.isInteger(parsed) || parsed < 0) return cap;
  return Math.min(parsed, cap);
};

const getRerollDisplayValueForRoles = (roles = []) => {
  if (hasUnlimitedStatAccessForRoles(roles)) return Number.POSITIVE_INFINITY;
  return getStoredRerollCapForRoles(roles);
};

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
  getHighestPriorityRole,
  getMaxPendingSubmissionsForRoles,
  getRerollDisplayValueForRoles,
  getRoleBadge,
  getRolePriority,
  hasUnlimitedStatAccessForRoles,
  normalizeRemainingStatRerolls,
  normalizeRoles,
  userHasRole
};
