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

// App events are pink: Google Calendar's "Flamingo" event color (colorId 4).
// Events synced earlier in another color are recolored in place on the next sync.
const SYNC_COLOR = { key: "4", name: "Flamingo", hex: "#E67C73" };

// A calendar event as listed by the native helper (one-off events and
// recurring series; exceptions to a series are left out).
type CalendarRow = {
  id: string;
  calendarId: string;
  title: string | null;
  description: string | null;
  dtstart: number;
  allDay: boolean;
  rrule: string | null;
  syncId: string | null;
  dirty: number;
  organizer: string | null;
  accountType: string | null;
  calendarName: string | null;
  colorKey: string | null;
};

type EventInsert = {
  title: string;
  description: string;
  location?: string;
  dtstart: number;
  dtend?: number;
  duration?: string;
  rrule?: string;
  allDay: boolean;
  timezone: string;
  reminders: number[]; // minutes before the start
  colorKey?: string;
  color?: string;
};

type CalendarToolsPlugin = {
  listEvents(options: { calendarId?: string }): Promise<{ events: CalendarRow[] }>;
  applyChanges(options: {
    calendarId?: string;
    deletes?: string[];
    inserts?: EventInsert[];
    recolors?: { id: string; colorKey: string; color: string }[];
  }): Promise<{ insertedIds: (string | null)[]; deleted: number; errors: string[] }>;
};

// Native helper in the Android app (android/.../CalendarToolsPlugin.java):
// one query to list events and batched transactions to change them, which is
// much faster than a plugin call per event.
let calendarTools: CalendarToolsPlugin | null = null;
async function getCalendarTools(): Promise<CalendarToolsPlugin> {
  if (!calendarTools) {
    const { registerPlugin } = await import("@capacitor/core");
    const native = registerPlugin<CalendarToolsPlugin>("CalendarTools");
    // A stuck call ends with a clear error instead of an endless "Syncing…".
    calendarTools = {
      listEvents: (options) => withTimeout(native.listEvents(options), 30_000, "Reading the calendar"),
      applyChanges: (options) => withTimeout(native.applyChanges(options), 90_000, "Saving to the calendar")
    };
  }
  return calendarTools;
}

function withTimeout<T>(promise: Promise<T>, ms: number, step: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${step} took too long (over ${ms / 1000}s).`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

type SyncedEvent = { eventId: string; hash: string; colorKey?: string };

type SyncState = {
  calendarId: string | null;
  colorKey?: string;
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
  outOfScopeRemoved: number;
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
  saveState({ calendarId, colorKey: state.colorKey, events: {}, lastSyncedAt: null });
}

async function getPlugin() {
  return import("@ebarooni/capacitor-calendar");
}

async function ensurePermission(): Promise<void> {
  if (!isCapacitor()) {
    throw new Error("Google Calendar sync is only available in the Android app.");
  }
  const { CapacitorCalendar } = await withTimeout(getPlugin(), 15_000, "Loading the calendar plugin");
  const { result } = await withTimeout(CapacitorCalendar.requestFullCalendarAccess(), 120_000, "Asking for calendar permission");
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
const DAY = 24 * 60 * MINUTE;

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

// Hashes saved by the version that included the color in the plan still count
// as the same plan; the color is handled separately now.
const sameHash = (saved: string, hash: string): boolean => {
  if (saved === hash) return true;
  try {
    const parsed = JSON.parse(saved) as Record<string, unknown>;
    if (!("colorKey" in parsed)) return false;
    delete parsed.colorKey;
    return JSON.stringify(parsed) === hash;
  } catch {
    return false;
  }
};

const localTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const utcMidnight = (localTime: number) => {
  const date = new Date(localTime);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
};

// The calendar row for a plan. All-day events are stored at UTC midnight with
// an exclusive end; recurring events use a DURATION instead of an end time,
// as Android requires.
function toInsert(plan: EventPlan): EventInsert {
  const base = {
    title: plan.title,
    description: plan.description,
    ...(plan.location ? { location: plan.location } : {}),
    reminders: (plan.alerts ?? []).map((alert) => -alert).filter((minutes) => minutes >= 0),
    colorKey: SYNC_COLOR.key,
    color: SYNC_COLOR.hex
  };
  if (plan.isAllDay) {
    const dtstart = utcMidnight(plan.startDate);
    const exclusiveEnd = utcMidnight(plan.endDate) + DAY;
    const days = Math.max(1, Math.round((exclusiveEnd - dtstart) / DAY));
    return plan.recurrence
      ? { ...base, dtstart, allDay: true, timezone: "UTC", rrule: `FREQ=${plan.recurrence.toUpperCase()};INTERVAL=1`, duration: `P${days}D` }
      : { ...base, dtstart, dtend: exclusiveEnd, allDay: true, timezone: "UTC" };
  }
  const minutes = Math.max(1, Math.round((plan.endDate - plan.startDate) / MINUTE));
  return plan.recurrence
    ? { ...base, dtstart: plan.startDate, allDay: false, timezone: localTimezone(), rrule: `FREQ=${plan.recurrence.toUpperCase()};INTERVAL=1`, duration: `PT${minutes}M` }
    : { ...base, dtstart: plan.startDate, dtend: plan.endDate, allDay: false, timezone: localTimezone() };
}

// ---------- Which plans sync ----------

// The calendar belongs to Asuka, so only plans she is part of are synced:
// her own plans, shared ("Us") plans, and Shota's plans that list her as a
// participant.
const ASUKA_NAMES = /asuka|あすか|アスカ|明日香/i;
export const isAsukaInvolved = (item: PlannerItem): boolean =>
  item.owner !== "partner" || ASUKA_NAMES.test(item.participants ?? "");

// ---------- Duplicate detection ----------


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

type Scan = {
  groups: Map<string, FoundEvent[]>; // app events by eventKey
  userEvents: Map<string, string[]>; // the user's own events by dayKey
  diagnostics: string;
  sample: CalendarRow[];
};

// Sorts the calendar's events into the app's events and the user's own, and
// summarizes what it saw for the readout.
function scanCalendar(rows: CalendarRow[], allEventCount: number): Scan {
  const groups = new Map<string, FoundEvent[]>();
  const userEvents = new Map<string, string[]>();
  const lookalikes = new Map<string, CalendarRow[]>();
  let appEvents = 0;

  for (const row of rows) {
    const title = row.title ?? "";
    const day = `${squash(title)}|${ymd(new Date(row.dtstart), row.allDay)}`;
    lookalikes.set(day, [...(lookalikes.get(day) ?? []), row]);

    if (!isAppEvent(row.description)) {
      const key = dayKey(title, row.allDay, row.dtstart);
      userEvents.set(key, [...(userEvents.get(key) ?? []), row.id]);
      continue;
    }
    appEvents += 1;
    const key = eventKey(title, row.description ?? "", row.allDay, row.dtstart);
    const found = groups.get(key) ?? [];
    found.push({ id: row.id, description: normalizeText(row.description ?? "") });
    groups.set(key, found);
  }

  const duplicateGroups = [...groups.values()].filter((found) => found.length > 1).length;
  const lookalikeGroups = [...lookalikes.values()].filter((group) => group.length > 1);
  const sample = lookalikeGroups[0] ?? [];
  const diagnostics =
    `Checked ${allEventCount} events, ${rows.length} in this calendar, ${appEvents} from this app; ` +
    `${duplicateGroups} duplicate groups, ${lookalikeGroups.length} same-title-same-day groups.`;
  return { groups, userEvents, diagnostics, sample };
}

const describeRow = (row: CalendarRow) =>
  `#${row.id} ${isAppEvent(row.description) ? "app" : "not app"} ${row.allDay ? "all-day" : "timed"} ` +
  `${row.calendarName ?? "?"}/${row.accountType ?? "?"} sync=${row.syncId ? "y" : "n"} dirty=${row.dirty} ` +
  `org=${row.organizer ?? "-"} color=${row.colorKey ?? "-"}${row.rrule ? " recurring" : ""} ` +
  `${JSON.stringify((row.description ?? "").slice(0, 20))}`;

// ---------- Sync ----------

const APPLY_CHUNK = 40;

export async function syncToGoogleCalendar(
  items: PlannerItem[],
  ownerLabel: (owner: PlannerItem["owner"]) => string,
  onStatus?: (status: string) => void
): Promise<SyncResult> {
  onStatus?.("Checking calendar permission…");
  await ensurePermission();

  const state = loadState();
  if (!state.calendarId) {
    throw new Error("Choose a Google calendar to sync to first.");
  }
  const calendarId = state.calendarId;
  const colorKey = SYNC_COLOR.key;
  const color = SYNC_COLOR;
  const tools = await getCalendarTools();

  const result: SyncResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    duplicatesRemoved: 0,
    outOfScopeRemoved: 0,
    diagnostics: ""
  };

  const planned = items
    .filter(isAsukaInvolved)
    .map((item) => ({ item, plan: buildEventPlan(item, ownerLabel) }))
    .filter((entry): entry is { item: PlannerItem; plan: EventPlan } => entry.plan !== null); // skips undated items

  let scan: Scan = { groups: new Map(), userEvents: new Map(), diagnostics: "", sample: [] };
  try {
    onStatus?.("Reading calendar…");
    const rows = (await tools.listEvents({ calendarId })).events;
    scan = scanCalendar(rows, rows.length);
    result.diagnostics = scan.diagnostics;
  } catch (error) {
    // Without knowing what's already in the calendar, adding events could
    // create copies, so stop here.
    throw new Error(`Couldn't read the calendar: ${error instanceof Error ? error.message : String(error)}`);
  }
  const { groups, userEvents } = scan;

  // Clean up duplicates (e.g. from an earlier interrupted sync), keeping the
  // copy this phone already tracks. A plan that has a matching event but no
  // record here (e.g. after reinstalling the app) adopts that event instead of
  // creating another copy.
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
    // below replace it with an up-to-date event. Its color is unknown, so it
    // gets recolored.
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
  // Plans still in the app that are no longer synced (e.g. Shota-only plans)
  // have their events removed from the calendar.
  const outOfScope = items.filter((item) => !isAsukaInvolved(item) && state.events[item.id]);
  for (const item of outOfScope) {
    extraIds.push(state.events[item.id].eventId);
    delete state.events[item.id];
  }
  result.outOfScopeRemoved = outOfScope.length;
  for (const [itemId, synced] of Object.entries(state.events)) {
    if (extraIds.includes(synced.eventId) && !currentIds.has(synced.eventId)) delete state.events[itemId];
  }

  // Work out what changes: new and edited plans get a new event (an edited
  // plan's old event is deleted); unchanged plans in another color are
  // recolored in place.
  const deletes = [...extraIds];
  const recolors: { id: string; colorKey: string; color: string }[] = [];
  const toCreate: { item: PlannerItem; plan: EventPlan; replaced: boolean }[] = [];
  for (const { item, plan } of planned) {
    const hash = hashPlan(plan);
    const existing = state.events[item.id];
    if (existing && sameHash(existing.hash, hash)) {
      result.unchanged += 1;
      if (existing.colorKey !== colorKey) {
        recolors.push({ id: existing.eventId, colorKey: color.key, color: color.hex });
        state.events[item.id] = { eventId: existing.eventId, hash, colorKey };
      }
      continue;
    }
    if (existing) deletes.push(existing.eventId);
    toCreate.push({ item, plan, replaced: !!existing });
  }

  // Apply in a few batches; the record is saved after each one so an
  // interrupted sync never creates duplicates.
  const total = toCreate.length;
  onStatus?.(deletes.length || recolors.length ? `Cleaning up ${deletes.length + recolors.length} events…` : `Adding 0/${total}…`);
  const problems: string[] = [];
  try {
    // Deletes and recolors first. If deleting fails, edited plans keep their
    // old event rather than risk ending up with two.
    const removal = await tools.applyChanges({ calendarId, deletes, recolors });
    problems.push(...removal.errors);
    const deleteFailed = removal.errors.length > 0 && deletes.length > 0;
    result.duplicatesRemoved = Math.max(0, Math.min(removal.deleted, extraIds.length) - result.outOfScopeRemoved);
    const creatable = toCreate.filter(({ replaced }) => !(deleteFailed && replaced));
    result.failed += toCreate.length - creatable.length;
    if (!deleteFailed) {
      for (const { item } of toCreate) {
        // Old events of edited plans are gone now; forget them until re-created.
        if (state.events[item.id] && deletes.includes(state.events[item.id].eventId)) delete state.events[item.id];
      }
    }
    saveState(state);

    for (let start = 0; start < creatable.length; start += APPLY_CHUNK) {
      const chunk = creatable.slice(start, start + APPLY_CHUNK);
      const { insertedIds, errors } = await tools.applyChanges({
        calendarId,
        inserts: chunk.map(({ plan }) => toInsert(plan))
      });
      problems.push(...errors);
      chunk.forEach(({ item, plan, replaced }, index) => {
        const eventId = insertedIds[index];
        if (!eventId) {
          result.failed += 1;
          return;
        }
        state.events[item.id] = { eventId, hash: hashPlan(plan), colorKey };
        if (replaced) result.updated += 1;
        else result.created += 1;
      });
      saveState(state);
      onStatus?.(`Adding ${Math.min(total, start + APPLY_CHUNK)}/${total}…`);
    }
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
    result.failed = toCreate.length - result.created - result.updated;
  }
  if (problems.length) result.diagnostics += ` Problems: ${problems.slice(0, 2).join("; ")}`;

  // Details of an example pair of same-title events, and any copy the sync
  // deleted that is still there.
  if (scan.sample.length) result.diagnostics += ` Example: ${scan.sample.map(describeRow).join(" | ")}`;
  if (extraIds.length) {
    try {
      const remaining = new Set((await tools.listEvents({ calendarId })).events.map((row) => row.id));
      const leftovers = extraIds.filter((id) => remaining.has(id));
      if (leftovers.length) result.diagnostics += ` Not removed: ${leftovers.length} (${leftovers.slice(0, 3).join(", ")})`;
    } catch {
      // diagnostics only
    }
  }

  state.lastSyncedAt = Date.now();
  saveState(state);
  return result;
}

// ---------- Unsync ----------

// Deletes every event this app put in any calendar on this phone: events it
// tracks plus any event carrying its "<Category> · <Owner>" line. The user's
// own events are not touched.
export async function removeSyncedEvents(): Promise<number> {
  await ensurePermission();
  const state = loadState();
  const tools = await getCalendarTools();

  const ids = new Set(Object.values(state.events).map((synced) => synced.eventId));
  for (const row of (await tools.listEvents({})).events) {
    if (isAppEvent(row.description)) ids.add(row.id);
  }

  const { deleted, errors } = await tools.applyChanges({ deletes: [...ids] });
  saveState({ calendarId: state.calendarId, colorKey: state.colorKey, events: {}, lastSyncedAt: null });
  if (errors.length && deleted === 0) throw new Error(`Couldn't remove events (${errors[0]}).`);
  return deleted;
}
