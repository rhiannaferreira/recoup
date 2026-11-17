// Recoup front end: start -> confirm lines -> Rights Clock + findings -> approve a draft.
// Plain JS, no build step. All decisions come from the API's rule engine.

const $ = (sel) => document.querySelector(sel);
const money = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 });
const fmtDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let state = { case: null, report: null };

function show(id) {
  for (const s of document.querySelectorAll(".step")) s.hidden = s.id !== id;
  window.scrollTo(0, 0);
}

async function api(path, body, as = "json") {
  const res = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  if (!res.ok) throw new Error(await res.text());
  return as === "text" ? res.text() : res.json();
}

// ---- Step 1 -----------------------------------------------------------------
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
  if (!res.ok) return alertBox((await res.json()).detail || "Couldn't read that file.");
  const doc = await res.json();
  state.case ??= { person: { name: "You", state: "CO", household_size: 1 }, documents: [] };
  state.case.documents.push(doc);
  renderConfirm();
};

function alertBox(msg) {
  const p = document.createElement("p");
  p.className = "card";
  p.textContent = msg;
  $("#start").append(p);
}

// ---- Step 2 -----------------------------------------------------------------
function renderConfirm() {
  $("#docs").innerHTML = state.case.documents
    .map(
      (d, di) => `
    <div class="card">
      <strong>${esc(d.title)}</strong> <span class="badge">${esc(d.type.replaceAll("_", " "))}</span>
      <table>
        <thead><tr><th>OK?</th><th>Item</th><th>Code</th><th class="num">Units</th><th class="num">Amount</th></tr></thead>
        <tbody>
        ${d.lines
          .map(
            (l, li) => `<tr>
              <td><input type="checkbox" data-d="${di}" data-l="${li}" ${l.confirmed !== false ? "checked" : ""} aria-label="Confirm ${esc(l.description)}"></td>
              <td>${esc(l.description)}${l.times_paid ? ` <span class="fine">(paid ${l.times_paid}x)</span>` : ""}</td>
              <td>${esc(l.code || "")}</td>
              <td class="num">${l.units ?? 1}</td>
              <td class="num">${money(l.amount)}</td></tr>`
          )
          .join("")}
        </tbody>
      </table>
    </div>`
    )
    .join("");
  for (const box of document.querySelectorAll("#docs input[type=checkbox]")) {
    box.onchange = () => (state.case.documents[box.dataset.d].lines[box.dataset.l].confirmed = box.checked);
  }
  show("confirm");
}

$("#run").onclick = async () => {
  const out = await api("/api/analyze?explain=true", state.case);
  state.report = out.report;
  renderResults(out);
};

// ---- Step 3 -----------------------------------------------------------------
function daysClass(d) {
  return d <= 30 ? "urgent" : d <= 60 ? "soon" : "";
}

function renderResults(out) {
  const r = out.report;
  const docs = new Set(r.findings.map((f) => f.document_id)).size;
  const live = r.findings.filter((f) => f.deadline && f.deadline.days_left >= 0).sort((a, b) => a.deadline.days_left - b.deadline.days_left);
  $("#total").textContent = `${money(out.total_recoverable)} recoverable`;
  $("#totalSub").textContent =
    `across ${docs} document${docs === 1 ? "" : "s"} · ${live.length} deadline${live.length === 1 ? "" : "s"}` +
    (live[0] ? ` · the first in ${live[0].deadline.days_left} days` : "");

  $("#clock").innerHTML = live.length
    ? live
        .map((f) => {
          const used = Math.min(100, Math.max(0, 100 - (f.deadline.days_left / f.deadline.window_days) * 100));
          return `<li>
            <div class="days ${daysClass(f.deadline.days_left)}">${f.deadline.days_left}<small>days left</small></div>
            <div><strong>${esc(f.title)}</strong>${f.recoverable ? ` <span class="amt">${money(f.recoverable)}</span>` : ""}
              <div class="fine">Ends ${fmtDate(f.deadline.date)}. Window: ${esc(f.deadline.anchor)}.</div>
              <div class="meter" aria-hidden="true"><span style="width:${used}%"></span></div></div>
          </li>`;
        })
        .join("")
    : `<li><div></div><div class="fine">No deadlines found. That doesn't mean you have unlimited time: act soon.</div></li>`;

  $("#findings").innerHTML = r.findings
    .map(
      (f, i) => `
    <article class="card finding">
      <h3><span>${esc(f.title)}</span><span class="amt">${f.recoverable ? money(f.recoverable) : ""}</span></h3>
      <div>${f.confidence !== "high" ? `<span class="badge">${f.confidence === "info" ? "for your information" : "worth a check"}</span>` : ""}
        ${f.deadline ? `<span class="badge">${f.deadline.days_left >= 0 ? f.deadline.days_left + " days left" : "deadline passed"}</span>` : ""}</div>
      <p>${esc(f.summary)}</p>
      <details class="receipt"><summary>Show receipts</summary>
        <table><tbody>${f.evidence.map((e) => `<tr><td>${esc(e.label)}</td><td><strong>${esc(e.value)}</strong></td><td class="fine">${esc(e.source)}</td></tr>`).join("")}</tbody></table>
        <p><strong>${esc(f.citation.law)}</strong>${f.citation.section ? `, ${esc(f.citation.section)}` : ""}
          · <a href="${esc(f.citation.url)}" target="_blank" rel="noopener">source</a></p>
        ${f.citation.quote ? `<blockquote>${esc(f.citation.quote)}</blockquote>` : ""}
        ${f.recoverable_note ? `<p class="fine">${esc(f.recoverable_note)}</p>` : ""}
        <p class="fine">Rule <code>${esc(f.rule_id)}</code></p>
      </details>
      <div class="actions"><button class="primary" data-i="${i}">${esc(f.action_label)}</button></div>
    </article>`
    )
    .join("");
  for (const b of document.querySelectorAll("#findings button[data-i]")) b.onclick = () => openDraft(+b.dataset.i);
  $("#rulesNote").textContent = `${r.rules_checked} rules checked, ${r.rules_matched} matched. Rules that didn't match aren't shown; Recoup never guesses.`;
  show("results");
}

async function openDraft(i) {
  const f = state.report.findings[i];
  $("#draftTitle").textContent = f.action_label;
  $("#draftText").value = await api("/api/draft", { case: state.case, finding_index: i }, "text");
  $("#draftDialog").showModal();
}

$("#copy").onclick = () => navigator.clipboard.writeText($("#draftText").value);
$("#download").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([$("#draftText").value], { type: "text/markdown" }));
  a.download = `${$("#draftTitle").textContent.replace(/\W+/g, "-").toLowerCase()}.md`;
  a.click();
};
$("#readAloud").onclick = () => {
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance($("#draftText").value.replace(/[#*|_-]+/g, " ")));
};
$("#restart").onclick = () => {
  state = { case: null, report: null };
  show("start");
};
$("#bigText").onclick = (e) => {
  const on = document.documentElement.classList.toggle("big");
  e.target.setAttribute("aria-pressed", on);
};
