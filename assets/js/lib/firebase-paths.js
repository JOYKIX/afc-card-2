const CARDS_PATH = 'cards';
const CARD_VERIFICATION_PATH = 'cardVerification';
const NICKNAME_INDEX_PATH = 'nicknameIndex';
const PROFILES_PATH = 'profiles';
const USER_ADMIN_ENTRIES_PATH = 'userAdminEntries';

const joinDbPath = (...segments) => segments
  .map((segment) => String(segment ?? '').trim())
  .filter(Boolean)
  .join('/');

const getCardsPath = (cardId = '') => joinDbPath(CARDS_PATH, cardId);
const getCardVerificationPath = (verificationId = '') => joinDbPath(CARD_VERIFICATION_PATH, verificationId);
const getNicknameIndexPath = (nicknameKey = '') => joinDbPath(NICKNAME_INDEX_PATH, nicknameKey);
const getProfilePath = (uid = '') => joinDbPath(PROFILES_PATH, uid);
const getProfileOwnedCardPath = (uid = '', cardId = '') => joinDbPath(getProfilePath(uid), 'ownedCards', cardId);
const getProfileOwnedCardFieldPath = (uid = '', cardId = '', field = '') => joinDbPath(getProfileOwnedCardPath(uid, cardId), field);
const getProfileFieldPath = (uid = '', field = '') => joinDbPath(getProfilePath(uid), field);
const getUserAdminEntryPath = (uid = '') => joinDbPath(USER_ADMIN_ENTRIES_PATH, uid);

export {
  CARDS_PATH,
  CARD_VERIFICATION_PATH,
  NICKNAME_INDEX_PATH,
  PROFILES_PATH,
  USER_ADMIN_ENTRIES_PATH,
  getCardsPath,
  getCardVerificationPath,
  getNicknameIndexPath,
  getProfileFieldPath,
  getProfileOwnedCardFieldPath,
  getProfileOwnedCardPath,
  getProfilePath,
  getUserAdminEntryPath,
  joinDbPath
};
