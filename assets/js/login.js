import { db, get, normalizeNickname, ref, update, updateCachedNickname } from './firebase.js';
import { getRedirectTarget, initCommon } from './common.js';

const loginState = document.getElementById('loginState');
const nicknameStep = document.getElementById('nicknameStep');
const nicknameInput = document.getElementById('nickname');
const saveNicknameBtn = document.getElementById('saveNickname');
const loginHint = document.getElementById('loginHint');

let currentUser = null;

const showLoginState = (message) => {
  if (loginState) loginState.textContent = message;
};

const showNicknameStep = (visible) => {
  if (nicknameStep) nicknameStep.hidden = !visible;
};

const loadProfile = async (uid) => {
  const snapshot = await get(ref(db, `profiles/${uid}`));
  return snapshot.exists() ? snapshot.val() || {} : {};
};

saveNicknameBtn?.addEventListener('click', async () => {
  if (!currentUser) {
    alert('Connecte-toi d’abord avec Google.');
    return;
  }

  const nickname = normalizeNickname(nicknameInput?.value || '');
  if (!nickname) {
    alert('Le nickname est obligatoire.');
    return;
  }

  saveNicknameBtn.disabled = true;
  try {
    await update(ref(db, `profiles/${currentUser.uid}`), {
      nickname,
      nicknameKey: nickname.toLowerCase(),
      updatedAt: Date.now()
    });
    updateCachedNickname(nickname);
    showLoginState(`Bienvenue ${nickname} ! Redirection en cours...`);
    showNicknameStep(false);
    window.location.href = getRedirectTarget();
  } finally {
    saveNicknameBtn.disabled = false;
  }
});

await initCommon({
  onUserChanged: async (user, context) => {
    currentUser = user;

    if (!user) {
      showLoginState('Connecte-toi avec Google pour accéder au site.');
      showNicknameStep(false);
      if (loginHint) loginHint.textContent = 'Ton nickname sera demandé juste après la connexion.';
      return;
    }

    const profile = await loadProfile(user.uid);
    const nickname = normalizeNickname(profile.nickname || context?.profile?.nickname || '');

    if (nickname) {
      showLoginState(`Bienvenue ${nickname} ! Redirection...`);
      showNicknameStep(false);
      window.location.href = getRedirectTarget();
      return;
    }

    showLoginState('Choisis ton nickname pour terminer la connexion.');
    showNicknameStep(true);
    if (loginHint) loginHint.textContent = 'Ce nickname sera utilisé partout dans le studio.';
    nicknameInput?.focus();
  }
});
