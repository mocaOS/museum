// MOCA Library — Shell (Sidebar + Topbar + AppShell wrapper)

const shellStyles = {
  sidebar: {
    padding: "16px 12px",
    borderRight: "1px solid var(--border)",
    background: "oklch(0.17 0 0 / 0.6)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    display: "flex", flexDirection: "column", gap: 4,
  },
  logoRow: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "4px 10px 16px",
  },
  logoImg: { height: 20, width: "auto" },
  navItem: (active) => ({
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 10px",
    borderRadius: "var(--radius)",
    color: active ? "var(--accent-fg)" : "var(--fg1)",
    background: active ? "var(--accent)" : "transparent",
    fontSize: 13, fontWeight: 500,
    cursor: "pointer",
    transition: "background 150ms, color 150ms",
  }),
  section: {
    fontSize: 10.5, fontWeight: 500, letterSpacing: "0.08em",
    textTransform: "uppercase", color: "var(--fg3)",
    padding: "16px 10px 6px",
  },
  count: {
    marginLeft: "auto", fontFamily: "var(--font-mono)",
    fontSize: 11, color: "var(--fg2)",
  },
  topbar: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "0 20px",
    borderBottom: "1px solid var(--border)",
    background: "oklch(0.15 0 0 / 0.65)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
  },
  search: {
    display: "flex", alignItems: "center", gap: 8,
    background: "oklch(0.22 0 0 / 0.8)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "6px 10px",
    width: 380, maxWidth: "40vw",
    color: "var(--fg3)", fontSize: 12.5,
  },
  kbd: {
    fontFamily: "var(--font-mono)", fontSize: 10,
    background: "oklch(0.27 0 0)", color: "var(--fg2)",
    padding: "1px 5px", borderRadius: 3, marginLeft: "auto",
  },
  avatar: {
    width: 28, height: 28, borderRadius: "50%",
    background: "linear-gradient(135deg, oklch(0.45 0 0), oklch(0.3 0 0))",
    border: "1px solid var(--border)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 11, fontWeight: 600, color: "var(--fg1)",
  },
};

const NAV = [
  { id: "manage",  icon: "Database", label: "Manage" },
  { id: "explore", icon: "Network",  label: "Explore" },
  { id: "ask",     icon: "MessageSquare", label: "Ask" },
];

const COLLECTIONS = [
  { id: "finance",  label: "Finance",  count: 124 },
  { id: "research", label: "Research", count: 58  },
  { id: "legal",    label: "Legal",    count: 31  },
];

function Sidebar({ route, onRoute }) {
  return (
    <aside className="sidebar" style={shellStyles.sidebar}>
      <div style={shellStyles.logoRow}>
        <img src="../../assets/logo.svg" alt="MOCA Library" style={shellStyles.logoImg} />
      </div>

      {NAV.map(n => {
        const Ic = window.Icon[n.icon];
        return (
          <div key={n.id} style={shellStyles.navItem(route === n.id)} onClick={() => onRoute(n.id)}>
            <Ic />
            <span>{n.label}</span>
          </div>
        );
      })}

      <div style={shellStyles.section}>Collections</div>
      {COLLECTIONS.map(c => (
        <div key={c.id} style={shellStyles.navItem(false)}>
          <window.Icon.Folder />
          <span>{c.label}</span>
          <span style={shellStyles.count}>{c.count}</span>
        </div>
      ))}

      <div style={{ marginTop: "auto", paddingTop: 12 }}>
        <div style={shellStyles.navItem(false)}>
          <window.Icon.Settings />
          <span>Settings</span>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ title, subtitle, right }) {
  return (
    <header className="topbar" style={shellStyles.topbar}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg1)" }}>{title}</div>
        {subtitle && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg2)" }}>
            {subtitle}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      <div style={shellStyles.search}>
        <window.Icon.Search className="icon icon-sm" />
        <span>Search entities, docs, jobs…</span>
        <span style={shellStyles.kbd}>⌘K</span>
      </div>

      {right}

      <button className="btn btn-icon btn-ghost" aria-label="Notifications">
        <window.Icon.Zap />
      </button>
      <div style={shellStyles.avatar}>EM</div>
    </header>
  );
}

function AppShell({ route, onRoute, title, subtitle, rightOfTopbar, children }) {
  return (
    <div className="app">
      <Sidebar route={route} onRoute={onRoute} />
      <Topbar title={title} subtitle={subtitle} right={rightOfTopbar} />
      <main className="main">{children}</main>
    </div>
  );
}

Object.assign(window, { Sidebar, Topbar, AppShell });
