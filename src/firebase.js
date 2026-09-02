import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Projeto real: app-gestao-ml (Firestore em southamerica-east1 / São Paulo).
const firebaseConfig = {
  apiKey: 'AIzaSyB_cfKAqAXEEbkQFH2BkEGFYq41Px6nCL0',
  authDomain: 'app-gestao-ml.firebaseapp.com',
  projectId: 'app-gestao-ml',
  storageBucket: 'app-gestao-ml.firebasestorage.app',
  messagingSenderId: '950927197047',
  appId: '1:950927197047:web:f0fca0127feae9e1f6d772'
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
// Selfies do check-in de presença (ver CheckinPublicScreen.jsx) — bucket já
// existia na config, só faltava inicializar o SDK de Storage no código.
export const storage = getStorage(app);
