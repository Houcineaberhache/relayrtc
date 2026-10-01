FROM grafana/grafana:13.2.2-slim

COPY infrastructure/grafana/provisioning /etc/grafana/provisioning
COPY infrastructure/grafana/dashboards /var/lib/grafana/dashboards
