import { claimNickname, db, get, normalizeNickname, ref, update, updateCachedNickname } from './firebase.js';
import { initCommon } from './common.js';
import { DAILY_LOGIN_REWARD, INITIAL_COINS, loadProfileAlbum } from './lib/album-storage.js';

export const initProfilePage = async () => {
  const nicknameInput = document.getElementById('nickname');
  const saveProfileBtn = document.getElementById('saveProfile');
  const profileHint = document.getElementById('profileHint');
  const profileCoins = document.getElementById('profileCoins');
  const profileDaily = document.getElementById('profileDaily');
  const profileDrops = document.getElementById('profileDrops');

  let currentUser = null;
  let currentProfile = {};

  const updateEconomyWidgets = async (uid) => {
    if (!uid) {
      if (profileCoins) profileCoins.textContent = `${INITIAL_COINS} coins`;
      if (profileDaily) profileDaily.textContent = `+${DAILY_LOGIN_REWARD} coins / jour`;
      if (profileDrops) profileDrops.textContent = '0 carte drop';
      return;
    }

    const profileAlbum = await loadProfileAlbum(uid);
    if (profileCoins) profileCoins.textContent = `${profileAlbum.coins} coin${profileAlbum.coins > 1 ? 's' : ''}`;
    if (profileDaily) profileDaily.textContent = `Connexion du jour : +${DAILY_LOGIN_REWARD} coins`;
    if (profileDrops) {
      const uniqueDrops = new Set([
        ...(profileAlbum.droppedCardIds || []),
        ...Object.keys(profileAlbum.ownedCards || {})
      ]).size;
      profileDrops.textContent = `${uniqueDrops} carte${uniqueDrops > 1 ? 's' : ''} unique${uniqueDrops > 1 ? 's' : ''}`;
    }
  };

  const refreshProfile = async (uid) => {
    try {
      const profileSnapshot = await get(ref(db, `profiles/${uid}`));
      currentProfile = profileSnapshot.exists() ? profileSnapshot.val() || {} : {};

      if (!profileSnapshot.exists()) {
        nicknameInput.value = '';
        await updateEconomyWidgets(uid);
        profileHint.textContent = 'Aucun pseudo enregistré pour le moment.';
        return;
      }

      nicknameInput.value = currentProfile.nickname || '';
      await updateEconomyWidgets(uid);
      profileHint.textContent = 'Ton pseudo et ton portefeuille sont prêts à être modifiés/consultés.';
    } catch (error) {
      console.error('Erreur chargement profil :', error);
      currentProfile = {};
      nicknameInput.value = '';
      profileHint.textContent = 'Impossible de charger ton profil pour le moment. Recharge la page après avoir rétabli la connexion.';
    }
  };

  const saveProfile = async () => {
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
      await updateEconomyWidgets(currentUser.uid);
      profileHint.textContent = `Pseudo "${claim.nickname}" enregistré.`;
    } catch (error) {
      if (error.message === 'nickname-already-taken') {
        alert('Ce pseudo est déjà pris, peu importe les majuscules/minuscules.');
        return;
      }

      console.error('Erreur lors de la mise à jour du profil :', error);
      alert('Impossible d’enregistrer ce pseudo pour le moment.');
    }
  };

  saveProfileBtn?.addEventListener('click', saveProfile);

  const cleanupCommon = await initCommon({
    requireAuth: true,
    onUserChanged: async (user) => {
      currentUser = user;
      if (!user) {
        currentProfile = {};
        nicknameInput.value = '';
        await updateEconomyWidgets('');
        profileHint.textContent = 'Connecte-toi avec Google pour démarrer.';
        return;
      }

      await refreshProfile(user.uid);
    }
  });

  return () => {
    cleanupCommon?.();
    saveProfileBtn?.removeEventListener('click', saveProfile);
  };
};
