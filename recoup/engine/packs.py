"""Load and validate rule packs (YAML files under recoup/packs/)."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field

from recoup.models import ActionKind, Citation

PACKS_DIR = Path(__file__).resolve().parent.parent / "packs"


class DeadlineSpec(BaseModel):
    days: int = Field(description="Window length. Negative means 'this many days BEFORE the anchor'.")
    anchor: str = Field(description="Document field the clock counts from, e.g. 'first_bill_date'.")
    anchor_label: str


class RuleText(BaseModel):
    """Translated wording for a rule. Numbers still come from the check."""

    title: str
    summary: str
    action_label: str


class Rule(BaseModel):
    id: str
    title: str
    check: str = Field(description="Name of a function registered in recoup.engine.checks.")
    params: dict[str, Any] = Field(default_factory=dict)
    deadline: DeadlineSpec | None = None
    citation: Citation
    action: ActionKind
    action_label: str
    confidence: str = "high"
    template: str | None = Field(default=None, description="Draft template override in recoup/actions/templates.")
    summary: str
    i18n: dict[str, RuleText] = Field(default_factory=dict, description="Translations keyed by language code.")

    def text(self, language: str) -> RuleText:
        if language in self.i18n:
            return self.i18n[language]
        return RuleText(title=self.title, summary=self.summary, action_label=self.action_label)


class Pack(BaseModel):
    pack: str
    name: str
    version: str
    applies_to_states: list[str]
    rules: list[Rule]
    source_file: str = ""

    def applies_to(self, state: str) -> bool:
        return "*" in self.applies_to_states or state.upper() in self.applies_to_states


def _normalize(value: Any) -> Any:
    """YAML turns 2026-01-01 into a date; keep params JSON-friendly."""
    if isinstance(value, dict):
        return {k: _normalize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_normalize(v) for v in value]
    if isinstance(value, date):
        return value.isoformat()
    return value


def load_pack(path: Path) -> Pack:
    raw = _normalize(yaml.safe_load(path.read_text()))
    pack = Pack.model_validate({**raw, "source_file": str(path.relative_to(PACKS_DIR))})
    ids = [r.id for r in pack.rules]
    if len(ids) != len(set(ids)):
        raise ValueError(f"{path}: duplicate rule ids")
    return pack


def load_all_packs(packs_dir: Path = PACKS_DIR) -> list[Pack]:
    return [load_pack(p) for p in sorted(packs_dir.rglob("*.yaml"))]
