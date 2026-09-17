import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import DOMPurify from "dompurify";
import { peso } from "./collectionTypes";

/**
 * Settings, laid out in the same groups as the desktop's Settings dialog so an
 * administrator finds things where they expect them.
 *
 * Each entry says honestly what state it is in. A screen is only marked ready
 * once the table behind it has been confirmed — guessing a column name is how
 * a save throws at the worst possible moment.
 */

/* ==================================================================== *
 * The Settings shell
 *
 * Four areas, ordered by what a change in them can break — not by which
 * desktop button they came from. The old layout copied the desktop's button
 * grid faithfully, which meant twenty-seven entries all carrying a "Ready"
 * badge that stopped meaning anything once everything was ready.
 *
 * The tag on each row is the useful signal instead: it says what a change
 * there actually reaches.
 * ==================================================================== */

type Panel =
  | "other-fees" | "schema" | "logos" | "profile" | "rates" | "tariffs"
  | "fees" | "people" | "classification" | "bulk" | "sizes"
  | "consumer-types" | "addresses" | "readers" | "or-counter"
  | "batch-reading" | "notice" | "batch-bills" | "account-series" | "backup";

/** What a change on this row reaches. */
type Tag =
  | "future-bills" | "new-charges" | "print" | "lists" | "access" | "job" | "todo";

const TAG_LABEL: Record<Tag, string> = {
  "future-bills": "Future bills",
  "new-charges": "New charges",
  print: "Print only",
  lists: "Lists",
  access: "Access",
  job: "Job",
  todo: "Not built",
};

type Entry = { label: string; note: string; tag: Tag; panel?: Panel };
type Area = { key: string; title: string; blurb: string; entries: Entry[] };

const AREAS: Area[] = [
  {
    key: "municipality",
    title: "Municipality",
    blurb: "Who you are, and how a bill is timed",
    entries: [
      {
        label: "Municipal profile",
        note: "Header on every bill and receipt, the computation rules, what carries forward",
        tag: "future-bills",
        panel: "profile",
      },
      {
        label: "Office logos",
        note: "The municipal seal and the waterworks seal, as the bill prints them",
        tag: "print",
        panel: "logos",
      },
      {
        label: "Disconnection notice",
        note: "The Tagalog notice stamped onto a bill that is far enough behind",
        tag: "print",
        panel: "notice",
      },
    ],
  },
  {
    key: "money",
    title: "Money",
    blurb: "Everything that decides an amount",
    entries: [
      {
        label: "Rate methods",
        note: "The tariff tables themselves, per classification and meter size",
        tag: "future-bills",
        panel: "rates",
      },
      {
        label: "Area tariffs",
        note: "Which method a barangay uses, and from when",
        tag: "future-bills",
        panel: "tariffs",
      },
      {
        label: "Bulk water rates",
        note: "Priced on their own, never from a classification's brackets",
        tag: "future-bills",
        panel: "bulk",
      },
      {
        label: "Application fee",
        note: "Full fee per meter size, the type discounts, the installment rule",
        tag: "new-charges",
        panel: "fees",
      },
      {
        label: "Service fees",
        note: "Reconnection, transfers, replacement, hydrant",
        tag: "new-charges",
        panel: "fees",
      },
      {
        label: "Other fees",
        note: "The extra buttons at the counter",
        tag: "new-charges",
        panel: "other-fees",
      },
    ],
  },
  {
    key: "reference",
    title: "Reference lists",
    blurb: "The vocabulary the rest of the app picks from",
    entries: [
      {
        label: "Barangays and clusters",
        note: "With the codes that go into an account number",
        tag: "lists",
        panel: "addresses",
      },
      {
        label: "Classifications",
        note: "What a bill prices against",
        tag: "lists",
        panel: "classification",
      },
      {
        label: "Meter sizes",
        note: "Every fee table and every rate bracket is keyed on one",
        tag: "lists",
        panel: "sizes",
      },
      {
        label: "Consumer types",
        note: "Each with its application-fee discount",
        tag: "lists",
        panel: "consumer-types",
      },
      {
        label: "Meter readers",
        note: "Who reads the meters",
        tag: "lists",
        panel: "readers",
      },
      {
        label: "Collecting officer and signatories",
        note: "The name on every O.R., and who prepares, checks and approves a report",
        tag: "lists",
        panel: "people",
      },
    ],
  },
  {
    key: "tools",
    title: "Data tools",
    blurb: "Jobs, not settings — each one shows what it will do first",
    entries: [
      {
        label: "Account numbers",
        note: "The running series each new account number is taken from",
        tag: "job",
        panel: "account-series",
      },
      {
        label: "O.R. next number",
        note: "Where each clerk's booklet has got to",
        tag: "job",
        panel: "or-counter",
      },
      {
        label: "Batch reading update",
        note: "Move the meter reference a run of accounts will bill from",
        tag: "job",
        panel: "batch-reading",
      },
      {
        label: "Batch bill details update",
        note: "Correct the dates on a run of bills, or move them to the right month",
        tag: "job",
        panel: "batch-bills",
      },
      {
        label: "Inspect a table",
        note: "What columns a table really has, when something needs checking",
        tag: "job",
        panel: "schema",
      },
      {
        label: "Back up now",
        note: "An on-the-spot copy of the whole database, on top of the nightly one",
        tag: "job",
        panel: "backup",
      },
      {
        label: "Import from Excel",
        note: "Accounts, bills, O.R., payments",
        tag: "todo",
      },
      {
        label: "Account number regeneration",
        note: "Destructive — wants a preview before anything is written",
        tag: "todo",
      },
    ],
  },
];

export default function SettingsPage() {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [area, setArea] = useState<string>("overview");

  const { data: profile } = useQuery<{ municipality: string }>({
    queryKey: ["municipal-profile"],
    queryFn: () => apiGet("/api/settings/municipal-profile"),
  });

  const close = () => setPanel(null);
  const shown = area === "overview" ? AREAS : AREAS.filter((a) => a.key === area);

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Settings</h1>
          <p className="account-no">
            Four areas, ordered by what a change here can break.
          </p>
        </div>
      </div>

      <div className="settings-shell">
        <nav className="settings-rail">
          <span className="rail-heading">Areas</span>
          <button
            className={area === "overview" ? "rail-item current" : "rail-item"}
            onClick={() => {
              setArea("overview");
              close();
            }}
          >
            Overview
          </button>
          {AREAS.map((a) => (
            <button
              key={a.key}
              className={area === a.key ? "rail-item current" : "rail-item"}
              onClick={() => {
                setArea(a.key);
                close();
              }}
            >
              {a.title}
            </button>
          ))}
          {profile?.municipality && (
            <span className="rail-foot">
              Municipality of {profile.municipality}
            </span>
          )}
        </nav>

        <div className="settings-main">
          {/* A panel REPLACES the cards rather than stacking above them —
              opening one used to leave all four areas sitting underneath, so
              on a short window nothing looked like it had happened. */}
          {panel ? (
            <>
              {panel === "other-fees" && <OtherFeesPanel onClose={close} />}
              {panel === "schema" && <SchemaPanel onClose={close} />}
              {panel === "logos" && <LogosPanel onClose={close} />}
              {panel === "profile" && <ProfilePanel onClose={close} />}
              {panel === "rates" && <RateMethodsPanel onClose={close} />}
              {panel === "tariffs" && <TariffsPanel onClose={close} />}
              {panel === "fees" && <FeesPanel onClose={close} />}
              {panel === "people" && <PeoplePanel onClose={close} />}
              {panel === "classification" && <ClassificationsPanel onClose={close} />}
              {panel === "bulk" && <BulkRatesPanel onClose={close} />}
              {panel === "sizes" && <MeterSizesPanel onClose={close} />}
              {panel === "consumer-types" && <ConsumerTypesPanel onClose={close} />}
              {panel === "addresses" && <AddressPanel onClose={close} />}
              {panel === "readers" && <MeterReadersPanel onClose={close} />}
              {panel === "or-counter" && <OrCounterPanel onClose={close} />}
              {panel === "batch-reading" && <BatchReadingPanel onClose={close} />}
              {panel === "notice" && <NoticePanel onClose={close} />}
              {panel === "batch-bills" && <BatchBillsPanel onClose={close} />}
              {panel === "account-series" && <AccountSeriesPanel onClose={close} />}
              {panel === "backup" && <BackupPanel onClose={close} />}
            </>
          ) : (
            <div className={area === "overview" ? "area-grid" : "area-grid single"}>
              {shown.map((a) => (
                <section className="record-section area-card" key={a.key}>
                  <header className="area-head">
                    <h2>{a.title}</h2>
                    <span className="area-blurb">{a.blurb}</span>
                  </header>
                  <ul className="area-list">
                    {a.entries.map((entry) => (
                      <li key={entry.label}>
                        <button
                          className="area-row"
                          disabled={!entry.panel}
                          onClick={() => entry.panel && setPanel(entry.panel)}
                        >
                          <span className="area-row-text">
                            <span className="area-label">{entry.label}</span>
                            <span className="area-note">{entry.note}</span>
                          </span>
                          <span className={`tag tag-${entry.tag}`}>
                            {TAG_LABEL[entry.tag]}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {!panel && <RecentChanges area={area} />}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- *
 * Recent changes
 *
 * A settings change used to leave no trace at all — an area tariff switch
 * rewrites every future bill for a barangay, and nothing recorded who did it
 * or what it was before. This is the read side of that.
 * -------------------------------------------------------------------- */

type LogEntry = {
  id: number;
  at: string;
  who: string;
  area: string;
  item: string;
  field: string;
  from: string | null;
  to: string | null;
  details: string;
};

const AREA_TITLE: Record<string, string> = Object.fromEntries(
  AREAS.map((a) => [a.key, a.title]),
);

function RecentChanges({ area }: { area: string }) {
  const title = area === "overview" ? "" : AREA_TITLE[area] ?? "";

  const { data, isLoading } = useQuery<{ available: boolean; entries: LogEntry[] }>({
    queryKey: ["settings-log", title],
    queryFn: () =>
      apiGet(
        `/api/settings/log?limit=12${title ? `&area=${encodeURIComponent(title)}` : ""}`,
      ),
  });

  if (isLoading) return null;

  return (
    <section className="record-section changes-card">
      <header className="area-head">
        <h2>Recent changes</h2>
        <span className="area-blurb">
          {data?.available
            ? "What was changed here, and by whom"
            : "Not switched on yet"}
        </span>
      </header>

      {!data?.available ? (
        <p className="count">
          Settings changes are not being recorded. Run{" "}
          <code>settingslog.sql</code> against this database and they will start
          appearing here — nothing else needs changing.
        </p>
      ) : data.entries.length === 0 ? (
        <p className="count">
          Nothing changed{title ? ` under ${title}` : ""} yet.
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>What changed</th>
              <th>From → to</th>
              <th>Who</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e) => (
              <tr key={e.id}>
                <td>
                  {e.item}
                  {e.field && <span className="change-field"> · {e.field}</span>}
                </td>
                <td className="change-values">
                  {e.details ? (
                    e.details
                  ) : (
                    <>
                      <span className="change-from">{e.from ?? "—"}</span>
                      {" → "}
                      <span className="change-to">{e.to ?? "removed"}</span>
                    </>
                  )}
                </td>
                <td>{e.who || <span className="muted">—</span>}</td>
                <td className="change-when">{whenLabel(e.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function whenLabel(at: string) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleString("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ------------------------------------------------------------------ *
 * Other fees
 * ------------------------------------------------------------------ */

type Fee = { id: number; name: string; amount: number; editable: boolean };

function OtherFeesPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Fee | "new" | null>(null);

  const { data: fees, isLoading } = useQuery<Fee[]>({
    queryKey: ["settings-other-fees"],
    queryFn: () => apiGet<Fee[]>("/api/settings/other-fees"),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["settings-other-fees"] });
    queryClient.invalidateQueries({ queryKey: ["collection-other-fees"] });
  }

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Other fees</h2>
        <div className="head-actions">
          <button className="primary" onClick={() => setEditing("new")}>
            Add fee
          </button>
          <button className="clear-filters" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <p className="count">
        These appear as buttons on the Collection screen. A fee marked
        changeable lets the clerk type an amount at the counter; otherwise the
        amount here is what gets charged.
      </p>

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : !fees?.length ? (
        <p className="count">No other fees are set up.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Fee</th>
              <th className="num">Amount</th>
              <th>Clerk may change</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {fees.map((f) => (
              <tr key={f.id}>
                <td>{f.name}</td>
                <td className="num">{peso.format(f.amount)}</td>
                <td>{f.editable ? "Yes" : "No"}</td>
                <td className="num">
                  <button className="link-button" onClick={() => setEditing(f)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <FeeEditor
          fee={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function FeeEditor({
  fee,
  onClose,
  onSaved,
}: {
  fee: Fee | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(fee?.name ?? "");
  const [amount, setAmount] = useState(String(fee?.amount ?? ""));
  const [editable, setEditable] = useState(fee?.editable ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = { name, amount: Number(amount || 0), editable };
      if (fee) {
        const response = await fetch(`/api/settings/other-fees/${fee.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const b = await response.json().catch(() => null);
          throw new Error(b?.error ?? "Could not save the fee");
        }
      } else {
        await apiPost("/api/settings/other-fees", body);
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!fee) return;
    if (!confirm(`Remove "${fee.name}"? Payments already taken keep their name.`))
      return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/settings/other-fees/${fee.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const b = await response.json().catch(() => null);
        throw new Error(b?.error ?? "Could not remove the fee");
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">{fee ? "Edit fee" : "New fee"}</h2>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Name</span>
          <input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="As it should read on the receipt"
          />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Amount</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <label className="toolbar-check">
          <input
            type="checkbox"
            checked={editable}
            onChange={(e) => setEditable(e.target.checked)}
          />
          The clerk may change the amount at the counter
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button
            className="primary"
            disabled={saving || !name.trim()}
            onClick={save}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          {fee && (
            <>
              <div style={{ flexGrow: 1 }} />
              <button className="danger small" onClick={remove} disabled={saving}>
                Remove
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Table inspector
 * ------------------------------------------------------------------ */

type Column = {
  name: string;
  type: string;
  nullable: boolean;
  key: string | null;
  default: unknown;
  extra: string | null;
};

const SUGGESTED = [
  "munlist",
  "applicationfeesettings",
  "ratemethods",
  "areatariff",
  "classifications",
  "meterreader",
  "systemroles",
  "tblorgroup",
];

function SchemaPanel({ onClose }: { onClose: () => void }) {
  const [table, setTable] = useState("munlist");
  const [asked, setAsked] = useState("munlist");

  const { data, isLoading, error } = useQuery<{ table: string; columns: Column[] }>({
    queryKey: ["settings-schema", asked],
    enabled: asked !== "",
    queryFn: () =>
      apiGet<{ table: string; columns: Column[] }>(
        `/api/settings/schema?table=${encodeURIComponent(asked)}`,
      ),
  });

  const { data: values } = useQuery<{ rows: Record<string, unknown>[] }>({
    queryKey: ["settings-values", asked],
    enabled: asked !== "",
    retry: false,
    queryFn: () =>
      apiGet<{ rows: Record<string, unknown>[] }>(
        `/api/settings/values?table=${encodeURIComponent(asked)}`,
      ),
  });

  const first = values?.rows?.[0];

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Inspect a table</h2>
        <button className="clear-filters" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="schema-bar">
        <label className="field-input">
          <span>Table</span>
          <input
            value={table}
            onChange={(e) => setTable(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setAsked(table.trim());
            }}
          />
        </label>
        <button className="primary" onClick={() => setAsked(table.trim())}>
          Inspect
        </button>
      </div>

      <div className="schema-suggest">
        {SUGGESTED.map((t) => (
          <button
            key={t}
            className="clear-filters"
            onClick={() => {
              setTable(t);
              setAsked(t);
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : error ? (
        <div className="form-error">{(error as Error).message}</div>
      ) : data ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Column</th>
              <th>Type</th>
              <th>Null</th>
              <th>Key</th>
              <th>Current value</th>
            </tr>
          </thead>
          <tbody>
            {data.columns.map((c) => (
              <tr key={c.name}>
                <td>
                  <code>{c.name}</code>
                </td>
                <td>{c.type}</td>
                <td>{c.nullable ? "yes" : "no"}</td>
                <td>{c.key ?? ""}</td>
                <td className="schema-value">
                  {first === undefined
                    ? ""
                    : first[c.name] === null || first[c.name] === undefined
                      ? "—"
                      : String(first[c.name])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <p className="count">
        "Current value" is the first row, shown for configuration tables only.
      </p>
    </section>
  );
}


/* ------------------------------------------------------------------ *
 * Office logos
 * ------------------------------------------------------------------ */

type LogoKey = "municipal" | "office";

type LogoState = {
  municipalityId: number;
  municipality: string | null;
  municipal: { present: boolean; bytes: number };
  office: { present: boolean; bytes: number };
};

const LOGO_LABEL: Record<LogoKey, { title: string; note: string }> = {
  municipal: {
    title: "Municipal seal",
    note: "Prints on the left of the bill header.",
  },
  office: {
    title: "Waterworks office seal",
    note: "Prints on the right of the bill header.",
  },
};

/**
 * Both logos live in munlist as longblobs, so they follow the database rather
 * than a file on one machine — which is what lets every report use them and a
 * second municipality carry its own.
 */
function LogosPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<LogoState>({
    queryKey: ["settings-logos"],
    queryFn: () => apiGet<LogoState>("/api/settings/logos"),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["settings-logos"] });
  }

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Office logos</h2>
        <button className="clear-filters" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="count">
        Held in the database against {data?.municipality ?? "this municipality"},
        so every bill and report picks them up and nothing has to be copied to
        each machine. <b>Whichever logos are uploaded are the ones that print</b> —
        upload one for a single seal, both for a pair.
      </p>

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : (
        <div className="logo-slots">
          {(["municipal", "office"] as LogoKey[]).map((which) => (
            <LogoSlot
              key={which}
              which={which}
              present={data?.[which].present ?? false}
              bytes={data?.[which].bytes ?? 0}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function LogoSlot({
  which,
  present,
  bytes,
  onChanged,
}: {
  which: LogoKey;
  present: boolean;
  bytes: number;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Bumped after a save so the <img> refetches rather than showing the old one.
  const [stamp, setStamp] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      // The raw bytes, not base64 — the endpoint takes image/* directly.
      const response = await fetch(`/api/settings/logo/${which}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) {
        const b = await response.json().catch(() => null);
        throw new Error(b?.error ?? "Could not save the logo");
      }
      setStamp(Date.now());
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!confirm(`Remove the ${LOGO_LABEL[which].title.toLowerCase()}?`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/settings/logo/${which}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const b = await response.json().catch(() => null);
        throw new Error(b?.error ?? "Could not remove the logo");
      }
      setStamp(Date.now());
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="logo-slot">
      <div className="logo-frame">
        {present ? (
          <img
            src={`/api/settings/logo/${which}?v=${stamp}`}
            alt={LOGO_LABEL[which].title}
          />
        ) : (
          <span className="logo-empty">Nothing uploaded</span>
        )}
      </div>

      <div className="logo-meta">
        <b>{LOGO_LABEL[which].title}</b>
        <span className="count">{LOGO_LABEL[which].note}</span>
        {present && (
          <span className="count">{Math.round(bytes / 1024).toLocaleString()} KB on file</span>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="logo-actions">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
        />
        <button
          className="primary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Working…" : present ? "Replace" : "Upload"}
        </button>
        {present && (
          <button className="clear-filters" disabled={busy} onClick={remove}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ *
 * Municipal profile
 * ------------------------------------------------------------------ */

type Profile = {
  id: number;
  municipality: string;
  officeName: string;
  officeAddress: string;
  officeContact: string;
  officeAbbr: string;
  agency: string;
  municipalHeader: string;
  officeHeader: string;
  rateType: number;
  enableCluster: number;
  orderType: number;
  billType: string;
  maintenanceEnabled: number;
  accountGenType: number;
  enableBulk: number;
  arrearsForDisconnection: number;
  readListItemsPerPage: number;
  includePreviousBill: number;
  includeCurrentBill: number;
  includePreviousAppFee: number;
  includeCurrentAppFee: number;
  partialPaymentEnabled: number;
};

/**
 * Everything here lives in munlist. The reading module reads the same row, so
 * a change made here is what the next bill run uses — which is why the
 * computation block carries a warning rather than sitting quietly beside the
 * office address.
 */
function ProfilePanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery<Profile>({
    queryKey: ["municipal-profile"],
    queryFn: () => apiGet<Profile>("/api/settings/municipal-profile"),
  });

  const value = draft ?? data ?? null;

  function set<K extends keyof Profile>(key: K, v: Profile[K]) {
    if (!value) return;
    setDraft({ ...value, [key]: v });
  }

  const changed = draft !== null && data !== undefined
    ? (Object.keys(draft) as (keyof Profile)[]).filter((k) => draft[k] !== data[k])
    : [];

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/settings/municipal-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) {
        const b = await response.json().catch(() => null);
        throw new Error(b?.error ?? "Could not save the profile");
      }
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["municipal-profile"] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !value) {
    return (
      <section className="record-section settings-panel">
        <p className="count">Loading the municipal profile…</p>
      </section>
    );
  }

  const text = (label: string, key: keyof Profile, hint?: string) => (
    <label className="field-input" key={key}>
      <span>{label}</span>
      <input
        value={String(value[key] ?? "")}
        onChange={(e) => set(key, e.target.value as Profile[typeof key])}
      />
      {hint && <span className="setting-note">{hint}</span>}
    </label>
  );

  const number = (label: string, key: keyof Profile, hint?: string) => (
    <label className="field-input" key={key}>
      <span>{label}</span>
      <input
        type="number"
        value={Number(value[key] ?? 0)}
        onChange={(e) => set(key, Number(e.target.value) as Profile[typeof key])}
      />
      {hint && <span className="setting-note">{hint}</span>}
    </label>
  );

  const choice = (
    label: string,
    key: keyof Profile,
    options: { value: number; label: string }[],
    hint?: string,
  ) => (
    <label className="field-input" key={key}>
      <span>{label}</span>
      <select
        value={Number(value[key] ?? 0)}
        onChange={(e) => set(key, Number(e.target.value) as Profile[typeof key])}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className="setting-note">{hint}</span>}
    </label>
  );

  const flag = (label: string, key: keyof Profile) => (
    <label className="toolbar-check" key={key}>
      <input
        type="checkbox"
        checked={Number(value[key]) === 1}
        onChange={(e) => set(key, (e.target.checked ? 1 : 0) as Profile[typeof key])}
      />
      {label}
    </label>
  );

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Municipal profile</h2>
        <button className="clear-filters" onClick={onClose}>
          Close
        </button>
      </div>

      <h3 className="profile-head">Identity</h3>
      <p className="count">Printed at the top of every bill and receipt.</p>
      <div className="profile-grid">
        {text("Municipality", "municipality")}
        {text("Abbreviation", "officeAbbr")}
        {text("Agency (on the O.R.)", "agency")}
        {text("Header line 1", "municipalHeader", "e.g. Municipality of Rizal, Palawan")}
        {text("Header line 2", "officeHeader", "e.g. Municipal Economic Enterprise and Development Office")}
        {text("Water system name", "officeName")}
        {text("Office address", "officeAddress")}
        {text("Contact line", "officeContact")}
      </div>

      <h3 className="profile-head">Reading and billing</h3>
      <div className="profile-grid">
        {number("Months in arrears first", "arrearsForDisconnection",
          "Before an account is listed for disconnection")}
        {number("Reading list page size", "readListItemsPerPage",
          "Desktop only — the web reading list is one scrolling grid and never pages")}
        {choice("Reading order", "orderType", [
          { value: 1, label: "Standpipe" },
          { value: 2, label: "Sequence" },
          { value: 3, label: "Name" },
        ])}
        {text("Bill type", "billType")}
      </div>

      <h3 className="profile-head">Computation</h3>
      <div className="profile-grid">
        {choice("Rate type", "rateType", [
          { value: 1, label: "Bracketed" },
          { value: 2, label: "Direct" },
        ], "Passed to CalcRate as ratetype")}
        {choice("Areas are", "enableCluster", [
          { value: 1, label: "Clusters" },
          { value: 0, label: "Barangays" },
        ], "How a reading run is grouped")}
        {choice("Account number series", "accountGenType", [
          { value: 1, label: "Per municipality — one series only" },
          { value: 2, label: "Per barangay" },
          { value: 3, label: "Per cluster" },
        ], "Decides how many running series Account Numbers keeps. Changing it does not renumber anything that already exists.")}
      </div>

      <div className="profile-flags">
        <div>
          <span className="field-label">Charges</span>
          {flag("Charge the water meter maintenance fee", "maintenanceEnabled")}
          {flag("Bulk water is sold here", "enableBulk")}
          {flag("Allow partial payment of a bill", "partialPaymentEnabled")}
        </div>
        <div>
          <span className="field-label">Carried forward onto a new bill</span>
          {flag("Previous unpaid bills", "includePreviousBill")}
          {flag("Previous installment fees", "includePreviousAppFee")}
          {flag("Current month's bill", "includeCurrentBill")}
          {flag("Current installment fee", "includeCurrentAppFee")}
        </div>
      </div>

      <div className="form-notice" style={{ marginTop: 16 }}>
        <b>Rate type is the one to be sure about.</b> Bracketed and Direct return
        different amounts from the same tariff table, so changing it changes
        every bill generated afterwards. Bills already issued are untouched.
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="form-actions" style={{ marginTop: 14 }}>
        <button
          className="primary"
          disabled={saving || changed.length === 0}
          onClick={save}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          className="clear-filters"
          disabled={saving || changed.length === 0}
          onClick={() => setDraft(null)}
        >
          Discard
        </button>
        <span className="count">
          {changed.length === 0
            ? "No unsaved changes."
            : `${changed.length} unsaved change${changed.length === 1 ? "" : "s"}.`}
        </span>
      </div>
    </section>
  );
}


/* ------------------------------------------------------------------ *
 * Rate methods and their brackets
 * ------------------------------------------------------------------ */

type RateMethod = {
  id: number;
  name: string;
  ordinance: string;
  classCount: number;
  bracketCount: number;
  areaCount: number;
};

type Coverage = {
  classifications: { id: number; name: string }[];
  meterSizes: { id: number; name: string }[];
  priced: { classId: number; sizeId: number; brackets: number }[];
};

type Bracket = { id?: number; rate: number; isMinimum: boolean; cubits: number };

/**
 * How a band reads, and what the number in each row means.
 *
 * The minimum row's number is the LAST cubic metre the minimum charge
 * covers, so 10 reads "0 to 10" — 0 is deliberate, matching CalcRate's own
 * `cubic <= mincub` check, which includes an account that used nothing.
 * Every row after it holds the FIRST cubic metre of its own band, and where
 * it ends is whatever the next row starts at, less one. The top row is
 * always open-ended, so its own number is only ever a starting point — which
 * is why 10 / 11 / 21 / 31 reads as clean tens rather than the "11 to 11"
 * the old ceiling reading produced.
 */
function bandLabel(rows: Bracket[], i: number) {
  const sorted = [...rows].sort((a, b) => a.cubits - b.cubits);
  const row = sorted[i];
  if (!row) return "";
  if (i === 0) return `0 to ${row.cubits}`;
  const next = sorted[i + 1];
  return next ? `${row.cubits} to ${next.cubits - 1}` : `${row.cubits} and above`;
}

/** What the number column means for this row — it changes after the first. */
function bandColumn(i: number) {
  return i === 0 ? "Up to (m³)" : "From (m³)";
}

function RateMethodsPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<RateMethod | "new" | null>(null);

  const { data: methods, isLoading } = useQuery<RateMethod[]>({
    queryKey: ["rate-methods"],
    queryFn: () => apiGet<RateMethod[]>("/api/settings/rate-methods"),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["rate-methods"] });
  }

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Rate methods</h2>
        <div className="head-actions">
          <button className="primary" onClick={() => setEditing("new")}>
            New method
          </button>
          <button className="clear-filters" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <p className="count">
        Each method is one ordinance's tariff table. Barangays point at a method
        from a chosen month onward, so adding a method changes nothing until an
        area tariff sends traffic to it.
      </p>

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Method</th>
              <th>Ordinance</th>
              <th className="num">Classes priced</th>
              <th className="num">Brackets</th>
              <th className="num">Used by</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(methods ?? []).map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{m.ordinance || <span className="muted">—</span>}</td>
                <td className="num">{m.classCount}</td>
                <td className="num">{m.bracketCount}</td>
                <td className="num">
                  {m.areaCount === 0 ? (
                    <span className="muted">nothing</span>
                  ) : (
                    `${m.areaCount} tariff row${m.areaCount === 1 ? "" : "s"}`
                  )}
                </td>
                <td className="num">
                  <button className="link-button" onClick={() => setSelected(m.id)}>
                    Rates
                  </button>{" "}
                  <button className="link-button" onClick={() => setEditing(m)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected !== null && (
        <BracketEditor
          methodId={selected}
          methodName={methods?.find((m) => m.id === selected)?.name ?? ""}
          onClose={() => {
            setSelected(null);
            refresh();
          }}
        />
      )}

      {editing && (
        <MethodEditor
          method={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function MethodEditor({
  method,
  onClose,
  onSaved,
}: {
  method: RateMethod | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(method?.name ?? "");
  const [ordinance, setOrdinance] = useState(method?.ordinance ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = { name, ordinance };
      if (method) {
        const r = await fetch(`/api/settings/rate-methods/${method.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not save");
      } else {
        await apiPost("/api/settings/rate-methods", body);
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!method) return;
    if (!confirm(`Remove "${method.name}" and its ${method.bracketCount} bracket(s)?`)) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/settings/rate-methods/${method.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not remove");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{method ? "Edit rate method" : "New rate method"}</h2>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Method name</span>
          <input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="New Rate - 3rd Phase - Jul 2027"
          />
        </label>

        <label className="field-input">
          <span>Ordinance #</span>
          <input value={ordinance} onChange={(e) => setOrdinance(e.target.value)} />
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="primary" disabled={busy || !name.trim()} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {method && (
            <>
              <div style={{ flexGrow: 1 }} />
              <button className="danger small" onClick={remove} disabled={busy}>
                Remove
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BracketEditor({
  methodId,
  methodName,
  onClose,
}: {
  methodId: number;
  methodName: string;
  onClose: () => void;
}) {
  const [classId, setClassId] = useState<number | null>(null);
  const [sizeId, setSizeId] = useState<number | null>(null);
  const [rows, setRows] = useState<Bracket[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const { data: coverage } = useQuery<Coverage>({
    queryKey: ["rate-coverage", methodId],
    queryFn: () => apiGet<Coverage>(`/api/settings/rate-methods/${methodId}/coverage`),
  });

  const cls = classId ?? coverage?.classifications[0]?.id ?? null;
  const size = sizeId ?? coverage?.meterSizes[0]?.id ?? null;

  const { data: loaded } = useQuery<Bracket[]>({
    queryKey: ["rate-brackets", methodId, cls, size],
    enabled: cls !== null && size !== null,
    queryFn: () =>
      apiGet<Bracket[]>(
        `/api/settings/rate-methods/${methodId}/rates?classId=${cls}&sizeId=${size}`,
      ),
  });

  const working = rows ?? loaded ?? [];
  const sorted = [...working].sort((a, b) => a.cubits - b.cubits);

  function edit(i: number, patch: Partial<Bracket>) {
    const next = [...sorted];
    next[i] = { ...next[i], ...patch };
    setRows(next);
    setSaved(false);
  }

  async function save() {
    if (cls === null || size === null) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/settings/rate-methods/${methodId}/rates`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: cls, sizeId: size, rows: sorted }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not save");
      setRows(null);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const pricedCount = (c: number, s: number) =>
    coverage?.priced.find((p) => p.classId === c && p.sizeId === s)?.brackets ?? 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal bracket-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">{methodName} — rates</h2>
        <p className="modal-sub">
          Brackets are per classification and meter size. Editing one combination
          leaves the others alone.
        </p>

        <div className="bracket-pickers">
          <label className="field-input">
            <span>Classification</span>
            <select
              value={cls ?? ""}
              onChange={(e) => {
                setClassId(Number(e.target.value));
                setRows(null);
                setSaved(false);
              }}
            >
              {(coverage?.classifications ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {size !== null && pricedCount(c.id, size) === 0 ? " — not priced" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="field-input">
            <span>Meter size</span>
            <select
              value={size ?? ""}
              onChange={(e) => {
                setSizeId(Number(e.target.value));
                setRows(null);
                setSaved(false);
              }}
            >
              {(coverage?.meterSizes ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {cls !== null && pricedCount(cls, m.id) === 0 ? " — not priced" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <table className="data-table bracket-table">
          <thead>
            <tr>
              <th>Band</th>
              <th className="num">m³</th>
              <th className="num">Rate</th>
              <th>Minimum charge</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.id ?? `new-${i}`}>
                <td>
                  {bandLabel(sorted, i)}
                  <div className="setting-note">{bandColumn(i)}</div>
                </td>
                <td className="num">
                  <input
                    className="amount-input"
                    type="number"
                    min={i === 0 ? 1 : 0}
                    value={r.cubits}
                    onChange={(e) => edit(i, { cubits: Number(e.target.value) })}
                  />
                </td>
                <td className="num">
                  <input
                    className="amount-input"
                    type="number"
                    step="0.01"
                    min={0}
                    value={r.rate}
                    onChange={(e) => edit(i, { rate: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="radio"
                    name="minimum-row"
                    checked={r.isMinimum}
                    onChange={() => {
                      setRows(sorted.map((x, j) => ({ ...x, isMinimum: j === i })));
                      setSaved(false);
                    }}
                  />
                </td>
                <td className="num">
                  <button
                    className="link-button"
                    onClick={() => {
                      setRows(sorted.filter((_, j) => j !== i));
                      setSaved(false);
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="count">
                  Nothing priced for this combination yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <button
          className="clear-filters"
          onClick={() => {
            // A new band begins where the one below it ends: the first row's
            // number is a ceiling, so +1; later rows already hold a start, and
            // the smallest sensible next start is one above.
            const top = sorted.at(-1);
            setRows([
              ...sorted,
              {
                cubits: (top?.cubits ?? 0) + 1,
                rate: 0,
                isMinimum: sorted.length === 0,
              },
            ]);
            setSaved(false);
          }}
        >
          Add band
        </button>

        {error && <div className="form-error">{error}</div>}

        <div className="form-notice" style={{ marginTop: 14 }}>
          These rates apply to bills generated from now on, for every barangay
          whose live tariff points at this method. Bills already issued keep the
          amounts they were billed at.
        </div>

        <div className="form-actions">
          <button className="primary" disabled={busy || rows === null} onClick={save}>
            {busy ? "Saving…" : saved ? "Saved" : "Save brackets"}
          </button>
          <button
            className="clear-filters"
            disabled={busy || rows === null}
            onClick={() => {
              setRows(null);
              setSaved(false);
            }}
          >
            Discard
          </button>
          <button className="clear-filters" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Area tariffs
 * ------------------------------------------------------------------ */

type Tariff = {
  id: number;
  methodId: number;
  methodName: string;
  period: number;
  month: string;
  year: number;
  status: "live" | "queued" | "superseded";
};

type AreaTariffs = {
  currentPeriod: number;
  areas: { id: number; name: string; accounts: number; tariffs: Tariff[] }[];
};

const STATUS_WORD: Record<Tariff["status"], string> = {
  live: "Billing now",
  queued: "Queued",
  superseded: "Superseded",
};

function TariffsPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState<{ id: number; name: string; accounts: number } | null>(null);

  const { data, isLoading } = useQuery<AreaTariffs>({
    queryKey: ["area-tariffs"],
    queryFn: () => apiGet<AreaTariffs>("/api/settings/area-tariffs"),
  });

  const { data: methods } = useQuery<RateMethod[]>({
    queryKey: ["rate-methods"],
    queryFn: () => apiGet<RateMethod[]>("/api/settings/rate-methods"),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["area-tariffs"] });
  }

  async function drop(t: Tariff, areaName: string) {
    if (
      !confirm(
        `Remove the ${t.methodName} tariff starting ${t.month} ${t.year} for ${areaName}?`,
      )
    ) {
      return;
    }
    const r = await fetch(`/api/settings/area-tariffs/${t.id}`, { method: "DELETE" });
    if (r.ok) refresh();
  }

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Area tariffs</h2>
        <button className="clear-filters" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="count">
        A tariff is never overwritten. Bill generation picks the latest row on or
        before the bill's period, so a rate change is a new row with the month it
        takes effect — which is why an old row stays listed as superseded.
      </p>

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : (
        <div className="tariff-areas">
          {(data?.areas ?? []).map((area) => (
            <div className="tariff-area" key={area.id}>
              <div className="record-head">
                <h2>
                  {area.name}{" "}
                  <span className="count">
                    {area.accounts.toLocaleString()} account
                    {area.accounts === 1 ? "" : "s"}
                  </span>
                </h2>
                <button className="link-button" onClick={() => setAdding(area)}>
                  Add tariff
                </button>
              </div>

              {area.tariffs.length === 0 ? (
                <p className="count">
                  No tariff set — bills for this barangay have nothing to price
                  against.
                </p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Rate method</th>
                      <th>Effective from</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {area.tariffs.map((t) => (
                      <tr key={t.id}>
                        <td>{t.methodName}</td>
                        <td>
                          {t.month} {t.year}
                        </td>
                        <td>
                          <span className={`badge tariff-pill ${t.status}`}>
                            {STATUS_WORD[t.status]}
                          </span>
                        </td>
                        <td className="num">
                          <button
                            className="link-button"
                            onClick={() => drop(t, area.name)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <AddTariffDialog
          area={adding}
          methods={methods ?? []}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}

const MONTHS_LIST = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The blast-radius confirmation: a tariff change decides what every household
 * in the barangay is charged, so it names the count and asks for the barangay
 * to be typed before it will go.
 */
function AddTariffDialog({
  area,
  methods,
  onClose,
  onSaved,
}: {
  area: { id: number; name: string; accounts: number };
  methods: RateMethod[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const now = new Date();
  const [methodId, setMethodId] = useState<number | null>(methods[0]?.id ?? null);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const confirmed = typed.trim().toLowerCase() === area.name.trim().toLowerCase();
  const method = methods.find((m) => m.id === methodId);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await apiPost("/api/settings/area-tariffs", {
        areaId: area.id,
        methodId,
        month,
        year,
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Change the tariff for {area.name}?</h2>
        <p className="modal-sub">
          This decides what {area.accounts.toLocaleString()} household
          {area.accounts === 1 ? "" : "s"} are charged from the month you choose
          onward. Bills already issued are not touched.
        </p>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Rate method</span>
          <select
            value={methodId ?? ""}
            onChange={(e) => setMethodId(Number(e.target.value))}
          >
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.bracketCount === 0 ? " — no rates set" : ""}
              </option>
            ))}
          </select>
          {method && method.bracketCount === 0 && (
            <span className="setting-note">
              This method has no brackets yet, so bills priced against it would
              come out at zero.
            </span>
          )}
        </label>

        <div className="bracket-pickers" style={{ marginBottom: 12 }}>
          <label className="field-input">
            <span>Starts in</span>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS_LIST.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="field-input">
            <span>Year</span>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
        </div>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Type {area.name} to confirm</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} />
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button
            className="danger"
            disabled={busy || !confirmed || methodId === null}
            onClick={save}
          >
            {busy ? "Saving…" : "Add the tariff"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ *
 * Fees
 * ------------------------------------------------------------------ */

const FEE_COLUMNS = [
  { key: "application", label: "Application" },
  { key: "reconnection", label: "Reconnection" },
  { key: "meterTransfer", label: "Meter transfer" },
  { key: "ownerTransfer", label: "Owner transfer" },
  { key: "meterReplacement", label: "Replacement" },
  { key: "hydrant", label: "Hydrant" },
] as const;

type FeeKey = (typeof FEE_COLUMNS)[number]["key"];

type FeesData = {
  meterSizes: { id: number; name: string }[];
  consumerTypes: { id: number; name: string }[];
  rates: Record<FeeKey, Record<number, number>>;
  discounts: { id: number; typeId: number; name: string; percent: number }[];
  installment: {
    enabled: number;
    type: number;
    divider: number;
    minimum: number;
    downpaymentEnabled: number;
    downpaymentAmount: number;
  };
};

/**
 * One grid instead of the desktop's six separate dialogs. Laid out side by
 * side, a meter size missing a fee is obvious — five separate forms hide it.
 * A blank cell means the fee cannot be charged for that size.
 */
function FeesPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rateEdits, setRateEdits] = useState<Record<string, string>>({});
  const [discountEdits, setDiscountEdits] = useState<Record<number, string>>({});
  const [installment, setInstallment] = useState<FeesData["installment"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery<FeesData>({
    queryKey: ["fees"],
    queryFn: () => apiGet<FeesData>("/api/settings/fees"),
  });

  const ins = installment ?? data?.installment ?? null;
  const dirty =
    Object.keys(rateEdits).length > 0 ||
    Object.keys(discountEdits).length > 0 ||
    installment !== null;

  function cellValue(fee: FeeKey, sizeId: number) {
    const key = `${fee}:${sizeId}`;
    if (key in rateEdits) return rateEdits[key];
    const v = data?.rates?.[fee]?.[sizeId];
    return v === undefined ? "" : String(v);
  }

  async function save() {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      const rates = Object.entries(rateEdits).map(([key, raw]) => {
        const [fee, sizeId] = key.split(":");
        const trimmed = raw.trim();
        return {
          fee,
          sizeId: Number(sizeId),
          rate: trimmed === "" ? null : Number(trimmed),
        };
      });

      const discounts = Object.entries(discountEdits).map(([typeId, raw]) => ({
        typeId: Number(typeId),
        percent: Number(raw || 0),
      }));

      const r = await fetch("/api/settings/fees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rates, discounts, installment: ins }),
      });
      if (!r.ok) {
        throw new Error((await r.json().catch(() => null))?.error ?? "Could not save the fees");
      }

      setRateEdits({});
      setDiscountEdits({});
      setInstallment(null);
      queryClient.invalidateQueries({ queryKey: ["fees"] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || !data || !ins) {
    return (
      <section className="record-section settings-panel">
        <p className="count">Loading the fees…</p>
      </section>
    );
  }

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Fees</h2>
        <button className="clear-filters" onClick={onClose}>
          Close
        </button>
      </div>

      <h3 className="profile-head">Per meter size</h3>
      <p className="count">
        A blank cell means the fee cannot be charged for that size. Collection
        raises these the moment an account reaches the matching status.
      </p>

      <div className="fee-grid-wrap">
        <table className="data-table fee-grid">
          <thead>
            <tr>
              <th>Meter size</th>
              {FEE_COLUMNS.map((c) => (
                <th key={c.key} className="num">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.meterSizes.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                {FEE_COLUMNS.map((c) => (
                  <td key={c.key} className="num">
                    <input
                      className="amount-input"
                      inputMode="decimal"
                      placeholder="—"
                      value={cellValue(c.key, m.id)}
                      onChange={(e) =>
                        setRateEdits((prev) => ({
                          ...prev,
                          [`${c.key}:${m.id}`]: e.target.value,
                        }))
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="profile-head">Application fee discount by consumer type</h3>
      <p className="count">
        applicationfeediscount() takes the full fee above and reduces it by this
        percentage — which is why a GAD account at 100% pays nothing.
      </p>
      <table className="data-table discount-table">
        <thead>
          <tr>
            <th>Consumer type</th>
            <th className="num">Discount %</th>
            <th className="num">Pays (1/2" size)</th>
          </tr>
        </thead>
        <tbody>
          {data.consumerTypes.map((t) => {
            const existing = data.discounts.find((d) => d.typeId === t.id);
            const raw = discountEdits[t.id] ?? String(existing?.percent ?? 0);
            const pct = Number(raw || 0);
            const firstSize = data.meterSizes[0];
            const full = firstSize ? (data.rates.application?.[firstSize.id] ?? 0) : 0;
            return (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td className="num">
                  <input
                    className="amount-input"
                    inputMode="decimal"
                    value={raw}
                    onChange={(e) =>
                      setDiscountEdits((prev) => ({ ...prev, [t.id]: e.target.value }))
                    }
                  />
                </td>
                <td className="num">
                  {peso.format(Math.max(0, full * (1 - pct / 100)))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 className="profile-head">Installments</h3>
      <div className="profile-grid">
        <div className="field-input">
          <span>Paying by installment</span>
          <label className="toolbar-check">
            <input
              type="checkbox"
              checked={ins.enabled === 1}
              onChange={(e) =>
                setInstallment({ ...ins, enabled: e.target.checked ? 1 : 0 })
              }
            />
            Allowed
          </label>
          <span className="setting-note">
            Off means the full application fee is due at the counter.
          </span>
        </div>

        <label className="field-input">
          <span>Monthly installment is</span>
          <select
            value={ins.type}
            onChange={(e) => setInstallment({ ...ins, type: Number(e.target.value) })}
          >
            <option value={1}>A fixed amount</option>
            <option value={2}>The balance divided</option>
          </select>
        </label>

        {ins.type === 1 ? (
          <label className="field-input">
            <span>Fixed monthly amount</span>
            <input
              inputMode="decimal"
              value={ins.minimum}
              onChange={(e) =>
                setInstallment({ ...ins, minimum: Number(e.target.value || 0) })
              }
            />
          </label>
        ) : (
          <label className="field-input">
            <span>Divide the balance by</span>
            <input
              type="number"
              min={1}
              value={ins.divider}
              onChange={(e) =>
                setInstallment({ ...ins, divider: Number(e.target.value || 1) })
              }
            />
            <span className="setting-note">Months, stored per account when first paid.</span>
          </label>
        )}

        <div className="field-input">
          <span>Downpayment</span>
          <label className="toolbar-check">
            <input
              type="checkbox"
              checked={ins.downpaymentEnabled === 1}
              onChange={(e) =>
                setInstallment({
                  ...ins,
                  downpaymentEnabled: e.target.checked ? 1 : 0,
                })
              }
            />
            Required
          </label>
        </div>

        <label className="field-input">
          <span>Minimum downpayment</span>
          <input
            inputMode="decimal"
            value={ins.downpaymentAmount}
            onChange={(e) =>
              setInstallment({
                ...ins,
                downpaymentAmount: Number(e.target.value || 0),
              })
            }
          />
          <span className="setting-note">
            The floor on what a clerk may accept at the counter.
          </span>
        </label>
      </div>

      <div className="form-notice" style={{ marginTop: 16 }}>
        Nothing already charged moves. A fee sitting on an unpaid bill keeps the
        amount it was billed at; these rates apply to charges raised from now on,
        and changing the installment rule does not re-cut existing plans.
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="form-actions" style={{ marginTop: 14 }}>
        <button className="primary" disabled={busy || !dirty} onClick={save}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button
          className="clear-filters"
          disabled={busy || !dirty}
          onClick={() => {
            setRateEdits({});
            setDiscountEdits({});
            setInstallment(null);
          }}
        >
          Discard
        </button>
        <span className="count">
          {dirty ? "Unsaved changes." : "No unsaved changes."}
        </span>
      </div>
    </section>
  );
}


/* ------------------------------------------------------------------ *
 * Signatories and the collecting officer
 * ------------------------------------------------------------------ */

type Signatory = { id: number; name: string; title: string; type: string };

type SignatoryData = {
  types: string[];
  signatories: Signatory[];
  counts: Record<string, number>;
};

const ROLE_LABEL: Record<string, string> = {
  PREP: "Prepared by",
  CHECK: "Checked by",
  APPR: "Approved by",
};

function PeoplePanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Signatory | "new" | null>(null);

  const { data, isLoading } = useQuery<SignatoryData>({
    queryKey: ["signatories"],
    queryFn: () => apiGet<SignatoryData>("/api/settings/signatories"),
  });

  const { data: collector } = useQuery<{ name: string; present: boolean }>({
    queryKey: ["collector"],
    queryFn: () => apiGet<{ name: string; present: boolean }>("/api/settings/collector"),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["signatories"] });
  }

  // get_monthlybills_prep_name() does a scalar SELECT with no LIMIT, so more
  // than one row of a type makes it fail rather than pick one.
  const crowded = (data?.types ?? []).filter((t) => (data?.counts[t] ?? 0) > 1);

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Signatories and collecting officer</h2>
        <button className="clear-filters" onClick={onClose}>
          Close
        </button>
      </div>

      <h3 className="profile-head">Collecting officer</h3>
      <p className="count">
        One name, printed on every O.R. This is what get_Collector() returns.
      </p>
      <CollectorEditor
        name={collector?.name ?? ""}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["collector"] })}
      />

      <h3 className="profile-head">Signatories</h3>
      <div className="record-head" style={{ paddingBottom: 10, marginBottom: 10 }}>
        <span className="count">
          Reports pick a signatory by id, so the same person can appear under
          more than one role.
        </span>
        <button className="primary" onClick={() => setEditing("new")}>
          Add signatory
        </button>
      </div>

      {crowded.length > 0 && (
        <div className="form-notice">
          <b>More than one signatory shares a role.</b> That is fine for reports
          that choose a signatory by id, but{" "}
          <code>get_monthlybills_prep_name()</code> reads{" "}
          <code>SELECT name FROM signatories WHERE type='PREP'</code> as a single
          value with no LIMIT — with{" "}
          {crowded.map((t) => `${data?.counts[t]} ${t}`).join(" and ")} rows it
          errors instead of picking one. Worth adding a LIMIT to that function,
          or having the report take an id like the others do.
        </div>
      )}

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Title</th>
              <th>Role</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(data?.signatories ?? []).map((sg) => (
              <tr key={sg.id}>
                <td>{sg.name}</td>
                <td>{sg.title || <span className="muted">—</span>}</td>
                <td>
                  <span className={`badge setting-badge role-${sg.type.toLowerCase()}`}>
                    {ROLE_LABEL[sg.type] ?? sg.type}
                  </span>
                </td>
                <td className="num">
                  <button className="link-button" onClick={() => setEditing(sg)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {data?.signatories.length === 0 && (
              <tr>
                <td colSpan={4} className="count">
                  No signatories on file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {editing && (
        <SignatoryEditor
          signatory={editing === "new" ? null : editing}
          types={data?.types ?? ["PREP", "CHECK", "APPR"]}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function CollectorEditor({ name, onSaved }: { name: string; onSaved: () => void }) {
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(name);
    setSaved(false);
  }, [name]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/settings/collector", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not save");
      setSaved(true);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="senior-block" style={{ borderTop: "none", paddingTop: 0 }}>
      <label className="field-input">
        <span>Name as it prints</span>
        <input
          value={value}
          maxLength={45}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          placeholder="ELLEN L. MANZUL"
        />
        <span className="setting-note">
          {value.length}/45 characters — the column will not hold more.
        </span>
      </label>
      <button
        className="clear-filters"
        disabled={busy || !value.trim() || value === name}
        onClick={save}
      >
        {busy ? "Saving…" : saved ? "Saved" : "Save"}
      </button>
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

function SignatoryEditor({
  signatory,
  types,
  onClose,
  onSaved,
}: {
  signatory: Signatory | null;
  types: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(signatory?.name ?? "");
  const [title, setTitle] = useState(signatory?.title ?? "");
  const [type, setType] = useState(signatory?.type ?? types[0] ?? "PREP");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = { name, title, type };
      if (signatory) {
        const r = await fetch(`/api/settings/signatories/${signatory.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not save");
      } else {
        await apiPost("/api/settings/signatories", body);
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!signatory) return;
    if (!confirm(`Remove ${signatory.name}? Reports pointing at this signatory by id would lose their name.`)) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/settings/signatories/${signatory.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not remove");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{signatory ? "Edit signatory" : "New signatory"}</h2>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Name</span>
          <input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="ENG'R. NELSON R. AVANCEÑA"
          />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="MGDH I"
          />
        </label>

        <label className="field-input">
          <span>Role on a report</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => (
              <option key={t} value={t}>
                {ROLE_LABEL[t] ?? t} ({t})
              </option>
            ))}
          </select>
          <span className="setting-note">
            Add the same person twice if they both check and approve.
          </span>
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="primary" disabled={busy || !name.trim()} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {signatory && (
            <>
              <div style={{ flexGrow: 1 }} />
              <button className="danger small" onClick={remove} disabled={busy}>
                Remove
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- *
 * Classification list
 * -------------------------------------------------------------------- */

type Classification = {
  id: number;
  name: string;
  code: string;
  isBulk: boolean;
  typeSpec: string;
  status: string;
  accounts: number;
  bills: number;
  /** Distinct rate methods that price this class. */
  methods: number;
  /** Rows in tblclassrates. */
  brackets: number;
};

function ClassificationsPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Classification | "new" | null>(null);
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery<Classification[]>({
    queryKey: ["classifications"],
    queryFn: () => apiGet<Classification[]>("/api/settings/classifications"),
  });

  const rows = data ?? [];
  const needle = search.trim().toLowerCase();
  const shown = needle
    ? rows.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.code.toLowerCase().includes(needle) ||
          c.typeSpec.toLowerCase().includes(needle),
      )
    : rows;

  // A bill takes its price from tblclassrates keyed on classID. A class that
  // accounts point at but no method prices bills at zero, silently, for as
  // many accounts as carry it. Better said here than found in a bill run.
  const unpriced = rows.filter((c) => c.accounts > 0 && c.brackets === 0);

  // classcode is part of the account number, so a blank or repeated one is a
  // numbering problem rather than a cosmetic one.
  const noCode = rows.filter((c) => !c.code.trim());
  const dupeCodes = (() => {
    const seen = new Map<string, number>();
    for (const c of rows) {
      const k = c.code.trim().toLowerCase();
      if (!k) continue;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k.toUpperCase());
  })();

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Classification list</h2>
        <button className="clear-filters" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="count">
        A classification is what a bill prices against — the rate method looks
        up its brackets by <code>classID</code> and meter size. Renaming one is
        safe; the id is what everything stores.
      </p>

      {(noCode.length > 0 || dupeCodes.length > 0) && (
        <div className="form-notice">
          {noCode.length > 0 && (
            <>
              <b>No code set:</b> {noCode.map((c) => c.name).join(", ")}.{" "}
            </>
          )}
          {dupeCodes.length > 0 && (
            <>
              <b>Code used twice:</b> {dupeCodes.join(", ")}.{" "}
            </>
          )}
          The classification code goes into every new account number, so a
          missing or repeated one produces a malformed or colliding number.
        </div>
      )}

      {unpriced.length > 0 && (
        <div className="form-notice">
          <b>
            {unpriced.length === 1
              ? "One classification is in use but has no rates."
              : `${unpriced.length} classifications are in use but have no rates.`}
          </b>{" "}
          {unpriced.map((c) => `${c.name} (${c.accounts.toLocaleString()})`).join(", ")}
          . Bills for those accounts price at zero rather than failing. Add
          brackets under Rate Method, or move the accounts to a class that has
          them.
        </div>
      )}

      <div className="record-head" style={{ paddingBottom: 10, marginBottom: 10 }}>
        <input
          className="filter-input class-search"
          placeholder="Search classifications…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="primary" onClick={() => setEditing("new")}>
          Add classification
        </button>
      </div>

      {error && <div className="form-error">{(error as Error).message}</div>}

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Classification</th>
              <th>Code</th>
              <th className="num">Accounts</th>
              <th className="num">Bills</th>
              <th>Priced by</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.name}
                  {c.isBulk && (
                    <span className="badge setting-badge" style={{ marginLeft: 8 }}>
                      Bulk
                    </span>
                  )}
                  {c.typeSpec && (
                    <div className="setting-note">{c.typeSpec}</div>
                  )}
                </td>
                <td>{c.code || <span className="muted">—</span>}</td>
                <td className="num">{c.accounts.toLocaleString()}</td>
                <td className="num">{c.bills.toLocaleString()}</td>
                <td>
                  {c.brackets === 0 ? (
                    <span className="badge setting-badge role-none">No rates</span>
                  ) : (
                    <span className="count">
                      {c.methods} method{c.methods === 1 ? "" : "s"} ·{" "}
                      {c.brackets} bracket{c.brackets === 1 ? "" : "s"}
                    </span>
                  )}
                </td>
                <td>
                  <span
                    className={`badge setting-badge ${
                      /active/i.test(c.status) ? "role-prep" : "role-none"
                    }`}
                  >
                    {c.status || "—"}
                  </span>
                </td>
                <td className="num">
                  <button className="link-button" onClick={() => setEditing(c)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="count">
                  {rows.length === 0
                    ? "No classifications on file."
                    : "Nothing matches that search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {editing && (
        <ClassificationEditor
          record={editing === "new" ? null : editing}
          existing={rows}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ["classifications"] });
            // The rate-method screens list classifications, so refresh those too.
            queryClient.invalidateQueries({ queryKey: ["rate-methods"] });
          }}
        />
      )}
    </section>
  );
}

function ClassificationEditor({
  record,
  existing,
  onClose,
  onSaved,
}: {
  record: Classification | null;
  existing: Classification[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(record?.name ?? "");
  const [code, setCode] = useState(record?.code ?? "");
  const [typeSpec, setTypeSpec] = useState(record?.typeSpec ?? "");
  const [status, setStatus] = useState(record?.status || "Active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const specs = Array.from(
    new Set(existing.map((c) => c.typeSpec).filter(Boolean)),
  ).sort();

  const inUse = (record?.accounts ?? 0) + (record?.bills ?? 0);
  const codeClash =
    code.trim() !== "" &&
    existing.some(
      (c) =>
        c.id !== record?.id &&
        c.code.trim().toLowerCase() === code.trim().toLowerCase(),
    );

  async function save() {
    setBusy(true);
    setError("");
    try {
      // isBulk is carried through untouched — bulk pricing is its own screen.
      const body = { name, code, typeSpec, isBulk: record?.isBulk ?? false, status };
      if (record) {
        const r = await fetch(`/api/settings/classifications/${record.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          throw new Error((await r.json().catch(() => null))?.error ?? "Could not save");
        }
      } else {
        await apiPost("/api/settings/classifications", body);
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!record) return;
    if (
      !confirm(
        `Remove ${record.name}? Its rate brackets go with it. Nothing currently uses it.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/settings/classifications/${record.id}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        throw new Error((await r.json().catch(() => null))?.error ?? "Could not remove");
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">
          {record ? "Edit classification" : "New classification"}
        </h2>
        {record && (
          <p className="modal-sub">
            {record.accounts.toLocaleString()} account
            {record.accounts === 1 ? "" : "s"} ·{" "}
            {record.bills.toLocaleString()} bill{record.bills === 1 ? "" : "s"} ·{" "}
            {record.brackets} bracket{record.brackets === 1 ? "" : "s"}
          </p>
        )}

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Classification</span>
          <input
            value={name}
            autoFocus
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            placeholder="RESIDENTIAL"
          />
          <span className="setting-note">
            This is what prints on the bill. Changing it renames it everywhere —
            accounts and bills store the id, not the name.
          </span>
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Code</span>
          <input
            value={code}
            maxLength={45}
            onChange={(e) => setCode(e.target.value)}
            placeholder="01"
          />
          <span className="setting-note">
            Goes into every new account number for this class. Existing accounts
            keep the number they already have.
          </span>
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Type specification</span>
          <input
            value={typeSpec}
            maxLength={45}
            list="class-typespecs"
            onChange={(e) => setTypeSpec(e.target.value)}
          />
          <datalist id="class-typespecs">
            {specs.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          <span className="setting-note">
            Inactive keeps existing accounts billing as they are — it only takes
            the class out of the pick lists for new ones.
          </span>
        </label>

        {codeClash && (
          <div className="form-error">
            Code {code.trim()} is already used by another classification.
          </div>
        )}
        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button
            className="primary"
            disabled={busy || !name.trim() || codeClash}
            onClick={save}
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {record && (
            <>
              <div style={{ flexGrow: 1 }} />
              {inUse > 0 ? (
                <span className="count">
                  In use by {inUse.toLocaleString()} record
                  {inUse === 1 ? "" : "s"} — reassign them before removing.
                </span>
              ) : (
                <button className="danger small" onClick={remove} disabled={busy}>
                  Remove
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- *
 * Bulk water rates
 * -------------------------------------------------------------------- */

type BulkRateRow = {
  id: number;
  type: string;
  forDelivery: boolean;
  rate: number;
  minCubic: number;
};

type BulkDelivery = { id: number; range: string; rate: number };

type BulkData = {
  enabled: number;
  rates: BulkRateRow[];
  deliveryRanges: BulkDelivery[];
};

function BulkRatesPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<BulkRateRow | "new" | null>(null);

  const { data, isLoading } = useQuery<BulkData>({
    queryKey: ["bulk-rates"],
    queryFn: () => apiGet<BulkData>("/api/settings/bulk-rates"),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["bulk-rates"] });
  const rates = data?.rates ?? [];

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Bulk water rates</h2>
        <button className="clear-filters" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="count">
        A bulk account is priced from these rates, not from a classification's
        brackets — the two never meet. A rate marked for delivery is charged the
        hauling range below on top of the water itself.
      </p>

      {data && !data.enabled && (
        <div className="form-notice">
          <b>Bulk water is switched off for this municipality.</b> These rates
          are saved either way, but the Collection screen will not offer the
          Bulk Water button until <code>EnableBulk</code> is turned on under
          Municipal Profile Settings.
        </div>
      )}

      <div className="record-head" style={{ paddingBottom: 10, marginBottom: 10 }}>
        <span className="count">Rates</span>
        <button className="primary" onClick={() => setEditing("new")}>
          Add rate
        </button>
      </div>

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th className="num">Rate</th>
              <th className="num">Minimum m³</th>
              <th>Charged</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id}>
                <td>{r.type}</td>
                <td className="num">{peso.format(r.rate)}</td>
                <td className="num">
                  {r.minCubic > 0 ? r.minCubic : <span className="muted">—</span>}
                </td>
                <td>
                  {r.forDelivery ? (
                    <span className="badge setting-badge role-check">
                      Delivered — adds a hauling range
                    </span>
                  ) : (
                    <span className="badge setting-badge role-prep">At the source</span>
                  )}
                </td>
                <td className="num">
                  <button className="link-button" onClick={() => setEditing(r)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {rates.length === 0 && (
              <tr>
                <td colSpan={5} className="count">
                  No bulk rates on file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <h3 className="profile-head">Delivery ranges</h3>
      <p className="count">
        Charged on top of a delivered rate, by how far the water is hauled.
      </p>
      <DeliveryRanges rows={data?.deliveryRanges ?? []} onSaved={refresh} />

      {editing && (
        <BulkRateEditor
          record={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function DeliveryRanges({
  rows,
  onSaved,
}: {
  rows: BulkDelivery[];
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<BulkDelivery[] | null>(null);
  const [removed, setRemoved] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const list = draft ?? rows;

  function edit(i: number, patch: Partial<BulkDelivery>) {
    setDraft(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/settings/bulk-delivery", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: list, removed }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not save");
      setDraft(null);
      setRemoved([]);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <table className="data-table">
        <thead>
          <tr>
            <th>Range</th>
            <th className="num">Rate</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map((r, i) => (
            <tr key={r.id || `new-${i}`}>
              <td>
                <input
                  className="filter-input"
                  style={{ width: 200 }}
                  value={r.range}
                  onChange={(e) => edit(i, { range: e.target.value })}
                />
              </td>
              <td className="num">
                <input
                  className="amount-input"
                  type="number"
                  step="0.01"
                  min={0}
                  value={r.rate}
                  onChange={(e) => edit(i, { rate: Number(e.target.value) })}
                />
              </td>
              <td className="num">
                <button
                  className="link-button"
                  onClick={() => {
                    if (r.id) setRemoved([...removed, r.id]);
                    setDraft(list.filter((_, j) => j !== i));
                  }}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {list.length === 0 && (
            <tr>
              <td colSpan={3} className="count">
                No delivery ranges yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {error && <div className="form-error">{error}</div>}

      <div className="form-actions">
        <button
          className="clear-filters"
          onClick={() => setDraft([...list, { id: 0, range: "", rate: 0 }])}
        >
          Add range
        </button>
        <button className="primary" disabled={busy || draft === null} onClick={save}>
          {busy ? "Saving…" : "Save ranges"}
        </button>
        {draft !== null && (
          <button
            className="clear-filters"
            disabled={busy}
            onClick={() => {
              setDraft(null);
              setRemoved([]);
            }}
          >
            Discard
          </button>
        )}
      </div>
    </>
  );
}

function BulkRateEditor({
  record,
  onClose,
  onSaved,
}: {
  record: BulkRateRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState(record?.type ?? "");
  const [rate, setRate] = useState(record?.rate ?? 0);
  const [minCubic, setMinCubic] = useState(record?.minCubic ?? 0);
  const [forDelivery, setForDelivery] = useState(record?.forDelivery ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = { type, rate, minCubic, forDelivery };
      if (record) {
        const r = await fetch(`/api/settings/bulk-rates/${record.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not save");
      } else {
        await apiPost("/api/settings/bulk-rates", body);
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!record) return;
    if (!confirm(`Remove ${record.type}?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/settings/bulk-rates/${record.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not remove");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{record ? "Edit bulk rate" : "New bulk rate"}</h2>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Type</span>
          <input value={type} autoFocus onChange={(e) => setType(e.target.value)} />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Rate per m³</span>
          <input
            className="amount-input"
            type="number"
            step="0.01"
            min={0}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Minimum billable m³</span>
          <input
            className="amount-input"
            type="number"
            min={0}
            value={minCubic}
            onChange={(e) => setMinCubic(Number(e.target.value))}
          />
          <span className="setting-note">
            Read as a floor on the quantity — anything under it still bills for
            this many. Zero means no floor. Worth confirming against how the
            desktop reads <code>mincub</code> before relying on it.
          </span>
        </label>

        <label className="check-row">
          <input
            type="checkbox"
            checked={forDelivery}
            onChange={(e) => setForDelivery(e.target.checked)}
          />
          <span>
            Delivered
            <span className="setting-note">
              Adds a hauling range on top. Leave off for water taken at the
              source.
            </span>
          </span>
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="primary" disabled={busy || !type.trim()} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {record && (
            <>
              <div style={{ flexGrow: 1 }} />
              <button className="danger small" onClick={remove} disabled={busy}>
                Remove
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- *
 * Meter sizes
 * -------------------------------------------------------------------- */

type MeterSize = {
  id: number;
  size: string;
  accounts: number;
  brackets: number;
  feeTables: number;
  feeTableCount: number;
};

function MeterSizesPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<MeterSize | "new" | null>(null);

  const { data, isLoading } = useQuery<MeterSize[]>({
    queryKey: ["meter-sizes"],
    queryFn: () => apiGet<MeterSize[]>("/api/settings/meter-sizes"),
  });

  const rows = data ?? [];
  // Six fee tables are keyed on meter size. A size missing from some of them
  // quotes zero for those fees rather than refusing, so it is worth naming.
  const partial = rows.filter((m) => m.feeTables > 0 && m.feeTables < m.feeTableCount);
  const unpriced = rows.filter((m) => m.accounts > 0 && m.feeTables === 0);

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Meter sizes</h2>
        <button className="clear-filters" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="count">
        Every fee table and every rate bracket is keyed on a meter size, so a
        size added here is a size that needs pricing in six other places.
      </p>

      {(partial.length > 0 || unpriced.length > 0) && (
        <div className="form-notice">
          {unpriced.length > 0 && (
            <>
              <b>Not priced in any fee table:</b>{" "}
              {unpriced.map((m) => `${m.size} (${m.accounts.toLocaleString()} accounts)`).join(", ")}
              .{" "}
            </>
          )}
          {partial.length > 0 && (
            <>
              <b>Priced in only some fee tables:</b>{" "}
              {partial.map((m) => `${m.size} (${m.feeTables}/${m.feeTableCount})`).join(", ")}
              .{" "}
            </>
          )}
          A missing rate quotes zero rather than refusing, so the counter takes
          no money for that fee.
        </div>
      )}

      <div className="record-head" style={{ paddingBottom: 10, marginBottom: 10 }}>
        <span className="count">{rows.length} sizes</span>
        <button className="primary" onClick={() => setEditing("new")}>
          Add meter size
        </button>
      </div>

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Size</th>
              <th className="num">Accounts</th>
              <th className="num">Rate brackets</th>
              <th>Fee tables</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>{m.size}</td>
                <td className="num">{m.accounts.toLocaleString()}</td>
                <td className="num">{m.brackets.toLocaleString()}</td>
                <td>
                  <span
                    className={`badge setting-badge ${
                      m.feeTables === m.feeTableCount ? "role-prep" : "role-none"
                    }`}
                  >
                    {m.feeTables} of {m.feeTableCount}
                  </span>
                </td>
                <td className="num">
                  <button className="link-button" onClick={() => setEditing(m)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <MeterSizeEditor
          record={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ["meter-sizes"] });
            queryClient.invalidateQueries({ queryKey: ["fees"] });
            queryClient.invalidateQueries({ queryKey: ["rate-methods"] });
          }}
        />
      )}
    </section>
  );
}

function MeterSizeEditor({
  record,
  onClose,
  onSaved,
}: {
  record: MeterSize | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [size, setSize] = useState(record?.size ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (record) {
        const r = await fetch(`/api/settings/meter-sizes/${record.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ size }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not save");
      } else {
        await apiPost("/api/settings/meter-sizes", { size });
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!record) return;
    if (
      !confirm(
        `Remove ${record.size}? Its ${record.brackets} rate bracket(s) and every fee priced for it go with it.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/settings/meter-sizes/${record.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not remove");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{record ? "Edit meter size" : "New meter size"}</h2>

        <label className="field-input">
          <span>Size as it prints</span>
          <input
            value={size}
            autoFocus
            onChange={(e) => setSize(e.target.value)}
            placeholder={'1/2'}
          />
        </label>

        {record && (
          <p className="count" style={{ marginTop: 12 }}>
            {record.accounts.toLocaleString()} account(s) ·{" "}
            {record.brackets.toLocaleString()} bracket(s) · priced in{" "}
            {record.feeTables} of {record.feeTableCount} fee tables
          </p>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="primary" disabled={busy || !size.trim()} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {record && (
            <>
              <div style={{ flexGrow: 1 }} />
              {record.accounts > 0 ? (
                <span className="count">
                  {record.accounts.toLocaleString()} account(s) use it.
                </span>
              ) : (
                <button className="danger small" onClick={remove} disabled={busy}>
                  Remove
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- *
 * Consumer types
 * -------------------------------------------------------------------- */

type ConsumerType = {
  id: number;
  name: string;
  privType: number;
  minAmount: number;
  typeSpecEnabled: boolean;
  needsCollection: number;
  accounts: number;
  /** Percentage off the application fee, from appfeediscount. */
  discount: number | null;
};

function ConsumerTypesPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ConsumerType | "new" | null>(null);

  const { data, isLoading } = useQuery<ConsumerType[]>({
    queryKey: ["consumer-types"],
    queryFn: () => apiGet<ConsumerType[]>("/api/settings/consumer-types"),
  });

  const rows = data ?? [];

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Consumer types</h2>
        <button className="clear-filters" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="count">
        A consumer type carries the application-fee discount and whether the
        account is collected from at all, so this is a pricing screen as much as
        a reference list.
      </p>

      <div className="record-head" style={{ paddingBottom: 10, marginBottom: 10 }}>
        <span className="count">{rows.length} types</span>
        <button className="primary" onClick={() => setEditing("new")}>
          Add consumer type
        </button>
      </div>

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th className="num">Accounts</th>
              <th className="num">App. fee discount</th>
              <th className="num">Minimum</th>
              <th>Collected</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>
                  {t.name}
                  {t.typeSpecEnabled && (
                    <div className="setting-note">Type specification required</div>
                  )}
                </td>
                <td className="num">{t.accounts.toLocaleString()}</td>
                <td className="num">
                  {t.discount === null ? (
                    <span className="muted">—</span>
                  ) : t.discount >= 100 ? (
                    <span className="badge setting-badge role-appr">Pays nothing</span>
                  ) : (
                    `${t.discount}%`
                  )}
                </td>
                <td className="num">{peso.format(t.minAmount)}</td>
                <td>
                  {t.needsCollection === 0 ? (
                    <span className="badge setting-badge role-none">No</span>
                  ) : (
                    <span className="badge setting-badge role-prep">
                      Yes{t.needsCollection > 1 ? ` (${t.needsCollection})` : ""}
                    </span>
                  )}
                </td>
                <td className="num">
                  <button className="link-button" onClick={() => setEditing(t)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <ConsumerTypeEditor
          record={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ["consumer-types"] });
            queryClient.invalidateQueries({ queryKey: ["fees"] });
          }}
        />
      )}
    </section>
  );
}

function ConsumerTypeEditor({
  record,
  onClose,
  onSaved,
}: {
  record: ConsumerType | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(record?.name ?? "");
  const [privType, setPrivType] = useState(record?.privType ?? 1);
  const [minAmount, setMinAmount] = useState(record?.minAmount ?? 0);
  const [typeSpec, setTypeSpec] = useState(record?.typeSpecEnabled ?? false);
  const [needsCollection, setNeedsCollection] = useState(record?.needsCollection ?? 1);
  const [discount, setDiscount] = useState<string>(
    record?.discount === null || record?.discount === undefined
      ? ""
      : String(record.discount),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = {
        name,
        privType,
        minAmount,
        typeSpecEnabled: typeSpec,
        needsCollection,
        discount: discount.trim() === "" ? null : Number(discount),
      };
      if (record) {
        const r = await fetch(`/api/settings/consumer-types/${record.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not save");
      } else {
        await apiPost("/api/settings/consumer-types", body);
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!record) return;
    if (!confirm(`Remove ${record.name}? Its application-fee discount goes with it.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/settings/consumer-types/${record.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not remove");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const pct = discount.trim() === "" ? null : Number(discount);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          {record ? "Edit consumer type" : "New consumer type"}
        </h2>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Name</span>
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Application fee discount</span>
          <input
            className="amount-input"
            type="number"
            min={0}
            max={100}
            value={discount}
            placeholder="none"
            onChange={(e) => setDiscount(e.target.value)}
          />
          <span className="setting-note">
            Percentage off the full fee for this type&apos;s meter size.{" "}
            {pct !== null && pct >= 100
              ? "At 100 the account pays nothing."
              : "Leave blank for no discount row at all."}
          </span>
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Minimum amount</span>
          <input
            className="amount-input"
            type="number"
            step="0.01"
            min={0}
            value={minAmount}
            onChange={(e) => setMinAmount(Number(e.target.value))}
          />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Privilege type</span>
          <input
            className="amount-input"
            type="number"
            min={0}
            value={privType}
            onChange={(e) => setPrivType(Number(e.target.value))}
          />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Needs collection</span>
          <input
            className="amount-input"
            type="number"
            min={0}
            value={needsCollection}
            onChange={(e) => setNeedsCollection(Number(e.target.value))}
          />
          <span className="setting-note">
            Zero means the account is billed but never collected from.
          </span>
        </label>

        <label className="check-row">
          <input
            type="checkbox"
            checked={typeSpec}
            onChange={(e) => setTypeSpec(e.target.checked)}
          />
          <span>
            Type specification required
            <span className="setting-note">
              The account has to name a specification — the way a fire hydrant
              does.
            </span>
          </span>
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="primary" disabled={busy || !name.trim()} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {record && (
            <>
              <div style={{ flexGrow: 1 }} />
              {record.accounts > 0 ? (
                <span className="count">
                  {record.accounts.toLocaleString()} account(s) use it.
                </span>
              ) : (
                <button className="danger small" onClick={remove} disabled={busy}>
                  Remove
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- *
 * Address list — barangays and clusters
 * -------------------------------------------------------------------- */

type Barangay = {
  id: number;
  name: string;
  /** Goes into the account number, so it has to be unique and stable. */
  code: string;
  status: string;
  accounts: number;
  clusters: number;
  tariffs: number;
};

type Cluster = {
  id: number;
  barangayId: number;
  name: string;
  code: string;
  status: string;
  accounts: number;
};

type AddressData = {
  clustersEnabled: number;
  accountGenType: number;
  /** Which column each code lives in, or null when the table has none. */
  codeColumns: { barangay: string | null; cluster: string | null };
  duplicateCodes: { barangay: string[]; cluster: string[] };
  barangays: Barangay[];
  clusters: Cluster[];
};

function AddressPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [editingBrgy, setEditingBrgy] = useState<Barangay | "new" | null>(null);
  const [editingCluster, setEditingCluster] = useState<Cluster | "new" | null>(null);

  const { data, isLoading } = useQuery<AddressData>({
    queryKey: ["addresses"],
    queryFn: () => apiGet<AddressData>("/api/settings/addresses"),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["addresses"] });
  const barangays = data?.barangays ?? [];
  const current = barangays.find((b) => b.id === selected) ?? null;
  const clusters = (data?.clusters ?? []).filter((c) => c.barangayId === selected);

  // A barangay with no tariff prices against no rate method at all.
  const untariffed = barangays.filter((b) => b.accounts > 0 && b.tariffs === 0);
  const missingBrgyCodes = data?.codeColumns.barangay
    ? barangays.filter((b) => !b.code.trim())
    : [];

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Address list</h2>
        <button className="clear-filters" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="count">
        The codes here are what <code>Create_Account_Number</code> builds an
        account number out of, alongside the classification code. Changing one
        does not renumber accounts that already exist — it changes what the
        next account in that area is given.
      </p>

      {untariffed.length > 0 && (
        <div className="form-notice">
          <b>No area tariff:</b>{" "}
          {untariffed.map((b) => `${b.name} (${b.accounts.toLocaleString()})`).join(", ")}
          . Those accounts have no rate method to price against. Set one under
          Area Tariff.
        </div>
      )}

      {missingBrgyCodes.length > 0 && (
        <div className="form-notice">
          <b>No code set:</b>{" "}
          {missingBrgyCodes.map((b) => b.name).join(", ")}. A new account in
          those barangays gets a malformed number.
        </div>
      )}

      {(data?.duplicateCodes.barangay.length ||
        data?.duplicateCodes.cluster.length) ? (
        <div className="form-notice">
          <b>Two places share a code.</b>{" "}
          {data.duplicateCodes.barangay.length > 0 && (
            <>Barangay code {data.duplicateCodes.barangay.join(", ")}. </>
          )}
          {data.duplicateCodes.cluster.length > 0 && (
            <>Cluster code {data.duplicateCodes.cluster.join(", ")}. </>
          )}
          Two accounts can come out with the same number, and the second one
          will be refused when it is added.
        </div>
      ) : null}

      {data && !data.codeColumns.barangay && (
        <div className="form-notice">
          <b>No code column found on <code>brgylist</code>.</b> The name field
          still saves; the code does not, because writing to a column that is
          not there would fail silently. Inspect a table under Tools to see what
          it really has.
        </div>
      )}

      <div className="address-columns">
        <div>
          <div className="record-head" style={{ paddingBottom: 10, marginBottom: 10 }}>
            <span className="count">Barangays</span>
            <button className="primary" onClick={() => setEditingBrgy("new")}>
              Add
            </button>
          </div>

          {isLoading ? (
            <p className="count">Loading…</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Barangay</th>
                  <th>Code</th>
                  <th className="num">Accounts</th>
                  <th className="num">Clusters</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {barangays.map((b) => (
                  <tr
                    key={b.id}
                    className={b.id === selected ? "selected-row" : ""}
                    onClick={() => setSelected(b.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>
                      {b.name}
                      {!/active/i.test(b.status) && (
                        <span className="badge setting-badge role-none" style={{ marginLeft: 8 }}>
                          {b.status || "Inactive"}
                        </span>
                      )}
                    </td>
                    <td>
                      {b.code ? (
                        <code className="place-code">{b.code}</code>
                      ) : (
                        <span className="badge setting-badge role-none">Not set</span>
                      )}
                    </td>
                    <td className="num">{b.accounts.toLocaleString()}</td>
                    <td className="num">{b.clusters}</td>
                    <td className="num">
                      <button
                        className="link-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingBrgy(b);
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <div className="record-head" style={{ paddingBottom: 10, marginBottom: 10 }}>
            <span className="count">
              {current ? `Clusters in ${current.name}` : "Clusters"}
            </span>
            <button
              className="primary"
              disabled={!current}
              onClick={() => setEditingCluster("new")}
            >
              Add
            </button>
          </div>

          {data && !data.clustersEnabled && (
            <div className="form-notice">
              Clusters are switched off for this municipality. They are still
              stored and edited here, but account numbers and the reading list
              ignore them until <code>enablecluster</code> is turned on.
            </div>
          )}

          {!current ? (
            <p className="count">Pick a barangay to see its clusters.</p>
          ) : clusters.length === 0 ? (
            <p className="count">No clusters in {current.name}.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cluster</th>
                  <th>Code</th>
                  <th className="num">Accounts</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clusters.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.name}
                      {!/active/i.test(c.status) && (
                        <span className="badge setting-badge role-none" style={{ marginLeft: 8 }}>
                          {c.status || "Inactive"}
                        </span>
                      )}
                    </td>
                    <td>
                      {c.code ? (
                        <code className="place-code">{c.code}</code>
                      ) : (
                        <span className="badge setting-badge role-none">Not set</span>
                      )}
                    </td>
                    <td className="num">{c.accounts.toLocaleString()}</td>
                    <td className="num">
                      <button className="link-button" onClick={() => setEditingCluster(c)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editingBrgy && (
        <PlaceEditor
          kind="barangay"
          record={editingBrgy === "new" ? null : editingBrgy}
          codeColumn={data?.codeColumns.barangay ?? null}
          taken={barangays
            .filter((b) => editingBrgy === "new" || b.id !== editingBrgy.id)
            .map((b) => b.code)}
          barangays={barangays}
          onClose={() => setEditingBrgy(null)}
          onSaved={() => {
            setEditingBrgy(null);
            refresh();
          }}
        />
      )}
      {editingCluster && current && (
        <PlaceEditor
          kind="cluster"
          record={editingCluster === "new" ? null : editingCluster}
          codeColumn={data?.codeColumns.cluster ?? null}
          taken={(data?.clusters ?? [])
            .filter((c) => editingCluster === "new" || c.id !== editingCluster.id)
            .map((c) => c.code)}
          barangays={barangays}
          defaultBarangay={current.id}
          onClose={() => setEditingCluster(null)}
          onSaved={() => {
            setEditingCluster(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function PlaceEditor({
  kind,
  record,
  codeColumn,
  taken,
  barangays,
  defaultBarangay,
  onClose,
  onSaved,
}: {
  kind: "barangay" | "cluster";
  record: (Barangay | Cluster) | null;
  /** The column the code is stored in, or null when the table has none. */
  codeColumn: string | null;
  /** Codes already in use by the others, so a clash is caught before saving. */
  taken: string[];
  barangays: Barangay[];
  defaultBarangay?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(record?.name ?? "");
  const [code, setCode] = useState(record?.code ?? "");
  const [status, setStatus] = useState(record?.status || "Active");
  const [barangayId, setBarangayId] = useState(
    (record as Cluster | null)?.barangayId ?? defaultBarangay ?? barangays[0]?.id ?? 0,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const path = kind === "barangay" ? "barangays" : "clusters";
  const label = kind === "barangay" ? "barangay" : "cluster";

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body =
        kind === "barangay"
          ? { name, status, code }
          : { name, status, code, barangayId };
      if (record) {
        const r = await fetch(`/api/settings/${path}/${record.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not save");
      } else {
        await apiPost(`/api/settings/${path}`, body);
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!record) return;
    if (!confirm(`Remove ${record.name}?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/settings/${path}/${record.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not remove");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const inUse = record ? record.accounts > 0 : false;
  const clash =
    code.trim() !== "" &&
    taken.some((t) => t.trim().toLowerCase() === code.trim().toLowerCase());

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          {record ? `Edit ${label}` : `New ${label}`}
        </h2>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Name</span>
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Code</span>
          <input
            value={code}
            disabled={!codeColumn}
            onChange={(e) => setCode(e.target.value)}
            placeholder={kind === "barangay" ? "008" : "01"}
          />
          <span className="setting-note">
            {codeColumn ? (
              <>
                Goes into every new account number for this {label}, stored in{" "}
                <code>{codeColumn}</code>. Existing accounts keep the number they
                already have.
              </>
            ) : (
              <>
                No code column on this table, so there is nowhere to save it.
              </>
            )}
          </span>
        </label>

        {kind === "cluster" && (
          <label className="field-input" style={{ marginBottom: 12 }}>
            <span>Barangay</span>
            <select
              value={barangayId}
              onChange={(e) => setBarangayId(Number(e.target.value))}
            >
              {barangays.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field-input">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          <span className="setting-note">
            Inactive drops it from the pick lists. Accounts already there keep
            billing normally.
          </span>
        </label>

        {clash && (
          <div className="form-error">
            Code {code.trim()} is already used by another {label}. Two accounts
            would come out with the same number.
          </div>
        )}
        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button
            className="primary"
            disabled={busy || !name.trim() || clash}
            onClick={save}
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {record && (
            <>
              <div style={{ flexGrow: 1 }} />
              {inUse ? (
                <span className="count">
                  {record.accounts.toLocaleString()} account(s) here — mark it
                  Inactive instead.
                </span>
              ) : (
                <button className="danger small" onClick={remove} disabled={busy}>
                  Remove
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- *
 * Meter readers
 * -------------------------------------------------------------------- */

type MeterReader = { id: number; name: string; status: string };

function MeterReadersPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<MeterReader | "new" | null>(null);
  const [showRetired, setShowRetired] = useState(false);

  const { data, isLoading } = useQuery<MeterReader[]>({
    queryKey: ["meter-readers"],
    queryFn: () => apiGet<MeterReader[]>("/api/settings/meter-readers"),
  });

  const all = data ?? [];
  const active = all.filter((r) => /active/i.test(r.status));
  const shown = showRetired ? all : active;

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Meter readers</h2>
        <button className="clear-filters" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="count">
        A reader is never deleted — past readings carry their name. Retiring one
        marks them Inactive and drops them from the pick lists.
      </p>

      <div className="record-head" style={{ paddingBottom: 10, marginBottom: 10 }}>
        <label className="check-row" style={{ border: "none", padding: 0 }}>
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(e) => setShowRetired(e.target.checked)}
          />
          <span>
            Show retired ({all.length - active.length})
          </span>
        </label>
        <button className="primary" onClick={() => setEditing("new")}>
          Add meter reader
        </button>
      </div>

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>
                  <span
                    className={`badge setting-badge ${
                      /active/i.test(r.status) ? "role-prep" : "role-none"
                    }`}
                  >
                    {r.status || "—"}
                  </span>
                </td>
                <td className="num">
                  <button className="link-button" onClick={() => setEditing(r)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={3} className="count">
                  No meter readers listed.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {editing && (
        <MeterReaderEditor
          record={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ["meter-readers"] });
          }}
        />
      )}
    </section>
  );
}

function MeterReaderEditor({
  record,
  onClose,
  onSaved,
}: {
  record: MeterReader | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(record?.name ?? "");
  const [status, setStatus] = useState(record?.status || "Active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = { name, status };
      if (record) {
        const r = await fetch(`/api/settings/meter-readers/${record.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not save");
      } else {
        await apiPost("/api/settings/meter-readers", body);
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          {record ? "Edit meter reader" : "New meter reader"}
        </h2>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Name</span>
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="field-input">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="primary" disabled={busy || !name.trim()} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- *
 * O.R. number updater
 * -------------------------------------------------------------------- */

type OrCounter = {
  userId: number;
  user: string;
  orNumber: string;
  orSerial: string;
};

type OrCounterData = { me: number | null; serials: string[]; counters: OrCounter[] };

function OrCounterPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<OrCounter | null>(null);

  const { data, isLoading } = useQuery<OrCounterData>({
    queryKey: ["or-counter"],
    queryFn: () => apiGet<OrCounterData>("/api/settings/or-counter"),
  });

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>O.R. number updater</h2>
        <button className="clear-filters" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="count">
        The next number each clerk&apos;s booklet will issue. Two clerks work
        from two pads, so this is per sign-in rather than one counter for the
        office.
      </p>

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Clerk</th>
              <th className="num">Next O.R. number</th>
              <th>Serial</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(data?.counters ?? []).map((c) => (
              <tr key={c.userId}>
                <td>
                  {c.user}
                  {c.userId === data?.me && (
                    <span className="badge setting-badge role-prep" style={{ marginLeft: 8 }}>
                      You
                    </span>
                  )}
                </td>
                <td className="num">{c.orNumber || <span className="muted">—</span>}</td>
                <td>{c.orSerial || <span className="muted">—</span>}</td>
                <td className="num">
                  <button className="link-button" onClick={() => setEditing(c)}>
                    Change
                  </button>
                </td>
              </tr>
            ))}
            {data?.counters.length === 0 && (
              <tr>
                <td colSpan={4} className="count">
                  No booklets registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {editing && (
        <OrCounterEditor
          record={editing}
          serials={data?.serials ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ["or-counter"] });
            queryClient.invalidateQueries({ queryKey: ["or-settings"] });
          }}
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------------------- *
 * Backup — an on-demand pg_dump, on top of the scheduled nightly one from
 * DEPLOYMENT.md. Trigger only: it writes the file to the server's own
 * backups folder and reports back the name and size, nothing more (no
 * listing, download, or restore here).
 * -------------------------------------------------------------------- */

type BackupResult = { file: string; sizeBytes: number };

function BackupPanel({ onClose }: { onClose: () => void }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BackupResult | null>(null);
  const [error, setError] = useState("");

  const runBackup = async () => {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const r = await apiPost<{ ok: true; file: string; sizeBytes: number }>(
        "/api/settings/backup",
        {},
      );
      setResult({ file: r.file, sizeBytes: r.sizeBytes });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Back up now</h2>
        <button className="clear-filters" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="count">
        Takes a full copy of the database right now and saves it to the
        server&apos;s own <code>backups</code> folder. This is on top of the
        scheduled nightly backup — use it before a risky change, or whenever
        you want a fresh one on hand.
      </p>

      <button className="primary" onClick={runBackup} disabled={running}>
        {running ? "Backing up…" : "Back up now"}
      </button>

      {error && <div className="form-error">{error}</div>}

      {result && (
        <div className="form-notice">
          <b>Done.</b> Saved <code>{result.file}</code> (
          {(result.sizeBytes / (1024 * 1024)).toFixed(1)} MB) to the server&apos;s
          backups folder.
        </div>
      )}
    </section>
  );
}

function OrCounterEditor({
  record,
  serials,
  onClose,
  onSaved,
}: {
  record: OrCounter;
  serials: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [orNumber, setOrNumber] = useState("");
  const [orSerial, setOrSerial] = useState(record.orSerial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Left blank deliberately: this field is retyped from the pad in hand, not
  // nudged from what is already stored.
  const tooLong = orNumber.length > 7;
  const notDigits = orNumber !== "" && !/^\d+$/.test(orNumber);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/settings/or-counter/${record.userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orNumber, orSerial }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not save");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">O.R. counter</h2>
        <p className="modal-sub">{record.user}</p>

        <div className="or-current">
          <div>
            <span className="field-label">Current number</span>
            <strong>{record.orNumber || "—"}</strong>
          </div>
          <div>
            <span className="field-label">Current serial</span>
            <strong>{record.orSerial || "—"}</strong>
          </div>
        </div>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>New O.R. number</span>
          <input
            value={orNumber}
            autoFocus
            inputMode="numeric"
            onChange={(e) => setOrNumber(e.target.value.trim())}
          />
          <span className="setting-note">
            Up to 7 digits. The procedure that writes a payment takes a 7-character
            number, so an eighth digit is silently cut off in the payment row
            only — which breaks the link back to the receipt.
          </span>
        </label>

        <label className="field-input">
          <span>New serial</span>
          <input
            value={orSerial}
            list="or-serials"
            onChange={(e) => setOrSerial(e.target.value)}
          />
          <datalist id="or-serials">
            {serials.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>

        {(tooLong || notDigits) && (
          <div className="form-error">
            {tooLong ? "That is more than 7 digits." : "Digits only."}
          </div>
        )}
        {error && <div className="form-error">{error}</div>}

        <div className="form-notice" style={{ marginTop: 14 }}>
          Setting the counter back to a number already receipted is refused —
          the next payment would collide with the receipt that already has it.
        </div>

        <div className="form-actions">
          <button
            className="primary"
            disabled={busy || !orNumber || tooLong || notDigits}
            onClick={save}
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- *
 * Batch reading updater
 * -------------------------------------------------------------------- */

type BatchRow = {
  id: number;
  accountNo: string;
  name: string;
  cluster: string;
  reading: number;
};

type FilterOption = { id: number; name: string; barangayId?: number };

function BatchReadingPanel({ onClose }: { onClose: () => void }) {
  const [barangay, setBarangay] = useState<number | "">("");
  const [cluster, setCluster] = useState<number | "">("");
  const [loaded, setLoaded] = useState<BatchRow[] | null>(null);
  const [draft, setDraft] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<string>("");

  // /api/filters already maps the rows to { id, name } — reading the raw
  // column names here is what left every option blank.
  const { data: filters } = useQuery<{
    barangays: FilterOption[];
    clusters: FilterOption[];
  }>({
    queryKey: ["filters"],
    queryFn: () => apiGet("/api/filters"),
  });

  const barangays = filters?.barangays ?? [];
  const clusters = (filters?.clusters ?? []).filter(
    (c) => barangay === "" || c.barangayId === barangay,
  );

  async function load() {
    if (barangay === "") return;
    setBusy(true);
    setError("");
    setResult("");
    try {
      const qs = new URLSearchParams({ barangay: String(barangay) });
      if (cluster !== "") qs.set("cluster", String(cluster));
      const rows = await apiGet<BatchRow[]>(`/api/settings/batch-reading?${qs}`);
      setLoaded(rows);
      setDraft({});
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const rows = loaded ?? [];
  const changed = rows.filter(
    (r) => draft[r.id] !== undefined && draft[r.id] !== r.reading,
  );

  async function save() {
    if (changed.length === 0) return;
    if (
      !confirm(
        `Set the meter reference on ${changed.length} account(s)? The next bill for each will measure from the new number.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/settings/batch-reading", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: changed.map((r) => ({ id: r.id, reading: draft[r.id] })),
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error ?? "Could not save");
      setResult(`${body.changed} account(s) updated.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Batch reading updater</h2>
        <button className="clear-filters" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="count">
        Sets the meter reference an account&apos;s next bill measures from. It
        creates no readings and no bills — it moves the starting point, which is
        why the change is confirmed before it is written.
      </p>

      <div className="filter-row">
        <label className="field-input">
          <span>Barangay</span>
          <select
            value={barangay}
            onChange={(e) => {
              setBarangay(e.target.value === "" ? "" : Number(e.target.value));
              setCluster("");
              setLoaded(null);
            }}
          >
            <option value="">Pick a barangay…</option>
            {barangays.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field-input">
          <span>Cluster</span>
          <select
            value={cluster}
            disabled={barangay === "" || clusters.length === 0}
            onChange={(e) => {
              setCluster(e.target.value === "" ? "" : Number(e.target.value));
              setLoaded(null);
            }}
          >
            <option value="">All clusters</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <button className="primary" disabled={barangay === "" || busy} onClick={load}>
          {busy ? "Loading…" : "Generate"}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}
      {result && <div className="form-notice">{result}</div>}

      {loaded && (
        <>
          <div className="record-head" style={{ paddingBottom: 10, marginBottom: 10 }}>
            <span className="count">
              {rows.length} account(s)
              {changed.length > 0 ? ` · ${changed.length} changed` : ""}
            </span>
            <div className="head-actions">
              <button
                className="clear-filters"
                disabled={changed.length === 0 || busy}
                onClick={() => setDraft({})}
              >
                Discard changes
              </button>
              <button
                className="primary"
                disabled={changed.length === 0 || busy}
                onClick={save}
              >
                {busy ? "Saving…" : `Save ${changed.length || ""}`.trim()}
              </button>
            </div>
          </div>

          <div className="batch-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Account No.</th>
                  <th>Account name</th>
                  <th>Cluster</th>
                  <th className="num">Current</th>
                  <th className="num">New reading</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const value = draft[r.id] ?? r.reading;
                  const dirty = value !== r.reading;
                  return (
                    <tr key={r.id} className={dirty ? "selected-row" : ""}>
                      <td>{r.accountNo}</td>
                      <td>{r.name}</td>
                      <td>{r.cluster || <span className="muted">—</span>}</td>
                      <td className="num">{r.reading.toLocaleString()}</td>
                      <td className="num">
                        <input
                          className="amount-input"
                          type="number"
                          min={0}
                          value={value}
                          onChange={(e) =>
                            setDraft({ ...draft, [r.id]: Number(e.target.value) })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="count">
                      No accounts in that selection.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------- *
 * Users, roles and role access now live on their own page — see
 * UserManagementPage.tsx. That page also closes a gap this panel always
 * had: settings.ts had no role check at all, so any signed-in account could
 * already reach it; UserManagementPage's backing router (users.ts) requires
 * the "users" permission.
 * -------------------------------------------------------------------- */


/* -------------------------------------------------------------------- *
 * Disconnection notice
 * -------------------------------------------------------------------- */

type Placeholder = { token: string; label: string; sample: string };

type NoticeData = {
  note: string;
  placeholders: Placeholder[];
  arrearsForDisconnection: number;
};

/** The same tags the bill print allows through — anything else is stripped. */
const NOTE_TAGS = [
  "b", "strong", "i", "em", "u", "br", "center", "h3", "p", "span", "div", "font",
];

function NoticePanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);

  const { data, isLoading } = useQuery<NoticeData>({
    queryKey: ["notice"],
    queryFn: () => apiGet<NoticeData>("/api/settings/notice"),
  });

  const text = draft ?? data?.note ?? "";
  const placeholders = data?.placeholders ?? [];

  /** Insert at the caret, not at the end — the token usually belongs mid-sentence. */
  function insert(token: string) {
    const el = box.current;
    if (!el) {
      setDraft(text + token);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? start;
    const next = text.slice(0, start) + token + text.slice(end);
    setDraft(next);
    setSaved(false);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  // What the consumer will actually read: placeholders filled, then the same
  // sanitising the bill print applies, so nothing looks right here and
  // disappears on paper.
  const preview = useMemo(() => {
    let filled = text;
    for (const p of placeholders) filled = filled.replaceAll(p.token, p.sample);
    return DOMPurify.sanitize(filled, { ALLOWED_TAGS: NOTE_TAGS, ALLOWED_ATTR: [] });
  }, [text, placeholders]);

  const stripped = useMemo(() => {
    if (!text.trim()) return false;
    // Something was written that the bill print will throw away.
    const full = DOMPurify.sanitize(text, { ALLOWED_TAGS: NOTE_TAGS, ALLOWED_ATTR: [] });
    const bare = DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    return full !== text && full !== bare ? false : full !== text;
  }, [text]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/settings/notice", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: text }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not save");
      setSaved(true);
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["notice"] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Disconnection notice</h2>
        <button className="clear-filters" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="count">
        Stamped onto a bill as it is generated, for accounts{" "}
        {data?.arrearsForDisconnection ?? "…"} month
        {data?.arrearsForDisconnection === 1 ? "" : "s"} or more behind. Editing
        it changes the <b>next</b> bill run — bills already issued keep the
        notice they were printed with.
      </p>

      <div className="placeholder-row">
        <span className="count">Insert:</span>
        {placeholders.map((p) => (
          <button
            key={p.token}
            className="placeholder-chip"
            onClick={() => insert(p.token)}
            title={`${p.label} — e.g. ${p.sample}`}
          >
            <code>{p.token}</code>
            <span>{p.label}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : (
        <div className="notice-columns">
          <div>
            <span className="field-label">Markup</span>
            <textarea
              ref={box}
              className="notice-source"
              spellCheck={false}
              value={text}
              onChange={(e) => {
                setDraft(e.target.value);
                setSaved(false);
              }}
            />
            <span className="setting-note">
              {text.length} characters. Tags kept: {NOTE_TAGS.join(", ")}.
            </span>
          </div>

          <div>
            <span className="field-label">As it prints</span>
            <div
              className="notice-preview"
              dangerouslySetInnerHTML={{ __html: preview }}
            />
            <span className="setting-note">
              Placeholders shown with sample values. The date is the real
              disconnection date for this month.
            </span>
          </div>
        </div>
      )}

      {stripped && (
        <div className="form-notice">
          Some of that markup will not survive printing — the bill strips
          anything outside the tags listed above, along with every attribute.
          The preview already shows what is left.
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="form-actions">
        <button className="primary" disabled={busy || draft === null} onClick={save}>
          {busy ? "Saving…" : saved ? "Saved" : "Save notice"}
        </button>
        <button
          className="clear-filters"
          disabled={busy || draft === null}
          onClick={() => {
            setDraft(null);
            setSaved(false);
          }}
        >
          Discard
        </button>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- *
 * Batch bill details updater
 * -------------------------------------------------------------------- */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type BatchBillsPreview = {
  total: number;
  movable: number;
  locked: number;
  current: { billDate: string; readDate: string; dueDate: string } | null;
  bills: {
    id: number;
    accountNo: string;
    name: string;
    cluster: string;
    billDate: string;
    readDate: string;
    dueDate: string;
  }[];
};

function BatchBillsPanel({ onClose }: { onClose: () => void }) {
  const thisYear = new Date().getFullYear();

  const [barangay, setBarangay] = useState<number | "">("");
  const [cluster, setCluster] = useState<number | "">("");
  const [month, setMonth] = useState(MONTH_NAMES[new Date().getMonth()]);
  const [year, setYear] = useState(thisYear);

  const [newMonth, setNewMonth] = useState("");
  const [newYear, setNewYear] = useState<number | "">("");
  const [billDate, setBillDate] = useState("");
  const [readDate, setReadDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [preview, setPreview] = useState<BatchBillsPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  const { data: filters } = useQuery<{
    barangays: FilterOption[];
    clusters: FilterOption[];
  }>({
    queryKey: ["filters"],
    queryFn: () => apiGet("/api/filters"),
  });

  const { data: profile } = useQuery<{ enableCluster: number }>({
    queryKey: ["municipal-profile"],
    queryFn: () => apiGet("/api/settings/municipal-profile"),
  });

  const clustersOn = (profile?.enableCluster ?? 0) === 1;
  const barangays = filters?.barangays ?? [];
  const clusters = (filters?.clusters ?? []).filter(
    (c) => barangay === "" || c.barangayId === barangay,
  );

  function scope() {
    const qs = new URLSearchParams({
      barangay: String(barangay),
      month,
      year: String(year),
    });
    if (clustersOn && cluster !== "") qs.set("cluster", String(cluster));
    return qs;
  }

  async function load() {
    if (barangay === "") return;
    setBusy(true);
    setError("");
    setResult("");
    try {
      setPreview(await apiGet<BatchBillsPreview>(`/api/settings/batch-bills?${scope()}`));
    } catch (err) {
      setError((err as Error).message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  const moving = newMonth !== "" && newYear !== "";
  const changingDates = billDate !== "" || readDate !== "" || dueDate !== "";
  const canSave = preview !== null && preview.movable > 0 && (moving || changingDates);

  async function save() {
    if (!preview) return;
    const what = [
      moving ? `move them to ${newMonth} ${newYear}` : "",
      changingDates ? "set the dates" : "",
    ].filter(Boolean).join(" and ");
    if (!confirm(`This will ${what} on ${preview.movable} bill(s). Continue?`)) return;

    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/settings/batch-bills", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barangay,
          cluster: clustersOn && cluster !== "" ? cluster : undefined,
          month,
          year,
          newMonth: moving ? newMonth : undefined,
          newYear: moving ? newYear : undefined,
          billDate: billDate || undefined,
          readDate: readDate || undefined,
          dueDate: dueDate || undefined,
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error ?? "Could not update");
      setResult(`${body.changed} bill(s) updated.`);
      // Reload against the period the bills now live in.
      if (moving) {
        setMonth(newMonth);
        setYear(Number(newYear));
      }
      setNewMonth("");
      setNewYear("");
      setPreview(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Batch bill details updater</h2>
        <button className="clear-filters" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="count">
        For a run that went out stamped with the wrong period or the wrong
        dates. Paid bills are never touched — moving the period of a bill that
        has been receipted would leave the O.R. pointing at a month that no
        longer matches what was collected.
      </p>

      <h3 className="profile-head">Which bills</h3>
      <div className="filter-row">
        <label className="field-input">
          <span>Barangay</span>
          <select
            value={barangay}
            onChange={(e) => {
              setBarangay(e.target.value === "" ? "" : Number(e.target.value));
              setCluster("");
              setPreview(null);
            }}
          >
            <option value="">Pick a barangay…</option>
            {barangays.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        {clustersOn && (
          <label className="field-input">
            <span>Cluster</span>
            <select
              value={cluster}
              disabled={barangay === "" || clusters.length === 0}
              onChange={(e) => {
                setCluster(e.target.value === "" ? "" : Number(e.target.value));
                setPreview(null);
              }}
            >
              <option value="">All clusters</option>
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field-input">
          <span>Billing month</span>
          <select
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setPreview(null);
            }}
          >
            {MONTH_NAMES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="field-input">
          <span>Year</span>
          <select
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setPreview(null);
            }}
          >
            {Array.from({ length: 8 }, (_, i) => thisYear + 1 - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <button className="primary" disabled={barangay === "" || busy} onClick={load}>
          {busy ? "Loading…" : "Find bills"}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}
      {result && <div className="form-notice">{result}</div>}

      {preview && (
        <>
          <div className="form-notice">
            <b>
              {preview.movable.toLocaleString()} of {preview.total.toLocaleString()}{" "}
              bill(s) can be changed.
            </b>
            {preview.locked > 0 && (
              <>
                {" "}
                {preview.locked.toLocaleString()} are already paid and will be
                left alone.
              </>
            )}
            {preview.current && (
              <>
                {" "}
                Currently dated — bill {preview.current.billDate}, read{" "}
                {preview.current.readDate}, due {preview.current.dueDate}.
              </>
            )}
          </div>

          <h3 className="profile-head">What to change</h3>
          <p className="count">
            Leave a field blank to leave it as it is. Month and year move
            together.
          </p>

          <div className="filter-row">
            <label className="field-input">
              <span>Move to month</span>
              <select value={newMonth} onChange={(e) => setNewMonth(e.target.value)}>
                <option value="">Leave as {month}</option>
                {MONTH_NAMES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-input">
              <span>Move to year</span>
              <select
                value={newYear}
                onChange={(e) =>
                  setNewYear(e.target.value === "" ? "" : Number(e.target.value))
                }
              >
                <option value="">Leave as {year}</option>
                {Array.from({ length: 8 }, (_, i) => thisYear + 1 - i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="filter-row">
            <label className="field-input">
              <span>Bill date</span>
              <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
            </label>
            <label className="field-input">
              <span>Reading date</span>
              <input type="date" value={readDate} onChange={(e) => setReadDate(e.target.value)} />
            </label>
            <label className="field-input">
              <span>Due date</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          </div>

          {newMonth !== "" && newYear === "" && (
            <div className="form-error">Pick the year to move to as well.</div>
          )}
          {newYear !== "" && newMonth === "" && (
            <div className="form-error">Pick the month to move to as well.</div>
          )}

          <div className="form-actions">
            <button className="primary" disabled={busy || !canSave} onClick={save}>
              {busy ? "Saving…" : `Update ${preview.movable} bill(s)`}
            </button>
          </div>

          <h3 className="profile-head">
            Bills that will change
            {preview.movable > preview.bills.length
              ? ` — first ${preview.bills.length} of ${preview.movable}`
              : ""}
          </h3>

          <div className="batch-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Account No.</th>
                  <th>Account name</th>
                  {clustersOn && <th>Cluster</th>}
                  <th>Bill date</th>
                  <th>Reading date</th>
                  <th>Due date</th>
                </tr>
              </thead>
              <tbody>
                {preview.bills.map((b) => (
                  <tr key={b.id}>
                    <td>{b.accountNo}</td>
                    <td>{b.name}</td>
                    {clustersOn && <td>{b.cluster || <span className="muted">—</span>}</td>}
                    <td>{b.billDate}</td>
                    <td>{b.readDate}</td>
                    <td>{b.dueDate}</td>
                  </tr>
                ))}
                {preview.bills.length === 0 && (
                  <tr>
                    <td colSpan={clustersOn ? 6 : 5} className="count">
                      Nothing unpaid in that selection.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------- *
 * Account number series
 * -------------------------------------------------------------------- */

type SeriesRow = {
  scopeId: number;
  scope: string;
  parent: string | null;
  accounts: number;
  /** The highest number actually issued here — the account number's last segment. */
  highest: number;
  /** What the series table says comes next, or null if it has no row. */
  series: number | null;
  behind: boolean;
};

type SeriesData = {
  genType: number;
  genTypeLabel: string;
  scopeLabel: string;
  /** What acctcodegen.clusterID points at under the current setting. */
  keyMeaning: string;
  /** acctcodegen rows keyed to nothing under the current setting. */
  orphans: number[];
  rows: SeriesRow[];
};

function AccountSeriesPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SeriesRow | null>(null);
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery<SeriesData>({
    queryKey: ["account-series"],
    queryFn: () => apiGet<SeriesData>("/api/settings/account-series"),
  });

  const rows = data?.rows ?? [];
  const needle = search.trim().toLowerCase();
  const shown = needle
    ? rows.filter(
        (r) =>
          r.scope.toLowerCase().includes(needle) ||
          (r.parent ?? "").toLowerCase().includes(needle),
      )
    : rows;

  const behind = rows.filter((r) => r.behind);
  const missing = rows.filter((r) => r.series === null && r.accounts > 0);

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Account numbers</h2>
        <button className="clear-filters" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="count">
        Each new account is given the next number in its series. How many series
        there are is set under Municipal Profile Settings — currently{" "}
        <b>{data?.genTypeLabel ?? "…"}</b>.
      </p>

      {error && <div className="form-error">{(error as Error).message}</div>}

      {behind.length > 0 && (
        <div className="form-notice">
          <b>
            {behind.length === 1
              ? "One series has fallen behind."
              : `${behind.length} series have fallen behind.`}
          </b>{" "}
          {behind
            .slice(0, 6)
            .map((r) => `${r.scope} (series ${r.series}, ${r.highest} issued)`)
            .join(", ")}
          {behind.length > 6 ? `, and ${behind.length - 6} more` : ""}. The next
          account added there is handed a number that already exists, and the
          insert is refused. Set each series to at least the number issued.
        </div>
      )}

      {missing.length > 0 && (
        <div className="form-notice">
          <b>No series row:</b>{" "}
          {missing.slice(0, 8).map((r) => r.scope).join(", ")}
          {missing.length > 8 ? `, and ${missing.length - 8} more` : ""}. Setting
          one here creates it.
        </div>
      )}

      {(data?.orphans.length ?? 0) > 0 && (
        <div className="form-notice">
          <b>
            {data!.orphans.length} series row
            {data!.orphans.length === 1 ? "" : "s"} point at nothing.
          </b>{" "}
          <code>acctcodegen.clusterID</code> {data!.orphans.join(", ")} matches no{" "}
          {data!.scopeLabel.toLowerCase()} under the current setting — most
          likely left from when the series was kept a different way. Harmless,
          but nothing reads them.
        </div>
      )}

      <p className="setting-note">
        Held in <code>acctcodegen.series</code>, keyed on{" "}
        <code>acctcodegen.clusterID</code> — which under this setting holds{" "}
        <code>{data?.keyMeaning ?? "…"}</code>, not a cluster. Highest issued is
        the last segment of the account number, which is where the series lands.
      </p>

      {rows.length > 8 && (
        <div className="record-head" style={{ paddingBottom: 10, marginBottom: 10 }}>
          <input
            className="filter-input class-search"
            placeholder={`Search ${data?.scopeLabel.toLowerCase()}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="count">{shown.length} of {rows.length}</span>
        </div>
      )}

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : (
        <div className="batch-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{data?.scopeLabel}</th>
                <th className="num">Accounts</th>
                <th className="num">Highest issued</th>
                <th className="num">Series</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.scopeId} className={r.behind ? "selected-row" : ""}>
                  <td>
                    {r.scope}
                    {r.parent && <div className="setting-note">{r.parent}</div>}
                  </td>
                  <td className="num">{r.accounts.toLocaleString()}</td>
                  <td className="num">{r.highest.toLocaleString()}</td>
                  <td className="num">
                    {r.series === null ? (
                      <span className="muted">—</span>
                    ) : r.behind ? (
                      <span className="badge setting-badge role-none">
                        {r.series.toLocaleString()}
                      </span>
                    ) : (
                      r.series.toLocaleString()
                    )}
                  </td>
                  <td className="num">
                    <button className="link-button" onClick={() => setEditing(r)}>
                      {r.series === null ? "Set" : "Change"}
                    </button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="count">
                    {rows.length === 0
                      ? "No accounts yet, so no series to show."
                      : "Nothing matches that search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <SeriesEditor
          row={editing}
          scopeLabel={data?.scopeLabel ?? "Scope"}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ["account-series"] });
          }}
        />
      )}
    </section>
  );
}

function SeriesEditor({
  row,
  scopeLabel,
  onClose,
  onSaved,
}: {
  row: SeriesRow;
  scopeLabel: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(String(row.series ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const next = Number(value);
  const valid = /^\d+$/.test(value.trim());
  // The server refuses this too, but saying it here saves a round trip.
  const tooLow = valid && next < row.highest;

  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/settings/account-series", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeId: row.scopeId, series: next }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not save");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Account number series</h2>
        <p className="modal-sub">
          {scopeLabel}: {row.scope}
          {row.parent ? ` · ${row.parent}` : ""}
        </p>

        <div className="or-current">
          <div>
            <span className="field-label">Current series</span>
            <strong>{row.series ?? "—"}</strong>
          </div>
          <div>
            <span className="field-label">Highest issued</span>
            <strong>{row.highest.toLocaleString()}</strong>
          </div>
          <div>
            <span className="field-label">Accounts</span>
            <strong>{row.accounts.toLocaleString()}</strong>
          </div>
        </div>

        <label className="field-input">
          <span>New series</span>
          <input
            className="amount-input"
            inputMode="numeric"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value.trim())}
          />
          <span className="setting-note">
            The next account added here takes the number after this one.
            {row.series === null && " No row exists yet — saving creates one."}
          </span>
        </label>

        {tooLow && (
          <div className="form-error">
            {row.highest.toLocaleString()} has already been issued here. Anything
            below that hands the next account a number that exists.
          </div>
        )}
        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button
            className="primary"
            disabled={
              busy || !valid || tooLow || value === String(row.series ?? "")
            }
            onClick={save}
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
