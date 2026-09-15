SC Manufacturing Console — Pure Flask Deploy Bundle
=====================================================

Branch: cursor/flask-pure-python-e63a
Runtime: Python 3.10+ only (no npm, no React)

CONTENTS
--------
  app.py, views.py, cache.py, supervisor.py, claude_supervisor.py
  templates/index.html
  py_server/              KPI SQL engine (/api/metrics/*)
  config/queries/*.sql
  requirements.txt, app.yaml, setup.sh

DEPLOY
------
  pip install -r requirements.txt   (or ./setup.sh)
  python app.py

Verify:
  /api/status
  /                         (Flask template UI)
