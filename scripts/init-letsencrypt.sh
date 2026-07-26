#!/bin/bash
# Run this ONCE on the VPS (from the project root) to get the first real
# Let's Encrypt certificate. After that, the `certbot` service in
# docker-compose.yml renews it automatically every 12 hours (certbot itself
# only actually renews when a cert is within 30 days of expiring).
#
# Why this script exists at all: nginx.conf references SSL certificate files
# that don't exist until Certbot issues them, but nginx won't even start
# with a config pointing at missing files — and Certbot's HTTP-01 challenge
# needs nginx running on port 80 to serve it. This breaks that circular
# dependency with a throwaway self-signed cert, just long enough for nginx
# to start and Certbot to get the real one.
set -e

domains=(persepolisconstruction.co.uk www.persepolisconstruction.co.uk)
email="your-email@example.com"   # fill in — used for renewal/expiry notices
staging=0                         # set to 1 first to test without hitting Let's Encrypt's real rate limits

rsa_key_size=4096
data_path="./certbot"
primary_domain="${domains[0]}"

if [ -d "$data_path/conf/live/$primary_domain" ]; then
  read -p "Existing certificate data found for $primary_domain. Replace it? (y/N) " decision
  if [ "$decision" != "Y" ] && [ "$decision" != "y" ]; then
    exit 0
  fi
fi

echo "### Writing recommended TLS parameters ..."
mkdir -p "$data_path/conf"
if [ ! -e "$data_path/conf/options-ssl-nginx.conf" ]; then
  cat > "$data_path/conf/options-ssl-nginx.conf" <<'EOF'
ssl_session_cache shared:le_nginx_SSL:10m;
ssl_session_timeout 1440m;
ssl_session_tickets off;

ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;

ssl_ciphers "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384";
EOF
fi
# Generated locally rather than downloaded — no dependency on a third-party
# URL staying valid forever (the previous version of this script relied on
# raw.githubusercontent.com and broke outright the day that path 404'd).
if [ ! -e "$data_path/conf/ssl-dhparams.pem" ]; then
  openssl dhparam -out "$data_path/conf/ssl-dhparams.pem" 2048
fi

echo "### Creating a dummy certificate for $primary_domain (so nginx can start) ..."
path="/etc/letsencrypt/live/$primary_domain"
mkdir -p "$data_path/conf/live/$primary_domain"
docker compose run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:$rsa_key_size -days 1 \
    -keyout '$path/privkey.pem' \
    -out '$path/fullchain.pem' \
    -subj '/CN=localhost'" certbot

echo "### Starting nginx ..."
docker compose up --force-recreate -d nginx

echo "### Deleting dummy certificate for $primary_domain ..."
docker compose run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/$primary_domain && \
  rm -Rf /etc/letsencrypt/archive/$primary_domain && \
  rm -Rf /etc/letsencrypt/renewal/$primary_domain.conf" certbot

echo "### Requesting the real Let's Encrypt certificate for ${domains[*]} ..."
domain_args=""
for domain in "${domains[@]}"; do
  domain_args="$domain_args -d $domain"
done

staging_arg=""
if [ "$staging" != "0" ]; then staging_arg="--staging"; fi

docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    --email $email \
    $domain_args \
    --rsa-key-size $rsa_key_size \
    --agree-tos \
    --no-eff-email \
    --force-renewal" certbot

echo "### Reloading nginx with the real certificate ..."
docker compose exec nginx nginx -s reload

echo "Done. Check https://$primary_domain"
