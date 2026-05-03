#!/bin/bash

# PostToolUse hook: Run ESLint on TypeScript files after Write or Edit.
# Reports issues as a system message to the user — does not block Claude.

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only lint TypeScript files
if ! printf '%s' "$FILE_PATH" | grep -qE '\.(ts|tsx)$'; then
  exit 0
fi

# Skip files outside src/ and e2e/
if ! printf '%s' "$FILE_PATH" | grep -qE '/(src|e2e)/'; then
  exit 0
fi

# Skip test mock files and type declaration files
if printf '%s' "$FILE_PATH" | grep -qE '(__mocks__|\.d\.ts$)'; then
  exit 0
fi

# Skip if file doesn't exist (e.g. mid-rename)
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

ESLINT_BIN="$CLAUDE_PROJECT_DIR/node_modules/.bin/eslint"
if [ ! -x "$ESLINT_BIN" ]; then
  jq -n --arg msg "auto-lint: ESLint binary not found at $ESLINT_BIN — run pnpm install" \
    '{systemMessage: $msg, suppressOutput: true}'
  exit 0
fi

OUTPUT=$("$ESLINT_BIN" --cache --no-warn-ignored "$FILE_PATH" 2>&1)
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  MSG=$(printf 'ESLint issues in %s:\n%s' "$FILE_PATH" "$OUTPUT")
  jq -n --arg msg "$MSG" '{systemMessage: $msg, suppressOutput: true}'
fi

exit 0
