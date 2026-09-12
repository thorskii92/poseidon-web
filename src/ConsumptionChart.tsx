import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const MONTHS: Record<string, number> = {
  January: 1,
  February: 2,
  March: 3,
  April: 4,
  May: 5,
  June: 6,
  July: 7,
  August: 8,
  September: 9,
  October: 10,
  November: 11,
  December: 12,
};

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

type Bill = {
  id: number;
  period: string;
  consumption: number;
  total: number;
  status: string;
};

export default function ConsumptionChart({ id }: { id: string | undefined }) {
  const { data, isLoading } = useQuery<Bill[]>({
    queryKey: ["bills", id],
    queryFn: () => apiGet<Bill[]>(`/api/accounts/${id}/bills`),
  });

  if (isLoading || !data?.length) return null;

  const points = data
    .map((b) => {
      const [monthName, year] = b.period.split(" ");
      const month = MONTHS[monthName];
      if (!month) return null;
      return {
        sort: Number(year) * 100 + month,
        label: `${SHORT[month - 1]} '${year.slice(2)}`,
        consumption: b.consumption,
        amount: b.total,
        unpaid: b.status !== "PAID",
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => a.sort - b.sort)
    .slice(-12);

  if (points.length < 2) return null;

  const average =
    points.reduce((sum, p) => sum + p.consumption, 0) / points.length;

  return (
    <section className="record-section">
      <div className="record-head">
        <h2>Consumption</h2>
        <span className="count">
          Average {average.toFixed(1)} cu.m. over {points.length} months
        </span>
      </div>

      <div className="chart">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart
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
              width={38}
            />
            <Tooltip
              cursor={{ fill: "#f4f7fa" }}
              contentStyle={{
                fontSize: 13,
                borderRadius: 8,
                border: "1px solid #e3e6ea",
              }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload;
                return (
                  <div className="chart-tip">
                    <div className="chart-tip-head">{p.label}</div>
                    <div className="chart-tip-row">
                      <span>Consumption</span>
                      <span>{p.consumption} cu.m.</span>
                    </div>
                    <div className="chart-tip-row">
                      <span>Amount</span>
                      <span>
                        {p.amount.toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    {p.unpaid && <div className="chart-tip-unpaid">Unpaid</div>}
                  </div>
                );
              }}
            />
            <Bar
              dataKey="consumption"
              fill="#2e8bc0"
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
            />
            <Line
              type="monotone"
              dataKey="consumption"
              stroke="#0d3b66"
              strokeWidth={0}
              legendType="none"
              tooltipType="none"
              dot={(props: any) =>
                props.payload.unpaid ? (
                  <circle
                    key={props.key}
                    cx={props.cx}
                    cy={props.cy}
                    r={3.5}
                    fill="#d0342c"
                  />
                ) : (
                  <g key={props.key} />
                )
              }
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
