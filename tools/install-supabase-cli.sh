#!/usr/bin/env bash
# Installs the Supabase CLI for the CI `db` job and the migrate workflow from tools/supabase-cli/package-lock.json:
# `npm ci --ignore-scripts` fails unless every tarball (the wrapper and the platform binary package) matches the
# sha512 integrity hash committed in the lockfile, so a replaced release cannot get in. Run before any step holds a secret.
set -euo pipefail
dir="tools/supabase-cli"
want="$(node -p "require('./${dir}/package.json').dependencies.supabase")"
if [ -n "${SUPABASE_CLI_VERSION:-}" ] && [ "${SUPABASE_CLI_VERSION}" != "${want}" ]; then
  echo "::error::SUPABASE_CLI_VERSION (${SUPABASE_CLI_VERSION}) differs from ${dir}/package.json (${want})"
  exit 1
fi
npm ci --ignore-scripts --no-audit --no-fund --prefix "${dir}"
bin="$(pwd)/${dir}/node_modules/.bin"
got="$("${bin}/supabase" --version)"
if [ "${got}" != "${want}" ]; then
  echo "::error::installed Supabase CLI is ${got}, expected ${want}"
  exit 1
fi
echo "${bin}" >> "${GITHUB_PATH}"
