#!/usr/bin/env bash
# dist/ を FTP で本番（lil.la/visualizer/）へアップロードする。
#
# 使い方:
#   scripts/deploy.sh            # ビルドしてからアップロード
#   scripts/deploy.sh --no-build # ビルド済みの dist/ をアップロード
#   scripts/deploy.sh --dry-run  # 転送内容の確認のみ
#
# 接続情報は deploy.env（gitignore 済み）から読む。deploy.env.example を参照。
# 既存のリモートディレクトリは <名前>.NNN（3桁連番）へ退避してから新規配置する。
# 依存: lftp
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

BUILD=1
DRY=0
for a in "$@"; do
  case "$a" in
    --no-build) BUILD=0 ;;
    --dry-run) DRY=1 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "不明なオプション: $a" >&2; exit 1 ;;
  esac
done

[[ -f deploy.env ]] || { echo "deploy.env がありません（deploy.env.example を参照）" >&2; exit 1; }
set -a; . ./deploy.env; set +a
: "${FTP_SERVER:?}" "${FTP_USER:?}" "${FTP_PASS:?}" "${FTP_REMOTE_PATH:?}"
command -v lftp >/dev/null || { echo "lftp が必要です（sudo apt install lftp）" >&2; exit 1; }

if [[ $BUILD == 1 ]]; then npm run build; fi
[[ -f dist/index.html ]] || { echo "dist/index.html がありません" >&2; exit 1; }

REMOTE_PARENT="$(dirname "$FTP_REMOTE_PATH")"
REMOTE_NAME="$(basename "$FTP_REMOTE_PATH")"
export LFTP_PASSWORD="$FTP_PASS"  # パスワードをコマンドライン引数に出さない
LFTP_BASE="set ftp:passive-mode on; set ssl:verify-certificate no; set net:max-retries 2; set net:timeout 20"
lftp_run() { lftp --env-password -u "$FTP_USER" -e "$LFTP_BASE; $1; bye" "$FTP_SERVER"; }

# 次のバックアップ番号を決める
listing="$(lftp_run "cls -1 '$REMOTE_PARENT/'" 2>/dev/null || true)"
max=-1; exists=0
while IFS= read -r line; do
  name="$(basename "${line%/}")"
  [[ "$name" == "$REMOTE_NAME" ]] && exists=1
  if [[ "$name" =~ ^${REMOTE_NAME}\.([0-9]{3})$ ]]; then
    n=$((10#${BASH_REMATCH[1]})); (( n > max )) && max=$n
  fi
done <<< "$listing"
backup="$(printf '%s.%03d' "$REMOTE_NAME" $((max + 1)))"

if [[ $DRY == 1 ]]; then
  [[ $exists == 1 ]] && echo "退避予定: $REMOTE_NAME → $backup"
  lftp_run "mirror -R --dry-run dist '$FTP_REMOTE_PATH'"
  exit 0
fi

if [[ $exists == 1 ]]; then
  echo "既存の $REMOTE_NAME を $backup へ退避"
  lftp_run "mv '$FTP_REMOTE_PATH' '$REMOTE_PARENT/$backup'"
fi
echo "アップロード中..."
lftp_run "mirror -R --parallel=4 dist '$FTP_REMOTE_PATH'"
echo "完了: ${PUBLIC_URL:-https://lil.la/visualizer/}"
