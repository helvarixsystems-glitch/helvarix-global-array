export function UiCard({
  kicker,
  title,
  subtitle,
  right,
  children
}: {
  kicker?: string;
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="panel">
      <div className="panelInner">
        {(kicker || title || subtitle || right) && (
          <div className="hdr">
            <div>
              {kicker && <div className="kicker">{kicker}</div>}
              {title && <div className="title">{title}</div>}
              {subtitle && <div className="sub">{subtitle}</div>}
            </div>
            {right}
          </div>
        )}

        {children && <div style={{ marginTop: 14 }}>{children}</div>}
      </div>
    </div>
  );
}
