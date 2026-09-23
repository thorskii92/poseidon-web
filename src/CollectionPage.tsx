import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "./api";
import PaymentDialog from "./PaymentDialog";
import type {
  Payable, PayablesResponse, OrSettings, OtherFee, BulkOptions, BulkRate,
} from "./collectionTypes";
import { peso, today } from "./collectionTypes";

type Account = { id: number; accountNo: string; name: string };

type PaymentRow = {
  id: number;
  nature: string;
  date: string | null;
  orNumber: string;
  orSerial: string;
  amount: number;
};

/**
 * The editable payables carry their own range from the server: an Application
 * Fee runs from the municipality's DownpaymentAmount up to the full fee, and an
 * Installment Fee from 1 up to whatever is left on the balance. The desktop
 * enforced this in a modal with the range printed on it; here the bounds live
 * on the row and the clerk sees them under the field.
 *
 * The server clamps again inside the payment transaction — this is so the
 * clerk finds out before pressing Save, not because the browser is trusted.
 */
const UNCAPPED = 9_999_999;

function clampAmount(row: Payable, value: number) {
  if (!Number.isFinite(value)) return row.min;
  return Math.min(row.max, Math.max(row.min, value));
}

function outOfRange(row: Payable, value: number) {
  return !Number.isFinite(value) || value < row.min || value > row.max;
}

function rangeHint(row: Payable) {
  if (row.min === row.max) return peso.format(row.max);
  if (row.max >= UNCAPPED) return `at least ${peso.format(row.min)}`;
  return `${peso.format(row.min)} – ${peso.format(row.max)}`;
}

/** accountstatus.staID → the badge tone the rest of the app already uses. */
const STATUS_TONE: Record<number, string> = {
  1: "connected",
  2: "disconnected",
  9: "disconnected",
  3: "installation",
  7: "installation",
  10: "installation",
  11: "pending",
  12: "pending",
  13: "pending",
  14: "pending",
  15: "pending",
  4: "pending",
};

function statusTone(id: number) {
  return STATUS_TONE[id] ?? "pending";
}

function isSenior(value: string | null) {
  return String(value ?? "").trim().toUpperCase() === "YES";
}

export default function CollectionPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [date, setDate] = useState(today());
  const [orNumber, setOrNumber] = useState("");
  const [orSerial, setOrSerial] = useState("");
  const [checked, setChecked] = useState<Record<string, number>>({});
  const [extras, setExtras] = useState<OtherFee[]>([]);
  // One bulk order per receipt, as the desktop enforces.
  const [bulk, setBulk] = useState<BulkLine | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [notice, setNotice] = useState("");
  const [orError, setOrError] = useState("");
  const [pickedPayment, setPickedPayment] = useState<number | null>(null);

  const comboRef = useRef<HTMLDivElement>(null);

  /* ---- OR settings, once ---- */
  const { data: orSettings } = useQuery<OrSettings>({
    queryKey: ["collection-or"],
    queryFn: () => apiGet<OrSettings>("/api/collection/or"),
  });

  useEffect(() => {
    if (!orSettings) return;
    setOrNumber((v) => v || orSettings.orNumber);
    setOrSerial((v) => v || orSettings.orSerial || orSettings.serials[0] || "");
  }, [orSettings]);

  const { data: otherFees } = useQuery<OtherFee[]>({
    queryKey: ["collection-other-fees"],
    queryFn: () => apiGet<OtherFee[]>("/api/collection/other-fees"),
  });

  // Bulk water only exists where munlist.EnableBulk is on.
  const { data: bulkOptions } = useQuery<BulkOptions>({
    queryKey: ["collection-bulk-options"],
    queryFn: () => apiGet<BulkOptions>("/api/collection/bulk-options"),
  });

  /* ---- the consumer combobox ---- */
  const label = account ? `${account.name} — ${account.accountNo}` : "";
  // Clicking in without typing should list everyone, not search for the name
  // that is already selected.
  const query = search === label ? "" : search;

  const { data: matches } = useQuery<Account[]>({
    queryKey: ["collection-accounts", query],
    enabled: comboOpen,
    queryFn: () =>
      apiGet<Account[]>(`/api/collection/accounts?q=${encodeURIComponent(query)}`),
  });

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setComboOpen(false);
        setSearch(account ? `${account.name} — ${account.accountNo}` : "");
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [account]);

  /* ---- payables ---- */
  const { data, isLoading } = useQuery<PayablesResponse>({
    queryKey: ["collection-payables", account?.id, date],
    enabled: !!account,
    queryFn: () =>
      apiGet<PayablesResponse>(
        `/api/collection/payables/${account!.id}?date=${date}`,
      ),
  });

  const { data: history } = useQuery<PaymentRow[]>({
    queryKey: ["collection-history", account?.id],
    enabled: !!account,
    queryFn: () => apiGet<PaymentRow[]>(`/api/collection/history/${account!.id}`),
  });

  // Changing account or date invalidates the selection — the amounts move.
  useEffect(() => {
    setChecked({});
    setExtras([]);
    setBulk(null);
    setFocused(null);
    setNotice("");
    setPickedPayment(null);
  }, [account?.id, date]);

  const rows: Payable[] = useMemo(() => {
    const base = data?.items ?? [];
    const added: Payable[] = extras.map((f) => ({
      key: `otherfee:${f.id}`,
      kind: "other-fee",
      nature: f.name,
      accountNo: data?.account.accountNo ?? "",
      billPeriod: null,
      amount: f.amount,
      editable: f.editable,
      min: f.editable ? 1 : f.amount,
      max: f.editable ? UNCAPPED : f.amount,
      blocked: null,
      billId: null,
      feeId: f.id,
      detail: [{ label: f.name, value: peso.format(f.amount) }],
    }));
    const bulkRow: Payable[] = bulk
      ? [{
          key: "bulk",
          kind: "bulk",
          nature: bulk.rangeName ? "Bulk Water (delivery)" : "Bulk Water (pick-up)",
          accountNo: data?.account.accountNo ?? "",
          billPeriod: null,
          amount: bulk.water + bulk.delivery,
          editable: false,
          min: bulk.water + bulk.delivery,
          max: bulk.water + bulk.delivery,
          blocked: null,
          billId: null,
          feeId: null,
          detail: [
            { label: bulk.typeName, value: String(bulk.units) },
            { label: "Charged for", value: `${bulk.chargeable} unit(s)` },
            { label: "Water", value: peso.format(bulk.water) },
            ...(bulk.rangeName
              ? [
                  { label: "Delivery to", value: bulk.rangeName },
                  { label: "Delivery fee", value: peso.format(bulk.delivery) },
                ]
              : [{ label: "Collection", value: "For pick-up" }]),
          ],
          payload: {
            rateId: bulk.rateId,
            units: bulk.units,
            rangeId: bulk.rangeId ?? 0,
          },
        }]
      : [];

    return [...base, ...added, ...bulkRow];
  }, [data, extras, bulk]);

  const selectedKeys = Object.keys(checked);
  const total = selectedKeys.reduce((sum, k) => sum + (checked[k] ?? 0), 0);

  const overCap = rows.filter(
    (r) =>
      checked[r.key] !== undefined &&
      r.editable &&
      outOfRange(r, checked[r.key]),
  );

  function toggle(row: Payable) {
    if (row.blocked) {
      setNotice(row.blocked);
      return;
    }
    setNotice("");
    setChecked((prev) => {
      const next = { ...prev };
      if (next[row.key] !== undefined) delete next[row.key];
      else next[row.key] = row.amount;
      return next;
    });
  }

  function setAmount(row: Payable, value: number) {
    setChecked((prev) =>
      prev[row.key] === undefined ? prev : { ...prev, [row.key]: value },
    );
    if (row.kind === "other-fee") {
      setExtras((prev) =>
        prev.map((f) => (f.id === row.feeId ? { ...f, amount: value } : f)),
      );
    }
  }

  async function proceed() {
    setOrError("");
    try {
      const check = await apiGet<{ ok: boolean; error?: string; warning?: string }>(
        `/api/collection/or/check?number=${encodeURIComponent(orNumber)}&serial=${encodeURIComponent(orSerial)}`,
      );
      if (!check.ok) {
        setOrError(check.error ?? "That O.R. cannot be used");
        return;
      }
      if (check.warning && !confirm(`${check.warning}. Continue?`)) return;
      setPaying(true);
    } catch (err) {
      setOrError((err as Error).message);
    }
  }

  const focusedRow = rows.find((r) => r.key === focused) ?? null;
  const pickedRow = history?.find((p) => p.id === pickedPayment) ?? null;

  function openReceipt(number: string, serial: string) {
    window.open(
      `/collection/receipt?number=${encodeURIComponent(number)}&serial=${encodeURIComponent(serial ?? "")}`,
      "_blank",
    );
  }

  return (
    <div className="collection">
      <header className="collection-head">
        <div className="collection-account" ref={comboRef}>
          <label className="field-input">
            <span>Consumer</span>
            <div className="combo">
              <input
                value={comboOpen ? search : label || search}
                placeholder="Search by name or account number"
                onFocus={(e) => {
                  setComboOpen(true);
                  e.currentTarget.select();
                }}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setComboOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setComboOpen(false);
                }}
              />
              <button
                type="button"
                className="combo-caret"
                aria-label="Show accounts"
                onClick={() => setComboOpen((o) => !o)}
              >
                ▾
              </button>
            </div>
          </label>

          {comboOpen && (
            <ul className="account-matches">
              {(matches ?? []).map((m) => (
                <li key={m.id}>
                  <button
                    className={account?.id === m.id ? "picked" : ""}
                    onClick={() => {
                      setAccount(m);
                      setSearch(`${m.name} — ${m.accountNo}`);
                      setComboOpen(false);
                    }}
                  >
                    <span className="match-name">{m.name}</span>
                    <span className="match-no">{m.accountNo}</span>
                  </button>
                </li>
              ))}
              {matches?.length === 0 && <li className="count">No match.</li>}
              {matches && matches.length >= 50 && (
                <li className="count">
                  Showing the first 50 — type more to narrow it down.
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="collection-or">
          <label className="field-input">
            <span>Collection date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="field-input">
            <span>O.R. No.</span>
            <input
              className="or-number"
              value={orNumber}
              inputMode="numeric"
              onChange={(e) => setOrNumber(e.target.value.replace(/\s/g, ""))}
            />
          </label>
          <label className="field-input narrow">
            <span>Serial</span>
            <select value={orSerial} onChange={(e) => setOrSerial(e.target.value)}>
              {(orSettings?.serials ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="collection-balance">
          <span className="balance-label">Balance</span>
          <span className="balance-value">{peso.format(data?.balance ?? 0)}</span>
          {data && data.balance !== data.billsBalance && (
            <span className="balance-split">
              {peso.format(data.billsBalance)} in bills ·{" "}
              {peso.format(data.balance - data.billsBalance)} in fees
            </span>
          )}
        </div>
      </header>

      {orError && <div className="form-error">{orError}</div>}
      {notice && <div className="form-notice">{notice}</div>}

      <div className="collection-body">
        {/* ---- left: payables, collector, bill details ---- */}
        <div className="collection-main">
          <section className="payables">
            <div className="record-head">
              <h2>Payables</h2>
              <span className="count">Selected: {selectedKeys.length}</span>
            </div>

            {!account ? (
              <p className="count">Find a consumer to see what they owe.</p>
            ) : isLoading ? (
              <p className="count">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="count">Nothing outstanding on this account.</p>
            ) : (
              <table className="data-table payables-table">
                <thead>
                  <tr>
                    <th className="tick" />
                    <th>Nature</th>
                    <th>Bill Period</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const on = checked[row.key] !== undefined;
                    return (
                      <tr
                        key={row.key}
                        className={[
                          focused === row.key ? "focused" : "",
                          row.blocked ? "blocked" : "",
                          on ? "checked" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => setFocused(row.key)}
                      >
                        <td className="tick">
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={!!row.blocked}
                            onChange={() => toggle(row)}
                          />
                        </td>
                        <td>
                          {row.nature}
                          {row.blocked && (
                            <span className="blocked-why">{row.blocked}</span>
                          )}
                        </td>
                        <td className="period">{row.billPeriod ?? "—"}</td>
                        <td className="num">
                          {on && row.editable ? (
                            <div className="amount-cell">
                              <input
                                className={
                                  outOfRange(row, checked[row.key])
                                    ? "amount-input invalid"
                                    : "amount-input"
                                }
                                type="number"
                                step="0.01"
                                min={row.min}
                                max={row.max}
                                value={checked[row.key]}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  setAmount(row, Number(e.target.value))
                                }
                                onBlur={() =>
                                  setAmount(row, clampAmount(row, checked[row.key]))
                                }
                              />
                              <span className="amount-range">{rangeHint(row)}</span>
                            </div>
                          ) : (
                            peso.format(row.amount)
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <div className="collection-total">
              <div className="to-pay">
                <span>Amount to pay</span>
                <strong>{peso.format(total)}</strong>
              </div>
              <button
                className="primary big"
                disabled={
                  !account || selectedKeys.length === 0 || overCap.length > 0
                }
                onClick={proceed}
              >
                Proceed to payment
              </button>
            </div>

            {overCap.length > 0 && (
              <div className="form-error">
                {overCap.map((r) => (
                  <div key={r.key}>
                    {r.nature} must be between {peso.format(r.min)} and{" "}
                    {peso.format(r.max)}.
                  </div>
                ))}
              </div>
            )}

            {account && ((otherFees?.length ?? 0) > 0 || bulkOptions?.enabled) && (
              <div className="other-fee-buttons">
                {bulkOptions?.enabled && (
                  <button
                    className="clear-filters"
                    disabled={!!bulk}
                    onClick={() => setBulkOpen(true)}
                  >
                    Bulk Water
                  </button>
                )}
                {otherFees!.map((f) => (
                  <button
                    key={f.id}
                    className="clear-filters"
                    disabled={extras.some((x) => x.id === f.id)}
                    onClick={() => setExtras((prev) => [...prev, { ...f }])}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="record-section officer-card">
            <span className="field-label">Collection Officer</span>
            <span className="officer-name">
              {orSettings?.collector || "—"}
            </span>
          </section>

          <section className="record-section">
            <h2>Details</h2>
            {focusedRow ? (
              <table className="data-table detail-table">
                <tbody>
                  {focusedRow.detail.map((d) => (
                    <tr key={d.label}>
                      <td>{d.label}</td>
                      <td className="num">{d.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="count">Select a payable to see its details.</p>
            )}
          </section>
        </div>

        {/* ---- right: account details, payment history ---- */}
        <aside className="collection-side">
          {data?.account ? (
            <>
              <section className="record-section">
                <div className="record-head">
                  <h2>{data.account.name}</h2>
                  <span className={`badge status-card ${statusTone(data.account.statusId)}`}>
                    {data.account.status ?? "Unknown"}
                  </span>
                </div>

                <div className="fields tight">
                  <Field label="Account No" value={data.account.accountNo} />
                  <Field label="Barangay" value={data.account.barangay} />
                  <Field label="Cluster" value={data.account.cluster} />
                  <Field label="Street" value={data.account.streetAddress} />
                  <Field label="Meter No" value={data.account.meterNo} />
                  <Field label="Standpipe" value={data.account.standpipe} />
                  <Field label="Is Senior/PWD" value={data.account.isSenior} />
                </div>

                <SeniorId
                  acctId={data.account.id}
                  senior={isSenior(data.account.isSenior)}
                  value={data.account.seniorId}
                  onSaved={() =>
                    queryClient.invalidateQueries({
                      queryKey: ["collection-payables"],
                    })
                  }
                />

                <div className="remark-block">
                  <span className="field-label">Account remark</span>
                  {data.account.remark?.trim() ? (
                    <p>{data.account.remark}</p>
                  ) : (
                    <p className="muted">No remark.</p>
                  )}
                </div>
              </section>

              <section className="record-section">
                <div className="record-head">
                  <h2>Payment history</h2>
                  <button
                    className="clear-filters"
                    disabled={!pickedRow?.orNumber}
                    onClick={() =>
                      pickedRow && openReceipt(pickedRow.orNumber, pickedRow.orSerial)
                    }
                  >
                    View O.R.
                  </button>
                </div>

                {history?.length ? (
                  <>
                    <div className="history-scroll">
                      <table className="data-table history-table">
                        <thead>
                          <tr>
                            <th className="tick" />
                            <th>Description</th>
                            <th>Date</th>
                            <th>O.R.</th>
                            <th className="num">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((p) => (
                            <tr
                              key={p.id}
                              className={pickedPayment === p.id ? "checked" : ""}
                              onClick={() =>
                                setPickedPayment(p.orNumber ? p.id : null)
                              }
                            >
                              <td className="tick">
                                <input
                                  type="radio"
                                  name="payment-row"
                                  checked={pickedPayment === p.id}
                                  disabled={!p.orNumber}
                                  onChange={() => setPickedPayment(p.id)}
                                />
                              </td>
                              <td>{p.nature}</td>
                              <td>{(p.date ?? "").slice(0, 10)}</td>
                              <td>
                                {p.orNumber}
                                {p.orSerial ? ` (${p.orSerial})` : ""}
                              </td>
                              <td className="num">{peso.format(p.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="count">
                      Pick one row to reprint its O.R. — one receipt at a time.
                    </p>
                  </>
                ) : (
                  <p className="count">No payments on record.</p>
                )}
              </section>
            </>
          ) : (
            <section className="record-section">
              <p className="count">No consumer selected.</p>
            </section>
          )}
        </aside>
      </div>

      {bulkOpen && bulkOptions?.enabled && (
        <BulkWaterDialog
          options={bulkOptions}
          onClose={() => setBulkOpen(false)}
          onAdd={(line) => {
            setBulk(line);
            setBulkOpen(false);
          }}
        />
      )}

      {paying && account && data && (
        <PaymentDialog
          account={data.account}
          date={date}
          orNumber={orNumber}
          orSerial={orSerial}
          rows={rows.filter((r) => checked[r.key] !== undefined)}
          amounts={checked}
          onClose={() => setPaying(false)}
          onSaved={async () => {
            setPaying(false);
            setChecked({});
            setExtras([]);
            queryClient.invalidateQueries({ queryKey: ["collection-payables"] });
            queryClient.invalidateQueries({ queryKey: ["collection-history"] });
            // Explicitly fetched and applied directly — clearing the field
            // and relying on the [orSettings] effect to re-seed it from a
            // separately-invalidated refetch left it blank until a full
            // page reload in practice (the two didn't reliably land in the
            // same order every time), so this fetches the freshly-
            // incremented number itself and sets it deterministically.
            try {
              const fresh = await queryClient.fetchQuery<OrSettings>({
                queryKey: ["collection-or"],
                queryFn: () => apiGet<OrSettings>("/api/collection/or"),
              });
              setOrNumber(fresh.orNumber);
              setOrSerial(fresh.orSerial || fresh.serials[0] || "");
            } catch {
              // Best-effort — if this fails the clerk can still type the
              // number in by hand, same as any other blank-field case.
            }
          }}
        />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <span className="field-value">
        {value ? value : <span className="muted">—</span>}
      </span>
    </div>
  );
}

/**
 * The SC/PWD identification number, saved against the account. Only an account
 * already flagged as Senior/PWD may carry one — the discount comes from that
 * flag, and an ID on a regular account would be misleading in an audit.
 */
function SeniorId({
  acctId,
  senior,
  value,
  onSaved,
}: {
  acctId: number;
  senior: boolean;
  value: string | null;
  onSaved: () => void;
}) {
  const [text, setText] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setText(value ?? "");
    setSaved(false);
  }, [value, acctId]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/collection/accounts/${acctId}/senior-id`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seniorId: text }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Could not save the SC/PWD ID");
      }
      setSaved(true);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="senior-block">
      <label className="field-input">
        <span>SC/PWD ID #</span>
        <input
          value={text}
          disabled={!senior}
          placeholder={senior ? "Identification number" : "Not a Senior/PWD account"}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      <button
        className="clear-filters"
        disabled={!senior || saving || text === (value ?? "")}
        onClick={save}
      >
        {saving ? "Saving…" : saved ? "Saved" : "Save"}
      </button>
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}


/* ------------------------------------------------------------------ *
 * Bulk water
 * ------------------------------------------------------------------ */

type BulkLine = {
  rateId: number;
  typeName: string;
  units: number;
  chargeable: number;
  water: number;
  rangeId: number | null;
  rangeName: string | null;
  delivery: number;
};

/**
 * A bulk load is sold by the tanker, not through a meter. Pick-up and delivery
 * draw on different rate rows — bulkwaterrates.isdel marks which — and a
 * delivery adds a fee for the range it goes to.
 *
 * The figures here are a preview; the server prices the order again from the
 * same tables when the payment is saved.
 */
function BulkWaterDialog({
  options,
  onClose,
  onAdd,
}: {
  options: BulkOptions;
  onClose: () => void;
  onAdd: (line: BulkLine) => void;
}) {
  const [delivery, setDelivery] = useState(false);
  const [rateId, setRateId] = useState<number | null>(null);
  const [rangeId, setRangeId] = useState<number | null>(null);
  const [units, setUnits] = useState("1");

  const available = options.rates.filter((r) => r.forDelivery === delivery);
  const rate: BulkRate | undefined =
    available.find((r) => r.id === rateId) ?? available[0];
  const range = options.deliveryRanges.find((r) => r.id === rangeId)
    ?? options.deliveryRanges[0];

  const qty = Math.max(0, Math.trunc(Number(units) || 0));
  const chargeable = rate ? Math.max(qty, rate.minCubic) : 0;
  const water = rate ? Math.round(rate.rate * chargeable * 100) / 100 : 0;
  const deliveryFee = delivery && range ? range.rate : 0;
  const ready = !!rate && qty > 0 && (!delivery || !!range);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Bulk water</h2>

        {available.length === 0 ? (
          <p className="count">
            No {delivery ? "delivery" : "pick-up"} rates are set up. Add them
            under Settings.
          </p>
        ) : null}

        <div className="field-input" style={{ marginBottom: 14 }}>
          <span>How it is taken</span>
          <div className="bulk-toggle">
            <button
              className={!delivery ? "on" : ""}
              onClick={() => {
                setDelivery(false);
                setRateId(null);
              }}
            >
              For pick-up
            </button>
            <button
              className={delivery ? "on" : ""}
              onClick={() => {
                setDelivery(true);
                setRateId(null);
              }}
            >
              Delivery
            </button>
          </div>
        </div>

        <label className="field-input" style={{ marginBottom: 14 }}>
          <span>Rate</span>
          <select
            value={rate?.id ?? ""}
            onChange={(e) => setRateId(Number(e.target.value))}
          >
            {available.map((r) => (
              <option key={r.id} value={r.id}>
                {r.type} — {peso.format(r.rate)} each
                {r.minCubic > 1 ? ` (minimum ${r.minCubic})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="field-input" style={{ marginBottom: 14 }}>
          <span>How many</span>
          <input
            type="number"
            min={1}
            value={units}
            autoFocus
            onChange={(e) => setUnits(e.target.value)}
          />
          {rate && chargeable > qty && (
            <span className="setting-note">
              Charged for {chargeable} — the minimum for this rate.
            </span>
          )}
        </label>

        {delivery && (
          <label className="field-input" style={{ marginBottom: 14 }}>
            <span>Delivered to</span>
            <select
              value={range?.id ?? ""}
              onChange={(e) => setRangeId(Number(e.target.value))}
            >
              {options.deliveryRanges.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.range} — {peso.format(r.rate)}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="bulk-total">
          <div>
            <span>Water</span>
            <strong>{peso.format(water)}</strong>
          </div>
          {delivery && (
            <div>
              <span>Delivery</span>
              <strong>{peso.format(deliveryFee)}</strong>
            </div>
          )}
          <div className="grand">
            <span>Total</span>
            <strong>{peso.format(water + deliveryFee)}</strong>
          </div>
        </div>

        <div className="form-actions">
          <button
            className="primary"
            disabled={!ready}
            onClick={() =>
              rate &&
              onAdd({
                rateId: rate.id,
                typeName: rate.type,
                units: qty,
                chargeable,
                water,
                rangeId: delivery && range ? range.id : null,
                rangeName: delivery && range ? range.range : null,
                delivery: deliveryFee,
              })
            }
          >
            Add to payables
          </button>
          <button className="clear-filters" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
