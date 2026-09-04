const DAY_MS = 86_400_000;
const SNAPSHOT_KEY = "sparknav.customer-success.snapshot.v2";

const clean = value => value === null || value === undefined ? "" : String(value).trim();
const normalize = value => clean(value).toLocaleLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;

const SOURCE_ALIASES = new Map([
  [normalize("SeedSpark Client"), normalize("SeedSpark")],
  [normalize("SparkNav (internal)"), normalize("SparkNav")],
  [normalize("JenCon Builders"), normalize("Jencon Builders")],
  [normalize("St. Amand & Efird"), normalize("St. Amand and Efird")]
]);

function excelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0) : null;
  }
  const parsed = new Date(clean(value));
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function isoDate(value) {
  const date = excelDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

function findRow(rows, required) {
  return rows.findIndex(row => {
    const values = row.map(normalize);
    return required.every(label => values.includes(normalize(label)));
  });
}

async function workbookRows(file) {
  if (file.name.toLocaleLowerCase().endsWith(".xls")) {
    const text = await file.text();
    if (/<table[\s>]/i.test(text)) {
      const document = new DOMParser().parseFromString(text, "text/html");
      return [...document.querySelectorAll("tr")].map(row => [...row.querySelectorAll("th,td")].map(cell => cell.textContent.trim()));
    }
  }
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: false });
}

function reportDateFromRows(rows, fallback = null) {
  for (const row of rows.slice(0, 8)) {
    for (const value of row) {
      if (value instanceof Date) return value;
      const text = clean(value);
      const match = text.match(/(?:as of\s+)?([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/);
      if (match) {
        const date = excelDate(match[1]);
        if (date) return date;
      }
    }
  }
  return fallback;
}

export async function parseArReport(file) {
  const rows = await workbookRows(file);
  const headerIndex = findRow(rows, ["CURRENT", "1 - 30", "31 - 60", "61 - 90", "91 AND OVER"]);
  if (headerIndex < 0) throw new Error("AR report columns were not found.");
  const header = rows[headerIndex].map(normalize);
  const columns = {
    name: 0,
    current: header.indexOf(normalize("CURRENT")),
    oneThirty: header.indexOf(normalize("1 - 30")),
    thirtySixty: header.indexOf(normalize("31 - 60")),
    sixtyNinety: header.indexOf(normalize("61 - 90")),
    ninetyPlus: header.indexOf(normalize("91 AND OVER"))
  };
  const accounts = new Map();
  for (const row of rows.slice(headerIndex + 1)) {
    const name = clean(row[columns.name]);
    if (normalize(name) === "total") break;
    if (!name) continue;
    const balances = {
      current: Number(row[columns.current] || 0),
      oneThirty: Number(row[columns.oneThirty] || 0),
      thirtySixty: Number(row[columns.thirtySixty] || 0),
      sixtyNinety: Number(row[columns.sixtyNinety] || 0),
      ninetyPlus: Number(row[columns.ninetyPlus] || 0)
    };
    const bucket = positive(balances.ninetyPlus) ? "90+"
      : positive(balances.sixtyNinety) ? "61-90"
      : positive(balances.thirtySixty) ? "31-60"
      : "Current";
    const amount = bucket === "90+" ? balances.ninetyPlus
      : bucket === "61-90" ? balances.sixtyNinety
      : bucket === "31-60" ? balances.thirtySixty
      : 0;
    accounts.set(name, { bucket, amount, balances });
  }
  const asOf = reportDateFromRows(rows);
  if (!asOf) throw new Error("AR report date could not be determined.");
  return { type: "ar", fileName: file.name, asOf: isoDate(asOf), accounts };
}

export async function parseOpenTickets(file) {
  const rows = await workbookRows(file);
  const headerIndex = findRow(rows, ["Date Received", "Ticket Number", "Client Name", "Priority"]);
  if (headerIndex < 0) throw new Error("Open Tickets report columns were not found.");
  const header = rows[headerIndex].map(normalize);
  const col = label => header.indexOf(normalize(label));
  const tickets = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const number = clean(row[col("Ticket Number")]);
    const client = clean(row[col("Client Name")]);
    const received = excelDate(row[col("Date Received")]);
    if (!number || !client || !received) continue;
    tickets.push({
      number,
      client,
      received,
      priority: clean(row[col("Priority")]),
      dueDate: isoDate(row[col("Due Date")])
    });
  }
  if (!tickets.length) throw new Error("Open Tickets report contains no usable ticket rows.");
  const asOf = reportDateFromRows(rows, new Date(Math.max(...tickets.map(ticket => ticket.received.valueOf()))));
  const oldest = new Date(Math.min(...tickets.map(ticket => ticket.received.valueOf())));
  const spanDays = Math.max(0, Math.floor((asOf - oldest) / DAY_MS));
  const possibleTruncation = tickets.length >= 1100 && spanDays <= 35;
  return {
    type: "openTickets", fileName: file.name, asOf: isoDate(asOf), tickets,
    diagnostics: { rowCount: tickets.length, oldestReceived: isoDate(oldest), spanDays, possibleTruncation }
  };
}

export async function parseTicketVolume(file) {
  const rows = await workbookRows(file);
  const tickets = [];
  let activeHeader = null;
  for (const row of rows) {
    const normalized = row.map(normalize);
    if (["task or ticket number", "client name", "status", "priority"].every(label => normalized.includes(label))) {
      activeHeader = normalized;
      continue;
    }
    if (!activeHeader) continue;
    const col = label => activeHeader.indexOf(label);
    const number = clean(row[col("task or ticket number")]);
    const client = clean(row[col("client name")]);
    if (!/^T\d+/i.test(number) || !client) continue;
    tickets.push({ number, client, status: clean(row[col("status")]), priority: clean(row[col("priority")]) });
  }
  if (!tickets.length) throw new Error("Ticket Volume report contains no usable ticket rows.");
  const text = rows.slice(0, 3).flat().map(clean).join(" ");
  const dates = [...text.matchAll(/\d{2}\/\d{2}\/\d{4}/g)].map(match => isoDate(match[0])).filter(Boolean);
  return { type: "ticketVolume", fileName: file.name, periodStart: dates[0] || null, periodEnd: dates[1] || dates[0] || null, tickets };
}

function buildResolver(masterClients) {
  const canonical = new Map(masterClients.map(client => [normalize(client.name), client.name]));
  return rawName => {
    const key = normalize(rawName);
    const alias = SOURCE_ALIASES.get(key);
    return canonical.get(alias || key) || null;
  };
}

function groupSource(rows, nameKey, resolve) {
  const matched = new Map();
  const unmatched = new Set();
  for (const row of rows) {
    const canonical = resolve(row[nameKey]);
    if (!canonical) { unmatched.add(row[nameKey]); continue; }
    if (!matched.has(canonical)) matched.set(canonical, []);
    matched.get(canonical).push(row);
  }
  return { matched, unmatched };
}

export function calculateClientPulse({ masterClients, ar, openTickets, ticketVolume }) {
  const resolve = buildResolver(masterClients);
  const arRows = [...ar.accounts].map(([sourceName, value]) => ({ sourceName, ...value }));
  const arGrouped = groupSource(arRows, "sourceName", resolve);
  const openGrouped = groupSource(openTickets.tickets, "client", resolve);
  const volumeGrouped = groupSource(ticketVolume.tickets, "client", resolve);
  const asOf = excelDate(openTickets.asOf);
  const sourceNeedsReview = openTickets.diagnostics.possibleTruncation;

  const clients = Object.fromEntries(masterClients.map(client => {
    const name = client.name;
    const arRecord = arGrouped.matched.get(name)?.[0] || null;
    const open = openGrouped.matched.get(name) || [];
    const volume = volumeGrouped.matched.get(name) || [];
    const oldestTicketDays = open.length ? Math.max(...open.map(ticket => Math.max(0, Math.floor((asOf - ticket.received) / DAY_MS)))) : null;
    const bucket = arRecord?.bucket || "Current";
    const pay = { "Current": 20, "31-60": 10, "61-90": 4, "90+": 0 }[bucket];
    const age = oldestTicketDays;
    const service = age === null ? 40 : age >= 31 ? 4 : age >= 21 ? 12 : age >= 11 ? 24 : age >= 5 ? 34 : 40;
    const support = age === null ? 30 : age >= 31 ? 5 : age >= 21 ? 10 : age >= 11 ? 18 : 28;
    const engagement = 10;
    let score = pay + service + support + engagement;
    const capsApplied = [];
    const applyCap = (id, cap) => { if (score > cap) { score = cap; capsApplied.push(id); } };
    if (bucket === "90+") applyCap("ar_90_plus", 50);
    if (bucket === "61-90") applyCap("ar_61_90", 62);
    if (bucket === "31-60") applyCap("ar_31_60", 74);
    if (age !== null && age >= 30) applyCap("ticket_30_day", 69);
    if (age !== null && age >= 21) applyCap("ticket_21_day", 79);
    const band = score >= 85 ? "Healthy" : score >= 70 ? "Watch" : "At Risk";
    return [name, {
      score, band, scoreStatus: sourceNeedsReview ? "Provisional" : "Verified",
      dataState: sourceNeedsReview ? "Partial Data" : "Complete",
      pillars: { paymentHealth: pay, serviceResponsiveness: service, supportDemand: support, engagement },
      ar: {
        bucket, amount: arRecord?.amount || 0, asOf: ar.asOf,
        totalOutstanding: arRecord ? Math.max(0, Object.values(arRecord.balances).reduce((sum, value) => sum + Number(value || 0), 0)) : 0
      },
      tickets: { openCount: open.length, oldestOpenAgeDays: age, volumeCount: volume.length, asOf: openTickets.asOf },
      capsApplied
    }];
  }));

  const rank10 = (name, field) => {
    const value = field(clients[name]);
    if (value <= 0) return 1;
    const positives = Object.values(clients).map(field).filter(item => item > 0).sort((a, b) => a - b);
    const upperRank = positives.filter(item => item <= value).length;
    return Math.min(10, 1 + Math.ceil(upperRank / positives.length * 9));
  };
  const tierRows = Object.keys(clients).map(name => {
    const financialRank = rank10(name, client => client.ar.totalOutstanding);
    const ticketVolumeRank = rank10(name, client => client.tickets.volumeCount);
    const tierScore = Number((financialRank * (35 / 65) + ticketVolumeRank * (30 / 65)).toFixed(2));
    return { name, financialRank, ticketVolumeRank, tierScore };
  }).sort((a, b) => b.tierScore - a.tierScore || b.financialRank - a.financialRank || b.ticketVolumeRank - a.ticketVolumeRank || a.name.localeCompare(b.name));
  tierRows.forEach((row, index) => {
    const tier = index < Math.ceil(tierRows.length / 3) ? "Tier 1"
      : index < Math.ceil(tierRows.length * 2 / 3) ? "Tier 2" : "Tier 3";
    clients[row.name].tiering = { ...row, tier, method: "Available Data Tier Score v1" };
  });
  masterClients.forEach(masterClient => {
    const name = masterClient.name;
    if (!clients[name]) return;
    clients[name].tiering = {
      ...clients[name].tiering,
      calculatedTier: clients[name].tiering.tier,
      tier: masterClient.tier,
      valueScore: masterClient.tierValueScore ?? null,
      supportLoadScore: masterClient.tierSupportLoadScore ?? null,
      override: masterClient.tier !== "Unassigned",
      tierSource: masterClient.tierSource || "Not listed in SparkNav Client Tier List - Aug 28, 2026",
      method: "SparkNav Client Tier List"
    };
  });

  return {
    schemaVersion: "2.0",
    generatedAt: new Date().toISOString(),
    scoringModel: "ClientPulse v1",
    tieringModel: {
      name: "SparkNav Value Score Tier Model",
      source: "SparkNav Client Tier List - Aug 28, 2026",
      valueFactor: "Monthly average revenue, log-scaled",
      supportLoadTreatment: "Displayed separately; not blended into tier"
    },
    sources: {
      ar: { fileName: ar.fileName, asOf: ar.asOf, matchedClients: arGrouped.matched.size },
      openTickets: { fileName: openTickets.fileName, asOf: openTickets.asOf, matchedClients: openGrouped.matched.size, ...openTickets.diagnostics },
      ticketVolume: { fileName: ticketVolume.fileName, periodStart: ticketVolume.periodStart, periodEnd: ticketVolume.periodEnd, matchedClients: volumeGrouped.matched.size, rowCount: ticketVolume.tickets.length }
    },
    clients,
    exceptions: {
      unmatchedAr: [...arGrouped.unmatched].sort(),
      unmatchedOpenTickets: [...openGrouped.unmatched].sort(),
      unmatchedTicketVolume: [...volumeGrouped.unmatched].sort()
    },
    warnings: sourceNeedsReview ? ["Open Tickets report may be truncated: high row count with only a short received-date span. Scores are provisional."] : []
  };
}

function unfoldIcs(text) { return text.replace(/\r?\n[ \t]/g, ""); }
function icsValue(block, key) {
  const match = block.match(new RegExp(`^${key}(?:;[^:]*)?:(.*)$`, "mi"));
  return match ? match[1].replace(/\\,/g, ",").replace(/\\n/g, " ").trim() : null;
}
function icsDate(value) {
  if (!value) return null;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?Z?)?/);
  if (!match) return excelDate(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0));
}

export async function parseCalendar(file, masterClients) {
  let events = [];
  if (file.name.toLocaleLowerCase().endsWith(".ics")) {
    const text = unfoldIcs(await file.text());
    events = [...text.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].map(match => ({
      subject: icsValue(match[1], "SUMMARY") || "Calendar event",
      start: icsDate(icsValue(match[1], "DTSTART")),
      end: icsDate(icsValue(match[1], "DTEND")),
      location: icsValue(match[1], "LOCATION") || ""
    }));
  } else {
    const rows = await workbookRows(file);
    const headerIndex = findRow(rows, ["Subject"]);
    if (headerIndex < 0) throw new Error("Calendar export must contain a Subject column.");
    const header = rows[headerIndex].map(normalize);
    const col = (...labels) => labels.map(normalize).map(label => header.indexOf(label)).find(index => index >= 0) ?? -1;
    events = rows.slice(headerIndex + 1).map(row => ({
      subject: clean(row[col("Subject")]),
      start: excelDate(row[col("Start Date", "Start")]),
      end: excelDate(row[col("End Date", "End")]),
      location: clean(row[col("Location")])
    })).filter(event => event.subject && event.start);
  }
  const candidates = masterClients.map(client => ({ name: client.name, key: normalize(client.name) }))
    .filter(client => client.key.length >= 6).sort((a, b) => b.key.length - a.key.length);
  return events.filter(event => event.start).map(event => {
    const haystack = normalize(`${event.subject} ${event.location}`);
    const matched = candidates.find(client => haystack.includes(client.key));
    return {
      subject: event.subject, start: event.start.toISOString(), end: event.end?.toISOString() || null,
      location: event.location, clientName: matched?.name || null, qualification: "Candidate - Needs Review"
    };
  });
}

export function saveSnapshot(snapshot) { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot)); }
export function loadSnapshot() {
  try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY)); } catch { return null; }
}
export async function loadPublishedSnapshot() {
  try {
    const response = await fetch(`./data/current-snapshot.json?refresh=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
export function clearSnapshot() { localStorage.removeItem(SNAPSHOT_KEY); }
