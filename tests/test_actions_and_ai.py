from fastapi.testclient import TestClient

from recoup.actions import draft
from recoup.ai.granite import Granite, numbers_preserved
from recoup.api import app
from recoup.engine.evaluator import evaluate


def test_every_finding_drafts(maria, rosa):
    for case in (maria, rosa):
        for f in evaluate(case).findings:
            text = draft(case, f)
            assert case.person.name in text
            assert "not legal advice" in text


def test_dispute_draft_is_prefilled(maria):
    f = next(f for f in evaluate(maria).findings if f.rule_id == "med.nsa.self_pay_dispute")
    text = draft(maria, f)
    assert "$1,800" in text and "$4,100" in text and "2026-12-10" in text


def test_ai_rewrite_rejected_when_numbers_change():
    original = "You were billed $4,100, which is $2,300 more than $1,800."
    assert numbers_preserved(original, "Your bill was $4,100. That's $2,300 above the $1,800 estimate.")
    assert not numbers_preserved(original, "Your bill was $4,100, about $2,000 more than expected.")


def test_no_llm_falls_back_to_template(maria):
    f = evaluate(maria).findings[0]
    assert Granite(provider="none").explain(f) == f.summary


def test_api_end_to_end():
    client = TestClient(app)
    case = client.get("/api/samples/maria").json()
    out = client.post("/api/analyze", json=case).json()
    assert out["total_recoverable"] == 4780
    letter = client.post("/api/draft", json={"case": case, "finding_index": 0})
    assert letter.status_code == 200 and "Maria Lopez" in letter.text
    assert client.get("/api/samples/../../etc/passwd").status_code == 404


def test_granite_rewrite_is_marked(monkeypatch):
    from recoup import api

    monkeypatch.setattr(api.llm, "provider", "watsonx")
    monkeypatch.setattr(api.llm, "chat", lambda system, user: "Plain words. " + user)
    client = TestClient(app)
    case = client.get("/api/samples/maria").json()
    out = client.post("/api/analyze?explain=true", json=case).json()
    assert all(f["explained_by"] == "granite" for f in out["report"]["findings"])
    assert out["total_recoverable"] == 4780  # AI never changes the numbers


def test_granite_rewrite_dropping_numbers_is_rejected(monkeypatch):
    from recoup import api

    monkeypatch.setattr(api.llm, "provider", "watsonx")
    monkeypatch.setattr(api.llm, "chat", lambda system, user: "You might be owed some money.")
    client = TestClient(app)
    case = client.get("/api/samples/maria").json()
    out = client.post("/api/analyze?explain=true", json=case).json()
    assert all(f["explained_by"] == "template" for f in out["report"]["findings"])


def test_sources_flag_demo_tables():
    rows = TestClient(app).get("/api/sources").json()
    assert {r["file"] for r in rows} >= {"poverty_guidelines.json", "mue_demo.csv"}
    assert all("demo" in r for r in rows)


def test_features_report_call_not_built_yet():
    body = TestClient(app).get("/api/features").json()
    assert body["call"] is False  # flips to True when Bob adds recoup/actions/call.py
