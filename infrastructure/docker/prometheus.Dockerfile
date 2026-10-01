FROM prom/prometheus:v3.13.3

COPY infrastructure/prometheus/prometheus.yml /etc/prometheus/prometheus.yml
