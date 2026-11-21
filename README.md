# UAE Soil Health Scorecard

Scoring, recommendation and reporting software for agricultural soils in the UAE, built for
**Innovation Oasis (part of Silal)** on the methodology developed in the Cranfield University – Silal
project *Development of UAE Soil Health Metrics and UAE Soil Health Scorecard for Desert Farming Systems*.

It turns a laboratory result into a 0–100 soil health score, shows what is limiting the soil,
generates bilingual (English / Arabic) recommendations by rule, and prints an IO-branded report.

**Live app:** enable GitHub Pages on the `docs/` folder of this repository (Settings → Pages →
Deploy from a branch → `main` / `docs`).

## What it does

| Area | Functions |
|---|---|
| Scorecard | 17 chemical indicators in 7 weighted categories, each scored 1–5 against UAE-adapted thresholds; weighted 0–100 score on the measured basis; data-coverage figure; four rating bands (Healthy, Moderate, Marginal, Poor); supplementary physical and biological indicators |
| Calculations | SAR from soluble Ca, Mg, Na; ESP from exchangeable Na and CEC; CEC by sum of cations; gypsum requirement; leaching requirement; salinity-limited yield potential (Maas–Hoffman) |
| Data quality | ECe unit check (µS/cm vs dS/m), ion balance, cations vs ECe, reported vs calculated SAR / ESP / CEC, implausible values, detection-limit handling, coverage and missing-GPS warnings |
| Recommendations | Rule-based and auditable: overall interpretation, ranked constraints, guidance for vegetables, field crops and fruit trees, crop-specific salinity note, short-term and long-term actions, monitoring plan. English and Arabic |
| Reports | A4 soil health report in English, Arabic or bilingual, printed or saved as PDF from the browser; batch printing; register of issued reports with the score and methodology version at issue |
| Farms | Registry with farm and supply numbers, owner, engineer, coordinates, map, score trend per farm |
| Irrigation water | Water samples classified against the FAO 29 guidelines; linked to soil samples for the leaching requirement |
| Analytics | Indicator statistics, comparisons by system / crop / engineer / coverage, weight-sensitivity analysis, development and validation farm sets for scorecard validation |
| Methodology | Thresholds, weights and rating bands are stored in the database, editable by an administrator and versioned; every change re-scores all samples and earlier versions can be restored |
| Administration | Users and roles (administrator, laboratory analyst, agronomist, viewer), audit log, backup and restore, CSV export, read-only SQL console, crop salt-tolerance table |
| Import | Innovation Oasis Word laboratory reports (.docx) and CSV (template downloadable in the app) |

## Database

The app uses a real relational database: **SQLite** compiled to WebAssembly ([sql.js](https://sql.js.org)),
stored in the browser (IndexedDB). Tables: `users`, `farms`, `samples`, `results`, `water_samples`,
`methodologies`, `crops`, `reports`, `audit_log`, `settings`.

* The database lives on the computer where the app is opened. Nothing is sent to a server.
* **Administration → Database and backup** downloads the whole database as a standard `.sqlite` file,
  which can be restored on another computer or opened with any SQLite tool.
* Take a backup regularly: clearing the browser's site data removes the database.

GitHub Pages serves static files only, so a database shared live between users needs a server.
The data layer is isolated in `src/db/db.ts` to make that move straightforward.

## Data and confidentiality

`public/seed.enc.json` holds the Silal laboratory dataset (soil results and farm registry) encrypted
with AES-256-GCM; the key is derived from an access key with PBKDF2-SHA-256 (600,000 iterations).
The file cannot be read without the access key, which is **not** in this repository. On first run,
choose *Silal dataset* and enter the key, or choose *Demonstration data* for invented farms.

The source laboratory reports are not part of the repository. To rebuild the bundle:

```bash
npm run seed -- "<folder of .docx reports>" <list.json> "<access key>"
```

## First run

1. Open the app and choose what the database starts with (Silal dataset, demonstration data, a backup, or empty).
2. Create the administrator account. There is no default password.
3. Add colleagues under **Administration → Users**.

## Methodology

Version 1.0 (draft, 29 May 2026), Deliverable D2 basis. Score = Σ(score ÷ 5 × weight) ÷ Σ(weight of
measured indicators) × 100. Category weights: salinity and sodicity 28, organic matter 13,
macronutrients 26, micronutrients 14, secondary nutrients 8, pH 7, CEC 4.

The thresholds and weights are a starting point that remains subject to validation against UAE
field data. Recommendations are generated from the laboratory result and should be confirmed on
site by a qualified agronomist before application rates are set.

References: Richards (1954) USDA Handbook 60; Olsen et al. (1954) USDA Circular 939; Lindsay and
Norvell (1978) SSSAJ 42:421–428; Ayers and Westcot (1985) FAO Irrigation and Drainage Paper 29;
Maas and Hoffman (1977).

## Development

```bash
npm install
npm run dev      # local development server
npm test         # scoring engine tests, including a check against the D2 workbook formulas
npm run build    # production build into docs/ (served by GitHub Pages)
```

```
src/engine/   methodology, scoring, QA checks, agronomy tables, recommendation rules, report parser
src/db/       SQLite schema and data access, encryption, demonstration data
src/ui/       React interface (dashboard, samples, farms, water, reports, analytics, admin)
scripts/      dataset bundle builder
tests/        unit tests
docs/         built site
```

React 18, TypeScript, Vite, sql.js, Leaflet. No backend.

© Innovation Oasis, part of Silal. Internal use.
