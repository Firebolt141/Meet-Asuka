"use client";

import { useMemo } from "react";

export type PlannerItem = {
  id: string;
  title: string;
  category: "trip" | "event" | "todo" | "wishlist";
  date: string; // YYYY-MM-DD
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

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelectDate(date)}
              className={`group flex h-12 flex-col items-center justify-center rounded-2xl border border-transparent text-sm font-medium transition hover:border-pink-200 hover:bg-pink-50 focus:outline-none focus:ring-2 focus:ring-pink-300 ${
                isSelected
                  ? "bg-pink-500 text-white shadow"
                  : "bg-white text-slate-700"
              }`}
            >
              <span>{date.getDate()}</span>
              <span className="mt-1 flex gap-1">
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
