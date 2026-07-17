import { useEffect, useState } from "react";
import { Save, RotateCcw, RefreshCw } from "lucide-react";
import useStore from "../store/store.js";

const CONFIG_DESCRIPTIONS = {
  "max-retries": "Additional retries allowed after the first execution failure.",
  "backoff-base": "Base of the exponential backoff formula (≥ 1.0). delay = base^retryNumber seconds.",
  "worker-poll-interval": "Seconds an idle worker waits between job claim attempts.",
  "worker-heartbeat-interval": "Seconds between heartbeat updates from each worker.",
  "worker-stale-timeout": "Seconds of heartbeat silence before a worker is considered stale.",
  "job-lock-timeout": "Seconds a 'processing' lock can be held before stale-job recovery reclaims it.",
  "shutdown-timeout": "Seconds the supervisor waits for workers to finish before force-killing them.",
  "default-job-timeout": "Default per-job execution timeout in seconds if not specified at enqueue time.",
};

export default function ConfigPage() {
  const { config, fetchConfig, setConfigValue, resetConfig, configLoading, addToast } = useStore();
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState({});
  const [resetting, setResetting] = useState(false);

  useEffect(() => { fetchConfig(); }, []);

  const handleChange = (key, value) => {
    setEdits((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (key) => {
    const newValue = edits[key];
    if (newValue === undefined || newValue === config[key]) return;
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      await setConfigValue(key, newValue);
      setEdits((prev) => { const n = { ...prev }; delete n[key]; return n; });
      addToast(`Saved: ${key} = ${newValue}`, "success");
    } catch (err) {
      addToast(err?.response?.data?.error || `Failed to save ${key}.`, "error");
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Reset all configuration values to defaults?")) return;
    setResetting(true);
    try {
      await resetConfig();
      setEdits({});
      addToast("Configuration reset to defaults.", "success");
    } catch {
      addToast("Failed to reset configuration.", "error");
    } finally {
      setResetting(false);
    }
  };

  const configKeys = Object.keys(config).sort();

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "2.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: "2rem", fontFamily: "var(--font-display)", fontWeight: 800, marginBottom: "0.25rem" }}>
            Configuration
          </h1>
          <p style={{ color: "var(--text-secondary)" }}>
            System-wide settings. All values are persisted in the database.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button id="btn-refresh-config" className="btn btn-outline" onClick={fetchConfig}>
            <RefreshCw size={15} /> Refresh
          </button>
          <button
            id="btn-reset-config"
            className="btn btn-danger"
            onClick={handleReset}
            disabled={resetting}
          >
            <RotateCcw size={15} />
            {resetting ? "Resetting…" : "Reset to Defaults"}
          </button>
        </div>
      </div>

      {/* Config Rows */}
      <div className="panel">
        {configLoading ? (
          <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem" }}>Loading…</p>
        ) : configKeys.length === 0 ? (
          <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem" }}>No configuration loaded.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {configKeys.map((key, i) => {
              const currentValue = edits[key] !== undefined ? edits[key] : config[key];
              const isDirty = edits[key] !== undefined && edits[key] !== config[key];

              return (
                <div
                  key={key}
                  id={`config-row-${key}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "1.25rem 0",
                    borderBottom: i < configKeys.length - 1 ? "1px solid var(--border-color)" : "none",
                  }}
                >
                  {/* Key + description */}
                  <div>
                    <code style={{ fontFamily: "var(--font-mono)", color: "var(--color-cyan)", fontSize: "0.9rem", fontWeight: 600 }}>
                      {key}
                    </code>
                    {CONFIG_DESCRIPTIONS[key] && (
                      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                        {CONFIG_DESCRIPTIONS[key]}
                      </p>
                    )}
                  </div>

                  {/* Value input */}
                  <input
                    id={`config-input-${key}`}
                    type="number"
                    step="any"
                    className="form-input"
                    style={{ width: 140, textAlign: "right" }}
                    value={currentValue ?? ""}
                    onChange={(e) => handleChange(key, e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSave(key)}
                  />

                  {/* Save button */}
                  <button
                    id={`btn-save-config-${key}`}
                    className="btn btn-primary"
                    style={{
                      padding: "0.5rem 1rem",
                      opacity: isDirty ? 1 : 0.4,
                      pointerEvents: isDirty ? "auto" : "none",
                    }}
                    onClick={() => handleSave(key)}
                    disabled={saving[key]}
                  >
                    <Save size={14} />
                    {saving[key] ? "Saving…" : "Save"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
