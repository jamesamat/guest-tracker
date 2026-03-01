const { useState, useEffect } = React;

const AGE_GROUPS = [
  { key: "toddler",   label: "Toddler",    range: "0 – 2 yrs",   color: "#FF6B9D" },
  { key: "preschool", label: "Preschool",  range: "3 – 5 yrs",   color: "#FF9F43" },
  { key: "schoolAge", label: "School Age", range: "6 – 12 yrs",  color: "#54A0FF" },
  { key: "teen",      label: "Teen",       range: "13 – 17 yrs", color: "#A29BFE" },
  { key: "adult",     label: "Adult",      range: "18+ yrs",     color: "#00CEC9" },
];

const defaultCounts = () =>
  AGE_GROUPS.reduce((acc, g) => ({ ...acc, [g.key]: 0 }), {});

function getHourLabel(h) {
  if (h === 0)  return "12 AM";
  if (h < 12)   return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

async function apiFetch(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json();
}

function App() {
  const [counts,   setCounts]   = useState(defaultCounts());
  const [log,      setLog]      = useState([]);
  const [now,      setNow]      = useState(new Date());
  const [flashMsg, setFlashMsg] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [apiError, setApiError] = useState(null);

  // Load today's log from server on mount
  useEffect(() => {
    apiFetch("GET", "/api/log")
      .then(data => { setLog(data); setLoading(false); })
      .catch(() => { setApiError("Cannot reach server — is it running?"); setLoading(false); });
  }, []);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const inc   = key => setCounts(c => ({ ...c, [key]: c[key] + 1 }));
  const dec   = key => setCounts(c => ({ ...c, [key]: Math.max(0, c[key] - 1) }));

  async function logVisit() {
    if (total === 0) return;
    const hour = now.getHours();
    try {
      const entry = await apiFetch("POST", "/api/log", { hour, counts });
      setLog(prev => [...prev, entry]);
      setFlashMsg(`${total} guest${total > 1 ? "s" : ""} logged for ${getHourLabel(hour)}`);
      setCounts(defaultCounts());
      setTimeout(() => setFlashMsg(null), 3000);
    } catch {
      setFlashMsg("Save failed — check server connection");
      setTimeout(() => setFlashMsg(null), 4000);
    }
  }

  async function resetDay() {
    if (!window.confirm("Clear all of today's data?")) return;
    try {
      await apiFetch("DELETE", "/api/log");
      setLog([]);
      setCounts(defaultCounts());
    } catch {
      alert("Error clearing data — check server connection");
    }
  }

  // Build hour map for summary table
  const hourMap = {};
  for (const entry of log) {
    if (!hourMap[entry.hour]) hourMap[entry.hour] = defaultCounts();
    for (const g of AGE_GROUPS) hourMap[entry.hour][g.key] += entry.counts[g.key];
  }
  const hours      = Object.keys(hourMap).map(Number).sort((a, b) => a - b);
  const grandTotal = log.reduce(
    (sum, e) => sum + Object.values(e.counts).reduce((a, b) => a + b, 0), 0
  );

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "rgba(255,255,255,0.35)", fontFamily: "'Nunito', sans-serif", fontSize: 16 }}>
        Loading…
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", color: "#fff" }}>

      {/* Header */}
      <div className="header">
        <div>
          <div className="header-title">Chuck E. Cheese</div>
          <div className="header-sub">Guest Check-In</div>
        </div>
        <div>
          <div className="clock">
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>

      <div className="main">

        {apiError && <div className="error-bar">{apiError}</div>}

        {/* Age group cards */}
        <div className="section-label">Age Groups</div>

        {AGE_GROUPS.map((g, i) => (
          <div className="group-card" key={g.key} style={{ animationDelay: `${i * 0.05}s` }}>
            <div>
              <div className="group-label" style={{ color: g.color }}>{g.label}</div>
              <div className="group-range">{g.range}</div>
            </div>
            <div className="counter-wrap">
              <button className="btn-round btn-minus" onClick={() => dec(g.key)}>−</button>
              <div
                className="count-num"
                style={{ color: counts[g.key] > 0 ? g.color : "rgba(255,255,255,0.18)" }}
              >
                {counts[g.key]}
              </div>
              <button
                className="btn-round"
                style={{ background: g.color, color: "#fff" }}
                onClick={() => inc(g.key)}
              >+</button>
            </div>
          </div>
        ))}

        {/* Total + Reset */}
        <div className="total-row">
          <div className="total-label">
            Group total:{" "}
            <span
              className="total-num"
              style={{ color: total > 0 ? "#FFD700" : "rgba(255,255,255,0.2)" }}
            >
              {total}
            </span>
          </div>
          <button className="reset-btn" onClick={resetDay}>Reset Day</button>
        </div>

        {/* Log button */}
        <button className="log-btn" disabled={total === 0} onClick={logVisit}>
          Log Visit
        </button>

        {/* Flash message */}
        <div className="flash-spacer">
          {flashMsg && <div className="flash-bar">{flashMsg}</div>}
        </div>

        {/* Summary table */}
        <div className="summary-card">
          <div className="summary-header">
            <div className="summary-title">Today's Summary</div>
            <div className="summary-count">
              {grandTotal > 0 ? `${grandTotal} guests` : "No entries yet"}
            </div>
          </div>

          {hours.length === 0 ? (
            <div className="empty-state">Log your first group to see the hourly breakdown.</div>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", paddingLeft: 16, color: "rgba(255,255,255,0.35)" }}>Hour</th>
                    {AGE_GROUPS.map(g => (
                      <th key={g.key} style={{ color: g.color }}>{g.label}</th>
                    ))}
                    <th style={{ color: "#FFD700" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {hours.map((h, i) => {
                    const rowTotal = AGE_GROUPS.reduce((s, g) => s + hourMap[h][g.key], 0);
                    return (
                      <tr key={h} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                        <td className="hour-cell">{getHourLabel(h)}</td>
                        {AGE_GROUPS.map(g => (
                          <td
                            key={g.key}
                            style={{
                              color: hourMap[h][g.key] > 0 ? g.color : "rgba(255,255,255,0.18)",
                              fontWeight: 700,
                            }}
                          >
                            {hourMap[h][g.key] || "—"}
                          </td>
                        ))}
                        <td style={{ fontFamily: "'Fredoka One', cursive", fontSize: 17, color: "#FFD700" }}>
                          {rowTotal}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="total-tbl-row">
                    <td className="hour-cell">Total</td>
                    {AGE_GROUPS.map(g => {
                      const col = hours.reduce((s, h) => s + hourMap[h][g.key], 0);
                      return (
                        <td
                          key={g.key}
                          style={{
                            color: col > 0 ? g.color : "rgba(255,255,255,0.18)",
                            fontWeight: 700,
                          }}
                        >
                          {col || "—"}
                        </td>
                      );
                    })}
                    <td style={{ color: "#FFD700", fontSize: 20 }}>{grandTotal}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
