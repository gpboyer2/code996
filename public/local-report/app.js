const weekLabels = {
  1: "周一",
  2: "周二",
  3: "周三",
  4: "周四",
  5: "周五",
  6: "周六",
  7: "周日",
}

const state = {
  data: null,
  selectedProjects: new Set(),
  selectedAuthors: new Set(),
}

const dom = {
  reportMeta: document.getElementById("reportMeta"),
  projectChoices: document.getElementById("projectChoices"),
  authorChoices: document.getElementById("authorChoices"),
  startDate: document.getElementById("startDate"),
  endDate: document.getElementById("endDate"),
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN")
}

function uniqueCount(list, selector) {
  return new Set(list.map(selector).filter(Boolean)).size
}

function dateDiffDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  const diff = Math.round((end - start) / 86400000) + 1
  return Math.max(diff, 1)
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

function bindChoices(container, selectedSet) {
  container.addEventListener("change", (event) => {
    const input = event.target
    if (!(input instanceof HTMLInputElement)) return
    if (input.checked) selectedSet.add(input.value)
    else selectedSet.delete(input.value)
    render()
  })
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

function renderChart(containerId, list, labelFormatter, className = "") {
  const container = document.getElementById(containerId)
  const max = Math.max(...list.map((item) => item.count), 0)
  if (!list.length || max === 0) {
    container.innerHTML = '<div class="empty">当前筛选条件下没有可展示的数据</div>'
    return
  }
  container.innerHTML = list
    .map((item) => {
      const height = Math.max(4, Math.round((item.count / max) * 160))
      return `
        <div class="bar-item">
          <div class="bar ${className}" style="height: ${height}px"></div>
          <div class="bar-value">${formatNumber(item.count)}</div>
          <div class="bar-label">${labelFormatter(item.label)}</div>
        </div>
      `
    })
    .join("")
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
  renderChart("weekChart", groupCount(commits, "week_day", ["1", "2", "3", "4", "5", "6", "7"]), (label) => weekLabels[label] || label)
  renderChart(
    "hourChart",
    groupCount(commits, "hour", Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"))),
    (label) => `${label}:00`
  )
  renderChart(
    "authorChart",
    groupCount(commits, "author").sort((a, b) => b.count - a.count).slice(0, 12),
    (label) => label,
    "purple"
  )
  renderAuthorTable(commits)
  dom.reportMeta.textContent = `本地生成时间：${state.data.generated_at}，当前结果包含 ${uniqueCount(commits, (item) => item.project)} 个项目、${uniqueCount(commits, (item) => item.author)} 位开发者。`
}

async function bootstrap() {
  const response = await fetch("report-data.json")
  state.data = await response.json()
  dom.startDate.value = state.data.default_filter.start_date
  dom.endDate.value = state.data.default_filter.end_date
  renderChoices(dom.projectChoices, state.data.projects, state.selectedProjects)
  renderChoices(dom.authorChoices, state.data.authors, state.selectedAuthors)
  bindChoices(dom.projectChoices, state.selectedProjects)
  bindChoices(dom.authorChoices, state.selectedAuthors)
  ;[dom.startDate, dom.endDate].forEach((element) => {
    element.addEventListener("input", render)
    element.addEventListener("change", render)
  })
  render()
}

bootstrap().catch((error) => {
  dom.reportMeta.textContent = `本地报告数据加载失败：${error.message}`
})
