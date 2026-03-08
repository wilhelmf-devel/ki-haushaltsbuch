#!/usr/bin/env bash
# Bump the Service Worker cache version before deploying.
# Creates a timestamp-based version so iOS Safari is forced to fetch fresh assets.
#
# Usage: bash scripts/deploy-bump.sh
# Or add to your deploy workflow:  bash scripts/deploy-bump.sh && docker-compose up --build -d

set -e

SW_FILE="public/sw.js"
NEW_VERSION="v$(date +%Y%m%d%H%M)"

# Replace CACHE_VERSION line
sed -i.bak "s/const CACHE_VERSION = '[^']*'/const CACHE_VERSION = '${NEW_VERSION}'/" "$SW_FILE"
rm -f "${SW_FILE}.bak"

echo "✓ Cache version bumped to ${NEW_VERSION} in ${SW_FILE}"
