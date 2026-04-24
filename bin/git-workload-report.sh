#!/usr/bin/env bash

# 本脚本的业务目的必须保持清晰：给离线内网中文用户统计 Git 项目工作量，并打开本机 localhost 报告页。
# 禁止把报告入口改回 GitHub Pages、Vercel 或任何外网地址；打包后的产物必须不依赖公网服务。
# 项目已经从原始加班分析场景改为通用 Git 工作量统计场景，入口命名只使用 git-workload-report。

Help()
{
   echo "你可以使用自定义参数进行指定查询"
   echo
   echo "格式: bash $0 [2022-01-01] [2022-04-04] [author]"
   echo "示例: bash git-workload-report.sh 2022-01-01 2022-12-31 peng"
   echo "参数:"
   echo "1st     分析的起始时间."
   echo "2nd     分析的结束时间."
   echo "3rd     指定提交用户，可以是 name 或 email."
   echo
}

OS_DETECT()
{
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
        echo 'Other OS'
        echo "trying to use xdg-open to open the url"
        open_url="xdg-open"
        ;;
    esac
}
OS_DETECT

if ! command -v python3 >/dev/null 2>&1
then
    echo "未找到 python3，无法启动 localhost 本地网页。"
    echo "请先安装 python3 后重新运行。"
    exit 1
fi

script_path=`python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "${BASH_SOURCE[0]}"`
script_dir="$(cd "$(dirname "$script_path")" && pwd)"
web_dir="$(cd "$script_dir/../public/local-report" && pwd)"

time_start=$1

if [ "$1" == "--help" ]
then
    Help
    exit 0
elif [ "$1" == "-h" ]
then
    Help
    exit 0
fi

if [ -z "$1" ]
then
    time_start="2022-01-01"
fi

time_end=$2
if [ -z "$2" ]
then
    time_end=$(date "+%Y-%m-%d")
fi

author=$3
if [ -z "$3" ]
then
    author=""
fi

by_day_output=`git -C "$PWD" log --author="$author" --date=format:%u --after="$time_start" --before="$time_end" | grep "Date:" | awk '{print $2}' | sort | uniq -c`
by_hour_output=`git -C "$PWD" log --author="$author" --date=format:%H --after="$time_start" --before="$time_end" | grep "Date:" | awk '{print $2}' | sort | uniq -c`
commit_count=`git -C "$PWD" rev-list --count --author="$author" --after="$time_start" --before="$time_end" HEAD`
line_stats=`git -C "$PWD" log --author="$author" --after="$time_start" --before="$time_end" --pretty=tformat: --numstat | awk 'NF==3 && $1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+$/ { added += $1; deleted += $2 } END { printf "%d %d", added, deleted }'`
added_lines=`echo "$line_stats" | awk '{print $1}'`
deleted_lines=`echo "$line_stats" | awk '{print $2}'`

for i in "${by_day_output[@]}"
do
    by_day_result=`echo "$i" | sed -E 's/^ +//g' | sed 's/ /_/g' | tr '\n' ','`
done

RED='\033[1;91m'
NC='\033[0m'

echo -e "${RED}统计时间范围：$time_start 至 $time_end"
echo -e "${NC}提交次数：${RED}$commit_count${NC}"
echo -e "${NC}新增代码行：${RED}$added_lines${NC}"
echo -e "${NC}删除代码行：${RED}$deleted_lines${NC}"

for i in "${by_day_output[@]}"
do
    echo
    echo -e "${NC}一周七天 commit 分布${RED}"
    echo -e "  总提交次数 星期\n$i" | column -t
    by_day_result=`echo "$i" | sed -E 's/^ +//g' | sed "s/ /_/g" | tr '\n' ','`
done

for i in "${by_hour_output[@]}"
do
    echo
    echo -e "${NC}24小时 commit 分布${RED}"
    echo -e "  总提交次数 小时\n$i" | column -t
    by_hour_result=`echo "$i" | sed -E 's/^ +//g' | sed "s/ /_/g" | tr '\n' ','`
done

by_day_result=`echo "$by_day_result" | sed -E 's/,$//g'`
by_hour_result=`echo "$by_hour_result" | sed -E 's/,$//g'`
result=$time_start"_"$time_end"&week="$by_day_result"&hour="$by_hour_result"&commits="$commit_count"&added="$added_lines"&deleted="$deleted_lines

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
    echo -e "${NC}未找到可用本地端口，请稍后再试。"
    exit 1
fi

python3 -m http.server "$port" --bind 127.0.0.1 --directory "$web_dir" >/tmp/git-workload-report-$port.log 2>&1 &
server_pid=$!
local_url="http://127.0.0.1:$port/?time=$result"

echo
echo -e "${NC}本地可视化分析结果已启动:"
echo -e "${RED}$local_url"
echo -e "${NC}本地服务进程：$server_pid"
echo -e "${NC}如需指定端口，可设置环境变量：GIT_WORKLOAD_REPORT_PORT=19960"
echo -e "${NC}"

$open_url "$local_url"
