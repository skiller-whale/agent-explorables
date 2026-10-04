#!/bin/sh
# Publish the site. Builds a copy of local main's files without what stays local, commits it on the
# `public` branch (one commit per publish, no local history), and pushes that to origin's main, which
# GitHub Pages serves. Local main keeps everything, including its full history; origin only sees `public`.
# Stays local: recordings/ (raw runs), WIP.md and CLAUDE.md (working notes).
#   tools/publish.sh "what changed"
set -eu
EXCLUDE="recordings WIP.md CLAUDE.md"
cd "$(git rev-parse --show-toplevel)"
msg=${1:?usage: tools/publish.sh "what changed"}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export GIT_INDEX_FILE="$tmp/index"
git read-tree main
git rm -r -q --cached --ignore-unmatch $EXCLUDE
tree=$(git write-tree)
unset GIT_INDEX_FILE
parent=$(git rev-parse -q --verify refs/heads/public || true)
if [ -n "$parent" ] && [ "$(git rev-parse "$parent^{tree}")" = "$tree" ]; then echo "Nothing new to publish."; exit 0; fi
commit=$(printf '%s\n' "$msg" | git commit-tree "$tree" ${parent:+-p "$parent"})
git update-ref refs/heads/public "$commit"
git push origin public:main
