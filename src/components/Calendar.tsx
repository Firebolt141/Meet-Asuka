"use client";

import { useMemo } from "react";

export type TripTodoEntry = {
  title: string;
  date: string;
  details: string;
  participants?: string;
};

export type PlannerItem = {
  id: string;
  title: string;
  category: "trip" | "event" | "todo" | "wishlist";
  date: string; // YYYY-MM-DD
  endDate?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  recurring?: "none" | "daily" | "weekly" | "monthly";
  participants?: string;
  pic?: string;
  completed?: boolean;
  tripTodos?: string;
  tripTodoItems?: TripTodoEntry[];
  parentTripId?: string;
  details: string;
  reminderAt?: string;   // ISO datetime string e.g. "2025-03-15T09:00" for the notification fire time
  reminderDays?: number; // legacy: days before item date at 9 AM (kept for backward compat)
};

type CalendarProps = {
  month: Date;
  monthLabel: string;
  items: PlannerItem[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  weekdayLabels: readonly string[];
  isDarkMode: boolean;
};

const pad = (value: number) => value.toString().padStart(2, "0");

const formatDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function Calendar({
  month,
  monthLabel,
  items,
  selectedDate,
  onSelectDate,
  weekdayLabels,
  isDarkMode
}: CalendarProps) {
  const { days, leadingBlanks } = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstOfMonth = new Date(year, monthIndex, 1);
    const lastOfMonth = new Date(year, monthIndex + 1, 0);
    const totalDays = lastOfMonth.getDate();
    const blanks = firstOfMonth.getDay();
    const monthDays = Array.from({ length: totalDays }, (_, index) =>
      new Date(year, monthIndex, index + 1)
    );
    return { days: monthDays, leadingBlanks: blanks };
  }, [month]);

  const itemsByDate = useMemo(() => {
    return items.reduce<Record<string, PlannerItem[]>>((acc, item) => {
      acc[item.date] = acc[item.date] ? [...acc[item.date], item] : [item];
      return acc;
    }, {});
  }, [items]);

  const tripSpansByDate = useMemo(() => {
    return items.reduce<Record<string, { isStart: boolean; isEnd: boolean }>>((acc, item) => {
      if (item.category !== "trip" || !item.date) {
        return acc;
      }
      const start = new Date(item.date);
      const end = item.endDate ? new Date(item.endDate) : new Date(item.date);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      const rangeStart = start <= end ? start : end;
      const rangeEnd = start <= end ? end : start;

      for (
        let current = new Date(rangeStart);
        current <= rangeEnd;
        current.setDate(current.getDate() + 1)
      ) {
        const key = formatDate(current);
        const isStart = current.getTime() === rangeStart.getTime();
        const isEnd = current.getTime() === rangeEnd.getTime();
        acc[key] = {
          isStart: (acc[key]?.isStart ?? false) || isStart,
          isEnd: (acc[key]?.isEnd ?? false) || isEnd
        };
      }

      return acc;
    }, {});
  }, [items]);

  return (
    <div className={`rounded-3xl px-4 py-5 shadow-soft ${isDarkMode ? "bg-slate-800/80" : "bg-white/80"}`}>
      <div className="mb-4 text-center">
        <h3 className={`text-xl font-bold ${isDarkMode ? "text-slate-100" : "text-slate-800"}`}>{monthLabel}</h3>
      </div>
      <div className="grid grid-cols-7 gap-x-1 gap-y-1.5">
        {weekdayLabels.map((label) => (
          <div key={label} className={`pb-1 text-center text-xs font-semibold uppercase tracking-wide ${isDarkMode ? "text-pink-300" : "text-pink-500"}`}>{label}</div>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, index) => (
          <div key={`blank-${index}`} className="h-16" />
        ))}
        {(() => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return days.map((date) => {
          const dateKey = formatDate(date);
          const isToday = date.getFullYear() === today.getFullYear() &&
            date.getMonth() === today.getMonth() &&
            date.getDate() === today.getDate();
          const isSelected =
            date.getFullYear() === selectedDate.getFullYear() &&
            date.getMonth() === selectedDate.getMonth() &&
            date.getDate() === selectedDate.getDate();
          const dayItems = itemsByDate[dateKey] ?? [];
          const indicatorItems = dayItems.filter((item) => !(item.category === "todo" && item.completed));
          const tripSpan = tripSpansByDate[dateKey];
          const hasTripLeftConnector = Boolean(tripSpan && !tripSpan.isStart);
          const hasTripRightConnector = Boolean(tripSpan && !tripSpan.isEnd);

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelectDate(date)}
              className={`group relative flex h-16 flex-col items-center justify-start rounded-2xl border px-1 pt-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-pink-300 ${
                isSelected
                  ? isDarkMode
                    ? "border-fuchsia-400 bg-fuchsia-900/40 text-pink-100 shadow"
                    : "border-pink-300 bg-pink-100 text-pink-700 shadow"
                  : isToday
                    ? isDarkMode
                      ? "border-pink-400 bg-slate-700 text-pink-300 hover:bg-slate-600"
                      : "border-pink-400 bg-pink-50 text-pink-600 font-semibold hover:bg-pink-100"
                    : isDarkMode
                      ? "border-transparent bg-slate-700 text-slate-200 hover:border-pink-300 hover:bg-slate-600"
                      : "border-pink-100 bg-pink-50/40 text-slate-700 hover:border-pink-200 hover:bg-pink-50"
              }`}
            >
              <span className={`relative z-10 ${tripSpan && !isSelected ? isDarkMode ? "text-indigo-300" : "text-indigo-700" : ""}`}>
                {date.getDate()}
              </span>
              <span className="pointer-events-none absolute bottom-4 z-10 flex gap-1">
                {indicatorItems.slice(0, 3).map((item) => (
                  <span
                    key={item.id}
                    className={`h-1.5 w-1.5 rounded-full ${
                      item.category === "trip"
                        ? "bg-indigo-400"
                        : item.category === "event"
                        ? "bg-cyan-500"
                        : item.category === "todo"
                        ? item.completed
                          ? "bg-emerald-500"
                          : "bg-rose-500"
                        : item.completed
                        ? "bg-emerald-500"
                        : "bg-violet-500"
                    } ${isSelected ? "ring-1 ring-pink-200" : ""}`}
                  />
                ))}
              </span>
              {tripSpan ? (
                <span className="pointer-events-none absolute bottom-2 left-1 right-1 z-0 flex items-center">
                  {hasTripLeftConnector ? <span className="h-1 w-2 rounded-l-full bg-indigo-200" /> : null}
                  <span className="h-1 flex-1 rounded-full bg-indigo-300/90" />
                  {hasTripRightConnector ? <span className="h-1 w-2 rounded-r-full bg-indigo-200" /> : null}
                </span>
              ) : null}
            </button>
          );
        });
        })()}
      </div>
    </div>
  );
}
