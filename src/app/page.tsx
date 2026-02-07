"use client";

import { useMemo, useState } from "react";
import { Calendar, PlannerItem } from "@/components/Calendar";

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
    title: "Wish: Disney Date",
    category: "wishlist",
    date: "2024-11-20",
    details: "Collect outfit ideas + snacks list."
  }
];

const pad = (value: number) => value.toString().padStart(2, "0");

const formatDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [items, setItems] = useState<PlannerItem[]>(starterItems);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    title: "",
    category: "trip",
    date: formatDate(new Date()),
    details: ""
  });

  const selectedKey = formatDate(selectedDate);
  const selectedItems = useMemo(
    () => items.filter((item) => item.date === selectedKey),
    [items, selectedKey]
  );

  const monthLabel = selectedDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });

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
    <main className="min-h-screen bg-gradient-to-br from-pink-50 via-blush to-orange-100 px-6 pb-24 pt-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pink-400">
              Your sweet calendar
            </p>
            <h2 className="mt-2 text-3xl font-bold text-slate-800">
              {monthLabel}
            </h2>
          </div>
          <div className="flex items-center gap-3 rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-pink-100">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-6 w-6 text-pink-500"
                fill="currentColor"
              >
                <path d="M6.4 13a4.6 4.6 0 1 1 8.9-1.8A3.8 3.8 0 1 1 16 18H7.5a3.5 3.5 0 0 1-1.1-5z" />
              </svg>
            </span>
            <div>
              <p className="text-xs text-slate-500">Weather</p>
              <p className="text-sm font-semibold">Sunny 26°C</p>
            </div>
          </div>
        </header>

        <Calendar
          month={new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)}
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
                <div
                  key={item.id}
                  className="rounded-2xl border border-pink-100 bg-white px-4 py-3"
                >
                  <p className="text-sm font-semibold text-slate-800">
                    {item.title}
                  </p>
                  <p className="text-xs uppercase tracking-[0.2em] text-pink-400">
                    {item.category}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">{item.details}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
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
                  Add a sweet plan
                </h4>
                <p className="text-sm text-slate-500">
                  Trips, events, or wishlist ideas.
                </p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600"
                onClick={() => setIsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form
              className="mt-6 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const id = crypto.randomUUID();
                setItems((prev) => [
                  ...prev,
                  {
                    id,
                    title: newItem.title.trim() || "Untitled plan",
                    category: newItem.category as PlannerItem["category"],
                    date: newItem.date,
                    details: newItem.details.trim() || "A dreamy new memory."
                  }
                ]);
                setIsModalOpen(false);
                setNewItem({
                  title: "",
                  category: "trip",
                  date: newItem.date,
                  details: ""
                });
                setSelectedDate(new Date(newItem.date));
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
                      setNewItem((prev) => ({
                        ...prev,
                        category: event.target.value
                      }))
                    }
                    className="mt-2 w-full rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
                  >
                    <option value="trip">Trip</option>
                    <option value="event">Event</option>
                    <option value="wishlist">Wishlist</option>
                  </select>
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Date
                  <input
                    type="date"
                    value={newItem.date}
                    onChange={(event) =>
                      setNewItem((prev) => ({ ...prev, date: event.target.value }))
                    }
                    className="mt-2 w-full rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-2 text-sm text-slate-700 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
                  />
                </label>
              </div>

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
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-full border border-pink-100 px-5 py-2 text-sm font-semibold text-slate-600 hover:border-pink-200 hover:bg-pink-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-pink-500 px-6 py-2 text-sm font-semibold text-white shadow-md shadow-pink-200 hover:bg-pink-400"
                >
                  Save plan
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
