#!/usr/bin/env bash
# Install Python dependencies for Databricks App (no Node required).
set -euo pipefail
pip install -r requirements.txt
echo "Python dependencies installed."
