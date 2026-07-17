import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import useStore from "./store/store.js";
import Layout from "./components/Layout.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import JobsPage from "./pages/JobsPage.jsx";
import JobDetailPage from "./pages/JobDetailPage.jsx";
import DLQPage from "./pages/DLQPage.jsx";
import ConfigPage from "./pages/ConfigPage.jsx";
import WorkersPage from "./pages/WorkersPage.jsx";

// Route guard — redirects to /login if not authenticated
function ProtectedRoute({ children }) {
  const { user, isAuthLoading } = useStore();

  if (isAuthLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "var(--bg-main)",
          color: "var(--text-muted)",
          fontSize: "1.1rem",
        }}
      >
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default function App() {
  const { checkAuth } = useStore();

  useEffect(() => {
    // On app load, try to restore session via refresh token cookie
    checkAuth();
  }, []);

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected app shell */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="jobs/:id" element={<JobDetailPage />} />
        <Route path="dlq" element={<DLQPage />} />
        <Route path="workers" element={<WorkersPage />} />
        <Route path="config" element={<ConfigPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
