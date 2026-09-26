#!/usr/bin/env bash
set -euo pipefail

release=${1:?Pass the prepared absolute release directory}
case "$release" in /opt/inforce/releases/*) ;; *) printf '%s\n' 'Unexpected release path' >&2; exit 1;; esac
test -f "$release/dist/index.html"
test -f /etc/inforce/ad-library.env
previous=$(readlink -f /opt/inforce/current)
backup="/var/backups/inforce/ad-library-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 700 "$backup"
umask 077
runuser -u postgres -- pg_dump -Fc inforce > "$backup/database.dump"
cp -a /etc/inforce "$backup/config"
printf '%s\n' "$previous" > "$backup/previous-release"
printf 'Backup saved: %s\n' "$backup"

cd "$release"
docker compose -f deploy/ad-library/compose.yml up -d redis
ADLIB_REDIS_URL=redis://127.0.0.1:6379 /usr/local/bin/node scripts/ad-library-queue-smoke.mjs
rollback() {
  trap - ERR
  printf '%s\n' 'Activation failed; restoring the previous API release.' >&2
  docker compose -f deploy/ad-library/compose.yml stop worker media-worker scheduler || true
  ln -sfn "$previous" /opt/inforce/current
  systemctl daemon-reload
  systemctl restart inforce-api
}
trap rollback ERR
systemctl stop inforce-api
runuser -u postgres -- /usr/local/bin/node deploy/vps/migrate-db.mjs
install -d -m 755 /etc/systemd/system/inforce-api.service.d
install -m 644 deploy/ad-library/inforce-api-adlib.conf /etc/systemd/system/inforce-api.service.d/ad-library.conf
ln -sfn "$release" /opt/inforce/current
systemctl daemon-reload
systemctl start inforce-api
curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 1 http://127.0.0.1:3001/healthz
set -a
. /etc/inforce/api.env
. /etc/inforce/ad-library.env
set +a
/usr/local/bin/node deploy/vps/smoke-test.mjs
/usr/local/bin/node scripts/ad-library-integration-smoke.mjs
docker compose -f deploy/ad-library/compose.yml up -d
trap - ERR
printf 'Activated release: %s\n' "$release"
