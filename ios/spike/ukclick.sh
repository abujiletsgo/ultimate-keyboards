#!/bin/zsh
# Spike helper: click an element by label regex in the "UK Spike iPhone" Simulator window only.
# usage: ukclick.sh <label-regex>   (prints matches; clicks the first)
W=$(orca computer list-windows --app Simulator --json | python3 -c "import sys,json;[print(w['id']) for w in json.load(sys.stdin)['result']['windows'] if 'UK Spike' in w['title']]")
T=$(orca computer get-app-state --app Simulator --window-id $W --no-screenshot --json | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['snapshot']['treeText'])")
M=$(echo "$T" | grep -E "^[[:space:]]*[0-9]+ .*($1)")
echo "$M" | head -5
I=$(echo "$M" | head -1 | awk '{print $1}')
[ -z "$I" ] && { echo "no match"; exit 1; }
orca computer click --app Simulator --window-id $W --element-index $I --no-screenshot --json | grep '"ok"'
