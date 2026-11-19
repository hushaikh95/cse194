"""Build data/site.json from the raw source files in data/raw/.

Run:  python3 scripts/build_data.py

Sources (all government data; see README for download steps):
  raw/hud_fmr_2br_ca.csv            HUD FMR History 1983-present, 2-bedroom, CA counties
  raw/ca_min_wage.csv               CA Dept. of Industrial Relations, state minimum wage
  raw/cpi_u_us_annual.csv           BLS CPI-U, U.S. city average, annual average (via FRED)
  raw/bls_oews_median_hourly_*.csv  BLS OEWS median hourly pay by metro/nonmetro area
  raw/census_bps_permits_ca.csv     Census Building Permits Survey, annual county totals
  raw/acs5_2024_renters_ca.csv      Census ACS 5-year 2020-2024: tables B25003, B25004, B25070
  county_to_oews.csv                BLS county -> OEWS area definitions
  policy_events.json                state policy timeline (hand-compiled, sources in README)
"""
import csv, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / "data"
YEARS = list(range(2006, 2027))
JOB_YEARS = [2016, 2020, 2023, 2025]
OCC = {
    "00-0000": "All jobs (median)",
    "41-2011": "Cashier",
    "41-2031": "Retail salesperson",
    "35-3031": "Waiter / waitress",
    "37-2011": "Janitor",
    "53-7062": "Warehouse / freight laborer",
    "43-4051": "Customer service rep",
    "29-1141": "Registered nurse",
}

def rows(name):
    return list(csv.DictReader(open(D / name)))

def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None   # BLS footnotes like "(8)" = estimate not released

# ---- state-level series ----
min_wage = {int(r["year"]): float(r["min_wage"]) for r in rows("raw/ca_min_wage.csv")}
cpi = {int(r["year"]): float(r["cpi_u"]) for r in rows("raw/cpi_u_us_annual.csv")}
cpi[2026] = cpi[2025]          # 2026 annual CPI not published yet: 2026 shown at 2025 prices
to_2025 = {y: round(cpi[2025] / cpi[y], 4) for y in YEARS}

def housing_wage(fmr):
    # NLIHC method: rent is 30% of income, full-time = 2,080 hours/year
    return round(fmr * 12 / 0.30 / 2080, 2)

# ---- per-county ----
fmr = {r["name"].replace(" County", ""): r for r in rows("raw/hud_fmr_2br_ca.csv")}
oews_map = {r["county"]: r for r in rows("county_to_oews.csv")}
acs = {r["fips"]: r for r in rows("raw/acs5_2024_renters_ca.csv")}
permits = {r["fips"]: r for r in rows("raw/census_bps_permits_ca.csv")}

jobs_by_area = {}
for r in rows("raw/bls_oews_median_hourly_hist.csv"):
    for y in (2016, 2020, 2023):
        jobs_by_area.setdefault(r["code"], {}).setdefault(r["occ"], {})[y] = num(r[str(y)])
for r in rows("raw/bls_oews_median_hourly_2025.csv"):
    jobs_by_area.setdefault(r["code"], {}).setdefault(r["occ"], {})[2025] = num(r["median_hourly"])

assert len(fmr) == 58 and len(oews_map) == 58 and len(acs) == 58 and len(permits) == 58

counties = []
for name, f in sorted(fmr.items()):
    fips = f["fips"][2:5]
    rent = {y: int(f[str(y)]) for y in YEARS}
    om = oews_map[name]
    jobs = {}
    for code, label in OCC.items():
        series = {}
        for y in JOB_YEARS:
            area = om["oews_code"] if y == 2025 else om["hist_code"]
            v = jobs_by_area.get(area, {}).get(code, {}).get(y)
            if v is not None:
                series[y] = v
        jobs[code] = series
    a = acs[fips]
    renters = int(a["renter_households"])
    computed = int(a["b25070_total"]) - int(a["not_computed"])
    p = permits[fips]
    counties.append({
        "county": name, "fips": "06" + fips,
        "hud_area": f["areaname26"].replace(", CA", "").replace(" HUD Metro FMR Area", " (HUD metro area)"),
        "oews_area": om["oews_area"],
        "rent": rent,
        "housing_wage": {y: housing_wage(rent[y]) for y in YEARS},
        "hours_min_wage": {y: round(housing_wage(rent[y]) * 40 / min_wage[y]) for y in YEARS},
        "jobs": jobs,
        "permits": {int(y): int(v.split("/")[0]) for y, v in p.items() if y != "fips"},
        "permits_5plus": {int(y): int(v.split("/")[1]) for y, v in p.items() if y != "fips"},
        "renter_households": renters,
        "rental_vacancy": round(int(a["vacant_for_rent"]) /
                                (renters + int(a["vacant_for_rent"]) + int(a["rented_not_occupied"])), 4),
        "cost_burden": round(int(a["burden_30plus"]) / computed, 4),
        "severe_cost_burden": round(int(a["burden_50plus"]) / computed, 4),
    })

# statewide = renter-household-weighted average of county rents (approximates NLIHC's state figure)
W = sum(c["renter_households"] for c in counties)
state_rent = {y: round(sum(c["rent"][y] * c["renter_households"] for c in counties) / W) for y in YEARS}
state = {
    "rent": state_rent,
    "housing_wage": {y: housing_wage(state_rent[y]) for y in YEARS},
    "hours_min_wage": {y: round(housing_wage(state_rent[y]) * 40 / min_wage[y]) for y in YEARS},
    "permits": {y: sum(c["permits"][y] for c in counties) for y in YEARS if y <= 2025},
    "cost_burden": round(sum(c["cost_burden"] * c["renter_households"] for c in counties) / W, 4),
    "rental_vacancy": round(sum(c["rental_vacancy"] * c["renter_households"] for c in counties) / W, 4),
}

out = {
    "years": YEARS, "job_years": JOB_YEARS, "occupations": OCC,
    "min_wage": min_wage, "to_2025_dollars": to_2025,
    "data_as_of": {
        "rent": "HUD Fair Market Rents, FY2006-FY2026",
        "min_wage": "CA DIR, through 2026",
        "jobs": "BLS OEWS May 2016, 2020, 2023, 2025",
        "permits": "Census Building Permits Survey, 2006-2025",
        "acs": "Census ACS 5-year estimates, 2020-2024",
        "cpi": "BLS CPI-U annual average through 2025",
    },
    "state": state,
    "counties": counties,
    "events": json.load(open(D / "policy_events.json")),
}
(D / "site.json").write_text(json.dumps(out, separators=(",", ":")))
print(f"wrote {len(counties)} counties, years {YEARS[0]}-{YEARS[-1]}")
print(f"statewide 2026: rent ${state_rent[2026]}, housing wage ${state['housing_wage'][2026]}, "
      f"{state['hours_min_wage'][2026]} hrs/wk at min wage (NLIHC: $2,745, $52.79, 125)")
