#!/usr/bin/env bash
# Pass when the latest CI run on HEAD of the current branch has both Windows
# jobs green. --artifact NAME also requires that artifact on the run.
# Usage: scripts/check-windows-ci.sh [--artifact NAME]
set -euo pipefail

artifact=""
if [ "${1:-}" = "--artifact" ]; then
  artifact="${2:?--artifact needs a NAME}"
fi

sha=$(git rev-parse HEAD)
branch=$(git rev-parse --abbrev-ref HEAD)

# Detached HEAD (af-pm repo checkouts): find the run by commit alone.
branch_arg=(--branch "$branch")
[ "$branch" = HEAD ] && branch_arg=()
run_id=$(gh run list --workflow CI ${branch_arg[@]+"${branch_arg[@]}"} --commit "$sha" \
  --limit 1 --json databaseId --jq '.[0].databaseId // empty')
if [ -z "$run_id" ]; then
  echo "no CI run for $branch@$sha" >&2
  exit 1
fi

fail=0
for os in windows-latest windows-11-arm; do
  conclusion=$(gh run view "$run_id" --json jobs \
    --jq ".jobs[] | select(.name == \"windows ($os)\") | .conclusion")
  echo "windows ($os): ${conclusion:-missing}"
  [ "$conclusion" = "success" ] || fail=1
done

if [ -n "$artifact" ]; then
  repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
  found=$(gh api "repos/$repo/actions/runs/$run_id/artifacts" \
    --jq ".artifacts[] | select(.name == \"$artifact\" and (.expired | not)) | .name")
  echo "artifact $artifact: ${found:-missing}"
  [ -n "$found" ] || fail=1
fi

[ "$fail" = 0 ] || { echo "Windows CI not green for run $run_id" >&2; exit 1; }
echo "Windows CI green for run $run_id"
