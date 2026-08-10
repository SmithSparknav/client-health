# Security and Publication Rules

This dashboard includes customer-identifying information. GitHub Pages does not provide application-level authentication by itself.

## Potentially publishable after approval

- Aggregated client counts
- Aggregated tier distribution
- Aggregated contact, retention, churn, NPS, CSAT, and response metrics
- Reporting period and refresh timestamp
- Non-sensitive methodology and data-quality status

## Restrict or exclude from a public site

- Client names and Client IDs
- Individual client tier assignments
- Contact dates and meeting details
- Survey response details or comments
- Churn reasons
- Follow-up queues
- Account Manager notes
- Personal contact information
- Internal operational checklist fields

## Never place in the repository or browser

- Microsoft credentials
- API keys or secrets
- OAuth access or refresh tokens
- Power Automate secret URLs
- SharePoint/OneDrive connection strings
- Raw authentication payloads
- Private webhook endpoints

Credentials and tokens must never be placed in browser code. Weekly spreadsheets may be selected through the Data Hub because processing is local; the application must not transmit their contents. The normalized local snapshot can contain sensitive aggregates such as AR bucket and amount, so it is suitable only for a trusted device and browser profile.

The Excel parser is pinned to an exact URL and protected by Subresource Integrity. A restricted production build should vendor and security-review that dependency so spreadsheet processing has no runtime third-party dependency.

## Deployment choices

### Public GitHub Pages

Publish only a separately approved aggregate dataset. Remove client-level tables and identifying fields before deployment.

### Restricted leadership dashboard

Use an approved authenticated host or access-control layer. Confirm that the chosen GitHub plan and organization configuration actually restricts Pages access; repository privacy alone is not sufficient evidence.

### Safer future architecture

Serve the static interface through an authenticated platform and load sanitized data from a secure same-origin API. Keep Microsoft access tokens and data-source credentials exclusively on the server side.

No production deployment should occur until data classification, intended audience, repository visibility, and access controls are approved.
