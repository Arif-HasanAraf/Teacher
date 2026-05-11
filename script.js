const API = "https://script.google.com/macros/s/AKfycbxYbF-CeIyxYcTvq1fC1R5rUp3ViJUwsMvWhBu_C6IzpqhbIXKqa1Ghyqlov8vwBL2C/exec";
const PG  = 25;
const ST  = {
  teacher:"", pin:"", status:"", experience:"", photo:"",
  all:[], filtered:[],
  sortCol:"", sortDir:1, page:1,
  dateFilter:"all"
};

function driveDirectUrl(url) {
  if (!url) return "";
  
  if (url.includes("drive.google.com/uc") || url.includes("lh3.googleusercontent.com")) return url;
  
  var m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w200";
  return url;
}

function setAvatar(avatarEl, initialsEl, name, photoUrl) {
  const oldImg = avatarEl.querySelector("img");
  if (oldImg) oldImg.remove();
  const directUrl = driveDirectUrl(photoUrl);
  if (directUrl) {
    const img = document.createElement("img");
    img.src = directUrl;
    img.alt = name;
    img.onerror = () => { img.remove(); initialsEl.style.display = ""; };
    initialsEl.style.display = "none";
    avatarEl.appendChild(img);
  } else {
    initialsEl.style.display = "";
  }
}

function getInitials(name) {
  return name.split(" ").slice(0,2).map(w => w[0] || "").join("").toUpperCase();
}

function toggleDropdown() {
  const wrap = document.getElementById("profile-wrap");
  const overlay = document.getElementById("dd-overlay");
  const isOpen = wrap.classList.toggle("open");
  overlay.classList.toggle("active", isOpen);
}
function closeDropdown() {
  document.getElementById("profile-wrap").classList.remove("open");
  document.getElementById("dd-overlay").classList.remove("active");
}

function openPayStructure() {
  closeDropdown();
  el("dashboard").classList.add("hidden");
  el("pay-structure-screen").classList.remove("hidden");
  el("h-back-btn").classList.remove("hidden");
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}
function closePayStructure() {
  el("pay-structure-screen").classList.add("hidden");
  el("dashboard").classList.remove("hidden");
  el("h-back-btn").classList.add("hidden");
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function setDateFilter(mode) {
  ST.dateFilter = mode;
  ST.page = 1;
  document.querySelectorAll(".qf-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("qf-" + mode).classList.add("active");
  applyFilters();
}

function parseDateStr(s) {
  if (!s) return null;
  const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  const m = s.match(/([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const mon = months[m[1].toLowerCase()];
  if (mon === undefined) return null;
  return new Date(parseInt(m[3]), mon, parseInt(m[2]));
}

function isSameDay(d1, d2) {
  return d1.getFullYear()===d2.getFullYear() && d1.getMonth()===d2.getMonth() && d1.getDate()===d2.getDate();
}

function getDateTag(dateStr) {
  const d = parseDateStr(dateStr);
  if (!d) return "";
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  if (isSameDay(d, today)) return "today";
  if (isSameDay(d, tomorrow)) return "tomorrow";
  return "";
}

async function call(params) {
  const url = new URL(API);
  for (const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
  let text;
  try {
    const res = await fetch(url.toString(), {redirect:"follow"});
    text = await res.text();
  } catch(e) { throw new Error("Network failed: "+e.message); }
  if (text.trim().startsWith("<")) throw new Error("Apps Script returned HTML — check deployment settings.");
  let data;
  try { data = JSON.parse(text); }
  catch(e) { throw new Error("Invalid JSON from server."); }
  return data;
}

window.addEventListener("load", () => {
  try {
    const s = JSON.parse(sessionStorage.getItem("10ms") || "null");
    if (s && s.teacher && s.pin) {
      ST.teacher=s.teacher; ST.pin=s.pin; ST.status=s.status||"";
      ST.experience=s.experience||""; ST.photo=s.photo||"";
      showDashboard(); return;
    }
  } catch(_) {}
  loadTeachers();
  document.getElementById("qf-all").classList.add("active");
});

async function loadTeachers() {
  const sel = document.getElementById("sel-name");
  try {
    const d = await call({action:"teachers"});
    if (d.result==="ok" && d.teachers && d.teachers.length) {
      const sorted = d.teachers.slice().sort((a,b) => a.name.localeCompare(b.name));
      sel.innerHTML = '<option value="">— Select your name —</option>';
      sorted.forEach(t => {
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
    const d = await call({action:"auth", teacher, pin});
    if (d.result!=="ok") return showLoginErr(d.error||"Login failed. Check your PIN.");
    ST.teacher=d.teacher||teacher; ST.pin=pin; ST.status=d.teacherStatus||"";
    ST.experience=d.teacherExp||""; ST.photo=d.teacherPhoto||"";
    sessionStorage.setItem("10ms", JSON.stringify({
      teacher:ST.teacher, pin, status:ST.status,
      experience:ST.experience, photo:ST.photo
    }));
    showDashboard();
  } catch(e) {
    showLoginErr("Error: "+e.message);
  } finally { setBusy(false); }
}

function setBusy(on) {
  document.getElementById("login-btn").disabled=on;
  el("login-loading").classList.toggle("hidden",!on);
}
function showLoginErr(msg) { const e=el("login-err"); e.textContent=msg; e.classList.remove("hidden"); }
function hideLoginMsgs() { el("login-err").classList.add("hidden"); el("login-loading").classList.add("hidden"); }
document.getElementById("inp-pin").addEventListener("keydown", e=>{ if(e.key==="Enter") doLogin(); });
function togglePin() {
  const inp=document.getElementById("inp-pin");
  inp.type=inp.type==="password"?"text":"password";
  document.querySelector(".pin-eye").textContent=inp.type==="password"?"👁":"🙈";
}

function showDashboard() {
  el("login-screen").classList.add("hidden");
  el("dashboard").classList.remove("hidden");
  el("h-right").classList.remove("hidden");

  const first    = ST.teacher.split(" ")[0];
  const initials = getInitials(ST.teacher);

  
  el("h-av-initials").textContent = initials;
  setAvatar(el("h-av"), el("h-av-initials"), ST.teacher, ST.photo);

  
  el("h-name").textContent = ST.teacher;

  
  el("pd-av-initials").textContent = initials;
  setAvatar(el("pd-avatar"), el("pd-av-initials"), ST.teacher, ST.photo);

  
  el("pd-full-name").textContent = ST.teacher;
  el("pd-exp").textContent = ST.experience
    ? ST.experience + " of experience"
    : "Teaching at 10 Minute School";

  
  const gbadge = el("g-badge");
  if (ST.status === "Senior Teacher") {
    gbadge.textContent = "⭐ Senior Teacher"; gbadge.className = "s-badge senior";
  } else {
    gbadge.textContent = "Teacher"; gbadge.className = "s-badge teacher";
  }

  el("g-name").textContent = first;
  fetchClasses();
}

async function fetchClasses() {
  el("dash-err").classList.add("hidden");
  try {
    const d = await call({action:"classes", teacher:ST.teacher, pin:ST.pin});
    if (d.result!=="ok") { showDashErr(d.error||"Failed to load classes."); el("tbody").innerHTML=""; return; }
    if (!ST.status && d.teacherStatus) ST.status=d.teacherStatus;
    if (!ST.experience && d.teacherExp) ST.experience=d.teacherExp;
    if (!ST.photo && d.teacherPhoto) ST.photo=d.teacherPhoto;
    ST.all = d.classes||[];
    if (ST.all.length===0) {
      showDashErr("No classes found for "+ST.teacher+".");
      el("tbody").innerHTML=""; return;
    }
    buildFilters(); bindEvents(); applyFilters();
  } catch(e) { showDashErr("Error: "+e.message); el("tbody").innerHTML=""; }
}
function showDashErr(msg) { const d=el("dash-err"); d.textContent=msg; d.classList.remove("hidden"); }

function buildMonthYearMap(classes) {
  
  const map = {};
  classes.forEach(r => {
    if (!r.month) return;
    if (map[r.month]) return; 
    if (r.date) {
      const m = r.date.match(/(\d{4})$/);
      if (m) map[r.month] = m[1];
    }
  });
  return map;
}

function buildFilters() {
  const monthYearMap = buildMonthYearMap(ST.all);

  
  const uniqMonths = [...new Set(ST.all.map(r=>r.month).filter(Boolean))].sort();
  const selMonth = el("f-month");
  selMonth.innerHTML = '<option value="">All Months</option>';
  uniqMonths.forEach(v => {
    const o = document.createElement("option");
    o.value = v;
    
    o.textContent = monthYearMap[v] ? v + " " + monthYearMap[v] : v;
    selMonth.appendChild(o);
  });

  const uniq = k => [...new Set(ST.all.map(r=>r[k]).filter(Boolean))].sort();
  fillSel("f-subject", uniq("subject"), "All Subjects");
  fillSel("f-segment", uniq("segment"), "All Programs");
}

function fillSel(id, vals, ph) {
  const s=el(id);
  s.innerHTML=`<option value="">${ph}</option>`;
  vals.forEach(v=>{ const o=document.createElement("option"); o.value=o.textContent=v; s.appendChild(o); });
}

let eventsReady=false;
function bindEvents() {
  if (eventsReady) return; eventsReady=true;
  ["search","f-month","f-subject","f-segment"].forEach(id=>{
    el(id).addEventListener("input",  ()=>{ ST.page=1; applyFilters(); });
    el(id).addEventListener("change", ()=>{ ST.page=1; applyFilters(); });
  });
  document.querySelectorAll("thead th[data-col]").forEach(th=>{
    th.addEventListener("click",()=>{
      const col=th.dataset.col;
      ST.sortDir=ST.sortCol===col?ST.sortDir*-1:1; ST.sortCol=col;
      document.querySelectorAll("thead th").forEach(h=>h.classList.remove("sorted"));
      th.classList.add("sorted"); th.querySelector(".arr").textContent=ST.sortDir===1?"↑":"↓";
      applyFilters();
    });
  });
}

function applyFilters() {
  const q   = el("search").value.toLowerCase();
  const mon = el("f-month").value;
  const sub = el("f-subject").value;
  const seg = el("f-segment").value;
  const df  = ST.dateFilter;
  const today    = new Date();
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);

  ST.filtered = ST.all.filter(r=>{
    if (mon && r.month!==mon) return false;
    if (sub && r.subject!==sub) return false;
    if (seg && r.segment!==seg) return false;
    if (df==="today") { const d=parseDateStr(r.date); if (!d || !isSameDay(d,today)) return false; }
    if (df==="tomorrow") { const d=parseDateStr(r.date); if (!d || !isSameDay(d,tomorrow)) return false; }
    if (q) {
      const hay=[r.segment,r.month,r.subject,r.date,r.time,r.classTitle].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (ST.sortCol) {
    ST.filtered.sort((a,b)=>{
      const av=String(a[ST.sortCol]??"").toLowerCase();
      const bv=String(b[ST.sortCol]??"").toLowerCase();
      return av<bv?-ST.sortDir:av>bv?ST.sortDir:0;
    });
  }
  updateStats(); renderPage(); renderPayPanel();
}

function updateStats() {
  const a=ST.all, f=ST.filtered;
  const isFiltered=f.length!==a.length;
  const displayPay=isFiltered
    ? f.reduce((s,r)=>s+(r.payment||0),0)
    : a.reduce((s,r)=>s+(r.payment||0),0);
  el("s-total").textContent=isFiltered?f.length+" / "+a.length:a.length;
  el("s-subj").textContent=new Set(f.map(r=>r.subject).filter(Boolean)).size;
  el("s-seg").textContent=new Set(f.map(r=>r.segment).filter(Boolean)).size;
  el("s-mon").textContent=new Set(f.map(r=>r.month).filter(Boolean)).size;
  el("s-pay").textContent=displayPay>0?commas(displayPay):"—";
  document.querySelector(".stat:last-child .stat-lbl").textContent=isFiltered?"Filtered Earnings":"Total Earnings";
  el("g-sub").textContent=a.length+" class"+(a.length!==1?"es":"")+" scheduled";
}

function renderPage() {
  const total=ST.filtered.length;
  const pages=Math.max(1,Math.ceil(total/PG));
  if (ST.page>pages) ST.page=pages;
  const start=(ST.page-1)*PG;
  const slice=ST.filtered.slice(start,start+PG);
  renderTable(slice); renderCards(slice); renderPgn(pages,total,start,slice.length);
}

function buildDateTimeCell(r) {
  const tag = getDateTag(r.date);
  let badge="";
  if (tag==="today") badge=`<span class="dt-today">Today</span>`;
  else if (tag==="tomorrow") badge=`<span class="dt-tomorrow">Tomorrow</span>`;
  return `<div class="td-datetime">
    <div class="dt-date">${x(r.date)}${badge}</div>
    <div class="dt-time">${x(r.time)}</div>
  </div>`;
}

function renderTable(rows) {
  const tbody=el("tbody");
  const empty=el("empty-box");
  if (!rows.length) { tbody.innerHTML=""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  tbody.innerHTML=rows.map((r,i)=>`
    <tr style="animation-delay:${i*14}ms">
      <td><span class="badge b-seg">${x(r.segment)}</span></td>
      <td class="td-subj">${x(r.subject)}</td>
      <td>${buildDateTimeCell(r)}</td>
      <td class="td-ttl">${x(r.classTitle)}</td>
      <td>${r.payment
        ? `<span class="td-pay"><span class="sym">৳</span>${commas(r.payment)}</span>`
        : `<span class="td-na">—</span>`}</td>
    </tr>`).join("");
}

function renderCards(rows) {
  const list=el("card-list");
  if (!rows.length) { list.innerHTML=""; return; }
  list.innerHTML=rows.map((r,i)=>{
    const tag=getDateTag(r.date);
    let badge="";
    if (tag==="today") badge=`<span class="dt-today">Today</span>`;
    else if (tag==="tomorrow") badge=`<span class="dt-tomorrow">Tomorrow</span>`;
    return `
    <div class="ccard" style="animation-delay:${i*18}ms">
      <div class="cc-top">
        <div class="cc-subj">${x(r.subject)}</div>
        <div class="cc-time">${x(r.time)}</div>
      </div>
      <div class="cc-meta">
        <span class="badge b-seg">${x(r.segment)}</span>
        <span class="badge b-mon">${x(r.month)}</span>
      </div>
      <div class="cc-datetime">${x(r.date)}${badge}</div>
      ${r.classTitle?`<div class="cc-ttl">${x(r.classTitle)}</div>`:""}
      <div class="cc-foot">
        <span></span>
        ${r.payment
          ? `<span class="cc-pay"><span class="sym">৳</span>${commas(r.payment)}</span>`
          : `<span class="cc-na">Payment N/A</span>`}
      </div>
    </div>`;
  }).join("");
}

function renderPayPanel() {
  const panel=el("pay-panel");
  const paid=ST.filtered.filter(r=>r.payment);
  if (!paid.length) { panel.classList.add("hidden"); return; }
  panel.classList.remove("hidden");
  const groups={};
  paid.forEach(r=>{ const k=r.segment||"Other"; if (!groups[k]) groups[k]={count:0,total:0}; groups[k].count++; groups[k].total+=r.payment; });
  const grand=paid.reduce((s,r)=>s+r.payment,0);
  el("pay-amt").textContent=commas(grand);
  el("pay-grid").innerHTML=Object.entries(groups)
    .sort((a,b)=>b[1].total-a[1].total)
    .map(([seg,{count,total}])=>`
      <div class="pay-row">
        <div class="pr-dot"></div>
        <div class="pr-lbl"><strong>${x(seg)}</strong><span>${count} class${count!==1?"es":""}</span></div>
        <div class="pr-amt">৳ ${commas(total)}</div>
      </div>`).join("");
}

function renderPgn(pages,total,start,count) {
  const pgn=el("pgn");
  if (pages<=1) { pgn.classList.add("hidden"); return; }
  pgn.classList.remove("hidden");
  el("pgn-info").textContent=`Showing ${start+1}–${start+count} of ${total}`;
  const range=pageRange(ST.page,pages);
  let h=`<button class="pb" onclick="goPage(${ST.page-1})" ${ST.page===1?"disabled":""}>← Prev</button>`;
  range.forEach(p=>{ if(p==="…") h+=`<button class="pb" disabled>…</button>`; else h+=`<button class="pb ${p===ST.page?"active":""}" onclick="goPage(${p})">${p}</button>`; });
  h+=`<button class="pb" onclick="goPage(${ST.page+1})" ${ST.page===pages?"disabled":""}>Next →</button>`;
  el("pgn-btns").innerHTML=h;
}
function goPage(p) {
  const pages=Math.ceil(ST.filtered.length/PG);
  if(p<1||p>pages) return;
  ST.page=p; renderPage(); window.scrollTo({top:80,behavior:"smooth"});
}
function pageRange(cur,total) {
  if(total<=7) return Array.from({length:total},(_,i)=>i+1);
  const r=[];
  if(cur>3) r.push(1,"…"); else r.push(1,2,3);
  [cur-1,cur,cur+1].filter(n=>n>1&&n<total).forEach(n=>{ if(!r.includes(n)) r.push(n); });
  if(cur<total-2) r.push("…",total); else r.push(total-2,total-1,total);
  return [...new Set(r)];
}

function logout() {
  closeDropdown();
  sessionStorage.removeItem("10ms");
  Object.assign(ST,{teacher:"",pin:"",status:"",experience:"",photo:"",all:[],filtered:[],sortCol:"",sortDir:1,page:1,dateFilter:"all"});
  eventsReady=false;
  el("dashboard").classList.add("hidden");
  el("pay-structure-screen").classList.add("hidden");
  el("h-right").classList.add("hidden");
  el("h-back-btn").classList.add("hidden");
  el("login-screen").classList.remove("hidden");
  el("inp-pin").value="";
  hideLoginMsgs();
  document.querySelectorAll(".qf-btn").forEach(b=>b.classList.remove("active"));
  document.getElementById("qf-all").classList.add("active");
  loadTeachers();
}

const el=id=>document.getElementById(id);
const x=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const commas=n=>Number(n).toLocaleString("en-BD");
