import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost } from "./api";
import type { Row, Run } from "./ReadingPage";

const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * `useAmount` excludes the application-fee installment and the WMMF; both are
 * separate columns that the printed bill and the account balance add back.
 */
function totalDue(r: Row) {
  return (r.computed?.total ?? 0) + r.applicationFee + (r.computed?.wmmf ?? 0);
}

function Icon({ tone }: { tone: "warn" | "bad" | "ok" }) {
  const stroke =
    tone === "bad" ? "#b02a22" : tone === "warn" ? "#8a5a05" : "#1d6b3f";
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="check-icon"
    >
      <circle cx="12" cy="12" r="9" />
      {tone === "ok" ? (
        <path d="M8.5 12.2l2.4 2.4 4.6-4.9" />
      ) : (
        <>
          <path d="M12 8v5" />
          <path d="M12 16.5v.5" />
        </>
      )}
    </svg>
  );
}

export default function ReadingReview({
  run,
  rows,
  onBack,
  onDone,
}: {
  run: Run;
  rows: Row[];
  onBack: () => void;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<number | null>(null);
  // Bills that came out different from the one the reader app printed for
  // the consumer on the spot (see poseidon-api readerApi.ts).
  const [printedMismatches, setPrintedMismatches] = useState<
    { acctId: number; printedTotal: number; billedTotal: number; readingChanged: boolean }[]
  >([]);
  const queryClient = useQueryClient();

  const summary = useMemo(() => {
    const billing = rows.filter((r) => !r.excluded);

    let total = 0;
    let unreadTotal = 0;
    const unread: Row[] = [];
    const negative: Row[] = [];
    const attention: Row[] = [];
    let withNotice = 0;
    let installments = 0;

    for (const r of billing) {
      const amount = totalDue(r);
      total += amount;
      installments += r.applicationFee;

      if (!r.entered) {
        unread.push(r);
        unreadTotal += amount;
      }

      const consumption = r.presentReading - r.previousReading;
      if (r.entered && consumption < 0) negative.push(r);
      if (r.entered && consumption >= 41) attention.push(r);

      // Mirrors the server's rule: arrears at or past the threshold get a note.
      if (r.arrearCount >= 2) withNotice += 1;
    }

    return {
      count: billing.length,
      excluded: rows.length - billing.length,
      total,
      installments,
      unread,
      unreadTotal,
      negative,
      attention,
      withNotice,
    };
  }, [rows]);

  async function generate() {
    setSaving(true);
    setError("");
    try {
      const body = await apiPost<{
        created: number;
        printedMismatches?: { acctId: number; printedTotal: number; billedTotal: number; readingChanged: boolean }[];
      }>("/api/reading/save", {
        month: run.month,
        year: run.year,
        readerId: run.readerId,
        rateMethodId: run.rateMethodId,
        dates: run.dates,
        rows: rows.map((r) => ({
          acctId: r.acctId,
          consId: r.consId,
          classId: r.classId,
          barangayId: r.barangayId,
          clusterId: r.clusterId,
          sequence: r.sequence,
          isSenior: r.isSenior,
          meterSizeId: r.meterSizeId,
          householdMembers: r.householdMembers,
          seniorCount: r.seniorCount,
          previousReading: r.previousReading,
          presentReading: r.presentReading,
          excluded: r.excluded,
          applicationFee: r.applicationFee,
          arrearCount: r.arrearCount,
          unpaidMonths: r.unpaidMonths,
          unpaidLabel: r.unpaidLabel,
          prev: r.prev,
        })),
      });

      setCreated(body.created);
      setPrintedMismatches(body.printedMismatches ?? []);
      queryClient.invalidateQueries({ queryKey: ["bill-groups"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["reading-session"] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (created !== null) {
    return (
      <>
        <div className="page-head">
          <h1>Bills generated</h1>
        </div>
        <div className="preview">
          <span className="balance-label">
            {run.monthName} {run.year} &middot; {run.barangayName}
            {run.clusterName ? ` / ${run.clusterName}` : ""}
          </span>
          <span className="preview-value">{created} bills created</span>
        </div>
        {printedMismatches.length > 0 && (
          <div className="form-notice" style={{ marginBottom: 14 }}>
            <strong>
              {printedMismatches.length} consumer{printedMismatches.length === 1 ? " was" : "s were"} handed a printed
              bill in the field that differs from the bill just generated:
            </strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
              {printedMismatches.map((m) => {
                const row = rows.find((r) => r.acctId === m.acctId);
                return (
                  <li key={m.acctId}>
                    {row ? `${row.accountNo} — ${row.name}` : `Account ${m.acctId}`}: printed{" "}
                    {m.printedTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}, billed{" "}
                    {m.billedTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    {m.readingChanged ? " (the reading was changed in the office)" : ""}
                  </li>
                );
              })}
            </ul>
            <div style={{ marginTop: 6 }}>Give them a corrected bill.</div>
          </div>
        )}
        <div className="form-actions">
          <button className="primary" onClick={onDone}>
            Start another run
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <button className="back-button" onClick={onBack}>
        <svg
          width="13"
          height="13"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        >
          <path d="M8.5 3l-4 4 4 4" />
        </svg>
        Back to readings
      </button>

      <div className="page-head">
        <h1>Generate {summary.count} bills</h1>
      </div>
      <p className="count" style={{ marginTop: -12, marginBottom: 26 }}>
        {run.monthName} {run.year} &middot; {run.barangayName}
        {run.clusterName ? ` / ${run.clusterName}` : ""} &middot; read by{" "}
        {run.readerName} &middot; due {run.dates.dueDate?.slice(0, 10)}
      </p>

      <div className="review-tiles">
        <div className="balance-card">
          <span className="balance-label">Bills to create</span>
          <span className="balance-value">{summary.count}</span>
        </div>
        <div className="balance-card">
          <span className="balance-label">Total billed</span>
          <span className="balance-value">{peso.format(summary.total)}</span>
        </div>
        <div className="balance-card">
          <span className="balance-label">Carrying a disconnection notice</span>
          <span className="balance-value">{summary.withNotice}</span>
        </div>
      </div>

      {summary.installments > 0 && (
        <p className="count" style={{ margin: "-16px 0 26px" }}>
          Includes {peso.format(summary.installments)} of application-fee
          installments, drawn down from the accounts' remaining balances.
        </p>
      )}

      <h2 className="review-heading">Check before generating</h2>

      <div className="check-list">
        {summary.unread.length > 0 ? (
          <div className="check-row warn">
            <Icon tone="warn" />
            <div className="check-body">
              <div className="check-title warn-text">
                {summary.unread.length} meters were never entered
              </div>
              <div className="check-sub">
                They will be billed the minimum charge -{" "}
                {peso.format(summary.unreadTotal)} of the{" "}
                {peso.format(summary.total)} total. Exclude them instead if they
                should not be billed at all.
              </div>
            </div>
          </div>
        ) : (
          <div className="check-row">
            <Icon tone="ok" />
            <div className="check-body">
              <div className="check-title">Every meter was entered</div>
              <div className="check-sub">
                No account is being billed on an assumed reading.
              </div>
            </div>
          </div>
        )}

        {summary.negative.length > 0 && (
          <div className="check-row bad">
            <Icon tone="bad" />
            <div className="check-body">
              <div className="check-title bad-text">
                {summary.negative.length} negative{" "}
                {summary.negative.length === 1 ? "reading" : "readings"}
              </div>
              <div className="check-sub">
                {summary.negative
                  .slice(0, 4)
                  .map(
                    (r) =>
                      `${r.name} (${r.previousReading} down to ${r.presentReading})`,
                  )
                  .join(", ")}
                {summary.negative.length > 4
                  ? ` and ${summary.negative.length - 4} more`
                  : ""}
                . A rollover or a replaced meter needs fixing before these bills
                go out.
              </div>
            </div>
          </div>
        )}

        {summary.attention.length > 0 && (
          <div className="check-row warn">
            <Icon tone="warn" />
            <div className="check-body">
              <div className="check-title warn-text">
                {summary.attention.length} over 40 cu.m.
              </div>
              <div className="check-sub">
                Unusually high for a month. Worth a second look at the meter
                before billing.
              </div>
            </div>
          </div>
        )}

        <div className="check-row">
          <Icon tone="ok" />
          <div className="check-body">
            <div className="check-title">
              {summary.excluded === 0
                ? "No account is excluded"
                : `${summary.excluded} accounts excluded`}
            </div>
            <div className="check-sub">
              {summary.excluded === 0
                ? `All ${summary.count} accounts loaded will get a bill.`
                : "Excluded accounts get no bill at all for this period."}
            </div>
          </div>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="review-actions">
        <button className="primary" onClick={generate} disabled={saving}>
          {saving ? "Generating…" : `Generate ${summary.count} bills`}
        </button>
        <button className="clear-filters" onClick={onBack} disabled={saving}>
          Back to readings
        </button>
        <span className="count">
          All {summary.count} are written together, or none are. Meter
          references advance at the same moment.
        </span>
      </div>
    </>
  );
}
