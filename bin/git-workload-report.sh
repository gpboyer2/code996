#!/usr/bin/env bash

# 本脚本的业务目的必须保持清晰：给中文用户统计 Git 项目工作量。
# 禁止把报告入口改回 GitHub Pages、Vercel 或任何外网地址；打包后的产物必须不依赖公网服务。
# 项目已经从原始加班分析场景改为通用 Git 工作量统计场景，入口命名只使用 git-workload-report。
# 本脚本启动时会生成本地 report-data.json，终端报告和页面必须基于这份本地数据展示。

Help()
{
   echo "你可以使用自定义参数进行指定查询"
   echo
   echo "格式:"
   echo "  git-workload-report [开始日期] [结束日期] [作者关键词] [仓库路径...]"
   echo "  git-workload-report web [开始日期] [结束日期] [作者关键词] [仓库路径...]"
   echo "示例: git-workload-report 2026-04-01 2026-04-24 peng /path/to/project-a /path/to/project-b"
   echo "说明:"
   echo "  默认直接在终端输出完整汇总报告。"
   echo "  使用 web 子命令时启动本机 localhost 可视化报告页。"
   echo "  不传仓库路径时，默认从脚本所在目录向上查找 Git 仓库根目录。"
   echo "  作者关键词只作为启动时默认筛选，页面打开后仍可多选项目、人员并调整时间段。"
   echo
}

if [ "$1" == "--help" ] || [ "$1" == "-h" ]
then
    Help
    exit 0
fi

report_mode="terminal"
if [ "$1" == "web" ]
then
    report_mode="web"
    shift
fi

if ! command -v python3 >/dev/null 2>&1
then
    echo "未找到 python3，无法生成 Git 工作量报告。"
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

shift_count=$#
if [ "$shift_count" -gt 3 ]; then shift_count=3; fi
while [ "$shift_count" -gt 0 ]
do
    shift
    shift_count=$((shift_count - 1))
done

work_dir=`mktemp -d /tmp/git-workload-report.XXXXXX`
if [ "$report_mode" = "web" ]
then
    cp -R "$source_web_dir"/. "$work_dir"/
fi

python3 - "$report_mode" "$time_start" "$time_end" "$author" "$script_dir" "$work_dir/report-data.json" "$@" <<'PY'
import json
import os
import subprocess
import sys
from datetime import datetime

report_mode, time_start, time_end, author_filter, default_dir, output_path, *input_paths = sys.argv[1:]

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

def git_branch(path):
    return run_git(path, ["rev-parse", "--abbrev-ref", "HEAD"]).strip()

def discover_repos():
    candidates = input_paths or [default_dir]
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

def format_number(value):
    return f"{value:,}"

def date_diff_days(start_date, end_date):
    start = datetime.fromisoformat(start_date)
    end = datetime.fromisoformat(end_date)
    return max((end - start).days + 1, 1)

def estimate_hours(commits):
    by_date = {}
    for commit in commits:
        by_date.setdefault(commit["date"], []).append(int(commit["hour"]))
    total_hours = 0
    for hours in by_date.values():
        total_hours += max(hours) - min(hours) + 1
    return len(by_date), total_hours

def group_count(commits, key, seed=None):
    result = {item: 0 for item in (seed or [])}
    for commit in commits:
        value = commit[key]
        result[value] = result.get(value, 0) + 1
    return result

def print_rows(headers, rows):
    if not rows:
        print("  当前筛选条件下没有数据")
        return
    widths = [len(header) for header in headers]
    for row in rows:
        for index, value in enumerate(row):
            widths[index] = max(widths[index], len(str(value)))
    header_line = "  " + "  ".join(str(value).ljust(widths[index]) for index, value in enumerate(headers))
    separator = "  " + "  ".join("-" * width for width in widths)
    print(header_line)
    print(separator)
    for row in rows:
        print("  " + "  ".join(str(value).ljust(widths[index]) for index, value in enumerate(row)))

def print_terminal_report(payload):
    commits = payload["commits"]
    default_filter = payload["default_filter"]
    total_added = sum(commit["added"] for commit in commits)
    total_deleted = sum(commit["deleted"] for commit in commits)
    total_net = total_added - total_deleted
    days = date_diff_days(default_filter["start_date"], default_filter["end_date"])
    work_days, total_hours = estimate_hours(commits)
    daily_commits = len(commits) / days
    daily_hours = total_hours / work_days if work_days else 0
    weekly_hours = daily_hours * 5
    overtime_hours = max(weekly_hours - 40, 0)
    overtime_ratio = overtime_hours / weekly_hours * 100 if weekly_hours else 0

    print()
    print("Git 工作量报告")
    print("=" * 40)
    print(f"统计时间范围：{default_filter['start_date']} 至 {default_filter['end_date']}")
    if default_filter["author_keyword"]:
        print(f"作者关键词：{default_filter['author_keyword']}")
    print(f"生成时间：{payload['generated_at']}")
    print()

    print("核心汇总")
    print(f"  项目数量：{format_number(len(payload['projects']))}")
    print(f"  开发者数量：{format_number(len(payload['authors']))}")
    print(f"  提交次数：{format_number(len(commits))}")
    print(f"  新增代码行：{format_number(total_added)}")
    print(f"  删除代码行：{format_number(total_deleted)}")
    print(f"  净变化行数：{format_number(total_net)}")
    print(f"  日均提交次数：{daily_commits:.1f}")
    print(f"  日均工作时长：{daily_hours:.1f}h")
    print(f"  每周工作时长：{weekly_hours:.1f}h")
    print(f"  加班时间占比：{overtime_ratio:.1f}%")
    print()

    print("项目清单")
    project_counts = group_count(commits, "project")
    project_rows = []
    for repo in payload["repos"]:
        project_rows.append([repo["name"], repo["branch"], format_number(project_counts.get(repo["name"], 0)), repo["path"]])
    print_rows(["项目", "分支", "提交", "路径"], project_rows)
    print()

    print("开发者工作量")
    author_rows = []
    author_map = {}
    for commit in commits:
        author = commit["author"]
        if author not in author_map:
            author_map[author] = {"commits": 0, "added": 0, "deleted": 0, "dates": set()}
        row = author_map[author]
        row["commits"] += 1
        row["added"] += commit["added"]
        row["deleted"] += commit["deleted"]
        row["dates"].add(commit["date"])
    for author, row in sorted(author_map.items(), key=lambda item: item[1]["commits"], reverse=True):
        author_rows.append([
            author,
            format_number(row["commits"]),
            format_number(row["added"]),
            format_number(row["deleted"]),
            format_number(len(row["dates"])),
        ])
    print_rows(["开发者", "提交", "新增", "删除", "工作天数"], author_rows)
    print()

    print("一周七天提交分布")
    week_labels = {"1": "周一", "2": "周二", "3": "周三", "4": "周四", "5": "周五", "6": "周六", "7": "周日"}
    week_counts = group_count(commits, "week_day", ["1", "2", "3", "4", "5", "6", "7"])
    print_rows(["星期", "提交"], [[week_labels[key], format_number(value)] for key, value in week_counts.items()])
    print()

    print("24 小时提交分布")
    hour_counts = group_count(commits, "hour", [str(index).zfill(2) for index in range(24)])
    print_rows(["时间", "提交"], [[f"{key}:00", format_number(value)] for key, value in hour_counts.items()])
    print()

    if payload["errors"]:
        print("部分项目读取失败")
        for error in payload["errors"]:
            print(f"  - {error['project']}: {error['message']}")
        print()

def print_web_summary(payload):
    commits = payload["commits"]
    total_added = sum(commit["added"] for commit in commits)
    total_deleted = sum(commit["deleted"] for commit in commits)
    default_filter = payload["default_filter"]
    print(f"统计时间范围：{default_filter['start_date']} 至 {default_filter['end_date']}")
    print(f"项目数量：{len(payload['projects'])}")
    print(f"开发者数量：{len(payload['authors'])}")
    print(f"提交次数：{len(commits)}")
    print(f"新增代码行：{total_added}")
    print(f"删除代码行：{total_deleted}")
    if payload["errors"]:
        print("部分项目读取失败：")
        for error in payload["errors"]:
            print(f"  - {error['project']}: {error['message']}")

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
    "repos": [{"name": os.path.basename(path), "branch": git_branch(path), "path": path} for path in repos],
    "commits": all_commits,
    "errors": errors,
}
with open(output_path, "w", encoding="utf-8") as file:
    json.dump(payload, file, ensure_ascii=False)

if report_mode == "web":
    print_web_summary(payload)
else:
    print_terminal_report(payload)
PY

if [ "$report_mode" != "web" ]
then
    rm -rf "$work_dir"
    exit 0
fi

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

server_pid=`python3 - "$port" "$work_dir" "/tmp/git-workload-report-$port.log" <<'PY'
import subprocess
import sys

port, work_dir, log_path = sys.argv[1:]
log_file = open(log_path, "ab")
process = subprocess.Popen(
    [sys.executable, "-m", "http.server", port, "--bind", "127.0.0.1", "--directory", work_dir],
    stdin=subprocess.DEVNULL,
    stdout=log_file,
    stderr=subprocess.STDOUT,
    start_new_session=True,
)
print(process.pid)
PY
`
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
