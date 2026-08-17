export const TIERS = ["Tier 1", "Tier 2", "Tier 3", "Unassigned"];
export const ALLOWED_TIERS = new Set(TIERS);

const present = value => value !== null && value !== undefined && value !== "";
const numeric = value => {
  if (!present(value)) return null;
  const parsed = Number(String(value).replace(/[%,$]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};
export const formatPercent = value => `${Math.round(value)}%`;
export const formatPercentOneDecimal = value => `${value.toFixed(1)}%`;
export const display = (value, fallback = "No Data") => present(value) ? String(value) : fallback;

export function validateClients(clients, expectedPopulation = 175) {
  const names = clients.map(client => client.name.trim().toLocaleLowerCase());
  const uniqueNames = new Set(names);
  const invalidTiers = clients.filter(client => !ALLOWED_TIERS.has(client.tier));
  return {
    expectedPopulation,
    rowCount: clients.length,
    uniqueCount: uniqueNames.size,
    duplicateCount: clients.length - uniqueNames.size,
    missingNameCount: clients.filter(client => !client.name.trim()).length,
    invalidTierCount: invalidTiers.length,
    valid: clients.length === expectedPopulation && uniqueNames.size === clients.length && !invalidTiers.length
  };
}

export function aggregateClients(clients, tier = null) {
  const withExpected = clients.filter(client => numeric(client.contactsExpected) !== null);
  const withCompleted = clients.filter(client => numeric(client.contactsCompleted) !== null);
  const completeContactCoverage = clients.length > 0 && withExpected.length === clients.length && withCompleted.length === clients.length;
  const expected = completeContactCoverage ? clients.reduce((sum, client) => sum + numeric(client.contactsExpected), 0) : null;
  const completed = completeContactCoverage ? clients.reduce((sum, client) => sum + numeric(client.contactsCompleted), 0) : null;
  const completedRequired = completeContactCoverage
    ? clients.reduce((sum, client) => sum + Math.min(numeric(client.contactsCompleted), numeric(client.contactsExpected)), 0)
    : null;
  const contactRate = tier === "Unassigned"
    ? "Tier Required"
    : expected > 0 ? formatPercent(Math.min(100, completedRequired / expected * 100)) : "No Data";
  const additionalMeetings = completeContactCoverage
    ? clients.reduce((sum, client) => sum + Math.max(numeric(client.contactsCompleted) - numeric(client.contactsExpected), 0), 0)
    : null;

  const classifiedNps = clients.filter(client => ["Promoter", "Passive", "Detractor"].includes(client.npsClassification));
  const promoters = classifiedNps.filter(client => client.npsClassification === "Promoter").length;
  const detractors = classifiedNps.filter(client => client.npsClassification === "Detractor").length;
  const nps = classifiedNps.length ? Math.round(100 * (promoters - detractors) / classifiedNps.length) : null;
  const csatValues = clients.map(client => numeric(client.latestCsat)).filter(value => value !== null);
  const csat = csatValues.length ? csatValues.reduce((sum, value) => sum + value, 0) / csatValues.length : null;
  const responded = clients.filter(client => present(client.lastSurvey)).length;
  const churned = clients.filter(client => client.retentionStatus === "Churned").length;
  const retained = clients.length - churned;
  const overdue = clients.filter(client => client.overdue === true).length;

  return {
    count: clients.length,
    expected,
    completed,
    additionalMeetings,
    contactRate,
    retention: clients.length ? formatPercentOneDecimal(retained / clients.length * 100) : "No Data",
    churn: clients.length ? formatPercentOneDecimal(churned / clients.length * 100) : "No Data",
    nps: nps === null ? "No Response" : String(nps),
    csat: csat === null ? "No Response" : formatPercent(csat),
    responded,
    responseRate: clients.length ? formatPercent(responded / clients.length * 100) : "No Data",
    overdue: completeContactCoverage ? overdue : null
  };
}

export function calculateDashboard(data) {
  const clients = data.clients.clients;
  const activeClients = clients.filter(client => client.clientStatus === "Active" && client.retentionStatus !== "Churned");
  const churnedClients = clients.filter(client => client.retentionStatus === "Churned");
  const byTier = Object.fromEntries(TIERS.map(tier => [tier, activeClients.filter(client => client.tier === tier)]));
  const tierMetrics = Object.fromEntries(TIERS.map(tier => [tier, aggregateClients(byTier[tier], tier)]));
  const validation = validateClients(clients, data.clients.expectedPopulation);
  return {
    clients,
    activeClients,
    churnedClients,
    byTier,
    tierMetrics,
    validation,
    portfolio: aggregateClients(clients),
    assignedCount: activeClients.length - byTier.Unassigned.length,
    idMatchedCount: clients.filter(client => client.clientId).length,
    idReviewCount: clients.filter(client => client.clientIdStatus === "Needs Client ID Review").length,
    surveyFollowupCount: clients.filter(client => !client.lastSurvey).length
  };
}
