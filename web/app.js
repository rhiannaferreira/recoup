// Recoup front end: start -> confirm lines -> Rights Clock + findings -> approve a draft.
// Plain JS, no build step. Every decision comes from the API's rule engine.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const money = (n) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: n % 1 ? 2 : 0 });
const toDate = (iso) => new Date(iso + "T12:00:00");
const fmtDate = (iso) => toDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const urgency = (d) => (d <= 30 ? "urgent" : d <= 60 ? "soon" : "");

const DOC_TYPES = {
  medical_bill: "Medical bill",
  good_faith_estimate: "Good Faith Estimate",
  insurance_eob: "Insurance statement",
  lease: "Lease",
  rent_ledger: "Rent ledger",
};

let state = { case: null, report: null, draftIndex: null };

function show(id, crumb = "") {
  for (const s of $$(".step")) s.hidden = s.id !== id;
  $("#crumb").textContent = crumb;
  window.scrollTo({ top: 0 });
}

async function api(path, body, as = "json") {
  const init = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(await res.text());
  return as === "text" ? res.text() : res.json();
}

// ---- 1. Start ----------------------------------------------------------------
$("#demo").onclick = async () => {
  state.case = await api("/api/samples/maria");
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
  state.case ??= { person: { name: "You", state: "CO", household_size: 1 }, documents: [] };
  state.case.documents.push(await res.json());
  renderConfirm();
};

$("#home").onclick = (e) => {
  e.preventDefault();
  state = { case: null, report: null, draftIndex: null };
  show("start");
};

// ---- 2. Confirm --------------------------------------------------------------
function renderConfirm() {
  $("#docs").innerHTML = state.case.documents
    .map(
      (d, di) => `
    <section class="doc">
      <div class="doc-head">
        <span class="doc-title">${esc(d.title)}</span>
        <span class="doc-type">${esc(DOC_TYPES[d.type] || d.type)}</span>
      </div>
      <table class="lines">
        <thead><tr><th style="width:44px"></th><th>Item</th><th class="code">Code</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
        <tbody>
        ${d.lines
          .map(
            (l, li) => `<tr class="${l.confirmed === false ? "off" : ""}">
              <td><input class="check" type="checkbox" data-d="${di}" data-l="${li}" ${l.confirmed !== false ? "checked" : ""} aria-label="Confirm ${esc(l.description)}"></td>
              <td>${esc(l.description)}${l.times_paid ? ` <span class="note">· paid ${l.times_paid}×</span>` : ""}</td>
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
      countLines();
    };
  }
  countLines();
  show("confirm", state.case.person.name);
}

function countLines() {
  const all = state.case.documents.flatMap((d) => d.lines);
  const on = all.filter((l) => l.confirmed !== false).length;
  $("#lineCount").textContent = `${on} of ${plural(all.length, "line")} confirmed across ${plural(state.case.documents.length, "document")}`;
}

$("#run").onclick = async () => {
  $("#run").disabled = true;
  try {
    const out = await api("/api/analyze?explain=true", state.case);
    state.report = out.report;
    renderResults(out);
  } finally {
    $("#run").disabled = false;
  }
};

// ---- 3. Results --------------------------------------------------------------
function renderResults(out) {
  const r = out.report;
  const docs = state.case.documents;
  const live = r.findings
    .map((f, i) => ({ ...f, i }))
    .filter((f) => f.deadline && f.deadline.days_left >= 0)
    .sort((a, b) => a.deadline.days_left - b.deadline.days_left);

  const p = r.person;
  $("#caseLine").textContent = [p.name, p.state, plural(new Set(r.findings.map((f) => f.document_id)).size, "document")].join("  ·  ");
  $("#total").textContent = money(out.total_recoverable);
  $("#stats").innerHTML = `
    <div><dt>Rights found</dt><dd>${r.findings.length}</dd></div>
    <div><dt>Deadlines</dt><dd>${live.length}</dd></div>
    <div><dt>Next one</dt><dd class="${live[0] ? urgency(live[0].deadline.days_left) : ""}">${live[0] ? live[0].deadline.days_left + "d" : "–"}</dd></div>`;

  renderTimeline(r.today, live);

  $("#clock").innerHTML = live.length
    ? live
        .map((f) => {
          const used = Math.min(100, Math.max(2, 100 - (f.deadline.days_left / f.deadline.window_days) * 100));
          const u = urgency(f.deadline.days_left);
          return `<li>
            <div class="days ${u}">${f.deadline.days_left}<small>days left</small></div>
            <div>
              <div class="clock-title">${esc(f.title)}</div>
              <div class="clock-meta">Ends ${fmtDate(f.deadline.date)}. ${esc(f.deadline.anchor)}.</div>
              <div class="bar ${u}"><i style="width:${used}%"></i></div>
            </div>
            <div>${f.recoverable ? `<span class="money">${money(f.recoverable)}</span>` : ""}</div>
          </li>`;
        })
        .join("")
    : `<li><div></div><div class="clock-meta">No deadlines found. That doesn't mean you have unlimited time.</div></li>`;

  $("#findings").innerHTML = r.findings.map((f, i) => entry(f, i, docs)).join("");
  for (const row of $$(".entry-row")) {
    row.onclick = () => {
      const open = row.parentElement.classList.toggle("open");
      row.setAttribute("aria-expanded", open);
    };
  }
  for (const b of $$("[data-draft]")) b.onclick = () => openDraft(+b.dataset.draft);
  $("#rulesNote").textContent = `${r.rules_checked} rules checked · ${r.rules_matched} matched · no rule, no finding`;
  show("results");
}

function renderTimeline(todayIso, live) {
  const el = $("#timeline");
  if (!live.length) return (el.innerHTML = "");
  const start = toDate(todayIso);
  const lastDays = Math.max(...live.map((f) => f.deadline.days_left));
  const span = Math.ceil((lastDays + 20) / 30) * 30; // round up to whole months-ish
  const pos = (days) => `${(days / span) * 100}%`;

  const ticks = [];
  const m = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  while ((m - start) / 864e5 < span) {
    const d = Math.round((m - start) / 864e5);
    ticks.push(`<div class="tl-tick" style="left:${pos(d)}"><span>${m.toLocaleDateString("en-US", { month: "short" })}</span></div>`);
    m.setMonth(m.getMonth() + 1);
  }
  const pins = live.map((f) => {
    const cls = urgency(f.deadline.days_left) === "urgent" ? "urgent" : f.recoverable ? "money" : "";
    return `<div class="tl-pin ${cls}" style="left:${pos(f.deadline.days_left)}" title="${esc(f.title)}"><span>${f.deadline.days_left}d</span></div>`;
  });
  el.innerHTML = `<div class="tl-axis"></div><div class="tl-today">Today</div>${ticks.join("")}${pins.join("")}`;
}

function entry(f, i, docs) {
  const doc = docs.find((d) => d.id === f.document_id);
  const tags = [];
  if (f.deadline && f.deadline.days_left >= 0) tags.push(`<span class="tag ${urgency(f.deadline.days_left)}">${f.deadline.days_left} days</span>`);
  if (f.deadline && f.deadline.days_left < 0) tags.push(`<span class="tag">Expired</span>`);
  if (f.confidence === "check") tags.push(`<span class="tag">Worth a check</span>`);
  if (f.confidence === "info") tags.push(`<span class="tag">Leverage</span>`);

  const lines = f.evidence
    .map(
      (e) => `<div class="rc-line"><span class="k">${esc(e.label)}</span><span class="dots"></span><span class="v">${esc(e.value)}</span></div>
              <div class="rc-src">${esc(e.source)}</div>`
    )
    .join("");

  return `
  <article class="entry">
    <button class="entry-row" aria-expanded="false">
      <div class="entry-amt">${f.recoverable ? `<span class="money">${money(f.recoverable)}</span>` : `<span class="nil">No refund</span>`}</div>
      <div class="entry-main">
        <div class="entry-title">${esc(f.title)}</div>
        <div class="entry-sub">${esc(doc ? doc.title : "")}${f.line_ids.length ? ` · line ${f.line_ids.join(", ")}` : ""}</div>
      </div>
      <div class="tags">${tags.join("")}</div>
      <span class="chev" aria-hidden="true"></span>
    </button>
    <div class="entry-body">
      <div>
        <p class="explain">${esc(f.summary)}</p>
        <div class="receipt">
          <h4>Receipt</h4>
          ${lines}
          <div class="rc-law">
            <div><strong>${esc(f.citation.law)}</strong>${f.citation.section ? ` · ${esc(f.citation.section)}` : ""}</div>
            ${f.citation.quote ? `<blockquote>“${esc(f.citation.quote)}”</blockquote>` : ""}
          </div>
          <div class="rc-foot">
            <span>${esc(f.rule_id)}</span>
            <a href="${esc(f.citation.url)}" target="_blank" rel="noopener">Read the source ↗</a>
          </div>
          ${f.recoverable_note ? `<p class="rc-src" style="margin-top:12px">${esc(f.recoverable_note)}</p>` : ""}
        </div>
        <div class="entry-actions">
          <button class="btn btn-solid" data-draft="${i}">${esc(f.action_label)} <span aria-hidden="true">→</span></button>
        </div>
      </div>
    </div>
  </article>`;
}

// ---- Draft sheet -----------------------------------------------------------------
// Tiny Markdown renderer for our own templates: headings, bold, tables, lists, rules.
function renderMarkdown(md) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(https?:\/\/([^\s<)/]+)[^\s<)]*)/g, '<a href="$1" target="_blank" rel="noopener">$2 ↗</a>');
  const out = [];
  const blocks = md.trim().split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n");
    if (/^#\s/.test(block)) out.push(`<h1>${inline(block.replace(/^#\s+/, ""))}</h1>`);
    else if (/^---$/.test(block.trim())) out.push("<hr>");
    else if (lines.every((l) => l.trim().startsWith("|"))) {
      const rows = lines.filter((l) => !/^\|[-|\s]+\|$/.test(l.trim())).map((l) => l.trim().slice(1, -1).split("|").map((c) => c.trim()));
      const [head, ...body] = rows;
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    } else if (lines.every((l) => l.startsWith("- "))) out.push(`<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join("")}</ul>`);
    else if (lines[0] === "---") out.push("<hr>", `<p>${lines.slice(1).map(inline).join("<br>")}</p>`);
    else out.push(`<p>${lines.map(inline).join("<br>")}</p>`);
  }
  return out.join("");
}

async function openDraft(i) {
  const f = state.report.findings[i];
  state.draftIndex = i;
  $("#sheetTitle").textContent = f.action_label;
  const text = await api("/api/draft", { case: state.case, finding_index: i }, "text");
  $("#draftText").value = text;
  $("#draftPreview").innerHTML = renderMarkdown(text);
  setView("preview");
  $("#approve").textContent = "Approve this text";
  $("#approve").classList.remove("approved");
  $("#sheet").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeSheet() {
  speechSynthesis.cancel();
  $("#sheet").hidden = true;
  document.body.style.overflow = "";
}

function setView(view) {
  for (const t of $$(".sheet-tabs button")) t.setAttribute("aria-selected", t.dataset.view === view);
  if (view === "preview") $("#draftPreview").innerHTML = renderMarkdown($("#draftText").value);
  $("#draftPreview").hidden = view !== "preview";
  $("#draftText").hidden = view !== "edit";
}

for (const t of $$(".sheet-tabs button")) t.onclick = () => setView(t.dataset.view);
for (const c of $$("[data-close]")) c.onclick = closeSheet;
document.addEventListener("keydown", (e) => e.key === "Escape" && !$("#sheet").hidden && closeSheet());

$("#approve").onclick = () => {
  $("#approve").textContent = "Approved ✓";
  $("#approve").classList.add("approved");
};
$("#copy").onclick = () => navigator.clipboard.writeText($("#draftText").value);
$("#download").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([$("#draftText").value], { type: "text/markdown" }));
  a.download = `${$("#sheetTitle").textContent.replace(/\W+/g, "-").replace(/-+$/, "").toLowerCase()}.md`;
  a.click();
};
$("#readAloud").onclick = () => {
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance($("#draftPreview").innerText || $("#draftText").value));
};
$("#bigText").onclick = (e) => {
  const on = document.documentElement.classList.toggle("big");
  e.currentTarget.setAttribute("aria-pressed", on);
};
