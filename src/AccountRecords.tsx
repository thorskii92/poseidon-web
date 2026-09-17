import { useState } from "react";
import { apiGet } from "./api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import EditBillsDialog from "./EditBillsDialog";
import BillEditHistory from "./BillEditHistory";
import ConsumptionChart from "./ConsumptionChart";
import PaymentChart from "./PaymentChart";
import SoaDialog from "./SoaDialog";
import TransactionsDialog from "./TransactionsDialog";
import AdjustDialog from "./AdjustDialog";

const CAP = 13;

const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function money(value: number) {
  return value ? peso.format(value) : <span className="muted">-</span>;
}

function shortDate(value: string | null) {
  if (!value) return <span className="muted">-</span>;
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}

type Payment = {
  id: number;
  orNumber: string;
  orSerial: string | null;
  amount: number;
  nature: string;
  paymentType: string | null;
  penalty: number;
  enviFee: number;
  discount: number;
  date: string | null;
  billPeriod: string | null;
};

type Bill = {
  id: number;
  period: string;
  prevRead: number;
  presRead: number;
  consumption: number;
  tariffAmount: number;
  wsf: number;
  airContent: number;
  enviFee: number;
  discount: number;
  penalty: number;
  total: number;
  totalAfterDue: number;
  dueDate: string | null;
  readDate: string | null;
  billDate: string | null;
  status: string;
  isAdjusted: string | null;
  adjustRemark: string | null;
  editCount: number;
};

type LogEntry = {
  date: string | null;
  type: string;
  transactionDate: string | null;
  responsible: string | null;
  lastReading: number | null;
};

function useAccountData<T>(id: string | undefined, path: string) {
  return useQuery<T[]>({
    queryKey: [path, id],
    queryFn: () => apiGet<T[]>(`/api/accounts/${id}/${path}`),
  });
}

function Section({
  title,
  total,
  expanded,
  onToggle,
  action,
  children,
}: {
  title: string;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  /** An extra control for the section header — the Bills section's statement. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="record-section">
      <div className="record-head">
        <h2>{title}</h2>
        {total > CAP && (
          <button className="link-button" onClick={onToggle}>
            {expanded ? `Show recent ${CAP}` : `Show all ${total}`}
          </button>
        )}
        {action && <span className="record-head-action">{action}</span>}
      </div>
      {children}
    </section>
  );
}

function Payments({ id }: { id: string | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useAccountData<Payment>(id, "payments");

  if (isLoading) return <p className="count">Loading payments…</p>;

  const rows = expanded ? (data ?? []) : (data ?? []).slice(0, CAP);

  return (
    <Section
      title="Payment history"
      total={data?.length ?? 0}
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
    >
      {!data?.length ? (
        <p className="count">No payments recorded.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Nature</th>
              <th>Bill period</th>
              <th className="num">Amount</th>
              <th className="num">Penalty</th>
              <th className="num">E.F.</th>
              <th className="num">Discount</th>
              <th>OR number</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{shortDate(p.date)}</td>
                <td>{p.nature}</td>
                <td>{p.billPeriod ?? <span className="muted">-</span>}</td>
                <td className="num">{money(p.amount)}</td>
                <td className="num">{money(p.penalty)}</td>
                <td className="num">{money(p.enviFee)}</td>
                <td className="num">{money(p.discount)}</td>
                <td>
                  {p.orNumber}
                  {p.orSerial && p.orSerial !== "NA" ? ` · ${p.orSerial}` : ""}
                </td>
                <td>{p.paymentType ?? <span className="muted">-</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function Bills({ id }: { id: string | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [editIds, setEditIds] = useState<number[] | null>(null);
  const [historyBillId, setHistoryBillId] = useState<number | null>(null);
  const [soaOpen, setSoaOpen] = useState(false);
  const [txnOpen, setTxnOpen] = useState(false);
  const [adjustBill, setAdjustBill] = useState<Bill | null>(null);
  const queryClient = useQueryClient();
  const { data, isLoading } = useAccountData<Bill>(id, "bills");

  if (isLoading) return <p className="count">Loading bills…</p>;

  const rows = expanded ? (data ?? []) : (data ?? []).slice(0, CAP);

  function toggle(billId: number) {
    setSelected((prev) =>
      prev.includes(billId)
        ? prev.filter((x) => x !== billId)
        : [...prev, billId],
    );
  }

  function toggleAll() {
    const visible = rows.map((b) => b.id);
    const allSelected = visible.every((v) => selected.includes(v));
    setSelected(allSelected ? [] : visible);
  }

  function printSelected() {
    window.open(`/bills/print?ids=${selected.join(",")}`, "_blank");
  }

  const allVisibleSelected =
    rows.length > 0 && rows.every((b) => selected.includes(b.id));

  return (
    <Section
      title="Bills"
      total={data?.length ?? 0}
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      action={
        <span className="record-head-buttons">
          <button
            className="clear-filters"
            onClick={() => setSoaOpen(true)}
            title="Print a statement of the unpaid bills on this account"
          >
            Statement of account
          </button>
          <button
            className="clear-filters"
            onClick={() => setTxnOpen(true)}
            title="Print what has been paid on this account, with the O.R. numbers"
          >
            Transaction history
          </button>
        </span>
      }
    >
      {soaOpen && id && (
        <SoaDialog acctId={Number(id)} onClose={() => setSoaOpen(false)} />
      )}

      {txnOpen && id && (
        <TransactionsDialog
          acctId={Number(id)}
          onClose={() => setTxnOpen(false)}
        />
      )}

      {adjustBill && (
        <AdjustDialog
          billId={adjustBill.id}
          facts={{
            period: adjustBill.period,
            prevRead: adjustBill.prevRead,
            presRead: adjustBill.presRead,
            consumption: adjustBill.consumption,
            wsf: adjustBill.wsf,
            enviFee: adjustBill.enviFee,
            discount: adjustBill.discount,
            total: adjustBill.total,
            penalty: adjustBill.penalty,
            afterDue: adjustBill.totalAfterDue,
            dueDate: adjustBill.dueDate,
            billDate: adjustBill.billDate,
            readDate: adjustBill.readDate,
          }}
          onClose={() => setAdjustBill(null)}
          onRequested={(adjID) => {
            setAdjustBill(null);
            setSelected([]);
            queryClient.invalidateQueries({ queryKey: ["bills"] });
            window.open(`/adjustments/${adjID}/print`, "_blank");
          }}
        />
      )}

      {!data?.length ? (
        <p className="count">No bills issued.</p>
      ) : (
        <>
          {selected.length > 0 && (
            <div className="selection-bar">
              <span>{selected.length} selected</span>
              <button className="primary small" onClick={printSelected}>
                Print {selected.length === 1 ? "bill" : "bills"}
              </button>
              <button
                className="clear-filters"
                onClick={() => setEditIds(selected)}
              >
                Edit {selected.length === 1 ? "bill" : "bills"}
              </button>
              {selected.length === 1 && (
                <button
                  className="clear-filters"
                  onClick={() => {
                    const bill = (data ?? []).find((b) => b.id === selected[0]);
                    if (bill) setAdjustBill(bill);
                  }}
                  title="Raise an adjustment request against this bill"
                >
                  Adjust
                </button>
              )}
              <button className="link-button" onClick={() => setSelected([])}>
                Clear
              </button>
            </div>
          )}

          {historyBillId !== null && (
            <BillEditHistory
              billId={historyBillId}
              onClose={() => setHistoryBillId(null)}
            />
          )}

          {editIds && (
            <EditBillsDialog
              billIds={editIds}
              onClose={() => setEditIds(null)}
              onSaved={() => {
                setEditIds(null);
                setSelected([]);
                queryClient.invalidateQueries({ queryKey: ["bills"] });
                queryClient.invalidateQueries({ queryKey: ["account"] });
                queryClient.invalidateQueries({ queryKey: ["payments"] });
              }}
            />
          )}

          <table>
            <thead>
              <tr>
                <th className="check">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                  />
                </th>
                <th>Period</th>
                <th className="num">Prev</th>
                <th className="num">Present</th>
                <th className="num">Cu.m.</th>
                <th className="num">WSF</th>
                <th className="num">E.F.</th>
                <th className="num">Discount</th>
                <th className="num">Total due</th>
                <th className="num">Penalty</th>
                <th className="num">After due</th>
                <th>Due date</th>
                <th>Read date</th>
                <th>Bill date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr
                  key={b.id}
                  className={selected.includes(b.id) ? "row-selected" : ""}
                >
                  <td className="check">
                    <input
                      type="checkbox"
                      checked={selected.includes(b.id)}
                      onChange={() => toggle(b.id)}
                    />
                  </td>
                  <td>
                    {b.period}
                    {b.isAdjusted === "Done" && (
                      <span className="edited" title={b.adjustRemark ?? ""}>
                        adjusted
                      </span>
                    )}
                    {b.editCount > 0 && (
                      <button
                        className="edited edited-link"
                        onClick={() => setHistoryBillId(b.id)}
                        title="Show what was changed, by whom and why"
                      >
                        edited {b.editCount}×
                      </button>
                    )}
                  </td>
                  <td className="num">{b.prevRead}</td>
                  <td className="num">{b.presRead}</td>
                  <td className="num">{b.consumption}</td>
                  <td className="num">{money(b.wsf)}</td>
                  <td className="num">{money(b.enviFee)}</td>
                  <td className="num">{money(b.discount)}</td>
                  <td className="num">{money(b.total)}</td>
                  <td className="num">{money(b.penalty)}</td>
                  <td className="num">{money(b.totalAfterDue)}</td>
                  <td>{shortDate(b.dueDate)}</td>
                  <td>{shortDate(b.readDate)}</td>
                  <td>{shortDate(b.billDate)}</td>
                  <td>
                    <span
                      className={
                        b.status === "PAID"
                          ? "badge connected"
                          : "badge pending"
                      }
                    >
                      {b.status === "PAID" ? "Paid" : "Unpaid"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Section>
  );
}

function Logs({ id }: { id: string | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useAccountData<LogEntry>(id, "logs");

  if (isLoading) return <p className="count">Loading logs…</p>;

  const rows = expanded ? (data ?? []) : (data ?? []).slice(0, CAP);

  return (
    <Section
      title="Account logs"
      total={data?.length ?? 0}
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
    >
      {!data?.length ? (
        <p className="count">No activity logged.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Activity</th>
              <th>Transaction date</th>
              <th>Handled by</th>
              <th className="num">Reading</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l, i) => (
              <tr key={i}>
                <td>{shortDate(l.date)}</td>
                <td>{l.type}</td>
                <td>{shortDate(l.transactionDate)}</td>
                <td>{l.responsible ?? <span className="muted">-</span>}</td>
                <td className="num">
                  {l.lastReading ?? <span className="muted">-</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

export default function AccountRecords({ id }: { id: string | undefined }) {
  return (
    <div className="records">
      <div className="chart-pair">
        <ConsumptionChart id={id} />
        <PaymentChart id={id} />
      </div>
      <Payments id={id} />
      <Bills id={id} />
      <Logs id={id} />
    </div>
  );
}
