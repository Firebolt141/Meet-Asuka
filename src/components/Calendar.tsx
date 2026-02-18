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
  details: string;
};

type CalendarProps = {
  month: Date;
  monthLabel: string;
  items: PlannerItem[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
};

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = (value: number) => value.toString().padStart(2, "0");

const formatDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function Calendar({ month, monthLabel, items, selectedDate, onSelectDate }: CalendarProps) {
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
    <div className="rounded-3xl bg-white/80 p-6 shadow-soft">
      <div className="mb-4 text-center">
        <h3 className="text-xl font-bold text-slate-800">{monthLabel}</h3>
      </div>
      <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-pink-500">
        {weekdayLabels.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-7 gap-x-0 gap-y-2">
        {Array.from({ length: leadingBlanks }).map((_, index) => (
          <div key={`blank-${index}`} className="h-12" />
        ))}
        {days.map((date) => {
          const dateKey = formatDate(date);
          const isSelected =
            date.getFullYear() === selectedDate.getFullYear() &&
            date.getMonth() === selectedDate.getMonth() &&
            date.getDate() === selectedDate.getDate();
          const dayItems = itemsByDate[dateKey] ?? [];
          const tripSpan = tripSpansByDate[dateKey];
          const hasTripLeftConnector = Boolean(tripSpan && !tripSpan.isStart);
          const hasTripRightConnector = Boolean(tripSpan && !tripSpan.isEnd);

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelectDate(date)}
              className={`group relative flex h-14 flex-col items-center justify-start rounded-2xl border px-1 pt-1 text-sm font-medium transition hover:border-pink-200 hover:bg-pink-50 focus:outline-none focus:ring-2 focus:ring-pink-300 ${
                isSelected
                  ? "border-pink-300 bg-pink-100 text-pink-700 shadow"
                  : "border-transparent bg-white text-slate-700"
              }`}
            >
              <span className={`relative z-10 ${tripSpan && !isSelected ? "text-indigo-700" : ""}`}>
                {date.getDate()}
              </span>
              <span className="pointer-events-none absolute bottom-4 z-10 flex gap-1">
                {dayItems.slice(0, 3).map((item) => (
                  <span
                    key={item.id}
                    className={`h-1.5 w-1.5 rounded-full ${
                      item.category === "trip"
                        ? "bg-indigo-400"
                        : item.category === "event"
                        ? "bg-emerald-400"
                        : item.category === "todo"
                        ? "bg-sky-400"
                        : "bg-amber-400"
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
              <span className="relative z-10 mt-auto mb-1 flex gap-1 opacity-0">
                {dayItems.slice(0, 3).map((item) => (
                  <span
                    key={item.id}
                    className={`h-1.5 w-1.5 rounded-full ${
                      item.category === "trip"
                        ? "bg-indigo-400"
                        : item.category === "event"
                        ? "bg-emerald-400"
                        : item.category === "todo"
                        ? "bg-sky-400"
                        : "bg-amber-400"
                    } ${isSelected ? "ring-1 ring-pink-200" : ""}`}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
