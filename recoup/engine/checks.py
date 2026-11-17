"""Check functions: the coded rules that decide whether a right applies.

Each check takes the whole ``Case`` and the ``Rule`` (for its params) and
returns zero or more ``Hit``s. A check never calls an AI model. If a check
can't decide (missing data), it returns nothing rather than guessing.

To add a check: write a function, decorate it with ``@check("name")``, and
reference ``name`` from a rule pack YAML file.
"""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from functools import cache
from pathlib import Path
from typing import Any, Callable

from recoup.engine.packs import Rule
from recoup.models import Case, DocType, Document, Evidence

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


@dataclass
class Hit:
    document: Document
    recoverable: float
    evidence: list[Evidence]
    values: dict[str, Any] = field(default_factory=dict)
    line_ids: list[str] = field(default_factory=list)
    recoverable_note: str = ""
    anchor_date: date | None = None  # overrides the rule's deadline anchor field
    confidence: str | None = None
    # How this right changes what you owe, used to add rights up without
    # double counting: "subtract" a fixed amount, "cap" the balance at a value,
    # or take a "percent" off what is left.
    effect: str = "subtract"
    effect_value: float | None = None


CheckFn = Callable[[Case, Rule], list[Hit]]
REGISTRY: dict[str, CheckFn] = {}


def check(name: str) -> Callable[[CheckFn], CheckFn]:
    def register(fn: CheckFn) -> CheckFn:
        REGISTRY[name] = fn
        return fn

    return register


def money(x: float) -> str:
    return f"${x:,.2f}" if x % 1 else f"${x:,.0f}"


def doc_source(doc: Document, line_id: str | None = None) -> str:
    return f"Your document: {doc.title}" + (f", line {line_id}" if line_id else "")


# --- data loaders -----------------------------------------------------------


@cache
def load_json(name: str) -> dict[str, Any]:
    return json.loads((DATA_DIR / name).read_text())


@cache
def load_mue(name: str) -> dict[str, tuple[int, str]]:
    with (DATA_DIR / name).open() as f:
        rows = csv.DictReader(line for line in f if not line.startswith("#"))
        return {r["code"]: (int(r["limit"]), r["description"]) for r in rows}


def poverty_line(household_size: int, dataset: str = "poverty_guidelines.json") -> float:
    fpl = load_json(dataset)
    return fpl["base"] + fpl["per_additional_person"] * max(household_size - 1, 0)


# --- medical ------------------------------------------------------------------


@check("gfe_overage")
def gfe_overage(case: Case, rule: Rule) -> list[Hit]:
    """No Surprises Act: self-pay bill at least $threshold over the Good Faith Estimate."""
    threshold = rule.params["threshold"]
    hits = []
    for gfe in case.docs(DocType.GOOD_FAITH_ESTIMATE):
        bill = case.doc(gfe.estimate_for) if gfe.estimate_for else None
        if not bill or not bill.self_pay:
            continue
        overage = round(bill.total - gfe.total, 2)
        if overage < threshold:
            continue
        hits.append(
            Hit(
                document=bill,
                recoverable=overage,
                recoverable_note="Best case: the reviewer sets the price at your estimate. "
                "The decision can land anywhere between the estimate and the bill.",
                evidence=[
                    Evidence(label="Good Faith Estimate", value=money(gfe.total), source=doc_source(gfe)),
                    Evidence(label="Billed", value=money(bill.total), source=doc_source(bill)),
                    Evidence(label="Over the estimate", value=money(overage), source=f"Threshold: {money(threshold)}"),
                ],
                values={"estimate": money(gfe.total), "billed": money(bill.total), "overage": money(overage)},
                effect="cap",
                effect_value=gfe.total,
            )
        )
    return hits


@check("duplicate_lines")
def duplicate_lines(case: Case, rule: Rule) -> list[Hit]:
    hits = []
    for bill in case.docs(DocType.MEDICAL_BILL):
        groups: dict[tuple, list] = defaultdict(list)
        for line in bill.lines:
            if line.confirmed and line.code:
                groups[(line.code, line.service_date, line.amount, line.units)].append(line)
        for (code, svc_date, amount, _), lines in groups.items():
            if len(lines) < 2:
                continue
            extra = amount * (len(lines) - 1)
            hits.append(
                Hit(
                    document=bill,
                    line_ids=[l.id for l in lines],
                    recoverable=extra,
                    evidence=[
                        Evidence(label=f"Line {l.id}", value=f"{code} {money(l.amount)}", source=doc_source(bill, l.id))
                        for l in lines
                    ],
                    values={
                        "description": lines[0].description,
                        "code": code,
                        "service_date": svc_date.isoformat() if svc_date else "the same day",
                        "amount": money(amount),
                    },
                )
            )
    return hits


@check("unit_limit")
def unit_limit(case: Case, rule: Rule) -> list[Hit]:
    limits = load_mue(rule.params["dataset"])
    hits = []
    for bill in case.docs(DocType.MEDICAL_BILL):
        for line in bill.lines:
            if not (line.confirmed and line.code in limits):
                continue
            limit, _ = limits[line.code]
            if line.units <= limit:
                continue
            unit_price = line.amount / line.units
            extra_units = line.units - limit
            extra_amount = round(unit_price * extra_units, 2)
            hits.append(
                Hit(
                    document=bill,
                    line_ids=[line.id],
                    recoverable=extra_amount,
                    evidence=[
                        Evidence(label="Units billed", value=str(line.units), source=doc_source(bill, line.id)),
                        Evidence(label="Daily limit (MUE)", value=str(limit), source=f"CMS MUE table: {rule.params['dataset']}"),
                    ],
                    values={
                        "units": line.units,
                        "description": line.description,
                        "code": line.code,
                        "limit": limit,
                        "extra_units": extra_units,
                        "unit_word": "unit" if extra_units == 1 else "units",
                        "extra_amount": money(extra_amount),
                    },
                )
            )
    return hits


@check("charity_care")
def charity_care(case: Case, rule: Rule) -> list[Hit]:
    """501(r) financial assistance, including refunds of bills already paid."""
    person = case.person
    if person.annual_income is None:
        return []
    hospitals = load_json(rule.params["hospitals_dataset"])
    fpl = poverty_line(person.household_size, rule.params["poverty_dataset"])
    your_pct = round(person.annual_income / fpl * 100)
    hits = []
    for bill in case.docs(DocType.MEDICAL_BILL):
        hospital = hospitals.get(bill.issuer_id or "")
        if not hospital or not hospital.get("nonprofit"):
            continue
        tier = next((t for t in hospital["tiers"] if your_pct <= t["max_fpl_pct"]), None)
        if not tier:
            continue
        recoverable = round(bill.total * tier["discount_pct"] / 100, 2)
        retro = ""
        if bill.patient_paid:
            retro = (
                f"You already paid {money(bill.patient_paid)}. If approved, the hospital must refund "
                "what you paid above the discounted amount."
            )
        hits.append(
            Hit(
                document=bill,
                recoverable=recoverable,
                recoverable_note=f"{tier['discount_pct']}% of {money(bill.total)}.",
                evidence=[
                    Evidence(label="Your household income", value=money(person.annual_income), source="You entered this"),
                    Evidence(
                        label="Federal poverty level",
                        value=f"{money(fpl)} for {person.household_size}",
                        source=f"HHS poverty guidelines {load_json(rule.params['poverty_dataset'])['year']}",
                    ),
                    Evidence(label="You are at", value=f"{your_pct}% of poverty level", source="Calculated"),
                    Evidence(
                        label="Hospital policy",
                        value=f"{tier['label']} up to {tier['max_fpl_pct']}%",
                        source=hospital["policy_url"],
                    ),
                ],
                values={
                    "hospital": hospital["name"],
                    "discount_label": tier["label"],
                    "limit_pct": tier["max_fpl_pct"],
                    "household_size": person.household_size,
                    "income": money(person.annual_income),
                    "your_pct": your_pct,
                    "retro_note": retro,
                },
                effect="percent",
                effect_value=tier["discount_pct"],
            )
        )
    return hits


@check("denial_appeal")
def denial_appeal(case: Case, rule: Rule) -> list[Hit]:
    hits = []
    for eob in case.docs(DocType.INSURANCE_EOB):
        for line in eob.lines:
            reason = line.denial_reason or _denial_reason(line.description)
            if not (line.confirmed and reason):
                continue
            hits.append(
                Hit(
                    document=eob,
                    line_ids=[line.id],
                    recoverable=line.amount,
                    recoverable_note="What you'd owe if the denial stands.",
                    confidence="check",
                    evidence=[
                        Evidence(label="Denied amount", value=money(line.amount), source=doc_source(eob, line.id)),
                        Evidence(label="Denial reason", value=reason, source=doc_source(eob, line.id)),
                    ],
                    values={"description": line.description.split("|")[0].strip(), "amount": money(line.amount), "denial_reason": reason},
                )
            )
    return hits


def _denial_reason(description: str) -> str | None:
    """EOB lines carry the denial as 'Service | DENIED: reason'."""
    if "DENIED:" in description.upper():
        return description.split(":", 1)[1].strip()
    return None


# --- rentals --------------------------------------------------------------------


@check("banned_fee")
def banned_fee(case: Case, rule: Rule) -> list[Hit]:
    effective = date.fromisoformat(rule.params["effective_date"])
    categories = rule.params["banned_fee_keywords"]
    hits = []
    for lease in case.docs(DocType.LEASE, DocType.RENT_LEDGER):
        for line in lease.lines:
            text = line.description.lower()
            category = next(
                (c for c in categories.values() if any(k in text for k in c["match"])),
                None,
            )
            if not (line.confirmed and category):
                continue
            times = line.times_paid if line.times_paid is not None else 1
            if lease.lease_start and lease.lease_start < effective and line.times_paid is None:
                times = 0
            total = round(line.amount * times, 2)
            if total <= 0:
                continue
            hits.append(
                Hit(
                    document=lease,
                    line_ids=[line.id],
                    recoverable=total,
                    recoverable_note=f"{money(line.amount)} x {times} payments since {effective:%b %-d, %Y}.",
                    evidence=[
                        Evidence(label="Fee on your lease", value=f'"{line.description}" {money(line.amount)}', source=doc_source(lease, line.id)),
                        Evidence(label="Times paid", value=str(times), source="You confirmed this"),
                        Evidence(label="Banned category", value=category["label"], source=rule.citation.law),
                    ],
                    values={
                        "description": line.description,
                        "amount_each": money(line.amount),
                        "frequency": line.frequency or "",
                        "fee_label": category["label"],
                        "effective_date": f"{effective:%B %-d, %Y}",
                        "times_paid": times,
                        "amount": money(total),
                    },
                )
            )
    return hits


@check("rent_vs_fmr")
def rent_vs_fmr(case: Case, rule: Rule) -> list[Hit]:
    fmr = load_json(rule.params["dataset"])
    hits = []
    for lease in case.docs(DocType.LEASE):
        area = fmr["areas"].get(lease.property_zip or "")
        if not (area and lease.monthly_rent and lease.bedrooms is not None):
            continue
        benchmark = area["by_bedrooms"].get(str(lease.bedrooms))
        if not benchmark:
            continue
        over_pct = round((lease.monthly_rent / benchmark - 1) * 100)
        if over_pct < rule.params["over_pct"]:
            continue
        hits.append(
            Hit(
                document=lease,
                recoverable=0,
                recoverable_note="Leverage, not a refund.",
                evidence=[
                    Evidence(label="Your rent", value=money(lease.monthly_rent), source=doc_source(lease)),
                    Evidence(label=f"HUD Fair Market Rent {fmr['year']}", value=money(benchmark), source=f"{area['area']} ({fmr['_source'].split('. ')[0]})"),
                ],
                values={
                    "rent": money(lease.monthly_rent),
                    "bedrooms": lease.bedrooms,
                    "area": area["area"],
                    "fmr": money(benchmark),
                    "over_pct": over_pct,
                },
            )
        )
    return hits
