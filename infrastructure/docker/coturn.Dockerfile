FROM coturn/coturn:4.18.0-alpine

COPY infrastructure/coturn/turnserver.conf /etc/coturn/turnserver.conf
