#!/usr/bin/env bash

# 本脚本的业务目的必须保持清晰：给中文用户统计 Git 项目工作量，并打开本机 localhost 报告页。
# 禁止把报告入口改回 GitHub Pages、Vercel 或任何外网地址；打包后的产物必须不依赖公网服务。
# 项目已经从原始加班分析场景改为通用 Git 工作量统计场景，入口命名只使用 git-workload-report。
# 本脚本启动时会生成本地 report-data.json，页面必须基于这份本地数据做项目、人员、时间段筛选。

Help()
{
   echo "你可以使用自定义参数进行指定查询"
   echo
   echo "格式: git-workload-report [开始日期] [结束日期] [作者关键词] [仓库路径...]"
   echo "示例: git-workload-report 2026-04-01 2026-04-24 peng /path/to/project-a /path/to/project-b"
   echo "说明:"
   echo "  不传仓库路径时，若当前目录是 Git 仓库则分析当前项目；否则扫描当前目录下的一层 Git 仓库。"
   echo "  作者关键词只作为启动时默认筛选，页面打开后仍可多选项目、人员并调整时间段。"
   echo
}

if [ "$1" == "--help" ] || [ "$1" == "-h" ]
then
    Help
    exit 0
fi

if ! command -v python3 >/dev/null 2>&1
then
    echo "未找到 python3，无法启动 localhost 本地网页。"
    echo "请先安装 python3 后重新运行。"
    exit 1
fi

case "$(uname -s)" in
Linux)
    open_url="xdg-open"
    ;;
Darwin)
    open_url="open"
    ;;
CYGWIN*|MINGW32*|MSYS*|MINGW*)
    open_url="start"
    ;;
*)
    open_url="xdg-open"
    ;;
esac

script_path=`python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "${BASH_SOURCE[0]}"`
script_dir="$(cd "$(dirname "$script_path")" && pwd)"
source_web_dir="$(cd "$script_dir/../public/local-report" && pwd)"

time_start=$1
time_end=$2
author=$3

if [ -z "$time_start" ]
then
    time_start="2022-01-01"
fi

if [ -z "$time_end" ]
then
    time_end=$(date "+%Y-%m-%d")
fi

if [ -z "$author" ]
then
    author=""
fi

shift_count=0
if [ -n "$1" ]; then shift_count=1; fi
if [ -n "$2" ]; then shift_count=2; fi
if [ -n "$3" ]; then shift_count=3; fi
while [ "$shift_count" -gt 0 ]
do
    shift
    shift_count=$((shift_count - 1))
done

work_dir=`mktemp -d /tmp/git-workload-report.XXXXXX`
cp -R "$source_web_dir"/. "$work_dir"/

python3 - "$time_start" "$time_end" "$author" "$PWD" "$work_dir/report-data.json" "$@" <<'PY'
import json
import os
import subprocess
import sys
from datetime import datetime

time_start, time_end, author_filter, current_dir, output_path, *input_paths = sys.argv[1:]

def run_git(repo_path, args):
    return subprocess.check_output(["git", "-C", repo_path, *args], text=True, stderr=subprocess.DEVNULL)

def is_git_repo(path):
    try:
        run_git(path, ["rev-parse", "--is-inside-work-tree"])
        return True
    except Exception:
        return False

def git_root(path):
    return os.path.realpath(run_git(path, ["rev-parse", "--show-toplevel"]).strip())

def discover_repos():
    candidates = input_paths or [current_dir]
    roots = []
    for candidate in candidates:
        path = os.path.realpath(candidate)
        if is_git_repo(path):
            roots.append(git_root(path))
            continue
        if not input_paths and os.path.isdir(path):
            for name in sorted(os.listdir(path)):
                child = os.path.join(path, name)
                if os.path.isdir(child) and is_git_repo(child):
                    roots.append(git_root(child))
    return sorted(set(roots))

def parse_numstat_line(line):
    parts = line.split("\t")
    if len(parts) < 3:
        return None
    if not parts[0].isdigit() or not parts[1].isdigit():
        return None
    return {
        "file": parts[2],
        "added": int(parts[0]),
        "deleted": int(parts[1]),
    }

def parse_commits(repo_path):
    project_name = os.path.basename(repo_path)
    args = [
        "log",
        f"--after={time_start}",
        f"--before={time_end}",
        "--date=iso-strict",
        "--pretty=format:--GIT-WORKLOAD-COMMIT--%n%H%n%an%n%ae%n%ad%n%s",
        "--numstat",
    ]
    if author_filter:
        args.insert(1, f"--author={author_filter}")
    raw = run_git(repo_path, args)
    commits = []
    current = None
    header = []

    for line in raw.splitlines():
        if line.startswith("--GIT-WORKLOAD-COMMIT--"):
            if current:
                commits.append(current)
            current = None
            header = []
            continue
        if current is None and len(header) < 5:
            header.append(line)
            if len(header) == 5:
                commit_time = datetime.fromisoformat(header[3])
                current = {
                    "project": project_name,
                    "project_path": repo_path,
                    "hash": header[0],
                    "short_hash": header[0][:8],
                    "author": header[1],
                    "email": header[2],
                    "time": header[3],
                    "date": commit_time.date().isoformat(),
                    "hour": commit_time.strftime("%H"),
                    "week_day": str(commit_time.isoweekday()),
                    "subject": header[4],
                    "added": 0,
                    "deleted": 0,
                    "files": [],
                }
            continue
        if current is None:
            continue
        stat = parse_numstat_line(line)
        if stat:
            current["files"].append(stat)
            current["added"] += stat["added"]
            current["deleted"] += stat["deleted"]

    if current:
        commits.append(current)
    return commits

repos = discover_repos()
all_commits = []
errors = []
for repo in repos:
    try:
        all_commits.extend(parse_commits(repo))
    except Exception as exc:
        errors.append({"project": os.path.basename(repo), "message": str(exc)})

authors = sorted({commit["author"] for commit in all_commits})
projects = sorted({commit["project"] for commit in all_commits})
payload = {
    "generated_at": datetime.now().isoformat(timespec="seconds"),
    "default_filter": {
        "start_date": time_start,
        "end_date": time_end,
        "author_keyword": author_filter,
    },
    "projects": projects,
    "authors": authors,
    "repos": [{"name": os.path.basename(path), "path": path} for path in repos],
    "commits": all_commits,
    "errors": errors,
}
with open(output_path, "w", encoding="utf-8") as file:
    json.dump(payload, file, ensure_ascii=False)

total_added = sum(commit["added"] for commit in all_commits)
total_deleted = sum(commit["deleted"] for commit in all_commits)
print(f"统计时间范围：{time_start} 至 {time_end}")
print(f"项目数量：{len(projects)}")
print(f"开发者数量：{len(authors)}")
print(f"提交次数：{len(all_commits)}")
print(f"新增代码行：{total_added}")
print(f"删除代码行：{total_deleted}")
if errors:
    print("部分项目读取失败：")
    for error in errors:
        print(f"  - {error['project']}: {error['message']}")
PY

find_free_port()
{
python3 - "$1" <<'PY'
import socket
import sys

start = int(sys.argv[1])
for port in range(start, start + 100):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            continue
        print(port)
        break
PY
}

port=`find_free_port "${GIT_WORKLOAD_REPORT_PORT:-19960}"`

if [ -z "$port" ]
then
    echo "未找到可用本地端口，请稍后再试。"
    exit 1
fi

python3 -m http.server "$port" --bind 127.0.0.1 --directory "$work_dir" >/tmp/git-workload-report-$port.log 2>&1 &
server_pid=$!
local_url="http://127.0.0.1:$port/"

echo
echo "本地可视化分析结果已启动:"
echo "$local_url"
echo "本地服务进程：$server_pid"
echo "如需指定端口，可设置环境变量：GIT_WORKLOAD_REPORT_PORT=19960"

$open_url "$local_url"

if [ "$GIT_WORKLOAD_REPORT_KEEP_ALIVE" = "1" ]
then
    echo "dev 模式会保持本地服务运行，按 Ctrl+C 停止。"
    wait "$server_pid"
fi
