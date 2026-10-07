#!/usr/bin/env python3
"""Build the master tables for the seed from the five C&B workbooks (run locally).

Usage:  python3 -I scripts/seed/extract_masters.py reference/wb reference/out/masters.json

Reads only the Definitions tables, the Scheme sheet, the QHY divisor/percent header rows and the
defined-name parameters. No Salary Table / payroll row is read. The output is company data:
keep it out of git (reference/ is ignored) and import it through Admin › Backup.
"""
import glob, json, os, sys, warnings
from datetime import datetime, date
import openpyxl
from openpyxl.utils import range_boundaries

warnings.filterwarnings('ignore')
src, out = sys.argv[1], sys.argv[2]


def book(prefix):
    path = glob.glob(os.path.join(src, f'{prefix}*.xlsm'))
    if not path:
        sys.exit(f'missing workbook {prefix}*')
    return openpyxl.load_workbook(path[0], data_only=True)


def table(wb, sheet, name):
    ws = wb[sheet]
    ref = ws.tables[name].ref
    c1, r1, c2, r2 = range_boundaries(ref)
    hdr = [ws.cell(r1, c).value for c in range(c1, c2 + 1)]
    rows = [[ws.cell(r, c).value for c in range(c1, c2 + 1)] for r in range(r1 + 1, r2 + 1)]
    return hdr, [r for r in rows if any(v not in (None, '') for v in r)]


def clean(v):
    if isinstance(v, (datetime, date)):
        return v.isoformat()[:10]
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, str):
        v = v.strip()
        return v if v else None
    return v


HQ, SL, IN, OI, QHY = (book(p) for p in ('001', '002', '003', '004', '005'))
masters = []
notes = []

# CostCenter: SL is the most recent copy; OI adds "Nhóm" (letters), QHY adds "Nhóm" (TRUE/FALSE) and "Position".
h, rows = table(SL, 'Definitions', 'CostCenter')
ix = {c: i for i, c in enumerate(h)}
oi_h, oi_rows = table(OI, 'Definitions', 'CostCenter')
oi = {r[0]: r[oi_h.index('Nhóm')] for r in oi_rows}
q_h, q_rows = table(QHY, 'Definitions', 'CostCenter')
qn = {r[0]: r[q_h.index('Nhóm')] for r in q_rows}
qp = {r[0]: r[q_h.index('Position')] for r in q_rows}
for other_name, other in (('HQ', HQ), ('IN', IN), ('OI', OI), ('QHY', QHY)):
    oh, orows = table(other, 'Definitions', 'CostCenter')
    base = {r[0]: r for r in rows}
    for r in orows:
        b = base.get(r[0])
        if not b:
            notes.append(f'CostCenter: unit {r[0]} only in {other_name}')
            continue
        for col in ('TTCP', 'HR', 'AT', 'Opex', 'Dept', 'SB/WH'):
            if clean(r[oh.index(col)]) != clean(b[ix[col]]):
                notes.append(f'CostCenter {r[0]}.{col}: SL={b[ix[col]]!r} {other_name}={r[oh.index(col)]!r} (SL kept)')
# SL Form 01: salary of units WH1D, TR and units whose code ends with a digit goes to 0304, others to 0319
def is_0304(unit):
    u = str(unit or '')
    return u in ('WH1D', 'TR') or (u[-1:].isdigit())

cols = ['Unit', 'Cost Center', 'HR', 'AT', 'Opex', 'Dept', 'Dept Old', 'SB/WH', 'Sector', 'Name', 'OI Nhóm', 'Monthly KPI', 'Position', 'Lương 0304']
cc_rows = []
for r in rows:
    sbwh = clean(r[ix['SB/WH']])
    cc_rows.append([
        clean(r[ix['Mã bộ phận']]), clean(r[ix['TTCP']]), clean(r[ix['HR']]), clean(r[ix['AT']]), clean(r[ix['Opex']]),
        clean(r[ix['Dept']]), clean(r[ix['Dept Old']]), sbwh, 'DHG' if sbwh == 'DHG' else 'KBH', clean(r[ix['Name']]),
        clean(oi.get(r[ix['Mã bộ phận']])), bool(qn.get(r[ix['Mã bộ phận']])) if r[ix['Mã bộ phận']] in qn else False,
        clean(qp.get(r[ix['Mã bộ phận']])),
        is_0304(r[ix['Mã bộ phận']]),
    ])
masters.append({'name': 'CostCenter', 'columns': cols, 'rows': cc_rows})

h, rows = table(HQ, 'Definitions', 'D_Position')
masters.append({'name': 'UnitGroup', 'columns': ['Unit Code', 'Group'], 'rows': [[clean(v) for v in r] for r in rows]})
h, rows = table(SL, 'Definitions', 'D_Position')
masters.append({'name': 'SalesPosition', 'columns': ['Tên chức danh', 'Mã chức danh', 'Tính thưởng'], 'rows': [[clean(v) for v in r] for r in rows]})
h, rows = table(SL, 'Definitions', 'tbl_additionalsalary')
masters.append({'name': 'AdditionalSalary', 'columns': ['Mã NV', 'Additional Salary'], 'rows': [[str(clean(r[0])), clean(r[1])] for r in rows]})
h, rows = table(QHY, 'Definitions', 'Group')
masters.append({'name': 'QHY_Group', 'columns': ['Mã chức danh', 'Kênh', 'Nhóm'], 'rows': [[clean(v) for v in r] for r in rows]})
h, rows = table(QHY, 'Scheme', 'Scheme')
masters.append({'name': 'QHY_Scheme', 'columns': [str(c).strip() for c in h], 'rows': [[clean(v) for v in r] for r in rows]})

# QHY divisor (row 1) and accrual % (row 2) above each bonus column of Form 01
ws = QHY['Form 01']
c1, r1, c2, _ = range_boundaries(ws.tables['Form01'].ref)
bonus = []
for c in range(c1, c2 + 1):
    div, pct, code, hdr = ws.cell(1, c).value, ws.cell(2, c).value, ws.cell(3, c).value, ws.cell(r1, c).value
    if isinstance(div, (int, float)) and isinstance(pct, (int, float)):
        bonus.append([str(hdr).strip(), clean(div), clean(pct), clean(code)])
masters.append({'name': 'QHY_Bonus', 'columns': ['Bonus', 'Số chia', '% trích', 'Mã chi phí'], 'rows': bonus})

# Time labels (OI titles)
hv, rv = table(OI, 'Definitions', '_time_vn')
he, re_ = table(OI, 'Definitions', '_time_en')
masters.append({
    'name': 'TimeLabels',
    'columns': ['Month', 'VN_M', 'VN_Q', 'VN_H', 'EN_M', 'EN_Q', 'EN_H'],
    'rows': [[i + 1, clean(a[1]), clean(a[2]), clean(a[3]), clean(b[1]), clean(b[2]), clean(b[3])] for i, (a, b) in enumerate(zip(rv, re_))],
})


def name_value(wb, n):
    v = wb.defined_names[n].attr_text
    try:
        return float(v) if '.' in v else int(v)
    except ValueError:
        return v


params = [[k, name_value(IN, k)] for k in ('_BHXH_CTY', '_BHYT_CTY', '_BHTN_CTY', 'KPCD_CTY', '_BHXH_NLD', '_BHYT_NLD', '_BHTN_NLD', '_LCS', '_TTV')]
params = [[k.lstrip('_'), v] for k, v in params]
params.append(['HUNGKING', name_value(QHY, '_HUNGKING')])
masters.append({'name': 'Params', 'columns': ['key', 'value'], 'rows': params})
for k in ('_LCS', '_TTV'):
    if name_value(OI, k) != name_value(IN, k):
        notes.append(f'Params {k.lstrip("_")}: IN={name_value(IN, k)} OI={name_value(OI, k)} (IN kept)')

# Signer names printed under the forms (real people: kept local, used as run-parameter defaults)
def cell_after(wb, sheet, label):
    ws = wb[sheet]
    for row in ws.iter_rows():
        for c in row:
            if c.value == label:
                for r in range(c.row + 1, c.row + 8):
                    v = ws.cell(r, c.column).value
                    if isinstance(v, str) and v.strip() and v.strip() not in ('Human Resource Manager', 'Reporter', 'General Director'):
                        return v.strip()
    return None

signers = {}
for flow, wb in (('HQ', HQ), ('SL', SL), ('IN', IN), ('OI', OI)):
    d = {}
    for sheet in ('Form 02 - Print', 'Form 03 - Print'):
        for key, label in (('hr_manager', 'Trưởng Phòng Nhân sự'), ('reporter', 'Người đề nghị'), ('general_director', 'Tổng giám đốc')):
            v = cell_after(wb, sheet, label)
            if v and key not in d:
                d[key] = v
    signers[flow] = d

os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
json.dump({'kind': 'cb-forms-backup', 'flows': [], 'masters': masters, 'runDefaults': signers, 'notes': notes}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{out}: ' + ', '.join(f"{m['name']}({len(m['rows'])})" for m in masters))
for n in notes:
    print('  note:', n)
