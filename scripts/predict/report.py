"""Predict research - regenerate docs/predict/backtest-report.md from the
back-test outputs in .cache/predict/ (run after the back-tests).

    python scripts/predict/report.py
"""
import json
import os

C = ".cache/predict"
m = json.load(open(f"{C}/final-test.json", encoding="utf-8"))["result"]
aw = json.load(open(f"{C}/awards-model.json", encoding="utf-8"))
pk = json.load(open(f"{C}/pick-2024.json", encoding="utf-8"))
# Only the 2025–26 (test) event reports are reported.
ev = {(s, a): json.load(open(f"{C}/events-{s}-{a}.json", encoding="utf-8")) for s in (2025,) for a in ("model", "none")}
tuned = json.load(open(f"{C}/tuned-2024.json", encoding="utf-8"))["best"]

L = []
add = L.append
add("# Predict — back-test report (research phase)\n")
add(
    "All numbers below come from replaying real seasons in time order: every prediction uses only data that existed "
    "before it. Settings were tuned on **2024–25** and locked; **2025–26** is the test season. Data: FTC Scout (all "
    "2022–2026 matches, 5,175 events) and the FIRST Events API (official advancement lists, points breakdowns and "
    "alliance selections for 1,265 advancing events).\n"
)

s25 = m["season2025"]
add(f"## 1. Single-match predictions (2025–26 test, {s25['matches']:,} matches)\n")
add("| Model | Accuracy | Brier ↓ | Calibration error ↓ |\n|---|---|---|---|")
add("| Coin flip | — | 0.248 | — |")
for key, name in (
    ("lastEventOpr", "Last-event OPR (baseline)"),
    ("avgScore", "Season-average score (baseline, live)"),
    ("ratingPreEvent", "**Rating — frozen at event start**"),
    ("ratingLive", "**Rating — live**"),
):
    x = s25[key]
    add(f"| {name} | {x['acc'] * 100:.1f}% | {x['brier']:.3f} | {x['ece']:.3f} |")
exp = m["season2025_byExperience"]
first, late = exp["0-0"]["ratingLive"]["acc"], exp["10-+"]["ratingLive"]["acc"]
add(
    f"\nScore error (MAE) {s25['scoreMAE']} pts, bias {s25['scoreBias']} pts. The 80% score range covers "
    f"{s25['interval80Coverage'] * 100:.0f}%. Accuracy rises from {first * 100:.0f}% in a team's first match of the "
    f"season to {late * 100:.0f}% after 10+ matches.\n"
)
add(
    "Score uncertainty (σ = a + b·mean, plus each robot's rating uncertainty) was refitted on 2024–25 by likelihood so "
    "score ranges are honest; predictions made from an event-start snapshot add extra per-robot variance "
    f"({tuned.get('preExtra', 0)} pts², also fitted on 2024–25) because a team's level moves during an event. These "
    "were fitted after the first 2025–26 test run, so the 2025–26 numbers here are a second look at the test season.\n"
)

e25 = ev[(2025, "model")]
add(f"## 2. Whole-event advancement odds (2025–26 test, {e25['events']} events, {e25['advancement']['pre']['n']:,} team-events)\n")
add(f"Awards are predicted from team history (nothing about the event's results is known). {e25['runs']:,} simulations per event and starting point.\n")
add("| Starting point | Brier ↓ | Calibration error ↓ | Matches only (no awards) |\n|---|---|---|---|")
for st, name in (("pre", "Before the event"), ("quals", "After quals"), ("selected", "After alliance selection")):
    a, b = e25["advancement"][st], ev[(2025, "none")]["advancement"][st]
    add(f"| {name} | {a['brier']:.3f} | {a['ece']:.3f} | {b['brier']:.3f} / {b['ece']:.3f} |")
bl = e25["advancement"]["baselineTopNByRank"]
add(f"| Naive: top-ranked eligible teams advance (needs quals results) | {bl['brier']:.3f} | {bl['ece']:.3f} | |")
add("\nCalibration before the event (predicted → actual): "
    + ", ".join(f"{b['meanP'] * 100:.0f}%→{b['rate'] * 100:.0f}%" for b in e25["calibrationPre"] if b["n"]) + ".\n")

pt = e25.get("partners")
if pt:
    add("## 3. Partner scenarios (\"if we pick…\")\n")
    add(
        "Each real alliance was simulated from the end of quals with its actual pairing forced, then compared with what "
        "happened. Knowing the partner should beat the general after-quals odds, which average over every possible partner.\n"
    )
    add("| Prediction | With the real partner forced | General after-quals odds |\n|---|---|---|")
    for key, label, base in (("win", "Alliance wins the event", "winUnconditional"), ("advCaptain", "Captain advances", "advCaptainUnconditional"), ("advPartner", "First pick advances", None)):
        x = pt[key]
        other = f"Brier {pt[base]['brier']:.3f}, calibration error {pt[base]['ece']:.3f}" if base else "—"
        add(f"| {label} ({x['n']:,}) | Brier {x['brier']:.3f}, calibration error {x['ece']:.3f} | {other} |")
    add("")

add("## 4. Components\n")
add(
    f"- **Alliance selection:** captains pick by a softmax over strength and rank (τ={pk['pick']['tau']}, rank weight "
    f"{pk['pick']['rankWeight']}, fitted on 2024–25). The real first pick was in the model's top 3 for "
    f"**{pk['top3'] * 100:.0f}%** of {pk['picks']:,} picks. Declines aren't recorded anywhere, so they aren't modelled."
)
r = e25["ranks"]
add(f"- **Quals ranks (before the event):** mean error {r['rankMAE']} places; the 10–90% range contains the real rank {r['rank80Coverage'] * 100:.0f}% of the time.")
at = aw["test"]
add(
    f"- **Awards (2025–26 test):** P(award worth ≥12 pts) Brier {at['pts12']['model']['brier']} vs "
    f"{at['pts12']['teamAgnostic']['brier']} for a team-agnostic rate; Inspire 1st {at['inspire1']['model']['brier']} vs "
    f"{at['inspire1']['teamAgnostic']['brier']}; any Inspire {at['anyInspire']['model']['brier']} vs "
    f"{at['anyInspire']['teamAgnostic']['brier']}. Inputs: past Inspire / judged awards (decay {aw['model']['decay']} per "
    "season), awards earlier this season, robot strength. One judged award per team per event."
)

add("\n## 5. Rules (read off official data)\n")
add("- 2025–26 advancement points = quals + alliance selection + playoffs + awards (1,786/1,786 totals). Quals: "
    "`ceil(erfinv((N−2R+2)/(1.07N))·7/erfinv(1/1.07) + 9)` (780/789; the 9 misses are a team-count mismatch at two "
    "events). Alliance: captain and 1st pick get 21 − alliance #. Playoffs 40/20/10/5. Awards: Inspire 60/30/15, other "
    "judged 12/6/3, only the highest counts; Dean's List 0.")
add("- Ranking: 2025–26 RP = 3 win / 1 tie + movement, goal, pattern bonuses; tiebreak avg non-penalty score (99.7% of "
    "official ranks). 2024–25 RP = 2 win / 1 tie; tiebreak avg auto then avg endgame (99.8%).")
add("- Alliances: ≤10 teams 2, ≤20 4, ≤40 6, else 8. Double-elimination brackets for 4/6/8 alliances with a grand-final "
    "rematch; 2 alliances play a best-of-3.")

add("\n## 6. Tuned settings (2024–25)\n")
add("```json\n" + json.dumps(tuned, indent=1) + "\n```")

add("\n## 7. How to reproduce\n")
add("Run from the repo root (FIRST API credentials in `FTC_EVENTS_USERNAME` / `FTC_EVENTS_TOKEN` for step 2):\n")
add("```bash\n"
    "npx tsx scripts/predict/ingest.mts 2025 2024 2023 2022                 # 1. FTC Scout matches → .cache/predict/scout\n"
    "npx tsx scripts/predict/ingest-first.mts 2025 2024                     # 2. FIRST advancement data → .cache/predict/first\n"
    "npx tsx scripts/predict/tune.mts --tune 2024 --rounds 2                # 3. rating settings (2024–25)\n"
    "npx tsx scripts/predict/fit-noise.mts --tune 2024                      # 4. score uncertainty a, b, preExtra (2024–25)\n"
    "npx tsx scripts/predict/backtest-matches.mts --seasons 2022,2023,2024,2025 --report 2024,2025 \\\n"
    "  --params '<rating settings>' --noise '<a, b, preExtra>' --quiet --json .cache/predict/final-test.json   # 5. match test\n"
    "npx tsx scripts/predict/backtest-events.mts --season 2024 --fit-pick --awards none --runs 50 --limit 1   # 6. pick model (2024–25)\n"
    "npx tsx scripts/predict/fit-awards.mts                                  # 7. award model (fit 2024–25, test 2025–26)\n"
    "npx tsx scripts/predict/backtest-events.mts --season 2025 --runs 1000 --awards model --partners   # 8. event test\n"
    "npx tsx scripts/predict/backtest-events.mts --season 2025 --runs 1000 --awards none\n"
    "python scripts/predict/report.py                                       # 9. this report\n"
    "```")
add("\nSteps 3–4 write `.cache/predict/tuned-2024.json`; steps 5–8 read it.")

add("\n## 8. Known limits\n")
add("- Robot changes between events only show up once a team plays again.\n"
    "- Bonus-RP chances (2025–26) were fitted on the season's earliest 20% of matches (bonuses didn't exist before).\n"
    "- Alliance declines and 3-team championship alliances aren't modelled.\n"
    "- An event's award line-up (which awards exist) is taken as known; winners are not.\n"
    "- 2026–27 (BIOBUZZ) rules aren't published; the 2025–26 points system is assumed until they are.")

os.makedirs("docs/predict", exist_ok=True)
with open("docs/predict/backtest-report.md", "w", encoding="utf-8") as f:
    f.write("\n".join(L) + "\n")
print("wrote docs/predict/backtest-report.md")
