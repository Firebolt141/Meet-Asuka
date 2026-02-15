import { collection, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";

import { db, hasFirebaseConfig } from "@/lib/firebase";
import type { PlannerItem } from "@/components/Calendar";

export const isFirebaseConfigured = hasFirebaseConfig;

export const getPlannerItems = async (): Promise<PlannerItem[]> => {
  if (!db) {
    return [];
  }
  const plannerCollection = collection(db, "plannerItems");
  const snapshot = await getDocs(plannerCollection);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<PlannerItem, "id">)
  }));
};

export const addPlannerItem = async (item: PlannerItem): Promise<void> => {
  if (!db) {
    return;
  }
  const plannerCollection = collection(db, "plannerItems");
  await setDoc(doc(plannerCollection, item.id), item);
};

export const updatePlannerItem = async (
  id: string,
  updates: Omit<PlannerItem, "id">
): Promise<void> => {
  if (!db) {
    return;
  }
  const plannerCollection = collection(db, "plannerItems");
  await updateDoc(doc(plannerCollection, id), updates);
};
