import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

/** A small month-grid calendar for the ECPay Daily Collection Report's date
 * picker. Days that actually have a transaction are bolded/highlighted, so
 * a clerk can see at a glance which dates are worth opening instead of
 * guessing or stepping through one day at a time. */
export default function EcpayCalendarPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (date: string) => void;
}) {
  const initial = value ? new Date(value + "T00:00:00") : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const monthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const { data } = useQuery<{ dates: string[] }>({
    queryKey: ["ecpay-calendar", monthKey],
    queryFn: () => apiGet<{ dates: string[] }>(`/api/ecpay/reports/daily-collection/calendar?month=${monthKey}`),
  });
  const hasData = new Set(data?.dates ?? []);

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  function iso(day: number): string {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function changeMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="ecpay-calendar">
      <div className="ecpay-calendar-head">
        <button type="button" className="clear-filters" onClick={() => changeMonth(-1)}>‹</button>
        <span>{firstOfMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        <button type="button" className="clear-filters" onClick={() => changeMonth(1)}>›</button>
      </div>
      <div className="ecpay-calendar-grid ecpay-calendar-dow">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="ecpay-calendar-grid">
        {cells.map((day, i) => {
          if (day == null) return <span key={i} />;
          const d = iso(day);
          const withData = hasData.has(d);
          const isFuture = d > todayIso;
          const isSelected = d === value;
          const classes = ["ecpay-calendar-day"];
          if (withData) classes.push("has-data");
          if (isSelected) classes.push("selected");
          if (isFuture) classes.push("future");
          return (
            <button
              type="button"
              key={i}
              className={classes.join(" ")}
              disabled={isFuture}
              onClick={() => onChange(d)}
              title={withData ? "Transactions on this date" : undefined}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
