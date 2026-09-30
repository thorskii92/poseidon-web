import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";

/**
 * Sequencing — the desktop's Sequence Setter: the order accounts are read
 * in. Numbers run per reading area (a cluster when clusters are on, the way
 * the reading sheet and reader app sort). Pick an account, give it a new
 * number, and the area is renumbered 1…N around it.
 */

type Areas = {
  useCluster: boolean;
  orderType: number;
  barangays: { id: number; name: string }[];
  clusters: { id: number; name: string; barangayId: number }[];
};
type Row = { id: number; sequence: number; accountNo: string; name: string; street: string; standpipe: string };
type List = { rows: Row[]; unsequenced: number; duplicates: number; gaps: number };

const KEY = ["sequencing"];
const ORDER_LABEL: Record<number, string> = { 1: "by stand pipe", 2: "by sequence", 3: "by name" };

export default function SequencingPage() {
  const qc = useQueryClient();
  const [brgy, setBrgy] = useState(0);
  const [cluster, setCluster] = useState(0);
  const [picked, setPicked] = useState<Row | null>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const { data: areas } = useQuery<Areas>({ queryKey: [...KEY, "areas"], queryFn: () => apiGet("/api/sequencing/areas") });
  const ready = brgy > 0 && (!areas?.useCluster || cluster > 0);
  const qs = new URLSearchParams({ barangayId: String(brgy), clusterId: String(cluster) }).toString();
  const { data, isFetching, error: loadError } = useQuery<List>({
    queryKey: [...KEY, "list", qs],
    queryFn: () => apiGet(`/api/sequencing/list?${qs}`),
    enabled: !!areas && ready,
  });

  const rows = data?.rows ?? [];
  const numbered = rows.filter((r) => r.sequence > 0);
  const clusters = (areas?.clusters ?? []).filter((c) => c.barangayId === brgy);
  const messy = !!data && (data.duplicates > 0 || data.gaps > 0 || data.unsequenced > 0);

  function reset() {
    setPicked(null);
    setTarget("");
    setError("");
  }

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setError("");
    try {
      setNotice(await fn());
      reset();
      qc.invalidateQueries({ queryKey: [...KEY, "list"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const move = (r: Row, position: number) =>
    run(async () => {
      await apiPost("/api/sequencing/move", { barangayId: brgy, clusterId: cluster, acctId: r.id, position });
      return `${r.accountNo} is now #${position}.`;
    });

  const renumber = () => {
    if (!window.confirm(`Number all ${rows.length} accounts 1 to ${rows.length} in the order shown? Accounts without a number go last, by name.`)) return;
    run(async () => {
      const r = await apiPost<{ changed: number; total: number }>("/api/sequencing/renumber", { barangayId: brgy, clusterId: cluster });
      return `Renumbered 1 to ${r.total} — ${r.changed} account(s) changed.`;
    });
  };

  const maxTarget = numbered.length + (picked && picked.sequence === 0 ? 1 : 0);
  const targetNo = Math.trunc(Number(target));

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Sequencing</h1>
          <p className="account-no">
            The order accounts are read in, numbered per {areas?.useCluster ? "cluster" : "barangay"} — the same areas the reading sheet and reader app use.
          </p>
        </div>
      </div>

      {notice && (
        <div className="action-notice" onAnimationEnd={() => setNotice("")}>
          {notice}
        </div>
      )}

      {areas && areas.orderType !== 2 && (
        <p className="count">
          Reading order in Settings is currently <b>{ORDER_LABEL[areas.orderType] ?? "not set"}</b>, so these numbers aren't used yet. They take effect when it is set to “by sequence”.
        </p>
      )}

      <section className="record-section">
        <div className="form-grid">
          <label className="field-input">
            <span>Barangay</span>
            <select value={brgy} onChange={(e) => { setBrgy(Number(e.target.value)); setCluster(0); reset(); }}>
              <option value={0}>— pick a barangay —</option>
              {(areas?.barangays ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          {areas?.useCluster && brgy > 0 && (
            <label className="field-input">
              <span>Cluster</span>
              <select value={cluster} onChange={(e) => { setCluster(Number(e.target.value)); reset(); }}>
                <option value={0}>— pick a cluster —</option>
                {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
        </div>
      </section>

      {!ready && <p className="count">Pick a {areas?.useCluster && brgy > 0 ? "cluster" : "barangay"} to see its reading order.</p>}

      {ready && (
        <section className="record-section">
          <div className="record-head">
            <h2>Reading order</h2>
            <span className="count">{isFetching ? "Loading…" : `${rows.length} account(s)`}</span>
          </div>

          {messy && (
            <div className="action-notice" style={{ animation: "none", marginBottom: 10 }}>
              {[
                data!.unsequenced && `${data!.unsequenced} without a number (listed last)`,
                data!.duplicates && `${data!.duplicates} duplicate number(s)`,
                data!.gaps && `${data!.gaps} gap(s) in the numbers`,
              ].filter(Boolean).join(" · ")}
              . <button className="clear-filters" disabled={busy} onClick={renumber}>Renumber all 1–{rows.length}</button>
            </div>
          )}

          <div className="form-actions" style={{ marginTop: 0, marginBottom: 10, alignItems: "flex-end" }}>
            <label className="field-input" style={{ margin: 0 }}>
              <span>Account</span>
              <input value={picked ? `${picked.accountNo} — ${picked.name}` : "Click an account below"} disabled style={{ minWidth: 260 }} />
            </label>
            <label className="field-input" style={{ margin: 0, width: 110 }}>
              <span>Sequence #</span>
              <input value={picked ? picked.sequence || "none" : ""} disabled />
            </label>
            <label className="field-input" style={{ margin: 0, width: 130 }}>
              <span>Set sequence # (1–{maxTarget || 1})</span>
              <input
                type="number" min={1} max={maxTarget || 1} value={target} disabled={!picked}
                onChange={(e) => setTarget(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && picked && targetNo >= 1 && targetNo <= maxTarget && move(picked, targetNo)}
              />
            </label>
            <button
              className="primary"
              disabled={busy || !picked || !(targetNo >= 1 && targetNo <= maxTarget) || targetNo === picked?.sequence}
              onClick={() => picked && move(picked, targetNo)}
            >
              Set
            </button>
          </div>
          {error && <div className="form-error">{error}</div>}
          {loadError && <div className="form-error">{(loadError as Error).message}</div>}
          {data && rows.length === 0 && <p className="count">No accounts in this area.</p>}

          {rows.length > 0 && (
            <table>
              <thead>
                <tr><th className="num">Sequence #</th><th>Account No.</th><th>Consumer name</th><th>Street address</th><th>Stand pipe</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pos = numbered.indexOf(r) + 1;
                  return (
                    <tr
                      key={r.id}
                      className="row-link"
                      style={picked?.id === r.id ? { background: "var(--row-selected, rgba(30,100,200,0.12))" } : undefined}
                      onClick={() => { setPicked(r); setTarget(""); setError(""); }}
                    >
                      <td className="num">{r.sequence || <span className="muted">—</span>}</td>
                      <td>{r.accountNo}</td>
                      <td>{r.name}</td>
                      <td>{r.street}</td>
                      <td>{r.standpipe}</td>
                      <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                        {pos > 0 ? (
                          <>
                            <button className="clear-filters" title="Move up" disabled={busy || pos === 1} onClick={() => move(r, pos - 1)}>▲</button>{" "}
                            <button className="clear-filters" title="Move down" disabled={busy || pos === numbered.length} onClick={() => move(r, pos + 1)}>▼</button>
                          </>
                        ) : (
                          <button className="clear-filters" disabled={busy} onClick={() => move(r, numbered.length + 1)}>Add to end</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
