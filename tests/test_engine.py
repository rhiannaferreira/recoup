from datetime import date

from recoup.engine.checks import REGISTRY
from recoup.engine.evaluator import evaluate
from recoup.engine.packs import load_all_packs
from recoup.models import DocType


def by_rule(report, rule_id):
    return [f for f in report.findings if f.rule_id == rule_id]


def test_every_rule_uses_a_registered_check():
    for pack in load_all_packs():
        for rule in pack.rules:
            assert rule.check in REGISTRY, rule.id


def test_every_finding_has_receipts(maria):
    for f in evaluate(maria).findings:
        assert f.evidence, f.rule_id
        assert f.citation.url.startswith("https://"), f.rule_id


def test_maria_headline_numbers(maria):
    report = evaluate(maria)
    assert report.total_recoverable == 4780
    first = report.clock[0]
    assert first.rule_id == "med.nsa.self_pay_dispute"
    assert first.deadline.days_left == 23
    assert first.deadline.date == date(2026, 12, 10)


def test_total_never_exceeds_what_was_charged(maria):
    report = evaluate(maria)
    for doc in maria.documents:
        claimed = sum(f.recoverable for f in report.findings if f.document_id == doc.id)
        assert claimed <= doc.charged_total


def test_gfe_dispute_needs_400_over(maria):
    gfe = maria.doc("er-gfe")
    gfe.lines[0].amount += 2300 - 399  # now only $399 over
    assert not by_rule(evaluate(maria), "med.nsa.self_pay_dispute")


def test_gfe_dispute_only_for_self_pay(maria):
    maria.doc("er-bill").self_pay = False
    assert not by_rule(evaluate(maria), "med.nsa.self_pay_dispute")


def test_duplicate_found_and_unconfirmed_lines_ignored(maria):
    assert by_rule(evaluate(maria), "med.billing.duplicate_line")[0].line_ids == ["3", "4"]
    maria.doc("er-bill").lines[3].confirmed = False
    assert not by_rule(evaluate(maria), "med.billing.duplicate_line")


def test_unit_limit(maria):
    (f,) = by_rule(evaluate(maria), "med.billing.unit_limit")
    assert f.line_ids == ["2"] and f.recoverable == 190


def test_charity_care_tiers(maria):
    maria.person.annual_income = 30000  # ~192% of poverty -> free care
    (f,) = by_rule(evaluate(maria), "med.aid.charity_care")
    assert "free care" in f.summary
    maria.person.annual_income = 90000  # above every tier
    assert not by_rule(evaluate(maria), "med.aid.charity_care")


def test_colorado_banned_fees(maria):
    fees = by_rule(evaluate(maria), "rent.co.banned_fee")
    assert sorted(f.recoverable for f in fees) == [450, 950]


def test_rental_pack_only_runs_in_colorado(maria):
    maria.person.state = "TX"
    report = evaluate(maria)
    assert not [f for f in report.findings if f.pack == "rentals"]
    assert by_rule(report, "med.nsa.self_pay_dispute")


def test_no_rule_no_finding(maria):
    maria.documents = [d for d in maria.documents if d.type == DocType.LEASE]
    maria.documents[0].lines = maria.documents[0].lines[:1]  # rent only
    maria.documents[0].monthly_rent = 1900
    assert evaluate(maria).findings == []


def test_denial_appeal(rosa):
    (f,) = evaluate(rosa).findings
    assert f.rule_id == "med.insurance.denial_appeal"
    assert f.recoverable == 1850
    assert f.deadline.date == date(2027, 3, 31)
