# Rent vs. Paycheck: California's Housing Affordability Gap

A free public site (CSE 194, UCSD) comparing two-bedroom rent with the minimum wage in each California county.

## Run locally
```
python3 -m http.server 8000   # then open http://localhost:8000
```
(Opening index.html directly won't load the data, because browsers block local fetches.)

## Deploy (GitHub Pages)
Push this folder to a public repo → Settings → Pages → "Deploy from a branch" → `main` / root.

## Data
| File | What |
|---|---|
| `data/areas.csv` | NLIHC Out of Reach 2026 figures by HUD rental area (2BR FMR, housing wage, median renter household income) |
| `data/county_to_area.csv` | Which HUD rental area each of the 58 counties is in |
| `data/counties.json` | Generated: `python3 scripts/build_data.py` |
| `data/ca-counties.json` | County shapes (Census via us-atlas); `scripts/build_geo.js` regenerates it |

To update the numbers, edit the CSVs and re-run `python3 scripts/build_data.py`.

## Known gaps / next steps
- 20 rural non-metro counties use NLIHC's combined CA non-metro average. Replace them with county figures from NLIHC's `2026-OOR-CA.xlsx`.
- Job pay (BLS OEWS, by metro area), earlier years, policy timeline, inflation toggle.
- Local city minimum wages aren't included (state $16.90 only).
