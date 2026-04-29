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
  period: "last-7",
}

const dom = {
  reportMeta: document.getElementById("reportMeta"),
  exportXlsx: document.getElementById("exportXlsx"),
  exportReport: document.getElementById("exportReport"),
  repoInfoList: document.getElementById("repoInfoList"),
  authorChoices: document.getElementById("authorChoices"),
  periodChoices: document.getElementById("periodChoices"),
  dateRangeLabel: document.getElementById("dateRangeLabel"),
  customDateRange: document.getElementById("customDateRange"),
  startDate: document.getElementById("startDate"),
  endDate: document.getElementById("endDate"),
}

const textEncoder = new TextEncoder()

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
    min: state.data.data_range?.start_date || state.data.default_filter.start_date,
    max: state.data.data_range?.end_date || state.data.default_filter.end_date,
  }
}

function getCommitsForAuthorChoices() {
  const startDate = dom.startDate.value
  const endDate = dom.endDate.value

  return state.data.commits.filter((commit) => {
    if (startDate && commit.date < startDate) return false
    if (endDate && commit.date > endDate) return false
    if (state.selectedProjects.size > 0 && !state.selectedProjects.has(commit.project)) return false
    return true
  })
}

function syncAuthorChoices() {
  const availableAuthors = [...new Set(getCommitsForAuthorChoices().map((commit) => commit.author))].sort((a, b) => a.localeCompare(b, "zh-CN"))
  state.selectedAuthors = new Set([...state.selectedAuthors].filter((author) => availableAuthors.includes(author)))
  renderChoices(dom.authorChoices, availableAuthors, state.selectedAuthors)
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
    repoCount: state.selectedProjects.size || state.data.repos.length,
    activeProjectCount: uniqueCount(commits, (item) => item.project),
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

  document.getElementById("repoCount").textContent = formatNumber(summary.repoCount)
  document.getElementById("activeProjectCount").textContent = formatNumber(summary.activeProjectCount)
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

function getCurrentFilterRange() {
  return {
    startDate: dom.startDate.value || state.data.default_filter.start_date,
    endDate: dom.endDate.value || state.data.default_filter.end_date,
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function createInlineStringCell(ref, value, styleIndex = 0) {
  return `<c r="${ref}" s="${styleIndex}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`
}

function createNumberCell(ref, value, styleIndex = 0) {
  return `<c r="${ref}" s="${styleIndex}"><v>${value}</v></c>`
}

function buildProjectExportRows(commits) {
  const rows = new Map()
  commits.forEach((commit) => {
    if (!rows.has(commit.project)) {
      rows.set(commit.project, {
        project: commit.project,
        totalLines: 0,
        added: 0,
        deleted: 0,
        commits: 0,
        authors: new Set(),
      })
    }
    const row = rows.get(commit.project)
    row.totalLines += commit.added + commit.deleted
    row.added += commit.added
    row.deleted += commit.deleted
    row.commits += 1
    row.authors.add(commit.author)
  })

  return [...rows.values()]
    .sort((a, b) => b.totalLines - a.totalLines)
    .map((row) => ({
      project: row.project,
      totalLines: row.totalLines,
      added: row.added,
      deleted: row.deleted,
      commitCount: row.commits,
      authorCount: row.authors.size,
      perAuthorLines: row.authors.size ? (row.totalLines / row.authors.size).toFixed(2) : "0.00",
    }))
}

function buildXlsxSheetXml(commits) {
  const { startDate, endDate } = getCurrentFilterRange()
  const filterRangeText = `${startDate} 至 ${endDate}`
  const generatedAtText = state.data.generated_at
  const projectRows = buildProjectExportRows(commits)
  const totalRows = Math.max(projectRows.length, 8)
  const sheetRows = []

  sheetRows.push(
    `<row r="1">${[
      createInlineStringCell("A1", "时间", 1),
      createInlineStringCell("B1", filterRangeText, 1),
      `<c r="C1" s="1"/>`,
      `<c r="D1" s="1"/>`,
      createInlineStringCell("E1", "报告输出时间", 1),
      createInlineStringCell("F1", generatedAtText, 1),
      `<c r="G1" s="1"/>`,
    ].join("")}</row>`
  )
  sheetRows.push(
    `<row r="2">${[
      createInlineStringCell("A2", "项目代码情况", 2),
      `<c r="B2" s="2"/>`,
      `<c r="C2" s="2"/>`,
      `<c r="D2" s="2"/>`,
      createInlineStringCell("E2", "人均生产力", 2),
      `<c r="F2" s="2"/>`,
      `<c r="G2" s="2"/>`,
    ].join("")}</row>`
  )
  sheetRows.push(
    `<row r="3">${[
      createInlineStringCell("A3", "项目名", 3),
      createInlineStringCell("B3", "提交代码总行数", 3),
      createInlineStringCell("C3", "新增代码行数", 3),
      createInlineStringCell("D3", "删除代码行数", 3),
      createInlineStringCell("E3", "本周期提交次数", 3),
      createInlineStringCell("F3", "本周期提交人次", 3),
      createInlineStringCell("G3", "本周期人均提交代码行数", 3),
    ].join("")}</row>`
  )

  for (let index = 0; index < totalRows; index += 1) {
    const rowNumber = index + 4
    const row = projectRows[index]
    sheetRows.push(
      `<row r="${rowNumber}">${[
        createInlineStringCell(`A${rowNumber}`, row ? row.project : "", 4),
        row ? createNumberCell(`B${rowNumber}`, row.totalLines, 4) : `<c r="B${rowNumber}" s="4"/>`,
        row ? createNumberCell(`C${rowNumber}`, row.added, 4) : `<c r="C${rowNumber}" s="4"/>`,
        row ? createNumberCell(`D${rowNumber}`, row.deleted, 4) : `<c r="D${rowNumber}" s="4"/>`,
        row ? createNumberCell(`E${rowNumber}`, row.commitCount, 4) : `<c r="E${rowNumber}" s="4"/>`,
        row ? createNumberCell(`F${rowNumber}`, row.authorCount, 4) : `<c r="F${rowNumber}" s="4"/>`,
        row ? createNumberCell(`G${rowNumber}`, row.perAuthorLines, 4) : `<c r="G${rowNumber}" s="4"/>`,
      ].join("")}</row>`
    )
  }

  const lastRow = totalRows + 3
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:G${lastRow}"/>
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
    ${sheetRows.join("")}
  </sheetData>
  <mergeCells count="2">
    <mergeCell ref="A2:D2"/>
    <mergeCell ref="E2:G2"/>
  </mergeCells>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`
}

function buildXlsxStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
</styleSheet>`
}

function buildXlsxFiles(commits) {
  const now = new Date().toISOString()
  return [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    },
    {
      name: "docProps/app.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>git-workload-report</Application>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>工作表</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>Sheet1</vt:lpstr></vt:vector></TitlesOfParts>
</Properties>`,
    },
    {
      name: "docProps/core.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>git-workload-report</dc:creator>
  <cp:lastModifiedBy>git-workload-report</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`,
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { name: "xl/styles.xml", content: buildXlsxStylesXml() },
    { name: "xl/worksheets/sheet1.xml", content: buildXlsxSheetXml(commits) },
  ]
}

function makeCrcTable() {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
}

const crcTable = makeCrcTable()

function crc32(bytes) {
  let value = 0xffffffff
  for (const item of bytes) {
    value = crcTable[(value ^ item) & 0xff] ^ (value >>> 8)
  }
  return (value ^ 0xffffffff) >>> 0
}

function writeUint16(view, offset, value) {
  view.setUint16(offset, value, true)
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value, true)
}

function createStoredZip(files) {
  const preparedFiles = files.map((file) => {
    const nameBytes = textEncoder.encode(file.name)
    const contentBytes = textEncoder.encode(file.content)
    return {
      name: file.name,
      nameBytes,
      contentBytes,
      crc: crc32(contentBytes),
    }
  })

  const localParts = []
  const centralParts = []
  let offset = 0

  preparedFiles.forEach((file) => {
    const localHeader = new Uint8Array(30 + file.nameBytes.length)
    const localView = new DataView(localHeader.buffer)
    writeUint32(localView, 0, 0x04034b50)
    writeUint16(localView, 4, 20)
    writeUint16(localView, 6, 0)
    writeUint16(localView, 8, 0)
    writeUint16(localView, 10, 0)
    writeUint16(localView, 12, 0)
    writeUint32(localView, 14, file.crc)
    writeUint32(localView, 18, file.contentBytes.length)
    writeUint32(localView, 22, file.contentBytes.length)
    writeUint16(localView, 26, file.nameBytes.length)
    writeUint16(localView, 28, 0)
    localHeader.set(file.nameBytes, 30)
    localParts.push(localHeader, file.contentBytes)

    const centralHeader = new Uint8Array(46 + file.nameBytes.length)
    const centralView = new DataView(centralHeader.buffer)
    writeUint32(centralView, 0, 0x02014b50)
    writeUint16(centralView, 4, 20)
    writeUint16(centralView, 6, 20)
    writeUint16(centralView, 8, 0)
    writeUint16(centralView, 10, 0)
    writeUint16(centralView, 12, 0)
    writeUint16(centralView, 14, 0)
    writeUint32(centralView, 16, file.crc)
    writeUint32(centralView, 20, file.contentBytes.length)
    writeUint32(centralView, 24, file.contentBytes.length)
    writeUint16(centralView, 28, file.nameBytes.length)
    writeUint16(centralView, 30, 0)
    writeUint16(centralView, 32, 0)
    writeUint16(centralView, 34, 0)
    writeUint16(centralView, 36, 0)
    writeUint32(centralView, 38, 0)
    writeUint32(centralView, 42, offset)
    centralHeader.set(file.nameBytes, 46)
    centralParts.push(centralHeader)

    offset += localHeader.length + file.contentBytes.length
  })

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const endRecord = new Uint8Array(22)
  const endView = new DataView(endRecord.buffer)
  writeUint32(endView, 0, 0x06054b50)
  writeUint16(endView, 4, 0)
  writeUint16(endView, 6, 0)
  writeUint16(endView, 8, preparedFiles.length)
  writeUint16(endView, 10, preparedFiles.length)
  writeUint32(endView, 12, centralSize)
  writeUint32(endView, 16, offset)
  writeUint16(endView, 20, 0)

  return new Blob([...localParts, ...centralParts, endRecord], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

function downloadBlob(blob, fileName) {
  const link = document.createElement("a")
  const downloadUrl = URL.createObjectURL(blob)
  link.href = downloadUrl
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(downloadUrl)
}

function buildTimestampFileName(prefix, extension) {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  const hours = String(now.getHours()).padStart(2, "0")
  const minutes = String(now.getMinutes()).padStart(2, "0")
  return `${prefix}_${year}${month}${day}${hours}${minutes}.${extension}`
}

/**
 * 导出的 txt 必须只使用当前页面筛选后的 commits。
 * 用户在页面上勾选仓库、开发者和时间段后，看到的结果必须和导出的结果保持一致。
 */
function buildExportText(commits) {
  const summary = buildSummary(commits)
  const { startDate, endDate } = getCurrentFilterRange()
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
    `当前仓库筛选：${selectedText(state.selectedProjects, state.data.repos.map((repo) => repo.name))}`,
    `当前开发者筛选：${selectedText(state.selectedAuthors, state.data.authors)}`,
    "",
    "核心汇总",
    `仓库数量：${formatNumber(summary.repoCount)}`,
    `有提交项目数：${formatNumber(summary.activeProjectCount)}`,
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
  const { startDate, endDate } = getCurrentFilterRange()
  downloadBlob(blob, `git-workload-report-${startDate}_${endDate}.txt`)
}

function exportReportXlsx() {
  const commits = getFilteredCommits()
  const files = buildXlsxFiles(commits)
  const blob = createStoredZip(files)
  downloadBlob(blob, buildTimestampFileName("output", "xlsx"))
}

function render() {
  syncAuthorChoices()
  const commits = getFilteredCommits()
  const summary = buildSummary(commits)
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
  dom.reportMeta.textContent = `本地生成时间：${state.data.generated_at}，当前选中 ${summary.repoCount} 个仓库，其中 ${summary.activeProjectCount} 个仓库有提交，包含 ${uniqueCount(commits, (item) => item.author)} 位开发者。`
}

async function bootstrap() {
  const response = await fetch("report-data.json")
  state.data = await response.json()
  state.selectedProjects = new Set(state.data.repos.map((repo) => repo.name))
  renderRepoInfo()
  renderPeriodChoices()
  applyPeriod(state.period)
  bindChoices(dom.repoInfoList, state.selectedProjects)
  bindChoices(dom.authorChoices, state.selectedAuthors)
  dom.exportXlsx.addEventListener("click", exportReportXlsx)
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
