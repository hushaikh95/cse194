/* Rent vs. Paycheck — county map + charts. Data built by scripts/build_data.py */
(async function () {
  const fmt$ = d3.format("$,.0f"), fmtW = d3.format("$.2f"), fmtN = d3.format(",.0f");
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const RAMP = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6"].map(css);

  const METRICS = {
    hours: { label: "Hours/week at min. wage", short: "Hours per week at minimum wage", key: "hours_min_wage",
             fmt: v => `${fmtN(v)} hrs`, thresholds: [70, 90, 110, 130, 150] },
    rent:  { label: "2BR rent", short: "Two-bedroom Fair Market Rent (monthly)", key: "fmr_2br",
             fmt: fmt$, thresholds: [1600, 2000, 2400, 2800, 3200] },
    wage:  { label: "Housing wage", short: "Hourly wage needed for a two-bedroom", key: "housing_wage",
             fmt: fmtW, thresholds: [30, 38, 46, 54, 62] },
  };

  const [data, geo] = await Promise.all([
    d3.json("data/counties.json"),
    d3.json("data/ca-counties.json"),
  ]);
  const byName = new Map(data.counties.map(c => [c.county, c]));
  const S = data.state, MW = data.min_wage;
  let metric = "hours", selected = "San Diego";
  try { selected = localStorage.getItem("rvw-county") || selected; } catch (e) {}
  if (!byName.has(selected)) selected = "San Diego";

  d3.select("#asof").text(`Data as of: ${data.data_as_of}`);

  // ---- Hero numbers (statewide) ----
  const heroes = [
    { label: "Wage needed for a 2BR, statewide", value: fmtW(S.housing_wage), sub: "per hour, full-time" },
    { label: "California minimum wage", value: fmtW(MW), sub: "per hour, 2026" },
    { label: "Hours/week at minimum wage", value: fmtN(S.hours_min_wage), sub: `about ${S.jobs_min_wage} full-time jobs` },
    { label: "Two-bedroom rent, statewide", value: fmt$(S.fmr_2br), sub: "HUD Fair Market Rent, monthly" },
  ];
  d3.select("#heroes").selectAll("div").data(heroes).join("div").attr("class", "card hero")
    .html(d => `<div class="label">${d.label}</div><div class="value">${d.value}</div><div class="sub">${d.sub}</div>`);

  // ---- Controls ----
  d3.select("#countySelect").selectAll("option")
    .data(data.counties.map(c => c.county).sort()).join("option")
    .attr("value", d => d).text(d => `${d} County`);
  d3.select("#countySelect").on("change", e => select(e.target.value));
  d3.select("#metricSeg").selectAll("button").data(Object.entries(METRICS)).join("button")
    .attr("type", "button").text(([, m]) => m.label)
    .on("click", (e, [k]) => { metric = k; render(); });

  const tip = d3.select("#tip");
  const showTip = (e, html) => {
    tip.html(html).style("opacity", 1);
    const w = tip.node().offsetWidth, h = tip.node().offsetHeight;
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > innerHeight - 8) y = e.clientY - h - 14;
    tip.style("left", x + "px").style("top", y + "px");
  };
  const hideTip = () => tip.style("opacity", 0);
  const tipHtml = c => `<b>${c.county} County</b>${METRICS[metric].short}: ${METRICS[metric].fmt(c[METRICS[metric].key])}` +
    (c.nonmetro_estimate ? "<br><i>Rural non-metro estimate</i>" : "");

  // ---- Map ----
  const W = 520, H = 600;
  const proj = d3.geoConicEqualArea().parallels([34, 40.5]).rotate([120, 0]).fitSize([W, H], geo);
  const path = d3.geoPath(proj);
  const mapSvg = d3.select("#map").append("svg").attr("viewBox", `0 0 ${W} ${H}`);
  const counties = mapSvg.selectAll("path").data(geo.features).join("path")
    .attr("class", "county").attr("d", path)
    .on("mousemove", (e, f) => showTip(e, tipHtml(byName.get(f.properties.name))))
    .on("mouseleave", hideTip)
    .on("click", (e, f) => select(f.properties.name));

  function color() {
    const m = METRICS[metric];
    return d3.scaleThreshold().domain(m.thresholds).range(RAMP);
  }

  function renderMap() {
    const m = METRICS[metric], c = color();
    counties.attr("fill", f => c(byName.get(f.properties.name)[m.key]))
      .classed("selected", f => f.properties.name === selected);
    counties.filter(".selected").raise();
    d3.select("#legendTitle").text(m.short);
    const t = m.thresholds, labels = [`< ${m.fmt(t[0])}`, ...t.slice(1).map((v, i) => `${m.fmt(t[i])}–${m.fmt(v)}`), `≥ ${m.fmt(t[t.length - 1])}`];
    d3.select("#legend").selectAll("div").data(RAMP).join("div").attr("class", "sw")
      .html((col, i) => `<i style="background:${col}"></i><span>${labels[i]}</span>`);
  }

  // ---- Detail panel ----
  function renderDetail() {
    const c = byName.get(selected);
    const ratio = c.income_needed / c.median_renter_income;
    d3.select("#detail").html(`
      <h2>${c.county} County</h2>
      <div class="area">HUD rental area: ${c.area.replace("California Non-metropolitan areas", "California non-metro areas (combined)")}</div>
      ${c.nonmetro_estimate ? `<div class="note">This is a rural county. Its figures use California's combined non-metro average, not its own county figure.</div>` : ""}
      <div class="big">${c.hours_min_wage} hours</div>
      <div class="big-sub">of minimum-wage work per week to afford a two-bedroom rental, or about <b>${c.jobs_min_wage} full-time jobs</b>.</div>
      <dl class="stats">
        <div><dt>Two-bedroom rent (monthly)</dt><dd>${fmt$(c.fmr_2br)}</dd></div>
        <div><dt>Housing wage (hourly)</dt><dd>${fmtW(c.housing_wage)}</dd></div>
        <div><dt>Income needed (yearly)</dt><dd>${fmt$(c.income_needed)}</dd></div>
        <div><dt>Median renter household income</dt><dd>${fmt$(c.median_renter_income)}</dd></div>
      </dl>
      <p class="chart-title">Hourly pay: what's needed vs. minimum wage</p>
      <div id="barChart"></div>
      <p style="font-size:13px;color:var(--text-muted);margin:10px 0 0">Income needed is ${ratio >= 1 ? `${d3.format(".0%")(ratio - 1)} more than` : `${d3.format(".0%")(1 - ratio)} less than`} the median renter household's income here.</p>
    `);
    const rows = [
      { label: `${c.county} housing wage`, v: c.housing_wage, col: css("--s5") },
      { label: "Statewide housing wage", v: S.housing_wage, col: css("--s3") },
      { label: "State minimum wage", v: MW, col: css("--ref") },
    ];
    const bw = 440, rowH = 34, left = 160, right = 56;
    const x = d3.scaleLinear().domain([0, Math.max(85, c.housing_wage)]).range([left, bw - right]);
    const svg = d3.select("#barChart").append("svg").attr("viewBox", `0 0 ${bw} ${rows.length * rowH}`).style("width", "100%");
    const g = svg.selectAll("g").data(rows).join("g").attr("transform", (d, i) => `translate(0,${i * rowH})`);
    g.append("text").attr("x", 0).attr("y", rowH / 2).attr("dy", "0.35em").attr("font-size", 12).attr("fill", css("--text-secondary")).text(d => d.label);
    g.append("path").attr("fill", d => d.col)
      .attr("d", d => roundedBar(x(0), 8, x(d.v) - x(0), rowH - 16));
    g.append("text").attr("x", d => x(d.v) + 6).attr("y", rowH / 2).attr("dy", "0.35em").attr("font-size", 12)
      .attr("font-weight", 600).attr("fill", css("--text-primary")).text(d => fmtW(d.v));
  }

  // horizontal bar anchored at left, 4px rounded data end
  function roundedBar(x0, y, w, h) {
    const r = Math.min(4, w, h / 2);
    return `M${x0},${y}H${x0 + w - r}Q${x0 + w},${y} ${x0 + w},${y + r}V${y + h - r}Q${x0 + w},${y + h} ${x0 + w - r},${y + h}H${x0}Z`;
  }

  // ---- Ranked bars ----
  function renderRank() {
    const m = METRICS[metric], c = color();
    const rows = [...data.counties].sort((a, b) => d3.descending(a[m.key], b[m.key]) || d3.ascending(a.county, b.county));
    d3.select("#rankTitle").text(`All 58 counties, ranked by ${m.label.replace("2BR","two-bedroom").replace(/^H/,"h")}`);
    d3.select("#rankSub").text(`The dashed line marks the statewide figure (${m.fmt(S[m.key])}). Counties in the same rental area have the same value.`);
    const w = 1060, rowH = 16, top = 22, left = 120, right = 70;
    const x = d3.scaleLinear().domain([0, d3.max(rows, r => r[m.key])]).nice().range([left, w - right]);
    const root = d3.select("#rank").html("").append("svg").attr("viewBox", `0 0 ${w} ${top + rows.length * rowH + 4}`);
    root.append("g").attr("class", "axis").attr("transform", `translate(0,${top - 4})`)
      .call(d3.axisTop(x).ticks(6).tickFormat(m.fmt).tickSize(-(rows.length * rowH + 4)))
      .call(g => g.select(".domain").remove());
    const g = root.selectAll("g.rank-row").data(rows).join("g")
      .attr("class", d => "rank-row" + (d.county === selected ? " selected" : ""))
      .attr("transform", (d, i) => `translate(0,${top + i * rowH})`)
      .style("cursor", "pointer")
      .on("mousemove", (e, d) => showTip(e, tipHtml(d))).on("mouseleave", hideTip)
      .on("click", (e, d) => select(d.county));
    g.append("rect").attr("x", 0).attr("width", w).attr("height", rowH).attr("fill", "transparent");
    g.append("text").attr("x", left - 8).attr("y", rowH / 2).attr("dy", "0.35em").attr("text-anchor", "end")
      .text(d => d.county + (d.nonmetro_estimate ? "*" : ""));
    g.append("path").attr("fill", d => d.county === selected ? css("--sel") : c(d[m.key]))
      .attr("d", d => roundedBar(x(0), 3, x(d[m.key]) - x(0), rowH - 5));
    g.append("text").attr("x", d => x(d[m.key]) + 5).attr("y", rowH / 2).attr("dy", "0.35em").text(d => m.fmt(d[m.key]));
    root.append("line").attr("x1", x(S[m.key])).attr("x2", x(S[m.key])).attr("y1", top - 4).attr("y2", top + rows.length * rowH)
      .attr("stroke", css("--text-primary")).attr("stroke-dasharray", "4 3").attr("stroke-width", 1.5);
    root.append("text").attr("x", x(S[m.key]) + 4).attr("y", top + rows.length * rowH - 4).attr("font-size", 11).attr("fill", css("--text-primary")).text("Statewide");
    d3.select("#rank").append("p").style("font-size", "12px").style("color", "var(--text-muted)").style("margin", "8px 0 0")
      .text("* Rural county that uses California's combined non-metro estimate.");
  }

  // ---- Table ----
  const COLS = [
    { k: "county", t: "County", f: (v, d) => v + (d.nonmetro_estimate ? "*" : "") },
    { k: "area", t: "HUD rental area", f: v => v.replace("California Non-metropolitan areas", "CA non-metro (combined)") },
    { k: "fmr_2br", t: "2BR rent", f: fmt$ },
    { k: "housing_wage", t: "Housing wage", f: fmtW },
    { k: "hours_min_wage", t: "Hrs/wk at min. wage", f: fmtN },
    { k: "income_needed", t: "Income needed", f: fmt$ },
    { k: "median_renter_income", t: "Median renter HH income", f: fmt$ },
  ];
  let sortK = "hours_min_wage", sortDesc = true;
  function renderTable() {
    const rows = [...data.counties].sort((a, b) => (sortDesc ? d3.descending : d3.ascending)(a[sortK], b[sortK]));
    const t = d3.select("#table").html("");
    t.append("thead").append("tr").selectAll("th").data(COLS).join("th")
      .attr("scope", "col").attr("aria-sort", d => d.k === sortK ? (sortDesc ? "descending" : "ascending") : null)
      .text(d => d.t + (d.k === sortK ? (sortDesc ? " ▾" : " ▴") : ""))
      .on("click", (e, d) => { sortDesc = d.k === sortK ? !sortDesc : typeof rows[0][d.k] !== "string"; sortK = d.k; renderTable(); });
    t.append("tbody").selectAll("tr").data(rows).join("tr")
      .style("font-weight", d => d.county === selected ? 700 : null)
      .selectAll("td").data(d => COLS.map(c => c.f(d[c.k], d))).join("td").text(d => d);
  }

  function select(name) {
    selected = name;
    try { localStorage.setItem("rvw-county", name); } catch (e) {}
    render();
  }
  function render() {
    d3.select("#countySelect").property("value", selected);
    d3.selectAll("#metricSeg button").attr("aria-pressed", ([k]) => k === metric);
    renderMap(); renderDetail(); renderRank(); renderTable();
  }
  render();
})().catch(err => {
  document.getElementById("asof").textContent = "Couldn't load data. If you opened index.html directly, run a local server: python3 -m http.server";
  console.error(err);
});
