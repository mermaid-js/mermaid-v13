#!/usr/bin/env bash
# Upload a screenshot folder to Argos as one build, sent in several parts.
#
# One upload of the whole folder ends in a single "finalize" request that lists every
# screenshot; with a few thousand of them Argos answers HTTP 413. So the folders that hold
# images are dealt round-robin into parts, each part is uploaded in Argos's parallel mode, and
# Argos joins them into one build once the last part has arrived.
#
#   argos-upload.sh [directory]     default: e2e/screenshots
#
# Reads ARGOS_TOKEN, ARGOS_REFERENCE_BRANCH and ARGOS_BUILD_NAME like `argos upload` itself.
# ARGOS_PARALLEL_NONCE must be set and be the same for every part of one build.
# ARGOS_UPLOAD_PARTS is the largest number of parts (default 5).
set -euo pipefail

dir=${1:-e2e/screenshots}
max_parts=${ARGOS_UPLOAD_PARTS:-5}

if [ -z "${ARGOS_PARALLEL_NONCE:-}" ]; then
  echo "argos-upload: ARGOS_PARALLEL_NONCE is not set" >&2
  exit 1
fi
if [ ! -d "$dir" ]; then
  echo "argos-upload: no screenshot folder at $dir" >&2
  exit 1
fi

# Every folder that directly holds a PNG, relative to $dir.
groups=()
while IFS= read -r group; do
  groups+=("$group")
done < <(cd "$dir" && find . -type f -name '*.png' | sed -e 's#/[^/]*$##' -e 's#^\./##' | sort -u)

if [ "${#groups[@]}" -eq 0 ]; then
  echo "argos-upload: no screenshots under $dir" >&2
  exit 1
fi

# Never more parts than folders: Argos waits for every part it was told to expect.
parts=$max_parts
if [ "${#groups[@]}" -lt "$parts" ]; then
  parts=${#groups[@]}
fi

for part in $(seq 1 "$parts"); do
  globs=()
  for index in "${!groups[@]}"; do
    # `/*.png`, not `/**`: the parts must not overlap, and the `<name>.png.argos.json`
    # metadata files beside the images are read by Argos itself, not uploaded as images.
    if [ $((index % parts + 1)) -eq "$part" ]; then
      globs+=("${groups[$index]}/*.png")
    fi
  done
  echo "argos-upload: part $part of $parts, ${#globs[@]} folders"
  pnpm exec argos upload "$dir" \
    --files "${globs[@]}" \
    --parallel --parallel-total "$parts" --parallel-index "$part"
done
