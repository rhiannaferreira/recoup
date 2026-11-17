"""Run every applicable rule over a case and build the report.

This is the only place Findings are created, so every finding is guaranteed
to have a rule id, a citation, evidence and (when the rule has one) a deadline.
"""

from __future__ import annotations

from datetime import date, timedelta

from recoup.engine.checks import REGISTRY, Hit
from recoup.engine.packs import Pack, Rule, load_all_packs
from recoup.models import Case, Deadline, Finding, Report


class _SafeDict(dict):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def compute_deadline(rule: Rule, hit: Hit, today: date) -> Deadline | None:
    spec = rule.deadline
    if spec is None:
        return None
    anchor = hit.anchor_date or getattr(hit.document, spec.anchor, None)
    if anchor is None:
        return None
    due = anchor + timedelta(days=spec.days)
    return Deadline(
        date=due,
        days_left=(due - today).days,
        anchor=f"{abs(spec.days)} days from {spec.anchor_label} ({anchor:%b %-d, %Y})"
        if spec.days >= 0
        else spec.anchor_label,
        window_days=abs(spec.days),
    )


def to_finding(pack: Pack, rule: Rule, hit: Hit, today: date, language: str = "en") -> Finding:
    text = rule.text(language)
    return Finding(
        rule_id=rule.id,
        pack=pack.pack,
        title=text.title,
        summary=" ".join(text.summary.format_map(_SafeDict(hit.values)).split()),
        document_id=hit.document.id,
        line_ids=hit.line_ids,
        recoverable=round(hit.recoverable, 2),
        recoverable_note=hit.recoverable_note,
        confidence=hit.confidence or rule.confidence,
        evidence=hit.evidence,
        citation=rule.citation,
        deadline=compute_deadline(rule, hit, today),
        action=rule.action,
        action_label=text.action_label,
        template=rule.template,
    )


_ORDER = {"subtract": 0, "cap": 1, "percent": 2}


def stack_rights(case: Case, pairs: list[tuple[Finding, Hit]]) -> list[Finding]:
    """Add up rights on the same document without double counting.

    Rights are applied the way they'd play out: fix billing errors first
    ("subtract"), then a dispute can cap the price ("cap"), then financial aid
    takes a percent off what's left ("percent"). Each finding's ``recoverable``
    becomes the part of the saving it is responsible for, so the report total
    never exceeds what was charged.
    """
    out: list[Finding] = []
    by_doc: dict[str, list[tuple[Finding, Hit]]] = {}
    for f, h in pairs:
        by_doc.setdefault(f.document_id, []).append((f, h))
    for doc_id, items in by_doc.items():
        doc = case.doc(doc_id)
        balance = doc.charged_total if doc else sum(f.recoverable for f, _ in items)
        for f, h in sorted(items, key=lambda p: _ORDER.get(p[1].effect, 0)):
            if h.effect == "cap" and h.effect_value is not None:
                saved = max(balance - h.effect_value, 0)
            elif h.effect == "percent" and h.effect_value is not None:
                saved = balance * h.effect_value / 100
            else:
                saved = min(f.recoverable, balance)
            saved = round(saved, 2)
            if saved != f.recoverable:
                note = (
                    f"Counted as ${saved:,.0f} after the rights above it on this document "
                    f"(${f.recoverable:,.0f} on its own)."
                )
                f = f.model_copy(update={"recoverable": saved, "recoverable_note": f"{f.recoverable_note} {note}".strip()})
            balance = round(balance - saved, 2)
            out.append(f)
    return out


def evaluate(case: Case, packs: list[Pack] | None = None) -> Report:
    packs = packs if packs is not None else load_all_packs()
    pairs: list[tuple[Finding, Hit]] = []
    checked = matched = 0
    for pack in packs:
        if not pack.applies_to(case.person.state):
            continue
        for rule in pack.rules:
            if rule.check not in REGISTRY:
                raise KeyError(f"Rule {rule.id} uses unknown check '{rule.check}'")
            checked += 1
            hits = REGISTRY[rule.check](case, rule)
            matched += bool(hits)
            pairs.extend((to_finding(pack, rule, h, case.today, case.language), h) for h in hits)
    return Report(
        person=case.person,
        today=case.today,
        findings=stack_rights(case, pairs),
        rules_checked=checked,
        rules_matched=matched,
    )
