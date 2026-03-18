import { db, get, normalizeNickname, ref, update, updateCachedNickname } from './firebase.js';
import { initCommon } from './common.js';

const nicknameInput = document.getElementById('nickname');
const saveProfileBtn = document.getElementById('saveProfile');
const profileHint = document.getElementById('profileHint');

let currentUser = null;

const refreshProfile = async (uid) => {
  const profileSnapshot = await get(ref(db, `profiles/${uid}`));
  if (!profileSnapshot.exists()) {
    nicknameInput.value = '';
    profileHint.textContent = 'Aucun pseudo enregistré pour le moment.';
    return;
  }

  nicknameInput.value = profileSnapshot.val().nickname || '';
  profileHint.textContent = 'Pseudo chargé depuis Firebase.';
};

saveProfileBtn.addEventListener('click', async () => {
  if (!currentUser) {
    alert('Connecte-toi avec Google pour enregistrer ton pseudo.');
    return;
  }

  const nickname = normalizeNickname(nicknameInput.value);
  if (!nickname) {
    alert('Le pseudo est obligatoire.');
    return;
  }

  await update(ref(db, `profiles/${currentUser.uid}`), {
    nickname,
    nicknameKey: nickname.toLowerCase(),
    email: (currentUser.email || '').trim().toLowerCase(),
    updatedAt: Date.now()
  });

  updateCachedNickname(nickname);
  profileHint.textContent = `Pseudo "${nickname}" enregistré.`;
});

await initCommon({
  requireAuth: true,
  onUserChanged: async (user) => {
    currentUser = user;
    if (!user) {
      nicknameInput.value = '';
      profileHint.textContent = 'Connecte-toi avec Google pour démarrer.';
      return;
    }

    await refreshProfile(user.uid);
  }
});
