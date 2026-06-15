// Firebase app + Firestore handle, shared across the app. Config is the web
// SDK config from the Firebase console (safe to ship in a client bundle — access
// is governed by Firestore security rules, not by hiding these values).
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyCLjLpVj5XZ8mWZOj1dP59pJ1M8mYPiQ10',
  authDomain: 'home-center-fb216.firebaseapp.com',
  projectId: 'home-center-fb216',
  storageBucket: 'home-center-fb216.firebasestorage.app',
  messagingSenderId: '152053039833',
  appId: '1:152053039833:web:c0ceda6bf700bb260cf4c8',
}

export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
