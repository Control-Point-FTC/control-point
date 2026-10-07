# Predict — back-test report (research phase)

All numbers below come from replaying real seasons in time order: every prediction uses only data that existed before it. Settings were tuned on **2024–25** and locked; **2025–26** is the test season. Data: FTC Scout (all 2022–2026 matches, 5,175 events) and the FIRST Events API (official advancement lists, points breakdowns and alliance selections for 1,265 advancing events).

## 1. Single-match predictions (2025–26 test, 37,395 matches)

| Model | Accuracy | Brier ↓ | Calibration error ↓ |
|---|---|---|---|
| Coin flip | — | 0.248 | — |
| Last-event OPR (baseline) | 65.6% | 0.208 | 0.030 |
| Season-average score (baseline, live) | 71.5% | 0.188 | 0.034 |
| **Rating — frozen at event start** | 68.7% | 0.199 | 0.017 |
| **Rating — live** | 72.7% | 0.179 | 0.017 |

Score error (MAE) 27.95 pts, bias -2.14 pts. The 80% score range covers 82%. Accuracy rises from 65% in a team's first match of the season to 75% after 10+ matches.

Score uncertainty (σ = a + b·mean, plus each robot's rating uncertainty) was refitted on 2024–25 by likelihood so score ranges are honest; predictions made from an event-start snapshot add extra per-robot variance (500 pts², also fitted on 2024–25) because a team's level moves during an event. These were fitted after the first 2025–26 test run, so the 2025–26 numbers here are a second look at the test season.

## 2. Whole-event advancement odds (2025–26 test, 508 events, 10,900 team-events)

Awards are predicted from team history (nothing about the event's results is known). 1,000 simulations per event and starting point.

| Starting point | Brier ↓ | Calibration error ↓ | Matches only (no awards) |
|---|---|---|---|
| Before the event | 0.129 | 0.016 | 0.133 / 0.017 |
| After quals | 0.086 | 0.012 | 0.096 / 0.034 |
| After alliance selection | 0.064 | 0.010 | 0.077 / 0.044 |
| Naive: top-ranked eligible teams advance (needs quals results) | 0.151 | 0.151 | |

Calibration before the event (predicted → actual): 5%→4%, 14%→13%, 25%→23%, 34%→35%, 45%→50%, 55%→57%, 65%→73%, 75%→78%, 85%→84%, 97%→96%.

## 3. Partner scenarios ("if we pick…")

Each real alliance was simulated from the end of quals with its actual pairing forced, then compared with what happened. Knowing the partner should beat the general after-quals odds, which average over every possible partner.

| Prediction | With the real partner forced | General after-quals odds |
|---|---|---|
| Alliance wins the event (2,550) | Brier 0.072, calibration error 0.025 | Brier 0.086, calibration error 0.058 |
| Captain advances (2,289) | Brier 0.119, calibration error 0.022 | Brier 0.129, calibration error 0.019 |
| First pick advances (2,321) | Brier 0.119, calibration error 0.019 | — |

## 4. Components

- **Alliance selection:** captains pick by a softmax over strength and rank (τ=18, rank weight 3, fitted on 2024–25). The real first pick was in the model's top 3 for **70%** of 2,072 picks. Declines aren't recorded anywhere, so they aren't modelled.
- **Quals ranks (before the event):** mean error 5.13 places; the 10–90% range contains the real rank 86% of the time.
- **Awards (2025–26 test):** P(award worth ≥12 pts) Brier 0.1696 vs 0.2119 for a team-agnostic rate; Inspire 1st 0.0319 vs 0.036; any Inspire 0.0676 vs 0.0849. Inputs: past Inspire / judged awards (decay 0.4 per season), awards earlier this season, robot strength. One judged award per team per event.
- **Win-probability calibration:** Platt scaling (2-param sigmoid on logit(p), fitted by MLE on 2024–25) applied to P(red wins). Shipped values a=0.937, b=0.020. 2025–26 test: live Brier 0.1791→0.1789, ECE 0.0172→0.0105; pre-event accuracy 68.65%→68.78%. Monotonic, so ranking is preserved.

## 5. Rules (read off official data)

- 2025–26 advancement points = quals + alliance selection + playoffs + awards (1,786/1,786 totals). Quals: `ceil(erfinv((N−2R+2)/(1.07N))·7/erfinv(1/1.07) + 9)` (780/789; the 9 misses are a team-count mismatch at two events). Alliance: captain and 1st pick get 21 − alliance #. Playoffs 40/20/10/5. Awards: Inspire 60/30/15, other judged 12/6/3, only the highest counts; Dean's List 0.
- Ranking: 2025–26 RP = 3 win / 1 tie + movement, goal, pattern bonuses; tiebreak avg non-penalty score (99.7% of official ranks). 2024–25 RP = 2 win / 1 tie; tiebreak avg auto then avg endgame (99.8%).
- Alliances: ≤10 teams 2, ≤20 4, ≤40 6, else 8. Double-elimination brackets for 4/6/8 alliances with a grand-final rematch; 2 alliances play a best-of-3.

## 6. Tuned settings (2024–25)

```json
{
 "k0": 0.65,
 "n0": 10,
 "kMin": 0.33,
 "playoffWeight": 0.5,
 "rho1": 0.6,
 "rho2": 0.2,
 "rookieZ": -0.7,
 "uncKnown": 150,
 "uncRookie": 350,
 "uncDecay": 0.45,
 "uncMin": 10,
 "baseAlpha": 0.002,
 "growthPerWeek": 0.05,
 "growthMaxWeeks": 8,
 "a": 14,
 "b": 0.2,
 "preExtra": 500
}
```

## 7. How to reproduce

Run from the repo root (FIRST API credentials in `FTC_EVENTS_USERNAME` / `FTC_EVENTS_TOKEN` for step 2):

```bash
npx tsx scripts/predict/ingest.mts 2025 2024 2023 2022                 # 1. FTC Scout matches → .cache/predict/scout
npx tsx scripts/predict/ingest-first.mts 2025 2024                     # 2. FIRST advancement data → .cache/predict/first
npx tsx scripts/predict/tune.mts --tune 2024 --rounds 2                # 3. rating settings (2024–25)
npx tsx scripts/predict/fit-noise.mts --tune 2024                      # 4. score uncertainty a, b, preExtra (2024–25)
npx tsx scripts/predict/backtest-matches.mts --seasons 2022,2023,2024,2025 --report 2024,2025 \
  --params '<rating settings>' --noise '<a, b, preExtra>' --quiet --json .cache/predict/final-test.json   # 5. match test
npx tsx scripts/predict/backtest-events.mts --season 2024 --fit-pick --awards none --runs 50 --limit 1   # 6. pick model (2024–25)
npx tsx scripts/predict/fit-awards.mts                                  # 7. award model (fit 2024–25, test 2025–26)
npx tsx scripts/predict/backtest-events.mts --season 2025 --runs 1000 --awards model --partners   # 8. event test
npx tsx scripts/predict/backtest-events.mts --season 2025 --runs 1000 --awards none
python scripts/predict/report.py                                       # 9. this report
```

Steps 3–4 write `.cache/predict/tuned-2024.json`; steps 5–8 read it.

## 8. Known limits

- Robot changes between events only show up once a team plays again.
- Bonus-RP chances (2025–26) were fitted on the season's earliest 20% of matches (bonuses didn't exist before).
- Alliance declines and 3-team championship alliances aren't modelled (declines were tried and rejected: see §9).
- An event's award line-up (which awards exist) is taken as known; winners are not.
- 2026–27 (BIOBUZZ) rules aren't published; the 2025–26 points system is assumed until they are.

## 9. Tried and rejected

**Alliance declines** (Oct 2026). A team that would captain a later alliance if left unpicked may turn an invitation down. This was modelled as `captainAccept`, a factor on those teams' pick weight (`pickWeights` in `server/predict/sim.ts`; it defaults to 1, meaning no declines). The factor was fitted jointly with `tau` and `rankWeight` by pick log-likelihood on 2024–25.

- **2024–25 (fit):** the best model accepts 85% of invitations to future captains (`tau` 25, `rankWeight` 4). Log-likelihood is −4076.7 vs −4080.9 without declines over 2,072 picks. Top-3 hit rate is 68.9% vs 69.7%.
- **2025–26 (test, `--eval-pick`):** log-likelihood is −5080.2 vs **−4952.4** without declines over 2,540 picks.
- **2025–26 events** (1000 runs, award model, 508 events): every advancement number gets slightly worse. Brier goes from 0.1287 to 0.1290 before the event and from 0.0855 to 0.0866 after quals. P(picked) Brier goes from 0.1249 to 0.1268, and partner-scenario win Brier from 0.0719 to 0.0727.

The current pick model already fits the real picks' preference for strong, high-ranked teams; a decline factor only overfits. The related question of whether super-alliances are over-predicted points the other way at match level. On 2024–25, the strongest alliances score below their prediction in qualification matches (top tenth: −21 points, about −8%). In playoff matches, though, favourites win *more* often than predicted (84.8% predicted vs 89.9% actual for 80–90% favourites). So "soften stacked alliances" isn't supported by the data. A playoff-specific sharpening is a better lead, and it should be tested through `backtest-matches.mts` like everything else.

Reproduce: `npx tsx scripts/predict/backtest-events.mts --season 2024 --fit-pick --declines --awards none --runs 50 --limit 1 --pick-file .cache/predict/pick-2024-declines.json --out <file>`, then `--season 2025 --runs 1000 --awards model --partners --eval-pick --pick-file <either pick file> --out <file>`. Declines are opt-in (`--declines`, which requires an explicit `--pick-file`), so the shipped reproduction in §7 is unchanged.
