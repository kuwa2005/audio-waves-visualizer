#!/usr/bin/env bash
# dist/ を SSH + rsync で本番（https://lil.la/visualizer/）へ配置する。
#
# 使い方:
#   scripts/deploy.sh            # ビルドしてから配置
#   scripts/deploy.sh --no-build # ビルド済みの dist/ を配置
#   scripts/deploy.sh --dry-run  # 転送内容の確認のみ
#
# 設定は deploy.env（gitignore 済み）から読む。deploy.env.example を参照。
# 手順: <名前>.new に転送 → 既存を <名前>.NNN（3桁連番）へ退避 → .new を本番名へ切り替え。
# 切り替えは mv 2 回なので、公開が途切れるのは一瞬だけ。
# SSH で到達できない場合は、接続元 IP の登録が必要なことがある（README 参照）。
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

BUILD=1
DRY=0
for a in "$@"; do
  case "$a" in
    --no-build) BUILD=0 ;;
    --dry-run) DRY=1 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "不明なオプション: $a" >&2; exit 1 ;;
  esac
done

[[ -f deploy.env ]] || { echo "deploy.env がありません（deploy.env.example を参照）" >&2; exit 1; }
set -a; . ./deploy.env; set +a
: "${DEPLOY_SSH_HOST:?deploy.env に DEPLOY_SSH_HOST を設定してください}"
: "${DEPLOY_REMOTE_PATH:?deploy.env に DEPLOY_REMOTE_PATH を設定してください}"
PUBLIC_URL="${PUBLIC_URL:-https://lil.la/visualizer/}"

if [[ $BUILD == 1 ]]; then npm run build; fi
[[ -f dist/index.html ]] || { echo "dist/index.html がありません" >&2; exit 1; }

REMOTE="${DEPLOY_REMOTE_PATH%/}"
STAGING="${REMOTE}.new"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=20 "$DEPLOY_SSH_HOST")

if [[ $DRY == 1 ]]; then
  rsync -az --delete --dry-run --itemize-changes -e "ssh -o BatchMode=yes" dist/ "$DEPLOY_SSH_HOST:$REMOTE/"
  exit 0
fi

echo "転送中: dist/ → $DEPLOY_SSH_HOST:$STAGING/"
# 現行版をコピー元にして差分転送を速くする
"${SSH[@]}" "rm -rf '$STAGING' && if [ -d '$REMOTE' ]; then cp -a '$REMOTE' '$STAGING'; else mkdir -p '$STAGING'; fi"
rsync -az --delete -e "ssh -o BatchMode=yes" dist/ "$DEPLOY_SSH_HOST:$STAGING/"

echo "切り替え中..."
"${SSH[@]}" bash -s -- "$REMOTE" "$STAGING" <<'EOS'
set -euo pipefail
remote="$1"; staging="$2"
parent="$(dirname "$remote")"; name="$(basename "$remote")"
if [ -d "$remote" ]; then
  max=-1
  for d in "$parent/$name".[0-9][0-9][0-9]; do
    [ -e "$d" ] || continue
    n=$((10#${d##*.})); [ "$n" -gt "$max" ] && max=$n
  done
  backup="$(printf '%s/%s.%03d' "$parent" "$name" $((max + 1)))"
  mv "$remote" "$backup"
  echo "退避: $remote → $backup"
fi
mv "$staging" "$remote"
EOS

echo "完了: $PUBLIC_URL"
