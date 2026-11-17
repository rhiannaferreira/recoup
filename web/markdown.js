// Tiny Markdown renderer for Recoup's own letter templates:
// headings, bold, tables, bullet lists, links and horizontal rules. Input is escaped first.

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(https?:\/\/([^\s<)/]+)[^\s<)]*)/g, '<a href="$1" target="_blank" rel="noopener">$2 ↗</a>');

export function renderMarkdown(md) {
  const out = [];
  for (const block of md.trim().split(/\n{2,}/)) {
    const lines = block.split("\n");
    if (/^#\s/.test(block)) out.push(`<h1>${inline(block.replace(/^#\s+/, ""))}</h1>`);
    else if (/^---$/.test(block.trim())) out.push("<hr>");
    else if (lines.every((l) => l.trim().startsWith("|"))) {
      const rows = lines
        .filter((l) => !/^\|[-|\s]+\|$/.test(l.trim()))
        .map((l) => l.trim().slice(1, -1).split("|").map((c) => c.trim()));
      const [head, ...body] = rows;
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`
      );
    } else if (lines.every((l) => l.startsWith("- "))) out.push(`<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join("")}</ul>`);
    else if (lines[0] === "---") out.push("<hr>", `<p>${lines.slice(1).map(inline).join("<br>")}</p>`);
    else out.push(`<p>${lines.map(inline).join("<br>")}</p>`);
  }
  return out.join("");
}
