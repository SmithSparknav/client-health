import { createDataAdapter } from "./data-adapter.js";
import { TIERS, calculateDashboard, display } from "./metrics.js";
import {
  calculateClientPulse, clearSnapshot, loadPublishedSnapshot, loadSnapshot, parseArReport, parseCalendar,
  parseOpenTickets, parseTicketVolume, saveSnapshot
} from "./importer.js";
import {
  append, buildTableHead, el, emptyState, metricCard, populateSelect,
  portfolioRow, renderDistribution, renderMetricGrid, renderSimpleRows,
  statusPill, tierPanel, tierPill
} from "./ui.js";

const PAGE_SIZE = 25;
let currentPage = 1;
let dashboardData;
let calculations;
let importedSnapshot;

const $ = selector => document.querySelector(selector);
const formatDate = value => {
  if (!value) return "No Data";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
};

function renderHeader() {
  $("#reporting-period").textContent = dashboardData.metrics.reportingPeriod;
  $("#last-refresh").textContent = formatDate(dashboardData.metrics.lastDataRefresh);
  $("#header-client-count").textContent = `${calculations.clients.length} active clients`;
  $("#header-tier-coverage").textContent = `${calculations.assignedCount} assigned / ${calculations.byTier.Unassigned.length} unassigned`;
}

function healthClients() {
  return calculations.clients.map(client => ({ ...client, health: importedSnapshot?.clients?.[client.name] || null }));
}

function healthSummary() {
  const rows = healthClients().filter(client => client.health);
  const counts = { "At Risk": 0, Watch: 0, Healthy: 0, "No Data": calculations.clients.length - rows.length };
  rows.forEach(client => { counts[client.health.band] = (counts[client.health.band] || 0) + 1; });
  const scores = rows.map(client => client.health.score).filter(Number.isFinite);
  const bookScore = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
  const provisional = rows.some(client => client.health.scoreStatus === "Provisional");
  return { rows, counts, bookScore, provisional };
}

function renderPrimaryMetrics() {
  const portfolio = calculations.portfolio;
  const health = healthSummary();
  renderMetricGrid($("#primary-metrics"), [
    { label: "Active clients", value: calculations.clients.length, context: "Current portfolio", tone: "primary" },
    { label: "Book health", value: health.bookScore, context: health.bookScore === null ? "Upload weekly sources" : health.provisional ? "Provisional - source review" : "ClientPulse v1" },
    { label: "Overall contact rate", value: portfolio.contactRate, context: dashboardData.metrics.reportingPeriod, tone: "empty" },
    { label: "Retention", value: portfolio.retention, context: dashboardData.metrics.reportingPeriod, tone: "empty" },
    { label: "Churn", value: portfolio.churn, context: dashboardData.metrics.reportingPeriod, tone: "empty" },
    { label: "NPS", value: portfolio.nps, context: dashboardData.metrics.reportingPeriod, tone: "empty" },
    { label: "CSAT", value: portfolio.csat, context: dashboardData.metrics.reportingPeriod, tone: "empty" },
    { label: "Survey response rate", value: portfolio.responseRate, context: `${portfolio.responded} of ${portfolio.count} clients`, tone: "neutral" }
  ]);
}

function renderHealth() {
  const summary = healthSummary();
  const controls = $(".health-controls");
  const grid = $("#health-cards");
  const overview = $("#health-overview");
  overview.replaceChildren();
  append(overview, "p", "panel-label", "BOOK HEALTH SCORE");
  append(overview, "strong", "health-overview__score", summary.bookScore === null ? "No Data" : String(summary.bookScore));
  append(overview, "span", `health-band health-band--${summary.bookScore === null ? "no-data" : summary.bookScore >= 85 ? "healthy" : summary.bookScore >= 70 ? "watch" : "at-risk"}`,
    summary.bookScore === null ? "Upload weekly sources" : summary.provisional ? "PROVISIONAL" : summary.bookScore >= 85 ? "HEALTHY" : summary.bookScore >= 70 ? "WATCH" : "AT RISK");
  append(overview, "p", "panel-copy", summary.provisional
    ? "Calculated with the original ClientPulse model. The Open Tickets source triggered a completeness warning, so scores are provisional."
    : summary.bookScore === null ? "Upload the AR, Open Tickets, and Ticket Volume reports in the Data Hub." : "Calculated from the validated weekly source set.");
  renderMetricGrid($("#health-summary"), [
    { label: "At Risk", value: summary.counts["At Risk"], context: "0-69", tone: "risk" },
    { label: "Watch", value: summary.counts.Watch, context: "70-84", tone: "watch" },
    { label: "Healthy", value: summary.counts.Healthy, context: "85-100", tone: "healthy" },
    { label: "No Data", value: summary.counts["No Data"], context: "Source coverage", tone: "neutral" }
  ]);

  // Keep the executive view quiet until a weekly source set has been processed.
  // The master portfolio remains available in the Client Portfolio section.
  if (!summary.rows.length) {
    controls.hidden = true;
    grid.replaceChildren(emptyState(
      "Client health is ready for this week's reports",
      "Upload the AR aging, Open Tickets, and Ticket Volume files in the Data Hub. ClientPulse will calculate all 175 clients automatically."
    ));
    grid.classList.add("health-card-grid--empty");
    return;
  }

  controls.hidden = false;
  grid.classList.remove("health-card-grid--empty");

  const query = $("#health-search").value.trim().toLocaleLowerCase();
  const filter = $("#health-filter").value;
  const rows = healthClients().filter(client => {
    const band = client.health?.band || "No Data";
    return (!query || client.name.toLocaleLowerCase().includes(query)) && (filter === "All health states" || band === filter);
  });
  $("#health-result-count").textContent = `${rows.length} of ${calculations.clients.length} clients`;
  grid.replaceChildren();
  rows.forEach(client => {
    const health = client.health;
    const card = append(grid, "article", `health-card health-card--${health ? health.band.toLocaleLowerCase().replaceAll(" ", "-") : "no-data"}`);
    const top = append(card, "div", "health-card__top");
    append(top, "strong", "", client.name);
    append(top, "span", "health-card__score", health ? String(health.score) : "—");
    append(card, "span", `health-band health-band--${health ? health.band.toLocaleLowerCase().replaceAll(" ", "-") : "no-data"}`, health?.band || "No Data");
    if (!health) {
      append(card, "p", "health-card__reason", "Upload verified weekly source reports to calculate this client.");
      return;
    }
    const metrics = append(card, "dl", "health-card__pillars");
    [["Service", health.pillars.serviceResponsiveness, 40], ["Support", health.pillars.supportDemand, 30], ["Payment", health.pillars.paymentHealth, 20], ["Engagement", health.pillars.engagement, 10]].forEach(([label, value, max]) => {
      const row = append(metrics, "div", ""); append(row, "dt", "", label); append(row, "dd", "", `${value}/${max}`);
    });
    append(card, "p", "health-card__reason", `${health.tiering?.tier || "Tier Pending"} · tier score ${health.tiering?.tierScore ?? "No Data"} · ${health.tickets.openCount} open · oldest ${health.tickets.oldestOpenAgeDays ?? "none"} days · AR ${health.ar.bucket}${health.scoreStatus === "Provisional" ? " · Provisional" : ""}`);
  });
}

function renderContactPerformance() {
  const portfolio = calculations.portfolio;
  const overview = $("#contact-overview");
  overview.replaceChildren();
  append(overview, "p", "panel-label", "OVERALL CONTACT RATE");
  append(overview, "strong", "contact-overview__value", portfolio.contactRate);
  append(overview, "p", "panel-copy", "Awaiting assigned tiers and a production qualifying-contact ledger.");
  const tierList = append(overview, "div", "contact-tier-list");
  TIERS.forEach(tier => {
    const row = append(tierList, "div", "contact-tier-list__row");
    append(row, "span", "", tier);
    append(row, "strong", "", calculations.tierMetrics[tier].contactRate);
  });
  renderMetricGrid($("#contact-summary"), [
    { label: "Expected contacts", value: display(portfolio.expected), context: dashboardData.metrics.reportingPeriod },
    { label: "Completed contacts", value: display(portfolio.completed), context: dashboardData.metrics.reportingPeriod },
    { label: "Additional meetings", value: display(portfolio.additionalMeetings), context: "Above required minimum" },
    { label: "Clients on cadence", value: "No Data", context: "Contact ledger required" },
    { label: "Behind cadence", value: "No Data", context: "Contact ledger required" },
    { label: "Clients overdue", value: display(portfolio.overdue), context: "Objective due dates only" }
  ]);
}

function renderTierPerformance() {
  const counts = Object.fromEntries(TIERS.map(tier => [tier, calculations.byTier[tier].length]));
  const method = $("#tier-method");
  method.replaceChildren();
  if (importedSnapshot?.tieringModel) {
    append(method, "strong", "", "Available Data Tier Score v1");
    append(method, "p", "", "Financial exposure is ranked from total outstanding AR and weighted 54%. Ticket volume is ranked from the uploaded reporting period and weighted 46%. Clients are then split into top, middle, and bottom thirds. This model uses the data currently available and can expand when better revenue, size, or strategic-value data becomes available.");
  } else {
    append(method, "strong", "", "Tier calculation pending");
    append(method, "p", "", "Upload the three weekly source reports in the Data Hub to calculate the available-data tier score.");
  }
  renderDistribution($("#tier-distribution"), counts, calculations.clients.length);
  $("#tier-panels").replaceChildren(...TIERS.map(tier => tierPanel(tier, calculations.tierMetrics[tier])));
}

function renderAttention() {
  renderMetricGrid($("#attention-summary"), [
    { label: "Contacts overdue", value: display(calculations.portfolio.overdue), context: "No contact ledger", tone: "attention" },
    { label: "Behind cadence", value: "No Data", context: "Cadence not calculable", tone: "attention" },
    { label: "Tier assignments needed", value: calculations.byTier.Unassigned.length, context: "Current tier is Unassigned", tone: "attention" },
    { label: "Survey follow-ups", value: calculations.surveyFollowupCount, context: dashboardData.metrics.reportingPeriod, tone: "attention" },
    { label: "Client ID reviews", value: calculations.idReviewCount, context: "Registry reconciliation", tone: "attention" },
    { label: "Churned this period", value: "No Data", context: "Lifecycle history missing", tone: "attention" }
  ]);
  $("#tier-assignment-count").textContent = `${calculations.byTier.Unassigned.length} clients`;
  renderSimpleRows($("#tier-assignment-body"), calculations.byTier.Unassigned, [
    { key: "name", className: "client-name" },
    { render: client => client.clientId || "Needs Client ID Review" },
    { render: client => tierPill(client.tier) },
    { render: client => statusPill(client.clientStatus, client.clientStatus === "Active" ? "active" : "review") }
  ]);
}

function renderUpcoming() {
  const contacts = dashboardData.contacts.contacts
    .filter(contact => contact.nextContactDue)
    .sort((a, b) => new Date(a.nextContactDue) - new Date(b.nextContactDue));
  const container = $("#upcoming-contacts");
  container.replaceChildren();
  if (!contacts.length) {
    container.appendChild(emptyState("No qualifying contact schedule available", "Next-contact dates require a current tier, the applicable cadence anchor, and reliable relationship-meeting history."));
  }
}

function renderSurvey() {
  const portfolio = calculations.portfolio;
  renderMetricGrid($("#survey-summary"), [
    { label: "Eligible clients", value: portfolio.count, context: dashboardData.metrics.reportingPeriod },
    { label: "Clients responded", value: portfolio.responded, context: dashboardData.metrics.reportingPeriod },
    { label: "Clients not responded", value: portfolio.count - portfolio.responded, context: dashboardData.metrics.reportingPeriod },
    { label: "Response rate", value: portfolio.responseRate, context: dashboardData.metrics.reportingPeriod },
    { label: "Current NPS", value: portfolio.nps, context: "Valid responses only" },
    { label: "Current CSAT", value: portfolio.csat, context: "Existing survey formula" }
  ]);
  const strip = $("#survey-tier-rates");
  strip.replaceChildren();
  ["Tier 1", "Tier 2", "Tier 3"].forEach(tier => {
    const item = append(strip, "div", "response-strip__item");
    append(item, "span", "", `${tier} response rate`);
    append(item, "strong", "", calculations.byTier[tier].length ? calculations.tierMetrics[tier].responseRate : "No Data");
  });
}

const portfolioHeaders = ["Client", "Client ID", "Tier", "Health Score", "Health Band", "AR Bucket", "Open Tickets", "Oldest Ticket", "Client Status", "Retention Status", "Latest NPS", "NPS Classification", "Latest CSAT", "Contacts Expected", "Contacts Completed", "Additional Meetings", "Contact Rate", "Last Contact", "Next Contact Due", "Overdue", "Last Survey", "Follow-Up Needed"];

function filteredClients() {
  const query = $("#client-search").value.trim().toLocaleLowerCase();
  const tier = $("#tier-filter").value;
  const status = $("#status-filter").value;
  const overdue = $("#overdue-filter").value;
  const followup = $("#followup-filter").value;
  return calculations.clients.filter(client => {
    const matchesQuery = !query || `${client.name} ${client.clientId}`.toLocaleLowerCase().includes(query);
    const matchesTier = tier === "All tiers" || client.tier === tier;
    const matchesStatus = status === "All statuses" || client.clientStatus === status;
    const matchesOverdue = overdue === "All overdue states" || String(client.overdue) === overdue;
    const followupValue = client.followUpNeeded || (client.lastSurvey ? "No" : "Yes - survey");
    const matchesFollowup = followup === "All follow-up states" || (followup === "Follow-up needed" ? followupValue !== "No" : followupValue === "No");
    return matchesQuery && matchesTier && matchesStatus && matchesOverdue && matchesFollowup;
  });
}

function renderPortfolio() {
  const rows = filteredClients();
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  $("#portfolio-result-count").textContent = `${rows.length} of ${calculations.clients.length} clients`;
  const tbody = $("#portfolio-body");
  tbody.replaceChildren();
  pageRows.forEach(client => {
    const health = importedSnapshot?.clients?.[client.name];
    const tr = append(tbody, "tr");
    const values = portfolioRow(client);
    values.splice(3, 0, health?.score ?? "No Data", health?.band || "No Data", health?.ar?.bucket || "No Data", health?.tickets?.openCount ?? "No Data", health?.tickets?.oldestOpenAgeDays ?? "No Data");
    values.forEach((value, index) => {
      const td = append(tr, "td", index === 0 ? "client-name" : "");
      if (index === 2) td.appendChild(tierPill(value));
      else if (index === 4) td.appendChild(statusPill(value, value.toLocaleLowerCase().replaceAll(" ", "-")));
      else if (index === 8) td.appendChild(statusPill(value, value === "Active" ? "active" : "review"));
      else td.textContent = value;
    });
  });
  const pagination = $("#portfolio-pagination");
  pagination.replaceChildren();
  const previous = append(pagination, "button", "button button--secondary", "Previous");
  previous.disabled = currentPage === 1;
  previous.addEventListener("click", () => { currentPage -= 1; renderPortfolio(); });
  append(pagination, "span", "", `Page ${currentPage} of ${totalPages}`);
  const next = append(pagination, "button", "button button--secondary", "Next");
  next.disabled = currentPage === totalPages;
  next.addEventListener("click", () => { currentPage += 1; renderPortfolio(); });
}

function setupPortfolioControls() {
  populateSelect($("#tier-filter"), TIERS, "All tiers");
  populateSelect($("#status-filter"), [...new Set(calculations.clients.map(client => client.clientStatus))].sort(), "All statuses");
  populateSelect($("#overdue-filter"), ["true", "false"], "All overdue states");
  populateSelect($("#followup-filter"), ["Follow-up needed", "No follow-up"], "All follow-up states");
  ["#client-search", "#tier-filter", "#status-filter", "#overdue-filter", "#followup-filter"].forEach(selector => {
    $(selector).addEventListener("input", () => { currentPage = 1; renderPortfolio(); });
  });
  buildTableHead($("#portfolio-head"), portfolioHeaders);
  renderPortfolio();
}

function renderTrends() {
  const grid = $("#trend-grid");
  grid.replaceChildren();
  ["Contact rate", "Retention", "Churn", "NPS", "CSAT", "Survey response rate"].forEach(metric => {
    const series = dashboardData.trends.series[metric] || [];
    if (series.length < 2) {
      const card = append(grid, "article", "trend-empty");
      append(card, "span", "", metric);
      append(card, "strong", "", "Awaiting Historical Data");
      append(card, "p", "", "No verified prior-period series available.");
    }
  });
}

function renderCalendar() {
  const events = importedSnapshot?.calendarEvents || [];
  const now = new Date();
  const upcoming = events.filter(event => new Date(event.start) >= now).sort((a, b) => new Date(a.start) - new Date(b.start));
  renderMetricGrid($("#calendar-summary"), [
    { label: "Imported events", value: events.length, context: importedSnapshot?.calendarSource?.fileName || "No calendar imported" },
    { label: "Client candidates", value: events.filter(event => event.clientName).length, context: "Name-matched for review" },
    { label: "Upcoming", value: upcoming.length, context: "Future calendar events" }
  ]);
  const container = $("#calendar-events");
  container.replaceChildren();
  if (!events.length) {
    container.appendChild(emptyState("No calendar source imported", "Add an Outlook ICS or CSV export in the Data Hub. Imported events remain candidates and do not count toward Contact Rate."));
    return;
  }
  upcoming.slice(0, 30).forEach(event => {
    const row = append(container, "div", "calendar-row");
    const date = append(row, "time", "calendar-row__date", formatDate(event.start));
    date.dateTime = event.start;
    const copy = append(row, "div", "calendar-row__copy");
    append(copy, "strong", "", event.subject);
    append(copy, "span", "", event.clientName ? `${event.clientName} · ${event.qualification}` : "Unmatched calendar event");
    append(row, "span", "status-pill status-pill--review", event.clientName ? "Candidate" : "Review");
  });
}

function renderQuality() {
  const validation = calculations.validation;
  const source = importedSnapshot?.sources;
  renderMetricGrid($("#quality-summary"), [
    { label: "Client population", value: `${validation.rowCount} / ${validation.expectedPopulation}`, context: validation.rowCount === validation.expectedPopulation ? "Reconciled" : "Needs Review", tone: "quality" },
    { label: "Unique clients", value: `${validation.uniqueCount} / ${validation.rowCount}`, context: validation.duplicateCount ? "Needs Review" : "Reconciled", tone: "quality" },
    { label: "Valid tier values", value: `${validation.rowCount - validation.invalidTierCount} / ${validation.rowCount}`, context: validation.invalidTierCount ? "Needs Review" : "Reconciled", tone: "quality" },
    { label: "Client IDs matched", value: calculations.idMatchedCount, context: "Registry coverage", tone: "quality" },
    { label: "Tier assignments", value: calculations.assignedCount, context: `${calculations.byTier.Unassigned.length} unassigned`, tone: "quality" },
    { label: "Health source set", value: importedSnapshot ? "Loaded" : "No Data", context: importedSnapshot ? `${source.ar.asOf} AR · ${source.openTickets.rowCount} open rows` : "Three weekly files required", tone: "quality" },
    { label: "Qualifying contact ledger", value: "No Data", context: "Required for cadence metrics", tone: "quality" }
  ]);
}

function renderImportStatus() {
  const container = $("#import-status");
  container.replaceChildren();
  if (!importedSnapshot) {
    append(container, "p", "import-message import-message--neutral", "No local weekly source snapshot has been calculated yet.");
    return;
  }
  const message = append(container, "div", `import-message ${importedSnapshot.warnings.length ? "import-message--warning" : "import-message--success"}`);
  append(message, "strong", "", importedSnapshot.warnings.length ? "Snapshot calculated with review items" : "Weekly snapshot validated and calculated");
  append(message, "p", "", `AR ${importedSnapshot.sources.ar.asOf} · ${importedSnapshot.sources.openTickets.rowCount} open-ticket rows · ${importedSnapshot.sources.ticketVolume.rowCount} volume rows · saved locally ${formatDate(importedSnapshot.generatedAt)}.`);
  importedSnapshot.warnings.forEach(warning => append(message, "p", "", warning));
  const unmatched = [...new Set(Object.values(importedSnapshot.exceptions).flat())];
  if (unmatched.length) append(message, "p", "", `Unmatched source names (${unmatched.length}): ${unmatched.join(", ")}`);
}

function setupDataHub() {
  $("#calculate-health").addEventListener("click", async () => {
    const button = $("#calculate-health");
    const status = $("#import-status");
    const arFile = $("#ar-file").files[0];
    const openFile = $("#open-ticket-file").files[0];
    const volumeFile = $("#ticket-volume-file").files[0];
    if (!arFile || !openFile || !volumeFile) {
      status.innerHTML = '<p class="import-message import-message--warning">Select the AR Aging, Open Tickets, and Ticket Volume files before calculating.</p>';
      return;
    }
    button.disabled = true;
    button.textContent = "Validating…";
    try {
      if (!window.XLSX) throw new Error("Spreadsheet parser could not be loaded. Check the internet connection and refresh the dashboard.");
      const [ar, openTickets, ticketVolume] = await Promise.all([parseArReport(arFile), parseOpenTickets(openFile), parseTicketVolume(volumeFile)]);
      const snapshot = calculateClientPulse({ masterClients: dashboardData.clients.clients, ar, openTickets, ticketVolume });
      const calendarFile = $("#calendar-file").files[0];
      if (calendarFile) {
        snapshot.calendarEvents = await parseCalendar(calendarFile, dashboardData.clients.clients);
        snapshot.calendarSource = { fileName: calendarFile.name };
      }
      saveSnapshot(snapshot);
      window.location.reload();
    } catch (error) {
      status.innerHTML = "";
      const message = append(status, "div", "import-message import-message--error");
      append(message, "strong", "", "Import stopped");
      append(message, "p", "", error.message);
      button.disabled = false;
      button.textContent = "Validate and calculate";
    }
  });
  $("#clear-import").addEventListener("click", () => { clearSnapshot(); window.location.reload(); });
}

function setupNavigation() {
  const button = $("#menu-button");
  const nav = $(".primary-nav");
  const validViews = new Set(["overview", "data-hub", "client-health", "contact-performance", "survey-performance", "client-portfolio", "calendar"]);

  const activateView = () => {
    const requested = window.location.hash.slice(1);
    const view = validViews.has(requested) ? requested : "overview";
    document.querySelectorAll("[data-view]").forEach(section => {
      section.hidden = section.dataset.view !== view;
    });
    nav.querySelectorAll("a").forEach(link => {
      const active = link.getAttribute("href") === `#${view}`;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    document.body.dataset.activeView = view;
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  button.addEventListener("click", () => {
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!expanded));
    nav.classList.toggle("is-open", !expanded);
  });
  nav.addEventListener("click", event => {
    if (event.target.matches("a")) {
      nav.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
    }
  });
  window.addEventListener("hashchange", activateView);
  activateView();
  return activateView;
}

async function initialize() {
  const activateView = setupNavigation();
  try {
    dashboardData = await createDataAdapter().load();
    importedSnapshot = loadSnapshot() || await loadPublishedSnapshot();
    if (importedSnapshot?.clients) {
      dashboardData.clients.clients.forEach(client => {
        const snapshotTiering = importedSnapshot.clients[client.name]?.tiering;
        const calculatedTier = snapshotTiering?.tier;
        if (calculatedTier) {
          client.tier = calculatedTier;
          client.tierSource = snapshotTiering.tierSource || "Available Data Tier Score v1";
        }
      });
    }
    calculations = calculateDashboard(dashboardData);
    if (!calculations.validation.valid) throw new Error("Client data failed the 175-client uniqueness or tier validation check.");
    renderHeader();
    renderPrimaryMetrics();
    renderHealth();
    renderContactPerformance();
    renderTierPerformance();
    renderAttention();
    renderUpcoming();
    renderSurvey();
    setupPortfolioControls();
    renderTrends();
    renderCalendar();
    renderQuality();
    renderImportStatus();
    setupDataHub();
    ["#health-search", "#health-filter"].forEach(selector => {
      $(selector).addEventListener("input", renderHealth);
      $(selector).addEventListener("change", renderHealth);
    });
    $("#loading-state").hidden = true;
    $("#dashboard").hidden = false;
    activateView();
  } catch (error) {
    $("#loading-state").hidden = true;
    const alert = $("#error-state");
    alert.textContent = window.location.protocol === "file:"
      ? "This dashboard must be opened through its local web server. Double-click start-dashboard.command in the Web Dashboard folder, then use the browser window it opens."
      : `Dashboard data could not be loaded. ${error.message}`;
    alert.hidden = false;
  }
}

initialize();
