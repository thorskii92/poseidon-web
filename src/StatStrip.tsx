import { useEffect, useState } from "react";
import { apiGet } from "./api";
import { useQuery } from "@tanstack/react-query";

type Stats = {
  totalAccounts: number;
  byStatus: { id: number; name: string; total: number }[];
};

const PENDING_IDS = [3, 4, 5, 6, 7];

export default function StatStrip() {
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    function onScroll() {
      const distanceFromBottom =
        document.documentElement.scrollHeight -
        window.scrollY -
        window.innerHeight;
      setAtBottom(distanceFromBottom < 140);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const { data } = useQuery<Stats>({
    queryKey: ["account-stats"],
    queryFn: () => apiGet<Stats>("/api/accounts/stats"),
  });

  if (!data) return null;

  const connected = data.byStatus.find((s) => s.id === 1)?.total ?? 0;
  const pending = data.byStatus.filter(
    (s) => PENDING_IDS.includes(s.id) && s.total > 0,
  );

  return (
    <div className={atBottom ? "stats hidden" : "stats"}>
      <div className="stat">
        <span className="stat-value">
          {data.totalAccounts.toLocaleString()}
        </span>
        <span className="stat-label">Accounts</span>
      </div>
      <div className="stat">
        <span className="stat-value">{connected.toLocaleString()}</span>
        <span className="stat-label">Connected</span>
      </div>
      {pending.map((s) => (
        <div className="stat" key={s.id}>
          <span className="stat-value pending">{s.total.toLocaleString()}</span>
          <span className="stat-label">{s.name}</span>
        </div>
      ))}
    </div>
  );
}
