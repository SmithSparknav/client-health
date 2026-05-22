#!/usr/bin/env python3
"""
ClientPulse by SparkNav â Dashboard Generator
Runs every Tuesday via GitHub Actions.
Reads ar_data.json + ticket_data.json, scores all clients,
regenerates index.html and commits it automatically.
"""

import json, base64, os
from datetime import date, datetime

TODAY = date.today()

# âLOAD DATA FILES â
with open('ar_data.json')     as f: AR      = json.load(f)
with open('ticket_data.json') as f: TICKETS = json.load(f)["clients"]
with open('clients.json')     as f: CLIENTS= json.load(f)
with open('notes.json')       as f: NOTES   = json.load(f)

# Logo â embedded as base64 so it's self-contained (no separate file needed)
LOGO_PATH = 'SparkNav_Logo_FullColor_Horizontal.png'
if os.path.exists(LOGO_PATH):
    with open(LOGO_PATH,'rb') as f:
        LOGO = f"data:image/png;base64,{base64.b64encode(f.read()).decode()}"
else:
    LOGO = ""  # fallback
