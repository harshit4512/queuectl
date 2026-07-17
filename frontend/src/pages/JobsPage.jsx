import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, RefreshCw, Search } from "lucide-react";
import useStore from "../store/store.js";
import Modal from "../components/Modal.jsx";
import { formatDate } from "../utils/datetime.js";
import { jobsApi } from "../services/api.js";

const STATE_OPTIONS = ["", "pending", "processing", "completed", "failed", "dead"];
const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "attempts", label: "Most Attempts" },
];

export default function JobsPage() {
  const { jobs, fetchJobs, jobFilters, setJobFilters, jobsLoading, addToast } = useStore();
  const navigate = useNavigate();
  const [showEnqueue, setShowEnqueue] = useState(false);

  // Enqueue form state
  const [form, setForm] = useState({
    id: "", command: "", max_retries: 3, timeout: "", priority: 0,
    run_at: "", shell: false,
  });
  const [enqueueLoading, setEnqueueLoading] = useState(false);
  const [enqueueError, setEnqueueError] = useState("");

  useEffect(() => {
    fetchJobs();
  }, [jobFilters]);

  const handleFilterChange = (key, value) => {
    setJobFilters({ [key]: value });
  };

  const handleEnqueue = async (e) => {
    e.preventDefault();
    setEnqueueError("");
    setEnqueueLoading(true);
    try {
      const payload = {
        id: form.id.trim(),
        command: form.shell ? form.command : form.command.trim(),
        max_retries: parseInt(form.max_retries) || 3,
        timeout: form.timeout ? parseInt(form.timeout) : null,
        priority: parseInt(form.priority) || 0,
        run_at: form.run_at || null,
        shell: form.shell,
      };
      await jobsApi.create(payload);
      addToast(`Job '${payload.id}' enqueued successfully!`, "success");
      setShowEnqueue(false);
      setForm({ id: "", command: "", max_retries: 3, timeout: "", priority: 0, run_at: "", shell: false });
      await fetchJobs();
    } catch (err) {
      setEnqueueError(err?.response?.data?.error || "Failed to enqueue job.");
    } finally {
      setEnqueueLoading(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "2.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: "2rem", fontFamily: "var(--font-display)", fontWeight: 800, marginBottom: "0.25rem" }}>
            Jobs
          </h1>
          <p style={{ color: "var(--text-secondary)" }}>Manage background jobs in the queue.</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button id="btn-refresh-jobs" className="btn btn-outline" onClick={fetchJobs}>
            <RefreshCw size={15} />
            Refresh
          </button>
          <button id="btn-enqueue-open" className="btn btn-primary" onClick={() => setShowEnqueue(true)}>
            <Plus size={16} />
            Enqueue Job
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="panel" style={{ marginBottom: "1.5rem", padding: "1.25rem 1.5rem" }}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: "140px" }}>
            <label className="form-label" style={{ whiteSpace: "nowrap", margin: 0 }}>State:</label>
            <select
              id="filter-state"
              className="form-select"
              value={jobFilters.state}
              onChange={(e) => handleFilterChange("state", e.target.value)}
            >
              {STATE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s || "All States"}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: "140px" }}>
            <label className="form-label" style={{ whiteSpace: "nowrap", margin: 0 }}>Sort:</label>
            <select
              id="filter-sort"
              className="form-select"
              value={jobFilters.sort}
              onChange={(e) => handleFilterChange("sort", e.target.value)}
            >
              {SORT_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: "120px" }}>
            <label className="form-label" style={{ whiteSpace: "nowrap", margin: 0 }}>Limit:</label>
            <input
              id="filter-limit"
              type="number"
              className="form-input"
              placeholder="All"
              value={jobFilters.limit}
              onChange={(e) => handleFilterChange("limit", e.target.value)}
              min="1"
            />
          </div>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>State</th>
                <th>Attempts</th>
                <th>Priority</th>
                <th>Exit Code</th>
                <th>Created</th>
                <th>Next Retry</th>
              </tr>
            </thead>
            <tbody>
              {jobsLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                    Loading…
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                    No jobs found. Try changing filters or enqueue a new job.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr
                    key={job.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => navigate(`/jobs/${job.id}`)}
                    id={`job-row-${job.id}`}
                  >
                    <td>
                      <code style={{ fontFamily: "var(--font-mono)", color: "var(--color-cyan)", fontSize: "0.85rem" }}>
                        {job.id}
                      </code>
                    </td>
                    <td><span className={`badge ${job.state}`}>{job.state}</span></td>
                    <td>{job.attempts} / {job.max_retries + 1}</td>
                    <td>{job.priority}</td>
                    <td>{job.exit_code !== null && job.exit_code !== undefined ? job.exit_code : "—"}</td>
                    <td style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{formatDate(job.created_at)}</td>
                    <td style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{formatDate(job.next_retry_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enqueue Modal */}
      {showEnqueue && (
        <Modal title="Enqueue New Job" onClose={() => setShowEnqueue(false)}>
          {enqueueError && (
            <div className="auth-alert" style={{ marginBottom: "1.25rem" }}>
              {enqueueError}
            </div>
          )}
          <form id="enqueue-form" onSubmit={handleEnqueue}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="enqueue-id">Job ID *</label>
                <input
                  id="enqueue-id"
                  className="form-input"
                  type="text"
                  required
                  placeholder="e.g. send-email-01"
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="enqueue-priority">Priority</label>
                <input
                  id="enqueue-priority"
                  className="form-input"
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="enqueue-command">Command *</label>
              <input
                id="enqueue-command"
                className="form-input"
                type="text"
                required
                placeholder={form.shell ? "echo Hello World" : "echo Hello World"}
                value={form.command}
                onChange={(e) => setForm({ ...form, command: e.target.value })}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="enqueue-max-retries">Max Retries</label>
                <input
                  id="enqueue-max-retries"
                  className="form-input"
                  type="number"
                  min="0"
                  value={form.max_retries}
                  onChange={(e) => setForm({ ...form, max_retries: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="enqueue-timeout">Timeout (seconds)</label>
                <input
                  id="enqueue-timeout"
                  className="form-input"
                  type="number"
                  min="1"
                  placeholder="Default"
                  value={form.timeout}
                  onChange={(e) => setForm({ ...form, timeout: e.target.value })}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="enqueue-run-at">Run At (ISO 8601)</label>
                <input
                  id="enqueue-run-at"
                  className="form-input"
                  type="datetime-local"
                  value={form.run_at}
                  onChange={(e) => setForm({ ...form, run_at: e.target.value ? new Date(e.target.value).toISOString() : "" })}
                />
              </div>
              <div className="form-group" style={{ justifyContent: "flex-end" }}>
                <label className="form-label">Options</label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input
                    id="enqueue-shell"
                    type="checkbox"
                    checked={form.shell}
                    onChange={(e) => setForm({ ...form, shell: e.target.checked })}
                    style={{ accentColor: "var(--color-cyan)", width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Shell mode</span>
                </label>
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
              <button id="btn-enqueue-cancel" type="button" className="btn btn-outline" onClick={() => setShowEnqueue(false)}>
                Cancel
              </button>
              <button id="btn-enqueue-submit" type="submit" className="btn btn-primary" disabled={enqueueLoading} style={{ flex: 1 }}>
                {enqueueLoading ? "Enqueueing…" : "Enqueue Job"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
