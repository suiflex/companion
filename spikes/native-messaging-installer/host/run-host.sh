#!/bin/sh
# Wrapper referenced by the native-messaging manifest. Chrome execs this directly.
{
  echo "--- invoked $(date -u +%FT%TZ) argv: $@"
  id
  echo "pwd: $(pwd)"
  env | sort
} >> /tmp/meetcc-spike-host-env.txt 2>&1
exec "/Users/badrusshoolehk/.local/bin/node" "/Users/badrusshoolehk/Documents/riset/suiflex/extension-meet/spikes/native-messaging-installer/host/host.cjs" "$@"
