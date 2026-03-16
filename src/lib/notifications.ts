import type { PlannerItem } from "@/components/Calendar";

// Detect if running inside a Capacitor native shell
const isCapacitor = () =>
  typeof window !== "undefined" && !!(window as unknown as Record<string, unknown>).Capacitor;

// ---------- Permission ----------

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (isCapacitor()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const result = await LocalNotifications.requestPermissions();
      return result.display === "granted";
    } catch {
      return false;
    }
  }

  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  const result = await Notification.requestPermission();
  return result === "granted";
}

export function notificationPermissionStatus(): "granted" | "denied" | "default" | "unsupported" {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function getNotificationPermissionStatus(): Promise<"granted" | "denied" | "default" | "unsupported"> {
  if (typeof window === "undefined") return "unsupported";

  if (isCapacitor()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const result = await LocalNotifications.checkPermissions();
      if (result.display === "granted") return "granted";
      if (result.display === "denied") return "denied";
      return "default"; // "prompt" or "prompt-with-rationale"
    } catch {
      return "default"; // show banner anyway so user can attempt to enable
    }
  }

  if (!("Notification" in window)) return "unsupported";
  return Notification.permission as "granted" | "denied" | "default";
}

// ---------- Scheduling ----------

export type ScheduledReminder = {
  id: string; // planner item id + offset key
  title: string;
  body: string;
  fireAt: Date;
};

const STORAGE_KEY = "asuka_scheduled_reminders";

function getScheduledIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markScheduled(ids: string[]): void {
  try {
    const existing = getScheduledIds();
    for (const id of ids) existing.add(id);
    // Prune old entries to keep storage tidy — keep only future-dated ones
    const all = Array.from(existing);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore storage errors
  }
}

function buildReminders(items: PlannerItem[]): ScheduledReminder[] {
  const now = new Date();
  const reminders: ScheduledReminder[] = [];
  const scheduled = getScheduledIds();

  for (const item of items) {
    if (item.completed) continue;
    if (!item.date) continue;

    let fireAt: Date;
    let reminderId: string;

    if (item.reminderAt) {
      fireAt = new Date(item.reminderAt);
      reminderId = `${item.id}:${item.reminderAt}`;
    } else if (item.reminderDays != null) {
      // Legacy format: days before at 9 AM
      const [y, m, d] = item.date.split("-").map(Number);
      const itemDate = new Date(y, m - 1, d, 9, 0, 0);
      fireAt = new Date(itemDate.getTime() - item.reminderDays * 24 * 60 * 60 * 1000);
      reminderId = `${item.id}:${item.reminderDays}`;
    } else {
      continue;
    }

    if (fireAt <= now) continue; // already passed
    if (scheduled.has(reminderId)) continue;

    const msUntil = fireAt.getTime() - now.getTime();
    const daysUntil = Math.floor(msUntil / (24 * 60 * 60 * 1000));
    const daysLabel = daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : `In ${daysUntil} days`;

    const emoji: Record<PlannerItem["category"], string> = {
      trip: "✈️",
      event: "📅",
      todo: "✅",
      wishlist: "⭐"
    };

    reminders.push({
      id: reminderId,
      title: `${emoji[item.category]} ${daysLabel}: ${item.title}`,
      body:
        item.category === "trip"
          ? `Your trip starts ${daysUntil === 0 ? "today" : `on ${item.date}`}!`
          : item.category === "event"
          ? `${item.startTime ? `at ${item.startTime}` : ""} ${item.location ? `@ ${item.location}` : ""}`.trim() ||
            `Don't forget your event on ${item.date}`
          : `Due: ${item.date}`,
      fireAt
    });
  }

  return reminders;
}

async function scheduleCapacitorReminders(reminders: ScheduledReminder[]): Promise<void> {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const notifications = reminders.map((r, i) => ({
    id: Math.abs(hashCode(r.id)) % 2147483647,
    title: r.title,
    body: r.body,
    schedule: { at: r.fireAt },
    sound: undefined,
    actionTypeId: "",
    extra: null
  }));
  await LocalNotifications.schedule({ notifications });
}

function scheduleWebReminder(reminder: ScheduledReminder): void {
  const delay = reminder.fireAt.getTime() - Date.now();
  if (delay <= 0) return;

  // Cap at ~24 days (setTimeout max safe value is ~24.8 days)
  if (delay > 24 * 24 * 60 * 60 * 1000) return;

  setTimeout(() => {
    if (Notification.permission !== "granted") return;
    try {
      // Show via service worker if available for persistence
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "SHOW_NOTIFICATION",
          title: reminder.title,
          body: reminder.body
        });
      } else {
        new Notification(reminder.title, {
          body: reminder.body,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: reminder.id
        });
      }
    } catch {
      // Notifications may be blocked
    }
  }, delay);
}

export async function scheduleReminders(items: PlannerItem[]): Promise<void> {
  if (typeof window === "undefined") return;

  const reminders = buildReminders(items);
  if (reminders.length === 0) return;

  if (isCapacitor()) {
    try {
      await scheduleCapacitorReminders(reminders);
    } catch {
      // Fall back to web
      for (const r of reminders) scheduleWebReminder(r);
    }
  } else {
    for (const r of reminders) scheduleWebReminder(r);
  }

  markScheduled(reminders.map((r) => r.id));
}

// ---------- Utilities ----------

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
