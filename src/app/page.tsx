"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, PlannerItem, type TripTodoEntry } from "@/components/Calendar";
import {
  addPlannerItem,
  deletePlannerItem,
  isFirebaseConfigured,
  subscribePlannerItems,
  updatePlannerItem
} from "@/lib/firestore";
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  scheduleReminders
} from "@/lib/notifications";

const pad = (value: number) => value.toString().padStart(2, "0");

const formatDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const categoryStyles: Record<PlannerItem["category"], { label: string; color: string }> = {
  trip: { label: "Trip", color: "bg-indigo-100 text-indigo-600" },
  event: { label: "Event", color: "bg-cyan-100 text-cyan-700" },
  todo: { label: "Todo", color: "bg-rose-100 text-rose-600" },
  wishlist: { label: "Wishlist", color: "bg-violet-100 text-violet-600" }
};

const LOCAL_THEME_KEY = "meet-asuka:theme";
// Read from .env.local (see .env.local.example). Falls back to a placeholder
// that will always fail so the app doesn't silently stay open if the env var
// is missing.
const LOGIN_PIN = process.env.NEXT_PUBLIC_LOGIN_PIN ?? "";

// Shinjuku, Tokyo coordinates used for the Open-Meteo weather API.
// Override in .env.local via NEXT_PUBLIC_WEATHER_LAT / NEXT_PUBLIC_WEATHER_LON.
const WEATHER_LAT = process.env.NEXT_PUBLIC_WEATHER_LAT ?? "35.6896";
const WEATHER_LON = process.env.NEXT_PUBLIC_WEATHER_LON ?? "139.7006";


const LOCAL_ITEMS_KEY = "meet-asuka:planner-items";

const validCategories: PlannerItem["category"][] = ["trip", "event", "todo", "wishlist"];
const validRecurring: NonNullable<PlannerItem["recurring"]>[] = ["none", "daily", "weekly", "monthly"];

const normalizeTripTodoItems = (tripTodoItems: unknown): TripTodoEntry[] | undefined => {
  if (!Array.isArray(tripTodoItems)) {
    return undefined;
  }

  const normalized = tripTodoItems
    .map((entry): TripTodoEntry | null => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const raw = entry as Record<string, unknown>;
      return {
        title: typeof raw.title === "string" ? raw.title : "",
        date: typeof raw.date === "string" ? raw.date : "",
        details: typeof raw.details === "string" && raw.details !== "A dreamy new memory." ? raw.details : "",
        ...(typeof raw.participants === "string" ? { participants: raw.participants } : {})
      };
    })
    .filter((entry): entry is TripTodoEntry => entry !== null)
    .filter((entry) => entry.title || entry.date || entry.details || entry.participants);

  return normalized.length > 0 ? normalized : undefined;
};

const normalizePlannerItem = (item: unknown): PlannerItem | null => {
  if (!item || typeof item !== "object") {
    return null;
  }

  const raw = item as Record<string, unknown>;
  if (typeof raw.id !== "string" || raw.id.trim() === "") {
    return null;
  }

  const normalizedCategory =
    typeof raw.category === "string" && validCategories.includes(raw.category as PlannerItem["category"])
      ? (raw.category as PlannerItem["category"])
      : "event";

  const normalizedDate = typeof raw.date === "string" ? raw.date : "";
  const normalizedRecurring =
    typeof raw.recurring === "string" && validRecurring.includes(raw.recurring as NonNullable<PlannerItem["recurring"]>)
      ? (raw.recurring as NonNullable<PlannerItem["recurring"]>)
      : undefined;

  return {
    id: raw.id,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title : "Untitled plan",
    category: normalizedCategory,
    date: normalizedDate,
    endDate: typeof raw.endDate === "string" ? raw.endDate : undefined,
    startTime: typeof raw.startTime === "string" ? raw.startTime : undefined,
    endTime: typeof raw.endTime === "string" ? raw.endTime : undefined,
    location: typeof raw.location === "string" ? raw.location : undefined,
    recurring: normalizedRecurring,
    tripTodos: typeof raw.tripTodos === "string" ? raw.tripTodos : undefined,
    tripTodoItems: normalizeTripTodoItems(raw.tripTodoItems),
    participants: typeof raw.participants === "string" ? raw.participants : undefined,
    pic: typeof raw.pic === "string" ? raw.pic : undefined,
    completed: typeof raw.completed === "boolean" ? raw.completed : undefined,
    parentTripId: typeof raw.parentTripId === "string" ? raw.parentTripId : undefined,
    details: typeof raw.details === "string" && raw.details !== "A dreamy new memory." ? raw.details : "",
    reminderAt: typeof raw.reminderAt === "string" ? raw.reminderAt : undefined,
    reminderDays: typeof raw.reminderDays === "number" ? raw.reminderDays : undefined
  };
};

const normalizePlannerItems = (items: unknown): PlannerItem[] => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => normalizePlannerItem(item))
    .filter((item): item is PlannerItem => item !== null);
};

const createEmptyTripTodo = (): TripTodoEntry => ({
  title: "",
  date: formatDate(new Date()),
  details: "",
  participants: ""
});

const createEmptyFormState = (date?: string): PlannerFormState => ({
  title: "",
  category: "trip",
  date: date ?? formatDate(new Date()),
  endDate: "",
  startTime: "",
  endTime: "",
  location: "",
  recurring: "none",
  tripTodos: "",
  tripTodoItems: [createEmptyTripTodo()],
  participants: "",
  pic: "",
  completed: false,
  details: "",
  reminderAt: ""
});

const buildTripTodoPlannerItems = (tripId: string, tripTitle: string, tripDate: string, tripTodos: TripTodoEntry[]): PlannerItem[] => {
  return tripTodos.map((todo, index) => {
    const trimmedTitle = todo.title.trim();
    const trimmedDetails = todo.details.trim();
    const trimmedPic = todo.participants?.trim() ?? "";

    return {
      id: crypto.randomUUID(),
      title: trimmedTitle || `${tripTitle} • Todo ${index + 1}`,
      category: "todo",
      date: todo.date || tripDate,
      pic: trimmedPic || undefined,
      completed: false,
      parentTripId: tripId,
      details: trimmedDetails
    };
  });
};

type PlannerFormState = {
  title: string;
  category: PlannerItem["category"];
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  location: string;
  recurring: PlannerItem["recurring"];
  tripTodos: string;
  tripTodoItems: TripTodoEntry[];
  participants: string;
  pic: string;
  completed: boolean;
  details: string;
  reminderAt: string; // ISO datetime e.g. "2025-03-15T09:00", empty string = off
};

export default function Home() {
  type NavGroupKey = PlannerItem["category"] | "past" | "doneTodo";

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isWeatherCardOpen, setIsWeatherCardOpen] = useState(false);
  const [weeklyWeather, setWeeklyWeather] = useState<Array<{ date: string; min: number; max: number; code: number }>>([]);
  const pinInputRef = useRef<HTMLInputElement | null>(null);
  const handledStaleIdsRef = useRef(new Set<string>());
  const [items, setItems] = useState<PlannerItem[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isChoosingCategory, setIsChoosingCategory] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<
    PlannerItem["category"] | "past" | "doneTodo"
  >("event");
  const [activeMonth, setActiveMonth] = useState(() => new Date());
  const [newItem, setNewItem] = useState<PlannerFormState>(createEmptyFormState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [returnToNavAfterModal, setReturnToNavAfterModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<NavGroupKey, boolean>>({
    trip: false,
    event: false,
    todo: false,
    wishlist: false,
    past: false,
    doneTodo: false
  });
  const [weatherLabel, setWeatherLabel] = useState<string>("Loading...");
  const [hasHydratedPlanner, setHasHydratedPlanner] = useState(false);
  const [notifPermission, setNotifPermission] = useState<"granted" | "denied" | "default" | "unsupported">("default");
  const [syncError, setSyncError] = useState<string | null>(null);
  const addPlanCategoryOptions: Array<{ category: PlannerItem["category"]; title: string; subtitle: string; icon: string }> = [
    { category: "event", title: "Event", subtitle: "meetups", icon: "✈️" },
    { category: "trip", title: "Trip", subtitle: "travel", icon: "🧳" },
    { category: "todo", title: "TODO", subtitle: "deadline", icon: "✅" },
    { category: "wishlist", title: "Wishlist", subtitle: "someday", icon: "♡" }
  ];
  const modalTitleClass = isDarkMode ? "text-slate-100" : "text-slate-800";
  const modalLabelClass = isDarkMode ? "block text-sm font-medium text-slate-200" : "block text-sm font-medium text-slate-700";
  const modalInputClass = isDarkMode
    ? "mt-2 w-full rounded-2xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-500/30"
    : "mt-2 w-full rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200";
  const modalInputCompactClass = isDarkMode
    ? "mt-1 w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:border-pink-400 focus:outline-none"
    : "mt-1 w-full rounded-xl border border-pink-100 bg-pink-50/60 px-3 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none";
  const modalTextareaClass = isDarkMode
    ? "mt-2 min-h-[110px] w-full rounded-2xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-500/30"
    : "mt-2 min-h-[110px] w-full rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200";
  const todaysWeatherSummary = useMemo(() => {
    if (weeklyWeather.length === 0) {
      return "Loading...";
    }

    const todayEntry = weeklyWeather.find((day) => day.date === formatDate(new Date())) ?? weeklyWeather[0];
    return `Today: ${todayEntry.max}° / ${todayEntry.min}°`;
  }, [weeklyWeather]);

  const normalizedToday = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  })();

  const selectedKey = formatDate(selectedDate);
  const selectedItems = useMemo(() => {
    const selectedDateOnly = new Date(selectedDate);
    selectedDateOnly.setHours(0, 0, 0, 0);

    return items.filter((item) => {
      if (!item.date) {
        return false;
      }

      if (item.category === "todo" && item.completed) {
        return false;
      }

      if (item.category !== "trip") {
        return item.date === selectedKey;
      }

      const start = new Date(item.date);
      const end = item.endDate ? new Date(item.endDate) : new Date(item.date);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);

      const rangeStart = start <= end ? start : end;
      const rangeEnd = start <= end ? end : start;

      return selectedDateOnly >= rangeStart && selectedDateOnly <= rangeEnd;
    });
  }, [items, selectedDate, selectedKey]);

  const activeMonthLabel = activeMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });

  const doneTodoItems = useMemo(
    () => items.filter((item) => item.category === "todo" && item.completed),
    [items]
  );

  const todoItems = useMemo(
    () => items.filter((item) => item.category === "todo" && !item.completed),
    [items]
  );

  const allPastItems = useMemo(
    () =>
      items.filter((item) => {
        if (item.category !== "trip" && item.category !== "event") {
          return false;
        }
        if (!item.date) {
          return false;
        }
        const itemDate = new Date(item.date);
        itemDate.setHours(0, 0, 0, 0);
        return itemDate < normalizedToday;
      }),
    [items, normalizedToday]
  );

  const byDateAsc = (a: PlannerItem, b: PlannerItem) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const byDateDesc = (a: PlannerItem, b: PlannerItem) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0);

  const navGroups: {
    key: NavGroupKey;
    label: string;
    color: string;
    icon: string;
    entries: PlannerItem[];
  }[] = [
    {
      key: "trip",
      label: "Trips",
      color: "text-indigo-500",
      icon: "🧳",
      // Use endDate (or startDate) so an in-progress trip stays visible until it ends.
      entries: items.filter((item) => {
        if (item.category !== "trip") return false;
        const relevantDate = new Date(item.endDate || item.date);
        relevantDate.setHours(0, 0, 0, 0);
        return relevantDate >= normalizedToday;
      }).sort(byDateAsc)
    },
    {
      key: "event",
      label: "Events",
      color: "text-emerald-500",
      icon: "🎉",
      entries: items.filter((item) => {
        if (item.category !== "event") return false;
        const eventDate = new Date(item.date);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate >= normalizedToday;
      }).sort(byDateAsc)
    },
    {
      key: "todo",
      label: "Todos",
      color: "text-sky-500",
      icon: "📝",
      entries: [...todoItems].sort(byDateAsc)
    },
    {
      key: "wishlist",
      label: "Wishlist",
      color: "text-amber-500",
      icon: "🌟",
      entries: items
        .filter((item) => item.category === "wishlist")
        .sort((a, b) => a.title.localeCompare(b.title))
    },
    {
      key: "past",
      label: "Past plans",
      color: "text-rose-500",
      icon: "⏳",
      entries: [...allPastItems].sort(byDateDesc)
    },
    {
      key: "doneTodo",
      label: "Done TODO",
      color: "text-slate-400",
      icon: "✅",
      entries: [...doneTodoItems].sort(byDateDesc)
    }
  ];

  const formatMeta = (item: PlannerItem) => {
    if (item.category === "wishlist") {
      return item.completed ? "No date set • Done" : "No date set";
    }
    if (item.category === "trip") {
      const dateLabel = item.endDate && item.endDate !== item.date
        ? `Dates: ${item.date} → ${item.endDate}`
        : `Date: ${item.date}`;
      const tripTodoCount = item.tripTodoItems?.length ?? (item.tripTodos ? 1 : 0);
      const todoLabel = tripTodoCount > 0 ? ` • ${tripTodoCount} trip todo${tripTodoCount > 1 ? "s" : ""}` : "";
      const participantsLabel = item.participants ? ` • With: ${item.participants}` : "";
      return `${dateLabel}${todoLabel}${participantsLabel}`;
    }
    if (item.category === "event") {
      const time = item.startTime
        ? item.endTime
          ? `${item.startTime} → ${item.endTime}`
          : `${item.startTime} → ?`
        : "Time TBD";
      const recurringLabel =
        item.recurring && item.recurring !== "none"
          ? ` • Repeats ${item.recurring}`
          : "";
      const locationLabel = item.location ? ` • ${item.location}` : "";
      const participantsLabel = item.participants ? ` • With: ${item.participants}` : "";
      return `When: ${item.date} • ${time}${locationLabel}${participantsLabel}${recurringLabel}`;
    }
    if (item.category === "todo") {
      const picLabel = item.pic ? ` • PIC: ${item.pic}` : "";
      return `Due: ${item.date}${picLabel}${item.completed ? " • Done" : ""}`;
    }
    return `Due: ${item.date}${item.participants ? ` • With: ${item.participants}` : ""}`;
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedTheme = window.localStorage.getItem(LOCAL_THEME_KEY);
    if (storedTheme === "dark") {
      setIsDarkMode(true);
    }

  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(LOCAL_THEME_KEY, isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let localItems: PlannerItem[] = [];
    const localRaw = window.localStorage.getItem(LOCAL_ITEMS_KEY);
    if (localRaw) {
      try {
        const parsedItems = JSON.parse(localRaw) as unknown;
        localItems = normalizePlannerItems(parsedItems);
      } catch {
        window.localStorage.removeItem(LOCAL_ITEMS_KEY);
      }
    }

    if (!isFirebaseConfigured) {
      setItems(localItems);
      setHasHydratedPlanner(true);
      return;
    }

    let hasMigrated = false;

    const unsubscribe = subscribePlannerItems(
      (remoteItems) => {
        const normalized = normalizePlannerItems(remoteItems);
        // Migrate legacy local-only data only on the first snapshot when remote is empty.
        if (!hasMigrated && normalized.length === 0 && localItems.length > 0) {
          hasMigrated = true;
          void Promise.all(localItems.map((item) => addPlannerItem(item)));
          setItems(localItems);
        } else {
          setItems(normalized);
        }
        setHasHydratedPlanner(true);
      },
      (error) => {
        console.error("Failed to sync planner items with Firestore", error);
        setItems(localItems);
        setSyncError("Couldn't reach the cloud — showing local data. Changes will still save locally.");
        setHasHydratedPlanner(true);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !hasHydratedPlanner) {
      return;
    }
    window.localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(items));
  }, [hasHydratedPlanner, items]);

  // Initialize notification permission state on mount (independent of data loading)
  useEffect(() => {
    void getNotificationPermissionStatus().then(setNotifPermission);
  }, []);

  useEffect(() => {
    if (!hasHydratedPlanner) return;
    if (notifPermission !== "granted") return;
    void scheduleReminders(items);
  }, [hasHydratedPlanner, items, notifPermission]);

  useEffect(() => {
    const loadWeather = async () => {
      try {
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LAT}&longitude=${WEATHER_LON}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FTokyo`
        );
        if (!response.ok) {
          throw new Error("Weather request failed");
        }
        const data = (await response.json()) as {
          current?: { temperature_2m?: number; weather_code?: number };
          daily?: {
            time?: string[];
            weather_code?: number[];
            temperature_2m_max?: number[];
            temperature_2m_min?: number[];
          };
        };
        const weatherCode = data.current?.weather_code;
        const temp = data.current?.temperature_2m;
        const weatherMap: Record<number, string> = {
          0: "Clear",
          1: "Mainly clear",
          2: "Partly cloudy",
          3: "Cloudy",
          45: "Fog",
          48: "Fog",
          51: "Drizzle",
          53: "Drizzle",
          55: "Drizzle",
          61: "Rain",
          63: "Rain",
          65: "Heavy rain",
          71: "Snow",
          80: "Rain showers",
          95: "Thunderstorm"
        };
        const condition = weatherCode !== undefined ? weatherMap[weatherCode] ?? "Weather" : "Weather";
        const temperature = temp !== undefined ? `${Math.round(temp)}°C` : "--°C";
        setWeatherLabel(`${condition} ${temperature}`);

        const days = data.daily?.time ?? [];
        const codes = data.daily?.weather_code ?? [];
        const minTemps = data.daily?.temperature_2m_min ?? [];
        const maxTemps = data.daily?.temperature_2m_max ?? [];
        const nextWeek = days.slice(0, 7).map((date, index) => ({
          date,
          code: codes[index] ?? -1,
          min: Math.round(minTemps[index] ?? 0),
          max: Math.round(maxTemps[index] ?? 0)
        }));
        setWeeklyWeather(nextWeek);
      } catch (error) {
        console.error("Failed to load weather", error);
        setWeatherLabel("Weather unavailable");
        setWeeklyWeather([]);
      }
    };

    void loadWeather();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Fetch once on mount; label translation is handled by todaysWeatherSummary memo

  useEffect(() => {
    const cutoff = new Date(normalizedToday);
    cutoff.setDate(cutoff.getDate() - 14);

    const staleDoneTodoIds = items
      .filter((item) => {
        if (item.category !== "todo" || !item.completed || !item.date) {
          return false;
        }
        // Skip IDs already handled this session to avoid re-running on the
        // state update triggered by the setItems call below.
        if (handledStaleIdsRef.current.has(item.id)) {
          return false;
        }
        const itemDate = new Date(item.date);
        itemDate.setHours(0, 0, 0, 0);
        return itemDate < cutoff;
      })
      .map((item) => item.id);

    if (staleDoneTodoIds.length === 0) {
      return;
    }

    staleDoneTodoIds.forEach((id) => handledStaleIdsRef.current.add(id));

    // Capture the items before removing so we can restore them if the Firestore
    // delete fails and the next load would otherwise bring them back as ghosts.
    const staleItems = items.filter((item) => staleDoneTodoIds.includes(item.id));
    setItems((prev) => prev.filter((item) => !staleDoneTodoIds.includes(item.id)));

    if (!isFirebaseConfigured) {
      return;
    }

    Promise.all(staleDoneTodoIds.map((id) => deletePlannerItem(id))).catch((error) => {
      console.error("Failed to delete stale done TODOs from Firestore", error);
      // Allow retry on next mount by un-marking these IDs.
      staleDoneTodoIds.forEach((id) => handledStaleIdsRef.current.delete(id));
      // Restore so local state and Firestore stay in sync.
      setItems((prev) => [...prev, ...staleItems]);
    });
  }, [items, normalizedToday]);

  const closeModalAndRestoreContext = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setIsChoosingCategory(false);

    if (returnToNavAfterModal) {
      setIsNavOpen(true);
      setReturnToNavAfterModal(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    const target = items.find((item) => item.id === id);
    const linkedTodoIds =
      target?.category === "trip"
        ? items.filter((item) => item.parentTripId === id).map((item) => item.id)
        : [];

    setItems((prev) => prev.filter((item) => item.id !== id && item.parentTripId !== id));

    if (!isFirebaseConfigured) {
      return;
    }

    try {
      await deletePlannerItem(id);
      await Promise.all(linkedTodoIds.map((todoId) => deletePlannerItem(todoId)));
    } catch (error) {
      console.error("Failed to delete planner item from Firestore", error);
      setSyncError("Deletion saved locally but couldn't sync to cloud. It will retry on next load.");
    }
  };

  const toggleChecklistCompletion = async (item: PlannerItem) => {
    const nextCompleted = !item.completed;

    setItems((prev) =>
      prev.map((existing) =>
        existing.id === item.id ? { ...existing, completed: nextCompleted } : existing
      )
    );

    if (!isFirebaseConfigured) {
      return;
    }

    const { id, ...rest } = item;
    try {
      await updatePlannerItem(id, { ...rest, completed: nextCompleted });
    } catch (error) {
      console.error("Failed to toggle checklist completion in Firestore", error);
      setSyncError("Change saved locally but couldn't sync to cloud.");
    }
  };

  const getWeatherIcon = (code: number) => {
    if (code === 0) return "☀️";
    if (code <= 3) return "⛅";
    if (code === 45 || code === 48) return "🌫️";
    if (code >= 51 && code <= 55) return "🌦️"; // drizzle
    if (code >= 56 && code <= 57) return "🌧️"; // freezing drizzle
    if (code >= 61 && code <= 65) return "🌧️"; // rain
    if (code >= 66 && code <= 67) return "🌨️"; // freezing rain
    if (code >= 71 && code <= 77) return "❄️"; // snow / snow grains / ice crystals
    if (code >= 80 && code <= 82) return "🌦️"; // rain showers
    if (code === 85 || code === 86) return "🌨️"; // snow showers
    if (code === 95) return "⛈️"; // thunderstorm
    if (code >= 96 && code <= 99) return "⛈️"; // thunderstorm with hail
    return "🌤️";
  };

  const formatWeatherDayCompact = (date: string) => {
    const parsed = new Date(date);
    const weekday = parsed.toLocaleDateString("en-US", {
      weekday: "short"
    });
    return `${weekday} ${parsed.getDate()}`;
  };

  const handleLogin = () => {
    if (pinInput === LOGIN_PIN) {
      setIsLoggedIn(true);
      setPinError("");
      return;
    }

    setPinError("Invalid PIN. Please try again.");
  };

  if (!isLoggedIn) {
    return (
      <main className={`relative flex min-h-screen items-center justify-center overflow-hidden p-6 ${isDarkMode ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" : "bg-gradient-to-br from-pink-100 via-blush to-orange-100"}`}>
        <div className="pointer-events-none absolute -left-16 top-10 h-44 w-44 rounded-full bg-pink-300/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-8 h-52 w-52 rounded-full bg-rose-300/30 blur-3xl" />
        <div className={`w-full max-w-xl rounded-[36px] border p-10 text-center shadow-soft backdrop-blur ${isDarkMode ? "border-slate-700 bg-slate-800/90" : "border-white/60 bg-white/85"}`}>
          <p className={`text-left text-sm font-medium ${isDarkMode ? "text-slate-300" : "text-slate-500"}`}>Welcome back</p>
          <h1 className={`mt-1 text-left text-5xl font-bold ${isDarkMode ? "text-white" : "text-slate-800"}`}>Asuka ✨</h1>
          <p className={`mt-2 text-left text-base ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>Events • Trips • TODOs • Wishlist</p>
          <div className="mt-7 flex justify-center">
            <div className={`inline-flex items-center justify-center rounded-[28px] p-3 shadow-lg ${isDarkMode ? "bg-slate-700/60 shadow-black/30" : "bg-white/70 shadow-pink-100"}`}>
              <div className="h-24 w-24 overflow-hidden rounded-2xl translate-x-px">
                <img src="/icons/icon-512.png" alt="Ikaku" className="h-full w-full object-cover" />
              </div>
            </div>
          </div>
          <div className="mt-6 text-center">
            <p className={`text-sm font-semibold ${isDarkMode ? "text-slate-200" : "text-slate-600"}`}>Enter 4-digit PIN</p>
            <button
              type="button"
              onClick={() => pinInputRef.current?.focus()}
              className="mx-auto mt-3 grid grid-cols-4 gap-3"
              aria-label="Enter 4-digit PIN"
            >
              {Array.from({ length: 4 }).map((_, index) => (
                <span
                  key={`pin-box-${index}`}
                  className={`flex h-14 w-12 items-center justify-center rounded-2xl border text-xl font-bold ${
                    pinInput[index]
                      ? isDarkMode ? "border-pink-400 bg-slate-700 text-pink-200" : "border-pink-300 bg-pink-50 text-pink-600"
                      : isDarkMode ? "border-slate-600 bg-slate-800 text-slate-500" : "border-pink-100 bg-white text-slate-300"
                  }`}
                >
                  {pinInput[index] ? "•" : ""}
                </span>
              ))}
            </button>
            <input
              ref={pinInputRef}
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pinInput}
              onChange={(event) => {
                const value = event.target.value.replace(/\D/g, "").slice(0, 4);
                setPinInput(value);
                if (pinError) setPinError("");
                if (value.length === 4) {
                  if (value === LOGIN_PIN) {
                    setIsLoggedIn(true);
                    setPinError("");
                  } else {
                    setPinError("Invalid PIN. Please try again.");
                    setTimeout(() => setPinInput(""), 500);
                  }
                }
              }}
              className="sr-only"
              placeholder="0000"
            />
          </div>
          {pinError ? <p className="mt-3 text-center text-sm text-rose-400">{pinError}</p> : null}
        </div>
      </main>
    );
  }

  return (
    <main className={`min-h-screen px-5 pb-24 pt-6 ${isDarkMode ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" : "bg-gradient-to-br from-pink-50 via-blush to-orange-100"}`}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className={`sticky top-4 z-30 rounded-3xl px-3 py-2 shadow-soft backdrop-blur ${isDarkMode ? "bg-slate-900/85 border border-slate-700" : "bg-white/70"}`}>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsNavOpen(true)}
              className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl transition hover:-translate-y-0.5 ${isDarkMode ? "bg-slate-800 text-pink-300 shadow-lg shadow-black/20 hover:bg-slate-700" : "bg-white text-pink-500 shadow-lg shadow-pink-100 hover:bg-pink-50"}`}
              aria-label="Open navigation"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M4 6h16a1 1 0 1 0 0-2H4a1 1 0 1 0 0 2zm16 5H4a1 1 0 1 0 0 2h16a1 1 0 1 0 0-2zm0 7H4a1 1 0 1 0 0 2h16a1 1 0 1 0 0-2z" />
              </svg>
            </button>
            <div />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsDarkMode((prev) => !prev)}
                className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl transition hover:-translate-y-0.5 ${isDarkMode ? "bg-slate-800 text-pink-300 shadow-lg shadow-black/20 hover:bg-slate-700" : "bg-white text-pink-500 shadow-lg shadow-pink-100 hover:bg-pink-50"}`}
                aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              >
                {isDarkMode ? (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <circle cx="12" cy="12" r="4" />
                    <path strokeLinecap="round" d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsWeatherCardOpen((prev) => !prev)}
                className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium shadow ${isDarkMode ? "bg-slate-800 text-slate-100" : "bg-white/90 text-slate-700"}`}
                aria-label="7-Day weather"
                title={weatherLabel}
              >
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${isDarkMode ? "bg-slate-700" : "bg-pink-100"}`}>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className={`h-5 w-5 ${isDarkMode ? "text-pink-300" : "text-pink-500"}`}
                    fill="currentColor"
                  >
                    <path d="M6.4 13a4.6 4.6 0 1 1 8.9-1.8A3.8 3.8 0 1 1 16 18H7.5a3.5 3.5 0 0 1-1.1-5z" />
                  </svg>
                </span>
                <span className="max-w-[8.5rem] truncate">{todaysWeatherSummary}</span>
              </button>
            </div>
          </div>
        </header>

        {syncError ? (
          <div className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${isDarkMode ? "border-amber-700/50 bg-amber-900/20 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            <p className="leading-snug">⚠️ {syncError}</p>
            <button
              type="button"
              onClick={() => setSyncError(null)}
              className="shrink-0 font-bold opacity-60 hover:opacity-100"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        ) : null}


        {notifPermission === "default" ? (
          <div className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${isDarkMode ? "border-pink-800/50 bg-pink-950/30 text-pink-300" : "border-pink-200 bg-pink-50 text-pink-800"}`}>
            <p className="leading-snug">🔔 Enable reminders to get notified before trips & events</p>
            <button
              type="button"
              onClick={async () => {
                const granted = await requestNotificationPermission();
                setNotifPermission(granted ? "granted" : "denied");
                if (granted) void scheduleReminders(items);
              }}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${isDarkMode ? "bg-pink-700 text-white hover:bg-pink-600" : "bg-pink-500 text-white hover:bg-pink-600"}`}
            >
              Allow
            </button>
          </div>
        ) : null}

        {isWeatherCardOpen ? (
          <section className={`rounded-3xl border p-4 shadow-soft ${isDarkMode ? "border-slate-700 bg-slate-900/80" : "border-pink-100 bg-white/85"}`}>
            <h3 className={`text-xl font-bold ${isDarkMode ? "text-slate-100" : "text-slate-700"}`}>7-Day weather</h3>
            {weeklyWeather.length === 0 ? (
              <p className={`mt-3 text-sm ${isDarkMode ? "text-slate-300" : "text-slate-500"}`}>Loading...</p>
            ) : (
              <div className="mt-3 grid grid-cols-7 gap-1">
                {weeklyWeather.map((day) => (
                  <article
                    key={day.date}
                    className={`w-full rounded-lg border px-1 py-1.5 text-center ${isDarkMode ? "border-slate-700 bg-slate-800 text-slate-100" : "border-pink-100 bg-pink-50/70 text-slate-700"}`}
                  >
                    <p className="text-[10px] font-semibold leading-tight">{formatWeatherDayCompact(day.date)}</p>
                    <p className="mt-1 text-sm leading-none">{getWeatherIcon(day.code)}</p>
                    <p className="mt-1 text-[10px] font-medium leading-tight">{day.max}°/{day.min}°</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        <div className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold shadow ${isDarkMode ? "bg-slate-900/80 text-slate-100" : "bg-white/80 text-slate-700"}`}>
          <button
            type="button"
            onClick={() =>
              setActiveMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
            }
            className={`flex items-center gap-2 rounded-full px-4 py-2 transition ${isDarkMode ? "bg-slate-700 text-pink-200 hover:bg-slate-600" : "bg-pink-50 text-pink-500 hover:bg-pink-100"}`}
          >
            <span>←</span>
            Prev
          </button>
          <button
            type="button"
            onClick={() => {
              const today = new Date();
              setSelectedDate(today);
              setActiveMonth(new Date(today.getFullYear(), today.getMonth(), 1));
            }}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${isDarkMode ? "border-slate-600 text-pink-200 hover:bg-slate-700" : "border-pink-100 text-pink-500 hover:bg-pink-50"}`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() =>
              setActiveMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
            }
            className={`flex items-center gap-2 rounded-full px-4 py-2 transition ${isDarkMode ? "bg-slate-700 text-pink-200 hover:bg-slate-600" : "bg-pink-50 text-pink-500 hover:bg-pink-100"}`}
          >
            Next
            <span>→</span>
          </button>
        </div>

        {/* Full-bleed calendar with panda resting on its top edge */}
        <div className="-mx-5">
          <div className="relative pt-[20px]">
          <img
            src={isDarkMode ? "/stat_panda.png" : "/stat_panda_bg-removebg-preview.png"}
            alt=""
            className="absolute left-1/2 top-0 z-10 h-[42px] w-auto -translate-x-1/2"
            draggable={false}
          />
          <Calendar
            month={new Date(activeMonth.getFullYear(), activeMonth.getMonth(), 1)}
            monthLabel={activeMonthLabel}
            weekdayLabels={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]}
            isDarkMode={isDarkMode}
            items={items}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
          </div>
        </div>

        <section className={`rounded-3xl p-6 shadow-soft ${isDarkMode ? "bg-slate-900/80" : "bg-white/80"}`}>
          <h3 className={`text-lg font-semibold ${isDarkMode ? "text-slate-100" : "text-slate-800"}`}>
            Plans for selected day
          </h3>
          <div className="mt-4 space-y-3">
            {selectedItems.length === 0 ? (
              <p className={`text-sm ${isDarkMode ? "text-slate-300" : "text-slate-500"}`}>
                No plans yet. Add something sweet with the plus button!
              </p>
            ) : (
                selectedItems.map((item) => {
                  const openEdit = () => {
                    setEditingId(item.id);
                    setReturnToNavAfterModal(false);
                    setNewItem({
                      title: item.title,
                      category: item.category,
                      date: item.date,
                      endDate: item.endDate ?? "",
                      startTime: item.startTime ?? "",
                      endTime: item.endTime ?? "",
                      location: item.location ?? "",
                      recurring: item.recurring ?? "none",
                      tripTodos: item.tripTodos ?? "",
                      tripTodoItems:
                        item.tripTodoItems && item.tripTodoItems.length > 0
                          ? item.tripTodoItems
                          : item.tripTodos
                            ? [{ title: "Trip todo", date: item.date, details: item.tripTodos, participants: "" }]
                            : [createEmptyTripTodo()],
                      participants: item.participants ?? "",
                      pic: item.pic ?? "",
                      completed: item.completed ?? false,
                      details: item.details === "A dreamy new memory." ? "" : item.details,
                      reminderAt: item.reminderAt ?? (item.reminderDays != null && item.date ? (() => { const [y,m,d] = item.date.split("-").map(Number); const dt = new Date(y, m-1, d - (item.reminderDays ?? 0), 9, 0, 0); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}T09:00`; })() : "")
                    });
                    setIsModalOpen(true);
                  };

                  return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (item.category === "todo" || item.category === "wishlist") {
                        void toggleChecklistCompletion(item);
                        return;
                      }
                      openEdit();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (item.category === "todo" || item.category === "wishlist") {
                          void toggleChecklistCompletion(item);
                        } else {
                          openEdit();
                        }
                      }
                    }}
                    className={`w-full cursor-pointer rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5 ${(item.category === "todo" || item.category === "wishlist") && item.completed ? (isDarkMode ? "border-emerald-700 bg-emerald-900/20" : "border-emerald-200 bg-emerald-50/70") : (isDarkMode ? "border-slate-700 bg-slate-800 hover:border-slate-600 hover:bg-slate-700" : "border-pink-100 bg-white hover:border-pink-200 hover:bg-pink-50/50")}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={`min-w-0 text-sm font-semibold ${(item.category === "todo" || item.category === "wishlist") && item.completed ? "text-slate-400 line-through" : (isDarkMode ? "text-slate-100" : "text-slate-800")}`}>
                        {item.title}
                      </p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${categoryStyles[item.category].color}`}>
                          {categoryStyles[item.category].label}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openEdit(); }}
                          aria-label="Edit"
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition ${isDarkMode ? "text-slate-400 hover:bg-slate-700 hover:text-pink-300" : "text-slate-400 hover:bg-pink-50 hover:text-pink-500"}`}
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <p className={`mt-2 text-xs font-semibold ${isDarkMode ? "text-pink-300" : "text-pink-400"}`}>
                      {formatMeta(item)}
                    </p>
                    <p className={`mt-2 text-sm ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>{item.details}</p>
                    {item.category === "todo" ? (
                      item.pic ? <p className={`mt-1 text-xs ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>👤 PIC: {item.pic}</p> : null
                    ) : item.participants ? (
                      <p className={`mt-1 text-xs ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>👥 {item.participants}</p>
                    ) : null}
                    {item.category === "trip" && item.tripTodoItems && item.tripTodoItems.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {item.tripTodoItems.slice(0, 2).map((todo, index) => (
                          <p key={`${item.id}-trip-todo-${index}`} className="text-xs text-indigo-500">
                            📝 {todo.title || "Trip todo"}{todo.date ? ` • ${todo.date}` : ""}
                          </p>
                        ))}
                        {item.tripTodoItems.length > 2 ? (
                          <p className="text-xs text-indigo-400">+{item.tripTodoItems.length - 2} more</p>
                        ) : null}
                      </div>
                    ) : item.category === "trip" && item.tripTodos ? (
                      <p className="mt-1 text-xs text-indigo-500">📝 Trip todos: {item.tripTodos}</p>
                    ) : null}
                  </div>
                  );
                })
              )}
          </div>
        </section>

        {/* Bounce panda */}
        <div className="flex items-center justify-center">
          <img
            src="/bounce_panda.gif"
            alt=""
            className="h-48 w-auto"
            draggable={false}
          />
        </div>

        <div className="pb-2">
          <button
            type="button"
            onClick={() => setIsLoggedIn(false)}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-soft transition ${isDarkMode ? "border-slate-700 bg-slate-900/80 text-pink-300 hover:bg-slate-800" : "border-pink-100 bg-white/80 text-pink-600 hover:bg-pink-50"}` }
          >
            <span className="text-lg">👋</span>
            Logout
          </button>
        </div>

      </div>

      <button
        type="button"
        onClick={() => {
          const defaultStartDate = formatDate(selectedDate);
          setEditingId(null);
          setReturnToNavAfterModal(false);
          setIsChoosingCategory(true);
          setNewItem((prev) => ({
            ...prev,
            date: defaultStartDate,
            endDate: defaultStartDate,
            tripTodoItems: prev.tripTodoItems.map((todo) => ({ ...todo, date: todo.date || defaultStartDate }))
          }));
          setIsModalOpen(true);
        }}
        className={`fixed bottom-8 left-1/2 z-40 flex -translate-x-1/2 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-1 ${isDarkMode ? "bg-fuchsia-600 shadow-fuchsia-900/60 hover:bg-fuchsia-500" : "bg-pink-500 shadow-pink-300 hover:bg-pink-400"}`}
        aria-label="Add plan"
      >
        <span className="text-lg">✨</span>
        <span className="text-base">＋ Add plan</span>
      </button>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 sm:p-6">
          <div className={`max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-3xl p-6 shadow-soft ${isDarkMode ? "bg-slate-900 text-slate-100" : "bg-white"}`}>
            <div className="flex items-start justify-between">
              <div>
                <h4 className={`text-xl font-semibold ${modalTitleClass}`}>
                  {editingId ? "Edit plan" : isChoosingCategory ? "Add something ✨" : "Add a sweet plan"}
                </h4>
                <p className={`text-sm ${isDarkMode ? "text-slate-300" : "text-slate-500"}`}>
                  Trips, events, todos, or wishlist ideas.
                </p>
              </div>
              <button
                type="button"
                className={`text-slate-400 ${isDarkMode ? "hover:text-slate-200" : "hover:text-slate-600"}`}
                onClick={() => {
                  closeModalAndRestoreContext();
                }}
              >
                ✕
              </button>
            </div>

            {!editingId && isChoosingCategory ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {addPlanCategoryOptions.map((option) => (
                  <button
                    key={option.category}
                    type="button"
                    onClick={() => {
                      const defaultStartDate = formatDate(selectedDate);
                      setNewItem((prev) => ({
                        ...prev,
                        category: option.category,
                        date: option.category === "wishlist" ? "" : defaultStartDate,
                        endDate: option.category === "trip" ? (prev.endDate || defaultStartDate) : ""
                      }));
                      setIsChoosingCategory(false);
                    }}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${isDarkMode ? "border-slate-600 bg-slate-800 hover:bg-slate-700" : "border-pink-100 bg-pink-50/70 hover:bg-pink-100"}`}
                  >
                    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-lg ${isDarkMode ? "bg-slate-700" : "bg-white"}`}>{option.icon}</span>
                    <span>
                      <span className={`block text-base font-semibold ${isDarkMode ? "text-slate-100" : "text-slate-800"}`}>{option.title}</span>
                      <span className={`block text-xs ${isDarkMode ? "text-slate-300" : "text-slate-500"}`}>{option.subtitle}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                if (isSubmitting) return;
                setIsSubmitting(true);

                // Validate trip date range before saving.
                if (
                  newItem.category === "trip" &&
                  newItem.date &&
                  newItem.endDate &&
                  newItem.endDate < newItem.date
                ) {
                  alert("The end date can't be before the start date.");
                  setIsSubmitting(false);
                  return;
                }

                const normalizedTripTodos =
                  newItem.category === "trip"
                    ? newItem.tripTodoItems
                        .map((todo) => ({
                          title: todo.title.trim(),
                          date: todo.date,
                          details: todo.details.trim(),
                          participants: todo.participants?.trim() || undefined
                        }))
                        .filter((todo) => todo.title || todo.details || todo.participants)
                    : undefined;

                const payload = {
                  title: newItem.title.trim() || "Untitled plan",
                  category: newItem.category as PlannerItem["category"],
                  date: newItem.category === "wishlist" ? "" : newItem.date,
                  endDate: newItem.category === "trip" ? newItem.endDate || newItem.date : undefined,
                  startTime: newItem.category === "event" ? newItem.startTime : undefined,
                  endTime: newItem.category === "event" ? newItem.endTime : undefined,
                  location: newItem.category === "event" ? newItem.location.trim() : undefined,
                  recurring:
                    newItem.category === "event"
                      ? newItem.recurring
                      : undefined,
                  tripTodos: newItem.category === "trip" ? newItem.tripTodos.trim() : undefined,
                  tripTodoItems: normalizedTripTodos,
                  participants:
                    newItem.category !== "todo" ? newItem.participants.trim() || undefined : undefined,
                  pic: newItem.category === "todo" ? newItem.pic.trim() || undefined : undefined,
                  completed:
                    newItem.category === "todo" || newItem.category === "wishlist"
                      ? newItem.completed
                      : undefined,
                  details: newItem.details.trim(),
                  reminderAt: newItem.category !== "wishlist" && newItem.reminderAt ? newItem.reminderAt : undefined
                };

                if (editingId) {
                  const generatedTripTodos =
                    payload.category === "trip" && normalizedTripTodos
                      ? buildTripTodoPlannerItems(editingId, payload.title, payload.date, normalizedTripTodos)
                      : [];

                  // Capture linked todo IDs from current state before setItems mutates it.
                  const linkedTodoIds = items
                    .filter((item) => item.parentTripId === editingId)
                    .map((item) => item.id);

                  setItems((prev) => {
                    const withoutLinkedTodos = prev.filter((item) => item.parentTripId !== editingId);
                    return withoutLinkedTodos.map((item) =>
                      item.id === editingId ? { ...item, ...payload } : item
                    ).concat(generatedTripTodos);
                  });

                  if (isFirebaseConfigured) {
                    try {

                      await updatePlannerItem(editingId, payload);
                      await Promise.all(linkedTodoIds.map((todoId) => deletePlannerItem(todoId)));
                      await Promise.all(generatedTripTodos.map((todo) => addPlannerItem(todo)));
                    } catch (error) {
                      console.error("Failed to update planner item in Firestore", error);
                      setSyncError("Saved locally but couldn't sync to cloud. Changes may be lost if you clear local storage.");
                    }
                  }
                } else {
                  const id = crypto.randomUUID();
                  const generatedTripTodos =
                    payload.category === "trip" && normalizedTripTodos
                      ? buildTripTodoPlannerItems(id, payload.title, payload.date, normalizedTripTodos)
                      : [];

                  setItems((prev) => [
                    ...prev,
                    {
                      id,
                      ...payload
                    },
                    ...generatedTripTodos
                  ]);

                  if (isFirebaseConfigured) {
                    try {
                      await addPlannerItem({
                        id,
                        ...payload
                      });
                      await Promise.all(generatedTripTodos.map((todo) => addPlannerItem(todo)));
                    } catch (error) {
                      console.error("Failed to add planner item to Firestore", error);
                      setSyncError("Saved locally but couldn't sync to cloud. Changes may be lost if you clear local storage.");
                    }
                  }
                }
                setIsSubmitting(false);
                closeModalAndRestoreContext();
                // Preserve the date so the calendar stays on the same day after saving.
                setNewItem(createEmptyFormState(newItem.date));
                if (newItem.category !== "wishlist" && newItem.date) {
                  setSelectedDate(new Date(newItem.date));
                }
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className={modalLabelClass}>
                  Category
                  <select
                    value={newItem.category}
                    onChange={(event) =>
                      setNewItem((prev) => {
                        const category = event.target.value as PlannerItem["category"];
                        return {
                          ...prev,
                          category,
                          date: category === "wishlist" ? "" : prev.date || formatDate(new Date()),
                          endDate: category === "trip" ? prev.endDate || prev.date : "",
                          startTime: category === "event" ? prev.startTime : "",
                          endTime: category === "event" ? prev.endTime : "",
                          location: category === "event" ? prev.location : "",
                          recurring: category === "event" ? prev.recurring : "none",
                          tripTodos: category === "trip" ? prev.tripTodos : "",
                          tripTodoItems:
                            category === "trip"
                              ? prev.tripTodoItems.length > 0
                                ? prev.tripTodoItems
                                : [createEmptyTripTodo()]
                              : [createEmptyTripTodo()],
                          participants: category === "todo" ? "" : prev.participants,
                          pic: category === "todo" ? prev.pic : "",
                          completed: category === "todo" || category === "wishlist" ? prev.completed : false
                        };
                      })
                    }
                    className={modalInputClass}
                  >
                    <option value="trip">Trip</option>
                    <option value="event">Event</option>
                    <option value="todo">Todo</option>
                    <option value="wishlist">Wishlist</option>
                  </select>
                </label>

                <label className={modalLabelClass}>
                  Title
                  <input
                    required
                    value={newItem.title}
                    onChange={(event) =>
                      setNewItem((prev) => ({ ...prev, title: event.target.value }))
                    }
                    className={modalInputClass}
                  />
                </label>

                {newItem.category === "event" || newItem.category === "todo" ? (
                  <label className={modalLabelClass}>
                    Date
                    <input
                      type="date"
                      value={newItem.date}
                      onChange={(event) =>
                        setNewItem((prev) => ({ ...prev, date: event.target.value }))
                      }
                      className={modalInputClass}
                    />
                  </label>
                ) : null}
              </div>

              {newItem.category === "trip" ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className={modalLabelClass}>
                      From
                      <input
                        type="date"
                        required
                        value={newItem.date}
                        onChange={(event) =>
                          setNewItem((prev) => ({ ...prev, date: event.target.value }))
                        }
                        className={modalInputClass}
                      />
                    </label>
                    <label className={modalLabelClass}>
                      To
                      <input
                        type="date"
                        required
                        value={newItem.endDate}
                        onChange={(event) =>
                          setNewItem((prev) => ({ ...prev, endDate: event.target.value }))
                        }
                        className={modalInputClass}
                      />
                    </label>
                  </div>
                  <div className={`space-y-3 rounded-2xl border p-3 ${isDarkMode ? "border-slate-600 bg-slate-700/40" : "border-indigo-100 bg-indigo-50/40"}`}>
                    <div className="flex items-center justify-between">
                      <p className={`text-sm font-semibold ${isDarkMode ? "text-indigo-300" : "text-indigo-700"}`}>Trip todos</p>
                      <button
                        type="button"
                        onClick={() =>
                          setNewItem((prev) => ({
                            ...prev,
                            tripTodoItems: [...prev.tripTodoItems, createEmptyTripTodo()]
                          }))
                        }
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${isDarkMode ? "border-indigo-400/40 text-indigo-300 hover:bg-slate-700" : "border-indigo-200 text-indigo-600 hover:bg-indigo-100"}`}
                      >
                        + Add todo
                      </button>
                    </div>
                    {newItem.tripTodoItems.map((todo, todoIndex) => (
                      <div key={`trip-todo-${todoIndex}`} className={`space-y-2 rounded-xl border p-3 ${isDarkMode ? "border-slate-600 bg-slate-800" : "border-indigo-100 bg-white"}`}>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className={`block text-xs font-medium ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>
                            Todo title
                            <input
                              value={todo.title}
                              onChange={(event) =>
                                setNewItem((prev) => ({
                                  ...prev,
                                  tripTodoItems: prev.tripTodoItems.map((entry, index) =>
                                    index === todoIndex ? { ...entry, title: event.target.value } : entry
                                  )
                                }))
                              }
                              className={modalInputCompactClass}
                            />
                          </label>
                          <label className={`block text-xs font-medium ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>
                            Due date
                            <input
                              type="date"
                              value={todo.date}
                              onChange={(event) =>
                                setNewItem((prev) => ({
                                  ...prev,
                                  tripTodoItems: prev.tripTodoItems.map((entry, index) =>
                                    index === todoIndex ? { ...entry, date: event.target.value } : entry
                                  )
                                }))
                              }
                              className={modalInputCompactClass}
                            />
                          </label>
                        </div>
                        <label className={`block text-xs font-medium ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>
                          PIC
                          <input
                            value={todo.participants ?? ""}
                            onChange={(event) =>
                              setNewItem((prev) => ({
                                ...prev,
                                tripTodoItems: prev.tripTodoItems.map((entry, index) =>
                                  index === todoIndex ? { ...entry, participants: event.target.value } : entry
                                )
                              }))
                            }
                            className={modalInputCompactClass}
                          />
                        </label>
                        <label className={`block text-xs font-medium ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>
                          Details
                          <textarea
                            value={todo.details}
                            onChange={(event) =>
                              setNewItem((prev) => ({
                                ...prev,
                                tripTodoItems: prev.tripTodoItems.map((entry, index) =>
                                  index === todoIndex ? { ...entry, details: event.target.value } : entry
                                )
                              }))
                            }
                            className={`min-h-[70px] ${modalInputCompactClass}`}
                          />
                        </label>
                        {newItem.tripTodoItems.length > 1 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setNewItem((prev) => ({
                                ...prev,
                                tripTodoItems: prev.tripTodoItems.filter((_, index) => index !== todoIndex)
                              }))
                            }
                            className="text-xs font-semibold text-rose-500 hover:text-rose-600"
                          >
                            Remove todo
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {newItem.category === "event" ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className={modalLabelClass}>
                      From time
                      <input
                        type="time"
                        value={newItem.startTime}
                        onChange={(event) =>
                          setNewItem((prev) => ({ ...prev, startTime: event.target.value }))
                        }
                        className={modalInputClass}
                      />
                    </label>
                    <label className={modalLabelClass}>
                      To time (optional)
                      <input
                        type="time"
                        value={newItem.endTime}
                        onChange={(event) =>
                          setNewItem((prev) => ({ ...prev, endTime: event.target.value }))
                        }
                        className={modalInputClass}
                      />
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className={modalLabelClass}>
                      Location
                      <input
                        value={newItem.location}
                        onChange={(event) =>
                          setNewItem((prev) => ({ ...prev, location: event.target.value }))
                        }
                        className={modalInputClass}
                      />
                    </label>
                    <label className={modalLabelClass}>
                      Recurring
                      <select
                        value={newItem.recurring}
                        onChange={(event) => {
                          const v = event.target.value;
                          const recurring = validRecurring.includes(v as NonNullable<PlannerItem["recurring"]>)
                            ? (v as NonNullable<PlannerItem["recurring"]>)
                            : "none";
                          setNewItem((prev) => ({ ...prev, recurring }));
                        }}
                        className={modalInputClass}
                      >
                        <option value="none">Does not repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </label>
                  </div>
                </div>
              ) : null}

              <label className={modalLabelClass}>
                {newItem.category === "todo" ? "PIC" : "Participants"}
                <input
                  value={newItem.category === "todo" ? newItem.pic : newItem.participants}
                  onChange={(event) =>
                    setNewItem((prev) =>
                      prev.category === "todo"
                        ? { ...prev, pic: event.target.value }
                        : { ...prev, participants: event.target.value }
                    )
                  }
                  className={modalInputClass}
                />
              </label>

              <label className={modalLabelClass}>
                Details
                <textarea
                  value={newItem.details}
                  onChange={(event) =>
                    setNewItem((prev) => ({ ...prev, details: event.target.value }))
                  }
                  className={modalTextareaClass}
                />
              </label>

              {newItem.category !== "wishlist" && (
                <div>
                  <p className={`mb-2 text-sm font-medium ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>
                    🔔 Reminder
                  </p>
                  <div className="flex gap-2 items-center">
                    <input
                      type="date"
                      value={newItem.reminderAt.split("T")[0] ?? ""}
                      onChange={(e) => setNewItem((prev) => ({
                        ...prev,
                        reminderAt: e.target.value
                          ? `${e.target.value}T${prev.reminderAt.split("T")[1] || "09:00"}`
                          : ""
                      }))}
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm ${isDarkMode ? "border-slate-600 bg-slate-800 text-slate-100" : "border-pink-200 bg-white text-slate-800"}`}
                    />
                    <input
                      type="time"
                      value={newItem.reminderAt.split("T")[1] ?? "09:00"}
                      disabled={!newItem.reminderAt}
                      onChange={(e) => setNewItem((prev) => ({
                        ...prev,
                        reminderAt: `${prev.reminderAt.split("T")[0] || prev.date}T${e.target.value}`
                      }))}
                      className={`rounded-xl border px-3 py-2 text-sm transition ${
                        !newItem.reminderAt
                          ? isDarkMode ? "border-slate-700 bg-slate-800 text-slate-600 cursor-not-allowed" : "border-pink-100 bg-pink-50 text-slate-400 cursor-not-allowed"
                          : isDarkMode ? "border-slate-600 bg-slate-800 text-slate-100" : "border-pink-200 bg-white text-slate-800"
                      }`}
                    />
                    {newItem.reminderAt && (
                      <button
                        type="button"
                        onClick={() => setNewItem((prev) => ({ ...prev, reminderAt: "" }))}
                        className={`text-xs px-3 py-2 rounded-xl border transition ${isDarkMode ? "border-slate-700 text-slate-400 hover:border-pink-500 hover:text-pink-400" : "border-pink-100 text-slate-400 hover:border-pink-300 hover:text-pink-500"}`}
                      >
                        Off
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                {editingId ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const shouldDelete = window.confirm("Do you really want to delete this item?");
                      if (!shouldDelete) {
                        return;
                      }

                      await handleDeleteItem(editingId);
                      closeModalAndRestoreContext();
                    }}
                    className="rounded-full border border-rose-200 px-5 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-50"
                  >
                    Delete
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    closeModalAndRestoreContext();
                  }}
                  className="rounded-full border border-pink-100 px-5 py-2 text-sm font-semibold text-slate-600 hover:border-pink-200 hover:bg-pink-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-full bg-pink-500 px-6 py-2 text-sm font-semibold text-white shadow-md shadow-pink-200 hover:bg-pink-400 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Saving…" : editingId ? "Save changes" : "Save plan"}
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      ) : null}

      {isNavOpen ? (
        <div className="fixed inset-0 z-40 flex bg-black/40">
          <div className={`flex h-full w-72 flex-col p-6 shadow-soft ${isDarkMode ? "bg-slate-900" : "bg-white"}`}>
            <div className="flex items-center justify-between">
              <p className={`text-sm font-semibold ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>Menu</p>
              <button
                type="button"
                onClick={() => setIsNavOpen(false)}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition ${isDarkMode ? "hover:bg-slate-800 hover:text-slate-200" : "hover:bg-slate-100 hover:text-slate-600"}`}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <div className="mt-6 flex-1 overflow-y-auto pr-1">
              <p className={`text-xs uppercase tracking-[0.2em] ${isDarkMode ? "text-pink-300" : "text-pink-400"}`}>Navigate</p>
              <div className="mt-4 grid gap-3">
                {navGroups.map((group) => {
                  const isExpanded = expandedGroups[group.key];
                  return (
                    <div key={group.key} className={`rounded-2xl border p-2 ${isDarkMode ? "border-slate-700 bg-slate-800/80" : "border-pink-100 bg-white/80"}`}>
                      <div className="flex items-center gap-2">
                        <div className={`flex flex-1 items-center gap-3 rounded-xl px-2 py-2 text-sm font-semibold ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
                          <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-lg ${isDarkMode ? "bg-slate-700" : "bg-white"} ${group.color}`}>
                            {group.icon}
                          </span>
                          <span className="flex-1">{group.label}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
                          className="rounded-xl p-2 text-slate-500"
                          aria-label={`Toggle ${group.label}`}
                        >
                          <svg
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className={`h-4 w-4 transition ${isExpanded ? "rotate-180" : "rotate-0"}`}
                            aria-hidden
                          >
                            <path
                              fillRule="evenodd"
                              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      </div>

                      {isExpanded ? (
                        <div className={`mt-2 space-y-2 border-l pl-3 ${isDarkMode ? "border-slate-700" : "border-pink-100"}`}>
                          {group.entries.length === 0 ? (
                            <p className={`rounded-xl px-3 py-2 text-xs ${isDarkMode ? "bg-slate-700 text-slate-300" : "bg-pink-50 text-slate-500"}`}>
                              No items yet.
                            </p>
                          ) : (
                            group.entries.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  // Tapping a todo/doneTodo entry toggles its completion (todo ↔ done).
                                  // item.category === "todo" is always true here since both groups
                                  // only contain todo items, but the check acts as a type guard for
                                  // TypeScript and documents the intent explicitly.
                                  if ((group.key === "todo" || group.key === "doneTodo") && item.category === "todo") {
                                    void toggleChecklistCompletion(item);
                                    return;
                                  }

                                  setEditingId(item.id);
                                  setIsChoosingCategory(false);
                                  setNewItem({
                                    title: item.title,
                                    category: item.category,
                                    date: item.date,
                                    endDate: item.endDate ?? "",
                                    startTime: item.startTime ?? "",
                                    endTime: item.endTime ?? "",
                                    location: item.location ?? "",
                                    recurring: item.recurring ?? "none",
                                    tripTodos: item.tripTodos ?? "",
                                    tripTodoItems:
                                      item.tripTodoItems && item.tripTodoItems.length > 0
                                        ? item.tripTodoItems
                                        : item.tripTodos
                                          ? [{ title: "Trip todo", date: item.date, details: item.tripTodos, participants: "" }]
                                          : [createEmptyTripTodo()],
                                    participants: item.participants ?? "",
                                    pic: item.pic ?? "",
                                    completed: item.completed ?? false,
                                    details: item.details === "A dreamy new memory." ? "" : item.details,
                                    reminderAt: item.reminderAt ?? (item.reminderDays != null && item.date ? (() => { const [y,m,d] = item.date.split("-").map(Number); const dt = new Date(y, m-1, d - (item.reminderDays ?? 0), 9, 0, 0); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}T09:00`; })() : "")
                                  });
                                  setReturnToNavAfterModal(true);
                                  setIsModalOpen(true);
                                  setIsNavOpen(false);
                                }}
                                className={`w-full rounded-xl border border-pink-100 px-3 py-2 text-left transition hover:border-pink-200 ${group.key === "doneTodo" ? "bg-slate-100/80 hover:bg-slate-100" : "bg-pink-50/60 hover:bg-pink-50"}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className={`min-w-0 flex-1 text-xs font-semibold break-words ${group.key === "doneTodo" ? "text-slate-500 line-through" : "text-slate-800"}`}>{item.title}</p>
                                  <span
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${categoryStyles[item.category].color}`}
                                  >
                                    {categoryStyles[item.category].label}
                                  </span>
                                </div>
                                <p className={`mt-1 text-[11px] ${group.key === "doneTodo" ? "text-slate-400" : "text-slate-500"}`}>{formatMeta(item)}</p>
                                {group.key === "todo" && item.category === "todo" ? (
                                  <div className="mt-2 flex justify-end">
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setEditingId(item.id);
                                        setIsChoosingCategory(false);
                                        setNewItem({
                                          title: item.title,
                                          category: item.category,
                                          date: item.date,
                                          endDate: item.endDate ?? "",
                                          startTime: item.startTime ?? "",
                                          endTime: item.endTime ?? "",
                                          location: item.location ?? "",
                                          recurring: item.recurring ?? "none",
                                          tripTodos: item.tripTodos ?? "",
                                          tripTodoItems:
                                            item.tripTodoItems && item.tripTodoItems.length > 0
                                              ? item.tripTodoItems
                                              : item.tripTodos
                                                ? [{ title: "Trip todo", date: item.date, details: item.tripTodos, participants: "" }]
                                                : [createEmptyTripTodo()],
                                          participants: item.participants ?? "",
                                          pic: item.pic ?? "",
                                          completed: item.completed ?? false,
                                          details: item.details === "A dreamy new memory." ? "" : item.details,
                                          reminderAt: item.reminderAt ?? (item.reminderDays != null && item.date ? (() => { const [y,m,d] = item.date.split("-").map(Number); const dt = new Date(y, m-1, d - (item.reminderDays ?? 0), 9, 0, 0); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}T09:00`; })() : "")
                                        });
                                        setReturnToNavAfterModal(true);
                                        setIsModalOpen(true);
                                      }}
                                      className="rounded-full border border-pink-200 px-2.5 py-0.5 text-[11px] font-semibold text-pink-500 hover:bg-pink-100"
                                    >
                                      Edit
                                    </button>
                                  </div>
                                ) : null}
                                {group.key === "doneTodo" && item.category === "todo" ? (
                                  <div className="mt-2 flex justify-end">
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        const shouldDelete = window.confirm("Do you really want to delete this item?");
                                        if (!shouldDelete) {
                                          return;
                                        }
                                        void handleDeleteItem(item.id);
                                      }}
                                      className="rounded-full border border-rose-200 px-2.5 py-0.5 text-[11px] font-semibold text-rose-500 hover:bg-rose-100"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                ) : null}
                                {item.category === "trip" && item.tripTodoItems && item.tripTodoItems.length > 0 ? (
                                  <div className="mt-1 space-y-1">
                                    {item.tripTodoItems.slice(0, 2).map((todo, index) => (
                                      <p key={`${item.id}-nav-trip-todo-${index}`} className="text-[11px] text-indigo-500">
                                        📝 {todo.title || todo.details || "Trip todo"}
                                      </p>
                                    ))}
                                    {item.tripTodoItems.length > 2 ? (
                                      <p className="text-[11px] text-indigo-400">+{item.tripTodoItems.length - 2} more</p>
                                    ) : null}
                                  </div>
                                ) : item.category === "trip" && item.tripTodos ? (
                                  <p className="mt-1 text-[11px] text-indigo-500">📝 {item.tripTodos}</p>
                                ) : null}
                              </button>
                            ))
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="h-full flex-1"
            onClick={() => setIsNavOpen(false)}
            aria-label="Close navigation"
          />
        </div>
      ) : null}
    </main>
  );
}
