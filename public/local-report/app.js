const weekLabels = {
  1: "周一",
  2: "周二",
  3: "周三",
  4: "周四",
  5: "周五",
  6: "周六",
  7: "周日",
}

const periodOptions = [
  { value: "all", label: "全部时间" },
  { value: "this-week", label: "本周" },
  { value: "this-month", label: "本月" },
  { value: "last-7", label: "近 7 天" },
  { value: "last-30", label: "近 30 天" },
  { value: "last-90", label: "近 90 天" },
  { value: "this-year", label: "今年" },
  { value: "custom", label: "自定义" },
]

const chartMap = new Map()

const state = {
  data: null,
  selectedProjects: new Set(),
  selectedAuthors: new Set(),
  period: "all",
}

const dom = {
  reportMeta: document.getElementById("reportMeta"),
  exportReport: document.getElementById("exportReport"),
  repoInfoList: document.getElementById("repoInfoList"),
  authorChoices: document.getElementById("authorChoices"),
  periodChoices: document.getElementById("periodChoices"),
  dateRangeLabel: document.getElementById("dateRangeLabel"),
  customDateRange: document.getElementById("customDateRange"),
  startDate: document.getElementById("startDate"),
  endDate: document.getElementById("endDate"),
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN")
}

function uniqueCount(list, selector) {
  return new Set(list.map(selector).filter(Boolean)).size
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function addDays(value, days) {
  const date = parseDate(value)
  date.setDate(date.getDate() + days)
  return formatDate(date)
}

function clampDate(value, min, max) {
  if (value < min) return min
  if (value > max) return max
  return value
}

function dateDiffDays(startDate, endDate) {
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  const diff = Math.round((end - start) / 86400000) + 1
  return Math.max(diff, 1)
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function chartColors() {
  return [
    getCssVar("--color-primary"),
    getCssVar("--color-green"),
    getCssVar("--color-purple"),
    getCssVar("--color-orange"),
    getCssVar("--color-cyan"),
    getCssVar("--color-pink"),
    getCssVar("--color-yellow"),
    getCssVar("--color-red"),
  ]
}

function estimateHours(commits) {
  const byDate = new Map()
  commits.forEach((commit) => {
    if (!byDate.has(commit.date)) byDate.set(commit.date, [])
    byDate.get(commit.date).push(Number(commit.hour))
  })
  let total = 0
  byDate.forEach((hours) => {
    total += Math.max(...hours) - Math.min(...hours) + 1
  })
  return { workDays: byDate.size, totalHours: total }
}

function renderChoices(container, values, selectedSet) {
  container.textContent = ""
  values.forEach((value) => {
    const label = document.createElement("label")
    const input = document.createElement("input")
    input.type = "checkbox"
    input.value = value
    input.checked = selectedSet.has(value)
    label.append(input, value)
    container.append(label)
  })
}

function renderRepoInfo() {
  dom.repoInfoList.textContent = ""
  state.data.repos.forEach((repo) => {
    const item = document.createElement("label")
    const input = document.createElement("input")
    const content = document.createElement("span")
    const name = document.createElement("div")
    const meta = document.createElement("div")
    const branch = document.createElement("span")
    const path = document.createElement("span")
    item.className = "repo-info-item"
    input.type = "checkbox"
    input.value = repo.name
    input.checked = state.selectedProjects.has(repo.name)
    content.className = "repo-info-content"
    name.className = "repo-info-name"
    meta.className = "repo-info-meta"
    name.textContent = repo.name
    branch.textContent = `分支：${repo.branch}`
    path.textContent = repo.path
    meta.append(branch, path)
    content.append(name, meta)
    item.append(input, content)
    dom.repoInfoList.append(item)
  })
}

function renderPeriodChoices() {
  dom.periodChoices.textContent = ""
  periodOptions.forEach((option) => {
    const button = document.createElement("button")
    button.type = "button"
    button.textContent = option.label
    button.dataset.period = option.value
    if (state.period === option.value) button.classList.add("active")
    dom.periodChoices.append(button)
  })
}

function bindChoices(container, selectedSet) {
  container.addEventListener("change", (event) => {
    const input = event.target
    if (!(input instanceof HTMLInputElement)) return
    if (input.checked) selectedSet.add(input.value)
    else selectedSet.delete(input.value)
    render()
  })
}

function getRangeBounds() {
  return {
    min: state.data.default_filter.start_date,
    max: state.data.default_filter.end_date,
  }
}

function resolvePeriodRange(period) {
  const { min, max } = getRangeBounds()
  const today = parseDate(max)

  if (period === "all") return { startDate: min, endDate: max }
  if (period === "last-7") return { startDate: clampDate(addDays(max, -6), min, max), endDate: max }
  if (period === "last-30") return { startDate: clampDate(addDays(max, -29), min, max), endDate: max }
  if (period === "last-90") return { startDate: clampDate(addDays(max, -89), min, max), endDate: max }
  if (period === "this-year") return { startDate: clampDate(`${today.getFullYear()}-01-01`, min, max), endDate: max }
  if (period === "this-month") {
    return { startDate: clampDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`, min, max), endDate: max }
  }
  if (period === "this-week") {
    const mondayOffset = today.getDay() === 0 ? -6 : 1 - today.getDay()
    return { startDate: clampDate(addDays(max, mondayOffset), min, max), endDate: max }
  }
  return {
    startDate: clampDate(dom.startDate.value || min, min, max),
    endDate: clampDate(dom.endDate.value || max, min, max),
  }
}

function applyPeriod(period) {
  const range = resolvePeriodRange(period)
  if (range.startDate > range.endDate) {
    const startDate = range.endDate
    range.endDate = range.startDate
    range.startDate = startDate
  }
  dom.startDate.value = range.startDate
  dom.endDate.value = range.endDate
  dom.customDateRange.classList.toggle("active", period === "custom")
  dom.dateRangeLabel.textContent = `当前周期：${range.startDate} 至 ${range.endDate}`
}

function getFilteredCommits() {
  const startDate = dom.startDate.value
  const endDate = dom.endDate.value

  return state.data.commits.filter((commit) => {
    if (startDate && commit.date < startDate) return false
    if (endDate && commit.date > endDate) return false
    if (state.selectedProjects.size > 0 && !state.selectedProjects.has(commit.project)) return false
    if (state.selectedAuthors.size > 0 && !state.selectedAuthors.has(commit.author)) return false
    return true
  })
}

function groupCount(commits, key, seed = []) {
  const map = new Map(seed.map((item) => [item, 0]))
  commits.forEach((commit) => map.set(commit[key], (map.get(commit[key]) || 0) + 1))
  return [...map.entries()].map(([label, count]) => ({ label, count }))
}

function selectedText(selectedSet, allValues) {
  return selectedSet.size ? [...selectedSet].join("、") : allValues.join("、")
}

function showChartEmpty(canvasId, isEmpty) {
  const frame = document.getElementById(`${canvasId}Frame`)
  frame.classList.toggle("empty", isEmpty)
}

function destroyChart(canvasId) {
  const chart = chartMap.get(canvasId)
  if (chart) chart.destroy()
  chartMap.delete(canvasId)
}

function renderBarChart(canvasId, list, labelFormatter) {
  destroyChart(canvasId)
  const values = list.map((item) => item.count)
  const isEmpty = !list.length || Math.max(...values, 0) === 0
  showChartEmpty(canvasId, isEmpty)
  if (isEmpty) return

  const color = getCssVar("--color-primary")
  const chart = new Chart(document.getElementById(canvasId), {
    type: "bar",
    data: {
      labels: list.map((item) => labelFormatter(item.label)),
      datasets: [{ label: "提交次数", data: values, backgroundColor: color, borderColor: color, borderWidth: 1 }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (context) => `提交次数：${formatNumber(context.raw)}` } },
      },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  })
  chartMap.set(canvasId, chart)
}

function renderPieChart(canvasId, list) {
  destroyChart(canvasId)
  const rows = list.filter((item) => item.count > 0)
  showChartEmpty(canvasId, rows.length === 0)
  if (!rows.length) return

  const colors = chartColors()
  const total = rows.reduce((sum, item) => sum + item.count, 0)
  const chart = new Chart(document.getElementById(canvasId), {
    type: "pie",
    data: {
      labels: rows.map((item) => item.label),
      datasets: [{ data: rows.map((item) => item.count), backgroundColor: rows.map((_, index) => colors[index % colors.length]) }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (context) => {
              const ratio = total ? ((context.raw / total) * 100).toFixed(1) : "0.0"
              return `${context.label}：${formatNumber(context.raw)} 次，${ratio}%`
            },
          },
        },
      },
    },
  })
  chartMap.set(canvasId, chart)
}

function buildSummary(commits) {
  const added = commits.reduce((sum, commit) => sum + commit.added, 0)
  const deleted = commits.reduce((sum, commit) => sum + commit.deleted, 0)
  const startDate = dom.startDate.value || state.data.default_filter.start_date
  const endDate = dom.endDate.value || state.data.default_filter.end_date
  const days = dateDiffDays(startDate, endDate)
  const work = estimateHours(commits)
  const dailyHours = work.workDays ? work.totalHours / work.workDays : 0
  const weeklyHours = dailyHours * 5
  const overtimeHours = Math.max(weeklyHours - 40, 0)
  const overtimeRatio = weeklyHours ? (overtimeHours / weeklyHours) * 100 : 0

  return {
    added,
    deleted,
    net: added - deleted,
    days,
    dailyCommits: commits.length / days,
    dailyHours,
    weeklyHours,
    overtimeRatio,
  }
}

function renderSummary(commits) {
  const summary = buildSummary(commits)

  document.getElementById("commitCount").textContent = formatNumber(commits.length)
  document.getElementById("addedLines").textContent = formatNumber(summary.added)
  document.getElementById("deletedLines").textContent = formatNumber(summary.deleted)
  document.getElementById("netLines").textContent = formatNumber(summary.net)
  document.getElementById("dailyCommits").textContent = summary.dailyCommits.toFixed(1)
  document.getElementById("dailyWorkHours").textContent = `${summary.dailyHours.toFixed(1)}h`
  document.getElementById("weeklyWorkHours").textContent = `${summary.weeklyHours.toFixed(1)}h`
  document.getElementById("overtimeRatio").textContent = `${summary.overtimeRatio.toFixed(1)}%`
}

function buildAuthorRows(commits) {
  const map = new Map()
  commits.forEach((commit) => {
    if (!map.has(commit.author)) {
      map.set(commit.author, { author: commit.author, commits: 0, added: 0, deleted: 0, dates: new Set() })
    }
    const row = map.get(commit.author)
    row.commits += 1
    row.added += commit.added
    row.deleted += commit.deleted
    row.dates.add(commit.date)
  })
  return [...map.values()].sort((a, b) => b.commits - a.commits)
}

function renderAuthorTable(commits) {
  const rows = buildAuthorRows(commits)
  document.getElementById("authorTable").innerHTML = rows.length
    ? rows
        .map(
          (row) => `
            <tr>
              <td>${row.author}</td>
              <td>${formatNumber(row.commits)}</td>
              <td>${formatNumber(row.added)}</td>
              <td>${formatNumber(row.deleted)}</td>
              <td>${formatNumber(row.dates.size)}</td>
            </tr>
          `
        )
        .join("")
    : '<tr><td colspan="5">当前筛选条件下没有数据</td></tr>'
}

/**
 * 导出的 txt 必须只使用当前页面筛选后的 commits。
 * 用户在页面上勾选仓库、开发者和时间段后，看到的结果必须和导出的结果保持一致。
 */
function buildExportText(commits) {
  const summary = buildSummary(commits)
  const startDate = dom.startDate.value || state.data.default_filter.start_date
  const endDate = dom.endDate.value || state.data.default_filter.end_date
  const projectNames = [...new Set(commits.map((commit) => commit.project))]
  const repoRows = state.data.repos.filter((repo) => projectNames.includes(repo.name))
  const authorRows = buildAuthorRows(commits)
  const projectRows = groupCount(commits, "project").sort((a, b) => b.count - a.count)
  const weekRows = groupCount(commits, "week_day", ["1", "2", "3", "4", "5", "6", "7"])
  const hourRows = groupCount(commits, "hour", Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")))

  return [
    "Git 工作量报告",
    "========================================",
    `本地生成时间：${state.data.generated_at}`,
    `导出时间：${new Date().toLocaleString("zh-CN")}`,
    `统计时间范围：${startDate} 至 ${endDate}`,
    `当前仓库筛选：${selectedText(state.selectedProjects, state.data.projects)}`,
    `当前开发者筛选：${selectedText(state.selectedAuthors, state.data.authors)}`,
    "",
    "核心汇总",
    `项目数量：${formatNumber(uniqueCount(commits, (item) => item.project))}`,
    `开发者数量：${formatNumber(uniqueCount(commits, (item) => item.author))}`,
    `提交次数：${formatNumber(commits.length)}`,
    `新增代码行：${formatNumber(summary.added)}`,
    `删除代码行：${formatNumber(summary.deleted)}`,
    `净变化行数：${formatNumber(summary.net)}`,
    `日均提交次数：${summary.dailyCommits.toFixed(1)}`,
    `日均工作时长：${summary.dailyHours.toFixed(1)}h`,
    `每周工作时长：${summary.weeklyHours.toFixed(1)}h`,
    `加班时间占比：${summary.overtimeRatio.toFixed(1)}%`,
    "",
    "仓库信息",
    ...(repoRows.length ? repoRows.map((repo) => `${repo.name}｜分支：${repo.branch}｜${repo.path}`) : ["当前筛选条件下没有数据"]),
    "",
    "项目提交占比",
    ...(projectRows.length ? projectRows.map((row) => `${row.label}：${formatNumber(row.count)} 次`) : ["当前筛选条件下没有数据"]),
    "",
    "开发者工作量",
    ...(authorRows.length
      ? authorRows.map((row) => `${row.author}：提交 ${formatNumber(row.commits)}，新增 ${formatNumber(row.added)}，删除 ${formatNumber(row.deleted)}，工作天数 ${formatNumber(row.dates.size)}`)
      : ["当前筛选条件下没有数据"]),
    "",
    "一周七天提交分布",
    ...weekRows.map((row) => `${weekLabels[row.label] || row.label}：${formatNumber(row.count)} 次`),
    "",
    "24 小时提交分布",
    ...hourRows.map((row) => `${row.label}:00：${formatNumber(row.count)} 次`),
    "",
  ].join("\n")
}

function exportReportText() {
  const commits = getFilteredCommits()
  const text = buildExportText(commits)
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
  const link = document.createElement("a")
  const startDate = dom.startDate.value || state.data.default_filter.start_date
  const endDate = dom.endDate.value || state.data.default_filter.end_date
  const downloadUrl = URL.createObjectURL(blob)
  link.href = downloadUrl
  link.download = `git-workload-report-${startDate}_${endDate}.txt`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(downloadUrl)
}

function render() {
  const commits = getFilteredCommits()
  renderSummary(commits)
  renderBarChart("weekChart", groupCount(commits, "week_day", ["1", "2", "3", "4", "5", "6", "7"]), (label) => weekLabels[label] || label)
  renderBarChart(
    "hourChart",
    groupCount(commits, "hour", Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"))),
    (label) => `${label}:00`
  )
  renderPieChart("authorChart", groupCount(commits, "author").sort((a, b) => b.count - a.count).slice(0, 12))
  renderPieChart("projectChart", groupCount(commits, "project").sort((a, b) => b.count - a.count).slice(0, 12))
  renderAuthorTable(commits)
  dom.reportMeta.textContent = `本地生成时间：${state.data.generated_at}，当前结果包含 ${uniqueCount(commits, (item) => item.project)} 个项目、${uniqueCount(commits, (item) => item.author)} 位开发者。`
}

async function bootstrap() {
  const response = await fetch("report-data.json")
  state.data = await response.json()
  renderRepoInfo()
  renderChoices(dom.authorChoices, state.data.authors, state.selectedAuthors)
  renderPeriodChoices()
  applyPeriod(state.period)
  bindChoices(dom.repoInfoList, state.selectedProjects)
  bindChoices(dom.authorChoices, state.selectedAuthors)
  dom.exportReport.addEventListener("click", exportReportText)
  dom.periodChoices.addEventListener("click", (event) => {
    const button = event.target
    if (!(button instanceof HTMLButtonElement)) return
    state.period = button.dataset.period
    renderPeriodChoices()
    applyPeriod(state.period)
    render()
  })
  ;[dom.startDate, dom.endDate].forEach((element) => {
    element.addEventListener("change", () => {
      state.period = "custom"
      renderPeriodChoices()
      applyPeriod(state.period)
      render()
    })
  })
  render()
}

bootstrap().catch((error) => {
  dom.reportMeta.textContent = `本地报告数据加载失败：${error.message}`
})
