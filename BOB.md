# Building Recoup with IBM Bob

The challenge scores technical execution on how Bob was used. This file lists the Bob work, in schedule order, with a prompt to paste for each task. Record every session (screenshots or screen capture) and note the result in the "How we used Bob" table in `README.md`.

**Rule of thumb:** each task ends with `pytest -q` passing. Ask Bob to write the tests first.

## Before you start

1. Open the repo in Bob and let it index the project.
2. First prompt, to give Bob the map:

   > Read README.md, recoup/models.py, recoup/engine/packs.py, recoup/engine/checks.py and recoup/packs/medical/us_federal.yaml. Summarize the rule-file format and how a check function turns into a Finding. Don't change anything yet.

## 1. Verify the Colorado pack against the statute (Nov 18–19)

Paste the enrolled text of Colorado HB25-1090 into Bob.

> Here is the text of Colorado HB25-1090. Compare it with recoup/packs/rentals/co.yaml. For every banned fee keyword, the 14-day demand window and the 18% interest, quote the section of the bill that supports it. Fix anything the bill doesn't support, add banned fees the file is missing, and update the citation section numbers. Add a test in tests/test_engine.py for each new fee.

## 2. Replace demo data with real data (Nov 18–25)

Each data file in `recoup/data/` has a `_status` note saying what to replace.

> Update recoup/data/poverty_guidelines.json to the 2026 HHS poverty guidelines (48 states + DC) and add Alaska and Hawaii as separate tables keyed by state. Update poverty_line() in checks.py to pick the right table by person.state. Add tests.

> Write a loader for the CMS quarterly MUE file (CSV) at recoup/data/loaders/mue.py that produces the same {code: (limit, description)} mapping as load_mue(). Keep mue_demo.csv as the test fixture.

> Write recoup/data/loaders/hud_fmr.py that calls the HUD FMR API by ZIP (token in HUD_API_TOKEN), caches results into hud_fmr_demo.json's format, and falls back to the cache offline.

> Add 2 real Colorado nonprofit hospitals to hospitals_demo.json from their published financial assistance policies. Cite each policy URL. Keep Front Range Community Hospital for the demo.

## 3. Intake: Docling + Granite (Nov 20–22)

> Harden recoup/intake/__init__.py. Create synthetic PDF versions of samples/maria.json's three documents in samples/pdf/. Write tests that run extract() on each and compare the lines to the JSON version. Add a no-model parser for simple "code description amount" tables so the demo works without watsonx.

## 4. Medical pack additions (Nov 23–25)

> Add a check `collections_shield` and a rule file recoup/packs/medical/co_debt.yaml for Colorado's medical debt protections (credit reporting and interest). Use the Commonwealth Fund state table. Rule format and tests like the existing ones.

> Add a `retro_aid_refund` rule: for bills already paid within the last 240 days of the first bill, the finding is a refund request for the amount paid above the discounted balance.

## 5. The Bob demo shot: add a new state (Nov 26–27)

This is the shot for the video. Record it live, start to finish.

> Here is [STATE]'s rental fee statute, from the NCLC 21-state fee table. Write recoup/packs/rentals/[st].yaml following recoup/packs/rentals/co.yaml exactly: same check names, new keywords, new citation. Add a sample lease to samples/ and tests showing which fees fire. Run pytest.

## 6. Evaluation harness (Nov 28)

> Write eval/make_fixtures.py that generates 30 synthetic cases from samples/maria.json with known planted violations (duplicates, unit errors, GFE overages above and below $400, banned and allowed fees, incomes on both sides of each aid tier). Save each case with an expected list of rule ids. Write eval/run_eval.py that runs evaluate() on every case and prints recall and false-flag rate, and writes eval/results.md. Add the numbers to README.md.
>
> Also write eval/results.json in this shape, which the app reads at /api/eval to show the "How sure are we?" panel:
> `{"cases": 30, "recall": 0.97, "false_flags": 1, "false_flag_rate": 0.03, "tests_passing": 61, "run_at": "2026-11-28", "by_rule": {"<rule_id>": {"expected": 12, "caught": 12, "false_flags": 0}}}`
> Recall and the rate are fractions from 0 to 1. Test it with `pytest tests/test_eval_api.py`.

## 7. AI phone call, last (Nov 29–30)

Build only after everything above works. The screens are already built in `web/app.js` (look for "AI advocate call") and switch on by themselves once `recoup/actions/call.py` exists. Bob builds the backend to this contract:

| Endpoint | Request | Response |
|---|---|---|
| `POST /api/call/script` | `{case, finding_index}` | `{disclosure, lines: [str]}` |
| `POST /api/call/start` | `{case, finding_index, script, approved_at}` | `{call_id}` |
| `GET /api/call/{call_id}` | | `{status: queued, ringing, in_progress, done or failed, summary?: {spoke_to, promised, next_date}}` |

> Add recoup/actions/call.py and the three endpoints above to recoup/api.py. build_script(case, finding) returns a disclosure that starts "This is an AI assistant calling on behalf of [person's name], with their permission. This call is not recorded." (use the name, never pronouns), then one line per disputed item with the amount and the right being used. start_call logs the approval timestamp and refuses to start without one. Use a telephony provider behind an interface with a fake provider for tests and demos; the fake walks through queued, ringing, in_progress, done and returns a summary. Never record calls. Add tests using samples/rosa.json.

## Where things live

| You want to change... | File |
|---|---|
| What counts as a violation | `recoup/packs/**.yaml` and `recoup/engine/checks.py` |
| Deadlines on the Rights Clock | `deadline:` in the rule YAML |
| How rights add up | `stack_rights` in `recoup/engine/evaluator.py` |
| Letter and form wording | `recoup/actions/templates/` |
| AI prompts and provider | `recoup/ai/granite.py` |
| Screens | `web/` |
