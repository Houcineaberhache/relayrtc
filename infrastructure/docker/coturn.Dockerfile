FROM alpine:3.22 AS certificates

RUN apk add --no-cache openssl \
  && mkdir -p /certificates \
  && openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 3650 \
    -subj "/CN=relayrtc.local" \
    -addext "subjectAltName=DNS:relayrtc.local,DNS:localhost,IP:127.0.0.1" \
    -keyout /certificates/tls.key \
    -out /certificates/tls.crt

FROM coturn/coturn:4.18.0-alpine

USER root

RUN mkdir -p /etc/coturn/tls \
  && chown 65534:65533 /etc/coturn/tls \
  && chmod 0755 /etc/coturn/tls

COPY infrastructure/coturn/turnserver.conf /etc/coturn/turnserver.conf
COPY --from=certificates --chown=65534:65533 --chmod=0444 /certificates/tls.crt /etc/coturn/tls/tls.crt
COPY --from=certificates --chown=65534:65533 --chmod=0400 /certificates/tls.key /etc/coturn/tls/tls.key

USER nobody:nogroup
