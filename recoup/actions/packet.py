"""Evidence packet and calendar file for a whole case.

The packet puts findings in the order they need action: soonest deadline
first, then rights with no deadline. A caseworker, legal aid office or family
member can work through it top to bottom.
"""

from __future__ import annotations

from datetime import datetime, timezone

from recoup.actions import draft
from recoup.engine.evaluator import evaluate
from recoup.models import Case, Finding, Report


def action_order(report: Report) -> list[tuple[int, Finding]]:
    """(index in report.findings, finding), soonest live deadline first."""

    def key(item: tuple[int, Finding]):
        f = item[1]
        if f.deadline and not f.deadline.expired:
            return (0, f.deadline.days_left, -f.recoverable)
        return (1, 0, -f.recoverable)

    return sorted(enumerate(report.findings), key=key)


def build_packet(case: Case) -> dict:
    report = evaluate(case)
    items = [
        {"index": i, "finding": f.model_dump(mode="json"), "draft": draft(case, f)}
        for i, f in action_order(report)
    ]
    return {
        "report": report.model_dump(mode="json"),
        "total_recoverable": report.total_recoverable,
        "items": items,
    }


def _ics_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\;").replace(",", "\\,").replace("\n", "\\n")


def build_calendar(case: Case) -> str:
    """An .ics file with one all-day event per live deadline, plus a 7-day warning."""
    report = evaluate(case)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Recoup//Rights Clock//EN", "CALSCALE:GREGORIAN"]
    for i, f in action_order(report):
        if not f.deadline or f.deadline.expired:
            continue
        day = f.deadline.date.strftime("%Y%m%d")
        amount = f" ({f.recoverable:,.0f} dollars)" if f.recoverable else ""
        lines += [
            "BEGIN:VEVENT",
            f"UID:recoup-{f.rule_id}-{f.document_id}-{i}@recoup",
            f"DTSTAMP:{stamp}",
            f"DTSTART;VALUE=DATE:{day}",
            f"SUMMARY:{_ics_escape('Last day: ' + f.title + amount)}",
            f"DESCRIPTION:{_ics_escape(f.action_label + '. ' + f.deadline.anchor + '. Source: ' + f.citation.url)}",
            "BEGIN:VALARM",
            "TRIGGER:-P7D",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{_ics_escape('7 days left: ' + f.title)}",
            "END:VALARM",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"
