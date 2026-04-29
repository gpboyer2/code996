#!/usr/bin/env bash

# 本脚本的业务目的必须保持清晰：给中文用户统计 Git 项目工作量。
# 禁止把报告入口改回 GitHub Pages、Vercel 或任何外网地址；打包后的产物必须不依赖公网服务。
# 项目已经从原始加班分析场景改为通用 Git 工作量统计场景，入口命名只使用 git-workload-report。
# 本脚本启动时会生成本地 report-data.json，终端报告和页面必须基于这份本地数据展示。
# 用户这次明确要求 directory 参数指向一个用户自定义名称的 .txt 配置文件。
# 这里的 directory 不是仓库目录，而是“仓库目录清单文件”；禁止改成自动猜测目录或兼容其他后缀。
# 制品根目录必须内置 directory.txt；用户不传 directory 参数时，默认读取这个文件。
# 配置文件每行写一个 Git 仓库路径，空行和 # 开头的注释行会被忽略。

Help()
{
   echo "你可以使用自定义参数进行指定查询"
   echo
   echo "格式:"
   echo "  ./start.sh [开始日期] [结束日期] [作者关键词] [仓库路径...]"
   echo "  ./start.sh web [开始日期] [结束日期] [作者关键词] [仓库路径...]"
   echo "  ./start.sh directory=/path/to/directory.txt [web] [开始日期] [结束日期] [作者关键词]"
   echo "示例: ./start.sh 2026-04-01 2026-04-24 peng /path/to/project-a /path/to/project-b"
   echo "示例: ./start.sh directory=./directory.txt web"
   echo "说明:"
   echo "  默认导出最近 7 天的 XLSX 报告到当前目录。"
   echo "  使用 web 子命令时启动本机 localhost 可视化报告页。"
   echo "  directory 参数必须指向 .txt 配置文件，文件名可自定义，后缀必须是 txt。"
   echo "  不传 directory 参数时，默认读取制品根目录的 directory.txt。"
   echo "  directory 配置文件每行写一个 Git 仓库路径，空行和 # 开头的注释行会被忽略。"
   echo "  directory.txt 不存在且不传仓库路径时，才从脚本所在目录向上查找 Git 仓库根目录。"
   echo "  作者关键词只作为启动时默认筛选，页面打开后仍可多选项目、人员并调整时间段。"
   echo
}

if [ "$1" == "--help" ] || [ "$1" == "-h" ]
then
    Help
    exit 0
fi

report_mode="terminal"
directory_config_path=""
business_args=()
time_start_provided="0"
time_end_provided="0"

for arg in "$@"
do
    case "$arg" in
    web)
        report_mode="web"
        ;;
    directory=*)
        directory_config_path="${arg#directory=}"
        ;;
    *)
        business_args+=("$arg")
        ;;
    esac
done

if ! command -v python3 >/dev/null 2>&1
then
    echo "未找到 python3，无法生成 Git 工作量报告。"
    echo "请先安装 python3 后重新运行。"
    exit 1
fi

open_local_url()
{
    local target_url="$1"

    if [ -r /proc/version ] && grep -qi microsoft /proc/version
    then
        if command -v cmd.exe >/dev/null 2>&1
        then
            cmd.exe /C start "" "$target_url" >/dev/null 2>&1 && return 0
        fi

        if command -v powershell.exe >/dev/null 2>&1
        then
            powershell.exe -NoProfile -Command "Start-Process '$target_url'" >/dev/null 2>&1 && return 0
        fi
    fi

    if command -v open >/dev/null 2>&1
    then
        open "$target_url" >/dev/null 2>&1 && return 0
    fi

    if command -v xdg-open >/dev/null 2>&1
    then
        xdg-open "$target_url" >/dev/null 2>&1 && return 0
    fi

    if command -v wslview >/dev/null 2>&1
    then
        wslview "$target_url" >/dev/null 2>&1 && return 0
    fi

    return 1
}

script_path=`python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "${BASH_SOURCE[0]}"`
script_dir="$(cd "$(dirname "$script_path")" && pwd)"
default_directory_config_path="$script_dir/../directory.txt"
source_web_dir="$(cd "$script_dir/../public/local-report" && pwd)"

if [ -z "$directory_config_path" ] && [ -f "$default_directory_config_path" ]
then
    directory_config_path="$default_directory_config_path"
fi

if [ -n "$directory_config_path" ]
then
    case "$directory_config_path" in
    *.txt)
        ;;
    *)
        echo "directory 参数必须指向 txt 配置文件，例如：directory=/path/to/directory.txt"
        exit 1
        ;;
    esac

    if [ ! -f "$directory_config_path" ]
    then
        echo "directory 配置文件不存在：$directory_config_path"
        exit 1
    fi
fi

time_start="${business_args[0]}"
time_end="${business_args[1]}"
author="${business_args[2]}"

if [ -n "$time_start" ]
then
    time_start_provided="1"
fi

if [ -n "$time_end" ]
then
    time_end_provided="1"
fi

if [ -z "$time_start" ]
then
    time_start=$(date -d "$(date "+%Y-%m-%d") -6 day" "+%Y-%m-%d")
fi

if [ -z "$time_end" ]
then
    time_end=$(date "+%Y-%m-%d")
fi

if [ -z "$author" ]
then
    author=""
fi

default_filter_start="$time_start"
default_filter_end="$time_end"
collect_time_start="$time_start"
collect_time_end="$time_end"

if [ "$report_mode" = "web" ] && [ "$time_start_provided" = "0" ]
then
    collect_time_start="2022-01-01"
fi

repo_args=()
business_arg_count=${#business_args[@]}
business_index=3
while [ "$business_index" -lt "$business_arg_count" ]
do
    repo_args+=("${business_args[$business_index]}")
    business_index=$((business_index + 1))
done

work_dir=`mktemp -d /tmp/git-workload-report.XXXXXX`
if [ "$report_mode" = "web" ]
then
    cp -R "$source_web_dir"/. "$work_dir"/
fi

python3 - "$report_mode" "$collect_time_start" "$collect_time_end" "$default_filter_start" "$default_filter_end" "$author" "$script_dir" "$work_dir/report-data.json" "$directory_config_path" "${repo_args[@]}" <<'PY'
import json
import os
import subprocess
import sys
import zipfile
from datetime import datetime

report_mode, collect_time_start, collect_time_end, default_filter_start, default_filter_end, author_filter, default_dir, output_path, directory_config_path, *input_paths = sys.argv[1:]

def print_progress(message):
    print(f"[进度] {message}", flush=True)

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

def read_directory_config():
    if not directory_config_path:
        return []
    print_progress(f"读取仓库清单：{directory_config_path}")
    paths = []
    with open(directory_config_path, "r", encoding="utf-8") as file:
        for line in file:
            value = line.strip()
            if value and not value.startswith("#"):
                paths.append(value)
    print_progress(f"仓库清单读取完成，共 {len(paths)} 个路径")
    return paths

def discover_repos():
    print_progress("开始识别 Git 仓库")
    configured_paths = read_directory_config()
    if directory_config_path:
        candidates = [*configured_paths, *input_paths]
    else:
        candidates = input_paths or [default_dir]
    roots = []
    print_progress(f"待检查路径数量：{len(candidates)}")
    for index, candidate in enumerate(candidates, start=1):
        path = os.path.realpath(candidate)
        print_progress(f"检查路径 {index}/{len(candidates)}：{path}")
        if is_git_repo(path):
            root = git_root(path)
            print_progress(f"识别到仓库：{root}")
            roots.append(root)
            continue
        if not input_paths and os.path.isdir(path):
            for name in sorted(os.listdir(path)):
                child = os.path.join(path, name)
                if os.path.isdir(child) and is_git_repo(child):
                    root = git_root(child)
                    print_progress(f"识别到子仓库：{root}")
                    roots.append(root)
    repos = sorted(set(roots))
    print_progress(f"Git 仓库识别完成，共 {len(repos)} 个仓库")
    return repos

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
    print_progress(f"开始读取仓库提交：{project_name}（{repo_path}）")
    args = [
        "log",
        f"--after={collect_time_start}",
        f"--before={collect_time_end}",
        "--date=iso-strict",
        "--pretty=format:--GIT-WORKLOAD-COMMIT--%n%H%n%an%n%ae%n%ad%n%s",
        "--numstat",
    ]
    if author_filter:
        args.insert(1, f"--author={author_filter}")
    raw = run_git(repo_path, args)
    print_progress(f"Git 日志读取完成：{project_name}，开始解析提交记录")
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
    print_progress(f"仓库解析完成：{project_name}，提交 {len(commits)} 次")
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
    print(f"  仓库数量：{format_number(len(payload['projects']))}")
    print(f"  有提交项目数：{format_number(len(payload['active_projects']))}")
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

def build_project_export_rows(commits):
    rows = {}
    for commit in commits:
        project = commit["project"]
        if project not in rows:
            rows[project] = {
                "project": project,
                "total_lines": 0,
                "added": 0,
                "deleted": 0,
                "commit_count": 0,
                "authors": set(),
            }
        row = rows[project]
        row["total_lines"] += commit["added"] + commit["deleted"]
        row["added"] += commit["added"]
        row["deleted"] += commit["deleted"]
        row["commit_count"] += 1
        row["authors"].add(commit["author"])

    result = []
    for row in rows.values():
        author_count = len(row["authors"])
        result.append({
            "project": row["project"],
            "total_lines": row["total_lines"],
            "added": row["added"],
            "deleted": row["deleted"],
            "commit_count": row["commit_count"],
            "author_count": author_count,
            "per_author_lines": f"{(row['total_lines'] / author_count) if author_count else 0:.2f}",
        })
    return sorted(result, key=lambda item: item["total_lines"], reverse=True)

def escape_xml(value):
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )

def string_cell(ref, value, style_index):
    return f'<c r="{ref}" s="{style_index}" t="inlineStr"><is><t>{escape_xml(value)}</t></is></c>'

def number_cell(ref, value, style_index):
    return f'<c r="{ref}" s="{style_index}"><v>{value}</v></c>'

def build_xlsx_sheet_xml(payload):
    commits = payload["commits"]
    default_filter = payload["default_filter"]
    filter_range_text = f'{default_filter["start_date"]} 至 {default_filter["end_date"]}'
    generated_at_text = payload["generated_at"]
    project_rows = build_project_export_rows(commits)
    total_rows = max(len(project_rows), 8)
    rows = []

    rows.append(
        '<row r="1">'
        + string_cell("A1", "时间", 1)
        + string_cell("B1", filter_range_text, 1)
        + '<c r="C1" s="1"/>'
        + '<c r="D1" s="1"/>'
        + string_cell("E1", "报告输出时间", 1)
        + string_cell("F1", generated_at_text, 1)
        + '<c r="G1" s="1"/>'
        + "</row>"
    )
    rows.append(
        '<row r="2">'
        + string_cell("A2", "项目代码情况", 2)
        + '<c r="B2" s="2"/>'
        + '<c r="C2" s="2"/>'
        + '<c r="D2" s="2"/>'
        + string_cell("E2", "人均生产力", 2)
        + '<c r="F2" s="2"/>'
        + '<c r="G2" s="2"/>'
        + "</row>"
    )
    rows.append(
        '<row r="3">'
        + string_cell("A3", "项目名", 3)
        + string_cell("B3", "提交代码总行数", 3)
        + string_cell("C3", "新增代码行数", 3)
        + string_cell("D3", "删除代码行数", 3)
        + string_cell("E3", "本周期提交次数", 3)
        + string_cell("F3", "本周期提交人次", 3)
        + string_cell("G3", "本周期人均提交代码行数", 3)
        + "</row>"
    )

    for index in range(total_rows):
        row_number = index + 4
        row = project_rows[index] if index < len(project_rows) else None
        row_xml = [f'<row r="{row_number}">']
        row_xml.append(string_cell(f"A{row_number}", row["project"] if row else "", 4))
        row_xml.append(number_cell(f"B{row_number}", row["total_lines"], 4) if row else f'<c r="B{row_number}" s="4"/>')
        row_xml.append(number_cell(f"C{row_number}", row["added"], 4) if row else f'<c r="C{row_number}" s="4"/>')
        row_xml.append(number_cell(f"D{row_number}", row["deleted"], 4) if row else f'<c r="D{row_number}" s="4"/>')
        row_xml.append(number_cell(f"E{row_number}", row["commit_count"], 4) if row else f'<c r="E{row_number}" s="4"/>')
        row_xml.append(number_cell(f"F{row_number}", row["author_count"], 4) if row else f'<c r="F{row_number}" s="4"/>')
        row_xml.append(number_cell(f"G{row_number}", row["per_author_lines"], 4) if row else f'<c r="G{row_number}" s="4"/>')
        row_xml.append("</row>")
        rows.append("".join(row_xml))

    last_row = total_rows + 3
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:G{last_row}"/>
  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>
    <col min="1" max="1" width="24" customWidth="1"/>
    <col min="2" max="2" width="18" customWidth="1"/>
    <col min="3" max="4" width="16" customWidth="1"/>
    <col min="5" max="6" width="18" customWidth="1"/>
    <col min="7" max="7" width="22" customWidth="1"/>
  </cols>
  <sheetData>
    {''.join(rows)}
  </sheetData>
  <mergeCells count="2">
    <mergeCell ref="A2:D2"/>
    <mergeCell ref="E2:G2"/>
  </mergeCells>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>"""

def build_xlsx_styles_xml():
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="微软雅黑"/></font>
    <font><b/><sz val="11"/><name val="微软雅黑"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD9E2EC"/></left>
      <right style="thin"><color rgb="FFD9E2EC"/></right>
      <top style="thin"><color rgb="FFD9E2EC"/></top>
      <bottom style="thin"><color rgb="FFD9E2EC"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="常规" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>"""

def write_xlsx_report(payload):
    file_name = datetime.now().strftime("output_%Y%m%d%H%M.xlsx")
    output_file_path = os.path.join(os.getcwd(), file_name)
    files = {
        "[Content_Types].xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>""",
        "_rels/.rels": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>""",
        "docProps/app.xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>git-workload-report</Application>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>工作表</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>Sheet1</vt:lpstr></vt:vector></TitlesOfParts>
</Properties>""",
        "docProps/core.xml": f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>git-workload-report</dc:creator>
  <cp:lastModifiedBy>git-workload-report</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">{datetime.now().isoformat()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{datetime.now().isoformat()}</dcterms:modified>
</cp:coreProperties>""",
        "xl/workbook.xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>""",
        "xl/_rels/workbook.xml.rels": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>""",
        "xl/styles.xml": build_xlsx_styles_xml(),
        "xl/worksheets/sheet1.xml": build_xlsx_sheet_xml(payload),
    }
    with zipfile.ZipFile(output_file_path, "w", compression=zipfile.ZIP_STORED) as archive:
        for path, content in files.items():
            archive.writestr(path, content)
    return output_file_path

def print_web_summary(payload):
    default_filter = payload["default_filter"]
    commits = [
        commit
        for commit in payload["commits"]
        if default_filter["start_date"] <= commit["date"] <= default_filter["end_date"]
    ]
    total_added = sum(commit["added"] for commit in commits)
    total_deleted = sum(commit["deleted"] for commit in commits)
    default_filter = payload["default_filter"]
    print(f"统计时间范围：{default_filter['start_date']} 至 {default_filter['end_date']}")
    print(f"仓库数量：{len(payload['projects'])}")
    print(f"有提交项目数：{len({commit['project'] for commit in commits})}")
    print(f"开发者数量：{len({commit['author'] for commit in commits})}")
    print(f"提交次数：{len(commits)}")
    print(f"新增代码行：{total_added}")
    print(f"删除代码行：{total_deleted}")
    if payload["errors"]:
        print("部分项目读取失败：")
        for error in payload["errors"]:
            print(f"  - {error['project']}: {error['message']}")

print_progress(f"统计时间范围：{collect_time_start} 至 {collect_time_end}")
if author_filter:
    print_progress(f"作者关键词：{author_filter}")
repos = discover_repos()
all_commits = []
errors = []
for index, repo in enumerate(repos, start=1):
    try:
        print_progress(f"处理仓库 {index}/{len(repos)}")
        all_commits.extend(parse_commits(repo))
    except Exception as exc:
        print_progress(f"仓库读取失败：{os.path.basename(repo)}，{exc}")
        errors.append({"project": os.path.basename(repo), "message": str(exc)})

authors = sorted({commit["author"] for commit in all_commits})
projects = sorted({os.path.basename(path) for path in repos})
active_projects = sorted({commit["project"] for commit in all_commits})
print_progress(f"统计数据汇总完成：{len(projects)} 个仓库，{len(active_projects)} 个有提交项目，{len(authors)} 位开发者，{len(all_commits)} 次提交")
payload = {
    "generated_at": datetime.now().isoformat(timespec="seconds"),
    "default_filter": {
        "start_date": default_filter_start,
        "end_date": default_filter_end,
        "author_keyword": author_filter,
    },
    "data_range": {
        "start_date": collect_time_start,
        "end_date": collect_time_end,
    },
    "projects": projects,
    "active_projects": active_projects,
    "authors": authors,
    "repos": [{"name": os.path.basename(path), "branch": git_branch(path), "path": path} for path in repos],
    "commits": all_commits,
    "errors": errors,
}
with open(output_path, "w", encoding="utf-8") as file:
    json.dump(payload, file, ensure_ascii=False)
print_progress(f"报告数据已生成：{output_path}")

if report_mode == "web":
    print_web_summary(payload)
else:
    export_path = write_xlsx_report(payload)
    print()
    print(f"XLSX 报告已导出：{export_path}")
    print(f"统计时间范围：{payload['default_filter']['start_date']} 至 {payload['default_filter']['end_date']}")
    print(f"仓库数量：{len(payload['projects'])}")
    print(f"有提交项目数：{len(payload['active_projects'])}")
    print(f"开发者数量：{len(payload['authors'])}")
    print(f"提交次数：{len(payload['commits'])}")
    if payload["errors"]:
        print("部分项目读取失败：")
        for error in payload["errors"]:
            print(f"  - {error['project']}: {error['message']}")
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

if ! open_local_url "$local_url"
then
    echo "未能自动打开浏览器，请手动复制上面的地址访问。"
fi

if [ "$GIT_WORKLOAD_REPORT_KEEP_ALIVE" = "1" ]
then
    echo "dev 模式会保持本地服务运行，按 Ctrl+C 停止。"
    wait "$server_pid"
fi
