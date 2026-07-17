import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import useStore from "../store/store.js";

export default function LoginPage() {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login, register, addToast } = useStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "login") {
        await login(username, password);
        navigate("/dashboard");
      } else {
        await register(username, password);
        addToast("Account created! Please log in.", "success");
        setMode("login");
        setPassword("");
      }
    } catch (err) {
      setError(err?.response?.data?.error || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">👷</div>
          <h1 className="auth-title">QueueCTL</h1>
          <p className="auth-subtitle">
            {mode === "login" ? "Sign in to your dashboard" : "Create your account"}
          </p>
        </div>

        {error && (
          <div className="auth-alert" role="alert">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} id="auth-form">
          <div className="form-group">
            <label className="form-label" htmlFor="username-input">Username</label>
            <input
              id="username-input"
              type="text"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin"
              required
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password-input">Password</label>
            <input
              id="password-input"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          <button
            id="auth-submit-btn"
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", marginTop: "0.75rem", padding: "0.875rem" }}
            disabled={loading}
          >
            {loading ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="auth-footer-text">
          {mode === "login" ? (
            <>
              Don't have an account?{" "}
              <span
                id="toggle-register"
                className="auth-footer-link"
                onClick={() => { setMode("register"); setError(""); }}
              >
                Register
              </span>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <span
                id="toggle-login"
                className="auth-footer-link"
                onClick={() => { setMode("login"); setError(""); }}
              >
                Sign In
              </span>
            </>
          )}
        </p>

        <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "1rem" }}>
          Default credentials: <code style={{ color: "var(--color-cyan)" }}>admin / admin123</code>
        </p>
      </div>
    </div>
  );
}
