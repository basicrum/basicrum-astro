#!/bin/sh
# Tracked text files must be plain ASCII: hyphens instead of dashes, straight
# quotes, and words instead of arrows. Vendored files and the lockfile are
# exempt because they are not authored here.

set -eu

repository_root=$( git rev-parse --show-toplevel 2>/dev/null ) || {
	printf '%s\n' 'ASCII check must run inside a Git worktree.' >&2
	exit 1
}

cd "$repository_root"

set +e
matches=$( LC_ALL=C git grep -nI '[^[:print:][:space:]]' -- . ':!vendor' ':!package-lock.json' )
status=$?
set -e

case "$status" in
	0)
		printf '%s\n' 'ASCII check failed: replace non-ASCII characters (dashes, quotes, arrows) with ASCII equivalents.' >&2
		printf '%s\n' "$matches" >&2
		exit 1
		;;
	1)
		printf '%s\n' 'ASCII check passed.'
		;;
	*)
		printf '%s\n' 'ASCII check could not search tracked text files.' >&2
		exit "$status"
		;;
esac
