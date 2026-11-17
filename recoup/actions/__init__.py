"""Draft the paperwork for a finding: dispute form, letters, appeals.

Drafts are shown to the person to approve word for word. Nothing is sent
automatically.
"""

from __future__ import annotations

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

from recoup.engine.checks import money
from recoup.models import ActionKind, Case, DocType, Finding

_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates"),
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)
_env.globals["money"] = money

TEMPLATES = {
    ActionKind.FEDERAL_DISPUTE: "federal_dispute.md.j2",
    ActionKind.AID_APPLICATION: "aid_application.md.j2",
    ActionKind.DEMAND_LETTER: "demand_letter.md.j2",
    ActionKind.INSURER_APPEAL: "insurer_appeal.md.j2",
    ActionKind.LETTER: "letter.md.j2",
}


def draft(case: Case, finding: Finding) -> str:
    doc = case.doc(finding.document_id)
    if doc is None:
        raise KeyError(finding.document_id)
    context = {"f": finding, "doc": doc, "person": case.person, "today": case.today.isoformat()}
    if finding.action == ActionKind.FEDERAL_DISPUTE:
        gfe = next((g for g in case.docs(DocType.GOOD_FAITH_ESTIMATE) if g.estimate_for == doc.id), None)
        context["gfe"] = gfe
        context["rows"] = _dispute_rows(doc, gfe)
    template = finding.template or TEMPLATES.get(finding.action, "letter.md.j2")
    return _env.get_template(template).render(**context).strip() + "\n"


def _dispute_rows(bill, gfe) -> list[dict]:
    estimated = {}
    for line in gfe.lines if gfe else []:
        estimated[line.code or line.description] = estimated.get(line.code or line.description, 0) + line.amount
    billed: dict[str, dict] = {}
    for line in bill.lines:
        key = line.code or line.description
        row = billed.setdefault(key, {"id": line.id, "description": line.description, "billed": 0.0})
        row["billed"] += line.amount
    rows = []
    for key, row in billed.items():
        est = estimated.get(key, 0.0)
        if row["billed"] > est:
            rows.append({**row, "estimated": money(est) if est else "not on estimate", "billed": money(row["billed"])})
    return rows
