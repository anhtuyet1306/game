import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signInAnonymously,
  signOut, 
  onAuthStateChanged, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  addDoc, 
  getDocFromServer, 
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

// Error Handling Spec for Firestore Operations
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate Connection to Firestore
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();

// Auth Functions
export const initializeUserProfile = async (user: FirebaseUser) => {
  const path = `users/${user.uid}`;
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      await setDoc(doc(db, 'users', user.uid), {
        username: user.displayName || 'Người chơi ẩn danh',
        email: user.email,
        role: 'user',
        createdAt: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const loginWithGoogle = async () => {
  const userAgent = navigator.userAgent || '';
  const isZalo = /Zalo/i.test(userAgent);
  const isFB = /FBAN|FBAV/i.test(userAgent);
  
  // In-app browsers (Zalo, FB) block popups, so use redirect.
  const useRedirect = isZalo || isFB;
  
  try {
    if (useRedirect) {
      await signInWithRedirect(auth, googleProvider);
    } else {
      const result = await signInWithPopup(auth, googleProvider);
      await initializeUserProfile(result.user);
      return result.user;
    }
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

export const loginAnonymously = async () => {
  try {
    const result = await signInAnonymously(auth);
    await initializeUserProfile(result.user);
    return result.user;
  } catch (error) {
    console.error('Anonymous login error:', error);
    throw error;
  }
};

export const handleRedirectResult = async () => {
  try {
    const result = await getRedirectResult(auth);
    if (result) {
      await initializeUserProfile(result.user);
      return result.user;
    }
    return null;
  } catch (error) {
    console.error("Redirect login error:", error);
    throw error;
  }
};

export const logoutUser = () => signOut(auth);

// User Profile Functions
export const updateUsername = async (userId: string, newUsername: string) => {
  const path = `users/${userId}`;
  try {
    await setDoc(doc(db, 'users', userId), { username: newUsername }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const subscribeToUserProfile = (userId: string, callback: (data: any) => void) => {
  const path = `users/${userId}`;
  return onSnapshot(doc(db, 'users', userId), (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data());
    }
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  });
};

// Data Functions
export const saveGameRecord = async (userId: string, username: string, score: number, total: number) => {
  const path = 'history';
  try {
    await addDoc(collection(db, path), {
      userId,
      username,
      score,
      total,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const subscribeToLeaderboard = (callback: (data: any[]) => void) => {
  const path = 'history';
  const q = query(collection(db, path), orderBy('score', 'desc'), limit(100));
  
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Simple deduplication for leaderboard (top score per user)
    const userMaxScores: Record<string, any> = {};
    data.forEach((record: any) => {
      if (!userMaxScores[record.userId] || record.score > userMaxScores[record.userId].score) {
        userMaxScores[record.userId] = record;
      }
    });
    const sorted = Object.values(userMaxScores).sort((a, b) => b.score - a.score);
    callback(sorted);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
};

export const subscribeToUserStats = (userId: string, callback: (stats: any) => void) => {
  const path = 'history';
  const q = query(collection(db, path)); // In a real app, you'd filter by userId here, but for simplicity we'll filter in JS or use a composite index
  
  return onSnapshot(q, (snapshot) => {
    const userHistory = snapshot.docs
      .map(doc => doc.data())
      .filter((h: any) => h.userId === userId);
    
    const totalGames = userHistory.length;
    if (totalGames === 0) {
      callback({ totalGames: 0, avgScore: 0, correct: 0, incorrect: 0 });
      return;
    }

    let totalScore = 0;
    let totalQuestions = 0;
    
    userHistory.forEach((h: any) => {
      totalScore += h.score;
      totalQuestions += h.total;
    });

    callback({
      totalGames,
      avgScore: Math.round((totalScore / totalGames) * 10) / 10,
      correct: totalScore,
      incorrect: totalQuestions - totalScore
    });
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
};
