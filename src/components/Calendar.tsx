"use client";

import { useMemo } from "react";
import holiday_jp from "@holiday-jp/holiday_jp";

export type TripTodoEntry = {
  title: string;
  date: string;
  details: string;
  participants?: string;
};

export type PlannerOwner = "shared" | "mine" | "partner";

export type PlannerItem = {
  id: string;
  title: string;
  category: "trip" | "event" | "todo" | "wishlist";
  owner?: PlannerOwner;
  date: string; // YYYY-MM-DD
  endDate?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  recurring?: "none" | "daily" | "weekly" | "monthly" | "yearly";
  participants?: string;
  pic?: string;
  completed?: boolean;
  tripTodos?: string;
  tripTodoItems?: TripTodoEntry[];
  eventTodoItems?: TripTodoEntry[];
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
  slideClass?: string;
  onNavigate?: (year: number, month: number) => void;
  onGoToToday?: () => void;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const OWNER_LABEL: Record<PlannerOwner, string> = {
  shared: "Us",
  mine: "Asuka",
  partner: "Shota"
};

export const OWNER_STYLES: Record<PlannerOwner, { badge: string; card: string; active: string }> = {
  shared: { badge: "bg-rose-200 text-rose-900", card: "border-rose-300 bg-rose-100", active: "border-rose-300 bg-rose-100 text-rose-900" },
  mine: { badge: "bg-blue-200 text-blue-900", card: "border-blue-300 bg-blue-100", active: "border-blue-300 bg-blue-100 text-blue-900" },
  partner: { badge: "bg-violet-200 text-violet-900", card: "border-violet-300 bg-violet-100", active: "border-violet-300 bg-violet-100 text-violet-900" }
};

const pad = (value: number) => value.toString().padStart(2, "0");

const formatDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// Small chevron SVG used inside the select wrappers
function Chevron({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <svg
      className={`pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 ${isDarkMode ? "text-slate-400" : "text-slate-400"}`}
      width="10" height="10" viewBox="0 0 10 10" fill="none"
      aria-hidden
    >
      <path d="M2 3.5 L5 6.5 L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Calendar({
  month,
  items,
  selectedDate,
  onSelectDate,
  weekdayLabels,
  isDarkMode,
  slideClass,
  onNavigate,
  onGoToToday,
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

  const holidaysByDate = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const rangeStart = new Date(year, monthIndex, 1);
    const rangeEnd = new Date(year, monthIndex + 1, 0);
    return holiday_jp.between(rangeStart, rangeEnd).reduce<Record<string, string>>((acc, holiday) => {
      acc[formatDate(holiday.date)] = holiday.name;
      return acc;
    }, {});
  }, [month]);

  const currentYear = month.getFullYear();
  const currentMonth = month.getMonth();
  const yearRange = useMemo(() => {
    const base = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, i) => base - 3 + i);
  }, []);

  const selectBase = `appearance-none cursor-pointer bg-transparent font-bold focus:outline-none pr-4 ${
    isDarkMode ? "text-slate-100" : "text-slate-800"
  }`;

  return (
    <div className={`rounded-2xl px-2 py-4 shadow-soft ${isDarkMode ? "bg-slate-800/80" : "bg-white/80"} ${slideClass ?? ""}`}>
      {/* Header: [spacer] | Year · Month (center) | Today */}
      <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center px-3">
        {/* Left spacer — mirrors Today button width so the pair stays centred */}
        <div />

        {/* Center: Year + Month side by side, same size */}
        <div className="flex items-center gap-1.5">
          <div className="relative inline-flex items-center">
            <select
              value={currentYear}
              onChange={(e) => onNavigate?.(Number(e.target.value), currentMonth)}
              className={`${selectBase} text-lg`}
              aria-label="Select year"
            >
              {yearRange.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <Chevron isDarkMode={isDarkMode} />
          </div>
          <div className="relative inline-flex items-center">
            <select
              value={currentMonth}
              onChange={(e) => onNavigate?.(currentYear, Number(e.target.value))}
              className={`${selectBase} text-lg`}
              aria-label="Select month"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i} value={i}>{name}</option>
              ))}
            </select>
            <Chevron isDarkMode={isDarkMode} />
          </div>
        </div>

        {/* Right: Today button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onGoToToday}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              isDarkMode
                ? "border-slate-600 text-pink-300 hover:bg-slate-700"
                : "border-pink-200 text-pink-500 hover:bg-pink-50"
            }`}
          >
            Today
          </button>
        </div>
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
          const hasShared = indicatorItems.some((item) => item.owner === "shared");
          const tripSpan = tripSpansByDate[dateKey];
          const holidayName = holidaysByDate[dateKey];
          const hasTripLeftConnector = Boolean(tripSpan && !tripSpan.isStart);
          const hasTripRightConnector = Boolean(tripSpan && !tripSpan.isEnd);

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelectDate(date)}
              title={holidayName}
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
              {hasShared ? (
                <svg
                  viewBox="0 0 24 24"
                  aria-label="Shared plan"
                  className={`absolute left-1/2 top-0.5 z-10 h-2 w-2 -translate-x-1/2 ${
                    isDarkMode ? "text-rose-300" : "text-rose-400"
                  }`}
                  fill="currentColor"
                >
                  <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.1 6.5L12 17.3l-5.8 3.2 1.1-6.5-4.8-4.6 6.6-.9z" />
                </svg>
              ) : null}
              <span className="relative z-10">
                <span
                  className={
                    holidayName && !isSelected
                      ? isDarkMode ? "text-red-400" : "text-red-500"
                      : tripSpan && !isSelected
                        ? isDarkMode ? "text-indigo-300" : "text-indigo-700"
                        : ""
                  }
                >
                  {date.getDate()}
                </span>
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
