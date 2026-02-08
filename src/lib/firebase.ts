import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported as isAnalyticsSupported } from "firebase/analytics";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA6QqoOnk2VXXRcelloczm6cG-zB4hCp1M",
  authDomain: "meet-asuka.firebaseapp.com",
  projectId: "meet-asuka",
  storageBucket: "meet-asuka.firebasestorage.app",
  messagingSenderId: "136696135772",
  appId: "1:136696135772:web:096f5562415955d97fe699",
  measurementId: "G-FH9SRPTR6B"
};

const hasFirebaseConfig = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

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
