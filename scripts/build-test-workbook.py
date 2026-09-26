"""Builds the manual test execution workbook from manual/TEST-CASES.md.

The test cases are PARSED from the markdown rather than retyped, so the workbook and the document
cannot drift apart. Re-run this after editing TEST-CASES.md to regenerate.
"""

import re
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule
from openpyxl.comments import Comment

PROJ = Path(__file__).resolve().parent.parent
OUT = PROJ / "manual" / "Manual-Test-Execution.xlsx"

# ---------- house style ----------

FONT = "Arial"
H1 = Font(name=FONT, size=14, bold=True, color="1F3864")
H2 = Font(name=FONT, size=11, bold=True, color="1F3864")
HDR = Font(name=FONT, size=10, bold=True, color="FFFFFF")
BODY = Font(name=FONT, size=10)
BODY_B = Font(name=FONT, size=10, bold=True)
SMALL = Font(name=FONT, size=9, color="595959")
MONO = Font(name="Consolas", size=9)

HDR_FILL = PatternFill("solid", fgColor="1F3864")
INPUT_FILL = PatternFill("solid", fgColor="FFFF00")   # cells the tester fills in
BAND_FILL = PatternFill("solid", fgColor="F2F2F2")
NOTE_FILL = PatternFill("solid", fgColor="FFF2CC")

PASS_FILL = PatternFill("solid", fgColor="C6EFCE")
FAIL_FILL = PatternFill("solid", fgColor="FFC7CE")
BLOCK_FILL = PatternFill("solid", fgColor="FFEB9C")
NA_FILL = PatternFill("solid", fgColor="E7E6E6")

THIN = Side(style="thin", color="BFBFBF")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

TOP_WRAP = Alignment(vertical="top", wrap_text=True)
TOP = Alignment(vertical="top")
CTR = Alignment(horizontal="center", vertical="top")

RESULTS = ["Pass", "Fail", "Blocked", "N/A"]

# ---------- parse the markdown ----------


def parse_cases(md_path):
    """Returns [(module, id, pri, tag, case, steps, expected)].

    Two table shapes appear in the document: most sections carry a Steps column and the
    cross-browser section does not. Column count tells them apart.
    """
    md = md_path.read_text(encoding="utf-8")
    module = None
    out = []
    for line in md.split("\n"):
        heading = re.match(r"^## \d+\.\s+(.+)$", line.strip())
        if heading:
            module = heading.group(1).strip()
            continue
        if not module or not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 5:
            continue
        if cells[0] == "ID" or set(cells[0]) <= set("-: "):
            continue

        def clean(s):
            # Markdown emphasis carries no meaning in a spreadsheet cell.
            s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
            s = re.sub(r"\*(.+?)\*", r"\1", s)
            s = s.replace("`", "")
            return s.strip()

        cid, pri, tag, case = (clean(c) for c in cells[:4])
        if len(cells) >= 7:
            steps, expected = clean(cells[4]), clean(cells[5])
        else:
            steps, expected = "", clean(cells[4])
        out.append((module, cid, pri, tag, case, steps, expected))
    return out


CASES = parse_cases(PROJ / "manual" / "TEST-CASES.md")
MODULES = list(dict.fromkeys(m for m, *_ in CASES))

# ---------- helpers ----------


def header_row(ws, row, labels, widths):
    for i, (label, width) in enumerate(zip(labels, widths), start=1):
        c = ws.cell(row=row, column=i, value=label)
        c.font = HDR
        c.fill = HDR_FILL
        c.alignment = Alignment(vertical="center", wrap_text=True)
        c.border = BOX
        ws.column_dimensions[get_column_letter(i)].width = width
    ws.row_dimensions[row].height = 28


def title(ws, text, sub=None, span=6):
    ws["A1"] = text
    ws["A1"].font = H1
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=span)
    if sub:
        ws["A2"] = sub
        ws["A2"].font = SMALL
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=span)


wb = Workbook()

# =====================================================================
# 1. Instructions
# =====================================================================

ws = wb.active
ws.title = "Instructions"
ws.sheet_view.showGridLines = False
title(ws, "Manual Test Execution Workbook",
      "ClinicalEHRApplication — https://2set.com · generated from manual/TEST-CASES.md", span=6)

for w, col in zip([3, 26, 22, 30, 30, 20], "ABCDEF"):
    ws.column_dimensions[col].width = w

r = 4
blocks = [
    ("How to use this workbook", [
        "1. Fill in the yellow cells on the 'Run Info' sheet before you start.",
        "2. Work through the 'Test Cases' sheet. Set Result for each case you run.",
        "3. For every Fail, add a row to 'Defect Log' and put its ID in the Defect ID column.",
        "4. 'Summary' updates itself from your results — do not type into it.",
        "5. After a deploy, also complete the 'Regression Checklist' sheet.",
    ]),
    ("Which cells you edit", [
        "YELLOW cells are yours to fill in: Run Info fields, and the Result, Notes, Defect ID,",
        "Tested By and Date columns on Test Cases, Defect Log and Regression Checklist.",
        "Everything else — IDs, steps, expected results, all of Summary — is generated or",
        "calculated. Overwriting it will not break the workbook, but your edit will be lost the",
        "next time the workbook is regenerated from TEST-CASES.md.",
    ]),
    ("Result values", [
        "Pass     — the actual result matched the expected result.",
        "Fail     — it did not. Raise a defect.",
        "Blocked  — could not be run (a dependency is broken, or access was unavailable).",
        "N/A      — does not apply to this build or environment.",
        "(blank)  — not run yet. Counted as 'Not run' in the Summary.",
    ]),
    ("Tags — read these before touching production", [
        "READ-ONLY  Safe to run against https://2set.com. Looks only; changes nothing.",
        "WRITE      Creates, edits or deletes. RUN ON A LOCAL OR STAGING INSTANCE ONLY.",
        "           2set.com holds real patient records; a test charge there is a real charge",
        "           on a real person's account.",
        "PAPER      Needs a physical printer and preprinted CMS-1500 stock.",
    ]),
    ("Severity, when raising a defect", [
        "Critical  Patient safety, data loss, or a breach. Wrong patient's record shown; a",
        "          permission not enforced server-side; a claim or prescription reported as",
        "          sent when it was not.",
        "High      Money or a core workflow is wrong. Miscalculated total; double-posted",
        "          payment; claim cannot be printed; nobody can sign in.",
        "Medium    Wrong behaviour with a workaround.",
        "Low       Cosmetic. A defect in authentication, authorization or financial",
        "          calculation is NEVER Low.",
    ]),
    ("Evidence is clinical data", [
        "A screenshot of the billing ledger is a patient record. Keep evidence in the",
        "project's evidence/ folder, which is gitignored, and never attach it to a public",
        "issue tracker. Redact names, dates of birth, member IDs and diagnoses before",
        "sharing anything outside the practice.",
    ]),
]

for head, lines in blocks:
    ws.cell(row=r, column=2, value=head).font = H2
    r += 1
    for line in lines:
        c = ws.cell(row=r, column=2, value=line)
        c.font = BODY
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=6)
        r += 1
    r += 1

# One worked example, so the expected format is unambiguous.
ws.cell(row=r, column=2, value="Example of a completed row").font = H2
r += 1
ex_hdr = ["ID", "Result", "Notes", "Defect ID", "Tested By", "Date"]
ex_val = ["CLM-006", "Fail", "Summary total showed $213.00 but the two lines are $165.00 + $48.00 = $213.00 — "
                            "matched. Re-tested after cache clear: passes.", "BUG-0007", "J. Azim", "2026-09-26"]
for i, (h, v) in enumerate(zip(ex_hdr, ex_val), start=1):
    hc = ws.cell(row=r, column=i, value=h)
    hc.font = BODY_B
    hc.fill = BAND_FILL
    hc.border = BOX
    vc = ws.cell(row=r + 1, column=i, value=v)
    vc.font = BODY
    vc.border = BOX
    vc.alignment = TOP_WRAP
ws.row_dimensions[r + 1].height = 46
ws.cell(row=r, column=1).comment = Comment(
    "This example lives here deliberately, so the Test Cases sheet contains only real cases.",
    "Test suite")

# =====================================================================
# 2. Run Info
# =====================================================================

ws = wb.create_sheet("Run Info")
ws.sheet_view.showGridLines = False
title(ws, "Test Run Information", "Fill in the yellow cells before you begin.", span=4)
for w, col in zip([3, 30, 46, 30], "ABCD"):
    ws.column_dimensions[col].width = w

fields = [
    ("Build / commit SHA", "", "From `git log --oneline -1` on the server."),
    ("Environment URL", "https://2set.com", "Change if testing a local or staging instance."),
    ("Is this production?", "Yes", "If Yes, do NOT run any case tagged WRITE."),
    ("Test run start date", "", "YYYY-MM-DD"),
    ("Test run end date", "", "YYYY-MM-DD"),
    ("Tester name", "", ""),
    ("Test plan version", "1.0", "See manual/TEST-PLAN.md"),
    ("Browser / version", "", "e.g. Chrome 131"),
    ("Operating system", "", ""),
    ("Backup taken & size verified", "", "A 0-byte dump is not a backup. Required before any WRITE testing."),
]
r = 4
for label, default, hint in fields:
    lc = ws.cell(row=r, column=2, value=label)
    lc.font = BODY_B
    lc.border = BOX
    vc = ws.cell(row=r, column=3, value=default)
    vc.font = BODY
    vc.fill = INPUT_FILL
    vc.border = BOX
    hc = ws.cell(row=r, column=4, value=hint)
    hc.font = SMALL
    hc.alignment = TOP_WRAP
    r += 1

dv_yn = DataValidation(type="list", formula1='"Yes,No"', allow_blank=True)
ws.add_data_validation(dv_yn)
dv_yn.add("C6")

r += 1
ws.cell(row=r, column=2, value="Totals (calculated)").font = H2
r += 1
n = len(CASES)
last = 3 + n           # Test Cases data ends on this row

# Each total's row is named, and every later formula references those names.
#
# Writing them as offsets from the loop variable is how a workbook ends up error-free and wrong:
# the first version computed "Not run" as Executed - Pass, and the pass rate as
# Fail / (Fail + Blocked). Both recalculated perfectly cleanly and both were nonsense.
ROW_TOTAL = r
ROW_EXEC = r + 1
ROW_PASS = r + 2
ROW_FAIL = r + 3
ROW_BLOCKED = r + 4
ROW_NA = r + 5
ROW_NOTRUN = r + 6
ROW_RATE = r + 7
ROW_P1FAIL = r + 8
ROW_DEFECTS = r + 9

totals = [
    ("Total cases in this plan", f'=COUNTA(\'Test Cases\'!A4:A{last})'),
    ("Executed", f'=COUNTA(\'Test Cases\'!H4:H{last})'),
    ("Pass", f'=COUNTIF(\'Test Cases\'!H4:H{last},"Pass")'),
    ("Fail", f'=COUNTIF(\'Test Cases\'!H4:H{last},"Fail")'),
    ("Blocked", f'=COUNTIF(\'Test Cases\'!H4:H{last},"Blocked")'),
    ("N/A", f'=COUNTIF(\'Test Cases\'!H4:H{last},"N/A")'),
    ("Not run", f'=C{ROW_TOTAL}-C{ROW_EXEC}'),
    ("Pass rate (of Pass + Fail)", f'=IFERROR(C{ROW_PASS}/(C{ROW_PASS}+C{ROW_FAIL}),"")'),
    ("P1 failures — release blockers",
     f'=COUNTIFS(\'Test Cases\'!C4:C{last},"P1",\'Test Cases\'!H4:H{last},"Fail")'),
    ("Defects raised", "=COUNTA('Defect Log'!A4:A103)"),
]
for label, formula in totals:
    lc = ws.cell(row=r, column=2, value=label)
    lc.font = BODY_B
    lc.border = BOX
    vc = ws.cell(row=r, column=3, value=formula)
    vc.font = BODY
    vc.border = BOX
    if "rate" in label:
        vc.number_format = "0.0%"
    r += 1

blockers_row = ROW_P1FAIL
r += 1
ws.cell(row=r, column=2, value="Release recommendation").font = H2
r += 1
verdict = ws.cell(
    row=r, column=2,
    value=f'=IF(C{ROW_P1FAIL}>0,"DO NOT RELEASE — "&C{ROW_P1FAIL}&" P1 case(s) failed",'
          f'IF(C{ROW_FAIL}>0,"REVIEW — "&C{ROW_FAIL}&" non-P1 failure(s) present",'
          f'IF(C{ROW_NOTRUN}>0,"INCOMPLETE — "&C{ROW_NOTRUN}&" case(s) not run",'
          f'"PASS — no failures recorded")))')
verdict.font = BODY_B
verdict.fill = NOTE_FILL
verdict.border = BOX
ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4)
ws.cell(row=r, column=2).comment = Comment(
    "Calculated from the Result column on Test Cases. It reflects only what has been recorded — "
    "cases left blank are not counted as passing.", "Test suite")

# =====================================================================
# 3. Test Cases
# =====================================================================

ws = wb.create_sheet("Test Cases")
title(ws, "Test Cases", f"{n} cases · set the Result column · yellow columns are yours to fill in",
      span=12)
cols = ["ID", "Module", "Pri", "Tag", "Test case", "Steps", "Expected result",
        "Result", "Notes / actual result", "Defect ID", "Tested By", "Date"]
widths = [12, 26, 6, 12, 34, 40, 46, 11, 40, 12, 14, 12]
header_row(ws, 3, cols, widths)

for i, (module, cid, pri, tag, case, steps, expected) in enumerate(CASES):
    row = 4 + i
    values = [cid, module, pri, tag, case, steps, expected, None, None, None, None, None]
    for j, v in enumerate(values, start=1):
        c = ws.cell(row=row, column=j, value=v)
        c.font = MONO if j == 1 else BODY
        c.alignment = CTR if j in (3, 4, 8) else TOP_WRAP
        c.border = BOX
        if j >= 8:
            c.fill = INPUT_FILL
        elif i % 2:
            c.fill = BAND_FILL
    ws.row_dimensions[row].height = 30

ws.freeze_panes = "E4"
ws.auto_filter.ref = f"A3:L{3 + n}"

dv = DataValidation(type="list", formula1='"%s"' % ",".join(RESULTS), allow_blank=True,
                    showDropDown=False, promptTitle="Result",
                    prompt="Pass, Fail, Blocked or N/A. Leave blank if not run.")
ws.add_data_validation(dv)
dv.add(f"H4:H{3 + n}")

rng = f"H4:H{3 + n}"
for value, fill in (("Pass", PASS_FILL), ("Fail", FAIL_FILL),
                    ("Blocked", BLOCK_FILL), ("N/A", NA_FILL)):
    ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=[f'"{value}"'], fill=fill))

# =====================================================================
# 4. Summary
# =====================================================================

ws = wb.create_sheet("Summary")
ws.sheet_view.showGridLines = False
title(ws, "Summary", "Calculated from the Test Cases sheet. Do not type into this sheet.", span=8)
cols = ["Module", "Total", "Pass", "Fail", "Blocked", "N/A", "Not run", "Pass rate"]
widths = [34, 9, 9, 9, 10, 8, 10, 11]
header_row(ws, 3, cols, widths)

TC = "'Test Cases'"
row = 4
for module in MODULES:
    ws.cell(row=row, column=1, value=module).font = BODY
    ws.cell(row=row, column=2, value=f'=COUNTIF({TC}!$B$4:$B${last},$A{row})')
    ws.cell(row=row, column=3, value=f'=COUNTIFS({TC}!$B$4:$B${last},$A{row},{TC}!$H$4:$H${last},"Pass")')
    ws.cell(row=row, column=4, value=f'=COUNTIFS({TC}!$B$4:$B${last},$A{row},{TC}!$H$4:$H${last},"Fail")')
    ws.cell(row=row, column=5, value=f'=COUNTIFS({TC}!$B$4:$B${last},$A{row},{TC}!$H$4:$H${last},"Blocked")')
    ws.cell(row=row, column=6, value=f'=COUNTIFS({TC}!$B$4:$B${last},$A{row},{TC}!$H$4:$H${last},"N/A")')
    ws.cell(row=row, column=7, value=f'=B{row}-C{row}-D{row}-E{row}-F{row}')
    pr = ws.cell(row=row, column=8, value=f'=IFERROR(C{row}/(C{row}+D{row}),"")')
    pr.number_format = "0.0%"
    for j in range(1, 9):
        c = ws.cell(row=row, column=j)
        c.font = BODY
        c.border = BOX
        if j > 1:
            c.alignment = CTR
    row += 1

tot = row
ws.cell(row=tot, column=1, value="TOTAL").font = BODY_B
for j, letter in zip(range(2, 8), "BCDEFG"):
    c = ws.cell(row=tot, column=j, value=f'=SUM({letter}4:{letter}{tot - 1})')
    c.font = BODY_B
    c.alignment = CTR
pr = ws.cell(row=tot, column=8, value=f'=IFERROR(C{tot}/(C{tot}+D{tot}),"")')
pr.font = BODY_B
pr.number_format = "0.0%"
pr.alignment = CTR
for j in range(1, 9):
    ws.cell(row=tot, column=j).border = BOX
    ws.cell(row=tot, column=j).fill = BAND_FILL

row = tot + 2
ws.cell(row=row, column=1, value="By priority").font = H2
row += 1
header_row(ws, row, ["Priority", "Total", "Pass", "Fail", "Blocked", "N/A", "Not run", "Pass rate"], widths)
for pri in ("P1", "P2", "P3"):
    row += 1
    ws.cell(row=row, column=1, value=pri).font = BODY_B
    ws.cell(row=row, column=2, value=f'=COUNTIF({TC}!$C$4:$C${last},$A{row})')
    ws.cell(row=row, column=3, value=f'=COUNTIFS({TC}!$C$4:$C${last},$A{row},{TC}!$H$4:$H${last},"Pass")')
    ws.cell(row=row, column=4, value=f'=COUNTIFS({TC}!$C$4:$C${last},$A{row},{TC}!$H$4:$H${last},"Fail")')
    ws.cell(row=row, column=5, value=f'=COUNTIFS({TC}!$C$4:$C${last},$A{row},{TC}!$H$4:$H${last},"Blocked")')
    ws.cell(row=row, column=6, value=f'=COUNTIFS({TC}!$C$4:$C${last},$A{row},{TC}!$H$4:$H${last},"N/A")')
    ws.cell(row=row, column=7, value=f'=B{row}-C{row}-D{row}-E{row}-F{row}')
    pr = ws.cell(row=row, column=8, value=f'=IFERROR(C{row}/(C{row}+D{row}),"")')
    pr.number_format = "0.0%"
    for j in range(1, 9):
        c = ws.cell(row=row, column=j)
        c.font = BODY_B if j == 1 else BODY
        c.border = BOX
        if j > 1:
            c.alignment = CTR

p1_fail_row = row - 2
row += 2
ws.cell(row=row, column=1, value="Exit criteria").font = H2
row += 1
crit = [
    ("All P1 cases pass",
     f'=IF(D{p1_fail_row}>0,"NOT MET — "&D{p1_fail_row}&" P1 failure(s)",'
     f'IF(G{p1_fail_row}>0,"INCOMPLETE — "&G{p1_fail_row}&" P1 case(s) not run","MET"))'),
    ("No unexplained failures anywhere",
     f'=IF(D{tot}>0,"REVIEW — "&D{tot}&" failure(s) recorded","MET")'),
    ("Every case accounted for",
     f'=IF(G{tot}>0,"INCOMPLETE — "&G{tot}&" case(s) not run","MET")'),
]
for label, formula in crit:
    ws.cell(row=row, column=1, value=label).font = BODY_B
    c = ws.cell(row=row, column=2, value=formula)
    c.font = BODY
    c.fill = NOTE_FILL
    ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=8)
    for j in range(1, 9):
        ws.cell(row=row, column=j).border = BOX
    row += 1

# =====================================================================
# 5. Defect Log
# =====================================================================

ws = wb.create_sheet("Defect Log")
title(ws, "Defect Log", "One row per defect. Put the ID back in the Test Cases 'Defect ID' column.",
      span=11)
cols = ["Defect ID", "Test case ID", "Title", "Module", "Severity", "Priority",
        "Steps to reproduce", "Expected", "Actual", "Status", "Raised by"]
widths = [12, 13, 40, 24, 12, 10, 44, 32, 32, 13, 14]
header_row(ws, 3, cols, widths)

DEFECT_ROWS = 100
for i in range(DEFECT_ROWS):
    row = 4 + i
    for j in range(1, len(cols) + 1):
        c = ws.cell(row=row, column=j)
        c.font = MONO if j == 1 else BODY
        c.alignment = CTR if j in (5, 6, 10) else TOP_WRAP
        c.border = BOX
        c.fill = INPUT_FILL
    ws.row_dimensions[row].height = 26

ws.freeze_panes = "C4"
ws.auto_filter.ref = f"A3:K{3 + DEFECT_ROWS}"

for spec, col in (
    ('"Critical,High,Medium,Low"', "E"),
    ('"P1,P2,P3"', "F"),
    ('"Open,In progress,Fixed,Verified,Won\'t fix,Duplicate"', "J"),
):
    d = DataValidation(type="list", formula1=spec, allow_blank=True, showDropDown=False)
    ws.add_data_validation(d)
    d.add(f"{col}4:{col}{3 + DEFECT_ROWS}")

sev = f"E4:E{3 + DEFECT_ROWS}"
ws.conditional_formatting.add(sev, CellIsRule(operator="equal", formula=['"Critical"'], fill=FAIL_FILL))
ws.conditional_formatting.add(sev, CellIsRule(operator="equal", formula=['"High"'], fill=BLOCK_FILL))

ws.cell(row=3, column=1).comment = Comment(
    "A defect in authentication, authorization or financial calculation is never Low.\n\n"
    "Evidence for these is clinical data — keep it in the project's gitignored evidence/ folder, "
    "not in a public tracker.", "Test suite")

# =====================================================================
# 6. Regression Checklist
# =====================================================================

ws = wb.create_sheet("Regression Checklist")
title(ws, "Post-Deploy Regression Checklist",
      "Run after every deploy. About 30 minutes. Everything here is read-only and safe on production.",
      span=6)
cols = ["#", "Section", "Check", "Expected", "Result", "Notes"]
widths = [7, 26, 46, 46, 11, 34]
header_row(ws, 3, cols, widths)

CHECKS = [
    ("A. Deploy landed", "A1", "Backup exists and is not empty (ls -lh ~/medbill-*.dump)", "Size in MB. A 0-byte file is not a backup."),
    ("A. Deploy landed", "A2", "The commit moved (git log --oneline -1)", "The SHA you intended to deploy"),
    ("A. Deploy landed", "A3", "Containers are up (docker ps)", "db, api and web all running"),
    ("A. Deploy landed", "A4", "The bundle is new (npm run test:smoke)", "7 passed, including the stale-bundle check"),
    ("B. No data loss", "B1", "Row counts unchanged vs before the deploy", "diff of before/after counts is empty"),
    ("B. No data loss", "B2", "Password hashes unchanged", "diff of before/after user hashes is empty"),
    ("B. No data loss", "B3", "MFA enrolments intact", "user_mfa count unchanged"),
    ("B. No data loss", "B4", "Trusted devices intact", "trusted_devices count unchanged"),
    ("B. No data loss", "B5", "The release's new tables exist", "Present in the database"),
    ("C. Authentication", "C1", "Sign in with a valid account", "Reaches the application"),
    ("C. Authentication", "C2", "Wrong password", "Refused, generic message, no stack trace"),
    ("C. Authentication", "C3", "MFA behaves as configured", "Matches the intended MFA_ENFORCEMENT"),
    ("C. Authentication", "C4", "Sign out", "Returns to sign-in; Back does not re-enter"),
    ("C. Authentication", "C5", "/api/auth/me while signed out", "401"),
    ("D. Every tab renders", "D1", "Dashboard", "Renders, no console error"),
    ("D. Every tab renders", "D2", "Schedule", "Renders, no console error"),
    ("D. Every tab renders", "D3", "Patients", "Renders, no console error"),
    ("D. Every tab renders", "D4", "Clinical", "Renders, no console error"),
    ("D. Every tab renders", "D5", "Billing", "Renders, no console error"),
    ("D. Every tab renders", "D6", "Claims", "Renders, no console error"),
    ("D. Every tab renders", "D7", "Reports", "Renders, no console error"),
    ("D. Every tab renders", "D8", "Medical Record (if granted)", "Renders, no console error"),
    ("E. Money is right", "E1", "Patient ledger renders", "DOS, CPT, Charge, Adjusted, Balance present"),
    ("E. Money is right", "E2", "Balance arithmetic", "charge - paid - write-off - credits"),
    ("E. Money is right", "E3", "Claim total equals the sum of its lines", "Exactly equal"),
    ("E. Money is right", "E4", "A report reconciles with the ledger", "Totals agree"),
    ("E. Money is right", "E5", "No negative or NaN amounts", "None anywhere"),
    ("F. Authorization", "F1", "Protected routes with no credentials", "401"),
    ("F. Authorization", "F2", "Protected routes, session without the grant", "403 — do not skip this one"),
    ("F. Authorization", "F3", "Collections API while signed out", "401"),
    ("G. Claims & CMS-1500", "G1", "Claims list shows Submit and Open claim", "Both present"),
    ("G. Claims & CMS-1500", "G2", "Edit Claim from the ledger still works", "Opens and saves"),
    ("G. Claims & CMS-1500", "G3", "Workspace opens with all eight sections", "All present"),
    ("G. Claims & CMS-1500", "G4", "HCFA preview renders a fixed-size sheet", "8.5 x 11 proportions"),
    ("G. Claims & CMS-1500", "G5", "Print menu: summary / preprinted / with form", "Three distinct options"),
    ("G. Claims & CMS-1500", "G6", "Electronic claim disabled with a reason", "Disabled, reason shown"),
    ("G. Claims & CMS-1500", "G7", "Alignment controls and test page available", "Present"),
]

for i, (section, num, check, expected) in enumerate(CHECKS):
    row = 4 + i
    for j, v in enumerate([num, section, check, expected, None, None], start=1):
        c = ws.cell(row=row, column=j, value=v)
        c.font = MONO if j == 1 else BODY
        c.alignment = CTR if j in (1, 5) else TOP_WRAP
        c.border = BOX
        if j >= 5:
            c.fill = INPUT_FILL
        elif i % 2:
            c.fill = BAND_FILL
    ws.row_dimensions[row].height = 26

nchk = len(CHECKS)
ws.freeze_panes = "C4"
d = DataValidation(type="list", formula1='"%s"' % ",".join(RESULTS), allow_blank=True, showDropDown=False)
ws.add_data_validation(d)
d.add(f"E4:E{3 + nchk}")
for value, fill in (("Pass", PASS_FILL), ("Fail", FAIL_FILL),
                    ("Blocked", BLOCK_FILL), ("N/A", NA_FILL)):
    ws.conditional_formatting.add(f"E4:E{3 + nchk}",
                                  CellIsRule(operator="equal", formula=[f'"{value}"'], fill=fill))

row = 4 + nchk + 1
ws.cell(row=row, column=2, value="Checks passed").font = BODY_B
ws.cell(row=row, column=3, value=f'=COUNTIF(E4:E{3 + nchk},"Pass")&" of "&{nchk}').font = BODY
ws.cell(row=row + 1, column=2, value="Checks failed").font = BODY_B
ws.cell(row=row + 1, column=3, value=f'=COUNTIF(E4:E{3 + nchk},"Fail")').font = BODY
ws.cell(row=row + 2, column=2, value="Verdict").font = BODY_B
v = ws.cell(row=row + 2, column=3,
            value=f'=IF(COUNTIF(E4:E{3 + nchk},"Fail")>0,'
                  f'"FAIL — sections B, C, E and F are release blockers; consider rolling back",'
                  f'IF(COUNTA(E4:E{3 + nchk})<{nchk},"INCOMPLETE","PASS"))')
v.font = BODY_B
v.fill = NOTE_FILL
ws.merge_cells(start_row=row + 2, start_column=3, end_row=row + 2, end_column=4)

for name in wb.sheetnames:
    wb[name].sheet_properties.tabColor = "1F3864"

# openpyxl writes formulas with no cached results, so anything that does not calculate would
# show blanks. This flag tells Excel, LibreOffice and Google Sheets to do a full recalculation the
# moment the file opens, which is what a tester will do before reading any number from it.
wb.calculation.fullCalcOnLoad = True

OUT.parent.mkdir(parents=True, exist_ok=True)
wb.save(OUT)
print(f"written: {OUT}")
print(f"cases: {n} across {len(MODULES)} modules; checklist rows: {nchk}")
