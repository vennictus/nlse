const form = document.querySelector("#search-form");
const queryInput = document.querySelector("#query");
const limitInput = document.querySelector("#limit");
const statusEl = document.querySelector("#status");
const statusDot = document.querySelector("#status-dot");
const intentEl = document.querySelector("#intent");
const planEl = document.querySelector("#plan");
const traceEl = document.querySelector("#trace");
const resultsEl = document.querySelector("#results");
const queryIdEl = document.querySelector("#query-id");
const resultCountEl = document.querySelector("#result-count");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runSearch();
});

for (const button of document.querySelectorAll("[data-query]")) {
  button.addEventListener("click", async () => {
    queryInput.value = button.dataset.query;
    await runSearch();
  });
}

await runSearch();

async function runSearch() {
  const query = queryInput.value.trim();
  const limit = Number(limitInput.value || 5);
  if (!query) return;

  setStatus("Searching", "busy");
  resultsEl.innerHTML = "";
  traceEl.innerHTML = "";
  planEl.innerHTML = "";
  intentEl.innerHTML = "";
  queryIdEl.textContent = "pending";
  resultCountEl.textContent = "Running retrieval pipeline";

  try {
    const started = performance.now();
    const response = await fetch("/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit, trace: true })
    });
    const elapsed = Math.round(performance.now() - started);
    if (!response.ok) throw new Error(await response.text());

    const data = await response.json();
    setStatus(`${data.queryId} · ${elapsed} ms`, "ok");
    queryIdEl.textContent = data.queryId;
    resultCountEl.textContent = `${data.results.length} result${data.results.length === 1 ? "" : "s"} returned`;
    intentEl.innerHTML = renderInterpretation(data.intent, data.interpretation);
    planEl.innerHTML = renderPlan(data.logicalPlan);
    traceEl.innerHTML = renderTrace(data.executionTrace || []);
    resultsEl.innerHTML = data.results.length ? data.results.map(renderResult).join("") : `<div class="empty">No results matched the hard filters.</div>`;
  } catch (error) {
    setStatus("Error", "error");
    resultCountEl.textContent = "Request failed";
    resultsEl.innerHTML = `<div class="empty">${escapeHtml(error.message || error)}</div>`;
  }
}

function renderInterpretation(intent, interpretation) {
  const groups = [
    ["Hard filters", interpretation.hardFilters],
    ["Exclusions", interpretation.exclusions],
    ["Preferences", interpretation.preferences],
    ["Rewrites", interpretation.rewrites],
    ["Unsupported", interpretation.unsupported]
  ];
  return `
    <div class="intent-summary">
      <span>confidence ${(intent.confidence ?? 0).toFixed(2)}</span>
      <span>${escapeHtml(intent.sort?.value || "relevance")}</span>
      <span>${escapeHtml(intent.notes?.at(-1) || "deterministic")}</span>
    </div>
    ${groups.map(([title, values]) => renderIntentGroup(title, values)).join("")}
  `;
}

function renderIntentGroup(title, values = []) {
  const content = values.length
    ? values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")
    : `<li class="muted">None</li>`;
  return `
    <div class="intent-group">
      <h3>${escapeHtml(title)}</h3>
      <ul>${content}</ul>
    </div>
  `;
}

function renderPlan(plan) {
  return plan.operators.map((operator, index) => {
    const estimate = plan.estimates[index]?.estimatedCandidates ?? "?";
    return `
      <div class="data-row">
        <span class="index">${index}</span>
        <code>${escapeHtml(formatOperator(operator))}</code>
        <strong>${formatNumber(estimate)}</strong>
      </div>
    `;
  }).join("");
}

function renderTrace(trace) {
  if (!trace.length) return `<div class="data-row empty-row">No trace</div>`;
  return trace.map((step) => {
    const ratio = step.before > 0 ? Math.max(2, Math.round((step.after / step.before) * 100)) : 0;
    return `
      <div class="trace-row">
        <div>
          <code>${escapeHtml(step.operator)}</code>
          <span>${formatNumber(step.before)} -> ${formatNumber(step.after)}</span>
        </div>
        <div class="trace-bar"><i style="width:${Math.min(100, ratio)}%"></i></div>
      </div>
    `;
  }).join("");
}

function renderResult(result) {
  const car = result.car;
  const valid = result.validation?.hardFiltersSatisfied;
  return `
    <article class="result">
      <div class="result-top">
        <div>
          <div class="badges">
            <span class="${valid ? "valid" : "invalid"}">${valid ? "hard filters satisfied" : "violations detected"}</span>
            <span>${escapeHtml(result.queryId)}</span>
          </div>
          <h3>${escapeHtml([car.year, car.manufacturer, car.model].filter(Boolean).join(" "))}</h3>
          <p>${escapeHtml([car.bodyType, car.brandCountry, car.fuelType, car.transmission, car.exteriorColor].filter(Boolean).join(" · "))}</p>
        </div>
        <div class="score">
          <strong>${result.score.toFixed(1)}</strong>
          <span>score</span>
        </div>
      </div>

      <div class="metrics">
        <span>$${formatNumber(car.price)}</span>
        <span>${formatNumber(car.mileage)} mi</span>
        <span>${car.mpgHighway ?? "?"} mpg</span>
        <span>${car.driverRating ?? "?"} driver</span>
        <span>${car.sellerRating ?? "?"} seller</span>
      </div>

      <div class="chips">${car.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>

      <div class="result-grid">
        <section>
          <h4>Why this matched</h4>
          <ul>${result.explanationBullets.slice(0, 6).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </section>
        <section>
          <h4>Score contribution</h4>
          <div class="breakdown">${(result.scoreBreakdown || []).map(renderContribution).join("")}</div>
        </section>
      </div>
    </article>
  `;
}

function renderContribution(item) {
  const value = Number(item.value || 0);
  const width = Math.min(100, Math.max(6, Math.abs(value) * 2));
  return `
    <div class="contribution">
      <span>${escapeHtml(item.label)}</span>
      <strong>${value > 0 ? "+" : ""}${value.toFixed(1)}</strong>
      <i class="${value < 0 ? "negative" : ""}" style="width:${width}%"></i>
    </div>
  `;
}

function formatOperator(operator) {
  const args = operator.args || {};
  if (args.values) return `${operator.type.replace("FilterOperator", "").replace("Operator", "")}(${args.values.join(", ")})`;
  if (operator.type === "BooleanFilterOperator") return `${args.field}(${args.value})`;
  if (operator.type === "RankOperator") return `rank(${args.sort})`;
  if (operator.type === "TakeOperator") return `take(${args.limit})`;
  return `${operator.type.replace("Operator", "")}(${args.min ?? "*"}..${args.max ?? "*"})`;
}

function formatNumber(value) {
  return value === null || value === undefined || value === "?" ? "?" : Number(value).toLocaleString();
}

function setStatus(value, state = "idle") {
  statusEl.textContent = value;
  statusDot.className = state;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
