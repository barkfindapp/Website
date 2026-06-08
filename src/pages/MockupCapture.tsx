/**
 * Capture page — visit /mockup?screen=filter or /mockup?screen=dogprofile
 * Puppeteer screenshots the #phone element directly (no background needed).
 */

const SCREEN_W = 375;
const SCREEN_H = 812;
const FRAME = 8;
const RADIUS_OUTER = 46;
const RADIUS_INNER = 38;

function PhoneChrome({ children }: { children: React.ReactNode }) {
  const total_w = SCREEN_W + FRAME * 2;
  const total_h = SCREEN_H + FRAME * 2;

  return (
    <div
      id="phone"
      style={{
        width: total_w,
        height: total_h,
        borderRadius: RADIUS_OUTER,
        background: "#D4D4D4",
        padding: FRAME,
        boxShadow: "0 2px 6px rgba(0,0,0,0.06), 0 20px 48px rgba(0,0,0,0.18)",
        position: "relative",
        flexShrink: 0,
      }}
    >
      {/* Power button */}
      <div style={{ position: "absolute", right: -5, top: 110, width: 5, height: 52, borderRadius: "0 3px 3px 0", background: "#C0C0C0" }} />
      {/* Volume up */}
      <div style={{ position: "absolute", left: -5, top: 90, width: 5, height: 34, borderRadius: "3px 0 0 3px", background: "#C0C0C0" }} />
      {/* Volume down */}
      <div style={{ position: "absolute", left: -5, top: 134, width: 5, height: 34, borderRadius: "3px 0 0 3px", background: "#C0C0C0" }} />

      {/* Inner screen */}
      <div style={{
        borderRadius: RADIUS_INNER,
        overflow: "hidden",
        width: SCREEN_W,
        height: SCREEN_H,
        background: "white",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Status bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px 4px", background: "white", flexShrink: 0 }}>
          <span style={{ fontFamily: "Nunito, sans-serif", fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>9:41</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
              <rect x="0" y="8" width="3" height="4" rx="0.5" fill="#1a1a1a"/>
              <rect x="4.5" y="5" width="3" height="7" rx="0.5" fill="#1a1a1a"/>
              <rect x="9" y="2" width="3" height="10" rx="0.5" fill="#1a1a1a"/>
              <rect x="13.5" y="0" width="3" height="12" rx="0.5" fill="#1a1a1a" opacity="0.3"/>
            </svg>
            <svg width="17" height="13" viewBox="0 0 20 15" fill="none">
              <path d="M1 5C4.5 1.5 15.5 1.5 19 5" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round"/>
              <path d="M4 8.5C6.5 6 13.5 6 16 8.5" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round"/>
              <path d="M7.5 12C8.5 11 11.5 11 12.5 12" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="10" cy="14" r="1" fill="#1a1a1a"/>
            </svg>
            <svg width="25" height="12" viewBox="0 0 23 12" fill="none">
              <rect x="0.5" y="0.5" width="18" height="11" rx="2.5" stroke="#1a1a1a" strokeOpacity="0.35"/>
              <rect x="2" y="2" width="14" height="8" rx="1.5" fill="#1a1a1a"/>
              <path d="M20 4v4c1.1-.5 1.1-3.5 0-4z" fill="#1a1a1a" opacity="0.4"/>
            </svg>
          </div>
        </div>
        {/* App content fills remaining height */}
        <div style={{ flex: 1, overflow: "hidden", width: "100%" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function MockupCapture() {
  const screen = new URLSearchParams(window.location.search).get("screen");

  const amenities = ["Water Bowl", "Off Lead Area", "Outdoor Seating", "Dog Treats", "Leads Hooks", "Shaded Area"];
  const selected = ["Water Bowl", "Off Lead Area", "Outdoor Seating"];
  const temperaments = ["Friendly", "Playful", "Energetic"];

  const FilterContent = () => (
    <div style={{ height: "100%", background: "#FDFDFD", display: "flex", flexDirection: "column", fontFamily: "Nunito, sans-serif", color: "#212121", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid #F0F0F0", flexShrink: 0 }}>
        <div style={{ width: 44, height: 44 }} />
        <span style={{ fontSize: 17, fontWeight: 700 }}>Filters</span>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#EEEEEE", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#585858" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: "#212121" }}>Location Type</p>
          <div style={{ height: 44, padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 10, border: "1px solid #E0E0E0", background: "white" }}>
            <span style={{ fontSize: 14, color: "#212121", fontWeight: 600 }}>Cafe / Restaurant</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#585858" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </div>
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#212121" }}>Distance</p>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#4FA4A1" }}>2.4 km</span>
          </div>
          <div style={{ position: "relative", height: 20 }}>
            <div style={{ position: "absolute", top: 5, left: 0, right: 0, height: 10, borderRadius: 7, background: "#D9D9D9", border: "1px solid #4FA4A1" }} />
            <div style={{ position: "absolute", top: 5, left: 0, height: 10, width: "24%", borderRadius: 7, background: "#4FA4A1", border: "1px solid #4FA4A1" }} />
            <div style={{ position: "absolute", top: 0, left: "calc(24% - 10px)", width: 20, height: 20, borderRadius: "50%", background: "white", border: "2px solid #4FA4A1", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "#828282" }}>0 km</span>
            <span style={{ fontSize: 11, color: "#828282" }}>10 km</span>
          </div>
        </div>

        <div>
          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: "#212121" }}>Minimum Paw Rating</p>
          <div style={{ display: "flex", gap: 2 }}>
            {[1,2,3,4,5].map((i) => (
              <svg key={i} width="40" height="40" viewBox="0 0 40 40" fill={i <= 3 ? "#B74217" : "none"} stroke={i <= 3 ? "none" : "#AAAAAA"} strokeWidth="1.85">
                <path d="M7.29 19.46C8.12 20.72 9.41 21.46 10.65 21.5C11.26 21.52 11.86 21.37 12.38 21.03C13.17 20.52 13.65 19.68 13.76 18.65C13.86 17.67 13.6 16.64 13.01 15.74C12.42 14.84 11.58 14.18 10.65 13.87C9.67 13.55 8.7 13.66 7.92 14.17C6.34 15.2 6.06 17.57 7.29 19.46ZM16.46 15.76C17.39 15.62 18.19 15.05 18.71 14.17C19.21 13.32 19.4 12.27 19.25 11.21C18.92 8.97 17.14 7.38 15.28 7.65C14.36 7.79 13.56 8.35 13.03 9.23C12.53 10.08 12.34 11.14 12.5 12.19C12.65 13.26 13.13 14.21 13.86 14.88C14.47 15.45 15.2 15.76 15.95 15.78C16.12 15.79 16.29 15.78 16.46 15.76ZM27.86 12.69C28.08 11.64 27.96 10.58 27.51 9.7C27.05 8.79 26.29 8.17 25.37 7.98C24.46 7.79 23.52 8.04 22.72 8.68C21.95 9.3 21.41 10.22 21.19 11.27C20.71 13.48 21.83 15.59 23.67 15.99C23.84 16.02 24 16.04 24.17 16.05C25.84 16.1 27.43 14.7 27.86 12.69ZM25.16 21.73C24.7 21.58 24.35 21.23 24.18 20.75C23.55 18.88 21.92 17.64 20.01 17.58C18.11 17.52 16.4 18.66 15.64 20.48C15.45 20.94 15.07 21.27 14.61 21.39C12.44 21.91 10.82 23.81 10.75 25.91C10.67 28.56 12.67 30.79 15.23 30.87C16.12 30.9 17.03 30.67 17.84 30.2C18.97 29.54 20.29 29.58 21.36 30.31C22.14 30.83 23.03 31.13 23.93 31.15C26.48 31.24 28.63 29.14 28.71 26.49C28.78 24.39 27.29 22.39 25.16 21.73ZM33.52 17.41C33.48 16.39 33.05 15.51 32.3 14.95C31.56 14.39 30.59 14.23 29.6 14.48C28.64 14.73 27.76 15.33 27.12 16.19C25.77 18 25.9 20.38 27.4 21.51C27.89 21.88 28.48 22.08 29.11 22.1C29.43 22.11 29.77 22.07 30.11 21.99C31.06 21.74 31.94 21.14 32.58 20.28C33.23 19.42 33.56 18.4 33.52 17.41Z"/>
              </svg>
            ))}
          </div>
        </div>

        <div>
          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: "#212121" }}>Amenities</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {amenities.map((a) => (
              <span key={a} style={{ padding: "7px 14px", borderRadius: 100, fontSize: 13, fontWeight: 600, border: "1px solid", background: selected.includes(a) ? "#FAEFD1" : "white", borderColor: selected.includes(a) ? "rgba(183,66,23,0.3)" : "#E0E0E0", color: selected.includes(a) ? "#B74217" : "#585858" }}>
                {a}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#212121" }}>Open Now</p>
          <div style={{ display: "flex", width: 52, height: 28, alignItems: "center", borderRadius: 100, background: "#B74217", padding: "0 3px" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "white", marginLeft: "auto", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
          </div>
        </div>

        <div style={{ width: "100%", height: 48, borderRadius: 100, background: "#B74217", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "white", textTransform: "uppercase", letterSpacing: "0.1em" }}>Apply Filters</span>
        </div>
      </div>
    </div>
  );

  const DogProfileContent = () => (
    <div style={{ height: "100%", background: "#FDFDFD", display: "flex", flexDirection: "column", fontFamily: "Nunito, sans-serif", color: "#212121", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "12px 20px", borderBottom: "1px solid #F0F0F0", flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#585858", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#EEEEEE"><path d="M15 19l-7-7 7-7"/></svg>
        </div>
        <span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 700 }}>Premium Dog Profile</span>
        <div style={{ width: 32 }} />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ position: "relative" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", overflow: "hidden", border: "2px solid #FAEFD1", backgroundImage: "url('https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=200&h=200&fit=crop')", backgroundSize: "cover", backgroundPosition: "center" }} />
            <div style={{ position: "absolute", bottom: -2, right: -2, width: 24, height: 24, borderRadius: "50%", background: "#B74217", border: "2px solid white", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="white"><path d="M11.5 2.5l2 2-9 9H2.5v-2l9-9z"/></svg>
            </div>
          </div>
        </div>

        {[{ label: "Dog's Name", value: "Buddy" }, { label: "Breed", value: "Golden Retriever" }, { label: "Date of Birth", value: "12 / 03 / 2020" }].map((f) => (
          <div key={f.label}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#212121", marginBottom: 6 }}>{f.label}</p>
            <div style={{ height: 44, padding: "0 14px", display: "flex", alignItems: "center", borderRadius: 10, border: "1px solid #E0E0E0", background: "white" }}>
              <span style={{ fontSize: 14, color: "#212121" }}>{f.value}</span>
            </div>
          </div>
        ))}

        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#212121", marginBottom: 6 }}>Gender</p>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, height: 44, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, border: "1px solid #E0E0E0", background: "#FAEFD1" }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Male</span>
            </div>
            <div style={{ flex: 1, height: 44, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, border: "1px solid #E0E0E0", background: "white" }}>
              <span style={{ fontSize: 14, color: "#828282" }}>Female</span>
            </div>
          </div>
        </div>

        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#212121", marginBottom: 6 }}>Temperament</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {temperaments.map((t) => (
              <span key={t} style={{ padding: "5px 12px", borderRadius: 100, background: "#FAEFD1", fontSize: 13, fontWeight: 500, color: "#585858", display: "flex", alignItems: "center", gap: 6 }}>
                {t}
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#828282" strokeWidth="1.5"><path d="M1 1l6 6M7 1L1 7"/></svg>
              </span>
            ))}
          </div>
        </div>

        <div style={{ paddingTop: 10, borderTop: "1px solid #F0F0F0" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#B74217", marginBottom: 10 }}>✦ Premium Profile Fields</p>
          {[{ label: "Behaviour with Humans", value: "Very Friendly" }, { label: "Behaviour with Dogs", value: "Plays Well" }, { label: "Noise Sensitivity", value: "Low" }].map((f) => (
            <div key={f.label} style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#212121", marginBottom: 6 }}>{f.label}</p>
              <div style={{ height: 44, padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 10, border: "1px solid #E0E0E0", background: "white" }}>
                <span style={{ fontSize: 14, color: "#212121" }}>{f.value}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#828282" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "0 20px 28px", flexShrink: 0 }}>
        <div style={{ width: "100%", height: 48, borderRadius: 100, background: "#B74217", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "white", textTransform: "uppercase", letterSpacing: "0.1em" }}>Save Dog Profile</span>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <PhoneChrome>
        {screen === "filter" ? <FilterContent /> : <DogProfileContent />}
      </PhoneChrome>
    </div>
  );
}
