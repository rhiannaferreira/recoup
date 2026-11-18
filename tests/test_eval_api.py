"""The accuracy panel reads eval/results.json (BOB.md task 6). These tests pin its shape."""

import json

from fastapi.testclient import TestClient

from recoup import api

REQUIRED = {"cases", "recall", "false_flags"}


def test_eval_is_empty_until_the_harness_runs(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "EVAL_RESULTS", tmp_path / "missing.json")
    assert TestClient(api.app).get("/api/eval").json() == {"available": False}


def test_eval_serves_the_harness_output(tmp_path, monkeypatch):
    path = tmp_path / "results.json"
    path.write_text(json.dumps({"cases": 30, "recall": 0.9, "false_flags": 1, "by_rule": {}}))
    monkeypatch.setattr(api, "EVAL_RESULTS", path)
    body = TestClient(api.app).get("/api/eval").json()
    assert body["available"] is True and body["cases"] == 30


def test_real_results_file_has_the_fields_the_panel_needs():
    if not api.EVAL_RESULTS.exists():
        return  # written by eval/run_eval.py
    body = json.loads(api.EVAL_RESULTS.read_text())
    assert REQUIRED <= body.keys()
    assert 0 <= body["recall"] <= 1
    for rule in body.get("by_rule", {}).values():
        assert {"expected", "caught", "false_flags"} <= rule.keys()


def test_hospitals_list_marks_demo_policies():
    rows = TestClient(api.app).get("/api/hospitals").json()
    assert rows and all({"name", "policy_url", "tiers", "demo"} <= r.keys() for r in rows)
    assert any(r["demo"] for r in rows)  # Front Range is made up until Bob adds real ones
