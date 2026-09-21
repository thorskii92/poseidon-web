import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { apiPost } from "./api";
import type { Computed, Row, Run } from "./ReadingPage";

const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * What the consumer actually owes for the month.
 *
 * `useAmount` (GetTotal) is only WSF + EnviFee - discount. The application-fee
 * installment and the WMMF are stored in their own columns and added back at
 * display time - which is what the printed bill and the account balance do.
 */
function totalDue(r: Row) {
  return (r.computed?.total ?? 0) + r.applicationFee + (r.computed?.wmmf ?? 0);
}

/** The desktop's colour rule: 0-40 fine, 41+ needs attention, negative is wrong. */
function consumptionClass(consumption: number) {
  if (consumption < 0) return "neg";
  if (consumption >= 41) return "high";
  return "good";
}

type Filter =
  | "all"
  | "entered"
  | "todo"
  | "negative"
  | "attention"
  | "excluded";

export default function ReadingGrid({
  run,
  rows,
  setRows,
  onReview,
  onDiscard,
}: {
  run: Run;
  rows: Row[];
  setRows: (updater: (rows: Row[]) => Row[]) => void;
  onReview: () => void;
  onDiscard: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState<{ found: number; review: number; unmatched: string[] } | null>(null);
  const [scanError, setScanError] = useState("");

  // Accounts edited since the last flush.
  const dirty = useRef(new Set<number>());
  const inputs = useRef(new Map<number, HTMLInputElement | null>());
  const scanInput = useRef<HTMLInputElement | null>(null);

  const counts = useMemo(() => {
    let entered = 0,
      negative = 0,
      attention = 0,
      excluded = 0,
      billed = 0;
    for (const r of rows) {
      if (r.excluded) excluded += 1;
      if (r.entered) entered += 1;
      const c = r.presentReading - r.previousReading;
      if (r.entered && c < 0) negative += 1;
      if (r.entered && c >= 41) attention += 1;
      if (!r.excluded) billed += totalDue(r);
    }
    return {
      entered,
      todo: rows.length - entered,
      negative,
      attention,
      excluded,
      billed,
    };
  }, [rows]);

  // Only show the installment column when someone in this area is paying one.
  const hasFees = useMemo(() => rows.some((r) => r.applicationFee > 0), [rows]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => {
      const c = r.presentReading - r.previousReading;
      if (filter === "entered" && !r.entered) return false;
      if (filter === "todo" && r.entered) return false;
      if (filter === "negative" && !(r.entered && c < 0)) return false;
      if (filter === "attention" && !(r.entered && c >= 41)) return false;
      if (filter === "excluded" && !r.excluded) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        String(r.accountNo).toLowerCase().includes(needle) ||
        String(r.standpipe ?? "")
          .toLowerCase()
          .includes(needle)
      );
    });
  }, [rows, filter, search]);

  /** Recompute and autosave everything edited since the last flush. */
  async function flush() {
    const ids = [...dirty.current];
    if (!ids.length) return;
    dirty.current.clear();

    const edited = rows.filter((r) => ids.includes(r.acctId));
    if (!edited.length) return;

    try {
      const { computed } = await apiPost<{ computed: Computed[] }>(
        "/api/reading/compute",
        {
          rateMethodId: run.rateMethodId,
          rows: edited.map((r) => ({
            acctId: r.acctId,
            consumption: r.presentReading - r.previousReading,
            classId: r.classId,
            isSenior: r.isSenior,
            meterSizeId: r.meterSizeId,
            householdMembers: r.householdMembers,
            seniorCount: r.seniorCount,
          })),
        },
      );

      const byAcct = new Map(computed.map((c) => [c.acctId, c]));
      setRows((prev) =>
        prev.map((r) =>
          byAcct.has(r.acctId) ? { ...r, computed: byAcct.get(r.acctId)! } : r,
        ),
      );

      const saved = await fetch("/api/reading/autosave", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: edited.map((r) => ({
            acctId: r.acctId,
            barangayId: r.barangayId,
            clusterId: r.clusterId,
            previousReading: r.previousReading,
            presentReading: r.presentReading,
            classification: r.classification,
            isSenior: r.isSenior,
            excluded: r.excluded,
          })),
        }),
      });

      // fetch only rejects on a network failure, so a 401 or a 500 would
      // otherwise be reported to the clerk as a successful save.
      if (!saved.ok) {
        const body = await saved.json().catch(() => null);
        throw new Error(body?.error ?? "Could not save your progress");
      }

      setSavedAt(new Date());
      setSaveError("");
    } catch (err) {
      // Put them back so the next flush retries.
      for (const id of ids) dirty.current.add(id);
      setSaveError((err as Error).message);
    }
  }

  // Flush once the typing pauses, so a fast run down a route is one round trip.
  useEffect(() => {
    const timer = setTimeout(flush, 700);
    return () => clearTimeout(timer);
  });

  function edit(acctId: number, patch: Partial<Row>) {
    dirty.current.add(acctId);
    setRows((prev) =>
      prev.map((r) => (r.acctId === acctId ? { ...r, ...patch } : r)),
    );
  }

  /**
   * Upload a photo of a printed Reading List and prefill present readings
   * from it. This only ever proposes values through the same `edit` path
   * a clerk's own typing uses — nothing here saves or bills on its own;
   * "Review and generate bills" still requires the clerk to look at it.
   */
  async function scanFiles(files: File[]) {
    setScanning(true);
    setScanError("");
    setScanSummary(null);
    try {
      const form = new FormData();
      for (const file of files) form.append("scan", file);
      form.append(
        "accounts",
        JSON.stringify(
          rows.map((r) => ({
            acctId: r.acctId,
            accountNo: r.accountNo,
            previousReading: r.previousReading,
          })),
        ),
      );

      const res = await fetch("/api/reading/scan", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Could not read that scan");

      type ScanMatch = { acctId: number; value: number | null; needsReview: boolean; reason: string };
      const matches: ScanMatch[] = body.matches ?? [];

      let found = 0;
      let review = 0;
      const unmatched: string[] = [];

      for (const m of matches) {
        if (m.value == null) {
          if (m.reason === "account number not found on the sheet") {
            const row = rows.find((r) => r.acctId === m.acctId);
            if (row) unmatched.push(row.accountNo);
          }
          continue;
        }
        found += 1;
        if (m.needsReview) review += 1;
        dirty.current.add(m.acctId);
        setRows((prev) =>
          prev.map((r) =>
            r.acctId === m.acctId
              ? { ...r, presentReading: m.value!, entered: true, scanReason: m.needsReview ? m.reason : undefined }
              : r,
          ),
        );
      }

      setScanSummary({ found, review, unmatched });
    } catch (err) {
      setScanError((err as Error).message);
    } finally {
      setScanning(false);
      if (scanInput.current) scanInput.current.value = "";
    }
  }

  /** Enter moves to the next meter that still has no reading. */
  function focusNext(acctId: number) {
    const index = visible.findIndex((r) => r.acctId === acctId);
    for (let i = index + 1; i < visible.length; i += 1) {
      if (!visible[i].entered) {
        inputs.current.get(visible[i].acctId)?.focus();
        inputs.current.get(visible[i].acctId)?.select();
        return;
      }
    }
    inputs.current.get(visible[index + 1]?.acctId)?.focus();
  }

  const chips: { key: Filter; label: string; value: number; tone?: string }[] =
    [
      { key: "entered", label: "entered", value: counts.entered },
      {
        key: "todo",
        label: "still to enter",
        value: counts.todo,
        tone: "todo",
      },
      {
        key: "negative",
        label: "negative",
        value: counts.negative,
        tone: "bad",
      },
      {
        key: "attention",
        label: "over 40 cu.m.",
        value: counts.attention,
        tone: "attention",
      },
      { key: "excluded", label: "excluded", value: counts.excluded },
    ];

  return (
    <>
      <div className="page-head">
        <h1>Meter Reading</h1>
        <div className="head-actions">
          <span className="count">
            {saveError
              ? "Could not save - retrying"
              : savedAt
                ? `Saved ${savedAt.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}`
                : "Nothing entered yet"}
          </span>
          <input
            ref={scanInput}
            type="file"
            accept="image/*,application/pdf"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              const files = e.target.files;
              if (files?.length) scanFiles(Array.from(files));
            }}
          />
          <button
            className="clear-filters"
            disabled={scanning}
            onClick={() => scanInput.current?.click()}
          >
            {scanning ? "Reading scan…" : "Upload scanned reading"}
          </button>
          <button
            className="clear-filters"
            onClick={async () => {
              if (!confirm("Discard this run? Entered readings will be lost."))
                return;
              await fetch("/api/reading/session", { method: "DELETE" });
              onDiscard();
            }}
          >
            Discard run
          </button>
        </div>
      </div>

      {scanError && (
        <div className="form-error" style={{ marginBottom: 12 }}>
          {scanError}
        </div>
      )}
      {scanSummary && (
        <div className="notice">
          <span>
            {scanSummary.found} reading{scanSummary.found === 1 ? "" : "s"} filled in from the scan
            {scanSummary.review > 0 && `, ${scanSummary.review} flagged for review`}.
            {scanSummary.unmatched.length > 0 && (
              <> Could not find on the sheet: {scanSummary.unmatched.join(", ")}.</>
            )}
          </span>
          <button className="link-button" onClick={() => setScanSummary(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="run-context">
        <div className="run-context-body">
          <strong>
            {run.monthName} {run.year}
          </strong>
          <span>
            {run.barangayName}
            {run.clusterName ? ` / ${run.clusterName}` : ""}
          </span>
          <span>{run.readerName}</span>
          <span className="muted-blue">
            Reads {run.dates.fromDate?.slice(5)} to {run.dates.toDate?.slice(5)}
          </span>
          <span className="muted-blue">Due {run.dates.dueDate?.slice(5)}</span>
        </div>
        <button className="link-button" onClick={onDiscard}>
          Change
        </button>
      </div>

      <div className="chip-row">
        {chips.map((c) => (
          <button
            key={c.key}
            className={[
              "chip",
              c.tone ?? "",
              filter === c.key ? "chip-active" : "",
            ].join(" ")}
            onClick={() => setFilter(filter === c.key ? "all" : c.key)}
          >
            <strong>{c.value}</strong> {c.label}
          </button>
        ))}
        <div className="chip-spacer" />
        <input
          className="search"
          style={{ width: 240 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find name, account no, standpipe"
        />
      </div>

      <table className="reading-table">
        <thead>
          <tr>
            <th style={{ width: 38 }}>#</th>
            <th style={{ width: 88 }}>Standpipe</th>
            <th>Account</th>
            <th className="num" style={{ width: 82 }}>
              Previous
            </th>
            <th className="num" style={{ width: 112 }}>
              Present
            </th>
            <th className="num" style={{ width: 86 }}>
              Cu.m.
            </th>
            {hasFees && (
              <th className="num" style={{ width: 96 }}>
                Install fee
              </th>
            )}
            <th className="num" style={{ width: 106 }}>
              Total due
            </th>
            <th className="num" style={{ width: 116 }}>
              Arrears
            </th>
            <th style={{ width: 74, textAlign: "center" }}>Exclude</th>
            <th style={{ width: 34 }} />
          </tr>
        </thead>
        <tbody>
          {visible.map((r, i) => {
            const consumption = r.presentReading - r.previousReading;
            const tone = consumptionClass(consumption);
            const isOpen = expanded === r.acctId;

            return (
              <Fragment key={r.acctId}>
                <tr
                  className={[
                    r.entered && consumption < 0 ? "row-warning" : "",
                    r.excluded ? "row-excluded" : "",
                  ].join(" ")}
                >
                  <td className="muted">{i + 1}</td>
                  <td className={r.standpipe ? "" : "muted"}>
                    {r.standpipe || "-"}
                  </td>
                  <td>
                    {r.name}
                    <span className="cell-sub">{r.accountNo}</span>
                  </td>
                  <td className="num">
                    <input
                      className="reading-input small"
                      value={r.previousReading}
                      onChange={(e) =>
                        edit(r.acctId, {
                          previousReading: Number(e.target.value) || 0,
                          entered: true,
                        })
                      }
                    />
                  </td>
                  <td className="num">
                    <input
                      className={r.scanReason ? "reading-input needs-review" : "reading-input"}
                      title={r.scanReason ? `From the scan — ${r.scanReason}` : undefined}
                      ref={(el) => {
                        inputs.current.set(r.acctId, el);
                      }}
                      value={r.entered ? r.presentReading : ""}
                      placeholder="-"
                      onChange={(e) =>
                        edit(r.acctId, {
                          presentReading: Number(e.target.value) || 0,
                          entered: true,
                          scanReason: undefined,
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          flush();
                          focusNext(r.acctId);
                        }
                      }}
                    />
                    {r.scanReason && <span className="cell-sub">scan: {r.scanReason}</span>}
                  </td>
                  <td className="num">
                    {r.entered ? (
                      <span className={`cons ${tone}`}>{consumption}</span>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  {hasFees && (
                    <td className="num">
                      {r.applicationFee > 0 ? (
                        peso.format(r.applicationFee)
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                  )}
                  <td className="num">
                    {r.computed ? (
                      peso.format(totalDue(r))
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td className="num">
                    {r.prev.total > 0 ? (
                      <>
                        {peso.format(r.prev.total)}
                        {r.arrearCount > 0 && (
                          <span
                            className={`unpaid ${r.arrearCount >= 3 ? "high" : ""}`}
                          >
                            {r.arrearCount}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={r.excluded}
                      onChange={(e) =>
                        edit(r.acctId, { excluded: e.target.checked })
                      }
                    />
                  </td>
                  <td>
                    <button
                      className="row-expand"
                      onClick={() => setExpanded(isOpen ? null : r.acctId)}
                      aria-label={isOpen ? "Hide breakdown" : "Show breakdown"}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        style={{
                          transform: isOpen ? "rotate(180deg)" : undefined,
                        }}
                      >
                        <path d="M4 5.5l3 3 3-3" />
                      </svg>
                    </button>
                  </td>
                </tr>

                {r.entered && consumption < 0 && (
                  <tr className="row-warning">
                    <td colSpan={hasFees ? 11 : 10} className="row-note">
                      Present reading is below the previous one. Check for a
                      meter rollover or a replaced meter before generating.
                    </td>
                  </tr>
                )}

                {isOpen && (
                  <tr className="row-detail">
                    <td colSpan={hasFees ? 11 : 10}>
                      <div className="detail-wrap">
                        <div className="detail-grid">
                          <Detail
                            label="Water service fee"
                            value={r.computed?.wsf}
                          />
                          <Detail
                            label="Environmental fee"
                            value={r.computed?.enviFee}
                          />
                          <Detail
                            label="Senior discount"
                            value={r.computed?.discount}
                          />
                          <Detail
                            label="Total amount"
                            value={r.computed?.total}
                            strong
                          />
                          <Detail
                            label="Installment fee"
                            value={r.applicationFee}
                          />
                          {run.showWmmf && (
                            <Detail label="WMMF" value={r.computed?.wmmf} />
                          )}
                          <Detail
                            label="Penalty after due"
                            value={r.computed?.penalty}
                          />
                          <Detail
                            label="Amount after due"
                            value={r.computed?.totalAfterDue}
                            strong
                          />
                        </div>
                        <div className="detail-side">
                          <div className="field">
                            <span className="field-label">Classification</span>
                            <span className="field-value">
                              {r.classification}
                            </span>
                          </div>
                          <label className="field-input">
                            <span>Consumer type</span>
                            <select
                              value={r.isSenior}
                              onChange={(e) =>
                                edit(r.acctId, { isSenior: e.target.value })
                              }
                            >
                              <option value="NO">Regular</option>
                              <option value="YES">Senior / PWD</option>
                            </select>
                          </label>
                          {r.unpaidLabel && (
                            <div className="field">
                              <span className="field-label">Unpaid months</span>
                              <span className="field-value">
                                {r.unpaidLabel}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {!visible.length && (
        <p className="count" style={{ marginTop: 16 }}>
          No accounts match that filter.
        </p>
      )}

      <p className="count" style={{ marginTop: 18 }}>
        <span className="kbd">Enter</span> jumps to the next meter without a
        reading. Every entry is saved as you type.
      </p>

      <div className="stats">
        <div className="stat">
          <div className="stat-value">
            {counts.entered} / {rows.length}
          </div>
          <div className="stat-label">Meters entered</div>
        </div>
        <div className="stat">
          <div className="stat-value pending">{peso.format(counts.billed)}</div>
          <div className="stat-label">Billed so far</div>
        </div>
        {counts.negative > 0 && (
          <div className="stat">
            <div className="stat-value danger">{counts.negative}</div>
            <div className="stat-label">Needs checking</div>
          </div>
        )}
        <div className="stat-spacer" />
        <button
          className="primary"
          onClick={async () => {
            await flush();
            onReview();
          }}
        >
          Review and generate bills
        </button>
      </div>
    </>
  );
}

function Detail({
  label,
  value,
  strong,
}: {
  label: string;
  value: number | undefined;
  strong?: boolean;
}) {
  return (
    <div>
      <div className="detail-label">{label}</div>
      <div
        className={[
          "detail-value",
          strong ? "detail-strong" : "",
          !value ? "muted" : "",
        ].join(" ")}
      >
        {peso.format(value ?? 0)}
      </div>
    </div>
  );
}
