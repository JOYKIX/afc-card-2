import { claimNickname, db, getProfile, normalizeNickname, ref, update, updateCachedNickname } from './firebase.js';
import { getRedirectTarget, initCommon, navigateTo } from './common.js';
import { getProfilePath } from './lib/firebase-paths.js';

export const initLoginPage = async () => {
  const loginState = document.getElementById('loginState');
  const nicknameStep = document.getElementById('nicknameStep');
  const nicknameInput = document.getElementById('nickname');
  const saveNicknameBtn = document.getElementById('saveNickname');
  const loginHint = document.getElementById('loginHint');

  let currentUser = null;
  let currentProfile = {};

  const showLoginState = (message) => {
    if (loginState) loginState.textContent = message;
  };

  const showNicknameStep = (visible) => {
    if (nicknameStep) nicknameStep.hidden = !visible;
  };

  const loadProfile = async (uid) => {
    try {
      return await getProfile(uid);
    } catch (error) {
      console.error('Erreur lors du chargement du profil :', error);
      throw new Error('Impossible de charger ton profil pour le moment. Vérifie ta connexion puis recharge la page.');
    }
  };

  const saveNickname = async () => {
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
      const claim = await claimNickname({
        uid: currentUser.uid,
        nickname,
        previousNicknameKey: currentProfile.nicknameKey || ''
      });

      await update(ref(db, getProfilePath(currentUser.uid)), {
        nickname: claim.nickname,
        nicknameKey: claim.nicknameKey,
        updatedAt: Date.now()
      });

      currentProfile = {
        ...currentProfile,
        nickname: claim.nickname,
        nicknameKey: claim.nicknameKey
      };

      updateCachedNickname(claim.nickname);
      showLoginState(`Bienvenue ${claim.nickname} ! Redirection en cours...`);
      showNicknameStep(false);
      navigateTo(getRedirectTarget(), { replace: true });
    } catch (error) {
      if (error.message === 'nickname-already-taken') {
        alert('Ce nickname est déjà pris, même avec une casse différente. Choisis-en un autre.');
      } else {
        console.error('Erreur lors de l’enregistrement du nickname :', error);
        alert('Impossible d’enregistrer ce nickname pour le moment. Réessaie.');
      }
    } finally {
      saveNicknameBtn.disabled = false;
    }
  };

  saveNicknameBtn?.addEventListener('click', saveNickname);

  const cleanupCommon = await initCommon({
    onUserChanged: async (user, context) => {
      currentUser = user;

      if (!user) {
        currentProfile = {};
        showLoginState('Connecte-toi avec Google pour accéder au site.');
        showNicknameStep(false);
        if (loginHint) loginHint.textContent = 'Ton nickname sera demandé juste après la connexion.';
        return;
      }

      try {
        currentProfile = await loadProfile(user.uid);
        const nickname = normalizeNickname(currentProfile.nickname || context?.profile?.nickname || '');

        if (nickname) {
          showLoginState(`Bienvenue ${nickname} ! Redirection...`);
          showNicknameStep(false);
          navigateTo(getRedirectTarget(), { replace: true });
          return;
        }

        showLoginState('Choisis ton nickname unique pour terminer la connexion.');
        showNicknameStep(true);
        if (loginHint) loginHint.textContent = 'Ce nickname est unique, sans différence entre majuscules et minuscules.';
        nicknameInput?.focus();
      } catch (error) {
        currentProfile = {};
        showLoginState(error.message);
        showNicknameStep(false);
        if (loginHint) loginHint.textContent = 'Recharge la page après avoir rétabli la connexion.';
      }
    }
  });

  return () => {
    cleanupCommon?.();
    saveNicknameBtn?.removeEventListener('click', saveNickname);
  };
};
