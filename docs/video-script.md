# Recoup: 3-minute video script (draft)

Target: 2:55. Record on Dec 1. Screen at 1280×800, browser zoom 110%, "Larger text" off, sample case reset (open the app in a private window).

Numbers in brackets get filled in once the work behind them is done: [ACCURACY] after Bob task 6, [STATE] after Bob task 5.

| Time | Screen | Voiceover |
|---|---|---|
| 0:00–0:12 | Black, then one line of serif text: "Only 29% of patients who qualify for hospital aid ever get it." | "Only 29% of patients who qualify for hospital financial aid ever get it. Not because they don't qualify. Because nobody told them, and the deadline passed." |
| 0:12–0:22 | Recoup start page. The bill with the struck-out duplicate and the "23 days" stamp | "Money-back rights have deadlines. Recoup finds yours, shows the proof, and counts down the days." |
| 0:22–0:45 | Click "Open a sample case". Confirm screen: About you panel, tick lines | "Meet Maria in Denver. She went to the ER without insurance, got a $1,800 estimate and a $4,100 bill. Her lease also has two fees she's paid every month. Recoup reads both. She confirms every line, because rules only use what she confirms." |
| 0:45–1:05 | Results: the $4,780 total, then the Rights Clock timeline | "Four thousand, seven hundred eighty dollars, and three deadlines. The first one is in 23 days: a federal dispute almost nobody knows exists." |
| 1:05–1:30 | Expand the dispute finding. Slowly scroll the receipt | "Every finding has a receipt: the line on her bill, the estimate, the law with its exact text, and the source. The AI doesn't decide anything here. Coded rules do. IBM Granite only rewords the explanation, and Recoup checks that every number survives." |
| 1:30–1:50 | Click "Start the federal dispute". Preview of the pre-filled form. Click Approve. Then the Colorado demand letter | "One click gives her the dispute, pre-filled, and a demand letter citing Colorado's new junk-fee law. She approves every word. Nothing is sent for her." |
| 1:50–2:00 | Toggle ES. Then Rosa's case, with the AI call clip (Bob task 7) | "It works in Spanish. And for Maria's mother Rosa, who's 72, an AI advocate can call the insurer for her. It says it's an AI, and it calls only with her approval." |
| 2:00–2:35 | **Bob segment, recorded live.** Paste [STATE]'s fee statute into Bob, Bob writes the rule file and tests, `pytest` goes green, the app now covers [STATE] | "This is how Recoup grows. I give IBM Bob a state's statute. Bob writes the rule file and its tests, and the tests pass. That's a new state in about ten minutes, and every rule stays tested like code." |
| 2:35–2:48 | Accuracy table from eval/results.md | "We tested it on 30 seeded cases with planted violations. Recoup caught [ACCURACY]% of them, with [FALSE FLAGS] false flags." |
| 2:48–3:00 | Evidence packet, then the hospital map teaser | "Every right, with a receipt and a deadline. Recoup. Get back what you're owed, before time runs out." |

## Shot checklist

- [ ] Reset the browser (private window) so no saved case shows up
- [ ] Today is pinned in the samples (Nov 17), so "23 days" stays the same on recording day
- [ ] Bob session recorded in one take, with the terminal visible for `pytest`
- [ ] Call clip: Rosa's script approval screen, then 10 seconds of the call with the AI disclosure audible
- [ ] Captions on (accessibility is part of the pitch)
- [ ] Final frame: repo URL and live demo URL

## Lines to avoid

- "Lawyer", "legal advice", "guaranteed". Say "information" and "your rights".
- Accuracy numbers before the eval harness runs.
- Any real patient, hospital or landlord name. The demo data is synthetic.
