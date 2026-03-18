import { firebaseConfig } from './firebase-config.js';
import {
  GoogleAuthProvider,
  getAuth,
  getDatabase,
  initializeApp
} from './firebase-sdk.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const authRuntimeState = {
  persistence: 'session',
  level: 'info',
  notice: ''
};

export { app, auth, authRuntimeState, db, provider };
