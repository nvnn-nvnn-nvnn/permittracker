import { config } from "dotenv";
config({ path: ".env.local" });
import {createHmac, timingSafeEqual} from 'node:crypto';


const SECRET = process.env.REMINDER_TOKEN_SECRET;

if (!SECRET) throw new Error("REMINDER_TOKEN_SECRET Missing - add to .env");

const TTL_SECONDS = 14 * 24 * 60 * 60;

function b64url(buf){
    return buf.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function fromB64url(s) {
  return Buffer.from(s.replace(/-/g,"+").replace(/_/g,"/"), "base64");
}
function sign(payload) {
  return b64url(createHmac("sha256", SECRET).update(payload).digest());
}

function createToken(id){
    const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
    const payload = b64url(Buffer.from(JSON.stringify({d:id, e:exp})));
    return `${payload}.${sign(payload)}`;

}


function verifyToken(token) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, mac] = parts;
  if (!payload || !mac) return null;
  const expected = sign(payload);
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { d, e } = JSON.parse(fromB64url(payload).toString("utf8"));
    if (typeof e !== "number" || Date.now()/1000 > e) return null;
    return typeof d === "string" && d.length > 0 ? d : null;
  } catch { return null; }
}


// Exercise


const VALID = createToken("abc");
console.log("token:", VALID);

// 1) Round-trip: a valid token should verify back to "abc".
//    Expected: "abc"
console.log("1 valid           :", verifyToken(VALID));

// 2) Tamper the PAYLOAD half: replace one char before the dot.
//    Expected: null
const [payload, mac] = VALID.split(".");
const tamperedPayload = "_" + payload.slice(1);
console.log("2 tampered payload:", verifyToken(`${tamperedPayload}.${mac}`));

// 3) Tamper the SIGNATURE half: replace one char after the dot.
//    Expected: null
const tamperedMac = "_" + mac.slice(1);
console.log("3 tampered mac    :", verifyToken(`${payload}.${tamperedMac}`));

// 4) Hand-craft a payload with no real signature (try to forge).
//    Expected: null  — you cannot mint a valid one without SECRET.
const forgedPayload = b64url(Buffer.from(JSON.stringify({
  d: "victim", e: Math.floor(Date.now()/1000) + 99999,
})));
const forgedToken = `${forgedPayload}.${"AAAA"}`; // garbage signature
console.log("4 forged          :", verifyToken(forgedToken));

