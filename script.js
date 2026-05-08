const API = "https://script.google.com/macros/s/AKfycbzYXvKDKR-KKj4zDJETuc_Q_6hJXt_PFIW9ZaGxIymuXdWRA7btbLiG9OSFlqBJPD4S/exec";
const PG = 25;
const ST = {
teacher:"", pin:"", status:"",
all:[], filtered:[],
sortCol:"", sortDir:1, page:1
};
function updateClock() {
const now = new Date();
const t = now.toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
const d = now.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
const cl = document.getElementById('live-clock');
const dl = document.getElementById('live-date');
if (cl) cl.textContent = t;
if (dl) dl.textContent = d;
}
setInterval(updateClock, 1000);
updateClock();
async function call(params) {
const url = new URL(API);
for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
let text;
try {
const res = await fetch(url.toString(), { redirect: "follow" });
text = await res.text();
} catch(e) {
throw new Error("Network failed: " + e.message);
}
if (text.trim().startsWith("<")) {
console.error("Got HTML instead of JSON:", text.slice(0, 200));
throw new Error("Apps Script returned HTML — check deployment settings.");
}
let data;
try { data = JSON.parse(text); }
catch(e) { console.error("Raw response:", text.slice(0, 300)); throw new Error("Invalid JSON from server."); }
console.log("API response for", params.action, ":", data);
return data;
}
window.addEventListener("load", () => {
if (API === "YOUR_APPS_SCRIPT_URL_HERE") {
document.getElementById("setup-banner").classList.remove("hidden");
}
try {
const s = JSON.parse(sessionStorage.getItem("10ms") || "null");
if (s && s.teacher && s.pin) {
ST.teacher = s.teacher; ST.pin = s.pin; ST.status = s.status || "";
showDashboard(); return;
}
} catch(_) {}
loadTeachers();
});
async function loadTeachers() {
const sel = document.getElementById("sel-name");
try {
const d = await call({ action: "teachers" });
if (d.result === "ok" && d.teachers && d.teachers.length) {
sel.innerHTML = '<option value="">— Select your name —</option>';
d.teachers.forEach(t => {
const o = document.createElement("option");
o.value = t.name; o.textContent = t.name;
sel.appendChild(o);
});
} else {
sel.innerHTML = '<option value="">No teachers found</option>';
}
} catch(e) {
sel.innerHTML = '<option value="">Error loading — check URL</option>';
console.error(e);
}
}
async function doLogin() {
const teacher = document.getElementById("sel-name").value.trim();
const pin     = document.getElementById("inp-pin").value.trim();
hideLoginMsgs();
if (!teacher) return showLoginErr("Please select your name.");
if (!pin)     return showLoginErr("Please enter your PIN.");
setBusy(true);
try {
const d = await call({ action: "auth", teacher, pin });
if (d.result !== "ok") return showLoginErr(d.error || "Login failed. Check your PIN.");
ST.teacher = d.teacher || teacher;
ST.pin     = pin;
ST.status  = d.teacherStatus || "";
sessionStorage.setItem("10ms", JSON.stringify({ teacher: ST.teacher, pin, status: ST.status }));
showDashboard();
} catch(e) {
showLoginErr("Error: " + e.message);
} finally {
setBusy(false);
}
}
function setBusy(on) {
document.getElementById("login-btn").disabled = on;
el("login-loading").classList.toggle("hidden", !on);
}
function showLoginErr(msg) {
const e = el("login-err");
e.textContent = msg; e.classList.remove("hidden");
}
function hideLoginMsgs() {
el("login-err").classList.add("hidden");
el("login-loading").classList.add("hidden");
}
document.getElementById("inp-pin").addEventListener("keydown", e => {
if (e.key === "Enter") doLogin();
});
function togglePin() {
const inp = document.getElementById("inp-pin");
inp.type = inp.type === "password" ? "text" : "password";
document.querySelector(".pin-eye").textContent = inp.type === "password" ? "👁" : "🙈";
}
function showDashboard() {
el("login-screen").classList.add("hidden");
el("dashboard").classList.remove("hidden");
el("h-right").classList.remove("hidden");
const first    = ST.teacher.split(" ")[0];
const initials = ST.teacher.split(" ").slice(0,2).map(w=>w[0]||"").join("").toUpperCase();
el("h-av").textContent    = initials;
el("h-name").textContent  = ST.teacher;
el("h-badge").textContent = ST.status || "Teacher";
el("g-name").textContent  = first;
const badge = el("g-badge");
if (ST.status === "Senior Teacher") {
badge.textContent = "⭐ Senior Teacher"; badge.className = "s-badge senior";
} else {
badge.textContent = "Teacher"; badge.className = "s-badge teacher";
}
fetchClasses();
}
async function fetchClasses() {
el("dash-err").classList.add("hidden");
try {
const d = await call({ action: "classes", teacher: ST.teacher, pin: ST.pin });
if (d.result !== "ok") {
showDashErr(d.error || "Failed to load classes.");
el("tbody").innerHTML = ""; return;
}
if (!ST.status && d.teacherStatus) ST.status = d.teacherStatus;
ST.all = d.classes || [];
console.log("Total classes loaded:", ST.all.length);
if (ST.all.length === 0) {
showDashErr("No classes found for " + ST.teacher + ". Make sure the name in TEACHERS config exactly matches the 'Teacher 1' column in your sheet.");
el("tbody").innerHTML = ""; return;
}
buildFilters(); bindEvents(); applyFilters();
} catch(e) {
showDashErr("Error: " + e.message);
el("tbody").innerHTML = "";
}
}
function showDashErr(msg) {
const d = el("dash-err");
d.textContent = msg; d.classList.remove("hidden");
}
function buildFilters() {
const uniq = k => [...new Set(ST.all.map(r=>r[k]).filter(Boolean))].sort();
fillSel("f-month",   uniq("month"),   "All Months");
fillSel("f-subject", uniq("subject"), "All Subjects");
fillSel("f-segment", uniq("segment"), "All Segments");
}
function fillSel(id, vals, ph) {
const s = el(id);
s.innerHTML = `<option value="">${ph}</option>`;
vals.forEach(v => { const o = document.createElement("option"); o.value=o.textContent=v; s.appendChild(o); });
}
let eventsReady = false;
function bindEvents() {
if (eventsReady) return;
eventsReady = true;
["search","f-month","f-subject","f-segment"].forEach(id => {
el(id).addEventListener("input",  () => { ST.page=1; applyFilters(); });
el(id).addEventListener("change", () => { ST.page=1; applyFilters(); });
});
document.querySelectorAll("thead th[data-col]").forEach(th => {
th.addEventListener("click", () => {
const col = th.dataset.col;
ST.sortDir = ST.sortCol === col ? ST.sortDir * -1 : 1;
ST.sortCol = col;
document.querySelectorAll("thead th").forEach(h => h.classList.remove("sorted"));
th.classList.add("sorted");
th.querySelector(".arr").textContent = ST.sortDir === 1 ? "↑" : "↓";
applyFilters();
});
});
}
function applyFilters() {
const q   = el("search").value.toLowerCase();
const mon = el("f-month").value;
const sub = el("f-subject").value;
const seg = el("f-segment").value;
ST.filtered = ST.all.filter(r => {
if (mon && r.month   !== mon) return false;
if (sub && r.subject !== sub) return false;
if (seg && r.segment !== seg) return false;
if (q) {
const hay = [r.segment,r.month,r.subject,r.date,r.time,r.classTitle].join(" ").toLowerCase();
if (!hay.includes(q)) return false;
}
return true;
});
if (ST.sortCol) {
ST.filtered.sort((a, b) => {
const av = String(a[ST.sortCol]??"").toLowerCase();
const bv = String(b[ST.sortCol]??"").toLowerCase();
return av < bv ? -ST.sortDir : av > bv ? ST.sortDir : 0;
});
}
updateStats(); renderPage(); renderPayPanel();
}
function updateStats() {
const a = ST.all;
const f = ST.filtered;
const isFiltered = f.length !== a.length;
const displayPay = isFiltered
? f.reduce((s,r) => s+(r.payment||0), 0)
: a.reduce((s,r) => s+(r.payment||0), 0);
el("s-total").textContent = isFiltered ? f.length + " / " + a.length : a.length;
el("s-subj").textContent  = new Set(f.map(r=>r.subject).filter(Boolean)).size;
el("s-seg").textContent   = new Set(f.map(r=>r.segment).filter(Boolean)).size;
el("s-mon").textContent   = new Set(f.map(r=>r.month).filter(Boolean)).size;
el("s-pay").textContent   = displayPay > 0 ? commas(displayPay) : "—";
document.querySelector(".stat:last-child .stat-lbl").textContent =
isFiltered ? "Filtered Earnings" : "Total Earnings";
el("g-sub").textContent = a.length + " class" + (a.length!==1?"es":"") + " scheduled";
}
function renderPage() {
const total = ST.filtered.length;
const pages = Math.max(1, Math.ceil(total/PG));
if (ST.page > pages) ST.page = pages;
const start = (ST.page-1)*PG;
const slice = ST.filtered.slice(start, start+PG);
el("rcount").textContent = total + " class" + (total!==1?"es":"");
renderTable(slice);
renderCards(slice);
renderPgn(pages, total, start, slice.length);
}
function renderTable(rows) {
const tbody = el("tbody");
const empty = el("empty-box");
if (!rows.length) { tbody.innerHTML=""; empty.classList.remove("hidden"); return; }
empty.classList.add("hidden");
tbody.innerHTML = rows.map((r,i) => `
<tr style="animation-delay:${i*14}ms">
<td><span class="badge b-seg">${x(r.segment)}</span></td>
<td><span class="badge b-mon">${x(r.month)}</span></td>
<td class="td-subj">${x(r.subject)}</td>
<td class="td-date">${x(r.date)}</td>
<td class="td-time">${x(r.time)}</td>
<td class="td-ttl">${x(r.classTitle)}</td>
<td>${r.payment
? `<span class="td-pay"><span class="sym">৳</span>${commas(r.payment)}</span>`
: `<span class="td-na">—</span>`}</td>
</tr>`).join("");
}
function renderCards(rows) {
const list = el("card-list");
if (!rows.length) { list.innerHTML=""; return; }
list.innerHTML = rows.map((r,i) => `
<div class="ccard" style="animation-delay:${i*18}ms">
<div class="cc-top">
<div class="cc-subj">${x(r.subject)}</div>
<div class="cc-time">${x(r.time)}</div>
</div>
<div class="cc-meta">
<span class="badge b-seg">${x(r.segment)}</span>
<span class="badge b-mon">${x(r.month)}</span>
</div>
<div class="cc-date">${x(r.date)}</div>
${r.classTitle?`<div class="cc-ttl">${x(r.classTitle)}</div>`:""}
<div class="cc-foot">
<span></span>
${r.payment
? `<span class="cc-pay"><span class="sym">৳</span>${commas(r.payment)}</span>`
: `<span class="cc-na">Payment N/A</span>`}
</div>
</div>`).join("");
}
function renderPayPanel() {
const panel = el("pay-panel");
const paid  = ST.filtered.filter(r=>r.payment);
if (!paid.length) { panel.classList.add("hidden"); return; }
panel.classList.remove("hidden");
const groups = {};
paid.forEach(r => {
const k = r.segment || "Other";
if (!groups[k]) groups[k] = { count:0, total:0 };
groups[k].count++;
groups[k].total += r.payment;
});
const grand = paid.reduce((s,r)=>s+r.payment, 0);
el("pay-amt").textContent = commas(grand);
el("pay-grid").innerHTML = Object.entries(groups)
.sort((a,b)=>b[1].total-a[1].total)
.map(([seg,{count,total}]) => `
<div class="pay-row">
<div class="pr-dot"></div>
<div class="pr-lbl">
<strong>${x(seg)}</strong>
<span>${count} class${count!==1?"es":""}</span>
</div>
<div class="pr-amt">৳ ${commas(total)}</div>
</div>`).join("");
}
function renderPgn(pages, total, start, count) {
const pgn = el("pgn");
if (pages<=1) { pgn.classList.add("hidden"); return; }
pgn.classList.remove("hidden");
el("pgn-info").textContent = `Showing ${start+1}–${start+count} of ${total}`;
const range = pageRange(ST.page, pages);
let h = `<button class="pb" onclick="goPage(${ST.page-1})" ${ST.page===1?"disabled":""}>← Prev</button>`;
range.forEach(p => {
if (p==="…") h+=`<button class="pb" disabled>…</button>`;
else h+=`<button class="pb ${p===ST.page?"active":""}" onclick="goPage(${p})">${p}</button>`;
});
h+=`<button class="pb" onclick="goPage(${ST.page+1})" ${ST.page===pages?"disabled":""}>Next →</button>`;
el("pgn-btns").innerHTML = h;
}
function goPage(p) {
const pages = Math.ceil(ST.filtered.length/PG);
if (p<1||p>pages) return;
ST.page = p; renderPage();
window.scrollTo({top:80,behavior:"smooth"});
}
function pageRange(cur, total) {
if (total<=7) return Array.from({length:total},(_,i)=>i+1);
const r=[];
if (cur>3) r.push(1,"…"); else r.push(1,2,3);
[cur-1,cur,cur+1].filter(n=>n>1&&n<total).forEach(n=>{if(!r.includes(n))r.push(n);});
if (cur<total-2) r.push("…",total); else r.push(total-2,total-1,total);
return [...new Set(r)];
}
function logout() {
sessionStorage.removeItem("10ms");
Object.assign(ST, {teacher:"",pin:"",status:"",all:[],filtered:[],sortCol:"",sortDir:1,page:1});
eventsReady = false;
el("dashboard").classList.add("hidden");
el("h-right").classList.add("hidden");
el("login-screen").classList.remove("hidden");
el("inp-pin").value="";
hideLoginMsgs();
loadTeachers();
}
const el = id => document.getElementById(id);
const x  = s  => String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const commas = n => Number(n).toLocaleString("en-BD");