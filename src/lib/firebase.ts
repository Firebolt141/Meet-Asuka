import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported as isAnalyticsSupported } from "firebase/analytics";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

export const hasFirebaseConfig = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
);

export const firebaseProjectId = firebaseConfig.projectId ?? "";

export const missingFirebaseEnvVars = [
  !firebaseConfig.apiKey ? "NEXT_PUBLIC_FIREBASE_API_KEY" : null,
  !firebaseConfig.authDomain ? "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" : null,
  !firebaseConfig.projectId ? "NEXT_PUBLIC_FIREBASE_PROJECT_ID" : null,
  !firebaseConfig.appId ? "NEXT_PUBLIC_FIREBASE_APP_ID" : null
].filter((value): value is string => value !== null);

let db: Firestore | null = null;
let app: FirebaseApp | null = null;

if (hasFirebaseConfig) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  db = getFirestore(app);

  if (typeof window !== "undefined") {
    void isAnalyticsSupported().then((supported) => {
      if (supported && app) {
        getAnalytics(app);
      }
    });
  }
}

export { app, db };
