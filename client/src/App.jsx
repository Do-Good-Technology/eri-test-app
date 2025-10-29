import React, { useEffect, useState } from "react";

async function apiGet(path) {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw new Error((await res.json()).error || "Request failed");
  return res.json();
}

export default function App() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // 1) If the page opened with ?t=... (from WordPress), call /api/login
  useEffect(() => {
    const url = new URL(window.location.href);
    const t = url.searchParams.get("t");
    (async () => {
      try {
        if (t) {
          await apiGet(`/api/login?t=${encodeURIComponent(t)}`);
          // Remove token from URL (clean address bar)
          url.searchParams.delete("t");
          window.history.replaceState({}, "", url.toString());
        }
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 2) Load current user
  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet("/api/me");
        setMe(data);
      } catch {
        setMe(null);
      }
    })();
  }, [loading]);

  const handleLogout = async () => {
    await apiGet("/api/logout");
    setMe(null);
  };

  if (loading)
    return <p style={{ fontFamily: "system-ui", padding: "1rem" }}>Loading…</p>;

  return (
    <div style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 720 }}>
      <h1>ERI React + Hono</h1>

      {err && <p style={{ color: "crimson" }}>Login error: {err}</p>}

      {me && me.authenticated ? (
        <>
          <p>
            Welcome, <b>{me.email}</b> (ID: {me.userId})
          </p>
          <p>Session expires at: {new Date(me.exp * 1000).toLocaleString()}</p>
          <button onClick={handleLogout}>Logout</button>
        </>
      ) : (
        <>
          <p>
            You are not logged in. Use your WordPress button to arrive with{" "}
            <code>?t=...</code>.
          </p>
          <p>
            Dev tip: hit <code>/api/health</code> to check the API is up.
          </p>
        </>
      )}
    </div>
  );
}
