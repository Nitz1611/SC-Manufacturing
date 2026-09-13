# SC Manufacturing Console

Manufacturing analytics console for unplanned downtime (DT %), aligned with **VR Dashboard development standards**.

## Quick start

```bash
npm install
npm run dev
```

| Service | URL |
|---------|-----|
| React client (Vite) | http://localhost:5173 |
| Node API server | http://localhost:8000 |

See [docs/ARCHITECTURE-SC.md](docs/ARCHITECTURE-SC.md) for VR architecture mapping, query catalog, and migration status.

## Legacy Flask app

The original Flask implementation remains for reference:

```bash
pip install -r requirements.txt
python app.py
```

Use the Node + React stack for new development.
