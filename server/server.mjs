import "dotenv/config";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { serve } from "@hono/node-server";
import crypto from "node:crypto";

const app = new Hono();

const SECRET_HEX = process.env.SECRET_HEX || "";
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "eri_session";
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === "production";

if (!SECRET_HEX) {
  console.error("ERROR: SECRET_HEX missing. Put it in server/.env");
  process.exit(1);
}
const SECRET = Buffer.from(SECRET_HEX, "hex");
if (SECRET.length !== 32) {
  console.error("ERROR: SECRET_HEX must be 32 bytes (64 hex chars).");
  process.exit(1);
}

// --- helpers ---
function b64urlDecode(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

function decryptToken(token) {
  if (!token) throw new Error("Missing token");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");

  const iv = b64urlDecode(parts[0]);
  const ciphertext = b64urlDecode(parts[1]);
  const hmac = b64urlDecode(parts[2]);

  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(Buffer.concat([iv, ciphertext]))
    .digest();

  if (
    expected.length !== hmac.length ||
    !crypto.timingSafeEqual(expected, hmac)
  ) {
    throw new Error("HMAC mismatch");
  }

  const decipher = crypto.createDecipheriv("aes-256-cbc", SECRET, iv);
  let dec = decipher.update(ciphertext);
  dec = Buffer.concat([dec, decipher.final()]);
  const payload = JSON.parse(dec.toString("utf8"));

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || now > payload.exp) throw new Error("Token expired");

  return payload; // {email, user_id, exp, ...}
}

function signValue(value) {
  const mac = crypto.createHmac("sha256", SECRET).update(value).digest("hex");
  return `${value}.${mac}`;
}

function verifySigned(signedValue) {
  const idx = signedValue?.lastIndexOf(".");
  if (!signedValue || idx === -1) return null;
  const value = signedValue.slice(0, idx);
  const mac = signedValue.slice(idx + 1);
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(value)
    .digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(mac)))
    return null;
  return value;
}

// --- routes (prefix /api for proxy friendliness) ---
app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/login", (c) => {
  try {
    console.log('c.req.query("t")', c.req.query("t"));

    const t = c.req.query("t");
    const payload = decryptToken(t);
    console.log("payload", payload);

    // Cookie payload: email|userId|exp
    const identity = `${payload.email}|${payload.user_id}|${payload.exp}`;
    console.log("identity", identity);
    const signed = signValue(identity);
    console.log("signed", signed);

    setCookie(c, SESSION_COOKIE_NAME, signed, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: "Lax",
      path: "/",
      // Optional: expire cookie at token expiry
      // maxAge: Math.max(0, payload.exp - Math.floor(Date.now()/1000)),
    });

    // c.cookie(SESSION_COOKIE_NAME, signed, {
    //   httpOnly: true,
    //   secure: IS_PROD,
    //   sameSite: "Lax",
    //   path: "/",
    //   // Optional: expire cookie at token expiry
    //   // maxAge: Math.max(0, payload.exp - Math.floor(Date.now()/1000)),
    // });

    return c.json({ ok: true });
  } catch (e) {
    console.error(e);
    return c.json({ ok: false, error: "Invalid or expired token" }, 401);
  }
});

app.get("/api/me", (c) => {
  // const signed = c.req.cookie(SESSION_COOKIE_NAME);
  const signed = getCookie(c, SESSION_COOKIE_NAME);
  if (!signed) return c.json({ authenticated: false }, 401);

  const raw = verifySigned(signed);
  if (!raw) return c.json({ authenticated: false }, 401);

  const [email, userId, expStr] = raw.split("|");
  const exp = parseInt(expStr, 10);
  const now = Math.floor(Date.now() / 1000);
  if (!exp || now > exp) {
    c.cookie(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: "Lax",
      path: "/",
      maxAge: 0,
    });
    return c.json({ authenticated: false, reason: "expired" }, 401);
  }
  return c.json({ authenticated: true, email, userId, exp });
});

app.get("/api/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "Lax",
    path: "/",
    maxAge: 0,
  });
  return c.json({ ok: true });

  // c.cookie(SESSION_COOKIE_NAME, "", {
  //   httpOnly: true,
  //   secure: IS_PROD,
  //   sameSite: "Lax",
  //   path: "/",
  //   maxAge: 0,
  // });
  // return c.json({ ok: true });
});

serve({ fetch: app.fetch, port: PORT });
console.log(`✅ Hono API listening on http://localhost:${PORT}`);
