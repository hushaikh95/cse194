"""Join NLIHC area figures to counties -> data/counties.json.

Run:  python3 scripts/build_data.py
Inputs:  data/areas.csv (NLIHC Out of Reach 2026, by HUD rental area)
         data/county_to_area.csv (which HUD rental area each county falls in)
"""
import csv, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIN_WAGE = 16.90          # California state minimum wage, 2026
DATA_AS_OF = "NLIHC Out of Reach 2026 (July 2026)"

areas = {r["area"]: r for r in csv.DictReader(open(ROOT / "data/areas.csv"))}
rows = list(csv.DictReader(open(ROOT / "data/county_to_area.csv")))
assert len(rows) == 58, len(rows)

def figures(a):
    hw = float(a["housing_wage_2br"])
    return {
        "fmr_2br": int(a["fmr_2br"]),
        "housing_wage": hw,
        "median_renter_income": int(a["median_renter_hh_income"]),
        # weekly hours at minimum wage to afford 2BR (NLIHC method: housing wage * 40 / min wage)
        "hours_min_wage": round(hw * 40 / MIN_WAGE),
        "jobs_min_wage": round(hw / MIN_WAGE, 1),
        # annual income needed so rent is 30% of income
        "income_needed": int(a["fmr_2br"]) * 12 / 0.30,
    }

counties = []
for r in rows:
    a = areas[r["area"]]  # KeyError here means a typo in county_to_area.csv
    counties.append({"county": r["county"], "area": r["area"],
                     "nonmetro_estimate": r["area"] == "California Non-metropolitan areas",
                     **figures(a)})

out = {"data_as_of": DATA_AS_OF, "min_wage": MIN_WAGE,
       "state": figures(areas["California"]), "counties": counties}
(ROOT / "data/counties.json").write_text(json.dumps(out, indent=1))
print(f"wrote {len(counties)} counties; statewide hours at min wage = {out['state']['hours_min_wage']}")
