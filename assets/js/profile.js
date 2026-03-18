import { claimNickname, db, get, normalizeNickname, ref, update, updateCachedNickname } from './firebase.js';
import { initCommon } from './common.js';

const nicknameInput = document.getElementById('nickname');
const saveProfileBtn = document.getElementById('saveProfile');
const profileHint = document.getElementById('profileHint');

let currentUser = null;
let currentProfile = {};

const refreshProfile = async (uid) => {
  try {
    const profileSnapshot = await get(ref(db, `profiles/${uid}`));
    currentProfile = profileSnapshot.exists() ? profileSnapshot.val() || {} : {};

    if (!profileSnapshot.exists()) {
      nicknameInput.value = '';
      profileHint.textContent = 'Aucun pseudo enregistré pour le moment.';
      return;
    }

    nicknameInput.value = currentProfile.nickname || '';
    profileHint.textContent = 'Ton pseudo est prêt à être modifié.';
  } catch (error) {
    console.error('Erreur chargement profil :', error);
    currentProfile = {};
    nicknameInput.value = '';
    profileHint.textContent = 'Impossible de charger ton profil pour le moment. Recharge la page après avoir rétabli la connexion.';
  }
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

  try {
    const claim = await claimNickname({
      uid: currentUser.uid,
      nickname,
      previousNicknameKey: currentProfile.nicknameKey || ''
    });

    await update(ref(db, `profiles/${currentUser.uid}`), {
      nickname: claim.nickname,
      nicknameKey: claim.nicknameKey,
      email: (currentUser.email || '').trim().toLowerCase(),
      updatedAt: Date.now()
    });

    currentProfile = {
      ...currentProfile,
      nickname: claim.nickname,
      nicknameKey: claim.nicknameKey
    };

    updateCachedNickname(claim.nickname);
    profileHint.textContent = `Pseudo "${claim.nickname}" enregistré.`;
  } catch (error) {
    if (error.message === 'nickname-already-taken') {
      alert('Ce pseudo est déjà pris, peu importe les majuscules/minuscules.');
      return;
    }

    console.error('Erreur lors de la mise à jour du profil :', error);
    alert('Impossible d’enregistrer ce pseudo pour le moment.');
  }
});

await initCommon({
  requireAuth: true,
  onUserChanged: async (user) => {
    currentUser = user;
    if (!user) {
      currentProfile = {};
      nicknameInput.value = '';
      profileHint.textContent = 'Connecte-toi avec Google pour démarrer.';
      return;
    }

    await refreshProfile(user.uid);
  }
});
