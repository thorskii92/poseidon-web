import { Fragment, useEffect, useRef, useState } from "react";
import { apiPost } from "./api";
import AdminAuth from "./AdminAuth";

const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type BillFields = {
  classId: number;
  isSenior: string;
  prevRead: number;
  presRead: number;
  consumption: number;
  rate: number;
  wsf: number;
  enviFee: number;
  discount: number;
  airContent: number;
  flatRate: number;
  excess: number;
  billAmount: number;
  applicationFee: number;
  wmmf: number;
  penalty: number;
  billDate: string | null;
  readDate: string | null;
  dueDate: string | null;
  billMonth: string;
  billYear: number;
  fromDate: string | null;
  toDate: string | null;
  billNote: string;
};

type LoadedBill = {
  billId: number;
  acctId: number;
  barangayId: number;
  accountNo: string;
  name: string;
  standpipe: string | null;
  classification: string;
  meterSizeId: number;
  householdMembers: number;
  seniorCount: number;
  newerBills: number;
  blockedBy: string[];
  /** Set for an adjusted bill whose figures don't add up — the only kind of
   *  adjusted bill this dialog lets through, to be repaired. */
  repair: { parts: number; charged: number; chargedAfterDue: number; penalty: number } | null;
  /** An adjusted bill (null otherwise): edits it has left since its adjustment. */
  editsLeftAfterAdjustment: number | null;
  maxEditsAfterAdjustment: number;
  fields: BillFields;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
/** WSF + E.F. − discount — what the bill amount must equal for Collection
 *  to accept it (see bill-edit's "doesn't add up" check). */
const parts = (f: BillFields) => round2(f.wsf + f.enviFee - f.discount);
const addsUp = (f: BillFields) => Math.abs(parts(f) - round2(f.billAmount)) <= 0.01;

type EditRow = LoadedBill & {
  mode: "Automatic" | "Manual";
  /** The values as loaded, to tell what the clerk actually changed. */
  original: BillFields;
  /** Roll the account's meter reference forward to the new present reading. */
  updateMeterReference: boolean;
};

/** The money fields "set for all" can write, and Manual mode can type into. */
const MONEY: { key: keyof BillFields; label: string }[] = [
  { key: "rate", label: "Water rate" },
  { key: "wsf", label: "Amount (WSF)" },
  { key: "enviFee", label: "Envi fee" },
  { key: "discount", label: "Discount" },
  { key: "airContent", label: "AC adjustment" },
  { key: "flatRate", label: "Flat rate" },
  { key: "excess", label: "Excess" },
  { key: "billAmount", label: "Bill amount" },
  { key: "applicationFee", label: "Application fee" },
  { key: "penalty", label: "Penalty" },
];

const DATES: { key: keyof BillFields; label: string }[] = [
  { key: "billDate", label: "Billing date" },
  { key: "readDate", label: "Reading date" },
  { key: "dueDate", label: "Due date" },
  { key: "fromDate", label: "From date" },
  { key: "toDate", label: "To date" },
];

const total = (f: BillFields) => f.billAmount + f.applicationFee + f.wmmf;

export default function EditBillsDialog({
  billIds,
  onClose,
  onSaved,
}: {
  billIds: number[];
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [rows, setRows] = useState<EditRow[]>([]);
  const [blocked, setBlocked] = useState<LoadedBill[]>([]);
  const [classifications, setClassifications] = useState<
    { id: number; name: string }[]
  >([]);
  const [months, setMonths] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);

  const [bulkField, setBulkField] = useState<string>("penalty");
  const [bulkValue, setBulkValue] = useState("0");

  const [reason, setReason] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dirty = useRef(new Set<number>());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const body = await apiPost<{
          classifications: { id: number; name: string }[];
          months: string[];
          bills: LoadedBill[];
        }>("/api/bill-edit/load", { billIds });
        if (cancelled) return;
        setClassifications(body.classifications);
        setMonths(body.months);
        setRows(
          body.bills
            .filter((b) => !b.blockedBy.length)
            .map((b) => ({
              ...b,
              // Automatic would recompute from the readings and throw the
              // adjustment away; an adjusted bill starts from its adjusted amounts.
              mode: b.repair || b.editsLeftAfterAdjustment != null ? ("Manual" as const) : ("Automatic" as const),
              original: { ...b.fields },
              updateMeterReference: false,
            })),
        );
        setBlocked(body.bills.filter((b) => b.blockedBy.length > 0));
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [billIds]);

  /** Recompute the Automatic rows whose readings changed. */
  async function recompute() {
    const ids = [...dirty.current];
    dirty.current.clear();
    if (!ids.length) return;

    const targets = rows.filter(
      (r) => ids.includes(r.billId) && r.mode === "Automatic",
    );
    if (!targets.length) return;

    try {
      const { computed } = await apiPost<{ computed: any[] }>(
        "/api/bill-edit/compute",
        {
          rows: targets.map((r) => ({
            billId: r.billId,
            barangayId: r.barangayId,
            billMonth: r.fields.billMonth,
            billYear: r.fields.billYear,
            classId: r.fields.classId,
            isSenior: r.fields.isSenior,
            prevRead: r.fields.prevRead,
            presRead: r.fields.presRead,
            meterSizeId: r.meterSizeId,
            householdMembers: r.householdMembers,
            seniorCount: r.seniorCount,
          })),
        },
      );

      const byBill = new Map<number, Partial<BillFields>>(
        computed.map((c) => {
          const { billId, ...values } = c;
          return [billId as number, values as Partial<BillFields>];
        }),
      );
      setRows((prev) =>
        prev.map((r) =>
          byBill.has(r.billId)
            ? { ...r, fields: { ...r.fields, ...byBill.get(r.billId) } }
            : r,
        ),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    const timer = setTimeout(recompute, 600);
    return () => clearTimeout(timer);
  });

  function edit(billId: number, patch: Partial<BillFields>, recalc = false) {
    if (recalc) dirty.current.add(billId);
    setRows((prev) =>
      prev.map((r) =>
        r.billId === billId ? { ...r, fields: { ...r.fields, ...patch } } : r,
      ),
    );
  }

  function setMeterOption(billId: number, value: boolean) {
    setRows((prev) =>
      prev.map((r) =>
        r.billId === billId ? { ...r, updateMeterReference: value } : r,
      ),
    );
  }

  function setMode(billId: number, mode: "Automatic" | "Manual") {
    if (mode === "Automatic") dirty.current.add(billId);
    setRows((prev) =>
      prev.map((r) => (r.billId === billId ? { ...r, mode } : r)),
    );
  }

  /**
   * Apply one value to every row. Money fields force Manual, since a figure
   * typed here is an override and a recompute would immediately undo it.
   */
  function applyToAll() {
    const isMoney = MONEY.some((m) => m.key === bulkField);
    const isDate = DATES.some((d) => d.key === bulkField);
    const value = isDate ? bulkValue : Number(bulkValue) || 0;

    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        mode: isMoney ? "Manual" : r.mode,
        fields: { ...r.fields, [bulkField]: value },
      })),
    );
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = await apiPost<{ updated: number }>("/api/bill-edit/save", {
        reason,
        username,
        password,
        rows: rows.map((r) => ({
          billId: r.billId,
          mode: r.mode,
          fields: r.fields,
          updateMeterReference: r.updateMeterReference,
        })),
      });
      onSaved(body.updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Edit bills</h2>
        <p className="modal-sub">
          {loading
            ? "Loading…"
            : `${rows.length} editable${blocked.length ? `, ${blocked.length} skipped` : ""}`}
        </p>

        {loadError && <div className="form-error">{loadError}</div>}

        {blocked.length > 0 && (
          <div className="delete-blocked">
            <strong>{blocked.length} cannot be edited</strong>
            <ul>
              {blocked.slice(0, 5).map((b) => (
                <li key={b.billId}>
                  {b.name} - {b.blockedBy.join("; ")}
                </li>
              ))}
              {blocked.length > 5 && <li>and {blocked.length - 5} more</li>}
            </ul>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="bulk-bar">
              <span className="balance-label">Set for all {rows.length}</span>
              <select
                value={bulkField}
                onChange={(e) => setBulkField(e.target.value)}
              >
                {MONEY.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
                {DATES.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
              <input
                className="filter-input"
                type={DATES.some((d) => d.key === bulkField) ? "date" : "text"}
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
              />
              <button className="clear-filters" onClick={applyToAll}>
                Apply
              </button>
              <span className="count">
                Setting a money field switches those rows to Manual.
              </span>
            </div>

            <div className="edit-scroll">
              <table className="edit-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th style={{ width: 118 }}>Computation</th>
                    <th className="num" style={{ width: 78 }}>
                      Prev
                    </th>
                    <th className="num" style={{ width: 78 }}>
                      Present
                    </th>
                    <th className="num" style={{ width: 68 }}>
                      Cu.m.
                    </th>
                    <th className="num" style={{ width: 92 }}>
                      WSF
                    </th>
                    <th className="num" style={{ width: 82 }}>
                      E.F.
                    </th>
                    <th className="num" style={{ width: 88 }}>
                      Discount
                    </th>
                    <th className="num" style={{ width: 88 }}>
                      Penalty
                    </th>
                    <th className="num" style={{ width: 98 }}>
                      Total
                    </th>
                    <th style={{ width: 34 }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const manual = r.mode === "Manual";
                    const f = r.fields;
                    const open = expanded === r.billId;

                    return (
                      <Fragment key={r.billId}>
                        <tr>
                          <td>
                            {r.name}
                            {r.newerBills > 0 && (
                              <span
                                className="edited"
                                title="This account has later bills. Their carried-forward arrears will not be recalculated."
                              >
                                {r.newerBills} later{" "}
                                {r.newerBills === 1 ? "bill" : "bills"}
                              </span>
                            )}
                            {r.repair && (
                              <span
                                className="edited"
                                title="An adjusted bill whose figures don't add up — editable so it can be repaired"
                              >
                                adjusted · doesn't add up
                              </span>
                            )}
                            {!r.repair && r.editsLeftAfterAdjustment != null && (
                              <span
                                className="edited"
                                title={`Adjusted bills can be edited up to ${r.maxEditsAfterAdjustment} times after the adjustment, while unpaid`}
                              >
                                adjusted · {r.editsLeftAfterAdjustment} of {r.maxEditsAfterAdjustment} edits left
                              </span>
                            )}
                            <span className="cell-sub">{r.accountNo}</span>
                          </td>
                          <td>
                            <select
                              className="control"
                              value={r.mode}
                              onChange={(e) =>
                                setMode(
                                  r.billId,
                                  e.target.value as "Automatic" | "Manual",
                                )
                              }
                            >
                              <option value="Automatic">Automatic</option>
                              <option value="Manual">Manual</option>
                            </select>
                          </td>
                          <td className="num">
                            <input
                              className="reading-input small"
                              value={f.prevRead}
                              onChange={(e) =>
                                edit(
                                  r.billId,
                                  {
                                    prevRead: Number(e.target.value) || 0,
                                    consumption:
                                      f.presRead -
                                      (Number(e.target.value) || 0),
                                  },
                                  true,
                                )
                              }
                            />
                          </td>
                          <td className="num">
                            <input
                              className="reading-input small"
                              value={f.presRead}
                              onChange={(e) =>
                                edit(
                                  r.billId,
                                  {
                                    presRead: Number(e.target.value) || 0,
                                    consumption:
                                      (Number(e.target.value) || 0) -
                                      f.prevRead,
                                  },
                                  true,
                                )
                              }
                            />
                          </td>
                          <td className="num">
                            <span
                              className={`cons ${f.consumption < 0 ? "neg" : f.consumption >= 41 ? "high" : "good"}`}
                            >
                              {f.consumption}
                            </span>
                          </td>

                          <MoneyCell
                            value={f.wsf}
                            manual={manual}
                            onChange={(v) => edit(r.billId, { wsf: v })}
                          />
                          <MoneyCell
                            value={f.enviFee}
                            manual={manual}
                            onChange={(v) => edit(r.billId, { enviFee: v })}
                          />
                          <MoneyCell
                            value={f.discount}
                            manual={manual}
                            onChange={(v) => edit(r.billId, { discount: v })}
                          />
                          <MoneyCell
                            value={f.penalty}
                            manual={manual}
                            onChange={(v) => edit(r.billId, { penalty: v })}
                          />

                          <td className="num" style={{ fontWeight: 600 }}>
                            {peso.format(total(f))}
                          </td>
                          <td>
                            <button
                              className="row-expand"
                              onClick={() =>
                                setExpanded(open ? null : r.billId)
                              }
                              aria-label={
                                open ? "Hide fields" : "Show all fields"
                              }
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 14 14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                style={{
                                  transform: open
                                    ? "rotate(180deg)"
                                    : undefined,
                                }}
                              >
                                <path d="M4 5.5l3 3 3-3" />
                              </svg>
                            </button>
                          </td>
                        </tr>

                        {r.repair && (
                          <tr className="row-detail">
                            <td colSpan={11} className={`repair-bar ${addsUp(f) ? "fixed" : ""}`}>
                              {addsUp(f) ? (
                                <span>
                                  <strong>Adds up now</strong> — WSF {peso.format(f.wsf)} + E.F.{" "}
                                  {peso.format(f.enviFee)} − discount {peso.format(f.discount)} ={" "}
                                  {peso.format(f.billAmount)}. Past due it will be{" "}
                                  {peso.format(f.billAmount + f.penalty)} with the penalty.
                                </span>
                              ) : (
                                <span>
                                  <strong>Doesn't add up:</strong> WSF + E.F. − discount ={" "}
                                  {peso.format(parts(f))}, but the bill amount is{" "}
                                  {peso.format(f.billAmount)} (off by{" "}
                                  {peso.format(Math.abs(parts(f) - f.billAmount))}).
                                </span>
                              )}
                              {!addsUp(f) && (
                                <span className="repair-actions">
                                  <button
                                    className="link-button"
                                    title="Keep the adjusted bill amount and change the WSF so the breakdown matches it"
                                    onClick={() =>
                                      edit(r.billId, {
                                        wsf: round2(f.billAmount - f.enviFee + f.discount),
                                      })
                                    }
                                  >
                                    Fit WSF to {peso.format(f.billAmount)}
                                  </button>
                                  <button
                                    className="link-button"
                                    title="Keep the breakdown and change the bill amount to match it"
                                    onClick={() => edit(r.billId, { billAmount: parts(f) })}
                                  >
                                    Set bill amount to {peso.format(parts(f))}
                                  </button>
                                </span>
                              )}
                              <span className="count">
                                Was charging {peso.format(r.repair.charged)}
                                {r.repair.penalty ? ` (penalty ${peso.format(r.repair.penalty)} — check it matches the adjusted amount)` : ""}
                              </span>
                            </td>
                          </tr>
                        )}

                        {r.newerBills === 0 &&
                          f.presRead !== r.original.presRead && (
                            <tr className="row-detail">
                              <td colSpan={11} className="meter-option">
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={r.updateMeterReference}
                                    onChange={(e) =>
                                      setMeterOption(r.billId, e.target.checked)
                                    }
                                  />
                                  Also move this account's meter reference from{" "}
                                  <strong>{r.original.presRead}</strong> to{" "}
                                  <strong>{f.presRead}</strong>
                                </label>
                                <span className="count">
                                  Next month's previous reading is taken from
                                  it.
                                </span>
                              </td>
                            </tr>
                          )}

                        {open && (
                          <tr className="row-detail">
                            <td colSpan={11}>
                              <div className="edit-detail">
                                <label className="field-input">
                                  <span>Classification</span>
                                  <select
                                    value={f.classId}
                                    onChange={(e) =>
                                      edit(
                                        r.billId,
                                        { classId: Number(e.target.value) },
                                        true,
                                      )
                                    }
                                  >
                                    {classifications.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label className="field-input">
                                  <span>Account type</span>
                                  <select
                                    value={f.isSenior}
                                    onChange={(e) =>
                                      edit(
                                        r.billId,
                                        { isSenior: e.target.value },
                                        true,
                                      )
                                    }
                                  >
                                    <option value="NO">Regular</option>
                                    <option value="YES">Senior / PWD</option>
                                  </select>
                                </label>

                                {(
                                  [
                                    ["rate", "Water rate"],
                                    ["airContent", "AC adjustment"],
                                    ["flatRate", "Flat rate"],
                                    ["excess", "Excess"],
                                    ["billAmount", "Bill amount"],
                                    ["applicationFee", "Application fee"],
                                  ] as [keyof BillFields, string][]
                                ).map(([key, label]) => (
                                  <label className="field-input" key={key}>
                                    <span>{label}</span>
                                    <MoneyInput
                                      value={Number(f[key] ?? 0)}
                                      disabled={!manual}
                                      onChange={(v) =>
                                        edit(r.billId, {
                                          [key]: v,
                                        } as Partial<BillFields>)
                                      }
                                    />
                                  </label>
                                ))}

                                <label className="field-input">
                                  <span>WMMF</span>
                                  <input value={String(f.wmmf ?? 0)} disabled />
                                </label>

                                <label className="field-input">
                                  <span>Bill month</span>
                                  <select
                                    value={f.billMonth}
                                    onChange={(e) =>
                                      edit(r.billId, {
                                        billMonth: e.target.value,
                                      })
                                    }
                                  >
                                    {months.map((m) => (
                                      <option key={m} value={m}>
                                        {m}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label className="field-input">
                                  <span>Bill year</span>
                                  <input
                                    value={String(f.billYear)}
                                    onChange={(e) =>
                                      edit(r.billId, {
                                        billYear:
                                          Number(e.target.value) || f.billYear,
                                      })
                                    }
                                  />
                                </label>

                                {DATES.map(({ key, label }) => (
                                  <label className="field-input" key={key}>
                                    <span>{label}</span>
                                    <input
                                      type="date"
                                      value={String(f[key] ?? "").slice(0, 10)}
                                      onChange={(e) =>
                                        edit(r.billId, {
                                          [key]: e.target.value,
                                        } as Partial<BillFields>)
                                      }
                                    />
                                  </label>
                                ))}

                                <label className="field-input wide">
                                  <span>Bill note</span>
                                  <textarea
                                    rows={4}
                                    value={f.billNote}
                                    onChange={(e) =>
                                      edit(r.billId, {
                                        billNote: e.target.value,
                                      })
                                    }
                                  />
                                </label>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <label className="field-input" style={{ marginTop: 18 }}>
              <span>
                Reason for editing{" "}
                {rows.length === 1 ? "this bill" : "these bills"}
              </span>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Recorded against every bill in this batch"
              />
            </label>

            <div style={{ marginTop: 16 }}>
              <AdminAuth
                username={username}
                password={password}
                onUsername={setUsername}
                onPassword={setPassword}
                onSubmit={save}
                disabled={saving}
              />
            </div>
          </>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button
            className="primary"
            disabled={
              saving || !rows.length || !reason.trim() || !username || !password ||
              rows.some((r) => r.repair && !addsUp(r.fields))
            }
            onClick={save}
          >
            {saving
              ? "Saving…"
              : `Save ${rows.length} ${rows.length === 1 ? "bill" : "bills"}`}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          {rows.length > 0 && (!reason.trim() || !username || !password) && (
            <span className="count">
              A reason and an administrator's credentials are required.
            </span>
          )}
          {rows.some((r) => r.repair && !addsUp(r.fields)) && (
            <span className="count">
              Every adjusted bill being repaired has to add up before it can be saved.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A peso amount box. Keeps what was typed, not the number it parses to —
 * otherwise "298." redraws as "298" and the decimal point can never be
 * typed. A change from outside (e.g. "Fit WSF") still shows, because it no
 * longer matches what was typed.
 */
function MoneyInput({
  value, onChange, className, disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(value ?? 0));
  const shown = Number(text) === (value ?? 0) ? text : String(value ?? 0);
  return (
    <input
      className={className}
      inputMode="decimal"
      disabled={disabled}
      value={shown}
      onChange={(e) => {
        // Digits and one decimal point, up to centavos.
        const raw = e.target.value
          .replace(/[^0-9.]/g, "")
          .replace(/(\..*)\./g, "$1")
          .replace(/(\.\d{2})\d+$/, "$1");
        setText(raw);
        onChange(Number(raw) || 0);
      }}
    />
  );
}

function MoneyCell({
  value,
  manual,
  onChange,
}: {
  value: number;
  manual: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <td className="num">
      {manual ? (
        <MoneyInput className="reading-input small" value={value} onChange={onChange} />
      ) : (
        peso.format(value ?? 0)
      )}
    </td>
  );
}
