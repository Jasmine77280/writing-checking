#!/usr/bin/env bash
# Run as ubuntu on the existing Ubuntu server. No passwords or API keys in arguments.
set -Eeuo pipefail
umask 077

if [[ "$(id -un)" != ubuntu ]]; then
  echo '请使用 ubuntu 用户运行本脚本，不要使用 sudo bash。' >&2
  exit 1
fi

service=wensi.service
repo="$HOME/apps/wensi"
node_dir="$HOME/.local/opt/node-v22.23.4-linux-x64/bin"
export PATH="$node_dir:$PATH"
[[ -x "$node_dir/node" ]] || { echo '未找到之前安装的 Node.js，请停止并反馈。' >&2; exit 1; }
[[ -d "$repo/.git" ]] || { echo '原项目 Git 目录不存在，请停止并反馈。' >&2; exit 1; }
command -v python3 >/dev/null
command -v curl >/dev/null
command -v npm >/dev/null
sudo -v
[[ "$(systemctl show "$service" --property=User --value)" == ubuntu ]] || {
  echo '现有服务用户与预期不符，未修改任何服务配置。' >&2; exit 1;
}
systemctl is-active --quiet "$service" || {
  echo '旧应用当前未运行，请先排查，避免在未知状态下更新。' >&2; exit 1;
}
current_dir=$(systemctl show "$service" --property=WorkingDirectory --value)
case "$current_dir" in
  "$repo"|"$HOME/apps/writewise-releases/"*) ;;
  *) echo '现有服务工作目录与预期不符，未修改。' >&2; exit 1 ;;
esac
[[ -f "$current_dir/.env.local" ]] || {
  echo '当前应用没有 .env.local，未修改。请勿在聊天中发送密钥。' >&2; exit 1;
}
if [[ -n "$(git -C "$repo" status --porcelain --untracked-files=normal)" ]]; then
  echo '原项目存在本地改动，未覆盖；请先备份并反馈。' >&2
  exit 1
fi

echo '1/5 获取已发布代码；原站点继续运行。'
GIT_TERMINAL_PROMPT=0 git -C "$repo" fetch origin main
commit=$(git -C "$repo" rev-parse --verify FETCH_HEAD^{commit})
# A deployment script must not silently change its own reviewed behavior mid-run.
script_commit=${WRITEWISE_DEPLOY_COMMIT:-$commit}
[[ "$script_commit" == "$commit" ]] || {
  echo '远端提交已变化，请重新获取更新命令后再运行。' >&2; exit 1;
}
mkdir -p "$HOME/apps/writewise-releases" "$HOME/apps/writewise-backups"
release=$(mktemp -d "$HOME/apps/writewise-releases/${commit:0:12}-XXXXXXXX")
backup=$(mktemp -d "$HOME/apps/writewise-backups/update-XXXXXXXX")
printf '%s\n' "$commit" > "$backup/commit.txt"
printf '%s\n' "$current_dir" > "$backup/previous-directory.txt"

git -C "$repo" archive "$commit" | tar -x -C "$release"
install -m 600 "$current_dir/.env.local" "$release/.env.local"

dropin_dir="/etc/systemd/system/$service.d"
dropin="$dropin_dir/50-writewise-release.conf"
had_dropin=0
if sudo test -L "$dropin"; then
  echo '发现同名配置是符号链接，停止以保护已有配置。' >&2; exit 1
fi
if sudo test -e "$dropin"; then
  sudo cat "$dropin" > "$backup/previous-dropin.conf"
  had_dropin=1
fi
preview_pid=''
switched=0
cleanup() {
  result=$?
  trap - EXIT
  if [[ -n "$preview_pid" ]]; then
    kill "$preview_pid" 2>/dev/null || true
    wait "$preview_pid" 2>/dev/null || true
  fi
  if [[ "$result" -ne 0 && "$switched" -eq 1 ]]; then
    echo '更新检查失败，尝试恢复旧服务配置。' >&2
    if [[ "$had_dropin" -eq 1 ]]; then
      sudo install -m 644 "$backup/previous-dropin.conf" "$dropin" || true
    else
      sudo rm -f -- "$dropin" || true
    fi
    sudo systemctl daemon-reload || true
    sudo systemctl restart "$service" || true
    if systemctl is-active --quiet "$service"; then
      echo '旧服务已恢复运行；请反馈更新失败信息。' >&2
    else
      echo '自动回滚未能确认服务恢复，请反馈 systemctl status wensi.service。' >&2
    fi
  fi
  if [[ "$result" -ne 0 ]]; then
    echo "更新未完成。保留目录：$release" >&2
    echo "备份目录：$backup" >&2
  fi
  exit "$result"
}
trap cleanup EXIT

echo '2/5 在独立目录安装依赖并构建，不覆盖旧版本。'
cd "$release"
npm ci --no-audit --no-fund
NODE_OPTIONS=--max-old-space-size=1024 npm run build

preview_port=$(python3 - <<'PY'
import socket
with socket.socket() as s:
    s.bind(('127.0.0.1', 0))
    print(s.getsockname()[1])
PY
)
"$node_dir/node" node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port "$preview_port" > "$backup/preview.log" 2>&1 &
preview_pid=$!
check_config() {
  local port=$1
  local result_file=$2
  curl -fsS --max-time 5 "http://127.0.0.1:$port/api/config" -o "$result_file" || return 1
  python3 - "$result_file" <<'PY'
import json,sys
with open(sys.argv[1]) as f:
    data=json.load(f)
if not (data.get('product') == 'writewise'
        and data.get('schemaVersion') == 'writewise.review.v2'
        and data.get('configured') is True
        and data.get('external') is True
        and data.get('model') == 'deepseek-chat'):
    sys.exit(1)
PY
}
echo '3/5 检查新版本启动与 DeepSeek 配置完整性（不发送付费模型请求）。'
ready=0
for attempt in {1..15}; do
  if ! kill -0 "$preview_pid" 2>/dev/null; then break; fi
  if check_config "$preview_port" "$backup/preview-config.json"; then ready=1; break; fi
  sleep 2
done
[[ "$ready" -eq 1 ]] || {
  echo '新版本未通过启动检查，旧服务未切换。检查配置是否为 deepseek-chat。' >&2
  echo "启动日志保留在 $backup/preview.log，请先检查并遮挡敏感信息再分享。" >&2
  exit 1
}
curl -fsS --max-time 10 "http://127.0.0.1:$preview_port/" -o /dev/null
kill "$preview_pid"
wait "$preview_pid" 2>/dev/null || true
preview_pid=''

cat > "$backup/new-dropin.conf" <<UNIT
[Service]
WorkingDirectory=$release
ExecStart=
ExecStart=$node_dir/node $release/node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3001
UNIT

# This rollback script contains paths only, never secret values.
{
  printf '#!/usr/bin/env bash\nset -euo pipefail\n'
  if [[ "$had_dropin" -eq 1 ]]; then
    printf 'sudo install -m 644 %q %q\n' "$backup/previous-dropin.conf" "$dropin"
  else
    printf 'sudo rm -f -- %q\n' "$dropin"
  fi
  printf 'sudo systemctl daemon-reload\nsudo systemctl restart %q\nsudo systemctl status %q --no-pager\n' "$service" "$service"
} > "$backup/rollback.sh"
chmod 700 "$backup/rollback.sh"

echo '4/5 切换专用 wensi 服务；保留 Nginx 和其他网站配置。'
sudo mkdir -p "$dropin_dir"
switched=1
sudo install -m 644 "$backup/new-dropin.conf" "$dropin"
sudo systemctl daemon-reload
[[ "$(systemctl show "$service" --property=WorkingDirectory --value)" == "$release" ]] || {
  echo '其他服务配置覆盖了发布目录，准备回滚。' >&2; exit 1;
}
sudo systemctl restart "$service"
ready=0
for attempt in {1..15}; do
  if systemctl is-active --quiet "$service" && check_config 3001 "$backup/production-config.json"; then
    ready=1; break
  fi
  sleep 2
done
[[ "$ready" -eq 1 ]] || { echo '切换后健康检查失败。' >&2; exit 1; }
curl -fsS --max-time 10 http://127.0.0.1:3001/ -o /dev/null
switched=0

echo '5/5 WriteWise 更新成功。'
printf '提交：%s\n版本目录：%s\n备份目录：%s\n' "${commit:0:12}" "$release" "$backup"
printf '如需回滚，执行：bash %q\n' "$backup/rollback.sh"
echo '访问原来的 IP:3001，强制刷新页面。DeepSeek 真实批改仍需在页面用虚构作文验证。'
echo '旧版语文记录会保留为可导出的归档；它们不转换成英语评分。'
