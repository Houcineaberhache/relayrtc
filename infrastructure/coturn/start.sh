#!/bin/sh
set -eu
export TZ=UTC
if [ ! -e /etc/coturn/tls/tls.crt ] && [ ! -e /etc/coturn/tls/tls.key ]; then
  (
    umask 077
    openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 3650 \
      -subj "/CN=relayrtc.local" \
      -addext "subjectAltName=DNS:relayrtc.local,DNS:localhost,IP:127.0.0.1" \
      -keyout /etc/coturn/tls/tls.key \
      -out /etc/coturn/tls/tls.crt
  )
fi
source_id=$(cat /proc/sys/kernel/random/uuid)
printf '%s.log\n' "$source_id" > /var/log/relayrtc-turn/current.next
mv /var/log/relayrtc-turn/current.next /var/log/relayrtc-turn/current
exec turnserver "$@" --log-file="/var/log/relayrtc-turn/$source_id.log" --simple-log --verbose --new-log-timestamp --new-log-timestamp-format='%Y-%m-%dT%H:%M:%S.%fZ'
