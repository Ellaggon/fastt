#!/bin/sh
set -eu
if [ "$(id -u)" = "0" ]; then
  chown clamav:clamav /var/lib/clamav
  exec su-exec clamav /app/start.sh
fi
mkdir -p /tmp/font-cache
# Update vendor signatures, never replace them with fixture signatures.
freshclam --stdout --log=/tmp/freshclam.log --pid=/tmp/freshclam.pid || true
freshclam --daemon --checks=12 --log=/tmp/freshclam.log --pid=/tmp/freshclam.pid
exec node /app/server.mjs
