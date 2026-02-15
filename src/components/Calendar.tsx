"use client";

import { useMemo } from "react";

export type PlannerItem = {
  id: string;
  title: string;
  category: "trip" | "event" | "todo" | "wishlist";
  date: string; // YYYY-MM-DD
  endDate?: string;
  startTime?: string;
  endTime?: string;
  details: string;
};

type CalendarProps = {
  month: Date;
  items: PlannerItem[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
};

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = (value: number) => value.toString().padStart(2, "0");

const formatDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function Calendar({ month, items, selectedDate, onSelectDate }: CalendarProps) {
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
      <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-pink-500">
        {weekdayLabels.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-7 gap-2">
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
              className={`group relative flex h-12 flex-col items-center justify-center rounded-2xl border border-transparent text-sm font-medium transition hover:border-pink-200 hover:bg-pink-50 focus:outline-none focus:ring-2 focus:ring-pink-300 ${
                isSelected
                  ? "bg-pink-500 text-white shadow"
                  : "bg-white text-slate-700"
              }`}
            >
              {tripSpan ? (
                <>
                  {hasTripLeftConnector ? (
                    <span
                      className="absolute left-0 top-1/2 z-0 h-2 w-2 -translate-x-2 -translate-y-1/2 bg-indigo-200"
                      aria-hidden
                    />
                  ) : null}
                  {hasTripRightConnector ? (
                    <span
                      className="absolute right-0 top-1/2 z-0 h-2 w-2 translate-x-2 -translate-y-1/2 bg-indigo-200"
                      aria-hidden
                    />
                  ) : null}
                  <span
                    className="absolute inset-x-1 top-1/2 z-0 h-2 -translate-y-1/2 rounded-full bg-indigo-200"
                    aria-hidden
                  />
                </>
              ) : null}
              <span className={`relative z-10 ${tripSpan && !isSelected ? "text-indigo-700" : ""}`}>
                {date.getDate()}
              </span>
              <span className="relative z-10 mt-1 flex gap-1">
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
                    } ${isSelected ? "ring-2 ring-white/80" : ""}`}
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
