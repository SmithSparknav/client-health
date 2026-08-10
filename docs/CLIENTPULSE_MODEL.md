# ClientPulse v1 Scoring Model

This dashboard preserves the documented historical ClientPulse calculation as a versioned model. The 175-client master list defines population; source spreadsheets provide weekly signals.

## Pillars

- Service Responsiveness: 40 points, based on oldest open-ticket age.
- Support Demand: 30 points, based on oldest open-ticket age. Priority and ticket volume do not currently affect this pillar.
- Payment Health: 20 points, based on the SeedSpark Accounting AR aging report and the invoicing/payment agreement in the applicable SLA.
- Engagement: 10 points, fixed at 10 in ClientPulse v1 until an approved engagement source replaces the default.

## Ticket-age scores

| Oldest open ticket | Service | Support |
|---|---:|---:|
| No open ticket | 40 | 30 |
| 0-4 days | 40 | 28 |
| 5-10 days | 34 | 28 |
| 11-20 days | 24 | 18 |
| 21-30 days | 12 | 10 |
| 31+ days | 4 | 5 |

The values above follow the confirmed historical Python implementation from the integration handoff. They differ from one earlier prose/table description; the implementation is therefore explicitly labeled v1 rather than an inferred new model.

## Payment Health

| AR state | Points | Overall-score cap |
|---|---:|---:|
| Current, 1-30, or not listed as overdue | 20 | None |
| 31-60 positive balance | 10 | 74 |
| 61-90 positive balance | 4 | 62 |
| 91+ positive balance | 0 | 50 |

The oldest positive aging bucket controls. Dollar amount is retained for internal context but never changes the score. Credits and negative balances do not trigger an overdue bucket. No materiality threshold is applied.

## Ticket caps

- Oldest ticket 30+ days: overall score capped at 69.
- Oldest ticket 21+ days: overall score capped at 79.

All applicable caps execute; the lowest resulting ceiling wins. Scores 85-100 are Healthy, 70-84 are Watch, and 0-69 are At Risk. The book score is the arithmetic mean rounded to the nearest integer.

## Data integrity

If the Open Tickets report appears truncated, the calculation is labeled Provisional and the warning is retained. Calendar events, welcome-email activity, operational checklist completion, and Ticket Volume never prove that an Account Management meeting occurred.
