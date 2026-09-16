import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import ReadingGrid from "./ReadingGrid";
import ReadingReview from "./ReadingReview";

export type Computed = {
  acctId: number;
  tariffAmount: number;
  flatRate: number;
  excess: number;
  enviFee: number;
  airContent: number;
  baseRate: number;
  wsf: number;
  discount: number;
  penalty: number;
  total: number;
  totalAfterDue: number;
  wmmf: number;
};

export type Row = {
  acctId: number;
  accountNo: string;
  name: string;
  standpipe: string | null;
  barangayId: number;
  clusterId: number | null;
  consId: number;
  sequence: number;
  classId: number;
  classification: string;
  consumerType: string;
  isSenior: string;
  meterSizeId: number;
  householdMembers: number;
  seniorCount: number;
  previousReading: number;
  presentReading: number;
  entered: boolean;
  excluded: boolean;
  /** Set once a scanned-reading upload prefilled this row; cleared on manual edit. */
  scanReason?: string;
  applicationFee: number;
  arrearCount: number;
  unpaidMonths: string;
  unpaidLabel: string;
  prev: {
    balance: number;
    consumption: number;
    enviFee: number;
    airContent: number;
    wsf: number;
    penalty: number;
    amountDue: number;
    total: number;
    discount: number;
    installmentFee: number;
    wmmf: number;
  };
  computed: Computed | null;
};

export type Dates = {
  fromDate: string;
  toDate: string;
  dueDate: string;
  disconnectionDate: string;
  readDate: string;
  billDate: string;
};

export type Run = {
  month: number;
  year: number;
  monthName: string;
  barangayId: number;
  barangayName: string;
  clusterId: number;
  clusterName: string;
  readerId: number;
  readerName: string;
  dates: Dates;
  rateMethodId: number;
  showWmmf: boolean;
};

type FilterOptions = {
  barangays: { id: number; name: string }[];
  clusters: { id: number; barangayId: number; name: string }[];
};

type SetupOptions = {
  readers: { id: number; name: string }[];
  useCluster: boolean;
  showWmmf: boolean;
  months: string[];
};

type SavedSession = {
  month: string;
  year: number;
  barangayId: number;
  barangay: string;
  clusterId: number;
  cluster: string;
  reader: string;
  readDate: string;
  billDate: string;
  dueDate: string;
  disconnectionDate: string;
  fromDate: string;
  toDate: string;
  entered: number;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function shortDate(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  return d.toLocaleDateString("en-PH", { day: "numeric", month: "short" });
}

export default function ReadingPage() {
  const [step, setStep] = useState<"setup" | "entry" | "review">("setup");
  const [run, setRun] = useState<Run | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  if (step === "entry" && run) {
    return (
      <ReadingGrid
        run={run}
        rows={rows}
        setRows={setRows}
        onReview={() => setStep("review")}
        onDiscard={() => {
          setRun(null);
          setRows([]);
          setStep("setup");
        }}
      />
    );
  }

  if (step === "review" && run) {
    return (
      <ReadingReview
        run={run}
        rows={rows}
        onBack={() => setStep("entry")}
        onDone={() => {
          setRun(null);
          setRows([]);
          setStep("setup");
        }}
      />
    );
  }

  return (
    <ReadingSetup
      onLoaded={(loadedRun, loadedRows) => {
        setRun(loadedRun);
        setRows(loadedRows);
        setStep("entry");
      }}
    />
  );
}

function ReadingSetup({
  onLoaded,
}: {
  onLoaded: (run: Run, rows: Row[]) => void;
}) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [barangay, setBarangay] = useState(0);
  const [cluster, setCluster] = useState(0);
  const [reader, setReader] = useState(0);
  const [showDates, setShowDates] = useState(false);
  const [overrides, setOverrides] = useState<Partial<Dates>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { data: setup } = useQuery<SetupOptions>({
    queryKey: ["reading-setup"],
    queryFn: () => apiGet<SetupOptions>("/api/reading/setup"),
  });

  const { data: options } = useQuery<FilterOptions>({
    queryKey: ["filter-options"],
    queryFn: () => apiGet<FilterOptions>("/api/filters"),
  });

  const { data: session, refetch: refetchSession } = useQuery<{
    session: SavedSession | null;
  }>({
    queryKey: ["reading-session"],
    queryFn: () => apiGet<{ session: SavedSession | null }>("/api/reading/session"),
  });

  const { data: derived } = useQuery<Dates>({
    queryKey: ["reading-dates", month, year],
    queryFn: () => apiGet<Dates>(`/api/reading/dates?month=${month}&year=${year}`),
  });

  const useCluster = setup?.useCluster ?? true;
  const areaId = useCluster ? cluster : barangay;

  const { data: preview } = useQuery<{
    total: number;
    alreadyBilled: number;
    toLoad: number;
  }>({
    queryKey: ["reading-preview", month, year, areaId, useCluster],
    enabled: areaId > 0,
    queryFn: () =>
      apiGet(
        `/api/reading/preview?month=${month}&year=${year}&areaId=${areaId}&useCluster=${useCluster ? 1 : 0}`,
      ),
  });

  const clusters = barangay
    ? (options?.clusters ?? []).filter((c) => c.barangayId === barangay)
    : [];

  const dates: Dates | undefined = derived
    ? { ...derived, ...overrides }
    : undefined;

  const years = Array.from({ length: 10 }, (_, i) => now.getFullYear() - i);

  const ready =
    barangay > 0 && reader > 0 && (!useCluster || cluster > 0) && !!dates;

  async function load(restore: boolean) {
    if (!dates) return;
    setLoading(true);
    setError("");
    try {
      const barangayName =
        (options?.barangays ?? []).find((b) => b.id === barangay)?.name ?? "";
      const clusterName = clusters.find((c) => c.id === cluster)?.name ?? "";
      const readerName =
        (setup?.readers ?? []).find((r) => r.id === reader)?.name ?? "";

      const body = await apiPost<{
        accounts: Row[];
        rateMethodId: number;
        showWmmf: boolean;
        message?: string;
      }>("/api/reading/generate", {
        month,
        year,
        barangayId: barangay,
        clusterId: cluster,
        readerId: reader,
        barangayName,
        clusterName,
        readerName,
        dates,
        restore,
      });

      if (!body.accounts.length) {
        setError(body.message ?? "No accounts to read for that period.");
        return;
      }

      onLoaded(
        {
          month,
          year,
          monthName: MONTHS[month - 1],
          barangayId: barangay,
          barangayName,
          clusterId: cluster,
          clusterName,
          readerId: reader,
          readerName,
          dates,
          rateMethodId: body.rateMethodId,
          showWmmf: body.showWmmf,
        },
        body.accounts,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function resume() {
    const s = session?.session;
    if (!s) return;

    const monthIndex = MONTHS.indexOf(s.month) + 1;
    setMonth(monthIndex);
    setYear(s.year);
    setBarangay(s.barangayId);
    setCluster(s.clusterId);

    const readerId =
      (setup?.readers ?? []).find((r) => r.name === s.reader)?.id ?? 0;
    setReader(readerId);

    setLoading(true);
    setError("");
    try {
      const body = await apiPost<{
        accounts: Row[];
        rateMethodId: number;
        showWmmf: boolean;
        message?: string;
      }>("/api/reading/generate", {
        month: monthIndex,
        year: s.year,
        barangayId: s.barangayId,
        clusterId: s.clusterId,
        readerId,
        barangayName: s.barangay,
        clusterName: s.cluster,
        readerName: s.reader,
        dates: {
          fromDate: s.fromDate,
          toDate: s.toDate,
          dueDate: s.dueDate,
          disconnectionDate: s.disconnectionDate,
          readDate: s.readDate,
          billDate: s.billDate,
        },
        restore: true,
      });

      if (!body.accounts.length) {
        setError(
          "The accounts in that run already have bills. The saved progress has been discarded.",
        );
        await fetch("/api/reading/session", { method: "DELETE" }).catch(() => {});
        refetchSession();
        return;
      }

      if (!readerId) {
        setError(
          `The saved meter reader (${s.reader}) is no longer active. Pick a reader before generating bills.`,
        );
      }

      onLoaded(
        {
          month: monthIndex,
          year: s.year,
          monthName: s.month,
          barangayId: s.barangayId,
          barangayName: s.barangay,
          clusterId: s.clusterId,
          clusterName: s.cluster,
          readerId,
          readerName: s.reader,
          dates: {
            fromDate: s.fromDate,
            toDate: s.toDate,
            dueDate: s.dueDate,
            disconnectionDate: s.disconnectionDate,
            readDate: s.readDate,
            billDate: s.billDate,
          },
          rateMethodId: body.rateMethodId,
          showWmmf: body.showWmmf,
        },
        body.accounts,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function discardSession() {
    await fetch("/api/reading/session", { method: "DELETE" });
    refetchSession();
  }

  const saved = session?.session;

  return (
    <>
      <div className="page-head">
        <h1>Meter Reading</h1>
      </div>

      {saved && (
        <div className="resume-banner">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0d3b66" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <div className="resume-body">
            <div className="resume-title">Unfinished run</div>
            <div className="resume-sub">
              {saved.month} {saved.year} &middot; {saved.barangay}
              {saved.cluster ? ` / ${saved.cluster}` : ""} &middot; {saved.reader}{" "}
              &middot; {saved.entered} meters entered
            </div>
          </div>
          <div className="resume-actions">
            <button className="clear-filters" onClick={discardSession}>
              Discard
            </button>
            <button className="primary" onClick={resume} disabled={loading}>
              Resume
            </button>
          </div>
        </div>
      )}

      <div className="run-card">
        <h2 className="run-title">Start a new run</h2>
        <p className="run-note">
          Accounts that already have a bill for the period are left out
          automatically.
        </p>

        <div className="run-grid">
          <label className="field-input">
            <span>Month</span>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="field-input">
            <span>Year</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <label className="field-input">
            <span>Barangay</span>
            <select
              value={barangay}
              onChange={(e) => {
                setBarangay(Number(e.target.value));
                setCluster(0);
              }}
            >
              <option value={0}>Select</option>
              {(options?.barangays ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          {useCluster && (
            <label className="field-input">
              <span>Cluster</span>
              <select
                value={cluster}
                onChange={(e) => setCluster(Number(e.target.value))}
                disabled={!barangay}
              >
                <option value={0}>Select</option>
                {clusters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field-input">
            <span>Meter reader</span>
            <select value={reader} onChange={(e) => setReader(Number(e.target.value))}>
              <option value={0}>Select</option>
              {(setup?.readers ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="schedule">
          <div className="schedule-body">
            <div className="schedule-label">Schedule</div>
            <div className="schedule-dates">
              <div>
                <span>Reads</span>{" "}
                <strong>
                  {shortDate(dates?.fromDate)} &ndash; {shortDate(dates?.toDate)}
                </strong>
              </div>
              <div>
                <span>Billed</span> <strong>{shortDate(dates?.billDate)}</strong>
              </div>
              <div>
                <span>Due</span> <strong>{shortDate(dates?.dueDate)}</strong>
              </div>
              <div>
                <span>Disconnection</span>{" "}
                <strong>{shortDate(dates?.disconnectionDate)}</strong>
              </div>
            </div>
          </div>
          <button
            className="clear-filters"
            onClick={() => setShowDates((v) => !v)}
          >
            {showDates ? "Hide dates" : "Adjust dates"}
          </button>
        </div>

        {showDates && dates && (
          <div className="run-grid" style={{ marginTop: 16 }}>
            {(
              [
                ["fromDate", "From"],
                ["toDate", "To"],
                ["readDate", "Reading date"],
                ["billDate", "Bill date"],
                ["dueDate", "Due date"],
                ["disconnectionDate", "Disconnection"],
              ] as [keyof Dates, string][]
            ).map(([key, label]) => (
              <label className="field-input" key={key}>
                <span>{label}</span>
                <input
                  type="date"
                  value={String(dates[key] ?? "").slice(0, 10)}
                  onChange={(e) =>
                    setOverrides((o) => ({ ...o, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
          </div>
        )}

        <p className="run-note" style={{ marginTop: 12 }}>
          Derived from the standard cycle. Change these only when a run is
          off-schedule.
        </p>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button
            className="primary"
            disabled={!ready || loading}
            onClick={() => load(false)}
          >
            {loading
              ? "Loading…"
              : preview
                ? `Load ${preview.toLoad} accounts`
                : "Load accounts"}
          </button>
          {preview && (
            <span className="count">
              {preview.toLoad} of {preview.total} accounts in this area still
              need a {MONTHS[month - 1]} bill.
            </span>
          )}
        </div>
      </div>
    </>
  );
}
