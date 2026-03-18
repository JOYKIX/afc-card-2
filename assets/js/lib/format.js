const normalizeEmail = (email = '') => email.trim().toLowerCase();
const normalizeNickname = (nickname = '') => String(nickname).trim().replace(/\s+/g, ' ');
const nicknameToKey = (nickname = '') => normalizeNickname(nickname).toLowerCase();
const normalizeText = (value = '') => String(value).trim().replace(/\s+/g, ' ');
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);

const normalizeCardTitle = (title = '') => {
  const normalized = normalizeText(title);
  if (!normalized) return '';

  const folded = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '’')
    .toLowerCase();

  if (folded === 'viewer') return 'viewer';
  if (folded === 'streamer' || folded === 'streamers') return 'streamer';
  if (folded === 'responsable staff') return 'responsable staff';
  if (folded === 'gardien de l’afc' || folded === "gardien de l'afc") return 'gardien de l’AFC';
  return normalized;
};

const rankScale = ['D', 'C', 'B', 'A', 'S', 'Ω'];
const normalizeRank = (value = '') => {
  const upper = String(value || '').trim().toUpperCase();
  if (upper === 'SS' || upper === 'SSS') return 'S';
  return rankScale.includes(upper) ? upper : 'D';
};

const normalizeCardNumber = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const formatCardNumber = (value, fallback = 'non attribué') => {
  const cardNumber = normalizeCardNumber(value);
  return cardNumber ? `#${cardNumber}` : fallback;
};

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
};
