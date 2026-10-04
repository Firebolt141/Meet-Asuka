import type { PlannerItem } from "@/components/Calendar";

// One-way, additive sync from the planner into a Google calendar on the phone.
// Events are written to the device calendar (Android CalendarContract) and the
// phone's Google account syncs them to Google Calendar.
//
// - New planner items are created as calendar events.
// - Planner items that changed since the last sync replace their calendar event.
// - Planner items deleted in the app are left untouched in the calendar.
//
// The mapping of planner item -> calendar event lives in localStorage because
// calendar event ids are specific to this device.

const isCapacitor = () =>
  typeof window !== "undefined" && !!(window as unknown as Record<string, unknown>).Capacitor;

const STORAGE_KEY = "asuka_google_calendar_sync";

type SyncedEvent = { eventId: string; hash: string };

type SyncState = {
  calendarId: string | null;
  events: Record<string, SyncedEvent>;
  lastSyncedAt: number | null;
};

export type SyncCalendarOption = { id: string; title: string; account: string };

export type SyncResult = {
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  duplicatesRemoved: number;
  // What the duplicate check saw, shown in the app to help diagnose sync issues.
  diagnostics: string;
};

const emptyState = (): SyncState => ({ calendarId: null, events: {}, lastSyncedAt: null });

function loadState(): SyncState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...emptyState(), ...(JSON.parse(raw) as Partial<SyncState>) } : emptyState();
  } catch {
    return emptyState();
  }
}

function saveState(state: SyncState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

export const isCalendarSyncSupported = (): boolean => isCapacitor();

export const getLastCalendarSyncAt = (): number | null => loadState().lastSyncedAt;

export const getSelectedSyncCalendarId = (): string | null => loadState().calendarId;

export function setSelectedSyncCalendarId(calendarId: string): void {
  const state = loadState();
  if (state.calendarId === calendarId) return;
  // Events created in a different calendar don't count for the new one, so
  // the next sync pushes everything again into the newly chosen calendar.
  saveState({ calendarId, events: {}, lastSyncedAt: null });
}

async function getPlugin() {
  return import("@ebarooni/capacitor-calendar");
}

async function ensurePermission(): Promise<void> {
  if (!isCapacitor()) {
    throw new Error("Google Calendar sync is only available in the Android app.");
  }
  const { CapacitorCalendar } = await getPlugin();
  const { result } = await CapacitorCalendar.requestFullCalendarAccess();
  if (result !== "granted") {
    throw new Error("Calendar permission is needed to sync. Enable it in the phone's app settings.");
  }
}

// Google account calendars the user owns (e.g. "you@gmail.com"). Holiday and
// birthday calendars have a different owner and are skipped.
export async function listSyncCalendars(): Promise<SyncCalendarOption[]> {
  await ensurePermission();
  const { CapacitorCalendar } = await getPlugin();
  const { result } = await CapacitorCalendar.listCalendars();
  return result
    .filter(
      (cal) =>
        cal.allowsContentModifications !== false &&
        !!cal.accountName &&
        cal.accountName.includes("@") &&
        cal.ownerAccount === cal.accountName
    )
    .map((cal) => ({ id: cal.id, title: cal.title ?? cal.accountName ?? "Calendar", account: cal.accountName ?? "" }));
}

// ---------- Planner item -> calendar event ----------

const MINUTE = 60 * 1000;

const parseDate = (value: string | undefined): [number, number, number] | null => {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  return match ? [Number(match[1]), Number(match[2]) - 1, Number(match[3])] : null;
};

const parseTime = (value: string | undefined): [number, number] | null => {
  const match = value ? /^(\d{1,2}):(\d{2})/.exec(value) : null;
  return match ? [Number(match[1]), Number(match[2])] : null;
};

const RECURRENCE: Record<string, "daily" | "weekly" | "monthly" | "yearly"> = {
  daily: "daily",
  weekly: "weekly",
  monthly: "monthly",
  yearly: "yearly"
};

const CATEGORY_LABEL: Record<PlannerItem["category"], string> = {
  trip: "Trip",
  event: "Event",
  todo: "Todo",
  wishlist: "Wishlist"
};

type EventPlan = {
  title: string;
  description: string;
  location?: string;
  isAllDay: boolean;
  startDate: number;
  endDate: number; // all-day: local midnight of the last (inclusive) day
  recurrence?: "daily" | "weekly" | "monthly" | "yearly";
  alerts?: number[];
};

function buildEventPlan(item: PlannerItem, ownerLabel: (owner: PlannerItem["owner"]) => string): EventPlan | null {
  const startDay = parseDate(item.date);
  if (!startDay) return null;
  const endDay = parseDate(item.endDate) ?? startDay;
  const startTime = parseTime(item.startTime);

  let isAllDay: boolean;
  let startDate: number;
  let endDate: number;

  if (startTime) {
    isAllDay = false;
    startDate = new Date(startDay[0], startDay[1], startDay[2], startTime[0], startTime[1]).getTime();
    const endTime = parseTime(item.endTime);
    endDate = endTime
      ? new Date(endDay[0], endDay[1], endDay[2], endTime[0], endTime[1]).getTime()
      : startDate + 60 * MINUTE;
    if (endDate <= startDate) endDate = startDate + 60 * MINUTE;
  } else {
    isAllDay = true;
    startDate = new Date(startDay[0], startDay[1], startDay[2]).getTime();
    endDate = Math.max(startDate, new Date(endDay[0], endDay[1], endDay[2]).getTime());
  }

  let reminderAt: number | null = null;
  if (item.reminderAt) {
    reminderAt = new Date(item.reminderAt).getTime();
  } else if (item.reminderDays != null) {
    // Legacy format: days before the item date at 9 AM
    reminderAt = new Date(startDay[0], startDay[1], startDay[2], 9).getTime() - item.reminderDays * 24 * 60 * MINUTE;
  }
  const alerts =
    reminderAt !== null && !Number.isNaN(reminderAt) ? [Math.round((reminderAt - startDate) / MINUTE)] : undefined;

  const descriptionLines = [
    `${CATEGORY_LABEL[item.category]} · ${ownerLabel(item.owner)}`,
    item.participants ? `With: ${item.participants}` : "",
    item.details ?? ""
  ].filter(Boolean);

  return {
    title: item.title || CATEGORY_LABEL[item.category],
    description: descriptionLines.join("\n\n"),
    location: item.location || undefined,
    isAllDay,
    startDate,
    endDate,
    recurrence: item.recurring ? RECURRENCE[item.recurring] : undefined,
    alerts
  };
}

const hashPlan = (plan: EventPlan): string => JSON.stringify(plan);

async function createEvent(calendarId: string, plan: EventPlan): Promise<string> {
  const { CapacitorCalendar } = await getPlugin();
  const base = {
    calendarId,
    title: plan.title,
    description: plan.description,
    location: plan.location,
    alerts: plan.alerts
  };

  if (!plan.recurrence) {
    const { id } = await CapacitorCalendar.createEvent({
      ...base,
      isAllDay: plan.isAllDay,
      startDate: plan.startDate,
      endDate: plan.endDate
    });
    if (!id) throw new Error("Calendar did not return an event id");
    return id;
  }

  // Android requires recurring events to use DURATION instead of an end time.
  if (!plan.isAllDay) {
    const minutes = Math.max(1, Math.round((plan.endDate - plan.startDate) / MINUTE));
    const { id } = await CapacitorCalendar.createEvent({
      ...base,
      startDate: plan.startDate,
      duration: `PT${minutes}M`,
      recurrence: { frequency: plan.recurrence }
    });
    if (!id) throw new Error("Calendar did not return an event id");
    return id;
  }

  // The plugin always writes an end time for all-day events, which breaks
  // recurring ones. Create it as a timed event starting at UTC midnight with a
  // day-based DURATION, then flip it to all-day (which only sets ALL_DAY and
  // the UTC timezone, leaving start, duration and recurrence as they are).
  const start = new Date(plan.startDate);
  const end = new Date(plan.endDate);
  const days = Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
    Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / (24 * 60 * MINUTE)) + 1;
  const { id } = await CapacitorCalendar.createEvent({
    ...base,
    startDate: Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()),
    duration: `P${days}D`,
    recurrence: { frequency: plan.recurrence }
  });
  if (!id) throw new Error("Calendar did not return an event id");
  await CapacitorCalendar.modifyEvent({ id, isAllDay: true });
  return id;
}

// ---------- Duplicate detection ----------

const DAY = 24 * 60 * MINUTE;

const ymd = (date: Date, utc: boolean) =>
  utc
    ? `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`
    : `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

// Google may rewrite an event's text after it syncs (HTML line breaks,
// different whitespace), so text is compared in a normalized form.
const NAMED_ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", middot: "·", quot: '"', apos: "'", lt: "<", gt: ">" };
const toPlainText = (value: string) =>
  value
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (entity, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? entity)
    .replace(/\u00a0/g, " ");
const squash = (value: string) => value.replace(/\s+/g, " ").trim();
const normalizeText = (value: string) => squash(toPlainText(value));
const firstLine = (value: string) => squash(toPlainText(value).trim().split("\n")[0] ?? "");

// Identifies "the same event" regardless of which calendar row holds it:
// title, the "<Category> · <Owner>" line and when the event (or its series)
// starts, to the minute. All-day events are stored at UTC midnight, so they
// are compared by calendar day.
const eventKey = (title: string, description: string, isAllDay: boolean, start: number) => {
  const date = new Date(start);
  const isUtcMidnight = date.getUTCHours() === 0 && date.getUTCMinutes() === 0;
  const when = isAllDay
    ? ymd(date, isUtcMidnight)
    : `${ymd(date, false)} ${date.getHours()}:${date.getMinutes()}`;
  return JSON.stringify([squash(title), firstLine(description), isAllDay, when]);
};

const planKey = (plan: EventPlan) => eventKey(plan.title, plan.description, plan.isAllDay, plan.startDate);

// Only events this app created are ever considered: their description starts
// with "<Category> · <Owner>". The user's own calendar events are never touched.
const APP_DESCRIPTION_PREFIXES = Object.values(CATEGORY_LABEL).map((label) => `${label} · `);
const isAppEvent = (description: string | null) =>
  !!description && APP_DESCRIPTION_PREFIXES.some((prefix) => normalizeText(description).startsWith(prefix));

type FoundEvent = { id: string; description: string };

// Events the user created themselves, keyed by title and the day the event (or
// its series) starts. Used to replace a user's own copy of a plan.
const dayKey = (title: string, isAllDay: boolean, start: number) => {
  const date = new Date(start);
  const isUtcMidnight = date.getUTCHours() === 0 && date.getUTCMinutes() === 0;
  return JSON.stringify([squash(title), ymd(date, isAllDay && isUtcMidnight)]);
};

type FindResult = { groups: Map<string, FoundEvent[]>; userEvents: Map<string, string[]>; diagnostics: string };

// Calendar events created by this app, grouped by eventKey. Each group lists the
// distinct event (series) ids; more than one means duplicates.
async function findAppEvents(calendarId: string, plans: EventPlan[]): Promise<FindResult> {
  const groups = new Map<string, FoundEvent[]>();
  const userEvents = new Map<string, string[]>();
  if (plans.length === 0) return { groups, userEvents, diagnostics: "no dated plans" };

  const { CapacitorCalendar } = await getPlugin();
  const starts = plans.map((plan) => plan.startDate);
  const { result } = await CapacitorCalendar.listEventsInRange({
    from: Math.min(...starts) - 2 * DAY,
    to: Math.max(...starts) + 2 * DAY
  });

  // For diagnostics: same title on the same day in this calendar, app event or not.
  const lookalikes = new Map<string, typeof result>();
  let inCalendar = 0;
  let appEvents = 0;

  for (const event of result) {
    if (event.calendarId !== calendarId) continue;
    inCalendar += 1;
    const day = `${squash(event.title)}|${ymd(new Date(event.startDate), false)}`;
    lookalikes.set(day, [...(lookalikes.get(day) ?? []), event]);

    if (!isAppEvent(event.description)) {
      const seriesId = event.masterId ?? event.id;
      const key = dayKey(event.title, event.isAllDay, event.seriesStartDate ?? event.startDate);
      const ids = userEvents.get(key) ?? [];
      if (!ids.includes(seriesId)) ids.push(seriesId);
      userEvents.set(key, ids);
      continue;
    }
    appEvents += 1;
    const seriesId = event.masterId ?? event.id;
    const key = eventKey(event.title, event.description ?? "", event.isAllDay, event.seriesStartDate ?? event.startDate);
    const found = groups.get(key) ?? [];
    if (!found.some((entry) => entry.id === seriesId)) {
      found.push({ id: seriesId, description: normalizeText(event.description ?? "") });
    }
    groups.set(key, found);
  }

  const duplicateGroups = [...groups.values()].filter((found) => found.length > 1).length;
  const lookalikeGroups = [...lookalikes.values()].filter((events) => events.length > 1);
  const sample = lookalikeGroups[0];
  const sampleText = sample
    ? ` Example "${sample[0].title}": ` +
      sample
        .map((event) => {
          const app = isAppEvent(event.description) ? "app" : "not app";
          const desc = JSON.stringify((event.description ?? "").slice(0, 24));
          return `#${event.id}/${event.masterId ?? "-"} ${app} ${event.isAllDay ? "all-day" : "timed"} ${desc}`;
        })
        .join(" | ")
    : "";
  const diagnostics =
    `Checked ${result.length} events, ${inCalendar} in this calendar, ${appEvents} from this app; ` +
    `${duplicateGroups} duplicate groups, ${lookalikeGroups.length} same-title-same-day groups.` +
    sampleText;
  return { groups, userEvents, diagnostics };
}

async function removeEvents(eventIds: string[]): Promise<{ deleted: number; problem: string }> {
  if (eventIds.length === 0) return { deleted: 0, problem: "" };
  const { CapacitorCalendar, EventSpan } = await getPlugin();
  try {
    const { result } = await CapacitorCalendar.deleteEventsById({
      ids: eventIds,
      span: EventSpan.THIS_AND_FUTURE_EVENTS
    });
    return { deleted: result.deleted.length, problem: result.failed.length ? `${result.failed.length} deletes failed` : "" };
  } catch (error) {
    return { deleted: 0, problem: `delete error: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// ---------- Sync ----------

export async function syncToGoogleCalendar(
  items: PlannerItem[],
  ownerLabel: (owner: PlannerItem["owner"]) => string,
  onProgress?: (done: number, total: number) => void
): Promise<SyncResult> {
  await ensurePermission();

  const state = loadState();
  if (!state.calendarId) {
    throw new Error("Choose a Google calendar to sync to first.");
  }
  const calendarId = state.calendarId;

  const result: SyncResult = { created: 0, updated: 0, unchanged: 0, failed: 0, duplicatesRemoved: 0, diagnostics: "" };

  const planned = items
    .map((item) => ({ item, plan: buildEventPlan(item, ownerLabel) }))
    .filter((entry): entry is { item: PlannerItem; plan: EventPlan } => entry.plan !== null); // skips undated items

  // Clean up duplicates (e.g. from an earlier interrupted sync), keeping the
  // copy this phone already tracks. A plan that has a matching event but no
  // record here (e.g. after reinstalling the app) adopts that event instead of
  // creating another copy.
  let groups = new Map<string, FoundEvent[]>();
  let userEvents = new Map<string, string[]>();
  try {
    const found = await findAppEvents(calendarId, planned.map((entry) => entry.plan));
    groups = found.groups;
    userEvents = found.userEvents;
    result.diagnostics = found.diagnostics;
  } catch (error) {
    result.diagnostics = `Couldn't read the calendar: ${error instanceof Error ? error.message : String(error)}`;
  }
  // Events tracked for plans that still exist in the app. Events tracked for
  // plans deleted in the app are kept too, but only one copy of each.
  const currentIds = new Set(planned.map(({ item }) => state.events[item.id]?.eventId).filter(Boolean));
  const trackedIds = new Set(Object.values(state.events).map((synced) => synced.eventId));
  const extraIds: string[] = [];
  for (const { item, plan } of planned) {
    const found = groups.get(planKey(plan));
    const existing = state.events[item.id];
    if (!found || (existing && found.some((entry) => entry.id === existing.eventId))) continue; // already tracked
    const adopted = found.find((entry) => !currentIds.has(entry.id));
    if (!adopted) continue;
    // An untracked copy of this plan already exists: track it instead of
    // creating another. A previously tracked older version is replaced by it.
    if (existing) {
      extraIds.push(existing.eventId);
      currentIds.delete(existing.eventId);
    }
    // If its details differ from the plan, an empty hash makes the update step
    // below replace it with an up-to-date event.
    const upToDate = adopted.description === normalizeText(plan.description);
    state.events[item.id] = { eventId: adopted.id, hash: upToDate ? hashPlan(plan) : "" };
    currentIds.add(adopted.id);
  }
  // Events the user had already added themselves for a current plan (same
  // title, same start day) are replaced by the app's copy, so edits sync.
  for (const { plan } of planned) {
    for (const id of userEvents.get(dayKey(plan.title, plan.isAllDay, plan.startDate)) ?? []) {
      if (!trackedIds.has(id) && !extraIds.includes(id)) extraIds.push(id);
    }
  }
  for (const found of groups.values()) {
    if (found.length < 2) continue;
    const ids = found.map((entry) => entry.id);
    const keep = ids.filter((id) => currentIds.has(id));
    if (keep.length === 0) keep.push(ids.find((id) => trackedIds.has(id)) ?? ids[0]);
    extraIds.push(...ids.filter((id) => !keep.includes(id)));
  }
  const removal = await removeEvents(extraIds);
  result.duplicatesRemoved = removal.deleted;
  if (removal.problem) result.diagnostics += ` (${removal.problem})`;
  for (const [itemId, synced] of Object.entries(state.events)) {
    if (extraIds.includes(synced.eventId) && !currentIds.has(synced.eventId)) delete state.events[itemId];
  }
  saveState(state);

  for (const [index, { item, plan }] of planned.entries()) {
    onProgress?.(index, planned.length);
    const hash = hashPlan(plan);
    const existing = state.events[item.id];
    if (existing && existing.hash === hash) {
      result.unchanged += 1;
      continue;
    }

    try {
      if (existing) await removeEvents([existing.eventId]);
      const eventId = await createEvent(calendarId, plan);
      state.events[item.id] = { eventId, hash };
      if (existing) result.updated += 1;
      else result.created += 1;
      saveState(state); // persist progress so an interrupted sync never duplicates events
    } catch {
      result.failed += 1;
    }
  }

  state.lastSyncedAt = Date.now();
  saveState(state);
  return result;
}
