# git-workload-report

`git-workload-report` 是一个面向中文团队的 Git 工作量统计工具。它读取本地 Git 仓库历史，统计指定时间范围内的提交次数、新增代码行、删除代码行、周分布和小时分布，默认直接在终端输出完整汇总报告，也可以启动本机中文可视化报告页。

## 设计目标

- 数据只在本机处理，不上传外网。
- 打包产物内置报告页，不依赖 GitHub Pages、Vercel 或任何公网服务。
- 默认适合中文用户阅读和演示。
- 入口名称统一为 `git-workload-report`，不保留旧业务入口。

## 快速使用

在任意 Git 仓库根目录执行，默认输出终端报告：

```bash
bash /path/to/git-workload-report.sh 2026-04-01 2026-04-24
```

或者安装打包产物后执行：

```bash
git-workload-report 2026-04-01 2026-04-24
```

指定作者：

```bash
git-workload-report 2026-04-01 2026-04-24 peng
```

需要打开浏览器查看可视化页面时，使用 `web` 模式：

```bash
git-workload-report web 2026-04-01 2026-04-24 peng
```

Web 模式会启动本地服务并打开类似地址：

```text
http://127.0.0.1:19960/?time=2026-04-01_2026-04-24&...
```

如果默认端口被占用，工具会自动寻找后续可用端口。也可以手动指定起始端口：

```bash
GIT_WORKLOAD_REPORT_PORT=21000 git-workload-report 2026-04-01 2026-04-24
```

## 统计内容

- 提交次数
- 新增代码行
- 删除代码行
- 净变化行数
- 一周七天提交分布
- 24 小时提交分布
- 项目多选筛选
- 开发者多选筛选
- select + input 组合式筛选
- 日均工作时长、每周工作时长、加班时间占比估算

## 说明

终端报告和 Web 页面共用脚本生成的同一份 `report-data.json`，避免两套统计逻辑不一致。报告页位于 `public/local-report/index.html`，打包时会一起进入 release 产物。脚本启动的是 `127.0.0.1` 本地服务，不需要公网。

## 开发与验证

```bash
npm install
npm run build
npm test -- --runInBand
npm pack --dry-run
```

## 维护规则

- 不要把报告入口改回远程网页。
- 不要新增外网依赖来承载报告页。
- 不要恢复旧业务名称或旧脚本入口。
- 如果新增统计指标，必须同步验证打包后的 `.tgz` 能在干净目录运行。
