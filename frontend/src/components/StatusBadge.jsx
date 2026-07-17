// Reusable status badge component
export default function StatusBadge({ state }) {
  return (
    <span className={`badge ${state?.toLowerCase()}`}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "currentColor",
          display: "inline-block",
        }}
      />
      {state}
    </span>
  );
}
