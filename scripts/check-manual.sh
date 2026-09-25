#!/usr/bin/env bash
# Fails when staged user-facing changes don't come with a docs/MANUAL.md update.
# Usage: check-manual.sh <commit-msg-file>   (prek commit-msg stage)
#        check-manual.sh --claude             (Claude PreToolUse hook; reads hook JSON on stdin)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

if [ "${1:-}" = "--claude" ]; then
  msg=$(jq -r '.tool_input.command // ""')
  case "$msg" in *"git commit"*) ;; *) exit 0 ;; esac
  # `git commit -a` stages tracked changes at commit time, so look at the worktree too
  case "$msg" in *" -a"*|*"--all"*) files=$(git diff --name-only HEAD) ;; *) files=$(git diff --cached --name-only) ;; esac
else
  msg=$(cat "${1:?commit message file}")
  files=$(git diff --cached --name-only)
fi

case "$msg" in *"[skip-manual]"*) exit 0 ;; esac
grep -qx 'docs/MANUAL.md' <<<"$files" && exit 0
grep -qE '^src/(app/|components/|lib/(i18n|topics|vocab)\.ts)' <<<"$files" || exit 0

echo "User-facing code changed but docs/MANUAL.md is not part of this commit." >&2
echo "Update docs/MANUAL.md (and stage it), or add [skip-manual] to the commit message if nothing players see changed." >&2
exit 2
