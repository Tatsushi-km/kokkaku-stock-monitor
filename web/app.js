const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSv8jFY5yPOg5mqVzwU_ZB38lw38aaZn3YW4FkcpiNERDSVRh1eSm8vfjfNrKUM_OPKvgvPpwcRRXE0/pub?gid=2077407360&single=true&output=csv";
const SCORE_STATUS_MODE = "auto"; // "auto": アプリ自動計算, "csv": CSV値優先
const LOCAL_CSV_PATHS = ["../data/stocks_master.csv", "/data/stocks_master.csv"];
const COLUMNS = [
  "code",
  "name",
  "theme",
  "sub_theme",
  "role",
  "priority",
  "core",
  "memo",
  "current_price",
  "change_pct",
  "volume",
  "volume_ratio",
  "ma25_gap",
  "ma75_gap",
  "per",
  "pbr",
  "credit_ratio",
  "next_earnings",
  "score",
  "status",
  "note",
  "price_date",
];
const STATUS_ORDER = ["監視強化", "押し目待ち", "条件待ち", "調整中", "過熱注意"];

const state = {
  rows: [],
  csvLoaded: false,
  csvError: "",
  csvSource: "",
  csvFallbackMessage: "",
  lastCheckedAt: "",
  sortScoreDesc: true,
  filters: {
    theme: "",
    priority: "",
    status: "",
    core: "",
  },
};

const elements = {
  totalCount: document.getElementById("totalCount"),
  watchCount: document.getElementById("watchCount"),
  dipCount: document.getElementById("dipCount"),
  heatCount: document.getElementById("heatCount"),
  dataCheckUpdatedAt: document.getElementById("dataCheckUpdatedAt"),
  csvSuccessValue: document.getElementById("csvSuccessValue"),
  csvSourceValue: document.getElementById("csvSourceValue"),
  csvLoadedAtValue: document.getElementById("csvLoadedAtValue"),
  loadedRowCount: document.getElementById("loadedRowCount"),
  priceFilledCount: document.getElementById("priceFilledCount"),
  volumeRatioFilledCount: document.getElementById("volumeRatioFilledCount"),
  scoreFilledCount: document.getElementById("scoreFilledCount"),
  statusFilledCount: document.getElementById("statusFilledCount"),
  scoreStatusModeValue: document.getElementById("scoreStatusModeValue"),
  priceDateValue: document.getElementById("priceDateValue"),
  dataCheckMessage: document.getElementById("dataCheckMessage"),
  statusCardGrid: document.getElementById("statusCardGrid"),
  todayFocusList: document.getElementById("todayFocusList"),
  dipCandidateList: document.getElementById("dipCandidateList"),
  deepDipWarningList: document.getElementById("deepDipWarningList"),
  themeAverageCount: document.getElementById("themeAverageCount"),
  themeAverageList: document.getElementById("themeAverageList"),
  topScoreList: document.getElementById("topScoreList"),
  topVolumeRatioList: document.getElementById("topVolumeRatioList"),
  resultCount: document.getElementById("resultCount"),
  tableBody: document.getElementById("stockTableBody"),
  emptyState: document.getElementById("emptyState"),
  errorState: document.getElementById("errorState"),
  themeFilter: document.getElementById("themeFilter"),
  priorityFilter: document.getElementById("priorityFilter"),
  statusFilter: document.getElementById("statusFilter"),
  coreFilter: document.getElementById("coreFilter"),
  scoreSortButton: document.getElementById("scoreSortButton"),
  reloadButton: document.getElementById("reloadButton"),
};

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  loadStocks();
});

function bindEvents() {
  elements.themeFilter.addEventListener("change", (event) => {
    state.filters.theme = event.target.value;
    render();
  });
  elements.priorityFilter.addEventListener("change", (event) => {
    state.filters.priority = event.target.value;
    render();
  });
  elements.statusFilter.addEventListener("change", (event) => {
    state.filters.status = event.target.value;
    render();
  });
  elements.coreFilter.addEventListener("change", (event) => {
    state.filters.core = event.target.value;
    render();
  });
  elements.scoreSortButton.addEventListener("click", () => {
    state.sortScoreDesc = !state.sortScoreDesc;
    elements.scoreSortButton.textContent = state.sortScoreDesc ? "score 高い順" : "score 低い順";
    elements.scoreSortButton.setAttribute("aria-pressed", String(state.sortScoreDesc));
    render();
  });
  elements.reloadButton.addEventListener("click", loadStocks);
}

async function loadStocks() {
  setError("");
  state.csvLoaded = false;
  state.csvError = "";
  state.csvSource = "";
  state.csvFallbackMessage = "";
  state.lastCheckedAt = "";
  renderDataCheck();

  try {
    const csvResult = await fetchCsv();
    state.rows = normalizeRows(parseCsv(csvResult.text));
    state.csvLoaded = true;
    state.csvError = "";
    state.csvSource = csvResult.source;
    state.csvFallbackMessage = csvResult.warning;
    state.lastCheckedAt = new Date().toLocaleTimeString("ja-JP");
    populateFilters();
    render();
  } catch (error) {
    const errorMessage = `CSVを読み込めませんでした。${error.message}`;
    state.rows = [];
    state.csvLoaded = false;
    state.csvError = errorMessage;
    state.csvSource = "";
    state.csvFallbackMessage = "";
    state.lastCheckedAt = new Date().toLocaleTimeString("ja-JP");
    populateFilters();
    render();
    setError(errorMessage);
  }
}

async function fetchCsv() {
  const googleCsvUrl = CSV_URL.trim();

  if (googleCsvUrl) {
    try {
      return {
        text: await fetchCsvText(googleCsvUrl),
        source: "Googleスプレッドシート",
        warning: "",
      };
    } catch (googleError) {
      try {
        const localResult = await fetchLocalCsv();
        return {
          ...localResult,
          warning: `GoogleスプレッドシートCSVの読み込みに失敗したため、ローカルCSVを表示しています。(${googleError.message})`,
        };
      } catch (localError) {
        throw new Error(
          `GoogleスプレッドシートCSVとローカルCSVの両方を読み込めませんでした。Google: ${googleError.message} / ローカル: ${localError.message}`
        );
      }
    }
  }

  return fetchLocalCsv();
}

async function fetchLocalCsv() {
  let lastError = null;

  for (const path of LOCAL_CSV_PATHS) {
    try {
      return {
        text: await fetchCsvText(path),
        source: "ローカルCSV",
        warning: "",
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("CSVパスが見つかりません。");
}

async function fetchCsvText(url) {
  const response = await fetch(addCacheBuster(url), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function addCacheBuster(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${Date.now()}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      field += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) {
    rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] || "").trim();
    });
    return record;
  });
}

function normalizeRows(rows) {
  return rows.map((row) => {
    const normalized = {};
    COLUMNS.forEach((column) => {
      normalized[column] = row[column] ?? "";
    });

    const rawScore = normalized.score;
    const rawStatus = normalized.status;
    const calculatedScore = calculateScore(normalized);
    const calculationMode = getScoreStatusSetting();
    const useAutoScore = calculationMode === "auto" || !hasText(rawScore);
    const finalScore = useAutoScore ? String(calculatedScore) : rawScore;
    const useAutoStatus = calculationMode === "auto" || !hasText(rawStatus);

    normalized._rawScore = rawScore;
    normalized._rawStatus = rawStatus;
    normalized._scoreSource = useAutoScore ? "auto" : "csv";
    normalized._statusSource = useAutoStatus ? "auto" : "csv";
    normalized.score = finalScore;
    normalized.status = useAutoStatus ? calculateStatus(normalized, finalScore) : rawStatus;

    return normalized;
  });
}

function getScoreStatusSetting() {
  return SCORE_STATUS_MODE === "auto" ? "auto" : "csv";
}

function calculateScore(row) {
  let score = 0;
  const changePct = parseNumber(row.change_pct);
  const volumeRatio = parseNumber(row.volume_ratio);
  const ma25Gap = parseNumber(row.ma25_gap);
  const ma75Gap = parseNumber(row.ma75_gap);

  if (changePct !== null && changePct > 0) {
    score += 1;
  }
  if (volumeRatio !== null && volumeRatio >= 1.5) {
    score += 1;
  }
  if (volumeRatio !== null && volumeRatio >= 2) {
    score += 1;
  }
  if (ma25Gap !== null && ma25Gap > 0) {
    score += 1;
  }
  if (ma75Gap !== null && ma75Gap > 0) {
    score += 1;
  }
  if (ma25Gap !== null && ma25Gap >= 0 && ma25Gap <= 10) {
    score += 1;
  }
  if (ma75Gap !== null && ma75Gap >= 0 && ma75Gap <= 20) {
    score += 1;
  }
  if (ma25Gap !== null && ma25Gap >= 15) {
    score -= 2;
  }
  if (ma25Gap !== null && ma25Gap >= 25) {
    score -= 1;
  }
  if (ma25Gap !== null && ma25Gap <= -10) {
    score -= 1;
  }
  if (ma75Gap !== null && ma75Gap <= -10) {
    score -= 1;
  }
  if (volumeRatio !== null && volumeRatio < 0.7) {
    score -= 1;
  }
  if (changePct !== null && changePct <= -3) {
    score -= 1;
  }

  return clamp(score, 0, 5);
}

function calculateStatus(row, scoreValue) {
  const ma25Gap = parseNumber(row.ma25_gap);
  const volumeRatio = parseNumber(row.volume_ratio);
  const score = toNumber(scoreValue);

  if (ma25Gap !== null && ma25Gap >= 25) {
    return "過熱注意";
  }
  if (ma25Gap !== null && ma25Gap >= 15 && volumeRatio !== null && volumeRatio >= 2) {
    return "過熱注意";
  }
  if (ma25Gap !== null && ma25Gap <= -10) {
    return "押し目待ち";
  }
  if (score >= 4) {
    return "監視強化";
  }
  if (score >= 2) {
    return "条件待ち";
  }
  return "調整中";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function populateFilters() {
  setOptions(elements.themeFilter, uniqueValues("theme"), state.filters.theme);
  setOptions(elements.priorityFilter, uniqueValues("priority"), state.filters.priority);
  setOptions(elements.statusFilter, uniqueValues("status"), state.filters.status);
  setOptions(elements.coreFilter, uniqueValues("core"), state.filters.core);
}

function uniqueValues(key) {
  return [...new Set(state.rows.map((row) => row[key]).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ja")
  );
}

function setOptions(select, values, selectedValue) {
  select.innerHTML = '<option value="">すべて</option>';
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  select.value = values.includes(selectedValue) ? selectedValue : "";
}

function render() {
  const filteredRows = state.rows
    .filter((row) => matchesFilter(row, "theme"))
    .filter((row) => matchesFilter(row, "priority"))
    .filter((row) => matchesFilter(row, "status"))
    .filter((row) => matchesFilter(row, "core"));
  const sortedRows = [...filteredRows].sort(sortByScore);

  renderDataCheck();
  renderSummary();
  renderStatusCards(filteredRows);
  renderTodayFocus(filteredRows);
  renderDipCandidates(filteredRows);
  renderDeepDipWarnings(filteredRows);
  renderThemeAverages(filteredRows);
  renderRankings(filteredRows);
  renderTable(sortedRows);
}

function matchesFilter(row, key) {
  return !state.filters[key] || row[key] === state.filters[key];
}

function sortByScore(a, b) {
  const scoreA = toNumber(a.score);
  const scoreB = toNumber(b.score);
  const direction = state.sortScoreDesc ? -1 : 1;

  if (scoreA === scoreB) {
    return String(a.code).localeCompare(String(b.code), "ja", { numeric: true });
  }

  return (scoreA - scoreB) * direction;
}

function renderSummary() {
  elements.totalCount.textContent = state.rows.length;
  elements.watchCount.textContent = countStatus(state.rows, "監視強化");
  elements.dipCount.textContent = countStatus(state.rows, "押し目待ち");
  elements.heatCount.textContent = countStatus(state.rows, "過熱注意");
}

function renderDataCheck() {
  const rows = state.rows;
  const priceFilled = countFilled(rows, "current_price");
  const volumeRatioFilled = countFilled(rows, "volume_ratio");
  const scoreFilled = countRawFilled(rows, "_rawScore");
  const statusFilled = countRawFilled(rows, "_rawStatus");

  elements.loadedRowCount.textContent = rows.length;
  elements.priceFilledCount.textContent = priceFilled;
  elements.volumeRatioFilledCount.textContent = volumeRatioFilled;
  elements.scoreFilledCount.textContent = scoreFilled;
  elements.statusFilledCount.textContent = statusFilled;
  elements.scoreStatusModeValue.textContent = getScoreStatusMode(rows);
  elements.priceDateValue.textContent = getPriceDateDisplay(rows);
  elements.csvSourceValue.textContent = state.csvSource || "-";
  elements.csvLoadedAtValue.textContent = state.lastCheckedAt || "-";
  elements.dataCheckUpdatedAt.textContent = state.lastCheckedAt
    ? `最終確認 ${state.lastCheckedAt}`
    : "確認中";

  elements.csvSuccessValue.classList.remove("is-success", "is-error");
  if (state.csvError) {
    elements.csvSuccessValue.textContent = "失敗";
    elements.csvSuccessValue.classList.add("is-error");
    showDataCheckMessage(state.csvError, "is-error");
    return;
  }

  if (!state.csvLoaded) {
    elements.csvSuccessValue.textContent = "確認中";
    hideDataCheckMessage();
    return;
  }

  elements.csvSuccessValue.textContent = "成功";
  elements.csvSuccessValue.classList.add("is-success");

  const warnings = [];
  if (state.csvFallbackMessage) {
    warnings.push(state.csvFallbackMessage);
  }
  if (rows.length === 0) {
    warnings.push("CSVは読み込めましたが、銘柄データ行がありません。");
  }
  if (rows.length > priceFilled) {
    warnings.push(`current_price が空欄の銘柄が ${rows.length - priceFilled} 件あります。`);
  }
  if (rows.length > scoreFilled) {
    warnings.push(`score が空欄の銘柄が ${rows.length - scoreFilled} 件あります。アプリ側で自動計算しています。`);
  }

  if (warnings.length > 0) {
    showDataCheckMessage(warnings.join(" "), "is-warning");
  } else {
    hideDataCheckMessage();
  }
}

function countFilled(rows, key) {
  return rows.filter((row) => String(row[key] || "").trim() !== "").length;
}

function countRawFilled(rows, key) {
  return rows.filter((row) => hasText(row[key])).length;
}

function getScoreStatusMode(rows) {
  if (rows.length === 0) {
    return "-";
  }

  if (getScoreStatusSetting() === "auto") {
    return "アプリ自動計算";
  }

  const hasCsvValue = rows.some((row) => row._scoreSource === "csv" || row._statusSource === "csv");
  const hasAutoValue = rows.some((row) => row._scoreSource === "auto" || row._statusSource === "auto");

  if (hasCsvValue && hasAutoValue) {
    return "CSV値 / アプリ自動計算";
  }
  return hasAutoValue ? "アプリ自動計算" : "CSV値";
}

function getPriceDateDisplay(rows) {
  const dates = [...new Set(rows.map((row) => normalizePriceDate(row.price_date)).filter(Boolean))]
    .sort();

  if (dates.length === 0) {
    return "-";
  }

  if (dates.length === 1) {
    return dates[0];
  }

  return `${dates[0]}〜${dates[dates.length - 1]}`;
}

function normalizePriceDate(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const separatedDate = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (separatedDate) {
    return formatDateParts(separatedDate[1], separatedDate[2], separatedDate[3]);
  }

  const compactDate = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactDate) {
    return formatDateParts(compactDate[1], compactDate[2], compactDate[3]);
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    return formatSpreadsheetSerialDate(Number(text));
  }

  return text;
}

function formatDateParts(yearText, monthText, dayText) {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!isValidDateParts(year, month, day)) {
    return "";
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatSpreadsheetSerialDate(serialValue) {
  if (!Number.isFinite(serialValue) || serialValue < 1 || serialValue > 60000) {
    return "";
  }

  const wholeDays = Math.floor(serialValue);
  const utcMillis = (wholeDays - 25569) * 86400 * 1000;
  const date = new Date(utcMillis);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (!isValidDateParts(year, month, day)) {
    return "";
  }

  return formatDateParts(String(year), String(month), String(day));
}

function isValidDateParts(year, month, day) {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function showDataCheckMessage(message, className) {
  elements.dataCheckMessage.hidden = false;
  elements.dataCheckMessage.className = `data-check-message ${className}`;
  elements.dataCheckMessage.textContent = message;
}

function hideDataCheckMessage() {
  elements.dataCheckMessage.hidden = true;
  elements.dataCheckMessage.className = "data-check-message";
  elements.dataCheckMessage.textContent = "";
}

function renderStatusCards(rows) {
  elements.statusCardGrid.innerHTML = "";
  const knownStatuses = new Set(STATUS_ORDER);
  const extraStatuses = uniqueFromRows(rows, "status").filter((status) => !knownStatuses.has(status));
  const statuses = [...STATUS_ORDER, ...extraStatuses];

  statuses.forEach((status) => {
    const card = document.createElement("article");
    card.className = "status-count-card";

    const badge = document.createElement("span");
    badge.className = `status-badge ${statusClass(status)}`;
    badge.textContent = status;

    const count = document.createElement("strong");
    count.textContent = countStatus(rows, status);

    card.append(badge, count);
    elements.statusCardGrid.appendChild(card);
  });
}

function renderTodayFocus(rows) {
  elements.todayFocusList.innerHTML = "";
  const focusRows = rows
    .filter(isTodayFocusRow)
    .sort(sortTodayFocus)
    .slice(0, 5);

  if (focusRows.length === 0) {
    renderEmpty(elements.todayFocusList, "該当なし");
    return;
  }

  focusRows.forEach((row) => {
    const item = document.createElement("li");
    item.className = "focus-item";

    const main = document.createElement("div");
    main.className = "focus-main";

    const title = document.createElement("strong");
    title.textContent = `${row.code || "-"} ${row.name || "-"}`;

    const theme = document.createElement("span");
    theme.textContent = row.theme || "-";

    const metrics = document.createElement("div");
    metrics.className = "focus-metrics";
    metrics.append(
      metricChip("score", formatNumber(row.score)),
      metricChip("出来高倍率", formatNumber(row.volume_ratio)),
      metricChip("25日乖離", formatPercent(row.ma25_gap))
    );

    main.append(title, theme);
    item.append(main, metrics);
    elements.todayFocusList.appendChild(item);
  });
}

function renderDipCandidates(rows) {
  elements.dipCandidateList.innerHTML = "";
  const dipRows = rows
    .filter(isDipCandidateRow)
    .sort(sortDipCandidates)
    .slice(0, 5);

  if (dipRows.length === 0) {
    renderEmpty(elements.dipCandidateList, "該当なし");
    return;
  }

  dipRows.forEach((row) => {
    const item = document.createElement("li");
    item.className = "focus-item";

    const main = document.createElement("div");
    main.className = "focus-main";

    const title = document.createElement("strong");
    title.textContent = `${row.code || "-"} ${row.name || "-"}`;

    const theme = document.createElement("span");
    theme.textContent = row.theme || "-";

    const metrics = document.createElement("div");
    metrics.className = "focus-metrics";
    metrics.append(
      metricChip("score", formatNumber(row.score)),
      metricChip("出来高倍率", formatNumber(row.volume_ratio)),
      metricChip("25日乖離", formatPercent(row.ma25_gap)),
      metricChip("75日乖離", formatPercent(row.ma75_gap))
    );

    main.append(title, theme);
    item.append(main, metrics);
    elements.dipCandidateList.appendChild(item);
  });
}

function renderDeepDipWarnings(rows) {
  elements.deepDipWarningList.innerHTML = "";
  const warningRows = rows
    .filter(isDeepDipWarningRow)
    .sort(sortDeepDipWarnings)
    .slice(0, 5);

  if (warningRows.length === 0) {
    renderEmpty(elements.deepDipWarningList, "該当なし");
    return;
  }

  warningRows.forEach((row) => {
    const item = document.createElement("li");
    item.className = "focus-item";

    const main = document.createElement("div");
    main.className = "focus-main";

    const title = document.createElement("strong");
    title.textContent = `${row.code || "-"} ${row.name || "-"}`;

    const theme = document.createElement("span");
    theme.textContent = row.theme || "-";

    const metrics = document.createElement("div");
    metrics.className = "focus-metrics";
    metrics.append(
      metricChip("score", formatNumber(row.score)),
      metricChip("出来高倍率", formatNumber(row.volume_ratio)),
      metricChip("25日乖離", formatPercent(row.ma25_gap)),
      metricChip("75日乖離", formatPercent(row.ma75_gap))
    );

    main.append(title, theme);
    item.append(main, metrics);
    elements.deepDipWarningList.appendChild(item);
  });
}

function isTodayFocusRow(row) {
  const score = parseNumber(row.score);
  const volumeRatio = parseNumber(row.volume_ratio);
  const ma25Gap = parseNumber(row.ma25_gap);

  return (
    score !== null &&
    score >= 4 &&
    row.status === "監視強化" &&
    volumeRatio !== null &&
    volumeRatio >= 1.5 &&
    ma25Gap !== null &&
    ma25Gap >= 0 &&
    ma25Gap < 15
  );
}

function isDipCandidateRow(row) {
  const ma25Gap = parseNumber(row.ma25_gap);
  const ma75Gap = parseNumber(row.ma75_gap);
  const volumeRatio = parseNumber(row.volume_ratio);

  return (
    hasText(row.current_price) &&
    !isDeepDipWarningRow(row) &&
    ma25Gap !== null &&
    ma25Gap >= -10 &&
    ma25Gap < 0 &&
    ma75Gap !== null &&
    ma75Gap > -20 &&
    volumeRatio !== null &&
    volumeRatio >= 0.8
  );
}

function isDeepDipWarningRow(row) {
  const ma25Gap = parseNumber(row.ma25_gap);
  const ma75Gap = parseNumber(row.ma75_gap);

  return (
    hasText(row.current_price) &&
    ((ma25Gap !== null && ma25Gap <= -10) || (ma75Gap !== null && ma75Gap <= -20))
  );
}

function sortTodayFocus(a, b) {
  const scoreDiff = toNumber(b.score) - toNumber(a.score);
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const volumeDiff = toNumber(b.volume_ratio) - toNumber(a.volume_ratio);
  if (volumeDiff !== 0) {
    return volumeDiff;
  }

  const ma25Diff = toNumber(a.ma25_gap) - toNumber(b.ma25_gap);
  if (ma25Diff !== 0) {
    return ma25Diff;
  }

  return String(a.code).localeCompare(String(b.code), "ja", { numeric: true });
}

function sortDipCandidates(a, b) {
  const scoreDiff = toNumber(b.score) - toNumber(a.score);
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const volumeDiff = numberForSort(b.volume_ratio, Number.NEGATIVE_INFINITY) -
    numberForSort(a.volume_ratio, Number.NEGATIVE_INFINITY);
  if (volumeDiff !== 0) {
    return volumeDiff;
  }

  const ma25Diff = numberForSort(b.ma25_gap, Number.NEGATIVE_INFINITY) -
    numberForSort(a.ma25_gap, Number.NEGATIVE_INFINITY);
  if (ma25Diff !== 0) {
    return ma25Diff;
  }

  return String(a.code).localeCompare(String(b.code), "ja", { numeric: true });
}

function sortDeepDipWarnings(a, b) {
  const ma25Diff = numberForSort(a.ma25_gap, Number.POSITIVE_INFINITY) -
    numberForSort(b.ma25_gap, Number.POSITIVE_INFINITY);
  if (ma25Diff !== 0) {
    return ma25Diff;
  }

  const ma75Diff = numberForSort(a.ma75_gap, Number.POSITIVE_INFINITY) -
    numberForSort(b.ma75_gap, Number.POSITIVE_INFINITY);
  if (ma75Diff !== 0) {
    return ma75Diff;
  }

  return String(a.code).localeCompare(String(b.code), "ja", { numeric: true });
}

function metricChip(labelText, valueText) {
  const chip = document.createElement("span");
  chip.className = "focus-chip";

  const label = document.createElement("small");
  label.textContent = labelText;

  const value = document.createElement("b");
  value.textContent = valueText;

  chip.append(label, value);
  return chip;
}

function numberForSort(value, fallback) {
  const number = parseNumber(value);
  return number === null ? fallback : number;
}

function renderThemeAverages(rows) {
  const themeStats = new Map();

  rows.forEach((row) => {
    if (!row.theme || !hasNumber(row.score)) {
      return;
    }
    const current = themeStats.get(row.theme) || { total: 0, count: 0 };
    current.total += toNumber(row.score);
    current.count += 1;
    themeStats.set(row.theme, current);
  });

  const averages = [...themeStats.entries()]
    .map(([theme, stats]) => ({
      theme,
      average: stats.total / stats.count,
      count: stats.count,
    }))
    .sort((a, b) => b.average - a.average || a.theme.localeCompare(b.theme, "ja"));

  elements.themeAverageCount.textContent = `${averages.length}件`;
  elements.themeAverageList.innerHTML = "";

  if (averages.length === 0) {
    renderEmpty(elements.themeAverageList, "平均scoreを表示できるテーマがありません。");
    return;
  }

  const maxAverage = Math.max(...averages.map((item) => item.average), 1);
  averages.forEach((item) => {
    const row = document.createElement("div");
    row.className = "metric-row";

    const label = document.createElement("span");
    label.className = "metric-label";
    label.title = `${item.theme} (${item.count}銘柄)`;
    label.textContent = `${item.theme} (${item.count})`;

    const value = document.createElement("span");
    value.className = "metric-value";
    value.textContent = item.average.toFixed(1);

    const bar = document.createElement("div");
    bar.className = "metric-bar";
    const fill = document.createElement("span");
    fill.style.width = `${Math.max(4, (item.average / maxAverage) * 100)}%`;
    bar.appendChild(fill);

    row.append(label, value, bar);
    elements.themeAverageList.appendChild(row);
  });
}

function renderRankings(rows) {
  renderRanking(
    elements.topScoreList,
    rows,
    "score",
    (row) => formatNumber(row.score),
    "scoreを表示できる銘柄がありません。"
  );
  renderRanking(
    elements.topVolumeRatioList,
    rows,
    "volume_ratio",
    (row) => formatNumber(row.volume_ratio),
    "出来高倍率を表示できる銘柄がありません。"
  );
}

function renderRanking(list, rows, key, formatValue, emptyMessage) {
  list.innerHTML = "";
  const rankingRows = rows
    .filter((row) => hasNumber(row[key]))
    .sort((a, b) => toNumber(b[key]) - toNumber(a[key]))
    .slice(0, 5);

  if (rankingRows.length === 0) {
    renderEmpty(list, emptyMessage);
    return;
  }

  rankingRows.forEach((row) => {
    const item = document.createElement("li");
    item.className = "ranking-item";

    const name = document.createElement("div");
    name.className = "ranking-name";

    const title = document.createElement("strong");
    title.textContent = `${row.code || "-"} ${row.name || "-"}`;

    const meta = document.createElement("span");
    meta.textContent = [row.theme, row.status].filter(Boolean).join(" / ") || "-";

    const value = document.createElement("span");
    value.className = "ranking-value";
    value.textContent = formatValue(row);

    name.append(title, meta);
    item.append(name, value);
    list.appendChild(item);
  });
}

function renderEmpty(container, message) {
  const empty = document.createElement("p");
  empty.className = "panel-empty";
  empty.textContent = message;
  container.appendChild(empty);
}

function uniqueFromRows(rows, key) {
  return [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ja")
  );
}

function countStatus(rows, status) {
  return rows.filter((row) => row.status === status).length;
}

function renderTable(rows) {
  elements.tableBody.innerHTML = "";
  elements.resultCount.textContent = `${rows.length}件を表示`;
  elements.emptyState.hidden = rows.length !== 0;

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.append(
      td(row.code, "code-cell"),
      td(row.name, "name-cell"),
      td(row.theme),
      td(row.priority),
      td(formatNumber(row.current_price), "numeric"),
      td(formatPercent(row.change_pct), "numeric"),
      td(formatNumber(row.volume_ratio), "numeric"),
      td(formatPercent(row.ma25_gap), "numeric"),
      td(formatPercent(row.ma75_gap), "numeric"),
      td(formatNumber(row.score), "numeric"),
      statusTd(row.status),
      td(row.memo, "memo-cell"),
      stockLinksTd(row)
    );
    elements.tableBody.appendChild(tr);
  });
}

function td(value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value || "-";
  if (className) {
    cell.className = className;
  }
  return cell;
}

function statusTd(status) {
  const cell = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = `status-badge ${statusClass(status)}`;
  badge.textContent = status || "-";
  cell.appendChild(badge);
  return cell;
}

function stockLinksTd(row) {
  const cell = document.createElement("td");
  cell.className = "links-cell";

  const code = getValidStockCode(row.code);
  if (!code) {
    cell.textContent = "-";
    return cell;
  }

  const links = [
    {
      label: "Yahoo",
      title: "Yahoo!ファイナンスで確認",
      url: `https://finance.yahoo.co.jp/quote/${code}.T`,
    },
    {
      label: "株探",
      title: "株探で確認",
      url: `https://kabutan.jp/stock/chart?code=${code}`,
    },
    {
      label: "TV",
      title: "TradingViewで確認",
      url: `https://jp.tradingview.com/symbols/TSE-${code}/`,
    },
    {
      label: "TDnet",
      title: "TDnetで適時開示を確認",
      url: "https://www.release.tdnet.info/inbs/I_main_00.html",
    },
  ];

  const linkGroup = document.createElement("div");
  linkGroup.className = "external-links";

  links.forEach((link) => {
    const anchor = document.createElement("a");
    anchor.className = "external-link-button";
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.title = link.title;
    anchor.setAttribute("aria-label", `${row.code || code} ${row.name || ""} ${link.title}`.trim());
    anchor.textContent = link.label;
    linkGroup.appendChild(anchor);
  });

  cell.appendChild(linkGroup);
  return cell;
}

function getValidStockCode(value) {
  const code = String(value || "").trim();
  return /^\d{4}$/.test(code) ? code : "";
}

function statusClass(status) {
  const classes = {
    監視強化: "status-watch",
    押し目待ち: "status-dip",
    条件待ち: "status-wait",
    調整中: "status-cooling",
    過熱注意: "status-hot",
  };

  return classes[status] || "status-unknown";
}

function hasText(value) {
  return String(value || "").trim() !== "";
}

function hasNumber(value) {
  return parseNumber(value) !== null;
}

function toNumber(value) {
  return parseNumber(value) ?? 0;
}

function parseNumber(value) {
  if (String(value || "").trim() === "") {
    return null;
  }

  const normalized = String(value || "").replaceAll(",", "").replace("%", "");
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value) {
  if (String(value || "").trim() === "") {
    return "-";
  }

  const number = parseNumber(value);
  return number === null ? value : number.toLocaleString("ja-JP");
}

function formatPercent(value) {
  if (String(value || "").trim() === "") {
    return "-";
  }

  const number = parseNumber(value);
  return number === null ? value : `${number.toLocaleString("ja-JP")}%`;
}

function setError(message) {
  elements.errorState.hidden = !message;
  elements.errorState.textContent = message;
}
