export function UiCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "0.22em", color: "rgba(41,217,255,0.9)", textTransform: "uppercase" }}>
            {title}
          </div>
          {subtitle && <div style={{ marginTop: 6, color: "rgba(255,255,255,0.6)" }}>{subtitle}</div>}
        </div>
        {right}
      </div>
      {children && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  );
}
