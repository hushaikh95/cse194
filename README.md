# Rent vs. Paycheck: Two Decades of California's Housing Affordability Gap

A free public site (CSE 194, UCSD) comparing two-bedroom rent with the minimum wage and pay for common jobs in every California county, 2006–2026.

## Run locally
```
python3 -m http.server 8000   # then open http://localhost:8000
```

## Deploy (GitHub Pages)
Push this folder to a public repo → Settings → Pages → "Deploy from a branch" → `main` / root.

## Features
- County map colored by hours/week at minimum wage, rent, or housing wage, with a year slider (2006–2026)
- Toggle between dollars as reported and inflation-adjusted 2025 dollars
- County history chart (wage needed vs. minimum wage) with a state policy timeline and a "timing is not cause" note
- Median pay for 8 common jobs (BLS), with pay growth compared to rent growth
- New homes permitted per year, renter cost burden, and rental vacancy
- Ranked chart, sortable table, competing-explanations section, and methods with 16 sources

## Data pipeline
`python3 scripts/build_data.py` turns `data/raw/*` into `data/site.json`.

| File | Source | Check |
|---|---|---|
| `raw/hud_fmr_2br_ca.csv` | HUD FMR History 1983–present (2BR), CA rows | 58 rows; column sum matched source |
| `raw/bls_oews_median_hourly_hist.csv` | BLS OEWS May 2016/2020/2023 area pages | 231 rows; sum matched |
| `raw/bls_oews_median_hourly_2025.csv` | BLS OEWS May 2025 (data.bls.gov) | 223 values; sum matched |
| `raw/census_bps_permits_ca.csv` | Census BPS annual county files 2006–2025 (`total/5+ units`) | 58 rows; sum matched |
| `raw/acs5_2024_renters_ca.csv` | ACS 5-yr 2020–2024 table-based summary files B25003, B25004, B25070 | 58 rows; sum matched |
| `raw/ca_min_wage.csv` | CA DIR minimum wage history (26+ employee rate) | |
| `raw/cpi_u_us_annual.csv` | BLS CPI-U annual average via FRED | |
| `raw/nlihc_oor_2026_areas.csv` | NLIHC Out of Reach 2026 (cross-check only) | all 2026 metro rents match HUD |
| `county_to_oews.csv` | BLS county → OEWS area definitions (2025) | |
| `policy_events.json` | Hand-compiled from leginfo, DIR, CA courts, Secretary of State | |

## Team review checklist (before launch)
- [ ] Second member spot-checks 5 counties in each raw file against the source
- [ ] Policy timeline dates checked against bill texts
- [ ] Neutral-wording review of the explanations section by people with differing views
- [ ] Launch on GitHub Pages

## Known limits
- Local city minimum wages aren't included (state rate only).
- Job pay is by metro/rural area, not county; 2016 rural-area pay is missing for two BLS regions.
- ACS figures are 5-year estimates with margins of error, larger in small counties.
