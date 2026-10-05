# Predict — back-test report (research phase)

All numbers below come from replaying real seasons in time order: every prediction uses only data that existed before it. Settings were tuned on **2024–25** and locked; **2025–26** is the test season. Data: FTC Scout (all 2022–2026 matches, 5,175 events) and the FIRST Events API (official advancement lists, points breakdowns and alliance selections for 1,265 advancing events).

## 1. Single-match predictions (2025–26 test, 37,395 matches)

| Model | Accuracy | Brier ↓ | Calibration error ↓ |
|---|---|---|---|
| Coin flip | — | 0.248 | — |
| Last-event OPR (baseline) | 65.6% | 0.208 | 0.030 |
| Season-average score (baseline, live) | 71.5% | 0.188 | 0.034 |
| **Rating — frozen at event start** | 68.7% | 0.199 | 0.017 |
| **Rating — live** | 72.7% | 0.179 | 0.014 |

Score error (MAE) 27.95 pts, bias -2.14 pts. The 80% score range covers 83%. Accuracy rises from 65% in a team's first match of the season to 75% after 10+ matches.

Score uncertainty (σ = a + b·mean, plus each robot's rating uncertainty) was refitted on 2024–25 by likelihood so score ranges are honest; predictions made from an event-start snapshot add extra per-robot variance (500 pts², also fitted on 2024–25) because a team's level moves during an event. These were fitted after the first 2025–26 test run, so the 2025–26 numbers here are a second look at the test season.

## 2. Whole-event advancement odds (2025–26 test, 508 events, 10,900 team-events)

Awards are predicted from team history (nothing about the event's results is known). 1,000 simulations per event and starting point.

| Starting point | Brier ↓ | Calibration error ↓ | Matches only (no awards) |
|---|---|---|---|
| Before the event | 0.129 | 0.016 | 0.134 / 0.017 |
| After quals | 0.086 | 0.012 | 0.096 / 0.033 |
| After alliance selection | 0.064 | 0.010 | 0.077 / 0.043 |
| Naive: top-ranked eligible teams advance (needs quals results) | 0.151 | 0.151 | |

Calibration before the event (predicted → actual): 5%→5%, 14%→13%, 25%→23%, 34%→33%, 45%→49%, 55%→58%, 64%→74%, 75%→76%, 85%→86%, 97%→96%.

## 3. Partner scenarios ("if we pick…")

Each real alliance was simulated from the end of quals with its actual pairing forced, then compared with what happened. Knowing the partner should beat the general after-quals odds, which average over every possible partner.

| Prediction | With the real partner forced | General after-quals odds |
|---|---|---|
| Alliance wins the event (2,550) | Brier 0.072, calibration error 0.024 | Brier 0.085, calibration error 0.057 |
| Captain advances (2,289) | Brier 0.127, calibration error 0.036 | Brier 0.129, calibration error 0.022 |
| First pick advances (2,321) | Brier 0.125, calibration error 0.039 | — |

## 4. Components

- **Alliance selection:** captains pick by a softmax over strength and rank (τ=18, rank weight 3, fitted on 2024–25). The real first pick was in the model's top 3 for **70%** of 2,072 picks. Declines aren't recorded anywhere, so they aren't modelled.
- **Quals ranks (before the event):** mean error 5.14 places; the 10–90% range contains the real rank 86% of the time.
- **Awards (2025–26 test):** P(award worth ≥12 pts) Brier 0.1696 vs 0.2119 for a team-agnostic rate; Inspire 1st 0.0319 vs 0.036; any Inspire 0.0676 vs 0.0849. Inputs: past Inspire / judged awards (decay 0.4 per season), awards earlier this season, robot strength. One judged award per team per event.

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
 "b": 0.21,
 "preExtra": 500
}
```

## 7. Known limits

- Robot changes between events only show up once a team plays again.
- Bonus-RP chances (2025–26) were fitted on the season's earliest 20% of matches (bonuses didn't exist before).
- Alliance declines and 3-team championship alliances aren't modelled.
- An event's award line-up (which awards exist) is taken as known; winners are not.
- 2026–27 (BIOBUZZ) rules aren't published; the 2025–26 points system is assumed until they are.
