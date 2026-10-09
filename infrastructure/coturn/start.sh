#!/bin/sh
set -eu
export TZ=UTC
source_id=$(cat /proc/sys/kernel/random/uuid)
printf '%s.log\n' "$source_id" > /var/log/relayrtc-turn/current.next
mv /var/log/relayrtc-turn/current.next /var/log/relayrtc-turn/current
exec turnserver "$@" --log-file="/var/log/relayrtc-turn/$source_id.log" --simple-log --verbose --new-log-timestamp --new-log-timestamp-format='%Y-%m-%dT%H:%M:%S.%fZ'
