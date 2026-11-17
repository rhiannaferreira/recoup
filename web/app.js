// Recoup front end: start -> confirm lines -> Rights Clock + findings -> drafts -> packet.
// Plain JS modules, no build step. Every decision comes from the API's rule engine.

import { EVIDENCE_ES, STRINGS } from "./i18n.js";
import { renderMarkdown } from "./markdown.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const urgency = (d) => (d <= 30 ? "urgent" : d <= 60 ? "soon" : "");
const toDate = (iso) => new Date(iso + "T12:00:00");

// ---- State, saved in this browser only ------------------------------------------
const STORE = "recoup.v1";
const prefs = load("recoup.prefs") || { lang: "en", big: false };
let state = { case: null, report: null, total: 0, approved: {}, draftIndex: null };

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ case: state.case, approved: state.approved }));
    localStorage.setItem("recoup.prefs", JSON.stringify(prefs));
  } catch {
    /* private mode: the app still works, it just won't remember */
  }
}

// ---- Language ---------------------------------------------------------------------
const t = (key, ...args) => {
  const v = STRINGS[prefs.lang][key] ?? STRINGS.en[key];
  return typeof v === "function" ? v(...args) : v;
};
const locale = () => (prefs.lang === "es" ? "es-US" : "en-US");
const money = (n) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: n % 1 ? 2 : 0 });
const fmtDate = (iso) => toDate(iso).toLocaleDateString(locale(), { month: "short", day: "numeric", year: "numeric" });
const evLabel = (label) => (prefs.lang === "es" && EVIDENCE_ES[label]) || label;

const DOC_TYPES = {
  en: { medical_bill: "Medical bill", good_faith_estimate: "Good Faith Estimate", insurance_eob: "Insurance statement", lease: "Lease", rent_ledger: "Rent ledger" },
  es: { medical_bill: "Factura médica", good_faith_estimate: "Estimado de buena fe", insurance_eob: "Estado de cuenta del seguro", lease: "Contrato de renta", rent_ledger: "Registro de renta" },
};

function applyStatic() {
  document.documentElement.lang = prefs.lang;
  for (const el of $$("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of $$("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml);
  for (const b of $$(".lang button")) b.setAttribute("aria-pressed", b.dataset.lang === prefs.lang);
  document.documentElement.classList.toggle("big", prefs.big);
  $("#bigText").setAttribute("aria-pressed", prefs.big);
}

async function setLang(lang) {
  prefs.lang = lang;
  save();
  applyStatic();
  const current = $$(".step").find((s) => !s.hidden)?.id;
  if (state.case) state.case.language = lang;
  if (current === "confirm") renderConfirm();
  if (current === "results" || current === "packet") {
    await analyze();
    if (current === "packet") await openPacket();
  }
}

for (const b of $$(".lang button")) b.onclick = () => setLang(b.dataset.lang);
$("#bigText").onclick = () => {
  prefs.big = !prefs.big;
  save();
  applyStatic();
};

// ---- Plumbing ---------------------------------------------------------------------
function show(id, crumb = "") {
  for (const s of $$(".step")) s.hidden = s.id !== id;
  $("#crumb").textContent = crumb;
  window.scrollTo({ top: 0 });
}

async function api(path, body, as = "json") {
  const init = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(await res.text());
  return as === "text" ? res.text() : as === "blob" ? res.blob() : res.json();
}

function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- 1. Start ---------------------------------------------------------------------
$("#demo").onclick = async () => {
  state = { case: await api("/api/samples/maria"), report: null, total: 0, approved: {}, draftIndex: null };
  state.case.language = prefs.lang;
  save();
  renderConfirm();
};

$("#resume").onclick = () => {
  const saved = load(STORE);
  state = { ...state, case: saved.case, approved: saved.approved || {} };
  state.case.language = prefs.lang;
  renderConfirm();
};

$("#file").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/intake", { method: "POST", body: form });
  if (!res.ok) {
    $("#startNote").textContent = (await res.json()).detail || "We couldn't read that file.";
    return;
  }
  state.case ??= { person: { name: "You", state: "CO", household_size: 1 }, documents: [], language: prefs.lang };
  state.case.documents.push(await res.json());
  save();
  renderConfirm();
};

$("#home").onclick = (e) => {
  e.preventDefault();
  $("#resume").hidden = !load(STORE)?.case;
  show("start");
};

// ---- 2. Confirm -------------------------------------------------------------------
function renderConfirm() {
  $("#docs").innerHTML = state.case.documents
    .map(
      (d, di) => `
    <section class="doc">
      <div class="doc-head">
        <span class="doc-title">${esc(d.title)}</span>
        <span class="doc-type">${esc(DOC_TYPES[prefs.lang][d.type] || d.type)}</span>
      </div>
      <table class="lines">
        <thead><tr><th style="width:44px"></th><th>${t("col.item")}</th><th class="code">${t("col.code")}</th><th class="num">${t("col.qty")}</th><th class="num">${t("col.amount")}</th></tr></thead>
        <tbody>
        ${d.lines
          .map(
            (l, li) => `<tr class="${l.confirmed === false ? "off" : ""}">
              <td><input class="check" type="checkbox" data-d="${di}" data-l="${li}" ${l.confirmed !== false ? "checked" : ""} aria-label="${esc(l.description)}"></td>
              <td>${esc(l.description)}${l.times_paid ? ` <span class="note">· ${t("paid", l.times_paid)}</span>` : ""}</td>
              <td class="code">${esc(l.code || "")}</td>
              <td class="num">${l.units ?? 1}</td>
              <td class="num">${money(l.amount)}</td></tr>`
          )
          .join("")}
        </tbody>
      </table>
    </section>`
    )
    .join("");
  for (const box of $$("#docs .check")) {
    box.onchange = () => {
      state.case.documents[box.dataset.d].lines[box.dataset.l].confirmed = box.checked;
      box.closest("tr").classList.toggle("off", !box.checked);
      state.approved = {}; // findings may change
      save();
      countLines();
    };
  }
  countLines();
  show("confirm", state.case.person.name);
}

function countLines() {
  const all = state.case.documents.flatMap((d) => d.lines);
  const on = all.filter((l) => l.confirmed !== false).length;
  $("#lineCount").textContent = t("confirm.count", on, all.length, state.case.documents.length);
}

async function analyze() {
  const out = await api("/api/analyze?explain=true", state.case);
  state.report = out.report;
  state.total = out.total_recoverable;
  renderResults();
}

$("#run").onclick = async () => {
  $("#run").disabled = true;
  try {
    await analyze();
  } finally {
    $("#run").disabled = false;
  }
};

// ---- 3. Results -------------------------------------------------------------------
const liveDeadlines = (r) =>
  r.findings
    .map((f, i) => ({ ...f, i }))
    .filter((f) => f.deadline && f.deadline.days_left >= 0)
    .sort((a, b) => a.deadline.days_left - b.deadline.days_left);

function renderResults() {
  const r = state.report;
  const live = liveDeadlines(r);
  const p = r.person;
  $("#caseLine").textContent = [p.name, p.state, t("docs", new Set(r.findings.map((f) => f.document_id)).size)].join("  ·  ");
  $("#total").textContent = money(state.total);
  $("#stats").innerHTML = `
    <div><dt>${t("results.found")}</dt><dd>${r.findings.length}</dd></div>
    <div><dt>${t("results.deadlines")}</dt><dd>${live.length}</dd></div>
    <div><dt>${t("results.next")}</dt><dd class="${live[0] ? urgency(live[0].deadline.days_left) : ""}">${live[0] ? live[0].deadline.days_left + "d" : "–"}</dd></div>`;

  renderTimeline(r.today, live);

  $("#clock").innerHTML = live.length
    ? live
        .map((f) => {
          const used = Math.min(100, Math.max(2, 100 - (f.deadline.days_left / f.deadline.window_days) * 100));
          const u = urgency(f.deadline.days_left);
          const anchor = prefs.lang === "en" ? ` ${esc(f.deadline.anchor)}.` : "";
          return `<li>
            <div class="days ${u}">${f.deadline.days_left}<small>${t("days.left")}</small></div>
            <div>
              <div class="clock-title">${esc(f.title)}</div>
              <div class="clock-meta">${t("ends", fmtDate(f.deadline.date))}${anchor}</div>
              <div class="bar ${u}"><i style="width:${used}%"></i></div>
            </div>
            <div>${f.recoverable ? `<span class="money">${money(f.recoverable)}</span>` : ""}</div>
          </li>`;
        })
        .join("")
    : `<li><div></div><div class="clock-meta">${t("results.none")}</div></li>`;

  $("#findings").innerHTML = r.findings.map((f, i) => entry(f, i)).join("");
  for (const row of $$(".entry-row")) {
    row.onclick = () => row.setAttribute("aria-expanded", row.parentElement.classList.toggle("open"));
  }
  for (const b of $$("[data-draft]")) b.onclick = () => openDraft(+b.dataset.draft);
  $("#rulesNote").textContent = t("results.rules", r.rules_checked, r.rules_matched);
  show("results");
}

function renderTimeline(todayIso, live) {
  const el = $("#timeline");
  if (!live.length) return (el.innerHTML = "");
  const start = toDate(todayIso);
  const lastDays = Math.max(...live.map((f) => f.deadline.days_left));
  const span = Math.ceil((lastDays + 20) / 30) * 30;
  const pos = (days) => `${(days / span) * 100}%`;
  const ticks = [];
  const m = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  while ((m - start) / 864e5 < span) {
    const d = Math.round((m - start) / 864e5);
    ticks.push(`<div class="tl-tick" style="left:${pos(d)}"><span>${m.toLocaleDateString(locale(), { month: "short" })}</span></div>`);
    m.setMonth(m.getMonth() + 1);
  }
  const pins = live.map((f) => {
    const cls = urgency(f.deadline.days_left) === "urgent" ? "urgent" : f.recoverable ? "money" : "";
    return `<div class="tl-pin ${cls}" style="left:${pos(f.deadline.days_left)}" title="${esc(f.title)}"><span>${f.deadline.days_left}d</span></div>`;
  });
  el.innerHTML = `<div class="tl-axis"></div><div class="tl-today">${t("today")}</div>${ticks.join("")}${pins.join("")}`;
}

function tagsFor(f) {
  const tags = [];
  if (f.deadline && f.deadline.days_left >= 0) tags.push(`<span class="tag ${urgency(f.deadline.days_left)}">${t("days", f.deadline.days_left)}</span>`);
  if (f.deadline && f.deadline.days_left < 0) tags.push(`<span class="tag">${t("tag.expired")}</span>`);
  if (f.confidence === "check") tags.push(`<span class="tag">${t("tag.check")}</span>`);
  if (f.confidence === "info") tags.push(`<span class="tag">${t("tag.info")}</span>`);
  return tags.join("");
}

function receipt(f) {
  const lines = f.evidence
    .map(
      (e) => `<div class="rc-line"><span class="k">${esc(evLabel(e.label))}</span><span class="dots"></span><span class="v">${esc(e.value)}</span></div>
              <div class="rc-src">${esc(e.source)}</div>`
    )
    .join("");
  return `<div class="receipt">
      <h4>${t("receipt")}</h4>
      ${lines}
      <div class="rc-law">
        <div><strong>${esc(f.citation.law)}</strong>${f.citation.section ? ` · ${esc(f.citation.section)}` : ""}</div>
        ${f.citation.quote ? `<blockquote>“${esc(f.citation.quote)}”</blockquote>` : ""}
      </div>
      <div class="rc-foot">
        <span>${esc(f.rule_id)}</span>
        <a href="${esc(f.citation.url)}" target="_blank" rel="noopener">${t("source")}</a>
      </div>
      ${f.recoverable_note && prefs.lang === "en" ? `<p class="rc-src" style="margin-top:12px">${esc(f.recoverable_note)}</p>` : ""}
    </div>`;
}

function entry(f, i) {
  const doc = state.case.documents.find((d) => d.id === f.document_id);
  const approved = state.approved[i] ? ` <span class="tag approved-tag">✓</span>` : "";
  return `
  <article class="entry">
    <button class="entry-row" aria-expanded="false">
      <div class="entry-amt">${f.recoverable ? `<span class="money">${money(f.recoverable)}</span>` : `<span class="nil">${t("noRefund")}</span>`}</div>
      <div class="entry-main">
        <div class="entry-title">${esc(f.title)}${approved}</div>
        <div class="entry-sub">${esc(doc ? doc.title : "")}${f.line_ids.length ? ` · ${t("line", f.line_ids.join(", "))}` : ""}</div>
      </div>
      <div class="tags">${tagsFor(f)}</div>
      <span class="chev" aria-hidden="true"></span>
    </button>
    <div class="entry-body">
      <div>
        <p class="explain">${esc(f.summary)}</p>
        ${receipt(f)}
        <div class="entry-actions">
          <button class="btn btn-solid" data-draft="${i}">${esc(f.action_label)} <span aria-hidden="true">→</span></button>
        </div>
      </div>
    </div>
  </article>`;
}

$("#calendar").onclick = async () => downloadBlob(await api("/api/calendar", state.case, "blob"), "recoup-deadlines.ics");

// ---- Draft sheet --------------------------------------------------------------------
async function openDraft(i) {
  const f = state.report.findings[i];
  state.draftIndex = i;
  $("#sheetTitle").textContent = f.action_label;
  $("#englishNote").hidden = prefs.lang === "en";
  const text = state.approved[i] ?? (await api("/api/draft", { case: state.case, finding_index: i }, "text"));
  $("#draftText").value = text;
  setView("preview");
  markApproved(Boolean(state.approved[i]));
  $("#sheet").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeSheet() {
  speechSynthesis.cancel();
  $("#sheet").hidden = true;
  document.body.style.overflow = "";
}

function setView(view) {
  for (const tab of $$(".sheet-tabs button")) tab.setAttribute("aria-selected", tab.dataset.view === view);
  if (view === "preview") $("#draftPreview").innerHTML = renderMarkdown($("#draftText").value);
  $("#draftPreview").hidden = view !== "preview";
  $("#draftText").hidden = view !== "edit";
}

function markApproved(on) {
  $("#approve").textContent = t(on ? "sheet.approved" : "sheet.approve");
  $("#approve").classList.toggle("approved", on);
}

for (const tab of $$(".sheet-tabs button")) tab.onclick = () => setView(tab.dataset.view);
for (const c of $$("[data-close]")) c.onclick = closeSheet;
document.addEventListener("keydown", (e) => e.key === "Escape" && !$("#sheet").hidden && closeSheet());
$("#draftText").oninput = () => {
  delete state.approved[state.draftIndex];
  markApproved(false);
};

$("#approve").onclick = () => {
  state.approved[state.draftIndex] = $("#draftText").value;
  save();
  markApproved(true);
  renderResults();
  $$(".entry")[state.draftIndex]?.classList.add("open");
};
$("#copy").onclick = () => navigator.clipboard.writeText($("#draftText").value);
$("#download").onclick = () =>
  downloadBlob(
    new Blob([$("#draftText").value], { type: "text/markdown" }),
    `${$("#sheetTitle").textContent.replace(/\W+/g, "-").replace(/-+$/, "").toLowerCase()}.md`
  );
$("#readAloud").onclick = () => {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance($("#draftPreview").innerText || $("#draftText").value);
  u.lang = "en-US";
  speechSynthesis.speak(u);
};

// ---- 4. Evidence packet ----------------------------------------------------------------
async function openPacket() {
  const pk = await api("/api/packet", state.case);
  const r = pk.report;
  const order = pk.items
    .map((it, n) => {
      const f = it.finding;
      return `<tr>
        <td class="num">${n + 1}</td>
        <td>${f.deadline && f.deadline.days_left >= 0 ? `<strong>${fmtDate(f.deadline.date)}</strong><br><span class="note">${t("days", f.deadline.days_left)}</span>` : `<span class="note">${t("packet.noDeadline")}</span>`}</td>
        <td>${esc(f.title)}</td>
        <td class="num">${f.recoverable ? money(f.recoverable) : "–"}</td>
        <td>${esc(f.action_label)}</td></tr>`;
    })
    .join("");
  const sections = pk.items
    .map((it, n) => {
      const f = it.finding;
      const text = state.approved[it.index] ?? it.draft;
      return `<section class="pk-item">
        <div class="pk-head">
          <span class="pk-num">${String(n + 1).padStart(2, "0")}</span>
          <div><h3>${esc(f.title)}</h3><div class="tags" style="justify-content:flex-start">${tagsFor(f)}</div></div>
          <div class="pk-amt">${f.recoverable ? `<span class="money">${money(f.recoverable)}</span>` : ""}</div>
        </div>
        <p class="explain">${esc(f.summary)}</p>
        ${receipt(f)}
        <h4 class="pk-draft-label">${t("packet.draft")}${state.approved[it.index] ? " · ✓" : ""}</h4>
        <div class="paper pk-paper">${renderMarkdown(text)}</div>
      </section>`;
    })
    .join("");
  $("#packetBody").innerHTML = `
    <header class="pk-cover">
      <p class="eyebrow">${t("packet.title")}</p>
      <h1>${esc(r.person.name)}</h1>
      <p class="lede">${t("packet.lede")}</p>
      <div class="pk-total"><span id="pkTotal">${money(pk.total_recoverable)}</span> <span class="figure-label">${t("results.recoverable")}</span></div>
      <p class="note">${t("packet.for")} ${esc(r.person.name)} ${t("packet.on")} ${fmtDate(r.today)}</p>
    </header>
    <h2>${t("packet.order")}</h2>
    <table class="lines pk-order">
      <thead><tr><th class="num">#</th><th>${t("packet.deadline")}</th><th>${t("packet.right")}</th><th class="num">${t("packet.amount")}</th><th>${t("packet.action")}</th></tr></thead>
      <tbody>${order}</tbody>
    </table>
    ${sections}
    <p class="note pk-foot">${t("packet.disclaimer")}</p>`;
  show("packet", r.person.name);
}

$("#openPacket").onclick = openPacket;
$("#packetBack").onclick = () => show("results");
$("#print").onclick = () => window.print();

// ---- Boot -----------------------------------------------------------------------------
applyStatic();
$("#resume").hidden = !load(STORE)?.case;
