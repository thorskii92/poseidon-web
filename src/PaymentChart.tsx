import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type Payment = {
  id: number;
  amount: number;
  nature: string;
  date: string | null;
};

type Bucket = {
  sort: number;
  label: string;
  water: number;
  other: number;
};

export default function PaymentChart({ id }: { id: string | undefined }) {
  const { data, isLoading } = useQuery<Payment[]>({
    queryKey: ["payments", id],
    queryFn: () => apiGet<Payment[]>(`/api/accounts/${id}/payments`),
  });

  if (isLoading || !data?.length) return null;

  const buckets = new Map<number, Bucket>();

  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() * 100 + (d.getMonth() + 1);
    buckets.set(key, {
      sort: key,
      label: `${SHORT[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`,
      water: 0,
      other: 0,
    });
  }

  for (const p of data) {
    if (!p.date) continue;
    const [y, m] = p.date.slice(0, 10).split("-");
    const key = Number(y) * 100 + Number(m);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (p.nature === "Water Bill") bucket.water += p.amount;
    else bucket.other += p.amount;
  }

  const points = [...buckets.values()].sort((a, b) => a.sort - b.sort);
  const total = points.reduce((sum, p) => sum + p.water + p.other, 0);

  if (total === 0) return null;

  return (
    <section className="record-section">
      <div className="record-head">
        <h2>Payments</h2>
        <span className="count">{peso.format(total)} over 12 months</span>
      </div>

      <div className="chart">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={points}
            margin={{ top: 12, right: 8, bottom: 4, left: 0 }}
          >
            <CartesianGrid stroke="#eef1f4" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              tickLine={false}
              axisLine={{ stroke: "#e3e6ea" }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6b7280" }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ fill: "#f4f7fa" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as Bucket;
                if (!p.water && !p.other) return null;
                return (
                  <div className="chart-tip">
                    <div className="chart-tip-head">{p.label}</div>
                    {p.water > 0 && (
                      <div className="chart-tip-row">
                        <span>Water bills</span>
                        <span>{peso.format(p.water)}</span>
                      </div>
                    )}
                    {p.other > 0 && (
                      <div className="chart-tip-row">
                        <span>Other fees</span>
                        <span>{peso.format(p.other)}</span>
                      </div>
                    )}
                    <div className="chart-tip-row total">
                      <span>Total</span>
                      <span>{peso.format(p.water + p.other)}</span>
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="water" stackId="p" fill="#2e8bc0" maxBarSize={30} />
            <Bar
              dataKey="other"
              stackId="p"
              fill="#d99000"
              radius={[3, 3, 0, 0]}
              maxBarSize={30}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
