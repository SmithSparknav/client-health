import { TIERS, display } from "./metrics.js?v=20260904-1";

export const el = (tag, className = "", text = undefined) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

export const append = (parent, tag, className = "", text = undefined) => {
  const element = el(tag, className, text);
  parent.appendChild(element);
  return element;
};

export function metricCard({ label, value, context, tone = "neutral" }) {
  const card = el("article", `metric-card metric-card--${tone}`);
  append(card, "p", "metric-card__label", label);
  append(card, "strong", "metric-card__value", display(value));
  append(card, "p", "metric-card__context", context);
  return card;
}

export function statusPill(value, kind = "neutral") {
  return el("span", `status-pill status-pill--${kind}`, value);
}

export function tierPill(tier) {
  return statusPill(tier, tier.toLocaleLowerCase().replaceAll(" ", "-"));
}

export function emptyState(title, copy) {
  const state = el("div", "empty-state");
  append(state, "span", "empty-state__label", "DATA PENDING");
  append(state, "strong", "", title);
  append(state, "p", "", copy);
  return state;
}

export function renderMetricGrid(container, cards) {
  container.replaceChildren(...cards.map(metricCard));
}

export function renderDistribution(container, counts, total) {
  container.replaceChildren();
  const top = append(container, "div", "distribution__top");
  append(top, "strong", "", "Client distribution");
  append(top, "span", "", `${total} current clients`);
  const bar = append(container, "div", "distribution__bar");
  TIERS.forEach(tier => {
    if (!counts[tier]) return;
    const segment = append(bar, "span", `distribution__segment distribution__segment--${tier.toLocaleLowerCase().replaceAll(" ", "-")}`);
    segment.style.width = `${counts[tier] / total * 100}%`;
    segment.title = `${tier}: ${counts[tier]}`;
  });
  const legend = append(container, "div", "distribution__legend");
  TIERS.forEach(tier => {
    const item = append(legend, "span", "distribution__legend-item");
    append(item, "i", `distribution__dot distribution__dot--${tier.toLocaleLowerCase().replaceAll(" ", "-")}`);
    append(item, "span", "", `${tier} ${counts[tier]}`);
  });
}

export function tierPanel(tier, metrics) {
  const slug = tier.toLocaleLowerCase().replaceAll(" ", "-");
  const panel = el("article", `tier-panel tier-panel--${slug}`);
  const top = append(panel, "div", "tier-panel__top");
  append(top, "h3", "", tier);
  append(top, "strong", "", String(metrics.count));
  const list = append(panel, "dl", "tier-panel__metrics");
  const expected = tier === "Unassigned" ? "Tier Required" : display(metrics.expected);
  [
    ["Contact rate", metrics.contactRate], ["Retention", metrics.retention], ["Churn", metrics.churn],
    ["NPS", metrics.nps], ["CSAT", metrics.csat], ["Survey response", metrics.responseRate],
    ["Expected", expected], ["Completed", display(metrics.completed)], ["Overdue", display(metrics.overdue)]
  ].forEach(([label, value]) => {
    const row = append(list, "div", "");
    append(row, "dt", "", label);
    append(row, "dd", "", value);
  });
  return panel;
}

export function populateSelect(select, values, allLabel) {
  select.replaceChildren();
  [allLabel, ...values].forEach(value => {
    const option = append(select, "option", "", value);
    option.value = value;
  });
}

export function renderSimpleRows(tbody, rows, columns) {
  tbody.replaceChildren();
  rows.forEach(row => {
    const tr = append(tbody, "tr");
    columns.forEach(column => {
      const td = append(tr, "td", column.className || "");
      const rendered = column.render ? column.render(row) : display(row[column.key]);
      if (rendered instanceof Node) td.appendChild(rendered);
      else td.textContent = rendered;
    });
  });
}

export function buildTableHead(thead, labels) {
  thead.replaceChildren();
  const tr = append(thead, "tr");
  labels.forEach(label => append(tr, "th", "", label));
}

export function portfolioRow(client) {
  const expected = client.tier === "Unassigned" ? "Tier Required" : display(client.contactsExpected);
  const contactRate = client.tier === "Unassigned" ? "Tier Required" : display(client.contactRate);
  return [
    client.name,
    client.clientId || "Needs Client ID Review",
    client.tier,
    client.clientStatus,
    display(client.retentionStatus, "Needs Review"),
    display(client.latestNps, "No Response"),
    display(client.npsClassification, "No Response"),
    display(client.latestCsat, "No Response"),
    expected,
    display(client.contactsCompleted),
    display(client.additionalMeetings),
    contactRate,
    display(client.lastContact),
    display(client.nextContactDue),
    display(client.overdue),
    display(client.lastSurvey, "No Response"),
    display(client.followUpNeeded, "Yes - survey")
  ];
}
