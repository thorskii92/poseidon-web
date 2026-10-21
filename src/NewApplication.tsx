import { useState } from "react";
import { apiGet, apiPost } from "./api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import AdminAuth from "./AdminAuth";

type Options = {
  barangays: { id: number; name: string }[];
  clusters: { id: number; barangayId: number; name: string }[];
  classifications: { id: number; name: string }[];
  consumerTypes: { id: number; name: string; needsCollection: number }[];
  meterSizes: { id: number; name: string }[];
  downpaymentEnabled: boolean;
};

const EMPTY = {
  name: "",
  barangayId: 0,
  clusterId: 0,
  classificationId: 0,
  consumerTypeId: 0,
  meterSizeId: 0,
  streetAddress: "",
  contactNum: "",
  isSenior: "No",
  seniorId: "",
  gender: "",
  agency: "",
  jobTitle: "",
  company: "",
  householdMembers: "",
  seniorCount: "",
  applicationOption: "pay",
  // Existing account only (see existingAccount.ts on the API).
  accountNo: "",
  meterNo: "",
  meterBrand: "",
  meterReference: "",
  standpipe: "",
  connectionDate: "",
  reason: "",
};

/**
 * Two modes on one form. A new application is created Pending Payment (or
 * Installation) and goes the usual road. With ?existing=1 an administrator
 * adds an account that has had water for years but was never encoded: it is
 * created Connected with its meter, present reading and real connection
 * date, owes no application fee, and the addition is logged.
 */

export default function NewApplication() {
  const [params, setParams] = useSearchParams();
  const existing = params.get("existing") === "1";
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [adminUser, setAdminUser] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: options } = useQuery<Options>({
    queryKey: ["filter-options"],
    queryFn: () => apiGet<Options>("/api/filters"),
  });

  const { data: preview } = useQuery({
    queryKey: [
      "next-number",
      form.barangayId,
      form.clusterId,
      form.classificationId,
    ],
    enabled: form.barangayId > 0 && form.classificationId > 0 && !(existing && form.accountNo.trim()),
    queryFn: () =>
      apiGet<{ accountNo: string }>(
        `/api/accounts/next-number?barangay=${form.barangayId}&cluster=${form.clusterId}&classification=${form.classificationId}`,
      ),
  });

  const createAccount = useMutation({
    mutationFn: async () => {
      const body = {
        ...form,
        householdMembers: Number(form.householdMembers) || 0,
        seniorCount: Number(form.seniorCount) || 0,
      };
      return existing
        ? apiPost<{ id: number; accountNo: string }>("/api/accounts/existing", {
            ...body,
            meterReference: form.meterReference === "" ? null : Number(form.meterReference),
            adminUser,
            adminPass,
          })
        : apiPost<{ id: number; accountNo: string }>("/api/accounts", body);
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["account-stats"] });
      navigate(`/accounts/${created.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  if (!options) return <p>Loading…</p>;

  const clusters = form.barangayId
    ? options.clusters.filter((c) => c.barangayId === form.barangayId)
    : [];

  // Only Regular/IP Class A (NeedsCollection = 1) has a real choice — the
  // other types either need no application fee at all or have their own
  // fixed pending status (see server.ts's POST /api/accounts).
  const selectedType = options.consumerTypes.find((t) => t.id === form.consumerTypeId);
  const showApplicationOption =
    !existing && selectedType?.needsCollection === 1 && options.downpaymentEnabled;

  function set(key: keyof typeof form, value: string | number) {
    setError("");
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "barangayId") next.clusterId = 0;
      return next;
    });
  }

  const canSubmit =
    form.name.trim() !== "" &&
    form.barangayId > 0 &&
    form.classificationId > 0 &&
    form.consumerTypeId > 0 &&
    form.meterSizeId > 0 &&
    (!existing ||
      (form.meterNo.trim() !== "" &&
        form.meterReference !== "" &&
        form.connectionDate !== "" &&
        form.reason.trim().length >= 10 &&
        adminUser.trim() !== "" &&
        adminPass !== ""));

  return (
    <div>
      <Link to="/accounts" className="back-button">
        ← All accounts
      </Link>

      <div className="mode-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={!existing}
          className={!existing ? "mode-tab active" : "mode-tab"}
          onClick={() => setParams({})}
        >
          New application
        </button>
        <button
          role="tab"
          aria-selected={existing}
          className={existing ? "mode-tab active" : "mode-tab"}
          onClick={() => setParams({ existing: "1" })}
        >
          Existing account (admin)
        </button>
      </div>

      <h1>{existing ? "Add an existing account" : "New account application"}</h1>
      {existing ? (
        <p className="count">
          For an account that has had water for a long time but was never put
          in the system. It is added straight as <strong>Connected</strong> —
          no application fee, no Collection, no Installation — with its meter,
          present reading and real connection date. An administrator must
          authorise it, and it is written to the account&apos;s log.
        </p>
      ) : (
        <p className="count">
          Most account types are created as Pending Payment and move to
          Installation once the application fee is collected. Some types need
          no fee at all and go straight to Installation, and Fire Hydrant has
          its own pending status.
        </p>
      )}

      <div className="form-section">
        <h2>Applicant</h2>
        <div className="form-grid">
          <label className="field-input wide">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Surname, First name"
            />
          </label>

          <label className="field-input wide">
            <span>Street address</span>
            <input
              value={form.streetAddress}
              onChange={(e) => set("streetAddress", e.target.value)}
            />
          </label>

          <label className="field-input">
            <span>Contact number</span>
            <input
              value={form.contactNum}
              onChange={(e) => set("contactNum", e.target.value)}
            />
          </label>

          <label className="field-input">
            <span>Gender</span>
            <select
              value={form.gender}
              onChange={(e) => set("gender", e.target.value)}
            >
              <option value="">-</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </label>

          <label className="field-input">
            <span>SC/PWD</span>
            <select
              value={form.isSenior}
              onChange={(e) => set("isSenior", e.target.value)}
            >
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </select>
          </label>

          <label className="field-input">
            <span>SC/PWD ID</span>
            <input
              value={form.seniorId}
              onChange={(e) => set("seniorId", e.target.value)}
              disabled={form.isSenior !== "Yes"}
            />
          </label>

          <label className="field-input">
            <span>Household members</span>
            <input
              type="number"
              min="0"
              value={form.householdMembers}
              onChange={(e) => set("householdMembers", e.target.value)}
            />
          </label>

          <label className="field-input">
            <span>Senior count</span>
            <input
              type="number"
              min="0"
              value={form.seniorCount}
              onChange={(e) => set("seniorCount", e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="form-section">
        <h2>Location</h2>
        <div className="form-grid">
          <label className="field-input">
            <span>Barangay</span>
            <select
              value={form.barangayId}
              onChange={(e) => set("barangayId", Number(e.target.value))}
            >
              <option value={0}>Select…</option>
              {options.barangays.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field-input">
            <span>Cluster</span>
            <select
              value={form.clusterId}
              onChange={(e) => set("clusterId", Number(e.target.value))}
              disabled={!form.barangayId}
            >
              <option value={0}>Select…</option>
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="form-section">
        <h2>Service</h2>
        <div className="form-grid">
          <label className="field-input">
            <span>Account type</span>
            <select
              value={form.consumerTypeId}
              onChange={(e) => set("consumerTypeId", Number(e.target.value))}
            >
              <option value={0}>Select…</option>
              {options.consumerTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field-input">
            <span>Classification</span>
            <select
              value={form.classificationId}
              onChange={(e) => set("classificationId", Number(e.target.value))}
            >
              <option value={0}>Select…</option>
              {options.classifications.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field-input">
            <span>Meter size</span>
            <select
              value={form.meterSizeId}
              onChange={(e) => set("meterSizeId", Number(e.target.value))}
            >
              <option value={0}>Select…</option>
              {options.meterSizes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {showApplicationOption && (
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label className="field-input wide">
              <span>Application fee</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: "normal" }}>
                  <input
                    type="radio"
                    name="application-option"
                    checked={form.applicationOption === "pay"}
                    onChange={() => set("applicationOption", "pay")}
                  />
                  Make payment — collect the application fee now, in full or in part
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: "normal" }}>
                  <input
                    type="radio"
                    name="application-option"
                    checked={form.applicationOption === "noDown"}
                    onChange={() => set("applicationOption", "noDown")}
                  />
                  No down payment — go straight to Installation; the whole fee becomes an installment added to future bills
                </label>
              </div>
            </label>
          </div>
        )}
      </div>

      <div className="form-section">
        <h2>Employment (optional)</h2>
        <div className="form-grid">
          <label className="field-input">
            <span>Agency</span>
            <input
              value={form.agency}
              onChange={(e) => set("agency", e.target.value)}
            />
          </label>
          <label className="field-input">
            <span>Company</span>
            <input
              value={form.company}
              onChange={(e) => set("company", e.target.value)}
            />
          </label>
          <label className="field-input">
            <span>Job title</span>
            <input
              value={form.jobTitle}
              onChange={(e) => set("jobTitle", e.target.value)}
            />
          </label>
        </div>
      </div>

      {existing && (
        <div className="form-section">
          <h2>Connection</h2>
          <div className="form-grid">
            <label className="field-input">
              <span>Meter number</span>
              <input value={form.meterNo} onChange={(e) => set("meterNo", e.target.value)} />
            </label>
            <label className="field-input">
              <span>Meter brand (optional)</span>
              <input value={form.meterBrand} onChange={(e) => set("meterBrand", e.target.value)} />
            </label>
            <label className="field-input">
              <span>Present meter reading</span>
              <input
                type="number"
                min="0"
                step="1"
                value={form.meterReference}
                onChange={(e) => set("meterReference", e.target.value)}
              />
              <span className="setting-note">The first bill is read from here.</span>
            </label>
            <label className="field-input">
              <span>Stand pipe (optional)</span>
              <input value={form.standpipe} onChange={(e) => set("standpipe", e.target.value)} />
            </label>
            <label className="field-input">
              <span>Connected since</span>
              <input
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={form.connectionDate}
                onChange={(e) => set("connectionDate", e.target.value)}
              />
            </label>
            <label className="field-input">
              <span>Account number (optional)</span>
              <input
                value={form.accountNo}
                onChange={(e) => set("accountNo", e.target.value)}
                placeholder="Leave blank for the next in the series"
              />
              <span className="setting-note">Only if the old records already give it one.</span>
            </label>
          </div>
        </div>
      )}

      {preview?.accountNo && !(existing && form.accountNo.trim()) && (
        <div className="preview">
          <span className="field-label">Account number will be</span>
          <span className="preview-value">{preview.accountNo}</span>
        </div>
      )}

      {existing && (
        <div className="form-section">
          <label className="field-input wide" style={{ marginBottom: 12 }}>
            <span>Reason</span>
            <input
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
              placeholder="e.g. Connected since 2015 per the old ledger, never encoded"
            />
          </label>
          <AdminAuth
            username={adminUser}
            password={adminPass}
            onUsername={setAdminUser}
            onPassword={setAdminPass}
            disabled={createAccount.isPending}
          />
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        <button
          className="primary"
          disabled={!canSubmit || createAccount.isPending}
          onClick={() => createAccount.mutate()}
        >
          {createAccount.isPending ? "Saving…" : existing ? "Add account" : "Create application"}
        </button>
        <Link to="/accounts" className="back-button">
          Cancel
        </Link>
      </div>
    </div>
  );
}
