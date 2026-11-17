"""HTTP API and static web app.

Run:  uvicorn recoup.api:app --reload   then open http://localhost:8000
"""

from __future__ import annotations

import json
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from recoup import intake
from recoup.actions import draft
from recoup.actions.packet import build_calendar, build_packet
from recoup.ai.granite import Granite
from recoup.engine.evaluator import evaluate
from recoup.engine.packs import load_all_packs
from recoup.models import Case, Document

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
SAMPLES = ROOT / "samples"

app = FastAPI(title="Recoup", version="0.1.0")
llm = Granite()


class ReportOut(BaseModel):
    report: dict
    total_recoverable: float
    clock: list[str]


@app.get("/api/packs")
def packs() -> list[dict]:
    return [
        {"pack": p.pack, "name": p.name, "version": p.version, "states": p.applies_to_states, "rules": [r.id for r in p.rules]}
        for p in load_all_packs()
    ]


@app.get("/api/sources")
def sources() -> list[dict]:
    """Every benchmark table the rules use, with its source and whether it's still demo data."""
    out = []
    for path in sorted((ROOT / "recoup" / "data").glob("*")):
        if path.suffix == ".json":
            meta = json.loads(path.read_text())
            source, status = meta.get("_source", ""), meta.get("_status", "")
        elif path.suffix == ".csv":
            comments = [l[1:].strip() for l in path.read_text().splitlines() if l.startswith("#")]
            source, status = "", " ".join(comments)
        else:
            continue
        out.append({"file": path.name, "source": source, "status": status, "demo": "DEMO" in status.upper() or "TODO" in status.upper()})
    return out


@app.get("/api/samples/{name}")
def sample(name: str) -> dict:
    path = SAMPLES / f"{Path(name).name}.json"
    if not path.exists():
        raise HTTPException(404, "No such sample")
    return json.loads(path.read_text())


@app.post("/api/analyze")
def analyze(case: Case, explain: bool = False) -> dict:
    report = evaluate(case)
    if explain and llm.enabled:
        language = "Spanish" if case.language == "es" else "English"
        for f in report.findings:
            text = llm.explain(f, language=language)
            if text != f.summary:
                f.summary, f.explained_by = text, "granite"
    return {
        "report": report.model_dump(mode="json"),
        "total_recoverable": report.total_recoverable,
        "clock": [f.rule_id for f in report.clock],
        "ai": llm.provider,
    }


class DraftIn(BaseModel):
    case: Case
    finding_index: int


@app.post("/api/draft", response_class=PlainTextResponse)
def make_draft(body: DraftIn) -> str:
    report = evaluate(body.case)
    if not 0 <= body.finding_index < len(report.findings):
        raise HTTPException(404, "No such finding")
    return draft(body.case, report.findings[body.finding_index])


@app.post("/api/packet")
def packet(case: Case) -> dict:
    return build_packet(case)


@app.post("/api/calendar")
def calendar(case: Case) -> Response:
    return Response(
        build_calendar(case),
        media_type="text/calendar",
        headers={"Content-Disposition": 'attachment; filename="recoup-deadlines.ics"'},
    )


@app.post("/api/intake")
async def upload(file: UploadFile) -> Document:
    suffix = Path(file.filename or "upload").suffix
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
    try:
        return intake.extract(Path(tmp.name), doc_id=uuid.uuid4().hex[:8], llm=llm)
    except RuntimeError as exc:
        raise HTTPException(422, str(exc)) from exc
    finally:
        Path(tmp.name).unlink(missing_ok=True)


@app.get("/")
def index() -> FileResponse:
    return FileResponse(WEB / "index.html")


app.mount("/", StaticFiles(directory=WEB), name="web")
