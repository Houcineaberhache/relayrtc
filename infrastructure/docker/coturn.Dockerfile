FROM coturn/coturn:4.18.0-alpine

USER root

RUN apk add --no-cache openssl \
  && mkdir -p /etc/coturn/tls \
  && mkdir -p /var/log/relayrtc-turn \
  && chown 65534:65533 /var/log/relayrtc-turn \
  && chmod 0755 /var/log/relayrtc-turn \
  && chown 65534:65533 /etc/coturn/tls \
  && chmod 0755 /etc/coturn/tls

COPY infrastructure/coturn/turnserver.conf /etc/coturn/turnserver.conf
COPY --chmod=0555 infrastructure/coturn/start.sh /usr/local/bin/relayrtc-turn

USER nobody:nogroup
ENTRYPOINT ["/usr/local/bin/relayrtc-turn"]
