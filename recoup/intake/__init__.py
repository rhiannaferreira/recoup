"""Intake: turn an uploaded file into a structured ``Document``.

Pipeline:  file --(Docling)--> markdown text --(Granite)--> Document JSON
           --> person confirms every line on the review screen --> rules run.

Docling is optional (``pip install docling``). Without it, intake accepts
JSON documents (the synthetic demo files) and plain text.

BOB (Nov 20-22): harden this module. Add a test per sample document, handle
multi-page bills, and map common line formats without needing the model.
"""

from __future__ import annotations

import json
from pathlib import Path

from recoup.ai.granite import SYSTEM_EXTRACT, Granite
from recoup.models import Document

DOCUMENT_SCHEMA = json.dumps(
    {
        "type": "medical_bill | good_faith_estimate | insurance_eob | lease",
        "title": "str",
        "issuer": "str",
        "document_date": "YYYY-MM-DD",
        "first_bill_date": "YYYY-MM-DD | null",
        "self_pay": "bool | null",
        "property_zip": "str | null",
        "bedrooms": "int | null",
        "monthly_rent": "number | null",
        "lines": [
            {
                "id": "str",
                "code": "str | null",
                "description": "str",
                "amount": "number",
                "units": "int",
                "service_date": "YYYY-MM-DD | null",
                "frequency": "monthly | one_time | null",
                "denial_reason": "str | null",
            }
        ],
    }
)


def file_to_text(path: Path) -> str:
    if path.suffix.lower() in {".txt", ".md"}:
        return path.read_text()
    try:
        from docling.document_converter import DocumentConverter
    except ImportError as exc:  # pragma: no cover - depends on optional install
        raise RuntimeError("Install Docling to read PDFs and photos: pip install docling") from exc
    return DocumentConverter().convert(str(path)).document.export_to_markdown()


def extract(path: Path, doc_id: str, llm: Granite | None = None) -> Document:
    """Read a file and return a Document whose lines still need the person's confirmation."""
    if path.suffix.lower() == ".json":
        return Document.model_validate({"id": doc_id, **json.loads(path.read_text())})
    llm = llm or Granite()
    text = file_to_text(path)
    raw = llm.chat(SYSTEM_EXTRACT.format(schema=DOCUMENT_SCHEMA), text)
    data = json.loads(raw[raw.index("{") : raw.rindex("}") + 1])
    doc = Document.model_validate({"id": doc_id, **data})
    for line in doc.lines:
        line.confirmed = False  # the person must confirm each line the model read
    return doc
