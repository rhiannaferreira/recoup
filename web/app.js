// Recoup front end: start -> confirm lines -> Rights Clock + findings -> drafts -> packet.
// Plain JS modules, no build step. Every decision comes from the API's rule engine.

import { EVIDENCE_ES, STATES, STRINGS } from "./i18n.js";
import { renderMarkdown } from "./markdown.js";
import { NEXT_STEPS } from "./next_steps.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const urgency = (d) => (d <= 30 ? "urgent" : d <= 60 ? "soon" : "");
const toDate = (iso) => new Date(iso + "T12:00:00");

// ---- State, saved in this browser only ------------------------------------------
const STORE = "recoup.v1";
const prefs = load("recoup.prefs") || { lang: "en", big: false };
let state = { case: null, report: null, total: 0, approved: {}, progress: {}, draftIndex: null };

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ case: state.case, approved: state.approved, progress: state.progress }));
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
  for (const el of $$("[data-i18n-label]")) el.setAttribute("aria-label", t(el.dataset.i18nLabel)), el.setAttribute("title", t(el.dataset.i18nLabel));
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
  if (current === "about") openAbout();
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
  const heading = $(`#${id} h1, #${id} h2`);
  if (heading && id !== "start") {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
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
async function openSample(name) {
  state = { case: await api(`/api/samples/${name}`), report: null, total: 0, approved: {}, progress: {}, draftIndex: null };
  state.case.language = prefs.lang;
  save();
  renderConfirm();
}
for (const b of $$("[data-sample]")) b.onclick = () => openSample(b.dataset.sample);

$("#resume").onclick = () => {
  const saved = load(STORE);
  state = { ...state, case: saved.case, approved: saved.approved || {}, progress: saved.progress || {} };
  state.case.language = prefs.lang;
  renderConfirm();
};

async function upload(file) {
  if (!file) return;
  const note = $("#startNote");
  note.textContent = t("upload.reading", file.name);
  note.classList.remove("error");
  document.body.classList.add("busy");
  try {
    if (file.name.endsWith(".json")) {
      // A saved case (person + documents) or a single structured document.
      const data = JSON.parse(await file.text());
      if (data.documents) {
        state = { case: { ...data, language: prefs.lang }, report: null, total: 0, approved: {}, progress: {}, draftIndex: null };
        save();
        note.textContent = t("start.note");
        return renderConfirm();
      }
    }
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/intake", { method: "POST", body: form });
    if (!res.ok) {
      console.warn("intake failed:", (await res.json().catch(() => ({}))).detail);
      throw new Error(t("upload.failed"));
    }
    state.case ??= { person: { name: "", state: "CO", household_size: 1 }, documents: [], language: prefs.lang };
    state.case.documents.push(await res.json());
    save();
    note.textContent = t("start.note");
    renderConfirm();
  } catch (err) {
    note.textContent = err.message;
    note.classList.add("error");
  } finally {
    document.body.classList.remove("busy");
  }
}

$("#file").onchange = (e) => upload(e.target.files[0]);

// Drop a file anywhere on the start screen.
for (const type of ["dragenter", "dragover"]) {
  $("#start").addEventListener(type, (e) => {
    e.preventDefault();
    $("#start").classList.add("dropping");
  });
}
for (const type of ["dragleave", "drop"]) {
  $("#start").addEventListener(type, (e) => {
    e.preventDefault();
    if (type === "dragleave" && $("#start").contains(e.relatedTarget)) return;
    $("#start").classList.remove("dropping");
    if (type === "drop") upload(e.dataTransfer.files[0]);
  });
}

$("#home").onclick = (e) => {
  e.preventDefault();
  $("#resume").hidden = !load(STORE)?.case;
  show("start");
};

// Countdown ring: the arc is the share of the window still left.
function ring(days, windowDays, u) {
  const r = 30, c = 2 * Math.PI * r;
  const left = Math.max(0, Math.min(1, days / (windowDays || days || 1)));
  return `<div class="ring ${u}" role="img" aria-label="${days} ${t("days.left")}">
    <svg viewBox="0 0 72 72" aria-hidden="true"><circle class="track" cx="36" cy="36" r="${r}"/>
    <circle class="arc" cx="36" cy="36" r="${r}" stroke-dasharray="${(c * left).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 36 36)"/></svg>
    <span aria-hidden="true">${days}<small>${t("days.short")}</small></span></div>`;
}

// ---- 2. Confirm -------------------------------------------------------------------
$("#stateSelect").innerHTML = STATES.map((s) => `<option>${s}</option>`).join("");

function fillDetails() {
  const f = $("#details");
  const p = state.case.person;
  f.name.value = p.name ?? "";
  f.state.value = p.state ?? "CO";
  const n = p.household_size ?? 1;
  f.household_size.value = String(Math.min(n, 6));
  f.household_more.hidden = n < 6;
  f.household_more.value = n >= 6 ? n : 6;
  f.annual_income.value = p.annual_income ?? "";
}

$("#details").oninput = (e) => {
  const { name, value } = e.target;
  const p = state.case.person;
  if (name === "household_size" || name === "household_more") {
    const n = Math.max(1, parseInt(value, 10) || 1);
    p.household_size = name === "household_size" && n === 6 ? Math.max(6, parseInt(e.currentTarget.household_more.value, 10) || 6) : n;
    e.currentTarget.household_more.hidden = p.household_size < 6;
  }
  else if (name === "annual_income") p.annual_income = value === "" ? null : Number(value);
  else p[name] = value;
  state.approved = {};
  save();
};
$("#details").onsubmit = (e) => e.preventDefault();

function renderConfirm() {
  fillDetails();
  $("#docs").innerHTML = state.case.documents
    .map(
      (d, di) => `
    <section class="doc">
      <div class="doc-head">
        <span class="doc-title">${esc(d.title)}</span>
        <span class="doc-type">${esc(DOC_TYPES[prefs.lang][d.type] || d.type)}</span>
      </div>
      <table class="lines">
        <thead><tr><th style="width:44px"><span class="sr-only">${t("a11y.confirm")}</span></th><th>${t("col.item")}</th><th class="code">${t("col.code")}</th><th class="num">${t("col.qty")}</th><th class="num">${t("col.amount")}</th></tr></thead>
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
  state.ai = out.ai;
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

// ---- Progress tracking ----------------------------------------------------------------
// Each right can be marked as sent, won (with the amount actually recovered) or denied.
// Keyed by rule + document + lines so it survives re-checks and language changes.
const fkey = (f) => `${f.rule_id}|${f.document_id}|${f.line_ids.join(",")}`;
const FOLLOW_UP_DAYS = { demand_letter: 14, federal_dispute: 30, letter: 30, aid_application: 30, insurer_appeal: 30, regulator_complaint: 30, phone_call: 7 };
const STATUSES = ["todo", "sent", "won", "denied"];
const progressOf = (f) => state.progress[fkey(f)] || { status: "todo" };
const isoToday = () => state.report?.today || new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => {
  const d = toDate(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

function setProgress(f, status, extra = {}) {
  const key = fkey(f);
  if (status === "todo") delete state.progress[key];
  else state.progress[key] = { ...state.progress[key], status, date: isoToday(), ...extra };
  save();
}

function recoveredSoFar() {
  return state.report.findings.reduce((sum, f) => {
    const p = progressOf(f);
    return sum + (p.status === "won" ? Number(p.amount ?? f.recoverable) || 0 : 0);
  }, 0);
}

function progressBlock(f, i) {
  const p = progressOf(f);
  const follow = p.status === "sent" && FOLLOW_UP_DAYS[f.action] ? addDays(p.date, FOLLOW_UP_DAYS[f.action]) : null;
  const note =
    p.status === "sent"
      ? t("progress.sentOn", fmtDate(p.date)) + (follow ? " " + t(f.action === "demand_letter" ? "progress.interest" : "progress.follow", fmtDate(follow)) : "")
      : p.status === "won"
      ? t("progress.wonOn", fmtDate(p.date))
      : p.status === "denied"
      ? t("progress.deniedNote")
      : "";
  return `<div class="progress" data-i="${i}">
    <div class="seg" role="radiogroup" aria-label="${esc(t("progress.label"))}">
      ${STATUSES.map((st) => `<button role="radio" aria-checked="${p.status === st}" data-status="${st}">${t("progress." + st)}</button>`).join("")}
    </div>
    ${p.status === "won" ? `<label class="won-amt">${t("progress.amount")} <span class="money-input"><span>$</span><input type="number" min="0" step="1" value="${Number(p.amount ?? f.recoverable)}" data-amount></span></label>` : ""}
    ${note ? `<p class="note progress-note">${note}</p>` : ""}
  </div>`;
}

function nextSteps(f) {
  const steps = NEXT_STEPS[prefs.lang][f.action] || NEXT_STEPS.en[f.action];
  if (!steps || f.confidence === "info") return "";
  return `<details class="next"><summary>${t("next.h")}</summary><ol>${steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></details>`;
}

function wireProgress() {
  for (const box of $$(".progress")) {
    const i = +box.dataset.i;
    const f = state.report.findings[i];
    for (const b of $$("[data-status]", box)) {
      b.onclick = () => {
        setProgress(f, b.dataset.status, b.dataset.status === "won" ? { amount: f.recoverable } : {});
        rerenderKeepingOpen(i);
      };
    }
    const amt = $("[data-amount]", box);
    if (amt) amt.onchange = () => {
      setProgress(f, "won", { amount: Math.max(0, Number(amt.value) || 0) });
      rerenderKeepingOpen(i);
    };
  }
}

function rerenderKeepingOpen(i) {
  const y = window.scrollY;
  renderResults({ keepScroll: true });
  $$(".entry")[i]?.classList.add("open");
  window.scrollTo({ top: y });
}

// ---- 3. Results -------------------------------------------------------------------
const liveDeadlines = (r) =>
  r.findings
    .map((f, i) => ({ ...f, i }))
    .filter((f) => f.deadline && f.deadline.days_left >= 0)
    .sort((a, b) => a.deadline.days_left - b.deadline.days_left);

function renderResults({ keepScroll = false } = {}) {
  const r = state.report;
  const live = liveDeadlines(r);
  const p = r.person;
  $("#caseLine").textContent = [p.name, p.state, t("docs", new Set(r.findings.map((f) => f.document_id)).size)].join("  ·  ");
  $("#total").textContent = money(state.total);
  $("#stats").innerHTML = `
    <div><dt>${t("results.found")}</dt><dd>${r.findings.length}</dd></div>
    <div><dt>${t("results.deadlines")}</dt><dd>${live.length}</dd></div>
    <div><dt>${t("results.next")}</dt><dd class="${live[0] ? urgency(live[0].deadline.days_left) : ""}">${live[0] ? live[0].deadline.days_left + "d" : "–"}</dd></div>
    ${recoveredSoFar() ? `<div><dt>${t("results.recovered")}</dt><dd class="won">${money(recoveredSoFar())}</dd></div>` : ""}`;

  renderTimeline(r.today, live);

  $("#clock").innerHTML = live.length
    ? live
        .map((f) => {
          const st = progressOf(f).status;
          const u = st === "todo" ? urgency(f.deadline.days_left) : "done";
          const anchor = prefs.lang === "en" ? ` ${esc(f.deadline.anchor)}.` : "";
          return `<li>
            ${ring(f.deadline.days_left, f.deadline.window_days, u)}
            <div>
              <div class="clock-title">${esc(f.title)}${st !== "todo" ? ` <span class="tag status-${st}">${t("progress." + st)}</span>` : ""}</div>
              <div class="clock-meta">${t("ends", fmtDate(f.deadline.date))}${anchor}</div>
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
  for (const b of $$("[data-call]")) b.onclick = () => openCall(+b.dataset.call);
  wireProgress();
  $("#rulesNote").innerHTML = `${esc(t("results.rules", r.rules_checked, r.rules_matched))} · <span class="ai-badge ${state.ai !== "none" ? "on" : ""}">${t(state.ai !== "none" ? "ai.on" : "ai.off")}</span>`;
  if (!keepScroll) show("results");
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
    const cls = progressOf(f).status !== "todo" ? "done" : urgency(f.deadline.days_left) === "urgent" ? "urgent" : f.recoverable ? "money" : "";
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
  const st = progressOf(f).status;
  const statusTag = st !== "todo" ? `<span class="tag status-${st}">${t("progress." + st)}</span>` : "";
  return `
  <article class="entry">
    <button class="entry-row" aria-expanded="false">
      <div class="entry-amt">${f.recoverable ? `<span class="money">${money(f.recoverable)}</span>` : `<span class="nil">${t("noRefund")}</span>`}</div>
      <div class="entry-main">
        <div class="entry-title">${esc(f.title)}${approved}</div>
        <div class="entry-sub">${esc(doc ? doc.title : "")}${f.line_ids.length ? ` · ${t("line", f.line_ids.join(", "))}` : ""}</div>
      </div>
      <div class="tags">${statusTag}${st === "todo" ? tagsFor(f) : ""}</div>
      <span class="chev" aria-hidden="true"></span>
    </button>
    <div class="entry-body">
      <div>
        <p class="explain">${esc(f.summary)}${f.explained_by === "granite" ? ` <span class="ai-mark" title="${esc(t("ai.mark"))}">Granite</span>` : ""}</p>
        ${receipt(f)}
        <div class="entry-actions">
          <button class="btn btn-solid" data-draft="${i}">${esc(f.action_label)} <span aria-hidden="true">→</span></button>
          ${features.call && CALLABLE.has(f.action) ? `<button class="btn btn-mint" data-call="${i}">${t("call.button")}</button>` : ""}
        </div>
        ${nextSteps(f)}
        ${progressBlock(f, i)}
      </div>
    </div>
  </article>`;
}

$("#calendar").onclick = async () => downloadBlob(await api("/api/calendar", state.case, "blob"), "recoup-deadlines.ics");

// A short, plain summary someone can send to a family member or caregiver.
function familySummary() {
  const r = state.report;
  const open = r.findings.filter((f) => progressOf(f).status === "todo" && f.confidence !== "info");
  const soonest = [...open].sort((a, b) => (a.deadline?.days_left ?? 1e9) - (b.deadline?.days_left ?? 1e9));
  const lines = soonest.map((f) => {
    const when = f.deadline && f.deadline.days_left >= 0 ? ` (${t("family.by", fmtDate(f.deadline.date))})` : "";
    return `- ${f.action_label}${f.recoverable ? `: ${money(f.recoverable)}` : ""}${when}`;
  });
  return [t("family.intro", r.person.name || ""), "", ...lines, "", t("family.money", money(state.total)), t("family.outro")].join("\n");
}

$("#family").onclick = async () => {
  const text = familySummary();
  try {
    if (navigator.share) {
      await navigator.share({ title: "Recoup", text });
      return;
    }
  } catch {
    /* share sheet closed: fall back to copying */
  }
  await navigator.clipboard.writeText(text).catch(() => {});
  $("#toolbarNote").textContent = t("family.copied");
};

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
  lastFocus = document.activeElement;
  $("#sheet").hidden = false;
  document.body.style.overflow = "hidden";
  $("#sheetTitle").tabIndex = -1;
  $("#sheetTitle").focus();
}
let lastFocus = null;
let features = { call: false };
api("/api/features").then((f) => (features = f)).catch(() => {});
const CALLABLE = new Set(["aid_application", "insurer_appeal", "letter", "federal_dispute"]);

// Keep keyboard focus inside the open draft sheet.
$("#sheet").addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  const items = $$("button, a[href], textarea:not([hidden]), [tabindex='0']", $(".sheet-panel")).filter((el) => el.offsetParent !== null);
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

function closeSheet() {
  speechSynthesis.cancel();
  $("#sheet").hidden = true;
  document.body.style.overflow = "";
  lastFocus?.focus();
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

// ---- AI advocate call ----------------------------------------------------------------------
// Backend: BOB.md task 7 (recoup/actions/call.py). Contract:
//   POST /api/call/script {case, finding_index}            -> {disclosure, lines[]}
//   POST /api/call/start  {case, finding_index, script, approved_at} -> {call_id}
//   GET  /api/call/{id}                                     -> {status, summary?: {spoke_to, promised, next_date}}
let call = null;

async function openCall(i) {
  const f = state.report.findings[i];
  const script = await api("/api/call/script", { case: state.case, finding_index: i });
  call = { i, f, script, id: null, timer: null };
  $("#callDisclosure").textContent = script.disclosure;
  $("#callLines").innerHTML = script.lines.map((l) => `<li>${esc(l)}</li>`).join("");
  $("#callStatus").hidden = true;
  $("#callConsent").checked = false;
  $("#callConsent").disabled = false;
  $("#callStart").disabled = true;
  lastFocus = document.activeElement;
  $("#callSheet").hidden = false;
  document.body.style.overflow = "hidden";
  $("#callTitle").tabIndex = -1;
  $("#callTitle").focus();
}

function closeCall() {
  clearTimeout(call?.timer);
  $("#callSheet").hidden = true;
  document.body.style.overflow = "";
  lastFocus?.focus();
}

$("#callConsent").onchange = () => ($("#callStart").disabled = !$("#callConsent").checked);
for (const c of $$("[data-close-call]")) c.onclick = closeCall;

$("#callStart").onclick = async () => {
  $("#callStart").disabled = true;
  $("#callConsent").disabled = true;
  const { call_id } = await api("/api/call/start", {
    case: state.case,
    finding_index: call.i,
    script: call.script,
    approved_at: new Date().toISOString(),
  });
  call.id = call_id;
  poll();
};

async function poll() {
  const res = await api(`/api/call/${encodeURIComponent(call.id)}`);
  const box = $("#callStatus");
  box.hidden = false;
  if (res.status === "done" && res.summary) {
    const s = res.summary;
    box.innerHTML = `<strong>${t("call.status.done")}</strong>
      <dl class="call-summary"><dt>${t("call.spoke")}</dt><dd>${esc(s.spoke_to)}</dd>
      <dt>${t("call.promised")}</dt><dd>${esc(s.promised)}</dd>
      ${s.next_date ? `<dt>${t("call.next")}</dt><dd>${fmtDate(s.next_date)}</dd>` : ""}</dl>`;
    setProgress(call.f, "sent", { note: s.promised, next_date: s.next_date || null, via: "call" });
    renderResults({ keepScroll: true });
    return;
  }
  box.textContent = t(`call.status.${res.status}`) || res.status;
  if (res.status !== "failed") call.timer = setTimeout(poll, 2000);
}

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

// ---- About ------------------------------------------------------------------------------
async function openAbout() {
  const [packs, sources] = await Promise.all([api("/api/packs"), api("/api/sources")]);
  $("#packsTable").innerHTML = `<thead><tr><th>${t("about.col.pack")}</th><th>${t("about.col.states")}</th><th class="num">${t("about.col.rules")}</th></tr></thead>
    <tbody>${packs.map((p) => `<tr><td>${esc(p.name)} <span class="code">v${esc(p.version)}</span></td><td>${p.states.includes("*") ? "US" : esc(p.states.join(", "))}</td><td class="num">${p.rules.length}</td></tr>`).join("")}</tbody>`;
  $("#sourcesTable").innerHTML = `<thead><tr><th>${t("about.col.file")}</th><th>${t("about.col.status")}</th></tr></thead>
    <tbody>${sources
      .map(
        (s) => `<tr><td><span class="code">${esc(s.file)}</span>${s.source ? `<div class="note">${esc(s.source)}</div>` : ""}</td>
        <td><span class="tag ${s.demo ? "urgent" : ""}">${t(s.demo ? "about.demo" : "about.live")}</span></td></tr>`
      )
      .join("")}</tbody>`;
  $("#limits").innerHTML = t("about.limits").map((l) => `<li>${esc(l)}</li>`).join("");
  show("about");
}
$("#aboutLink").onclick = (e) => {
  e.preventDefault();
  openAbout();
};

// ---- Boot -----------------------------------------------------------------------------
applyStatic();
$("#resume").hidden = !load(STORE)?.case;
