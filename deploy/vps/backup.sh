#!/bin/sh
set -eu
umask 077
destination="/var/backups/inforce/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$destination"
runuser -u postgres -- pg_dump -Fc inforce > "$destination/database.dump"
tar -czf "$destination/uploads.tar.gz" -C /var/lib/inforce uploads
cp -p /etc/inforce/api.env /etc/inforce/postgrest.env "$destination/"
printf '%s\n' "Backup saved: $destination"
