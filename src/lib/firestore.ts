import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";

import { db, firebaseProjectId, hasFirebaseConfig, missingFirebaseEnvVars } from "@/lib/firebase";
import type { PlannerItem } from "@/components/Calendar";

export const isFirebaseConfigured = hasFirebaseConfig;
export const configuredProjectId = firebaseProjectId;
export const missingFirebaseConfigVars = missingFirebaseEnvVars;


const stripUndefinedDeep = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefinedDeep(entry)) as T;
  }

  if (value && typeof value === "object") {
    const cleaned = Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (acc, [key, entry]) => {
        if (entry === undefined) {
          return acc;
        }
        acc[key] = stripUndefinedDeep(entry);
        return acc;
      },
      {}
    );

    return cleaned as T;
  }

  return value;
};

export const configuredProjectId = firebaseProjectId;
export const missingFirebaseConfigVars = missingFirebaseEnvVars;

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
  await setDoc(doc(plannerCollection, item.id), stripUndefinedDeep(item));
};

export const updatePlannerItem = async (
  id: string,
  updates: Omit<PlannerItem, "id">
): Promise<void> => {
  if (!db) {
    return;
  }
  const plannerCollection = collection(db, "plannerItems");
  await updateDoc(doc(plannerCollection, id), stripUndefinedDeep(updates));
};

export const deletePlannerItem = async (id: string): Promise<void> => {
  if (!db) {
    return;
  }
  const plannerCollection = collection(db, "plannerItems");
  await deleteDoc(doc(plannerCollection, id));
};

export const deletePlannerItem = async (id: string): Promise<void> => {
  if (!db) {
    return;
  }
  const plannerCollection = collection(db, "plannerItems");
  await deleteDoc(doc(plannerCollection, id));
};
