# Recoup roadmap: Nov 17 to Dec 2, 2026

**Submit on Tue Dec 1.** The deadline is Dec 2, 5 PM ET (the page also lists Dec 10, so don't count on it).

Two builders work in parallel:

- **Bob (rhi driving)** builds the parts that show judges what Bob can do: rule packs written from statute text, real data pipelines, intake, the accuracy harness and the phone call. Each task has a ready prompt in `BOB.md`. Record every session.
- **Claude** builds the platform around them: screens, accessibility, languages, export, deployment, and the demo and pitch materials.

Judges score Bob use under technical execution, so Bob owns the core logic from here on. Claude doesn't touch rule packs or checks unless a Bob task is blocked.

## What makes it stand out

1. **Receipts on every finding.** Bill line, law, benchmark, source link. If no rule matches, there's no finding.
2. **The Rights Clock.** Every other tool lists errors. Recoup shows deadlines.
3. **One honest number.** Rights stack without double counting.
4. **Measured accuracy.** Recall and false-flag rate on 30 seeded cases, printed in the README and the video.
5. **Bob writes the law into code.** A new state in about 10 minutes, filmed live.
6. **Built for the people who need it most.** Large text, read aloud, Spanish, and an AI advocate that calls billing for older patients (it says it's an AI, and only with approval).

## Week 1: Nov 17–23. Foundations and real data

| Day | Bob (rhi) | Claude |
|---|---|---|
| Tue 17 | Activate Bob. Run the "map the codebase" prompt (`BOB.md`, Before you start) | ✅ Engine, two packs, demo, tests, redesign. ROADMAP |
| Wed 18 | **Task 1:** check the Colorado pack against the HB25-1090 text | ✅ (done early, Nov 17) Printable evidence packet; Spanish UI; saved cases; calendar file |
| Thu 19 | **Task 2a:** 2026 poverty guidelines + Alaska/Hawaii | ✅ (done early, Nov 17) "About you" panel (state, household, income) |
| Fri 20 | **Task 2b:** CMS MUE loader | ✅ (done early) Upload polish: drag and drop, phone photos, reading state |
| Sat 21 | **Task 3:** Docling + Granite intake with PDF samples | ✅ (done early) Granite labels in the UI; number check tested |
| Sun 22 | **Task 2c/2d:** HUD FMR loader, 2 real Colorado hospital policies | Live demo deployment (needs rhi's OK on hosting) |
| Mon 23 | Buffer and catch-up | ✅ (done early) "How Recoup decides" page with live pack list and Demo/Official data status |

**Checkpoint Nov 23:** real data in every table, PDF upload works, live demo URL.

## Week 2: Nov 24–30. Breadth, proof, and the phone call

| Day | Bob (rhi) | Claude |
|---|---|---|
| Tue 24 | **Task 4:** Colorado medical debt "collections shield" pack | Rights Clock reminders: .ics calendar file per deadline |
| Wed 25 | **Task 5 (film it):** second rental state from the NCLC table | ✅ (done early) Rosa's appeal letter and next steps |
| Thu 26 | Thanksgiving. Light day: rehearse the Bob segment | ✅ (done early) Accessibility pass: keyboard, focus, contrast, reduced motion |
| Fri 27 | **Task 5 again:** third state if time allows | Hospital accountability teaser: anonymized "aid policy found?" map from sample data |
| Sat 28 | **Task 6:** 30 seeded cases + eval harness. Put numbers in README | Results page "How sure are we?" panel that shows the eval numbers |
| Sun 29 | **Task 7:** AI phone call: approved script, AI disclosure, call summary | ✅ (done early) Call screens behind a feature flag, API contract in BOB.md; "Ask family to help" summary |
| Mon 30 | Test the call with someone playing billing | Final UI polish; check the full demo path on phone and laptop |

**Checkpoint Nov 30:** 3 packs and 2+ states, accuracy numbers, working call demo.

## Ship: Dec 1–2

| | rhi | Claude |
|---|---|---|
| Tue Dec 1 | Record the video (Bob segment and call clip for real). SkillsBuild certificates. Publish | Video script and shot list, slide deck, final README with the "How we used Bob" table filled in |
| Wed Dec 2 | Buffer. Submit by noon ET at the latest | Last checks on the live demo |

## Cut list if behind

Cut in this order: third state, hospital map, calendar files, Spanish explanations (keep the Spanish UI), photo capture.
**Never cut:** receipts on every finding, the Rights Clock, the filmed Bob segment, the accuracy numbers.

## Status log

Newest first. Each session ends at a clean checkpoint (tests passing, pushed) and says where to resume.

- **Nov 18:** Demo UI polish: Rights Clock countdown rings (arc = share of the window left), six-step icon row, patient/renter/caregiver cards, "Built on public law and data" strip, household-size chips (1 to 5, 6+). EN/ES. 25 tests. Pitch deck drafted (private slides artifact). **Resume:** hosting once rhi picks, then the eval panel after Bob task 6.
- **Nov 17 (night):** README screenshots and feature list, "Ask family to help" share/copy summary, call screens (consent gate, live status, summary saved to the tracker) waiting on Bob task 7 via /api/features. 25 tests. **Resume:** live demo once rhi picks hosting; hospital map teaser (needs real data from Bob task 2d, so may move after Nov 22); slide deck draft.
- **Nov 17 (late):** Progress tracker (sent / won / denied, follow-up dates, Recovered total), "What happens next" steps (EN/ES), fuller appeal letter, draft video script in docs/video-script.md. 24 tests. **Resume:** live demo once rhi picks hosting; then Fri 27 hospital map teaser; then call screens shell for Bob task 7.
- **Nov 17 (evening):** Spanish UI and rule wording, evidence packet (print/PDF), calendar (.ics) of deadlines, saved cases with resume, "About you" panel. 21 tests. Commits no longer carry Claude trailers (rhi's call). Later that evening: upload polish, Granite labels, "How Recoup decides" page. 24 tests. Then: accessibility pass, Rosa sample on start page, Dockerfile. **Resume:** live demo deployment once rhi picks hosting (card posted), then Rosa's appeal flow polish (Wed 25) and the hospital map teaser (Fri 27).
- **Nov 17:** Engine, medical and Colorado rental packs, Rights Clock, drafts, redesign (pastel mint), ROADMAP. 18 tests passing. **Resume:** Wed 18 Claude items.
