#!/usr/bin/env bash
set -euo pipefail

# The repo is linked to two Vercel projects (fastt + fastt-five). Both would build every
# PR preview and exhaust the Hobby deploy quota. Previews for review use Vercel – fastt only.
if [ "${VERCEL_PROJECT_NAME:-}" = "fastt-five" ] && [ "${VERCEL_ENV:-}" = "preview" ]; then
	echo "Skipping fastt-five preview; use the fastt project preview."
	exit 0
fi

exit 1
