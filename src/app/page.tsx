"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, PlannerItem, type TripTodoEntry } from "@/components/Calendar";
import {
  addPlannerItem,
  configuredProjectId,
  deletePlannerItem,
  getPlannerItems,
  isFirebaseConfigured,
  missingFirebaseConfigVars,
  updatePlannerItem
} from "@/lib/firestore";

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
const LOCAL_LANGUAGE_KEY = "meet-asuka:language";
const LOGIN_PIN = "0000";

const translations = {
  en: {
    welcomeBack: "Welcome back",
    loginSubtitle: "Events • Trips • TODOs • Wishlist",
    pinLabel: "Enter 4-digit PIN",
    pinPlaceholder: "0000",
    loginButton: "Let's go!",
    pinError: "Invalid PIN. Please try 0000.",
    plannerTagline: "Your little planner",
    logout: "Logout",
    openNavigation: "Open navigation",
    darkMode: "Dark mode",
    lightMode: "Light mode",
    switchLanguage: "Switch language",
    prev: "Prev",
    next: "Next",
    today: "Today",
    plansForSelectedDay: "Plans for selected day",
    noPlans: "No plans yet. Add something sweet with the plus button!",
    trips: "Trips",
    events: "Events",
    todos: "Todos",
    wishlist: "Wishlist",
    pastPlans: "Past plans",
    navigate: "Navigate",
    weeklyWeather: "7-Day weather",
    weatherUnavailable: "Weather unavailable",
    weatherLoading: "Loading...",
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  },
  ja: {
    welcomeBack: "おかえりなさい",
    loginSubtitle: "イベント • 旅行 • TODO • ウィッシュリスト",
    pinLabel: "4桁のPINを入力",
    pinPlaceholder: "0000",
    loginButton: "ログイン",
    pinError: "PINが正しくありません。0000を入力してください。",
    plannerTagline: "あなたの小さなプランナー",
    logout: "ログアウト",
    openNavigation: "ナビゲーションを開く",
    darkMode: "ダークモード",
    lightMode: "ライトモード",
    switchLanguage: "言語を切り替え",
    prev: "前へ",
    next: "次へ",
    today: "今日",
    plansForSelectedDay: "選択日の予定",
    noPlans: "予定がありません。プラスボタンで追加しましょう！",
    trips: "旅行",
    events: "イベント",
    todos: "TODO",
    wishlist: "ウィッシュ",
    pastPlans: "過去の予定",
    navigate: "ナビゲート",
    weeklyWeather: "7日間の天気",
    weatherUnavailable: "天気情報を取得できません",
    weatherLoading: "読み込み中...",
    weekdays: ["日", "月", "火", "水", "木", "金", "土"]
  }
} as const;


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
        details: typeof raw.details === "string" ? raw.details : "",
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
    details: typeof raw.details === "string" && raw.details.trim() ? raw.details : "A dreamy new memory."
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
};

export default function Home() {
  type NavGroupKey = PlannerItem["category"] | "past";
  type Language = keyof typeof translations;

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [language, setLanguage] = useState<Language>("en");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isWeatherCardOpen, setIsWeatherCardOpen] = useState(false);
  const [weeklyWeather, setWeeklyWeather] = useState<Array<{ date: string; min: number; max: number; code: number }>>([]);
  const pinInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<PlannerItem[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<
    PlannerItem["category"] | "past"
  >("event");
  const [activeMonth, setActiveMonth] = useState(() => new Date());
  const [newItem, setNewItem] = useState<PlannerFormState>({
    title: "",
    category: "trip",
    date: formatDate(new Date()),
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
    details: ""
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<NavGroupKey, boolean>>({
    trip: false,
    event: false,
    todo: false,
    wishlist: false,
    past: true
  });
  const [weatherLabel, setWeatherLabel] = useState<string>(translations.en.weatherLoading);
  const [hasHydratedPlanner, setHasHydratedPlanner] = useState(false);
  const t = translations[language];

  const normalizedToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, []);

  const selectedKey = formatDate(selectedDate);
  const selectedItems = useMemo(() => {
    const selectedDateOnly = new Date(selectedDate);
    selectedDateOnly.setHours(0, 0, 0, 0);

    return items.filter((item) => {
      if (!item.date) {
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

  const activeMonthLabel = activeMonth.toLocaleDateString(language === "ja" ? "ja-JP" : "en-US", {
    month: "long",
    year: "numeric"
  });

  const allPastItems = useMemo(
    () =>
      items.filter((item) => {
        if (!item.date) {
          return false;
        }
        const itemDate = new Date(item.date);
        itemDate.setHours(0, 0, 0, 0);
        return itemDate < normalizedToday;
      }),
    [items, normalizedToday]
  );

  const navGroups: {
    key: NavGroupKey;
    label: string;
    color: string;
    icon: string;
    entries: PlannerItem[];
  }[] = [
    {
      key: "trip",
      label: t.trips,
      color: "text-indigo-500",
      icon: "🧳",
      entries: items.filter((item) => item.category === "trip")
    },
    {
      key: "event",
      label: t.events,
      color: "text-emerald-500",
      icon: "🎉",
      entries: items.filter((item) => item.category === "event")
    },
    {
      key: "todo",
      label: t.todos,
      color: "text-sky-500",
      icon: "📝",
      entries: items.filter((item) => item.category === "todo")
    },
    {
      key: "wishlist",
      label: t.wishlist,
      color: "text-amber-500",
      icon: "🌟",
      entries: items.filter((item) => item.category === "wishlist")
    },
    {
      key: "past",
      label: t.pastPlans,
      color: "text-rose-500",
      icon: "⏳",
      entries: allPastItems
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

    const storedLanguage = window.localStorage.getItem(LOCAL_LANGUAGE_KEY);
    if (storedLanguage === "ja" || storedLanguage === "en") {
      setLanguage(storedLanguage);
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
    window.localStorage.setItem(LOCAL_LANGUAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    setWeatherLabel((previous) => {
      if (previous === "Loading..." || previous === "読み込み中...") {
        return t.weatherLoading;
      }
      return previous;
    });
  }, [t.weatherLoading]);

  useEffect(() => {
    const loadPlanner = async () => {
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

      try {
        const remoteItems = normalizePlannerItems(await getPlannerItems());
        const remoteById = new Map(remoteItems.map((item) => [item.id, item]));
        const mergedById = new Map(remoteById);

        // Prefer local versions so unsynced edits are not lost on refresh.
        localItems.forEach((item) => {
          mergedById.set(item.id, item);
        });

        const mergedItems = Array.from(mergedById.values());
        setItems(mergedItems);

        const localOnlyItems = localItems.filter((item) => !remoteById.has(item.id));
        if (localOnlyItems.length > 0) {
          await Promise.all(localOnlyItems.map((item) => addPlannerItem(item)));
        }
      } catch (error) {
        console.error("Failed to sync planner items with Firestore", error);
        setItems(localItems);
      } finally {
        setHasHydratedPlanner(true);
      }
    };

    void loadPlanner();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !hasHydratedPlanner) {
      return;
    }
    window.localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(items));
  }, [hasHydratedPlanner, items]);

  useEffect(() => {
    const loadWeather = async () => {
      try {
        const response = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=35.7082&longitude=139.6984&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FTokyo"
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
        setWeatherLabel(t.weatherUnavailable);
        setWeeklyWeather([]);
      }
    };

    void loadWeather();
  }, [t.weatherUnavailable]);

  useEffect(() => {
    if (!isLoggedIn) {
      pinInputRef.current?.focus();
    }
  }, [isLoggedIn]);

  const handleDeleteItem = async (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));

    if (!isFirebaseConfigured) {
      return;
    }

    try {
      await deletePlannerItem(id);
    } catch (error) {
      console.error("Failed to delete planner item from Firestore", error);
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
    }
  };

  const getWeatherIcon = (code: number) => {
    if (code === 0) return "☀️";
    if (code <= 3) return "⛅";
    if (code === 45 || code === 48) return "🌫️";
    if (code >= 51 && code <= 67) return "🌧️";
    if (code >= 71 && code <= 77) return "❄️";
    if (code >= 80 && code <= 82) return "🌦️";
    if (code >= 95) return "⛈️";
    return "🌤️";
  };

  const formatWeatherDay = (date: string) =>
    new Date(date).toLocaleDateString(language === "ja" ? "ja-JP" : "en-US", {
      weekday: "short",
      month: "short",
      day: "numeric"
    });

  const handleLogin = () => {
    if (pinInput === LOGIN_PIN) {
      setIsLoggedIn(true);
      setPinError("");
      return;
    }

    setPinError(t.pinError);
  };

  if (!isLoggedIn) {
    return (
      <main className={`relative flex min-h-screen items-center justify-center overflow-hidden p-6 ${isDarkMode ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" : "bg-gradient-to-br from-pink-100 via-blush to-orange-100"}`}>
        <div className="pointer-events-none absolute -left-16 top-10 h-44 w-44 rounded-full bg-pink-300/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-8 h-52 w-52 rounded-full bg-rose-300/30 blur-3xl" />
        <div className={`w-full max-w-xl rounded-[36px] border p-10 text-center shadow-soft backdrop-blur ${isDarkMode ? "border-slate-700 bg-slate-800/90" : "border-white/60 bg-white/85"}`}>
          <p className={`text-left text-sm font-medium ${isDarkMode ? "text-slate-300" : "text-slate-500"}`}>{t.welcomeBack}</p>
          <h1 className={`mt-1 text-left text-5xl font-bold ${isDarkMode ? "text-white" : "text-slate-800"}`}>Asuka ✨</h1>
          <p className={`mt-2 text-left text-base ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>{t.loginSubtitle}</p>
          <div className="mt-7 flex justify-center">
            <img src="https://raw.githubusercontent.com/chux0519/runcat-tray/master/runcat.gif" alt="RunCat loading" className="h-16 w-auto" />
          </div>
          <div className="mt-6 text-center">
            <p className={`text-sm font-semibold ${isDarkMode ? "text-slate-200" : "text-slate-600"}`}>{t.pinLabel}</p>
            <button
              type="button"
              onClick={() => pinInputRef.current?.focus()}
              className="mx-auto mt-3 grid grid-cols-4 gap-3"
              aria-label={t.pinLabel}
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
                setPinInput(event.target.value.replace(/\D/g, "").slice(0, 4));
                if (pinError) {
                  setPinError("");
                }
              }}
              className="sr-only"
              placeholder={t.pinPlaceholder}
            />
          </div>
          {pinError ? <p className="mt-2 text-left text-sm text-rose-400">{pinError}</p> : null}
          <button
            type="button"
            onClick={handleLogin}
            className={`mt-8 inline-flex items-center justify-center rounded-full px-9 py-3 text-base font-semibold text-white shadow-lg transition hover:-translate-y-0.5 ${isDarkMode ? "bg-fuchsia-600 shadow-fuchsia-900/50 hover:bg-fuchsia-500" : "bg-pink-500 shadow-pink-200 hover:bg-pink-400"}`}
          >
            {t.loginButton}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={`min-h-screen px-5 pb-24 pt-6 ${isDarkMode ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" : "bg-gradient-to-br from-pink-50 via-blush to-orange-100"}`}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className={`relative z-20 rounded-3xl px-3 py-2 shadow-soft backdrop-blur ${isDarkMode ? "bg-slate-900/85 border border-slate-700" : "bg-white/70"}`}>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsNavOpen(true)}
              className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl transition hover:-translate-y-0.5 ${isDarkMode ? "bg-slate-800 text-pink-300 shadow-lg shadow-black/20 hover:bg-slate-700" : "bg-white text-pink-500 shadow-lg shadow-pink-100 hover:bg-pink-50"}`}
              aria-label={t.openNavigation}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M4 6h16a1 1 0 1 0 0-2H4a1 1 0 1 0 0 2zm16 5H4a1 1 0 1 0 0 2h16a1 1 0 1 0 0-2zm0 7H4a1 1 0 1 0 0 2h16a1 1 0 1 0 0-2z" />
              </svg>
            </button>
            <div className="text-center">
              <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${isDarkMode ? "text-pink-300" : "text-pink-400"}`}>
                {t.plannerTagline}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLanguage((prev) => (prev === "en" ? "ja" : "en"))}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-sm ${isDarkMode ? "border-slate-500 bg-slate-700 text-slate-100" : "border-slate-300 bg-slate-100 text-slate-700"}`}
                aria-label={t.switchLanguage}
                title={t.switchLanguage}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h7m-3.5 0v1.5M6 8h5m-2.5 0c0 2.7-1.7 4.7-4 6m6-2c-1.3-1-2.4-2.3-3.1-4" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 8h6m-3 0v11m-4-3h8" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setIsDarkMode((prev) => !prev)}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-sm ${isDarkMode ? "border-slate-500 bg-slate-700 text-slate-100" : "border-slate-300 bg-slate-100 text-slate-700"}`}
                aria-label={isDarkMode ? t.lightMode : t.darkMode}
                title={isDarkMode ? t.lightMode : t.darkMode}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <circle cx="12" cy="12" r="3.2" />
                  <path strokeLinecap="round" d="M12 2.5v2.2M12 19.3v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
                </svg>
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsWeatherCardOpen((prev) => !prev)}
                  className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium shadow ${isDarkMode ? "bg-slate-800 text-slate-100" : "bg-white/90 text-slate-700"}`}
                  aria-label={t.weeklyWeather}
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
                  <span className="hidden sm:inline">{t.weeklyWeather}</span>
                </button>
                {isWeatherCardOpen ? (
                  <div className={`absolute right-0 mt-2 w-80 rounded-2xl border p-3 shadow-xl ${isDarkMode ? "border-slate-700 bg-slate-900 text-slate-100" : "border-pink-100 bg-white text-slate-700"}`}>
                    <p className={`text-sm font-semibold ${isDarkMode ? "text-slate-100" : "text-slate-700"}`}>{t.weeklyWeather}</p>
                    {weeklyWeather.length === 0 ? (
                      <p className={`mt-2 text-sm ${isDarkMode ? "text-slate-300" : "text-slate-500"}`}>{t.weatherLoading}</p>
                    ) : (
                      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                        {weeklyWeather.map((day) => (
                          <div
                            key={day.date}
                            className={`rounded-xl border px-3 py-2 ${isDarkMode ? "border-slate-700 bg-slate-800 text-slate-100" : "border-pink-100 bg-pink-50/60 text-slate-700"}`}
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold">{formatWeatherDay(day.date)}</p>
                              <p className="text-lg">{getWeatherIcon(day.code)}</p>
                            </div>
                            <p className="mt-1 text-xs font-medium">{day.max}° / {day.min}°</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <div style={{ fontSize: 10, opacity: 0.75 }} className={`px-1 ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
          Firebase configured: {String(isFirebaseConfigured)}
          {isFirebaseConfigured ? ` • project: ${configuredProjectId}` : ""}
          {missingFirebaseConfigVars.length > 0
            ? ` • missing env: ${missingFirebaseConfigVars.join(", ")}`
            : ""}
        </div>

        <div className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold shadow ${isDarkMode ? "bg-slate-900/80 text-slate-100" : "bg-white/80 text-slate-700"}`}>
          <button
            type="button"
            onClick={() =>
              setActiveMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
            }
            className={`flex items-center gap-2 rounded-full px-4 py-2 transition ${isDarkMode ? "bg-slate-700 text-pink-200 hover:bg-slate-600" : "bg-pink-50 text-pink-500 hover:bg-pink-100"}`}
          >
            <span>←</span>
            {t.prev}
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
            {t.today}
          </button>
          <button
            type="button"
            onClick={() =>
              setActiveMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
            }
            className={`flex items-center gap-2 rounded-full px-4 py-2 transition ${isDarkMode ? "bg-slate-700 text-pink-200 hover:bg-slate-600" : "bg-pink-50 text-pink-500 hover:bg-pink-100"}`}
          >
            {t.next}
            <span>→</span>
          </button>
        </div>

        <Calendar
          month={new Date(activeMonth.getFullYear(), activeMonth.getMonth(), 1)}
          monthLabel={activeMonthLabel}
          weekdayLabels={t.weekdays}
          isDarkMode={isDarkMode}
          items={items}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />

        <section className={`rounded-3xl p-6 shadow-soft ${isDarkMode ? "bg-slate-900/80" : "bg-white/80"}`}>
          <h3 className={`text-lg font-semibold ${isDarkMode ? "text-slate-100" : "text-slate-800"}`}>
            {t.plansForSelectedDay}
          </h3>
          <div className="mt-4 space-y-3">
            {selectedItems.length === 0 ? (
              <p className={`text-sm ${isDarkMode ? "text-slate-300" : "text-slate-500"}`}>
                {t.noPlans}
              </p>
            ) : (
                selectedItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.category === "todo" || item.category === "wishlist") {
                        void toggleChecklistCompletion(item);
                        return;
                      }

                      setEditingId(item.id);
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
                        details: item.details
                      });
                      setIsModalOpen(true);
                    }}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5 ${(item.category === "todo" || item.category === "wishlist") && item.completed ? "border-emerald-200 bg-emerald-50/70" : "border-pink-100 bg-white hover:border-pink-200 hover:bg-pink-50/50"}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className={`text-sm font-semibold ${(item.category === "todo" || item.category === "wishlist") && item.completed ? "text-slate-400 line-through" : "text-slate-800"}`}>
                        {item.title}
                      </p>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${categoryStyles[item.category].color}`}
                      >
                        {categoryStyles[item.category].label}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-pink-400">
                      {formatMeta(item)}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">{item.details}</p>
                    {item.category === "todo" ? (
                      item.pic ? <p className="mt-1 text-xs text-slate-500">👤 PIC: {item.pic}</p> : null
                    ) : item.participants ? (
                      <p className="mt-1 text-xs text-slate-500">👥 {item.participants}</p>
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
                  </button>
                ))
              )}
          </div>
        </section>

        <div className="pb-2">
          <button
            type="button"
            onClick={() => setIsLoggedIn(false)}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-soft transition ${isDarkMode ? "border-slate-700 bg-slate-900/80 text-pink-300 hover:bg-slate-800" : "border-pink-100 bg-white/80 text-pink-600 hover:bg-pink-50"}` }
          >
            <span className="text-lg">👋</span>
            {t.logout}
          </button>
        </div>

      </div>

      <button
        type="button"
        onClick={() => {
          setEditingId(null);
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
                <h4 className="text-xl font-semibold text-slate-800">
                  {editingId ? "Edit plan" : "Add a sweet plan"}
                </h4>
                <p className={`text-sm ${isDarkMode ? "text-slate-300" : "text-slate-500"}`}>
                  Trips, events, todos, or wishlist ideas.
                </p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingId(null);
                }}
              >
                ✕
              </button>
            </div>

            <form
              className="mt-6 space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                const payload = {
                  title: newItem.title.trim() || "Untitled plan",
                  category: newItem.category as PlannerItem["category"],
                  date: newItem.category === "wishlist" ? "" : newItem.date,
                  endDate:
                    newItem.category === "trip"
                      ? newItem.endDate || newItem.date
                      : undefined,
                  startTime: newItem.category === "event" ? newItem.startTime : undefined,
                  endTime: newItem.category === "event" ? newItem.endTime : undefined,
                  location: newItem.category === "event" ? newItem.location.trim() : undefined,
                  recurring:
                    newItem.category === "event"
                      ? (newItem.recurring as PlannerItem["recurring"])
                      : undefined,
                  tripTodos: newItem.category === "trip" ? newItem.tripTodos.trim() : undefined,
                  tripTodoItems:
                    newItem.category === "trip"
                      ? newItem.tripTodoItems
                          .map((todo) => ({
                            title: todo.title.trim(),
                            date: todo.date,
                            details: todo.details.trim(),
                            participants: todo.participants?.trim() || undefined
                          }))
                          .filter((todo) => todo.title || todo.details || todo.date)
                      : undefined,
                  participants:
                    newItem.category !== "todo" ? newItem.participants.trim() || undefined : undefined,
                  pic: newItem.category === "todo" ? newItem.pic.trim() || undefined : undefined,
                  completed:
                    newItem.category === "todo" || newItem.category === "wishlist"
                      ? newItem.completed
                      : undefined,
                  details: newItem.details.trim() || "A dreamy new memory."
                };
                if (editingId) {
                  setItems((prev) =>
                    prev.map((item) => (item.id === editingId ? { ...item, ...payload } : item))
                  );
                  if (isFirebaseConfigured) {
                    try {
                      await updatePlannerItem(editingId, payload);
                    } catch (error) {
                      console.error("Failed to update planner item in Firestore", error);
                    }
                  }
                } else {
                  const id = crypto.randomUUID();
                  setItems((prev) => [
                    ...prev,
                    {
                      id,
                      ...payload
                    }
                  ]);
                  if (isFirebaseConfigured) {
                    try {
                      await addPlannerItem({
                        id,
                        ...payload
                      });
                    } catch (error) {
                      console.error("Failed to add planner item to Firestore", error);
                    }
                  }
                }
                setIsModalOpen(false);
                setNewItem({
                  title: "",
                  category: "trip",
                  date: newItem.date,
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
                  details: ""
                });
                setEditingId(null);
                if (newItem.category !== "wishlist" && newItem.date) {
                  setSelectedDate(new Date(newItem.date));
                }
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
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
                    className="mt-2 w-full rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
                  >
                    <option value="trip">Trip</option>
                    <option value="event">Event</option>
                    <option value="todo">Todo</option>
                    <option value="wishlist">Wishlist</option>
                  </select>
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Title
                  <input
                    value={newItem.title}
                    onChange={(event) =>
                      setNewItem((prev) => ({ ...prev, title: event.target.value }))
                    }
                    className="mt-2 w-full rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
                    placeholder="Cherry blossom day trip"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Date
                  {newItem.category === "wishlist" ? (
                    <span className="mt-2 block w-full rounded-2xl border border-dashed border-pink-200 bg-pink-50/60 px-4 py-3 text-sm text-slate-500">
                      No date needed for wishlist dreams ✨
                    </span>
                  ) : newItem.category === "trip" ? (
                    <span className="mt-2 block w-full rounded-2xl border border-dashed border-pink-200 bg-pink-50/60 px-4 py-3 text-sm text-slate-500">
                      Pick your trip range below.
                    </span>
                  ) : (
                    <input
                      type="date"
                      value={newItem.date}
                      onChange={(event) =>
                        setNewItem((prev) => ({ ...prev, date: event.target.value }))
                      }
                      className="mt-2 w-full rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
                    />
                  )}
                </label>
              </div>

              {newItem.category === "trip" ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block text-sm font-medium text-slate-700">
                      From
                      <input
                        type="date"
                        value={newItem.date}
                        onChange={(event) =>
                          setNewItem((prev) => ({ ...prev, date: event.target.value }))
                        }
                        className="mt-2 w-full rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      To
                      <input
                        type="date"
                        value={newItem.endDate}
                        onChange={(event) =>
                          setNewItem((prev) => ({ ...prev, endDate: event.target.value }))
                        }
                        className="mt-2 w-full rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
                      />
                    </label>
                  </div>
                  <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-indigo-700">Trip todos</p>
                      <button
                        type="button"
                        onClick={() =>
                          setNewItem((prev) => ({
                            ...prev,
                            tripTodoItems: [...prev.tripTodoItems, createEmptyTripTodo()]
                          }))
                        }
                        className="rounded-full border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-100"
                      >
                        + Add todo
                      </button>
                    </div>
                    {newItem.tripTodoItems.map((todo, todoIndex) => (
                      <div key={`trip-todo-${todoIndex}`} className="space-y-2 rounded-xl border border-indigo-100 bg-white p-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="block text-xs font-medium text-slate-700">
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
                              className="mt-1 w-full rounded-xl border border-pink-100 bg-pink-50/60 px-3 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none"
                              placeholder="Pack camera"
                            />
                          </label>
                          <label className="block text-xs font-medium text-slate-700">
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
                              className="mt-1 w-full rounded-xl border border-pink-100 bg-pink-50/60 px-3 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none"
                            />
                          </label>
                        </div>
                        <label className="block text-xs font-medium text-slate-700">
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
                            className="mt-1 w-full rounded-xl border border-pink-100 bg-pink-50/60 px-3 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none"
                            placeholder="Person responsible"
                          />
                        </label>
                        <label className="block text-xs font-medium text-slate-700">
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
                            className="mt-1 min-h-[70px] w-full rounded-xl border border-pink-100 bg-pink-50/60 px-3 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none"
                            placeholder="Charge battery and pack the strap."
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
                    <label className="block text-sm font-medium text-slate-700">
                      From time
                      <input
                        type="time"
                        value={newItem.startTime}
                        onChange={(event) =>
                          setNewItem((prev) => ({ ...prev, startTime: event.target.value }))
                        }
                        className="mt-2 w-full rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      To time (optional)
                      <input
                        type="time"
                        value={newItem.endTime}
                        onChange={(event) =>
                          setNewItem((prev) => ({ ...prev, endTime: event.target.value }))
                        }
                        className="mt-2 w-full rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
                      />
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block text-sm font-medium text-slate-700">
                      Location
                      <input
                        value={newItem.location}
                        onChange={(event) =>
                          setNewItem((prev) => ({ ...prev, location: event.target.value }))
                        }
                        className="mt-2 w-full rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
                        placeholder="Shibuya Sky"
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Recurring
                      <select
                        value={newItem.recurring}
                        onChange={(event) =>
                          setNewItem((prev) => ({ ...prev, recurring: event.target.value as PlannerItem["recurring"] }))
                        }
                        className="mt-2 w-full rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
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

              <label className="block text-sm font-medium text-slate-700">
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
                  className="mt-2 w-full rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
                  placeholder={newItem.category === "todo" ? "Person responsible" : "Asuka, Yui, Rina"}
                />
              </label>

              {newItem.category === "todo" || newItem.category === "wishlist" ? (
                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={newItem.completed}
                    onChange={(event) =>
                      setNewItem((prev) => ({ ...prev, completed: event.target.checked }))
                    }
                    className="h-4 w-4 rounded border-pink-200 text-pink-500 focus:ring-pink-300"
                  />
                  {newItem.category === "todo" ? "Mark TODO as done" : "Mark wishlist as done"}
                </label>
              ) : null}

              <label className="block text-sm font-medium text-slate-700">
                Details
                <textarea
                  value={newItem.details}
                  onChange={(event) =>
                    setNewItem((prev) => ({ ...prev, details: event.target.value }))
                  }
                  className="mt-2 min-h-[110px] w-full rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
                  placeholder="Matcha cafe, pastel photos, cozy playlist."
                />
              </label>

              <div className="flex justify-end gap-3">
                {editingId ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await handleDeleteItem(editingId);
                      setIsModalOpen(false);
                      setEditingId(null);
                    }}
                    className="rounded-full border border-rose-200 px-5 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-50"
                  >
                    Delete
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingId(null);
                  }}
                  className="rounded-full border border-pink-100 px-5 py-2 text-sm font-semibold text-slate-600 hover:border-pink-200 hover:bg-pink-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-pink-500 px-6 py-2 text-sm font-semibold text-white shadow-md shadow-pink-200 hover:bg-pink-400"
                >
                  {editingId ? "Save changes" : "Save plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isNavOpen ? (
        <div className="fixed inset-0 z-40 flex bg-black/40">
          <div className="flex h-full w-72 flex-col bg-white p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-pink-100 text-xl">
                  💖
                </span>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-pink-400">Asuka</p>
                  <p className="text-base font-semibold text-slate-800">Sweet Planner</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNavOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="mt-6 flex-1 overflow-y-auto pr-1">
              <p className="text-xs uppercase tracking-[0.2em] text-pink-400">{t.navigate}</p>
              <div className="mt-4 grid gap-3">
                {navGroups.map((group) => {
                  const isExpanded = expandedGroups[group.key];
                  return (
                    <div key={group.key} className="rounded-2xl border border-pink-100 bg-white/80 p-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveCategory(group.key)}
                          className={`flex flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left text-sm font-semibold transition ${
                            activeCategory === group.key
                              ? "bg-pink-50 text-slate-800"
                              : "text-slate-600 hover:bg-pink-50"
                          }`}
                        >
                          <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-lg ${group.color}`}>
                            {group.icon}
                          </span>
                          <span className="flex-1">{group.label}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }))
                          }
                          className="rounded-xl p-2 text-slate-500 transition hover:bg-pink-50 hover:text-pink-500"
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
                        <div className="mt-2 space-y-2 border-l border-pink-100 pl-3">
                          {group.entries.length === 0 ? (
                            <p className="rounded-xl bg-pink-50 px-3 py-2 text-xs text-slate-500">
                              No items yet.
                            </p>
                          ) : (
                            group.entries.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  setEditingId(item.id);
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
                                    details: item.details
                                  });
                                  setIsModalOpen(true);
                                  setIsNavOpen(false);
                                }}
                                className="w-full rounded-xl border border-pink-100 bg-pink-50/60 px-3 py-2 text-left transition hover:border-pink-200 hover:bg-pink-50"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-xs font-semibold text-slate-800">{item.title}</p>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${categoryStyles[item.category].color}`}
                                  >
                                    {categoryStyles[item.category].label}
                                  </span>
                                </div>
                                <p className="mt-1 text-[11px] text-slate-500">{formatMeta(item)}</p>
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
