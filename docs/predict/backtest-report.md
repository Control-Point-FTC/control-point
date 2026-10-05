# Predict — back-test report (research phase)

All numbers below are from replaying real seasons in time order: every prediction uses only data that existed before it. Settings were tuned on **2024–25** and locked; **2025–26** was scored once as the test. Data: FTC Scout (all 2022–2026 matches, 5,175 events) and the FIRST Events API (official advancement lists, points breakdowns and alliance selections for 1,265 advancing events).

## 1. Single-match predictions (2025–26 test, 37,354 matches)

| Model | Accuracy | Brier ↓ | Calibration error ↓ |
|---|---|---|---|
| Coin flip | — | 0.248 | — |
| Last-event OPR (baseline) | 65.4% | 0.209 | 0.030 |
| Season-average score (baseline, live) | 71.1% | 0.190 | 0.031 |
| **Rating — frozen at event start** | 68.5% | 0.200 | 0.019 |
| **Rating — live** | 72.2% | 0.181 | 0.019 |

Score error (MAE) 28.61 pts, bias -2.55 pts. The 80% score range covers 89% (slightly too wide). Accuracy rises from ~65% in a team's first match of the season to ~74% after 10+ matches.

## 2. Whole-event advancement odds (2025–26 test, 508 events, 10,900 team-events)

Awards are predicted from team history (nothing about the event's results is known). 1,000 simulations per event and starting point.

| Starting point | Brier ↓ | Calibration error ↓ | Matches-only (no awards) |
|---|---|---|---|
| Before the event | 0.129 | 0.011 | 0.134 / 0.015 |
| After quals | 0.087 | 0.010 | 0.098 / 0.032 |
| After alliance selection | 0.064 | 0.013 | 0.077 / 0.040 |
| Naive: top-ranked eligible teams advance (needs quals results) | 0.151 | 0.151 | |

Calibration before the event (predicted → actual): 5%→5%, 15%→16%, 25%→24%, 34%→34%, 45%→42%, 55%→56%, 65%→66%, 75%→73%, 85%→83%, 97%→93%.

## 3. Components

- **Alliance selection:** captains pick by a softmax over strength and rank (τ=25, rank weight 4, fitted on 2024–25). The real first pick was in the model's top 3 for **69%** of 2072 picks. Declines aren't recorded anywhere, so they aren't modelled.
- **Quals ranks (before the event):** mean error 5.11 places; the 10–90% range contains the real rank 82% of the time.
- **Awards (2025–26 test):** P(award worth ≥12 pts) Brier 0.169 vs 0.2119 for a team-agnostic rate; Inspire 1st 0.0319 vs 0.036; any Inspire 0.0677 vs 0.0849. Inputs: past Inspire / judged awards (decay 0.4 per season), awards earlier this season, robot strength. One judged award per team per event.

## 4. Rules (read off official data)

- 2025–26 advancement points = quals + alliance selection + playoffs + awards (1,786/1,786 totals). Quals: `ceil(erfinv((N−2R+2)/(1.07N))·7/erfinv(1/1.07) + 9)` (780/789; the 9 misses are a team-count mismatch at two events). Alliance: captain and 1st pick get 21 − alliance #. Playoffs 40/20/10/5. Awards: Inspire 60/30/15, other judged 12/6/3, only the highest counts; Dean's List 0.
- Ranking: 2025–26 RP = 3 win / 1 tie + movement, goal, pattern bonuses; tiebreak avg non-penalty score (99.7% of official ranks). 2024–25 RP = 2 win / 1 tie; tiebreak avg auto then avg endgame (99.8%).
- Alliances: ≤10 teams 2, ≤20 4, ≤40 6, else 8. Double-elimination brackets for 4/6/8 alliances with a grand-final rematch; 2 alliances play a best-of-3.

## 5. Tuned settings (2024–25)

```json
{
 "k0": 0.65,
 "n0": 10,
 "kMin": 0.25,
 "playoffWeight": 0.75,
 "rho1": 0.6,
 "rho2": 0.2,
 "rookieZ": -0.7,
 "uncKnown": 300,
 "uncRookie": 700,
 "uncDecay": 0.3,
 "uncMin": 10,
 "baseAlpha": 0.002,
 "growthPerWeek": 0.05,
 "growthMaxWeeks": 8,
 "a": 24,
 "b": 0.18
}
```

## 6. Known limits

- Robot changes between events only show up once a team plays again.
- Bonus-RP chances (2025–26) were fitted on the season's earliest 20% of matches (bonuses didn't exist before).
- Alliance declines and 3-team championship alliances aren't modelled.
- An event's award line-up (which awards exist) is taken as known; winners are not.
- 2026–27 (BIOBUZZ) rules aren't published; the 2025–26 points system is assumed until they are.
