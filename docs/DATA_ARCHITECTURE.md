# Data Architecture

## Current static development flow

```text
Validated Client Metrics Dataset.csv
  → scripts/build_data.py
  → data/clients.json
  → StaticJsonAdapter
  → metric calculations
  → reusable dashboard components
```

The HTML contains presentation structure only. Production metric values are loaded from JSON and calculated in JavaScript.

## Unified customer-success record

The 175-client master population remains the backbone. Weekly operational sources enrich those records; they never replace the population or silently create clients.

```text
175-client master population
  ├── Tier and production Client ID
  ├── AR aging → Payment Health
  ├── Open tickets → Service Responsiveness + Support Demand
  ├── Ticket volume → operational volume only
  ├── Qualifying AM contacts → cadence and Contact Rate
  ├── Survey results → NPS and CSAT
  ├── Lifecycle history → retention and churn
  └── Calendar events → scheduling candidates only
          ↓
  normalized in-browser snapshot
          ↓
  dashboard calculations and views
```

Each source retains its own `asOf` date and coverage state. A source name must reconcile to one canonical master client. Unmatched names remain in the exception report.

## Weekly spreadsheet intake

`assets/importer.js` recognizes report structure from column labels rather than filenames:

- AR Aging: Current, 1-30, 31-60, 61-90, and 91+ balances.
- Open Tickets: received date, ticket number, client, priority, and due date.
- Ticket Volume: ticket number, client, status, priority, and report period.

The legacy Autotask `.xls` export is HTML with an Excel extension and is parsed as an HTML table. Modern `.xlsx` files are parsed with a pinned, integrity-checked SheetJS distribution.

The importer creates a local schema-versioned snapshot. Raw ticket titles and spreadsheet rows are not persisted. Source aggregates, health pillars, exceptions, and optional calendar candidates are stored in browser-local site storage.

## Calendar boundary

Calendar import supports Outlook ICS and tabular exports. Client matching uses canonical names only. Imported events are labeled `Candidate - Needs Review`; they can populate the forward schedule but never increment completed qualifying meetings or Contact Rate. A future Microsoft Graph/Outlook adapter may replace file import after authentication and governance approval.

## ClientPulse scoring

The score engine is versioned as `ClientPulse v1`. Ticket Volume does not affect the current score. See `CLIENTPULSE_MODEL.md` for the calculation and caps.

Tiering is a separate calculation from health. `Available Data Tier Score v1` uses normalized AR financial exposure and Ticket Volume rankings to split the portfolio into thirds. See `TIERING_MODEL.md`.

## Data files

| File | Responsibility |
|---|---|
| `data/clients.json` | Current population, one current Tier per client, operational reference fields, and client-level metric fields when approved data exists |
| `data/metrics.json` | Reporting period, refresh timestamp, and future portfolio-level source measures |
| `data/surveys.json` | Sanitized survey responses or approved company-quarter results |
| `data/contacts.json` | Qualifying Account Management relationship meetings and due dates |
| `data/trends.json` | Verified historical series only |
| Browser-local snapshot | Weekly ClientPulse aggregates and optional calendar candidates; not committed |

`assets/data-adapter.js` is the replaceable boundary. UI components and metric calculations do not depend on Microsoft-specific implementation details.

## Planned production flow

```text
Microsoft Forms
  → Results Master / approved Microsoft data source
  → Power Automate validation and sanitization
  → protected JSON endpoint or approved static JSON publication
  → replacement dashboard data adapter
  → browser dashboard refresh on page load
```

The production bridge should:

1. Validate the 175-client population or its later approved replacement.
2. Enforce exactly one allowed current Tier per client.
3. Match records by stable Client ID where available.
4. Exclude test records and unmatched responses until reviewed.
5. Publish only approved dashboard fields.
6. include a trustworthy `lastDataRefresh` timestamp.
7. Return no credentials, tokens, connection strings, or raw authentication data.

## Dynamic tier behavior

Client membership is never written into tier components. The application groups the current `tier` value every time data loads. Changing one client from Tier 1 to Tier 2 therefore changes both tier counts, tier panels, distribution, filters, and tier-level aggregates while the client remains one record.

Current Tier is not historical tier membership. Add future history as a separate dated dataset, for example `tier-history.json`, without overwriting prior-period performance.

## Contact calculations

Contact Rate is:

```text
Completed Required Contacts / Expected Minimum Contacts × 100
```

The display is capped at 100%. Additional meetings are `max(completed - expected, 0)` and remain separate. Unassigned clients show `Tier Required`. Tier 2 expected contacts require the actual every-other-month cadence anchor rather than a forced equal quarterly value.

## Adapter replacement

To connect a live source later, implement an adapter with the same `load()` result shape as `StaticJsonAdapter`, then change only `createDataAdapter()`. No dashboard component needs to know whether data came from committed JSON, SharePoint, Power Automate, or a secured API.
