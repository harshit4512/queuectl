export default function MetricCard({ title, value, icon: Icon, colorClass, subtitle }) {
  return (
    <div className="card-metric">
      <div className={`metric-icon-wrapper ${colorClass}`}>
        <Icon size={22} />
      </div>
      <div className="metric-content">
        <span className="metric-title">{title}</span>
        <span className="metric-value">{value ?? "—"}</span>
        {subtitle && (
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
