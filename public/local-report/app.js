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
  projectChoices: document.getElementById("projectChoices"),
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

function renderSummary(commits) {
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

  document.getElementById("commitCount").textContent = formatNumber(commits.length)
  document.getElementById("addedLines").textContent = formatNumber(added)
  document.getElementById("deletedLines").textContent = formatNumber(deleted)
  document.getElementById("netLines").textContent = formatNumber(added - deleted)
  document.getElementById("dailyCommits").textContent = (commits.length / days).toFixed(1)
  document.getElementById("dailyWorkHours").textContent = `${dailyHours.toFixed(1)}h`
  document.getElementById("weeklyWorkHours").textContent = `${weeklyHours.toFixed(1)}h`
  document.getElementById("overtimeRatio").textContent = `${overtimeRatio.toFixed(1)}%`
}

function renderAuthorTable(commits) {
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
  const rows = [...map.values()].sort((a, b) => b.commits - a.commits)
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
  renderChoices(dom.projectChoices, state.data.projects, state.selectedProjects)
  renderChoices(dom.authorChoices, state.data.authors, state.selectedAuthors)
  renderPeriodChoices()
  applyPeriod(state.period)
  bindChoices(dom.projectChoices, state.selectedProjects)
  bindChoices(dom.authorChoices, state.selectedAuthors)
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
