import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "./api";
import { useParams, Link } from "react-router-dom";
import type { ReactNode } from "react";
import AccountRecords from "./AccountRecords";
import AccountNotes from "./AccountNotes";
import AccountActions from "./AccountActions";

type AccountDetail = {
  id: number;
  accountNo: string;
  name: string;
  statusId: number;
  status: string;
  barangay: string | null;
  cluster: string | null;
  standpipe: string | null;
  meterNo: string | null;
  meterSize: string | null;
  latestReading: number | null;
  isSenior: string | null;
  consumerType: string | null;
  classification: string | null;
  contactNum: string | null;
  streetAddress: string | null;
  remark: string | null;
  connectionDate: string | null;
  billBalance: number;
  appFeeBalance: number;
  monthlyApp: number;
};

const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function statusClass(statusId: number) {
  if (statusId === 1) return "connected";
  if (statusId === 2) return "disconnected";
  if (statusId === 3) return "installation";
  return "pending";
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <span className="field-value">
        {value === null || value === undefined || value === "" ? (
          <span className="muted">—</span>
        ) : (
          value
        )}
      </span>
    </div>
  );
}

export default function AccountDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<AccountDetail>({
    queryKey: ["account", id],
    queryFn: () => apiGet<AccountDetail>(`/api/accounts/${id}`),
  });

  if (isLoading) return <p>Loading account…</p>;
  if (error) return <p>Couldn't load this account.</p>;
  if (!data) return null;

  return (
    <div>
      <Link to="/accounts" className="back-button">
        ← All accounts
      </Link>

      <div className="detail-head">
        <div>
          <h1>{data.name}</h1>
          <p className="account-no">{data.accountNo}</p>
        </div>
        <div className="detail-head-right">
          <span className={`badge ${statusClass(data.statusId)}`}>
            {data.status}
          </span>
          <AccountActions acctId={data.id} />
        </div>
      </div>

      <div className="balances">
        <div className="balance-card">
          <span className="balance-label">Outstanding balance</span>
          <span className="balance-value">{peso.format(data.billBalance)}</span>
        </div>
        <div className="balance-card">
          <span className="balance-label">Application fee balance</span>
          <span className="balance-value">
            {peso.format(data.appFeeBalance)}
          </span>
        </div>
        <div className="balance-card">
          <span className="balance-label">Monthly installment</span>
          <span className="balance-value">{peso.format(data.monthlyApp)}</span>
        </div>
      </div>

      <div className="fields">
        <Field label="Barangay" value={data.barangay} />
        <Field label="Cluster" value={data.cluster} />
        <Field label="Street address" value={data.streetAddress} />
        <Field label="Standpipe" value={data.standpipe} />
        <Field label="Consumer type" value={data.consumerType} />
        <Field label="Classification" value={data.classification} />
        <Field label="SC/PWD" value={data.isSenior} />
        <Field label="Contact number" value={data.contactNum} />
        <Field label="Meter serial" value={data.meterNo} />
        <Field label="Meter size" value={data.meterSize} />
        <Field label="Latest reading" value={data.latestReading} />
        <Field label="Date connected" value={data.connectionDate} />
      </div>

      <Remark
        id={id}
        remark={data.remark}
        onSaved={() =>
          queryClient.invalidateQueries({ queryKey: ["account", id] })
        }
      />

      <AccountNotes id={id} />

      <AccountRecords id={id} />
    </div>
  );
}

function Remark({
  id,
  remark,
  onSaved,
}: {
  id: string | undefined;
  remark: string | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(remark ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/accounts/${id}/remark`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remark: value }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Could not save the remark");
      }
      setEditing(false);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="remark">
      <div className="remark-head">
        <span className="field-label">Remark</span>
        {!editing && (
          <button
            className="link-button"
            onClick={() => {
              setValue(remark ?? "");
              setEditing(true);
            }}
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            className="remark-input"
            rows={4}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Anything worth knowing about this account"
          />
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button className="primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              className="clear-filters"
              onClick={() => {
                setEditing(false);
                setError("");
              }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </>
      ) : remark && remark.trim() ? (
        <p>{remark}</p>
      ) : (
        <p className="muted">No remark.</p>
      )}
    </div>
  );
}
