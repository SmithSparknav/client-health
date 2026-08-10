# Available Data Tier Score v1

The current dashboard tiers the full 175-client population with the two documented factors for which reliable weekly source data is presently available.

## Inputs

- Financial exposure: total outstanding AR balance from the Tuesday SeedSpark Accounting AR Aging report.
- Ticket volume: number of tickets in the uploaded Autotask Ticket Volume reporting period.

The original proposed weights were 35% Invoice Amount and 30% Ticket Volume, with 35% reserved for unavailable Client Size and Strategic Value inputs. To create a complete current-data score without inventing values, the two available weights are normalized:

- Financial exposure: `35 / 65 = 53.85%`
- Ticket volume: `30 / 65 = 46.15%`

## Calculation

Each factor is ranked from 1 through 10 against the current 175-client portfolio. Zero or absent activity receives rank 1. Positive values receive a rank based on their relative position among positive values.

```text
Available Tier Score =
  (Financial Exposure Rank x 53.85%)
  + (Ticket Volume Rank x 46.15%)
```

Clients are sorted by Available Tier Score, then financial rank, then ticket-volume rank, then canonical client name for a stable tie break.

- Tier 1: top third (59 clients in a 175-client population)
- Tier 2: middle third (58 clients)
- Tier 3: bottom third (58 clients)

## Interpretation

This tier score determines proactive Account Management cadence; it does not change service quality or ClientPulse health. Payment Health continues to use AR aging buckets and caps separately. When recurring-revenue, Client Size, or Strategic Value data becomes available, the model can be versioned and expanded without rewriting the dashboard.
