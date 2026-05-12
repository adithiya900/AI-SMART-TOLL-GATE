import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Use env vars first, fall back to hardcoded values
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || "AIzaSyAh4_D81G91lXuPkOagJYUsNeIVgLq9RfU",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "smart-toll-ai.firebaseapp.com",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || "smart-toll-ai",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || "smart-toll-ai.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID|| "415985518488",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || "1:415985518488:web:e28c5b8af80c4f45880ded",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const signIn = async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error('Sign in error:', error);
    alert('Login failed: ' + (error as Error).message);
  }
};
export const signOut = () => auth.signOut();
export const loginAnonymously = () => signInAnonymously(auth);

// Auto sign-in anonymously on load so Firestore auth rules are always satisfied
signInAnonymously(auth).catch((err) => {
  console.warn('[Firebase] Anonymous auto-login failed:', err.message);
});
