const DATA_FILES = {
  clients: "../data/clients.json",
  metrics: "../data/metrics.json",
  surveys: "../data/surveys.json",
  contacts: "../data/contacts.json",
  trends: "../data/trends.json"
};

async function loadJson(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load ${url.pathname} (${response.status})`);
  return response.json();
}

export class StaticJsonAdapter {
  async load() {
    const [clients, metrics, surveys, contacts, trends] = await Promise.all(
      Object.values(DATA_FILES).map(loadJson)
    );
    return { clients, metrics, surveys, contacts, trends };
  }
}

// Replace this factory with an approved API adapter later. Keep credentials and
// private connection details on the server side; never place them in this file.
export function createDataAdapter() {
  return new StaticJsonAdapter();
}
