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
  return `${String(h).padStart(2, "0")}:00`;
}

function localDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function apiFetch(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json();
}

function App() {
  const [counts,        setCounts]        = useState(defaultCounts());
  const [firstTime,     setFirstTime]     = useState(0);
  const [residenceMode, setResidenceMode] = useState("suriname"); // "suriname" | "other"
  const [residence,     setResidence]     = useState("");
  const [locations,     setLocations]     = useState({ suriname: [], countries: [] });
  const [log,           setLog]           = useState([]);
  const [now,           setNow]           = useState(new Date());
  const [flashMsg,      setFlashMsg]      = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [apiError,      setApiError]      = useState(null);

  // Load today's log from server on mount
  useEffect(() => {
    apiFetch("GET", `/api/log?date=${localDateStr()}`)
      .then(data => { setLog(data); setLoading(false); })
      .catch(() => { setApiError("Cannot reach server — is it running?"); setLoading(false); });

    // Load location data for datalists (graceful — app works even if file is missing)
    fetch("/data/locations.json")
      .then(r => r.json())
      .then(locs => setLocations({ suriname: locs.suriname || [], countries: locs.countries || [] }))
      .catch(() => {});
  }, []);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const inc   = key => setCounts(c => ({ ...c, [key]: c[key] + 1 }));
  const dec   = key => {
    setCounts(c => {
      const next     = { ...c, [key]: Math.max(0, c[key] - 1) };
      const newTotal = Object.values(next).reduce((a, b) => a + b, 0);
      setFirstTime(ft => Math.min(ft, newTotal));
      return next;
    });
  };

  async function logVisit() {
    if (total === 0) return;
    const hour = now.getHours();
    try {
      const entry = await apiFetch("POST", "/api/log", { date: localDateStr(), hour, counts, firstTime, residence });
      setLog(prev => [...prev, entry]);
      setFlashMsg(`${total} guest${total > 1 ? "s" : ""} logged for ${getHourLabel(hour)}`);
      setCounts(defaultCounts());
      setFirstTime(0);
      setResidence("");
      setTimeout(() => setFlashMsg(null), 3000);
    } catch {
      setFlashMsg("Save failed — check server connection");
      setTimeout(() => setFlashMsg(null), 4000);
    }
  }


  // Build hour map for summary table
  const hourMap = {};
  for (const entry of log) {
    if (!hourMap[entry.hour]) hourMap[entry.hour] = { ...defaultCounts(), firstTime: 0 };
    for (const g of AGE_GROUPS) hourMap[entry.hour][g.key] += entry.counts[g.key];
    hourMap[entry.hour].firstTime += entry.firstTime || 0;
  }
  const hours         = Object.keys(hourMap).map(Number).sort((a, b) => a - b);
  const grandTotal    = log.reduce(
    (sum, e) => sum + Object.values(e.counts).reduce((a, b) => a + b, 0), 0
  );
  const grandFirstTime = log.reduce((s, e) => s + (e.firstTime || 0), 0);

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
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
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

        {/* First Time Guest card */}
        <div className="section-label" style={{ marginTop: 20 }}>First Time Visit</div>
        <div className="first-time-card">
          <div>
            <div className="first-time-label">★ First Visit</div>
            <div className="group-range">New guests today</div>
          </div>
          <div className="counter-wrap">
            <button
              className="btn-round btn-minus"
              onClick={() => setFirstTime(n => Math.max(0, n - 1))}
            >−</button>
            <div
              className="count-num"
              style={{ color: firstTime > 0 ? "#FFD700" : "rgba(255,255,255,0.18)" }}
            >
              {firstTime}
            </div>
            <button
              className="btn-round btn-ft-plus"
              onClick={() => setFirstTime(n => Math.min(n + 1, total))}
            >+</button>
          </div>
        </div>

        {/* Residence */}
        <div className="section-label" style={{ marginTop: 20 }}>Residence</div>
        <div className="residence-card">
          <div className="res-toggle">
            <button
              className={`res-toggle-btn${residenceMode === "suriname" ? " active" : ""}`}
              onClick={() => { setResidenceMode("suriname"); setResidence(""); }}
            >Suriname</button>
            <button
              className={`res-toggle-btn${residenceMode === "other" ? " active" : ""}`}
              onClick={() => { setResidenceMode("other"); setResidence(""); }}
            >Other Country</button>
          </div>
          <select
            className="residence-input"
            value={residence}
            onChange={e => setResidence(e.target.value)}
          >
            <option value="">— Select —</option>
            {(residenceMode === "suriname" ? locations.suriname : locations.countries)
              .map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        {/* Total */}
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
              {grandFirstTime > 0 && ` · ★ ${grandFirstTime} first-time`}
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
                    <th style={{ color: "#FFD700" }}>★ 1st</th>
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
                        <td style={{ color: hourMap[h].firstTime > 0 ? "#FFD700" : "rgba(255,255,255,0.18)", fontWeight: 700 }}>
                          {hourMap[h].firstTime || "—"}
                        </td>
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
                    <td style={{ color: grandFirstTime > 0 ? "#FFD700" : "rgba(255,255,255,0.18)", fontSize: 17 }}>
                      {grandFirstTime || "—"}
                    </td>
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
