#!/usr/bin/env python3
import json, base64, os
from datetime import date

TODAY = date.today()

with open('ar_data.json') as f: AR = json.load(f)
with open('ticket_data.json') as f: td = json.load(f); TICKETS = td.get('clients', td)
with open('clients.json') as f: CLIENTS = json.load(f)
with open('notes.json') as f: NOTES = json.load(f)

LOGO_PATH = 'SparkNav_Logo_FullColor_Horizontal.png'
LOGO = f'data:image/png;base64,{base64.b64encode(open(LOGO_PATH,"rb").read()).decode()}' if os.path.exists(LOGO_PATH) else ''

def score_payment(d): return {None:20,'31-60':10,'61-90':4,'90+':0}.get(d,20)
def score_service(a): return 40 if a is None else 4 if a>=31 else 12 if a>=21 else 24 if a>=11 else 34 if a>=5 else 40
def score_support(a): return 30 if a is None else 5 if a>=31 else 10 if a>=21 else 18 if a>=11 else 28
def band(s):
    if s >= 85: return 'healthy','HEALTHY'
    if s >= 70: return 'watch','WATCH'
    return 'risk','AT RISK'

scored = []
for name in CLIENTS:
    ar = AR.get(name, {}); ad = ar.get('days'); aa = ar.get('amount', 0)
    age = TICKETS.get(name)
    pay = score_payment(ad); svc = score_service(age); sup = score_support(age); eng = 10
    total = pay + svc + sup + eng
    # Hard caps — AR overdue buckets
    if ad == '90+':   total = min(total, 50)
    if ad == '61-90': total = min(total, 62)
    if ad == '31-60': total = min(total, 74)
    # Hard caps — ticket age
    if age and age >= 30: total = min(total, 69)
    if age and age >= 21: total = min(total, 79)
    total = max(0, min(100, total))
    color, label = band(total)
    parts = []
    if ad == '90+':     parts.append(f'Invoice ${aa:,.2f} over 90 days past due')
    elif ad == '61-90': parts.append(f'Invoice ${aa:,.2f} is 61-90 days past due')
    elif ad == '31-60': parts.append(f'Invoice ${aa:,.2f} is 31-60 days past due')
    if age:             parts.append(f'Open ticket aging {age} days')
    if not parts:       parts.append('Payment current and all tickets resolved')
    scored.append({'n':name,'score':total,'pay':pay,'svc':svc,'sup':sup,'eng':eng,
                   'color':color,'label':label,
                   'reason':'. '.join(p[0].upper()+p[1:] for p in parts)+'.',
                   'note':NOTES.get(name)})

scored.sort(key=lambda c: ({'risk':0,'watch':1,'healthy':2}[c['color']], c['score']))
counts = {k: sum(1 for c in scored if c['color']==k) for k in ['risk','watch','healthy']}
N = len(scored)
book = round(sum(c['score'] for c in scored) / N)
bc, bl = band(book)
bh = {'risk':'#FF2D2D','watch':'#D97706','healthy':'#16A34A'}[bc]
C = 125.6
upd = TODAY.strftime('%B %-d, %Y')
js = json.dumps(scored, ensure_ascii=False)

# Verify scoring worked — print key clients
print(f'Book: {book}/100 ({bl}) | Risk:{counts["risk"]} Watch:{counts["watch"]} Healthy:{counts["healthy"]}')
for c in scored[:5]:
    print(f'  {c["n"]}: {c["score"]} ({c["color"]}) — {c["reason"][:60]}')

html = open('index_template.html').read()
html = html.replace('__DATA__', js).replace('__BOOK__', str(book)).replace('__BL__', bl).replace('__BH__', bh).replace('__UPD__', upd).replace('__N__', str(N)).replace('__LOGO__', LOGO).replace('__RISK__', str(counts['risk'])).replace('__WATCH__', str(counts['watch'])).replace('__HEALTHY__', str(counts['healthy'])).replace('__C__', str(C)).replace('__RISK_OFF__', f'{C*(1-counts["risk"]/N):.1f}').replace('__WATCH_OFF__', f'{C*(1-max(counts["watch"],0.1)/N):.1f}').replace('__HEALTHY_OFF__', f'{C*(1-counts["healthy"]/N):.1f}').replace('__BOOK_OFF__', f'{163.4*(1-book/100):.1f}')
with open('index.html', 'w') as f: f.write(html)
print(f'index.html written — {len(html):,} chars')
