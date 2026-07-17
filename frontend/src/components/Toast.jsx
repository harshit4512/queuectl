import useStore from "../store/store.js";
import { CheckCircle, XCircle, Info } from "lucide-react";

const icons = {
  success: <CheckCircle size={18} />,
  error: <XCircle size={18} />,
  info: <Info size={18} />,
};

const colors = {
  success: "var(--color-green)",
  error: "var(--color-red)",
  info: "var(--color-cyan)",
};

export default function Toast() {
  const { toasts, removeToast } = useStore();

  return (
    <div
      style={{
        position: "fixed",
        bottom: "2rem",
        right: "2rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        zIndex: 9999,
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => removeToast(toast.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "1rem 1.5rem",
            borderRadius: "14px",
            background: "var(--bg-surface)",
            border: `1px solid ${colors[toast.type] || colors.info}33`,
            color: colors[toast.type] || colors.info,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            cursor: "pointer",
            animation: "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            maxWidth: "360px",
            fontSize: "0.875rem",
            fontWeight: 500,
          }}
        >
          {icons[toast.type] || icons.info}
          <span style={{ color: "var(--text-primary)" }}>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
