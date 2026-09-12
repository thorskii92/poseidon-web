import { useEffect, useState } from "react";
import { apiGet, apiPost } from "./api";
import AdminAuth from "./AdminAuth";

const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type BillCheck = {
  billId: number;
  accountNo: string;
  name: string;
  period: string;
  billDate: string;
  consumption: number;
  amount: number;
  previousReading: number;
  presentReading: number;
  blockedBy: string[];
};

type GroupCheck = {
  windowDays: number;
  total: number;
  deletable: number;
  blocked: number;
  amount: number;
  reasons: { reason: string; count: number }[];
  billIds: number[];
};

export type DeleteTarget =
  | { kind: "bills"; billIds: number[]; label: string }
  | {
      kind: "group";
      month: string;
      year: number;
      areaId: number;
      useCluster: boolean;
      label: string;
    };

export default function DeleteBillsDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: DeleteTarget;
  onClose: () => void;
  onDeleted: (count: number) => void;
}) {
  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState("");
  const [windowDays, setWindowDays] = useState(7);
  const [ids, setIds] = useState<number[]>([]);
  const [bills, setBills] = useState<BillCheck[]>([]);
  const [group, setGroup] = useState<GroupCheck | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      setChecking(true);
      setCheckError("");
      try {
        if (target.kind === "bills") {
          const body = await apiPost<{
            windowDays: number;
            bills: BillCheck[];
          }>("/api/bills/deletable", { billIds: target.billIds });
          if (cancelled) return;
          setWindowDays(body.windowDays);
          setBills(body.bills);
          setIds(
            body.bills.filter((b) => !b.blockedBy.length).map((b) => b.billId),
          );
        } else {
          const body = await apiGet<GroupCheck>(
            `/api/bills/deletable-group?month=${encodeURIComponent(target.month)}` +
              `&year=${target.year}&areaId=${target.areaId}` +
              `&useCluster=${target.useCluster ? 1 : 0}`,
          );
          if (cancelled) return;
          setWindowDays(body.windowDays);
          setGroup(body);
          setIds(body.billIds);
        }
      } catch (err) {
        if (!cancelled) setCheckError((err as Error).message);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [target]);

  async function remove() {
    setDeleting(true);
    setError("");
    try {
      const body = await apiPost<{ deleted: number; authorisedBy: string }>(
        "/api/bills/delete",
        { billIds: ids, username, password },
      );
      onDeleted(body.deleted);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  const blocked = bills.filter((b) => b.blockedBy.length > 0);
  const allowed = bills.filter((b) => !b.blockedBy.length);
  const count =
    target.kind === "group" ? (group?.deletable ?? 0) : allowed.length;
  const amount =
    target.kind === "group"
      ? (group?.amount ?? 0)
      : allowed.reduce((sum, b) => sum + b.amount, 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Delete bills</h2>
        <p className="modal-sub">{target.label}</p>

        {checking ? (
          <p className="count">Checking which bills can be deleted…</p>
        ) : checkError ? (
          <div className="form-error">{checkError}</div>
        ) : (
          <>
            <div className="delete-summary">
              <div>
                <div className="balance-label">Bills to delete</div>
                <div className="balance-value">{count}</div>
              </div>
              <div>
                <div className="balance-label">Value removed</div>
                <div className="balance-value">{peso.format(amount)}</div>
              </div>
            </div>

            {count > 0 && (
              <ul className="delete-effects">
                <li>
                  Each account's meter reading rolls back to the bill's previous
                  reading.
                </li>
                <li>
                  Any application-fee installment charged is returned to the
                  account's balance.
                </li>
                <li>A "Bill Deleted" entry is written to the account log.</li>
              </ul>
            )}

            {target.kind === "group" && group && group.blocked > 0 && (
              <div className="delete-blocked">
                <strong>{group.blocked} cannot be deleted</strong>
                <ul>
                  {group.reasons.map((r) => (
                    <li key={r.reason}>
                      {r.count} because {r.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {target.kind === "bills" && blocked.length > 0 && (
              <div className="delete-blocked">
                <strong>
                  {blocked.length} of {bills.length} cannot be deleted
                </strong>
                <ul>
                  {blocked.slice(0, 6).map((b) => (
                    <li key={b.billId}>
                      {b.name} - {b.blockedBy.join("; ")}
                    </li>
                  ))}
                  {blocked.length > 6 && <li>and {blocked.length - 6} more</li>}
                </ul>
              </div>
            )}

            {count === 0 ? (
              <div className="form-actions">
                <button className="clear-filters" onClick={onClose}>
                  Close
                </button>
                <span className="count">
                  Nothing here can be deleted. Bills can only be removed while
                  unpaid and within {windowDays} days of the bill date.
                </span>
              </div>
            ) : (
              <>
                <AdminAuth
                  username={username}
                  password={password}
                  onUsername={setUsername}
                  onPassword={setPassword}
                  onSubmit={remove}
                  disabled={deleting}
                />

                {error && <div className="form-error">{error}</div>}

                <div className="form-actions">
                  <button
                    className="danger"
                    disabled={deleting || !username || !password}
                    onClick={remove}
                  >
                    {deleting ? "Deleting…" : `Delete ${count} bills`}
                  </button>
                  <button
                    className="clear-filters"
                    onClick={onClose}
                    disabled={deleting}
                  >
                    Cancel
                  </button>
                  <span className="count">This cannot be undone.</span>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
