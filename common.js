const $ = (id) => document.getElementById(id);

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 90 90%27%3E%3Crect width=%2790%27 height=%2790%27 fill=%27%231a1a1a%27/%3E%3C/svg%3E";

const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);

const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
const iconOf = (a) => (safeUrl(a.icon) ? esc(a.icon) : PLACEHOLDER);
const starStr = (n) => "★".repeat(n) + "☆".repeat(5 - n);

const millis = (ts) => (ts && ts.toMillis ? ts.toMillis() : Date.now());

const fmtDate = (ts) =>
  ts ? new Date(millis(ts)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

const avgOf = (a) => (a.ratingCount > 0 ? (a.ratingSum / a.ratingCount).toFixed(1) : null);

function toast(msg, type = "ok") {
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 400);
  }, 3000);
}