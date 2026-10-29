import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "./api";
import { peso, today } from "./collectionTypes";
import AdminAuth from "./AdminAuth";

/**
 * The per-account action menu.
 *
 * Three groups, in the order the work actually happens: everyday edits, then
 * the three applications that raise a request and wait for a fee, then the
 * overrides. The desktop's flat stack of eleven coloured buttons gave a
 * "Change Address" the same weight as a "Force Disconnect".
 *
 * An action the account cannot take right now is shown greyed with the reason
 * on it, rather than hidden or failing on click — "why can't I transfer this
 * meter" is answerable without asking anyone.
 *
 * View Analytics is dropped: the charts are already on the account page.
 */

type Gate = { ok: boolean; why: string | null };

type Actions = {
  id: number;
  accountNo: string;
  name: string;
  status: number;
  statusName: string;
  balance: number;
  appFeeBalance: number;
  monthlyApp: number;
  clustersEnabled: boolean;
  /** null = a regular account. */
  category: "special" | null;
  can: Record<string, Gate>;
};

type Key =
  | "details" | "meter" | "appFee" | "classification" | "category" | "location"
  | "transferMeter" | "transferOwner" | "meterReplacement" | "tempCloseRequest"
  | "temporaryClose" | "forceDisconnect" | "forceConnect" | "cancelApply" | "deleteAccount";

const GROUPS: { title: string; note: string; items: { key: Key; label: string; admin?: boolean }[] }[] = [
  {
    title: "Edit",
    note: "Corrections to what is on file.",
    items: [
      { key: "details", label: "Update account details", admin: true },
      { key: "meter", label: "Update meter", admin: true },
      { key: "appFee", label: "Update application fee", admin: true },
      { key: "classification", label: "Change classification", admin: true },
      { key: "category", label: "Change account category", admin: true },
      { key: "location", label: "Change location", admin: true },
    ],
  },
  {
    title: "Apply",
    note: "Raises a request and waits for the fee to be paid at the counter.",
    items: [
      { key: "transferMeter", label: "Transfer meter" },
      { key: "transferOwner", label: "Transfer owner" },
      { key: "meterReplacement", label: "Meter replacement" },
      { key: "tempCloseRequest", label: "Request temporary closure" },
    ],
  },
  {
    title: "Override",
    note: "Changes the account's state directly. Every one is logged.",
    items: [
      { key: "temporaryClose", label: "Temporary closure (skip approval)", admin: true },
      { key: "forceDisconnect", label: "Force disconnect", admin: true },
      { key: "forceConnect", label: "Force connect", admin: true },
      { key: "deleteAccount", label: "Delete account (no records)", admin: true },
    ],
  },
];

/** The waiting-for-payment statuses, so the menu can offer to withdraw. */
const APPLY_STATUSES = [13, 14, 15];

export default function AccountActions({ acctId }: { acctId: number }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<Key | null>(null);
  const [notice, setNotice] = useState("");

  const { data } = useQuery<Actions>({
    queryKey: ["account-actions", acctId],
    queryFn: () => apiGet<Actions>(`/api/account-actions/${acctId}/actions`),
  });

  function done(message: string) {
    setAction(null);
    setOpen(false);
    setNotice(message);
    queryClient.invalidateQueries({ queryKey: ["account", String(acctId)] });
    queryClient.invalidateQueries({ queryKey: ["account-actions", acctId] });
    queryClient.invalidateQueries({ queryKey: ["account-editable", acctId] });
    queryClient.invalidateQueries({ queryKey: ["pending-counts"] });
  }

  const waiting = data ? APPLY_STATUSES.includes(data.status) : false;

  return (
    <div className="account-actions">
      <button className="primary" onClick={() => setOpen((v) => !v)}>
        Actions {open ? "▴" : "▾"}
      </button>

      {open && data && (
        <div className="action-menu" onMouseLeave={() => setOpen(false)}>
          {waiting && (
            <div className="action-group">
              <div className="action-note">
                This account is waiting for a fee to be paid. The request can be
                withdrawn until then.
              </div>
              <button
                className="action-item danger-item"
                onClick={() => setAction("cancelApply")}
              >
                Withdraw the request
              </button>
            </div>
          )}

          {GROUPS.map((g) => (
            <div className="action-group" key={g.title}>
              <div className="action-title">{g.title}</div>
              <div className="action-note">{g.note}</div>
              {g.items.map((item) => {
                const gate = data.can[item.key] ?? { ok: true, why: null };
                return (
                  <button
                    key={item.key}
                    className={
                      g.title === "Override" ? "action-item danger-item" : "action-item"
                    }
                    disabled={!gate.ok}
                    title={gate.why ?? undefined}
                    onClick={() => setAction(item.key)}
                  >
                    <span>{item.label}</span>
                    {item.admin && <span className="action-lock">admin</span>}
                    {!gate.ok && gate.why && (
                      <span className="action-why">{gate.why}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {notice && (
        <div className="form-notice action-notice">
          {notice}
          <button className="link-button" onClick={() => setNotice("")}>
            Dismiss
          </button>
        </div>
      )}

      {action && data && (
        <ActionDialog
          action={action}
          info={data}
          onClose={() => setAction(null)}
          onDone={done}
        />
      )}
    </div>
  );
}

/* ==================================================================== *
 * The dialogs
 * ==================================================================== */

function ActionDialog({
  action, info, onClose, onDone,
}: {
  action: Key;
  info: Actions;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const props = { info, onClose, onDone };
  switch (action) {
    case "details": return <DetailsForm {...props} />;
    case "meter": return <MeterForm {...props} />;
    case "appFee": return <AppFeeForm {...props} />;
    case "classification": return <ClassificationForm {...props} />;
    case "category": return <CategoryForm {...props} />;
    case "location": return <LocationForm {...props} kind="location" />;
    case "transferMeter": return <LocationForm {...props} kind="transfer" />;
    case "transferOwner": return <OwnerForm {...props} />;
    case "meterReplacement": return <ReplacementForm {...props} />;
    case "tempCloseRequest": return <TempCloseRequestForm {...props} />;
    case "temporaryClose": return <TempCloseForm {...props} />;
    case "forceDisconnect": return <ForceForm {...props} to="disconnect" />;
    case "forceConnect": return <ForceForm {...props} to="connect" />;
    case "cancelApply": return <CancelApplyForm {...props} />;
    case "deleteAccount": return <DeleteAccountForm {...props} />;
  }
}

type FormProps = {
  info: Actions;
  onClose: () => void;
  onDone: (m: string) => void;
};

/** Shell every dialog shares: title, the account, error, actions. */
function Shell({
  title, sub, info, error, busy, onClose, onSave, saveLabel, canSave, wide, children,
}: {
  title: string;
  sub?: string;
  info: Actions;
  error: string;
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
  saveLabel: string;
  canSave: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={wide ? "modal wide" : "modal"}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">{title}</h2>
        <p className="modal-sub">
          {info.accountNo} · {info.name}
          {sub ? ` · ${sub}` : ""}
        </p>

        {children}

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="primary" disabled={busy || !canSave} onClick={onSave}>
            {busy ? "Saving…" : saveLabel}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/** Admin credentials plus the reason every authorised action requires. */
function useAuth() {
  const [adminUser, setAdminUser] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [reason, setReason] = useState("");
  const ready = adminUser.trim() !== "" && adminPass !== "" && reason.trim() !== "";
  return { adminUser, adminPass, reason, setAdminUser, setAdminPass, setReason, ready };
}

function Reason({
  value, onChange, hint,
}: { value: string; onChange: (v: string) => void; hint: string }) {
  return (
    <label className="field-input" style={{ marginBottom: 12 }}>
      <span>Reason</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="setting-note">{hint}</span>
    </label>
  );
}

function useSave(onDone: (m: string) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(
    path: string,
    body: unknown,
    message: (r: any) => string,
    method: "PUT" | "POST" = "PUT",
  ) {
    setBusy(true);
    setError("");
    try {
      let r: any;
      if (method === "POST") {
        r = await apiPost<any>(path, body);
      } else {
        const res = await fetch(path, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        r = await res.json().catch(() => null);
        if (!res.ok) throw new Error(r?.error ?? "Could not save");
      }
      onDone(message(r));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return { busy, error, send };
}

/* ---- 1. Account details ------------------------------------------- */

function DetailsForm({ info, onClose, onDone }: FormProps) {
  const { data } = useQuery<any>({
    queryKey: ["account-editable", info.id],
    queryFn: () => apiGet(`/api/account-actions/${info.id}/editable`),
  });
  const { data: filters } = useQuery<{ consumerTypes: { id: number; name: string }[] }>({
    queryKey: ["filters"],
    queryFn: () => apiGet("/api/filters"),
  });

  const [f, setF] = useState<Record<string, string>>({});
  const auth = useAuth();
  const { busy, error, send } = useSave(onDone);

  // Seeded from the account the first time it arrives. Every field is filled
  // from what is on file — the desktop left HH members and SC count blank and
  // then wrote the blanks back as zeroes.
  const v = (key: string, fallback: unknown) =>
    f[key] !== undefined ? f[key] : fallback === null || fallback === undefined ? "" : String(fallback);
  const set = (key: string, value: string) => setF({ ...f, [key]: value });

  if (!data) return null;

  const senior = v("isSenior", data.isSenior) === "Yes";
  const renamed = v("name", data.name).trim() !== String(data.name ?? "").trim();

  return (
    <Shell
      title="Update account details"
      info={info}
      error={error}
      busy={busy}
      onClose={onClose}
      canSave={
        auth.ready &&
        v("name", data.name).trim() !== "" &&
        v("accountNo", data.accountNo).trim() !== ""
      }
      saveLabel="Save"
      wide
      onSave={() =>
        send(
          `/api/account-actions/${info.id}/details`,
          {
            accountNo: v("accountNo", data.accountNo),
            name: v("name", data.name),
            streetAddress: v("streetAddress", data.streetAddress),
            contactNum: v("contactNum", data.contactNum),
            agency: v("agency", data.agency),
            company: v("company", data.company),
            jobTitle: v("jobTitle", data.jobTitle),
            isSenior: v("isSenior", data.isSenior),
            seniorId: v("seniorId", data.seniorId),
            gender: v("gender", data.gender),
            consumerTypeId: Number(v("consumerTypeId", data.consumerTypeId)),
            householdMembers: Number(v("householdMembers", data.householdMembers ?? 0)),
            seniorCount: Number(v("seniorCount", data.seniorCount ?? 0)),
            reason: auth.reason,
            adminUser: auth.adminUser,
            adminPass: auth.adminPass,
          },
          (r) =>
            !r.changed
              ? "Nothing changed."
              : r.renamed
              ? "Account details saved — the owner name was changed without a transfer."
              : "Account details saved.",
        )
      }
    >
      <div className="form-grid">
        <label className="field-input">
          <span>Account no.</span>
          <input value={v("accountNo", data.accountNo)} onChange={(e) => set("accountNo", e.target.value)} />
        </label>
        <label className="field-input">
          <span>Name</span>
          <input value={v("name", data.name)} onChange={(e) => set("name", e.target.value)} />
          <span className="setting-note">
            Changing this renames the owner. Use Transfer owner for an actual
            change of owner — this is for correcting a spelling.
          </span>
        </label>
        <label className="field-input wide">
          <span>Street address</span>
          <input value={v("streetAddress", data.streetAddress)} onChange={(e) => set("streetAddress", e.target.value)} />
        </label>
        <label className="field-input">
          <span>Contact #</span>
          <input value={v("contactNum", data.contactNum)} onChange={(e) => set("contactNum", e.target.value)} />
        </label>
        <label className="field-input">
          <span>Agency</span>
          <input value={v("agency", data.agency)} onChange={(e) => set("agency", e.target.value)} />
        </label>
        <label className="field-input">
          <span>Company</span>
          <input value={v("company", data.company)} onChange={(e) => set("company", e.target.value)} />
          <span className="setting-note">
            Never saved by the desktop form — the field was there, the column was
            not written.
          </span>
        </label>
        <label className="field-input">
          <span>Job title</span>
          <input value={v("jobTitle", data.jobTitle)} onChange={(e) => set("jobTitle", e.target.value)} />
        </label>
        <label className="field-input">
          <span>Senior / PWD</span>
          <select value={v("isSenior", data.isSenior)} onChange={(e) => set("isSenior", e.target.value)}>
            <option value="No">No</option>
            <option value="Yes">Yes</option>
          </select>
        </label>
        <label className="field-input">
          <span>SC / PWD ID #</span>
          <input
            value={v("seniorId", data.seniorId)}
            disabled={!senior}
            onChange={(e) => set("seniorId", e.target.value)}
          />
        </label>
        <label className="field-input">
          <span>Gender</span>
          <select value={v("gender", data.gender)} onChange={(e) => set("gender", e.target.value)}>
            <option value="">—</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </label>
        <label className="field-input">
          <span>Type</span>
          <select
            value={v("consumerTypeId", data.consumerTypeId)}
            onChange={(e) => set("consumerTypeId", e.target.value)}
          >
            {(filters?.consumerTypes ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="field-input">
          <span>HH members</span>
          <input
            className="amount-input"
            type="number"
            min={0}
            value={v("householdMembers", data.householdMembers ?? 0)}
            onChange={(e) => set("householdMembers", e.target.value)}
          />
        </label>
        <label className="field-input">
          <span>SC count</span>
          <input
            className="amount-input"
            type="number"
            min={0}
            value={v("seniorCount", data.seniorCount ?? 0)}
            onChange={(e) => set("seniorCount", e.target.value)}
          />
          <span className="setting-note">
            How many seniors live at the connection.
          </span>
        </label>
      </div>

      {renamed && (
        <div className="form-notice">
          <b>This changes the owner&apos;s name.</b> That is what Transfer owner
          does, with a fee and a record of who it moved from and to — doing it
          here does neither. Correcting a spelling is fine; an actual change of
          owner should go through Transfer owner.
        </div>
      )}

      <Reason
        value={auth.reason}
        onChange={auth.setReason}
        hint="Goes on the account log with both names."
      />
      <AdminAuth
        username={auth.adminUser}
        password={auth.adminPass}
        onUsername={auth.setAdminUser}
        onPassword={auth.setAdminPass}
        disabled={busy}
      />
    </Shell>
  );
}

/* ---- 2. Meter ------------------------------------------------------ */

function MeterForm({ info, onClose, onDone }: FormProps) {
  const { data } = useQuery<any>({
    queryKey: ["account-editable", info.id],
    queryFn: () => apiGet(`/api/account-actions/${info.id}/editable`),
  });
  const { data: filters } = useQuery<{ meterSizes: { id: number; name: string }[] }>({
    queryKey: ["filters"],
    queryFn: () => apiGet("/api/filters"),
  });

  const [f, setF] = useState<Record<string, string>>({});
  const auth = useAuth();
  const { busy, error, send } = useSave(onDone);
  const v = (k: string, d: unknown) => (f[k] !== undefined ? f[k] : d === null || d === undefined ? "" : String(d));

  if (!data) return null;

  return (
    <Shell
      title="Update meter"
      info={info}
      error={error}
      busy={busy}
      onClose={onClose}
      canSave={auth.ready && v("meterNo", data.meterNo).trim() !== ""}
      saveLabel="Save"
      onSave={() =>
        send(
          `/api/account-actions/${info.id}/meter`,
          {
            meterNo: v("meterNo", data.meterNo),
            standpipe: v("standpipe", data.standpipe),
            meterSizeId: Number(v("meterSizeId", data.meterSizeId)),
            meterReference: Number(v("meterReference", data.meterReference ?? 0)),
            reason: auth.reason,
            adminUser: auth.adminUser,
            adminPass: auth.adminPass,
          },
          (r) => (r.changed ? "Meter updated." : "Nothing changed."),
        )
      }
    >
      <div className="form-notice">
        This writes the meter and its reading straight onto the account, which
        is how a meter gets swapped <b>without</b> going through Meter
        Replacement — no fee, and no record of the old meter&apos;s final
        reading. Use Meter Replacement for an actual swap; use this to fix a
        typo.
      </div>

      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>Stand pipe</span>
        <input value={v("standpipe", data.standpipe)} onChange={(e) => setF({ ...f, standpipe: e.target.value })} />
      </label>
      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>Meter number</span>
        <input value={v("meterNo", data.meterNo)} onChange={(e) => setF({ ...f, meterNo: e.target.value })} />
      </label>
      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>Meter size</span>
        <select
          value={v("meterSizeId", data.meterSizeId)}
          onChange={(e) => setF({ ...f, meterSizeId: e.target.value })}
        >
          {(filters?.meterSizes ?? []).map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </label>
      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>Latest reading</span>
        <input
          className="amount-input"
          type="number"
          min={0}
          value={v("meterReference", data.meterReference ?? 0)}
          onChange={(e) => setF({ ...f, meterReference: e.target.value })}
        />
        <span className="setting-note">
          The next bill measures from here.
        </span>
      </label>

      <Reason value={auth.reason} onChange={auth.setReason} hint="Goes on the account log." />
      <AdminAuth
        username={auth.adminUser}
        password={auth.adminPass}
        onUsername={auth.setAdminUser}
        onPassword={auth.setAdminPass}
        disabled={busy}
      />
    </Shell>
  );
}

/* ---- 3. Application fee -------------------------------------------- */

function AppFeeForm({ info, onClose, onDone }: FormProps) {
  const [balance, setBalance] = useState(String(info.appFeeBalance));
  const [monthly, setMonthly] = useState(String(info.monthlyApp));
  const auth = useAuth();
  const { busy, error, send } = useSave(onDone);

  return (
    <Shell
      title="Update application fee"
      info={info}
      error={error}
      busy={busy}
      onClose={onClose}
      canSave={auth.ready}
      saveLabel="Save"
      onSave={() =>
        send(
          `/api/account-actions/${info.id}/app-fee`,
          {
            balance: Number(balance || 0),
            monthly: Number(monthly || 0),
            reason: auth.reason,
            adminUser: auth.adminUser,
            adminPass: auth.adminPass,
          },
          () => "Application fee updated.",
        )
      }
    >
      <div className="or-current">
        <div>
          <span className="field-label">Current balance</span>
          <strong>{peso.format(info.appFeeBalance)}</strong>
        </div>
        <div>
          <span className="field-label">Monthly installment</span>
          <strong>{peso.format(info.monthlyApp)}</strong>
        </div>
      </div>

      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>Monthly fee</span>
        <input
          className="amount-input"
          type="number"
          step="0.01"
          min={0}
          value={monthly}
          onChange={(e) => setMonthly(e.target.value)}
        />
        <span className="setting-note">
          What each bill draws down from the balance.
        </span>
      </label>

      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>Application fee balance</span>
        <input
          className="amount-input"
          type="number"
          step="0.01"
          min={0}
          value={balance}
          autoFocus
          onChange={(e) => setBalance(e.target.value)}
        />
      </label>

      <Reason value={auth.reason} onChange={auth.setReason} hint="This moves money — say why." />
      <AdminAuth
        username={auth.adminUser}
        password={auth.adminPass}
        onUsername={auth.setAdminUser}
        onPassword={auth.setAdminPass}
        disabled={busy}
      />
    </Shell>
  );
}

/* ---- 4. Classification --------------------------------------------- */

function ClassificationForm({ info, onClose, onDone }: FormProps) {
  const { data } = useQuery<{
    currentId: number; current: string; typeSpec: string;
    options: { id: number; name: string; code: string }[];
  }>({
    queryKey: ["account-classifications", info.id],
    queryFn: () => apiGet(`/api/account-actions/${info.id}/classifications`),
  });

  const [classId, setClassId] = useState("");
  const auth = useAuth();
  const { busy, error, send } = useSave(onDone);

  return (
    <Shell
      title="Change classification"
      info={info}
      error={error}
      busy={busy}
      onClose={onClose}
      canSave={auth.ready && classId !== ""}
      saveLabel="Save"
      onSave={() =>
        send(
          `/api/account-actions/${info.id}/classification`,
          {
            classId: Number(classId),
            reason: auth.reason,
            adminUser: auth.adminUser,
            adminPass: auth.adminPass,
          },
          (r) => (r.changed ? `Now ${r.to}.` : "Nothing changed."),
        )
      }
    >
      <div className="or-current">
        <div>
          <span className="field-label">Classification</span>
          <strong>{data?.current || "—"}</strong>
        </div>
        <div>
          <span className="field-label">Type specification</span>
          <strong>{data?.typeSpec || "None"}</strong>
        </div>
      </div>

      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>New classification</span>
        <select value={classId} autoFocus onChange={(e) => setClassId(e.target.value)}>
          <option value="">Choose…</option>
          {(data?.options ?? [])
            .filter((o) => o.id !== data?.currentId)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}{o.code ? ` (${o.code})` : ""}
              </option>
            ))}
        </select>
        <span className="setting-note">
          Only classifications matching this account&apos;s type specification
          are offered.
        </span>
      </label>

      <div className="form-notice">
        The next bill prices against the new classification. Bills already
        issued keep the amounts they were billed at.
      </div>

      <Reason value={auth.reason} onChange={auth.setReason} hint="This changes what the account is charged." />
      <AdminAuth
        username={auth.adminUser}
        password={auth.adminPass}
        onUsername={auth.setAdminUser}
        onPassword={auth.setAdminPass}
        disabled={busy}
      />
    </Shell>
  );
}

/* ---- 4b. Account category ------------------------------------------ */

const CATEGORY_LABEL = { regular: "Regular account", special: "Special account" } as const;

function CategoryForm({ info, onClose, onDone }: FormProps) {
  const current = info.category ?? "regular";
  const [category, setCategory] = useState<keyof typeof CATEGORY_LABEL>(
    current === "special" ? "regular" : "special",
  );
  const auth = useAuth();
  const { busy, error, send } = useSave(onDone);

  return (
    <Shell
      title="Change account category"
      info={info}
      error={error}
      busy={busy}
      onClose={onClose}
      canSave={auth.ready && category !== current}
      saveLabel="Save"
      onSave={() =>
        send(
          `/api/account-actions/${info.id}/category`,
          {
            category,
            reason: auth.reason,
            adminUser: auth.adminUser,
            adminPass: auth.adminPass,
          },
          (r) => (r.changed ? `Now a ${String(r.to).toLowerCase()}.` : "Nothing changed."),
        )
      }
    >
      <div className="or-current">
        <div>
          <span className="field-label">Category</span>
          <strong>{CATEGORY_LABEL[current]}</strong>
        </div>
      </div>

      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>New category</span>
        <select
          value={category}
          autoFocus
          onChange={(e) => setCategory(e.target.value as keyof typeof CATEGORY_LABEL)}
        >
          {(Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]).map((k) => (
            <option key={k} value={k}>{CATEGORY_LABEL[k]}</option>
          ))}
        </select>
        <span className="setting-note">
          Separate from the classification, which still sets the tariff.
        </span>
      </label>

      <div className="form-notice">
        {category === "special"
          ? "For accounts that always pay late because payment goes through a check request first. From the next bill on, the penalty is added to the water service fee and the penalty shows as zero — one amount, the same before and after the due date."
          : "From the next bill on, the penalty is billed separately again and only applies after the due date."}{" "}
        Bills already issued keep the amounts they were billed at.
      </div>

      <Reason value={auth.reason} onChange={auth.setReason} hint="This changes how the account is billed." />
      <AdminAuth
        username={auth.adminUser}
        password={auth.adminPass}
        onUsername={auth.setAdminUser}
        onPassword={auth.setAdminPass}
        disabled={busy}
      />
    </Shell>
  );
}

/* ---- Delete an account that never did anything ---------------------- */

function DeleteAccountForm({ info, onClose, onDone }: FormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const auth = useAuth();
  // The account is gone afterwards, so leave its page for the list.
  const { busy, error, send } = useSave((m) => {
    onDone(m);
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    navigate("/accounts");
  });

  return (
    <Shell
      title="Delete account"
      info={info}
      error={error}
      busy={busy}
      onClose={onClose}
      canSave={auth.ready && auth.reason.trim().length >= 10}
      saveLabel="Delete the account"
      onSave={() =>
        send(
          `/api/account-actions/${info.id}/delete`,
          { reason: auth.reason, adminUser: auth.adminUser, adminPass: auth.adminPass },
          (r) => `Account ${r.accountNo} deleted.`,
          "POST",
        )
      }
    >
      <div className="form-notice">
        For an account that never did anything — carried over from the old system, disconnected, and never
        billed or paid. It disappears from every list. Its own small leftovers (log entries such as a stand pipe
        or meter number change, a map pin, notes) go with it.
        <br />
        <br />
        A copy of all of it is kept in the deleted-accounts archive, with who deleted it, who authorised it and
        why, in case it has to be put back.
      </div>
      <Reason
        value={auth.reason}
        onChange={auth.setReason}
        hint="At least 10 characters — e.g. Migrated from the legacy app, never had a bill or a payment."
      />
      <AdminAuth
        username={auth.adminUser}
        password={auth.adminPass}
        onUsername={auth.setAdminUser}
        onPassword={auth.setAdminPass}
        disabled={busy}
      />
    </Shell>
  );
}

/* ---- 5 + 6. Location: correction, or a paid transfer ---------------- */

function LocationForm({
  info, onClose, onDone, kind,
}: FormProps & { kind: "location" | "transfer" }) {
  const { data: account } = useQuery<any>({
    queryKey: ["account-editable", info.id],
    queryFn: () => apiGet(`/api/account-actions/${info.id}/editable`),
  });
  const { data: filters } = useQuery<{
    barangays: { id: number; name: string }[];
    clusters: { id: number; name: string; barangayId: number }[];
  }>({
    queryKey: ["filters"],
    queryFn: () => apiGet("/api/filters"),
  });

  const [barangay, setBarangay] = useState("");
  const [cluster, setCluster] = useState("");
  const [street, setStreet] = useState("");
  const [standpipe, setStandpipe] = useState("");
  const auth = useAuth();
  const { busy, error, send } = useSave(onDone);

  const correction = kind === "location";
  const clusters = (filters?.clusters ?? []).filter(
    (c) => barangay === "" || c.barangayId === Number(barangay),
  );

  const ready = correction
    ? auth.ready && barangay !== ""
    : barangay !== "" && street.trim() !== "";

  return (
    <Shell
      title={correction ? "Change location" : "Transfer meter"}
      info={info}
      error={error}
      busy={busy}
      onClose={onClose}
      canSave={ready}
      saveLabel={correction ? "Save" : "Apply"}
      onSave={() =>
        correction
          ? send(
              `/api/account-actions/${info.id}/location`,
              {
                barangayId: Number(barangay),
                clusterId: cluster === "" ? 0 : Number(cluster),
                streetAddress: street,
                standpipe,
                reason: auth.reason,
                adminUser: auth.adminUser,
                adminPass: auth.adminPass,
              },
              () => "Location corrected.",
            )
          : send(
              `/api/account-actions/${info.id}/apply/meter-transfer`,
              {
                barangayId: Number(barangay),
                clusterId: cluster === "" ? 0 : Number(cluster),
                streetAddress: street,
                standpipe,
              },
              (r) => `Transfer requested — now waiting for ${r.waitingFor}.`,
              "POST",
            )
      }
    >
      <div className="or-current">
        <div>
          <span className="field-label">Address</span>
          <strong>{account?.streetAddress || "—"}</strong>
        </div>
        {info.clustersEnabled && (
          <div>
            <span className="field-label">Cluster</span>
            <strong>{account?.cluster || "—"}</strong>
          </div>
        )}
        <div>
          <span className="field-label">Barangay</span>
          <strong>{account?.barangay || "—"}</strong>
        </div>
        <div>
          <span className="field-label">Standpipe</span>
          <strong>{account?.standpipe || "—"}</strong>
        </div>
      </div>

      <h3 className="profile-head">{correction ? "Corrected to" : "New address"}</h3>

      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>Barangay</span>
        <select
          value={barangay}
          autoFocus
          onChange={(e) => {
            setBarangay(e.target.value);
            setCluster("");
          }}
        >
          <option value="">Choose…</option>
          {(filters?.barangays ?? []).map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>

      {info.clustersEnabled && (
        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Cluster</span>
          <select
            value={cluster}
            disabled={barangay === "" || clusters.length === 0}
            onChange={(e) => setCluster(e.target.value)}
          >
            <option value="">—</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}

      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>Address</span>
        <input value={street} onChange={(e) => setStreet(e.target.value)} />
      </label>

      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>Standpipe</span>
        <input value={standpipe} onChange={(e) => setStandpipe(e.target.value)} />
      </label>

      {correction ? (
        <>
          <div className="form-notice">
            This moves the account on paper without a transfer fee, which is how
            a meter gets relocated <b>without</b> going through Meter Transfer.
            Use Transfer meter for an actual move; use this to fix a wrong
            barangay or a misspelt street. The account number does not change —
            it records where the connection was originally made.
          </div>
          <Reason value={auth.reason} onChange={auth.setReason} hint="Goes on the account log." />
          <AdminAuth
            username={auth.adminUser}
            password={auth.adminPass}
            onUsername={auth.setAdminUser}
            onPassword={auth.setAdminPass}
            disabled={busy}
          />
        </>
      ) : (
        <div className="form-notice">
          This raises a request only. The account moves to waiting-for-payment;
          once the transfer fee is receipted at the counter it appears under
          Pendings → Meter transfer, where the move is recorded.
        </div>
      )}
    </Shell>
  );
}

/* ---- 7. Owner transfer --------------------------------------------- */

function OwnerForm({ info, onClose, onDone }: FormProps) {
  const [newOwner, setNewOwner] = useState("");
  const [date, setDate] = useState(today());
  const { busy, error, send } = useSave(onDone);

  return (
    <Shell
      title="Transfer of ownership"
      info={info}
      error={error}
      busy={busy}
      onClose={onClose}
      canSave={newOwner.trim() !== ""}
      saveLabel="Apply"
      onSave={() =>
        send(
          `/api/account-actions/${info.id}/apply/owner-transfer`,
          { newOwner, date },
          (r) => `Transfer requested — now waiting for ${r.waitingFor}.`,
          "POST",
        )
      }
    >
      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      <div className="or-current">
        <div>
          <span className="field-label">Current owner</span>
          <strong>{info.name}</strong>
        </div>
      </div>

      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>New owner</span>
        <input value={newOwner} autoFocus onChange={(e) => setNewOwner(e.target.value)} />
      </label>

      <div className="form-notice">
        This raises a request only. Once the transfer fee is receipted the
        account appears under Pendings → Owner transfer, where the name is
        actually changed. Its history stays with the account.
      </div>
    </Shell>
  );
}

/* ---- 8. Meter replacement ------------------------------------------ */

function ReplacementForm({ info, onClose, onDone }: FormProps) {
  const { data } = useQuery<any>({
    queryKey: ["account-editable", info.id],
    queryFn: () => apiGet(`/api/account-actions/${info.id}/editable`),
  });
  const [reason, setReason] = useState("");
  const { busy, error, send } = useSave(onDone);

  return (
    <Shell
      title="Meter replacement"
      info={info}
      error={error}
      busy={busy}
      onClose={onClose}
      canSave
      saveLabel="Apply"
      onSave={() =>
        send(
          `/api/account-actions/${info.id}/apply/meter-replacement`,
          { reason },
          (r) => `Replacement requested — now waiting for ${r.waitingFor}.`,
          "POST",
        )
      }
    >
      <div className="or-current">
        <div>
          <span className="field-label">Current serial</span>
          <strong>{data?.meterNo || "—"}</strong>
        </div>
        <div>
          <span className="field-label">Current reading</span>
          <strong>{(data?.meterReference ?? 0).toLocaleString()}</strong>
        </div>
      </div>

      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>Reason</span>
        <input
          value={reason}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
          placeholder="Stuck, broken glass, running backwards…"
        />
      </label>

      <div className="form-notice">
        The serial and reading above are recorded now, as the meter stands.
        Once the replacement fee is receipted the account appears under
        Pendings → Meter replacement, where the swap is recorded.
      </div>
    </Shell>
  );
}

/* ---- 8b. Request temporary closure ---------------------------------- */

/** The formal Request for Temporary/Voluntary Disconnection — waits on an
 *  approver (see the Approvals page's Temporary Closure tab) rather than
 *  acting immediately, unlike the admin-gated override below it. */
function TempCloseRequestForm({ info, onClose, onDone }: FormProps) {
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const { busy, error, send } = useSave(onDone);

  return (
    <Shell
      title="Request temporary closure"
      info={info}
      error={error}
      busy={busy}
      onClose={onClose}
      canSave={!!reason.trim()}
      saveLabel="Submit request"
      onSave={() =>
        send(
          `/api/temp-closure/${info.id}/request`,
          { date, reason, requestedBy },
          () => "Request submitted — waiting on an approver.",
          "POST",
        )
      }
    >
      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>Date applied</span>
        <input type="date" value={date} autoFocus onChange={(e) => setDate(e.target.value)} />
      </label>

      <Reason
        value={reason}
        onChange={setReason}
        hint="Why the consumer is closing — travelling, building work, vacant."
      />

      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>Requested by</span>
        <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
      </label>

      <div className="form-notice">
        This does not change the account yet. Once an approver signs off in
        Approvals → Temporary Closure, the account moves to pending closure
        and appears under Job Orders.
      </div>
    </Shell>
  );
}

/* ---- 9. Temporary closure ------------------------------------------ */

function TempCloseForm({ info, onClose, onDone }: FormProps) {
  const [date, setDate] = useState(today());
  const auth = useAuth();
  const { busy, error, send } = useSave(onDone);

  return (
    <Shell
      title="Temporary closure"
      info={info}
      error={error}
      busy={busy}
      onClose={onClose}
      canSave={auth.ready}
      saveLabel="Request closure"
      onSave={() =>
        send(
          `/api/account-actions/${info.id}/temporary-close`,
          {
            date,
            reason: auth.reason,
            adminUser: auth.adminUser,
            adminPass: auth.adminPass,
          },
          () => "Closure requested — the tap still needs shutting off.",
          "POST",
        )
      }
    >
      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>Date</span>
        <input type="date" value={date} autoFocus onChange={(e) => setDate(e.target.value)} />
      </label>

      <Reason
        value={auth.reason}
        onChange={auth.setReason}
        hint="Why the consumer is closing — travelling, building work, vacant."
      />

      <div className="form-notice">
        This marks the account <b>pending</b> temporary closure. It is not
        closed until the tap is actually shut off and that is confirmed.
      </div>

      <AdminAuth
        username={auth.adminUser}
        password={auth.adminPass}
        onUsername={auth.setAdminUser}
        onPassword={auth.setAdminPass}
        disabled={busy}
      />
    </Shell>
  );
}

/* ---- 10 + 11. The overrides ---------------------------------------- */

function ForceForm({
  info, onClose, onDone, to,
}: FormProps & { to: "connect" | "disconnect" }) {
  const auth = useAuth();
  const { busy, error, send } = useSave(onDone);
  const connecting = to === "connect";

  return (
    <Shell
      title={connecting ? "Force connect" : "Force disconnect"}
      sub={info.statusName}
      info={info}
      error={error}
      busy={busy}
      onClose={onClose}
      canSave={auth.ready}
      saveLabel={connecting ? "Force connect" : "Force disconnect"}
      onSave={() =>
        send(
          `/api/account-actions/${info.id}/force-${to}`,
          { reason: auth.reason, adminUser: auth.adminUser, adminPass: auth.adminPass },
          () => (connecting ? "Account connected." : "Account disconnected."),
          "POST",
        )
      }
    >
      <div className="form-notice">
        {connecting ? (
          <>
            This connects the account directly, <b>without</b> a reconnection
            fee and without going through Pendings. Use it to undo a mistake,
            not to reconnect a consumer who owes one.
          </>
        ) : (
          <>
            This disconnects the account directly, <b>without</b> going onto the
            disconnection list or being printed for the crew. The consumer will
            owe a reconnection fee to come back on.
          </>
        )}
      </div>

      <Reason value={auth.reason} onChange={auth.setReason} hint="Goes on the account log with both names." />
      <AdminAuth
        username={auth.adminUser}
        password={auth.adminPass}
        onUsername={auth.setAdminUser}
        onPassword={auth.setAdminPass}
        disabled={busy}
      />
    </Shell>
  );
}

/* ---- Withdraw a request -------------------------------------------- */

function CancelApplyForm({ info, onClose, onDone }: FormProps) {
  const [reason, setReason] = useState("");
  const { busy, error, send } = useSave(onDone);

  return (
    <Shell
      title="Withdraw the request"
      sub={info.statusName}
      info={info}
      error={error}
      busy={busy}
      onClose={onClose}
      canSave
      saveLabel="Withdraw"
      onSave={() =>
        send(
          `/api/account-actions/${info.id}/apply/cancel`,
          { reason },
          () => "Request withdrawn — the account is connected again.",
          "POST",
        )
      }
    >
      <div className="form-notice">
        The account goes back to Connected and the request is marked cancelled.
        Only possible while the fee is unpaid.
      </div>

      <label className="field-input">
        <span>Reason</span>
        <input
          value={reason}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
          placeholder="Applied by mistake, consumer changed their mind…"
        />
      </label>
    </Shell>
  );
}
