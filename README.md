# git-workload-report

`git-workload-report` 是一个面向中文团队的本地 Git 工作量统计工具。它读取本机 Git 仓库历史，生成终端报告或本地 Web 报告页，用于查看指定时间范围内的提交次数、新增代码行、删除代码行、开发者分布、项目分布和提交时间分布。

## 背景

这个工具的核心场景是：用户已经有多个本地 Git 仓库，需要快速统计某段时间内团队或个人的代码提交情况，并在本机查看或导出报告。

原始制品解压后只有 `bin`、`public`、`README.md` 和 `LICENSE`。现在制品根目录新增 `start.sh`，用户解压后可以直接执行：

```bash
./start.sh
```

`start.sh` 只负责启动 `./bin/git-workload-report.sh`，不承载统计逻辑。

制品根目录同时内置 `directory.txt`。用户默认只需要编辑这个文件，把要统计的 Git 仓库路径逐行写进去，然后执行 `./start.sh` 或 `./start.sh web`。

## 目标

- 所有数据只在本机处理，不上传外网。
- 终端报告、Web 页面和 TXT 导出共用同一份本地统计数据。
- Web 页面中的仓库、开发者、时间段筛选结果必须和导出的 TXT 内容一致。
- 打包产物必须内置报告页，不依赖 GitHub Pages、Vercel 或任何公网服务。
- 入口名称统一为 `git-workload-report`，制品根目录入口统一为 `start.sh`。

## 约束

- 禁止把页面入口改回外网地址。
- 禁止让 `start.sh` 绕过 `./bin/git-workload-report.sh`。
- `directory` 参数表示“仓库路径清单配置文件”，不是仓库目录。
- `directory` 配置文件名可以自定义，但后缀必须是 `.txt`。
- 不传 `directory` 参数时，默认读取制品根目录的 `directory.txt`。
- 不为旧入口、旧业务名或错误参数格式增加兼容分支。
- 页面筛选和 TXT 导出必须基于当前筛选后的 commits，不能导出全量原始数据。
- 统计过程必须持续输出 `[进度]` 日志，避免慢设备、WSL 或大仓库场景下用户误以为程序卡死。
- 注释只保留核心逻辑、关键约束和必要公式，避免重复解释代码本身。

## 输入结构

### 命令格式

```bash
git-workload-report [开始日期] [结束日期] [作者关键词] [仓库路径...]
git-workload-report web [开始日期] [结束日期] [作者关键词] [仓库路径...]
git-workload-report directory=/path/to/directory.txt [web] [开始日期] [结束日期] [作者关键词]
```

解压制品后也可以用：

```bash
./start.sh [参数...]
```

### 参数说明

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `web` | 否 | 终端模式 | 启动本机 Web 报告页 |
| `开始日期` | 否 | `2022-01-01` | Git log 起始日期，格式为 `YYYY-MM-DD` |
| `结束日期` | 否 | 当前日期 | Git log 结束日期，格式为 `YYYY-MM-DD` |
| `作者关键词` | 否 | 空 | 传给 `git log --author` 的作者过滤关键词 |
| `仓库路径...` | 否 | 脚本所在 Git 仓库 | 一个或多个本地 Git 仓库路径 |
| `directory=/path/to/file.txt` | 否 | `./directory.txt` | 仓库路径清单文件，每行一个 Git 仓库路径 |

### 默认 directory.txt

制品根目录默认包含：

```text
git-workload-report/directory.txt
```

不传 `directory=...` 时，脚本会优先读取这个文件。只有这个文件不存在，并且命令行也没有传仓库路径时，才回到脚本所在目录的 Git 仓库发现逻辑。

### directory.txt 格式

```text
/Users/peng/Desktop/Project/0-ppll/ppll-server
/Users/peng/Desktop/Project/0-ppll/ppll-wap
```

规则：

- 每行一个 Git 仓库路径。
- 空行会被忽略。
- `#` 开头的注释行会被忽略。
- 文件后缀必须是 `.txt`。

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `GIT_WORKLOAD_REPORT_PORT` | `19960` | Web 模式本地服务起始端口，端口被占用时自动向后查找 |
| `GIT_WORKLOAD_REPORT_KEEP_ALIVE` | 空 | 值为 `1` 时保持本地服务进程，用于开发调试 |

### WSL 说明

在 WSL2 中执行 `./start.sh web` 时，脚本会优先尝试通过 Windows 浏览器打开本地报告页。如果当前环境缺少可用的打开命令，脚本不会报错退出，只会打印本地地址，用户手动复制到浏览器访问即可。

## 输出结构

### 终端输出

终端模式直接输出中文报告，包含：

- 统计进度日志
- 核心汇总
- 仓库信息
- 开发者工作量
- 一周七天提交分布
- 24 小时提交分布
- 部分仓库读取失败信息

### Web 输出

Web 模式启动 `127.0.0.1` 本地服务，并打开报告页。

启动过程中会先输出 `[进度]` 日志。仓库较大、历史较多或在 WSL 中读取 Windows 盘目录时，Git 日志读取可能比较慢，只要终端仍在输出进度或停留在某个仓库读取阶段，就表示程序仍在运行。

页面数据来源是脚本生成的 `report-data.json`。页面支持：

- 仓库复选框筛选
- 开发者复选框筛选
- 时间段筛选
- 图表展示
- TXT 导出

### report-data.json 数据格式

```json
{
  "generated_at": "2026-04-24T15:34:13",
  "default_filter": {
    "start_date": "2026-04-01",
    "end_date": "2026-04-24",
    "author_keyword": ""
  },
  "projects": ["ppll-server", "ppll-wap"],
  "authors": ["Raymond", "hh"],
  "repos": [
    {
      "name": "ppll-server",
      "branch": "dev",
      "path": "/Users/peng/Desktop/Project/0-ppll/ppll-server"
    }
  ],
  "commits": [
    {
      "project": "ppll-server",
      "project_path": "/Users/peng/Desktop/Project/0-ppll/ppll-server",
      "hash": "完整 commit hash",
      "short_hash": "短 hash",
      "author": "Raymond",
      "email": "author@example.com",
      "time": "2026-04-24T10:30:00+08:00",
      "date": "2026-04-24",
      "hour": "10",
      "week_day": "5",
      "subject": "提交说明",
      "added": 10,
      "deleted": 2,
      "files": [
        {
          "file": "src/index.js",
          "added": 10,
          "deleted": 2
        }
      ]
    }
  ],
  "errors": [
    {
      "project": "repo-name",
      "message": "读取失败原因"
    }
  ]
}
```

### TXT 导出格式

TXT 导出使用当前页面筛选后的数据，包含：

- 生成时间和导出时间
- 当前时间范围
- 当前仓库筛选
- 当前开发者筛选
- 核心汇总
- 仓库信息
- 项目提交占比
- 开发者工作量
- 一周七天提交分布
- 24 小时提交分布

文件名格式：

```text
git-workload-report-开始日期_结束日期.txt
```

## 核心流程

### 1. 初始化

1. 解析启动参数。
2. 识别是否为 Web 模式。
3. 未传 `directory` 参数时，优先选择制品根目录的 `directory.txt`。
4. 校验 `directory=*.txt` 配置文件。
5. 确认本机存在 `python3`。
6. 定位脚本目录和内置 Web 页面目录。
7. 确定默认时间范围、作者关键词和仓库路径来源。
8. 输出启动参数和仓库识别进度。

### 2. 执行

1. 读取 `directory.txt` 中的仓库路径。
2. 合并命令行仓库路径和配置文件仓库路径。
3. 对每个路径识别 Git 仓库根目录。
4. 执行 `git log --numstat` 获取提交和文件改动。
5. 每个仓库读取前、读取后、解析完成后都输出进度。
6. 生成统一的 `report-data.json`。
7. 终端模式直接打印中文报告。
8. Web 模式复制内置页面到临时目录，启动本地 HTTP 服务。
9. 页面按当前筛选条件渲染汇总、图表和表格。
10. 点击 `导出 TXT` 时，用当前筛选后的 commits 生成 TXT。
11. 自动打开浏览器失败时，只打印本地地址，不中断报告服务。

### 3. 验证

本地开发完成后至少执行：

```bash
node -e "new Function(require('fs').readFileSync('public/local-report/app.js','utf8'))"
npm test -- --runInBand
npm run build-local
```

Web 相关改动需要额外执行：

```bash
GIT_WORKLOAD_REPORT_PORT=21960 ./bin/git-workload-report.sh directory=/Users/peng/Desktop/Project/git-workload/directory.txt web 2026-04-01 2026-04-24
```

制品检查：

```bash
tar -tzf git-workload-report-v1.0.5.tar.gz
```

需要确认制品内至少包含：

```text
git-workload-report/start.sh
git-workload-report/directory.txt
git-workload-report/bin/git-workload-report.sh
git-workload-report/public/local-report/index.html
git-workload-report/public/local-report/app.js
git-workload-report/public/local-report/styles.css
```

## 统计公式

日均提交次数：

```text
提交次数 / 统计天数
```

单日工作时长估算：

```text
当天最晚提交小时 - 当天最早提交小时 + 1
```

日均工作时长：

```text
总估算工作时长 / 有提交的天数
```

每周工作时长：

```text
日均工作时长 * 5
```

加班时间占比：

```text
max(每周工作时长 - 40, 0) / 每周工作时长 * 100
```

## 常用命令

终端报告：

```bash
./bin/git-workload-report.sh 2026-04-01 2026-04-24
```

指定作者：

```bash
./bin/git-workload-report.sh 2026-04-01 2026-04-24 peng
```

指定仓库清单：

```bash
./bin/git-workload-report.sh directory=/Users/peng/Desktop/Project/git-workload/directory.txt
```

使用默认仓库清单：

```bash
./start.sh
./start.sh web
```

指定仓库清单并打开 Web 页面：

```bash
./bin/git-workload-report.sh directory=/Users/peng/Desktop/Project/git-workload/directory.txt web
```

解压制品后启动：

```bash
./start.sh directory=/Users/peng/Desktop/Project/git-workload/directory.txt web
```

## 维护说明

- 修改脚本参数时，需要同步更新 README 的输入结构。
- 修改 `report-data.json` 字段时，需要同步更新 README 的输出结构和页面读取逻辑。
- 修改页面筛选时，需要同步检查 TXT 导出，保证看到的结果和导出的结果一致。
- 修改打包逻辑时，需要确认 `start.sh`、`bin` 和 `public/local-report` 都进入制品。
- 注释只写业务目的、关键约束和公式来源，不解释普通赋值、循环和 DOM 操作。
