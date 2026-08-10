#!/usr/bin/env python3
"""Build the sanitized development client JSON from the validated CSV."""

import argparse
import csv
import json
from pathlib import Path

TIERS = {"Tier 1", "Tier 2", "Tier 3", "Unassigned"}
PROJECT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT.parent / "Client Metrics Dataset.csv"
DEFAULT_OUTPUT = PROJECT / "data" / "clients.json"


def build(source: Path):
    with source.open(newline="", encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))

    names = [row["Client Name"].strip() for row in rows]
    if len(rows) != 175 or len(set(name.casefold() for name in names)) != 175:
        raise ValueError(f"Expected 175 unique clients; found {len(rows)} rows and {len(set(names))} unique names")
    invalid = [(row["Client Name"], row["Tier"]) for row in rows if row["Tier"] not in TIERS]
    if invalid:
        raise ValueError(f"Invalid tier values: {invalid}")

    clients = []
    for row in rows:
        clients.append({
            "name": row["Client Name"],
            "clientId": row["Client ID"] or None,
            "clientIdStatus": row["Client ID Status"],
            "tier": row["Tier"],
            "clientStatus": row["Client Status"],
            "retentionStatus": None,
            "latestNps": None,
            "npsClassification": None,
            "latestCsat": None,
            "contactsExpected": None,
            "contactsCompleted": None,
            "additionalMeetings": None,
            "contactRate": None,
            "lastContact": None,
            "nextContactDue": None,
            "overdue": None,
            "lastSurvey": None,
            "followUpNeeded": "Yes - survey",
            "operations": {
                "contactedWelcomeEmail": row["Contacted/Welcome Email"],
                "devicesHardware": row["Most Recent Devices/Hardware"],
                "userList": row["User List"],
                "meetingCadenceSchedule": row["Meeting Cadence Schedule"],
                "sparkOne": row["SparkOne"],
                "services": [item.strip() for item in row["Services"].split(",") if item.strip()],
            },
            "source": {"page": int(row["Source Page"])},
        })
    return {"schemaVersion": "1.0", "expectedPopulation": 175, "clients": clients}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    payload = build(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(payload['clients'])} validated clients to {args.output}")


if __name__ == "__main__":
    main()
