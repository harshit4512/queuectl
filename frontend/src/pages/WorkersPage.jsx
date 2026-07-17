import { useEffect, useState } from "react";
import { Play, Square, RefreshCw } from "lucide-react";
import useStore from "../store/store.js";
import { formatDate } from "../utils/datetime.js";

export default function WorkersPage() {
  const {
    workers, supervisorActive, workersLoading,
    fetchWorkers, startSupervisor, stopSupervisor, addToast,
  } = useStore();

  const [workerCount, setWorkerCount] = useState(2);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    fetchWorkers();
    const interval = setInterval(fetchWorkers, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    setStarting(true);
    try {
      await startSupervisor(workerCount);
      addToast(`Supervisor started with ${workerCount} workers.`, "success");
    } catch (err) {
      addToast(err?.response?.data?.error || "Failed to start supervisor.", "error");
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async (force = false) => {
    setStopping(true);
    try {
      await stopSupervisor(force);
      addToast(force ? "Supervisor forcefully terminated." : "Supervisor stopped gracefully.", "success");
    } catch (err) {
      addToast(err?.response?.data?.error || "Failed to stop supervisor.", "error");
    } finally {
      setStopping(false);
    }
  };

  const activeCount = workers.filter((w) => w.active === "yes").length;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "2.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: "2rem", fontFamily: "var(--font-display)", fontWeight: 800, marginBottom: "0.25rem" }}>
            Workers
          </h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Monitor the supervisor and worker pool. Workers auto-refresh every 3 seconds.
          </p>
        </div>
        <button id="btn-refresh-workers" className="btn btn-outline" onClick={fetchWorkers}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Supervisor Control Panel */}
      <div className="panel" style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h2 className="panel-title" style={{ marginBottom: "0.5rem" }}>Supervisor Control</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div
                style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: supervisorActive ? "var(--color-green)" : "var(--color-red)",
                  boxShadow: supervisorActive ? "0 0 8px var(--color-green)" : "0 0 8px var(--color-red)",
                }}
              />
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                {supervisorActive ? "Running" : "Stopped"}
              </span>
              {supervisorActive && (
                <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                  {activeCount} / {workers.length} workers active
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            {!supervisorActive ? (
              <>
                <label className="form-label" style={{ margin: 0 }}>Workers:</label>
                <input
                  id="input-worker-count"
                  type="number"
                  className="form-input"
                  style={{ width: 80 }}
                  min={1}
                  max={16}
                  value={workerCount}
                  onChange={(e) => setWorkerCount(parseInt(e.target.value) || 1)}
                />
                <button
                  id="btn-start-supervisor"
                  className="btn btn-primary"
                  onClick={handleStart}
                  disabled={starting}
                >
                  <Play size={15} />
                  {starting ? "Starting…" : "Start Supervisor"}
                </button>
              </>
            ) : (
              <>
                <button
                  id="btn-stop-supervisor"
                  className="btn btn-outline"
                  onClick={() => handleStop(false)}
                  disabled={stopping}
                >
                  <Square size={15} />
                  {stopping ? "Stopping…" : "Graceful Stop"}
                </button>
                <button
                  id="btn-force-stop-supervisor"
                  className="btn btn-danger"
                  onClick={() => handleStop(true)}
                  disabled={stopping}
                >
                  {stopping ? "Terminating…" : "Force Kill"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Worker Cards */}
      {workersLoading && workers.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem" }}>Loading…</p>
      ) : workers.length === 0 ? (
        <div className="panel" style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "var(--text-muted)", marginBottom: "0.5rem" }}>No worker records found.</p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Start the supervisor above to register workers.</p>
        </div>
      ) : (
        <div className="workers-grid">
          {workers.map((w) => (
            <div className="worker-card" key={w.id} id={`worker-card-${w.id}`}>
              <div className="worker-card-header">
                <span className="worker-card-id">
                  <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.9rem" }}>{w.id}</code>
                </span>
                <span className={`badge ${w.active === "yes" ? "yes" : "no"}`}>
                  {w.active === "yes" ? "Active" : "Inactive"}
                </span>
              </div>

              <div className="worker-info-row">
                <span className="worker-info-label">Status</span>
                <span className={`badge ${w.status}`}>{w.status}</span>
              </div>
              <div className="worker-info-row">
                <span className="worker-info-label">PID</span>
                <code className="worker-info-val" style={{ fontFamily: "var(--font-mono)" }}>{w.pid}</code>
              </div>
              <div className="worker-info-row">
                <span className="worker-info-label">Current Job</span>
                <code className="worker-info-val" style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                  {w.current_job_id !== "-" && w.current_job_id ? w.current_job_id : "—"}
                </code>
              </div>
              <div className="worker-info-row">
                <span className="worker-info-label">Last Heartbeat</span>
                <span className="worker-info-val" style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  {formatDate(w.last_heartbeat)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
