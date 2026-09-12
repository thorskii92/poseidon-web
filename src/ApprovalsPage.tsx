import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, ApiError } from "./api";
import { peso, ApprovalDialog, type Context, type Detail } from "./AdjustmentShared";

/**
 * Bill Adjustment Approvals — the approving officer's own screen.
 *
 * This used to be a stage inside the general Adjustments list. It moved out
 * once approval became gated by role rather than by whoever had the screen
 * open (see poseidon-api's permissions.ts): GET /approvals and the approve
 * and reject writes all 403 for anyone who isn't an approver, so this screen
 * exists only for the roles that can actually act on it.
 */

type Row = {
  adjID: number;
  billId: number;
  accountNo: string;
  name: string;
  period: string;
  amount: number;
  requestedOn: string | null;
  inspectedOn: string | null;
  inspector: string;
};

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const { data: ctx } = useQuery<Context>({
    queryKey: ["adjust-context"],
    queryFn: () => apiGet<Context>("/api/adjustment/context"),
  });

  const { data, isLoading, error } = useQuery<Row[]>({
    queryKey: ["adjust-approvals"],
    queryFn: () => apiGet<Row[]>("/api/adjustment/approvals"),
  });

  const { data: detail } = useQuery<Detail>({
    queryKey: ["adjust-detail", open],
    queryFn: () => apiGet<Detail>(`/api/adjustment/${open}`),
    enabled: open != null,
  });

  function refresh(message: string) {
    setNotice(message);
    setOpen(null);
    qc.invalidateQueries({ queryKey: ["adjust-approvals"] });
    qc.invalidateQueries({ queryKey: ["adjust-list"] });
    qc.invalidateQueries({ queryKey: ["adjust-detail"] });
    qc.invalidateQueries({ queryKey: ["bills"] });
    qc.invalidateQueries({ queryKey: ["account"] });
  }

  const forbidden = error instanceof ApiError && error.status === 403;

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Bill Adjustment Approvals</h1>
          <p className="account-no">
            Requests inspected and waiting on a decision. Approving is a
            recommendation for the biller, not the adjustment itself.
          </p>
        </div>
      </div>

      {notice && (
        <div className="action-notice" onAnimationEnd={() => setNotice("")}>
          {notice}
        </div>
      )}

      <section className="record-section">
        {isLoading && <p className="count">Loading…</p>}

        {forbidden && (
          <p className="form-error">{(error as ApiError).message}</p>
        )}
        {error && !forbidden && (
          <p className="form-error">{(error as Error).message}</p>
        )}

        {data && data.length === 0 && (
          <p className="count">No requests are waiting for approval.</p>
        )}

        {data && data.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Name</th>
                <th>Account No.</th>
                <th>Period</th>
                <th className="num">Amount</th>
                <th>Requested</th>
                <th>Inspected</th>
                <th>Inspector</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.adjID}>
                  <td>{r.billId}</td>
                  <td>{r.name}</td>
                  <td>{r.accountNo}</td>
                  <td>{r.period}</td>
                  <td className="num">{peso.format(r.amount)}</td>
                  <td>{r.requestedOn ?? ""}</td>
                  <td>{r.inspectedOn ?? ""}</td>
                  <td>{r.inspector}</td>
                  <td className="adj-row-actions">
                    <button
                      className="link-button"
                      onClick={() =>
                        window.open(`/adjustments/${r.adjID}/print`, "_blank")
                      }
                    >
                      Form
                    </button>
                    <button
                      className="primary small"
                      onClick={() => setOpen(r.adjID)}
                    >
                      Review and approve
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {open != null && detail && ctx && (
        <ApprovalDialog
          d={detail}
          ctx={ctx}
          onClose={() => setOpen(null)}
          onDone={() => refresh("Decision recorded.")}
        />
      )}
    </div>
  );
}
