# SparkNav Value Score Tier Model

The approved source is `SparkNav_Client_Tier_List_1.pdf`, dated August 28, 2026. The source contains 150 unique client rows: 38 Tier 1, 71 Tier 2, and 41 Tier 3.

## Assignment rule

Tier is determined from monthly average revenue using a log-scaled Value Score normalized across the client book.

- Tier 1: Value Score 0.75-1.00, or an approved automatic leadership override.
- Tier 2: Value Score 0.50-0.74.
- Tier 3: Value Score 0.00-0.49.

Support Load is displayed separately for cost-to-serve review. It does not change the tier.

## Reconciliation to the dashboard population

- 145 source clients matched the established 175-client master population.
- 30 master-population clients were not listed and remain Unassigned.
- Five source clients did not match the master population and were not added automatically: Carolina Construction Service, Promera LLC, Carroll Jenkins, Williams Buick GMC, and Wolf Pond Baptist Church.

See `data/tier-review.json` for the machine-readable reconciliation. Tiering and ClientPulse health scoring remain separate models.
