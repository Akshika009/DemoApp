# PepsiCo Contracts Input App

Databricks-connected web app for:
- Viewing contracts from `dis_pfc_con_gold_test.pbc_afh_contract`
- Uploading new contracts (with optional multi-year expansion)
- Overriding existing contract pricing

## Tech Stack
- Frontend: React + Vite
- Backend: Flask + Databricks SQL Connector

## Backend Setup
1. Create/update `backend/.env` from `backend/.env.example`.
2. Set real Databricks SQL Warehouse credentials:
   - `DATABRICKS_SERVER_HOSTNAME`
   - `DATABRICKS_HTTP_PATH`
   - `DATABRICKS_ACCESS_TOKEN`
3. Set table path:
   - `DATABRICKS_TABLE=dis_pfc_con_gold_test.pbc_afh_contract`
4. (Optional, for AI assistant) set:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` (example: `gpt-4.1-mini`)

Install backend dependencies:

```powershell
backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Run backend:

```powershell
backend\venv\Scripts\python.exe backend\app.py
```

## Frontend Setup
Install frontend dependencies:

```powershell
npm install
```

Run frontend:

```powershell
npm run dev
```

In local dev, Vite proxies `/health`, `/contracts`, and `/metadata` to `http://localhost:5000`.
To use an explicit API URL, set `VITE_API_BASE_URL`.

## Databricks Apps Deployment
This repo is configured for Databricks Apps deployment:
- `app.yaml` runs: `python backend/app.py`
- `requirements.txt` at repo root installs backend Python dependencies
- `npm run build` generates frontend assets under `dist/`
- Flask serves the built frontend and API from one process

Deploy steps:
1. In Databricks App page, click `Deploy`.
2. Select Git source (or workspace folder) pointing to this repo root.
3. Set environment variables in App Environment:
   - `DATABRICKS_SERVER_HOSTNAME`
   - `DATABRICKS_HTTP_PATH`
   - `DATABRICKS_ACCESS_TOKEN` (as secret)
   - `DATABRICKS_TABLE=dis_pfc_con_gold_test.pbc_afh_contract`
4. Redeploy and check app logs.

## Health and Connectivity Endpoints
- `GET /health` : config + connector status
- `GET /health/databricks` : live Databricks connectivity and table readability check

## Key API Endpoints
- `GET /contracts`
- `GET /contracts/summary`
- `GET /metadata/distributors`
- `GET /metadata/chains`
- `GET /metadata/distribution-centers`
- `GET /metadata/packs`
- `POST /contracts/upload`
- `POST /contracts/override`
- `POST /assistant/chat`
