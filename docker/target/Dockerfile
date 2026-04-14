FROM zabbix/zabbix-agent2:ubuntu-7.0-latest

USER root

# Instala ferramentas de stress e diagnóstico
RUN apt-get update && apt-get install -y --no-install-recommends \
    stress-ng \
    sysstat \
    procps \
    iproute2 \
    curl \
    wget \
    dnsutils \
    && rm -rf /var/lib/apt/lists/*

USER 1997
