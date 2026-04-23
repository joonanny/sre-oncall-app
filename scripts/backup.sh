#!/bin/bash
set -euo pipefail

# 환경변수 로드 (EC2에서 cron 실행 시 .env 경로 지정)
ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/msp_backup_${TIMESTAMP}.sql.gz"

echo "[$(date)] 백업 시작"

# pg_dump → gzip 압축
docker exec msp_postgres pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --no-password \
  | gzip > "$BACKUP_FILE"

echo "[$(date)] DB 덤프 완료: $BACKUP_FILE"

# S3 업로드
aws s3 cp "$BACKUP_FILE" "s3://${S3_BACKUP_BUCKET}/postgres/$(basename "$BACKUP_FILE")" \
  --region "$AWS_REGION"

echo "[$(date)] S3 업로드 완료"

# 로컬 임시 파일 삭제
rm -f "$BACKUP_FILE"

# 30일 이상 된 S3 백업 삭제
aws s3 ls "s3://${S3_BACKUP_BUCKET}/postgres/" \
  | awk '{print $4}' \
  | while read -r KEY; do
      FILE_DATE=$(echo "$KEY" | grep -oP '\d{8}')
      CUTOFF=$(date -d "30 days ago" +%Y%m%d)
      if [[ "$FILE_DATE" < "$CUTOFF" ]]; then
        aws s3 rm "s3://${S3_BACKUP_BUCKET}/postgres/$KEY"
        echo "[$(date)] 오래된 백업 삭제: $KEY"
      fi
    done

echo "[$(date)] 백업 완료"
