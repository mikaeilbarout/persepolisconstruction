#!/bin/bash
# Run this ONCE on the VPS itself (as root or with sudo) — it configures the
# host's firewall (ufw), not anything inside Docker. Docker containers share
# the host's network stack for published ports, so this is what actually
# decides what's reachable from the internet.
set -e

if ! command -v ufw >/dev/null 2>&1; then
  echo "### Installing ufw ..."
  apt-get update -y
  apt-get install -y ufw
fi

echo "### Allowing SSH BEFORE enabling the firewall (so you don't lock yourself out) ..."
ufw allow OpenSSH

echo "### Allowing HTTP (80) and HTTPS (443) for the site ..."
ufw allow 80/tcp
ufw allow 443/tcp

echo "### Setting default policy: deny incoming, allow outgoing ..."
ufw default deny incoming
ufw default allow outgoing

echo "### Enabling ufw ..."
ufw --force enable

ufw status verbose
echo ""
echo "Firewall active. Only SSH, HTTP and HTTPS are reachable from outside."
echo "If you add anything else later (e.g. a second app on another port), allow it explicitly with: ufw allow <port>/tcp"
