#!/usr/bin/env bash
# Pass when the latest CI run on HEAD of the current branch has both Windows
# jobs green. Each --artifact NAME (repeatable) also requires that artifact on the run.
# --wait polls until the run for HEAD exists and has completed (max 40 minutes).
# Usage: scripts/check-windows-ci.sh [--wait] [--artifact NAME]...
set -euo pipefail

wait=0
artifacts=()
while [ $# -gt 0 ]; do
  case "$1" in
    --wait) wait=1; shift ;;
    --artifact) artifacts+=("${2:?--artifact needs a NAME}"); shift 2 ;;
    *) echo "usage: $0 [--wait] [--artifact NAME]..." >&2; exit 2 ;;
  esac
done

sha=$(git rev-parse HEAD)
branch=$(git rev-parse --abbrev-ref HEAD)

# Detached HEAD (af-pm repo checkouts): find the run by commit alone.
branch_arg=(--branch "$branch")
[ "$branch" = HEAD ] && branch_arg=()

find_run() {
  gh run list --workflow CI ${branch_arg[@]+"${branch_arg[@]}"} --commit "$sha" \
    --limit 1 --json databaseId,status --jq '.[0] | select(.) | "\(.databaseId) \(.status)"'
}

deadline=$((SECONDS + 2400))
while :; do
  found=$(find_run)
  run_id=${found%% *}
  status=${found#* }
  if [ -n "$found" ] && { [ "$wait" = 0 ] || [ "$status" = completed ]; }; then
    break
  fi
  if [ "$wait" = 0 ]; then
    echo "no CI run for $branch@$sha" >&2
    exit 1
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "timed out after 40 minutes waiting for CI on $branch@$sha (${found:-no run})" >&2
    exit 1
  fi
  echo "waiting for CI on $branch@${sha:0:7}: ${found:-no run yet}" >&2
  sleep 20
done

fail=0
for os in windows-latest windows-11-arm; do
  conclusion=$(gh run view "$run_id" --json jobs \
    --jq ".jobs[] | select(.name == \"windows ($os)\") | .conclusion")
  echo "windows ($os): ${conclusion:-missing}"
  [ "$conclusion" = "success" ] || fail=1
done

if [ ${#artifacts[@]} -gt 0 ]; then
  repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
  for artifact in "${artifacts[@]}"; do
    found=$(gh api "repos/$repo/actions/runs/$run_id/artifacts" \
      --jq ".artifacts[] | select(.name == \"$artifact\" and (.expired | not)) | .name")
    echo "artifact $artifact: ${found:-missing}"
    [ -n "$found" ] || fail=1
  done
fi

[ "$fail" = 0 ] || { echo "Windows CI not green for run $run_id" >&2; exit 1; }
echo "Windows CI green for run $run_id"
