"""Core data types for Recoup.

Everything the app reasons about is one of these:

* ``Document``  - a bill, estimate, insurance statement or lease, already
  turned into structured fields and line items (by intake or by hand).
* ``Case``      - everything one person uploaded, plus facts about them
  (state, household size, income) that some rules need.
* ``Finding``   - one money-back right that a rule found. A finding always
  carries its receipts (``evidence`` and ``citation``) and, when the right
  expires, a ``deadline``.

The AI layer never creates a Finding. Only rules in ``recoup.engine`` do.
"""

from __future__ import annotations

from datetime import date
from enum import Enum

from pydantic import BaseModel, Field


class DocType(str, Enum):
    MEDICAL_BILL = "medical_bill"
    GOOD_FAITH_ESTIMATE = "good_faith_estimate"
    INSURANCE_EOB = "insurance_eob"
    LEASE = "lease"
    RENT_LEDGER = "rent_ledger"


class LineItem(BaseModel):
    """One line on a document, e.g. a CPT code on a bill or a fee on a lease."""

    id: str
    description: str
    amount: float = Field(description="Total dollars for this line (unit price x units).")
    code: str | None = Field(default=None, description="CPT/HCPCS code for medical lines.")
    units: int = 1
    service_date: date | None = None
    # Rentals: how often the fee is charged and how many times it was paid.
    frequency: str | None = Field(default=None, description="'monthly', 'one_time', ...")
    times_paid: int | None = None
    denial_reason: str | None = Field(default=None, description="Insurance statement: why the claim was denied.")
    confirmed: bool = Field(default=True, description="User confirmed this line on the review screen.")


class Document(BaseModel):
    id: str
    type: DocType
    title: str
    issuer: str = Field(description="Hospital, provider, insurer or landlord name.")
    issuer_id: str | None = Field(default=None, description="Key into data/hospitals.json etc.")
    document_date: date | None = Field(default=None, description="Date the document was issued.")
    first_bill_date: date | None = Field(
        default=None, description="Medical: date the patient got the first bill for this care."
    )
    service_date: date | None = None
    patient_paid: float = 0.0
    self_pay: bool | None = Field(default=None, description="Medical: uninsured or not using insurance.")
    estimate_for: str | None = Field(
        default=None, description="Good Faith Estimate: id of the bill this estimate covers."
    )
    # Rentals
    property_zip: str | None = None
    bedrooms: int | None = None
    monthly_rent: float | None = None
    lease_start: date | None = None
    lease_end: date | None = None
    in_collections: bool = False
    lines: list[LineItem] = Field(default_factory=list)

    @property
    def total(self) -> float:
        """Total on the document (one charge per line)."""
        return round(sum(line.amount for line in self.lines if line.confirmed), 2)

    @property
    def charged_total(self) -> float:
        """Total actually charged so far, counting repeat payments of monthly fees."""
        return round(
            sum(line.amount * (line.times_paid or 1) for line in self.lines if line.confirmed), 2
        )


class Person(BaseModel):
    name: str
    state: str = Field(description="Two-letter US state code, e.g. 'CO'.")
    household_size: int = 1
    annual_income: float | None = None
    age: int | None = None


class Case(BaseModel):
    person: Person
    documents: list[Document]
    today: date = Field(default_factory=date.today)
    language: str = Field(default="en", description="'en' or 'es'. Letters stay in English for US offices.")

    def docs(self, *types: DocType) -> list[Document]:
        return [d for d in self.documents if d.type in types]

    def doc(self, doc_id: str) -> Document | None:
        return next((d for d in self.documents if d.id == doc_id), None)


class Citation(BaseModel):
    """The law or official guidance a rule is built on."""

    law: str
    section: str | None = None
    url: str
    quote: str | None = Field(default=None, description="Short excerpt of the rule text.")


class Evidence(BaseModel):
    """One receipt: what we compared and where each number came from."""

    label: str
    value: str
    source: str = Field(description="'Your document: <title>, line <id>' or a benchmark dataset.")


class Deadline(BaseModel):
    date: date
    days_left: int
    anchor: str = Field(description="What the clock counts from, in plain words.")
    window_days: int

    @property
    def expired(self) -> bool:
        return self.days_left < 0


class ActionKind(str, Enum):
    LETTER = "letter"
    FEDERAL_DISPUTE = "federal_dispute"
    AID_APPLICATION = "aid_application"
    DEMAND_LETTER = "demand_letter"
    INSURER_APPEAL = "insurer_appeal"
    REGULATOR_COMPLAINT = "regulator_complaint"
    PHONE_CALL = "phone_call"


class Finding(BaseModel):
    rule_id: str
    pack: str
    title: str
    summary: str = Field(description="Plain-language explanation. Templated; the LLM may rewrite it.")
    document_id: str
    line_ids: list[str] = Field(default_factory=list)
    recoverable: float = Field(description="Dollars this right could get back or cancel.")
    recoverable_note: str = Field(default="", description="How the dollar figure was worked out.")
    confidence: str = Field(default="high", description="'high' = bright-line rule, 'check' = needs a human look.")
    evidence: list[Evidence]
    citation: Citation
    deadline: Deadline | None = None
    action: ActionKind
    action_label: str
    template: str | None = None
    explained_by: str = Field(default="template", description="'template' or 'granite' (AI rewrite that kept every number).")


class Report(BaseModel):
    person: Person
    today: date
    findings: list[Finding]
    rules_checked: int
    rules_matched: int

    @property
    def total_recoverable(self) -> float:
        return round(sum(f.recoverable for f in self.findings), 2)

    @property
    def clock(self) -> list[Finding]:
        """Findings with a live deadline, soonest first: the Rights Clock."""
        live = [f for f in self.findings if f.deadline and not f.deadline.expired]
        return sorted(live, key=lambda f: f.deadline.days_left)  # type: ignore[union-attr]
