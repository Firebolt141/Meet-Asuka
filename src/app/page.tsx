"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, PlannerItem } from "@/components/Calendar";
import { addPlannerItem, getPlannerItems, isFirebaseConfigured, updatePlannerItem } from "@/lib/firestore";

const starterItems: PlannerItem[] = [
  {
    id: "1",
    title: "Kyoto Cozy Trip",
    category: "trip",
    date: "2024-11-05",
    details: "Book the sweet ryokan and matcha cafe hop."
  },
  {
    id: "2",
    title: "Bestie Picnic",
    category: "event",
    date: "2024-11-12",
    details: "Pack strawberry bento + pastel blanket."
  },
  {
    id: "3",
    title: "Todo: Pack Camera",
    category: "todo",
    date: "2024-11-12",
    details: "Charge batteries + bring the pastel strap."
  },
  {
    id: "4",
    title: "Wish: Disney Date",
    category: "wishlist",
    date: "2024-11-20",
    details: "Collect outfit ideas + snacks list."
  }
];

const pad = (value: number) => value.toString().padStart(2, "0");

const formatDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const categoryStyles: Record<PlannerItem["category"], { label: string; color: string }> = {
  trip: { label: "Trip", color: "bg-indigo-100 text-indigo-600" },
  event: { label: "Event", color: "bg-emerald-100 text-emerald-600" },
  todo: { label: "Todo", color: "bg-sky-100 text-sky-600" },
  wishlist: { label: "Wishlist", color: "bg-amber-100 text-amber-600" }
};

export default function Home() {
  type NavGroupKey = PlannerItem["category"] | "past";

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [items, setItems] = useState<PlannerItem[]>(starterItems);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<
    PlannerItem["category"] | "past"
  >("event");
  const [activeMonth, setActiveMonth] = useState(() => new Date());
  const [newItem, setNewItem] = useState({
    title: "",
    category: "trip",
    date: formatDate(new Date()),
    endDate: "",
    startTime: "",
    endTime: "",
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

  const selectedKey = formatDate(selectedDate);
  const normalizedToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, []);

  const filteredItems = useMemo(() => {
    if (activeCategory === "past") {
      return items;
    }
    return items.filter((item) => item.category === activeCategory);
  }, [activeCategory, items]);

  const selectedItems = useMemo(
    () => items.filter((item) => item.date && item.date === selectedKey),
    [items, selectedKey]
  );

  const activeMonthLabel = activeMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });

  const upcomingItems = useMemo(
    () =>
      filteredItems.filter((item) => {
        if (!item.date) {
          return false;
        }
        const itemDate = new Date(item.date);
        itemDate.setHours(0, 0, 0, 0);
        if (activeCategory === "past") {
          return false;
        }
        return itemDate >= normalizedToday;
      }),
    [activeCategory, filteredItems, normalizedToday]
  );

  const pastItems = useMemo(
    () =>
      filteredItems.filter((item) => {
        if (!item.date) {
          return false;
        }
        const itemDate = new Date(item.date);
        itemDate.setHours(0, 0, 0, 0);
        if (activeCategory === "past") {
          return itemDate < normalizedToday;
        }
        return itemDate < normalizedToday;
      }),
    [activeCategory, filteredItems, normalizedToday]
  );

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
      label: "Trips",
      color: "text-indigo-500",
      icon: "🧳",
      entries: items.filter((item) => item.category === "trip")
    },
    {
      key: "event",
      label: "Events",
      color: "text-emerald-500",
      icon: "🎉",
      entries: items.filter((item) => item.category === "event")
    },
    {
      key: "todo",
      label: "Todos",
      color: "text-sky-500",
      icon: "📝",
      entries: items.filter((item) => item.category === "todo")
    },
    {
      key: "wishlist",
      label: "Wishlist",
      color: "text-amber-500",
      icon: "🌟",
      entries: items.filter((item) => item.category === "wishlist")
    },
    {
      key: "past",
      label: "Past plans",
      color: "text-rose-500",
      icon: "⏳",
      entries: allPastItems
    }
  ];

  const formatMeta = (item: PlannerItem) => {
    if (item.category === "wishlist") {
      return "No date set";
    }
    if (item.category === "trip") {
      if (item.endDate && item.endDate !== item.date) {
        return `Dates: ${item.date} → ${item.endDate}`;
      }
      return `Date: ${item.date}`;
    }
    if (item.category === "event") {
      const time = item.startTime
        ? item.endTime
          ? `${item.startTime} → ${item.endTime}`
          : `${item.startTime} → ?`
        : "Time TBD";
      return `When: ${item.date} • ${time}`;
    }
    return `Due: ${item.date}`;
  };

  useEffect(() => {
    const loadPlanner = async () => {
      if (!isFirebaseConfigured) {
        return;
      }
      const remoteItems = await getPlannerItems();
      setItems(remoteItems);
    };
    loadPlanner();
  }, []);

  if (!isLoggedIn) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-pink-100 via-blush to-orange-100 p-6">
        <div className="w-full max-w-lg rounded-[32px] bg-white/80 p-10 text-center shadow-soft">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pink-400">
            Welcome home
          </p>
          <h1 className="mt-4 text-4xl font-bold text-slate-800">
            Hi Asuka
          </h1>
          <p className="mt-3 text-base text-slate-600">
            Ready for the cutest travel plans and cozy memories?
          </p>
          <button
            type="button"
            onClick={() => setIsLoggedIn(true)}
            className="mt-8 inline-flex items-center justify-center rounded-full bg-pink-500 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-pink-200 transition hover:-translate-y-0.5 hover:bg-pink-400"
          >
            Let&apos;s go
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-pink-50 via-blush to-orange-100 px-5 pb-24 pt-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="sticky top-4 z-20 flex items-center justify-between rounded-3xl bg-white/70 px-3 py-2 shadow-soft backdrop-blur">
          <button
            type="button"
            onClick={() => setIsNavOpen(true)}
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-pink-500 shadow-lg shadow-pink-100 transition hover:-translate-y-0.5 hover:bg-pink-50"
            aria-label="Open navigation"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M4 6h16a1 1 0 1 0 0-2H4a1 1 0 1 0 0 2zm16 5H4a1 1 0 1 0 0 2h16a1 1 0 1 0 0-2zm0 7H4a1 1 0 1 0 0 2h16a1 1 0 1 0 0-2z" />
            </svg>
          </button>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pink-400">
              Your sweet calendar
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-800">{activeMonthLabel}</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-3 rounded-full bg-white/90 px-3 py-2 text-xs font-medium text-slate-700 shadow">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-pink-100">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5 text-pink-500"
                fill="currentColor"
              >
                <path d="M6.4 13a4.6 4.6 0 1 1 8.9-1.8A3.8 3.8 0 1 1 16 18H7.5a3.5 3.5 0 0 1-1.1-5z" />
              </svg>
            </span>
            <div>
              <p className="text-[11px] text-slate-500">Weather</p>
              <p className="text-xs font-semibold">Sunny 26°C</p>
            </div>
            </div>
          </div>
        </header>

        <div className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700 shadow">
          <button
            type="button"
            onClick={() =>
              setActiveMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
            }
            className="flex items-center gap-2 rounded-full bg-pink-50 px-4 py-2 text-pink-500 transition hover:bg-pink-100"
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
            className="rounded-full border border-pink-100 px-3 py-1 text-xs font-semibold text-pink-500 transition hover:bg-pink-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() =>
              setActiveMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
            }
            className="flex items-center gap-2 rounded-full bg-pink-50 px-4 py-2 text-pink-500 transition hover:bg-pink-100"
          >
            Next
            <span>→</span>
          </button>
        </div>

        <Calendar
          month={new Date(activeMonth.getFullYear(), activeMonth.getMonth(), 1)}
          items={items}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />

        <section className="rounded-3xl bg-white/80 p-6 shadow-soft">
          <h3 className="text-lg font-semibold text-slate-800">
            Plans for {selectedDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
          </h3>
          <div className="mt-4 space-y-3">
            {selectedItems.length === 0 ? (
              <p className="text-sm text-slate-500">
                No plans yet. Add something sweet with the plus button!
              </p>
            ) : (
                selectedItems.map((item) => (
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
                        details: item.details
                      });
                      setIsModalOpen(true);
                    }}
                    className="w-full rounded-2xl border border-pink-100 bg-white px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-pink-200 hover:bg-pink-50/50"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">
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
                  </button>
                ))
              )}
          </div>
        </section>

        <section className="rounded-3xl bg-white/80 p-6 shadow-soft">
          <h3 className="text-lg font-semibold text-slate-800">Today & upcoming</h3>
          <div className="mt-4 space-y-3">
            {upcomingItems.length === 0 ? (
              <p className="text-sm text-slate-500">No upcoming plans yet.</p>
            ) : (
              upcomingItems.map((item) => (
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
                      details: item.details
                    });
                    setIsModalOpen(true);
                  }}
                  className="w-full rounded-2xl border border-pink-100 bg-white px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-pink-200 hover:bg-pink-50/50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">
                      {item.title}
                    </p>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${categoryStyles[item.category].color}`}
                    >
                      {categoryStyles[item.category].label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{formatMeta(item)}</p>
                  <p className="mt-2 text-sm text-slate-600">{item.details}</p>
                </button>
              ))
            )}
          </div>
        </section>

        <div className="pb-2">
          <button
            type="button"
            onClick={() => setIsLoggedIn(false)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-pink-100 bg-white/80 px-4 py-3 text-sm font-semibold text-pink-600 shadow-soft transition hover:bg-pink-50"
          >
            <span className="text-lg">👋</span>
            Logout
          </button>
        </div>

      </div>

      <button
        type="button"
        onClick={() => {
          setEditingId(null);
          setIsModalOpen(true);
        }}
        className="fixed bottom-8 right-8 flex h-14 w-14 items-center justify-center rounded-full bg-pink-500 text-3xl font-semibold text-white shadow-lg shadow-pink-200 transition hover:-translate-y-1 hover:bg-pink-400"
        aria-label="Add plan"
      >
        +
      </button>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-soft">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-xl font-semibold text-slate-800">
                  {editingId ? "Edit plan" : "Add a sweet plan"}
                </h4>
                <p className="text-sm text-slate-500">
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
              onSubmit={(event) => {
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
                  details: newItem.details.trim() || "A dreamy new memory."
                };
                if (editingId) {
                  setItems((prev) =>
                    prev.map((item) => (item.id === editingId ? { ...item, ...payload } : item))
                  );
                  if (isFirebaseConfigured) {
                    void updatePlannerItem(editingId, payload);
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
                    void addPlannerItem({
                      id,
                      ...payload
                    });
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
                  details: ""
                });
                setEditingId(null);
                if (newItem.category !== "wishlist" && newItem.date) {
                  setSelectedDate(new Date(newItem.date));
                }
              }}
            >
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
                          endTime: category === "event" ? prev.endTime : ""
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
              ) : null}

              {newItem.category === "event" ? (
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
              <p className="text-xs uppercase tracking-[0.2em] text-pink-400">Navigate</p>
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
