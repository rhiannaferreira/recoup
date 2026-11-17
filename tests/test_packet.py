from recoup.actions.packet import build_calendar, build_packet


def test_packet_is_ordered_by_deadline(maria):
    items = build_packet(maria)["items"]
    assert items[0]["finding"]["rule_id"] == "med.nsa.self_pay_dispute"
    live = [it["finding"]["deadline"]["days_left"] for it in items if it["finding"]["deadline"]]
    assert live == sorted(live)
    assert all(it["draft"] for it in items)


def test_calendar_has_one_event_per_live_deadline(maria):
    ics = build_calendar(maria)
    assert ics.count("BEGIN:VEVENT") == 3
    assert "DTSTART;VALUE=DATE:20261210" in ics
    assert ics.endswith("END:VCALENDAR\r\n")


def test_spanish_wording_keeps_numbers(maria):
    from recoup.engine.evaluator import evaluate

    en = evaluate(maria).findings
    maria.language = "es"
    es = evaluate(maria).findings
    assert [(f.rule_id, f.recoverable) for f in es] == [(f.rule_id, f.recoverable) for f in en]
    dispute = next(f for f in es if f.rule_id == "med.nsa.self_pay_dispute")
    assert "$2,300" in dispute.summary and "disputa" in dispute.summary
    for f in es:
        assert "{" not in f.summary, f.rule_id
