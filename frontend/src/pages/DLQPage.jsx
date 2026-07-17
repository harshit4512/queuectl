import { useEffect, useState } from "react";
import { RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import useStore from "../store/store.js";
import { formatDate } from "../utils/datetime.js";

export default function DLQPage() {
  const { dlqJobs, dlqLoading, fetchDlq, dlqRetry, dlqPurge, addToast } = useStore();
  const [retryingId, setRetryingId] = useState(null);
  const [purging, setPurging] = useState(false);

  useEffect(() => { fetchDlq(); }, []);

  const handleRetry = async (id) => {
    setRetryingId(id);
    try {
      await dlqRetry(id);
      addToast(`Job '${id}' moved back to pending.`, "success");
    } catch (err) {
      addToast(err?.response?.data?.error || "Retry failed.", "error");
    } finally {
      setRetryingId(null);
    }
  };

  const handlePurge = async () => {
    if (!window.confirm(`Permanently delete all ${dlqJobs.length} dead job(s)? This cannot be undone.`)) return;
    setPurging(true);
    try {
      const count = await dlqPurge();
      addToast(`Purged ${count} dead job(s).`, "success");
    } catch {
      addToast("Purge failed.", "error");
    } finally {
      setPurging(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "2.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: "2rem", fontFamily: "var(--font-display)", fontWeight: 800, marginBottom: "0.25rem" }}>
            Dead Letter Queue
          </h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Jobs that exhausted all retry attempts. Retry individually or purge all.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button id="btn-refresh-dlq" className="btn btn-outline" onClick={fetchDlq}>
            <RefreshCw size={15} /> Refresh
          </button>
          {dlqJobs.length > 0 && (
            <button
              id="btn-dlq-purge"
              className="btn btn-danger"
              onClick={handlePurge}
              disabled={purging}
            >
              <Trash2 size={15} />
              {purging ? "Purging…" : `Purge All (${dlqJobs.length})`}
            </button>
          )}
        </div>
      </div>

      {/* DLQ Table */}
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Attempts</th>
                <th>Last Error</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {dlqLoading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                    Loading…
                  </td>
                </tr>
              ) : dlqJobs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                    🎉 Dead Letter Queue is empty. All jobs are healthy!
                  </td>
                </tr>
              ) : (
                dlqJobs.map((job) => (
                  <tr key={job.id} id={`dlq-row-${job.id}`}>
                    <td>
                      <code style={{ fontFamily: "var(--font-mono)", color: "var(--color-red)", fontSize: "0.85rem" }}>
                        {job.id}
                      </code>
                    </td>
                    <td>{job.attempts}</td>
                    <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                      {job.last_error || "—"}
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                      {formatDate(job.updated_at)}
                    </td>
                    <td>
                      <button
                        id={`btn-retry-${job.id}`}
                        className="btn btn-outline"
                        style={{ fontSize: "0.8rem", padding: "0.3rem 0.75rem" }}
                        onClick={() => handleRetry(job.id)}
                        disabled={retryingId === job.id}
                      >
                        <RotateCcw size={13} />
                        {retryingId === job.id ? "Retrying…" : "Retry"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
