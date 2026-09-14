#!/usr/bin/env bash
# Backup consistente do banco SQLite (funciona com o portal no ar).
# Agende no cron: 0 * * * * /opt/portal-decisoes/implantacao/backup.sh
set -euo pipefail

ORIGEM="${DB_PATH:-/opt/portal-decisoes/dados/portal.db}"
DESTINO="${BACKUP_DIR:-/var/backups/portal-decisoes}"
RETENCAO_DIAS="${RETENCAO_DIAS:-30}"

mkdir -p "$DESTINO"
ARQUIVO="$DESTINO/portal-$(date +%Y%m%d-%H%M%S).db"

# .backup respeita o WAL e não corrompe o arquivo em uso.
sqlite3 "$ORIGEM" ".backup '$ARQUIVO'"
gzip -9 "$ARQUIVO"
chmod 600 "$ARQUIVO.gz"

find "$DESTINO" -name 'portal-*.db.gz' -mtime "+$RETENCAO_DIAS" -delete
echo "Backup gerado: $ARQUIVO.gz"
