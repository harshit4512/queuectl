import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { jobsApi } from "../services/api.js";
import { formatDate, formatDuration } from "../utils/datetime.js";

export default function JobDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchJob = async () => {
    setLoading(true);
    try {
      const { data: res } = await jobsApi.get(id);
      setData(res);
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to load job.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchJob(); }, [id]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "var(--text-muted)" }}>
        Loading job…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: "center", padding: "3rem" }}>
        <p style={{ color: "var(--color-red)", marginBottom: "1rem" }}>{error}</p>
        <button className="btn btn-outline" onClick={() => navigate("/jobs")}>
          <ArrowLeft size={15} /> Back to Jobs
        </button>
      </div>
    );
  }

  const { job, history } = data;

  const Field = ({ label, value, mono = false }) => (
    <div style={{ marginBottom: "0.875rem" }}>
      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "0.2rem" }}>
        {label}
      </span>
      <span style={{ fontFamily: mono ? "var(--font-mono)" : "inherit", color: "var(--text-primary)", fontSize: "0.95rem" }}>
        {value ?? "—"}
      </span>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button className="btn btn-outline" style={{ padding: "0.5rem" }} onClick={() => navigate("/jobs")} id="btn-back-jobs">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: "1.75rem", fontFamily: "var(--font-display)", fontWeight: 800, marginBottom: "0.2rem" }}>
              Job Details
            </h1>
            <code style={{ fontSize: "1rem", color: "var(--color-cyan)", fontFamily: "var(--font-mono)" }}>
              {job._id || id}
            </code>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className={`badge ${job.state}`}>{job.state}</span>
          <button className="btn btn-outline" onClick={fetchJob} id="btn-refresh-job">
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
        {/* Execution Details */}
        <div className="panel">
          <h2 className="panel-title" style={{ marginBottom: "1.5rem" }}>Execution Details</h2>
          <Field label="Command" value={job.command?.join(" ")} mono />
          <Field label="Shell Mode" value={job.isShell ? "Yes" : "No"} />
          <Field label="Priority" value={job.priority} />
          <Field label="Attempts" value={`${job.attempts} / ${job.maxRetries + 1}`} />
          <Field label="Max Retries" value={job.maxRetries} />
          <Field label="Timeout" value={job.timeoutSeconds ? `${job.timeoutSeconds}s` : "Default"} />
          <Field label="Exit Code" value={job.exitCode} />
          <Field label="Duration" value={formatDuration(job.executionDurationMs)} />
        </div>

        {/* Timeline */}
        <div className="panel">
          <h2 className="panel-title" style={{ marginBottom: "1.5rem" }}>Timeline</h2>
          <Field label="Created" value={formatDate(job.createdAt)} />
          <Field label="Updated" value={formatDate(job.updatedAt)} />
          <Field label="Started" value={formatDate(job.startedAt)} />
          <Field label="Completed" value={formatDate(job.completedAt)} />
          <Field label="Run At" value={formatDate(job.runAt)} />
          <Field label="Next Retry At" value={formatDate(job.nextRetryAt)} />
          <Field label="Worker ID" value={job.workerId} mono />
          <Field label="Locked At" value={formatDate(job.lockedAt)} />
        </div>
      </div>

      {/* stdout / stderr */}
      {(job.stdout || job.stderr || job.lastError) && (
        <div className="panel" style={{ marginBottom: "1.5rem" }}>
          <h2 className="panel-title" style={{ marginBottom: "1.25rem" }}>Output</h2>
          {job.lastError && (
            <>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>Last Error</p>
              <div className="console-block error" style={{ marginBottom: "1rem" }}>{job.lastError}</div>
            </>
          )}
          {job.stdout && (
            <>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>stdout</p>
              <div className="console-block" style={{ marginBottom: "1rem" }}>{job.stdout}</div>
            </>
          )}
          {job.stderr && (
            <>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>stderr</p>
              <div className="console-block error">{job.stderr}</div>
            </>
          )}
        </div>
      )}

      {/* Attempt History Table */}
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "1.5rem 2rem 1rem" }}>
          <h2 className="panel-title">Attempt History ({history?.length ?? 0})</h2>
        </div>
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Worker</th>
                <th>Started</th>
                <th>Finished</th>
                <th>Exit Code</th>
                <th>Duration</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {!history?.length ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                    No attempt history yet.
                  </td>
                </tr>
              ) : (
                history.map((a) => (
                  <tr key={a.attempt_number} id={`attempt-row-${a.attempt_number}`}>
                    <td>{a.attempt_number}</td>
                    <td><code style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>{a.worker_id || "—"}</code></td>
                    <td style={{ fontSize: "0.85rem" }}>{formatDate(a.started_at)}</td>
                    <td style={{ fontSize: "0.85rem" }}>{formatDate(a.finished_at)}</td>
                    <td>{a.exit_code ?? "—"}</td>
                    <td>{formatDuration(a.duration_ms)}</td>
                    <td style={{ color: "var(--color-red)", fontSize: "0.8rem", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.error || "—"}
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
