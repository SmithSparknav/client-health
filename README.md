# SparkNav Account Management Metrics Web Dashboard

Standalone leadership dashboard for the SparkNav Account Management portfolio. It is a static web application designed for GitHub Pages and other static hosts.

## Technology

- Semantic HTML
- Responsive CSS
- Native JavaScript modules
- Static JSON data adapter
- No application server, package manager, framework runtime, or client-side credentials
- Browser-local weekly spreadsheet intake for AR aging, open tickets, and ticket volume
- Optional Outlook calendar import through ICS, CSV, or XLSX

All paths are relative, so the dashboard works from a GitHub Pages repository subpath as well as a local web server.

## Local preview

On macOS, double-click `start-dashboard.command`. Keep its Terminal window open while using the dashboard. It starts the required local server and opens the dashboard automatically.

Alternatively, from the `Web Dashboard` directory run:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

Do not open `index.html` directly with a `file://` URL. Browsers block JSON module requests from local files; use the local server command above.

## Weekly ClientPulse update

1. Open **Data Hub**.
2. Select the current SeedSpark AR Aging report.
3. Select the current Autotask Open Tickets report.
4. Select the current Autotask Ticket Volume report.
5. Optionally select an Outlook ICS, CSV, or XLSX calendar export.
6. Choose **Validate and calculate**.

The three spreadsheets are parsed in the browser and are not sent to GitHub. The resulting normalized snapshot is stored only in that browser's local site storage. Clearing browser site data or selecting **Clear local snapshot** removes it.

The import validates source structure, reconciles names against the 175-client master population, calculates the documented ClientPulse v1 score, and reports unmatched names and potential report truncation. Calendar matches remain candidates and do not count as qualifying Account Management meetings.

Tier assignments come from the approved August 28, 2026 SparkNav Client Tier List. Its Value Score uses log-scaled monthly average revenue; Support Load is displayed separately and does not alter tier. Weekly imports refresh health inputs while preserving these approved tiers. Health scoring and tiering remain separate models.

The pinned SheetJS browser distribution is loaded with Subresource Integrity to parse Excel files. An internet connection is required for that parser unless it is vendored locally in a later restricted-hosting build.

## Development data refresh

The current development JSON is generated from the validated parent CSV:

```bash
python3 scripts/build_data.py
```

The script stops if the population is not exactly 175 unique clients or if any Tier value is outside:

- `Tier 1`
- `Tier 2`
- `Tier 3`
- `Unassigned`

For the static development workflow, regenerate and commit `data/clients.json` after approved CSV changes. The planned live adapter removes that manual publication step by loading sanitized current data from an approved endpoint at page load.

## GitHub Pages deployment

No deployment has been performed.

1. Create the intended GitHub repository and decide whether the customer-identifying data is appropriate for its visibility.
2. Commit the contents of this `Web Dashboard` folder to the repository root.
3. Push the `main` branch.
4. In GitHub, open **Settings → Pages**.
5. Under **Build and deployment**, choose **GitHub Actions**.
6. Open **Actions**, select **Deploy static dashboard to GitHub Pages**, and run the workflow, or push a reviewed change to `main`.
7. After the workflow succeeds, open the Pages URL shown by GitHub.

The included workflow publishes the static files without a build step.

## Repository visibility warning

GitHub Pages should be treated as public unless the selected GitHub plan and organization controls explicitly provide restricted Pages access. A private repository does not automatically guarantee a private Pages site in every plan/configuration. Review [docs/SECURITY.md](docs/SECURITY.md) before deployment.

## Documentation

- [Data architecture](docs/DATA_ARCHITECTURE.md)
- [Security and publication rules](docs/SECURITY.md)

## Branding

The dashboard uses the approved `assets/SparkNav_Logo_FullColor_Horizontal.png` asset in the application header, loading state, and footer. Preserve its aspect ratio and do not recolor, crop, stretch, or redraw it.
