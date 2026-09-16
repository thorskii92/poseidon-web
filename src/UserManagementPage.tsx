import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, ApiError } from "./api";
import { useAuth } from "./AuthContext";

/**
 * User Management — accounts, system roles, and which pages/capabilities
 * each role grants.
 *
 * A fresh design, not a port: the legacy desktop had no screen for this at
 * all (accounts were set up directly in MySQL), and before this page
 * existed nothing in the web app gated access by role either — every nav
 * item was visible to any signed-in account. Roles & Access is what closes
 * that: a role starts with nothing, and only grants what is checked here
 * (see poseidon-api's permissions.ts for the "why" behind that default, and
 * for the two capabilities — Approve requests, Authorise admin actions —
 * that already existed as narrower, single-purpose checks before this page
 * unified them into the same table as page access).
 */

type Tab = "users" | "roles" | "activity";

const TABS: { key: Tab; label: string }[] = [
  { key: "users", label: "Users" },
  { key: "roles", label: "Roles & Access" },
  { key: "activity", label: "Activity" },
];

export default function UserManagementPage() {
  const [tab, setTab] = useState<Tab>("users");
  const { can } = useAuth();

  // The sidebar already hides this link from anyone without "users" — this
  // is the same defense-in-depth every mutating request already has via
  // requirePermission on the API side, for the rare case of a direct URL.
  if (!can("users")) {
    return (
      <div className="settings-page">
        <div className="detail-head">
          <h1>User Management</h1>
        </div>
        <p className="count">This isn't available to your role.</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>User Management</h1>
          <p className="account-no">
            Who can sign in, what role they hold, and what each role can reach.
          </p>
        </div>
      </div>

      <div className="stage-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "stage-tab current" : "stage-tab"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "users" && <UsersTab />}
      {tab === "roles" && <RolesTab />}
      {tab === "activity" && <ActivityTab />}
    </div>
  );
}

/* ==================================================================== *
 * Users
 * ==================================================================== */

type AppUser = {
  id: number;
  username: string;
  fullName: string;
  position: string;
  status: string;
  typeId: number;
  type: string;
  roleId: number;
  role: string;
  plainText: boolean;
  mustChangePassword: boolean;
};

type UsersData = {
  me: number | null;
  users: AppUser[];
  types: { id: number; name: string; users: number }[];
  roles: { id: number; name: string }[];
};

function UsersTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AppUser | "new" | null>(null);
  const [password, setPassword] = useState<AppUser | null>(null);
  const [resetResult, setResetResult] = useState<{ user: AppUser; password: string } | null>(null);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [resetError, setResetError] = useState("");
  const [retiringId, setRetiringId] = useState<number | null>(null);
  const [retireError, setRetireError] = useState("");
  const [editingType, setEditingType] = useState<
    { id: number; name: string; users: number } | "new" | null
  >(null);

  const { data, isLoading } = useQuery<UsersData>({
    queryKey: ["user-mgmt-users"],
    queryFn: () => apiGet<UsersData>("/api/users"),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["user-mgmt-users"] });
  const users = data?.users ?? [];
  const legacy = users.filter((u) => u.plainText);

  async function resetPassword(u: AppUser) {
    if (!confirm(`Reset ${u.fullName}'s password? Their current one stops working immediately.`)) return;
    setResettingId(u.id);
    setResetError("");
    try {
      const r = await fetch(`/api/users/${u.id}/reset-password`, { method: "POST" });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error ?? "Could not reset the password");
      setResetResult({ user: u, password: body.password });
      refresh();
    } catch (err) {
      setResetError((err as Error).message);
    } finally {
      setResettingId(null);
    }
  }

  async function retire(u: AppUser) {
    if (!confirm(
      `Retire ${u.fullName}? This hides the account from User Management for good — it won't ` +
      `come back on its own. Nothing is deleted: every past payment, O.R. and log entry stays ` +
      `exactly as it is, and this account is also set Inactive so it can't sign in anymore.`,
    )) return;
    setRetiringId(u.id);
    setRetireError("");
    try {
      const r = await fetch(`/api/users/${u.id}/retire`, { method: "POST" });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error ?? "Could not retire that account");
      refresh();
    } catch (err) {
      setRetireError((err as Error).message);
    } finally {
      setRetiringId(null);
    }
  }

  return (
    <>
      {legacy.length > 0 && (
        <div className="form-notice" style={{ marginBottom: 14 }}>
          <b>
            {legacy.length} sign-in{legacy.length === 1 ? "" : "s"} still hold a
            plaintext password.
          </b>{" "}
          {legacy.map((u) => u.username).join(", ")}. Each is rewritten as a hash
          the first time that person signs in, or right now by setting a
          password here.
        </div>
      )}

      {resetError && <div className="form-error" style={{ marginBottom: 14 }}>{resetError}</div>}
      {retireError && <div className="form-error" style={{ marginBottom: 14 }}>{retireError}</div>}

      <section className="record-section">
        <div className="record-head">
          <h2>Users</h2>
          <span className="count">{users.length}</span>
          <button className="primary" onClick={() => setEditing("new")}>
            Add user
          </button>
        </div>

        {isLoading ? (
          <p className="count">Loading…</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Type</th>
                <th>Role</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.fullName}
                    {u.id === data?.me && <span className="setting-note"> (you)</span>}
                    {u.position && <div className="setting-note">{u.position}</div>}
                  </td>
                  <td>
                    {u.username}
                    {u.plainText && (
                      <span className="badge setting-badge role-none" style={{ marginLeft: 8 }}>
                        Plaintext
                      </span>
                    )}
                    {u.mustChangePassword && (
                      <span className="badge setting-badge role-check" style={{ marginLeft: 8 }}>
                        Must change password
                      </span>
                    )}
                  </td>
                  <td>{u.type || <span className="muted">—</span>}</td>
                  <td>{u.role || <span className="muted">—</span>}</td>
                  <td>
                    <span
                      className={`badge setting-badge ${
                        /active/i.test(u.status) ? "role-prep" : "role-none"
                      }`}
                    >
                      {u.status || "—"}
                    </span>
                  </td>
                  <td className="num">
                    <button className="link-button" onClick={() => setEditing(u)}>
                      Edit
                    </button>{" "}
                    <button className="link-button" onClick={() => setPassword(u)}>
                      Password
                    </button>{" "}
                    <button
                      className="link-button"
                      disabled={resettingId === u.id}
                      onClick={() => resetPassword(u)}
                    >
                      {resettingId === u.id ? "Resetting…" : "Reset"}
                    </button>{" "}
                    {u.id !== data?.me && (
                      <button
                        className="link-button"
                        disabled={retiringId === u.id}
                        onClick={() => retire(u)}
                      >
                        {retiringId === u.id ? "Retiring…" : "Retire"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="record-section" style={{ marginTop: 20 }}>
        <div className="record-head">
          <h2>User types</h2>
          <span className="count">{data?.types.length ?? 0}</span>
          <button className="primary" onClick={() => setEditingType("new")}>
            Add user type
          </button>
        </div>
        <p className="count" style={{ marginBottom: 10 }}>
          A grouping for sign-ins — the system role next to it on the Users
          table above is what actually gates a screen.
        </p>

        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th className="num">Users</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(data?.types ?? []).map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td className="num">{t.users}</td>
                <td className="num">
                  <button className="link-button" onClick={() => setEditingType(t)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {editing && (
        <UserEditor
          record={editing === "new" ? null : editing}
          types={data?.types ?? []}
          roles={data?.roles ?? []}
          isSelf={editing !== "new" && editing.id === data?.me}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {password && (
        <PasswordEditor
          user={password}
          isSelf={password.id === data?.me}
          onClose={() => setPassword(null)}
          onSaved={() => {
            setPassword(null);
            refresh();
          }}
        />
      )}

      {editingType && (
        <UserTypeEditor
          record={editingType === "new" ? null : editingType}
          onClose={() => setEditingType(null)}
          onSaved={() => {
            setEditingType(null);
            refresh();
          }}
        />
      )}

      {resetResult && (
        <ResetResultModal
          user={resetResult.user}
          password={resetResult.password}
          onClose={() => setResetResult(null)}
        />
      )}
    </>
  );
}

/** The generated password is shown exactly once — the API never returns it
 *  again after this response, so this has to stay open until the admin has
 *  actually relayed it, not auto-dismiss on its own. */
function ResetResultModal({
  user, password, onClose,
}: { user: AppUser; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Password reset</h2>
        <p className="modal-sub">
          {user.fullName} ({user.username})
        </p>

        <div className="form-notice" style={{ marginBottom: 12 }}>
          This is shown once — it isn't stored anywhere and can't be
          retrieved again. Give it to {user.fullName} now; they'll be
          required to set their own password the moment they sign in.
        </div>

        <label className="field-input">
          <span>New temporary password</span>
          <input
            readOnly
            value={password}
            style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.03em", textAlign: "center" }}
            onFocus={(e) => e.target.select()}
          />
        </label>

        <div className="form-actions" style={{ marginTop: 14 }}>
          <button className="primary" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
          <button className="clear-filters" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function UserEditor({
  record, types, roles, isSelf, onClose, onSaved,
}: {
  record: AppUser | null;
  types: { id: number; name: string }[];
  roles: { id: number; name: string }[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState(record?.username ?? "");
  const [fullName, setFullName] = useState(record?.fullName ?? "");
  const [position, setPosition] = useState(record?.position ?? "");
  const [status, setStatus] = useState(record?.status || "Active");
  const [typeId, setTypeId] = useState(record?.typeId ?? types[0]?.id ?? 0);
  const [roleId, setRoleId] = useState(record?.roleId ?? roles[0]?.id ?? 0);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const shortPassword = !record && newPassword.length > 0 && newPassword.length < 8;

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = { username, fullName, position, status, typeId, roleId };
      if (record) {
        await putJson(`/api/users/${record.id}`, body);
      } else {
        await apiPost("/api/users", { ...body, password: newPassword });
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
        <h2 className="modal-title">{record ? "Edit user" : "New user"}</h2>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Full name</span>
          <input value={fullName} autoFocus onChange={(e) => setFullName(e.target.value)} />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Username</span>
          <input value={username} autoComplete="off" onChange={(e) => setUsername(e.target.value)} />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Position</span>
          <input value={position} onChange={(e) => setPosition(e.target.value)} />
        </label>

        {!record && (
          <label className="field-input" style={{ marginBottom: 12 }}>
            <span>Password</span>
            <input
              type="password"
              value={newPassword}
              autoComplete="new-password"
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <span className="setting-note">
              At least 8 characters. Stored as a hash — nothing here can read it
              back, so a lost password is reset, not recovered.
            </span>
          </label>
        )}

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>User type</span>
          <select value={typeId} onChange={(e) => setTypeId(Number(e.target.value))}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>System role</span>
          <select value={roleId} onChange={(e) => setRoleId(Number(e.target.value))}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <span className="setting-note">
            What this person can reach — set on the Roles &amp; Access tab, not
            here.
          </span>
        </label>

        <label className="field-input">
          <span>Status</span>
          <select value={status} disabled={isSelf} onChange={(e) => setStatus(e.target.value)}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          {isSelf && (
            <span className="setting-note">
              You cannot deactivate the account you are signed in with.
            </span>
          )}
        </label>

        {shortPassword && (
          <div className="form-error">The password must be at least 8 characters.</div>
        )}
        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button
            className="primary"
            disabled={busy || !username.trim() || !fullName.trim() || (!record && newPassword.length < 8)}
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

function PasswordEditor({
  user, isSelf, onClose, onSaved,
}: { user: AppUser; isSelf: boolean; onClose: () => void; onSaved: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const mismatch = again.length > 0 && next !== again;
  const tooShort = next.length > 0 && next.length < 8;

  async function save() {
    setBusy(true);
    setError("");
    try {
      await putJson(`/api/users/${user.id}/password`, {
        password: next,
        ...(isSelf ? { currentPassword: current } : {}),
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
        <h2 className="modal-title">{isSelf ? "Change your password" : "Reset password"}</h2>
        <p className="modal-sub">{user.fullName} ({user.username})</p>

        {isSelf ? (
          <label className="field-input" style={{ marginBottom: 12 }}>
            <span>Current password</span>
            <input
              type="password"
              value={current}
              autoFocus
              autoComplete="current-password"
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
        ) : (
          <div className="form-notice">
            Resetting somebody else&apos;s password does not ask for the old one
            — the point is that it is lost. Tell them the new one in person and
            have them change it.
          </div>
        )}

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>New password</span>
          <input
            type="password"
            value={next}
            autoFocus={!isSelf}
            autoComplete="new-password"
            onChange={(e) => setNext(e.target.value)}
          />
        </label>

        <label className="field-input">
          <span>New password again</span>
          <input
            type="password"
            value={again}
            autoComplete="new-password"
            onChange={(e) => setAgain(e.target.value)}
          />
        </label>

        {tooShort && <div className="form-error">At least 8 characters.</div>}
        {mismatch && <div className="form-error">The two do not match.</div>}
        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button
            className="primary"
            disabled={busy || next.length < 8 || next !== again || (isSelf && current.length === 0)}
            onClick={save}
          >
            {busy ? "Saving…" : "Set password"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function UserTypeEditor({
  record, onClose, onSaved,
}: {
  record: { id: number; name: string; users: number } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(record?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (record) {
        await putJson(`/api/users/user-types/${record.id}`, { name });
      } else {
        await apiPost("/api/users/user-types", { name });
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
      await deleteJson(`/api/users/user-types/${record.id}`);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{record ? "Edit user type" : "New user type"}</h2>

        <label className="field-input">
          <span>Name</span>
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
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
              {record.users > 0 ? (
                <span className="count">{record.users} user(s) on this type.</span>
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

/* ==================================================================== *
 * Roles & Access
 * ==================================================================== */

type PermDef = { key: string; label: string; detail?: string };

type RoleRow = { id: number; name: string; users: number; permissions: string[] };

type RolesData = { pages: PermDef[]; capabilities: PermDef[]; roles: RoleRow[] };

function RolesTab() {
  const queryClient = useQueryClient();
  const [editingAccess, setEditingAccess] = useState<RoleRow | null>(null);
  const [editingRole, setEditingRole] = useState<RoleRow | "new" | null>(null);

  const { data, isLoading } = useQuery<RolesData>({
    queryKey: ["user-mgmt-roles"],
    queryFn: () => apiGet<RolesData>("/api/users/roles"),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["user-mgmt-roles"] });
  const roles = data?.roles ?? [];

  return (
    <>
      <p className="count" style={{ marginBottom: 14 }}>
        A role starts with no access at all. Check what it should reach under
        "Access" — nothing here is assumed.
      </p>

      <section className="record-section">
        <div className="record-head">
          <h2>Roles</h2>
          <span className="count">{roles.length}</span>
          <button className="primary" onClick={() => setEditingRole("new")}>
            Add role
          </button>
        </div>

        {isLoading ? (
          <p className="count">Loading…</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Role</th>
                <th className="num">Users</th>
                <th>Pages</th>
                <th>Capabilities</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => {
                const pageCount = (data?.pages ?? []).filter((p) => r.permissions.includes(p.key)).length;
                const capLabels = (data?.capabilities ?? [])
                  .filter((c) => r.permissions.includes(c.key))
                  .map((c) => c.label);
                return (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td className="num">{r.users}</td>
                    <td>{pageCount} / {(data?.pages ?? []).length}</td>
                    <td>
                      {capLabels.length
                        ? capLabels.join(", ")
                        : <span className="muted">None</span>}
                    </td>
                    <td className="num">
                      <button className="link-button" onClick={() => setEditingAccess(r)}>
                        Access
                      </button>{" "}
                      <button className="link-button" onClick={() => setEditingRole(r)}>
                        Rename
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {editingAccess && data && (
        <RoleAccessEditor
          role={editingAccess}
          pages={data.pages}
          capabilities={data.capabilities}
          onClose={() => setEditingAccess(null)}
          onSaved={() => {
            setEditingAccess(null);
            refresh();
          }}
        />
      )}

      {editingRole && (
        <RoleEditor
          record={editingRole === "new" ? null : editingRole}
          onClose={() => setEditingRole(null)}
          onSaved={() => {
            setEditingRole(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function RoleEditor({
  record, onClose, onSaved,
}: { record: RoleRow | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(record?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (record) {
        await putJson(`/api/users/roles/${record.id}`, { name });
      } else {
        await apiPost("/api/users/roles", { name });
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
    if (!confirm(`Remove the "${record.name}" role?`)) return;
    setBusy(true);
    try {
      await deleteJson(`/api/users/roles/${record.id}`);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{record ? "Rename role" : "New role"}</h2>

        <label className="field-input">
          <span>Name</span>
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </label>
        {!record && (
          <span className="setting-note">
            Starts with no page or capability access — set that from the
            "Access" button after saving.
          </span>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions" style={{ marginTop: 12 }}>
          <button className="primary" disabled={busy || !name.trim()} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {record && (
            <>
              <div style={{ flexGrow: 1 }} />
              {record.users > 0 ? (
                <span className="count">{record.users} user(s) hold this role.</span>
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

function RoleAccessEditor({
  role, pages, capabilities, onClose, onSaved,
}: {
  role: RoleRow;
  pages: PermDef[];
  capabilities: PermDef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [keys, setKeys] = useState<Set<string>>(new Set(role.permissions));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggle(key: string) {
    setKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await putJson(`/api/users/roles/${role.id}/permissions`, { permissions: [...keys] });
      onSaved();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Access for "{role.name}"</h2>

        <h3 className="profile-head">Pages</h3>
        <div className="checkbox-grid">
          {pages.map((p) => (
            <label key={p.key} className="checkbox-row">
              <input type="checkbox" checked={keys.has(p.key)} onChange={() => toggle(p.key)} />
              {p.label}
            </label>
          ))}
        </div>

        <h3 className="profile-head">Capabilities</h3>
        <div className="checkbox-grid">
          {capabilities.map((c) => (
            <label key={c.key} className="checkbox-row" title={c.detail}>
              <input type="checkbox" checked={keys.has(c.key)} onChange={() => toggle(c.key)} />
              {c.label}
            </label>
          ))}
        </div>
        {capabilities.map((c) => (
          <p key={c.key} className="setting-note">{c.label}: {c.detail}</p>
        ))}

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions" style={{ marginTop: 12 }}>
          <button className="primary" disabled={busy} onClick={save}>
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

/* ==================================================================== *
 * Activity
 * ==================================================================== */

type ActivityRow = {
  id: string;
  type: string;
  date: string | null;
  time: string;
  user: string;
  description: string;
};

/** Maps an activity's evttype to a badge color — see the .badge.act-* rules
 * in index.css. Grouped by what actually happened, not by source table. */
function activityBadgeClass(type: string): string {
  switch (type) {
    case "Login":
    case "Forced Connect":
    case "Reconnection":
      return "act-green";
    case "Logout":
    case "Forced Disconnect":
      return "act-red";
    case "Installation":
    case "New Application":
    case "Job Order":
      return "act-blue";
    case "Bill Update":
    case "Bill Edit":
      return "act-orange";
    case "Setting Change":
    case "Ownership Transfer":
    case "Meter Replacement/Transfer":
    case "Meter Number Change":
      return "act-purple";
    default:
      return "act-gray";
  }
}

function ActivityTab() {
  const { data, isLoading } = useQuery<{ rows: ActivityRow[] }>({
    queryKey: ["user-mgmt-activity"],
    queryFn: () => apiGet("/api/users/activity"),
  });
  const rows = data?.rows ?? [];
  const [typeFilter, setTypeFilter] = useState("");

  const types = Array.from(new Set(rows.map((r) => r.type))).sort();
  const shown = typeFilter ? rows.filter((r) => r.type === typeFilter) : rows;

  return (
    <section className="record-section">
      <div className="record-head">
        <h2>Recent activity</h2>
        <span className="count">{shown.length}</span>
      </div>
      <p className="count" style={{ marginBottom: 10 }}>
        Every sign-in, payment, bill edit, setting change, and other account
        or service action recorded in the system — the last 250 events.
      </p>

      {types.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="count">Nothing recorded yet.</p>
      ) : (
        <div className="batch-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>User</th>
                <th>Type</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>{r.date ? String(r.date).slice(0, 10) : ""}</td>
                  <td>{r.time}</td>
                  <td>{r.user}</td>
                  <td>
                    <span className={`badge ${activityBadgeClass(r.type)}`}>{r.type}</span>
                  </td>
                  <td>{r.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ==================================================================== *
 * Small fetch helpers — apiPost covers POST; these two cover PUT/DELETE
 * the same way (same error-body handling), matching the pattern already
 * used by the raw-fetch call sites elsewhere in the app.
 * ==================================================================== */

async function putJson(url: string, body: unknown): Promise<void> {
  const r = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not save");
}

async function deleteJson(url: string): Promise<void> {
  const r = await fetch(url, { method: "DELETE" });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not remove");
}
