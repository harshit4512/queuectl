import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock, Loader2, CheckCircle2, XCircle, Skull,
  LayoutGrid, Zap, AlertTriangle, RefreshCw,
} from "lucide-react";
import useStore from "../store/store.js";
import MetricCard from "../components/MetricCard.jsx";

export default function DashboardPage() {
  const { stats, fetchStats, jobs, fetchJobs, supervisorActive, fetchWorkers } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchStats();
    fetchJobs();
    fetchWorkers();
    // Auto-refresh every 5 seconds
    const interval = setInterval(() => {
      fetchStats();
      fetchWorkers();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const recentJobs = (jobs || []).slice(0, 5);

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: "2.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: "2rem", fontFamily: "var(--font-display)", fontWeight: 800, marginBottom: "0.25rem" }}>
            Dashboard
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
            Live overview of your job queue system.
          </p>
        </div>
        <button
          id="btn-refresh-dashboard"
          className="btn btn-outline"
          onClick={() => { fetchStats(); fetchJobs(); fetchWorkers(); }}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      {/* Supervisor status banner */}
      <div
        style={{
          marginBottom: "2rem",
          padding: "1rem 1.5rem",
          borderRadius: "14px",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          border: `1px solid ${supervisorActive ? "rgba(16,185,129,0.25)" : "rgba(245,158,11,0.25)"}`,
          background: supervisorActive ? "rgba(16,185,129,0.07)" : "rgba(245,158,11,0.07)",
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: supervisorActive ? "var(--color-green)" : "var(--color-yellow)",
            boxShadow: supervisorActive ? "0 0 8px var(--color-green)" : "0 0 8px var(--color-yellow)",
          }}
        />
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
          Supervisor: {supervisorActive ? "Running" : "Stopped"}
        </span>
        <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
          {supervisorActive
            ? "Workers are actively processing jobs."
            : "No supervisor running. Go to Workers to start one."}
        </span>
        {!supervisorActive && (
          <button
            id="btn-go-workers"
            className="btn btn-outline"
            style={{ marginLeft: "auto", fontSize: "0.8rem", padding: "0.375rem 0.875rem" }}
            onClick={() => navigate("/workers")}
          >
            Manage Workers
          </button>
        )}
      </div>

      {/* Metric Cards */}
      <div className="grid-metrics">
        <MetricCard
          title="Pending"
          value={stats?.counts?.pending ?? "…"}
          icon={Clock}
          colorClass="cyan"
          subtitle={`${stats?.ready ?? 0} ready to run`}
        />
        <MetricCard
          title="Processing"
          value={stats?.counts?.processing ?? "…"}
          icon={Loader2}
          colorClass="blue"
        />
        <MetricCard
          title="Completed"
          value={stats?.counts?.completed ?? "…"}
          icon={CheckCircle2}
          colorClass="green"
        />
        <MetricCard
          title="Failed"
          value={stats?.counts?.failed ?? "…"}
          icon={XCircle}
          colorClass="yellow"
          subtitle={`${stats?.waitingRetry ?? 0} awaiting retry`}
        />
        <MetricCard
          title="Dead (DLQ)"
          value={stats?.counts?.dead ?? "…"}
          icon={Skull}
          colorClass="red"
        />
        <MetricCard
          title="Total Jobs"
          value={stats?.total ?? "…"}
          icon={LayoutGrid}
          colorClass="cyan"
          subtitle={`${stats?.delayed ?? 0} delayed`}
        />
      </div>

      {/* Recent jobs mini-table */}
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Recent Jobs</h2>
          <button
            id="btn-view-all-jobs"
            className="btn btn-outline"
            style={{ fontSize: "0.8rem", padding: "0.4rem 0.875rem" }}
            onClick={() => navigate("/jobs")}
          >
            View All
          </button>
        </div>
        {recentJobs.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", textAlign: "center", padding: "2rem" }}>
            No jobs yet. Enqueue your first job from the Jobs page.
          </p>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>State</th>
                  <th>Attempts</th>
                  <th>Priority</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((job) => (
                  <tr
                    key={job.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => navigate(`/jobs/${job.id}`)}
                  >
                    <td>
                      <code style={{ color: "var(--color-cyan)", fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>
                        {job.id}
                      </code>
                    </td>
                    <td><span className={`badge ${job.state}`}>{job.state}</span></td>
                    <td>{job.attempts}</td>
                    <td>{job.priority}</td>
                    <td style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                      {new Date(job.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
