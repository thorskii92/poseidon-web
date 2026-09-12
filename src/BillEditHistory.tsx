import { useEffect, useState } from "react";
import { apiGet } from "./api";

type Field = {
  label: string;
  before: string;
  after: string;
  changed: boolean;
};

type Edit = {
  id: number;
  dateEdited: string | null;
  editedBy: string;
  loggedUser: string | null;
  reason: string;
  mode: string;
  summary: string;
  fields: Field[];
};

type History = {
  bill: { billId: number; accountNo: string; name: string; period: string };
  edits: Edit[];
};

function shortDate(value: string | null) {
  if (!value) return "-";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default function BillEditHistory({
  billId,
  onClose,
}: {
  billId: number;
  onClose: () => void;
}) {
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [changedOnly, setChangedOnly] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const body = await apiGet<History>(`/api/bill-edit/history/${billId}`);
        if (cancelled) return;
        setData(body);
        setSelected(body.edits[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [billId]);

  const edit = data?.edits.find((e) => e.id === selected) ?? null;
  const rows = edit
    ? changedOnly
      ? edit.fields.filter((f) => f.changed)
      : edit.fields
    : [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Bill edit history</h2>
        <p className="modal-sub">
          {data
            ? `Bill #${data.bill.billId} · ${data.bill.name} · ${data.bill.accountNo} · ${data.bill.period}`
            : "Loading…"}
        </p>

        {error && <div className="form-error">{error}</div>}
        {!loading && data && !data.edits.length && (
          <p className="count">This bill has not been edited.</p>
        )}

        {data && data.edits.length > 0 && (
          <div className="history-split">
            <div className="history-list">
              {data.edits.map((e) => (
                <button
                  key={e.id}
                  className={
                    e.id === selected ? "history-item selected" : "history-item"
                  }
                  onClick={() => setSelected(e.id)}
                >
                  <span className="history-date">
                    {shortDate(e.dateEdited)}
                  </span>
                  <span className="history-by">{e.editedBy}</span>
                  <span className="history-reason">
                    {e.reason || "No reason given"}
                  </span>
                </button>
              ))}
            </div>

            <div className="history-detail">
              {edit && (
                <>
                  <div className="history-meta">
                    <div>
                      <span className="balance-label">Reason</span>
                      <div>{edit.reason || "-"}</div>
                    </div>
                    <div>
                      <span className="balance-label">Edited by</span>
                      <div>
                        {edit.editedBy}
                        {edit.loggedUser &&
                          edit.loggedUser !== edit.editedBy && (
                            <span className="count">
                              {" "}
                              (signed in: {edit.loggedUser})
                            </span>
                          )}
                      </div>
                    </div>
                    <div>
                      <span className="balance-label">Computation</span>
                      <div>{edit.mode || "-"}</div>
                    </div>
                  </div>

                  <div className="history-toggle">
                    <label>
                      <input
                        type="checkbox"
                        checked={changedOnly}
                        onChange={(e) => setChangedOnly(e.target.checked)}
                      />
                      Show only what changed
                    </label>
                    <span className="count">
                      {edit.fields.filter((f) => f.changed).length} of{" "}
                      {edit.fields.length} fields changed
                    </span>
                  </div>

                  {!rows.length ? (
                    <p className="count">No values changed in this edit.</p>
                  ) : (
                    <table className="history-table">
                      <thead>
                        <tr>
                          <th />
                          <th>Before</th>
                          <th>After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((f) => (
                          <tr
                            key={f.label}
                            className={f.changed ? "history-changed" : ""}
                          >
                            <th scope="row">{f.label}</th>
                            <td>
                              {f.label === "Bill note" ? (
                                <pre className="history-note">
                                  {f.before || "-"}
                                </pre>
                              ) : (
                                f.before || "-"
                              )}
                            </td>
                            <td>
                              {f.label === "Bill note" ? (
                                <pre className="history-note">
                                  {f.after || "-"}
                                </pre>
                              ) : (
                                f.after || "-"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <div className="form-actions">
          <button className="clear-filters" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
