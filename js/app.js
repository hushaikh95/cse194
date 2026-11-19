/* Rent vs. Paycheck — data built by scripts/build_data.py into data/site.json */
(async function () {
  const fmt$ = d3.format("$,.0f"), fmtW = d3.format("$.2f"), fmtN = d3.format(",.0f"), fmtP = d3.format(".0%");
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const RAMP = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6"].map(css);
  const C1 = css("--series-1"), C2 = css("--series-2");
  const EVT = {
    wage:    { label: "Minimum wage law", letter: "W", color: css("--series-1") },
    housing: { label: "Housing law",      letter: "H", color: css("--series-3") },
    covid:   { label: "COVID-19 renter rules", letter: "C", color: css("--series-7") },
    ballot:  { label: "Ballot measure",   letter: "B", color: css("--text-secondary") },
  };

  const [data, geo] = await Promise.all([d3.json("data/site.json"), d3.json("data/ca-counties.json")]);
  const Y = data.years, YMAX = Y[Y.length - 1];
  const byName = new Map(data.counties.map(c => [c.county, c]));
  const S = data.state, MW = data.min_wage, REAL = data.to_2025_dollars;

  // ---- state ----
  const st = { metric: "hours", county: "San Diego", year: YMAX, dollars: "nominal" };
  try {
    const saved = JSON.parse(localStorage.getItem("rvw") || "{}");
    if (byName.has(saved.county)) st.county = saved.county;
    if (saved.dollars === "real") st.dollars = "real";
  } catch (e) {}
  const save = () => { try { localStorage.setItem("rvw", JSON.stringify({ county: st.county, dollars: st.dollars })); } catch (e) {} };
  // dollar adjuster: value from year y -> displayed dollars
  const adj = (v, y) => v == null ? null : (st.dollars === "real" ? v * REAL[y] : v);
  const dollarNote = () => st.dollars === "real" ? " (2025 dollars)" : "";

  const METRICS = {
    hours: { label: "Hours/week at min. wage", short: "Hours per week at minimum wage", get: (c, y) => c.hours_min_wage[y],
             fmt: v => `${fmtN(v)} hrs`, thresholds: [50, 70, 90, 110, 130] },
    rent:  { label: "2BR rent", short: "Two-bedroom Fair Market Rent (monthly)", get: (c, y) => adj(c.rent[y], y),
             fmt: fmt$, thresholds: [1200, 1600, 2000, 2400, 2800] },
    wage:  { label: "Housing wage", short: "Hourly wage needed for a two-bedroom", get: (c, y) => adj(c.housing_wage[y], y),
             fmt: fmtW, thresholds: [24, 31, 38, 46, 54] },
  };
  const stateVal = (k, y) => k === "hours" ? S.hours_min_wage[y] : adj(k === "rent" ? S.rent[y] : S.housing_wage[y], y);

  d3.select("#asof").html(`Data as of: ${data.data_as_of.rent} · ${data.data_as_of.jobs} · ${data.data_as_of.permits} · ${data.data_as_of.acs}`);

  // ---- controls ----
  d3.select("#countySelect").selectAll("option").data(data.counties.map(c => c.county)).join("option")
    .attr("value", d => d).text(d => `${d} County`);
  d3.select("#countySelect").on("change", e => { st.county = e.target.value; save(); render(); });
  d3.select("#yearRange").attr("min", Y[0]).attr("max", YMAX).on("input", e => { st.year = +e.target.value; render(); });
  d3.select("#metricSeg").selectAll("button").data(Object.entries(METRICS)).join("button")
    .attr("type", "button").text(([, m]) => m.label).on("click", (e, [k]) => { st.metric = k; render(); });
  d3.selectAll("#dollarSeg button").on("click", function () { st.dollars = this.dataset.v; save(); render(); });

  // ---- tooltip ----
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
  const mapTip = c => `<b>${c.county} County</b>${METRICS[st.metric].short}, ${st.year}: ${METRICS[st.metric].fmt(METRICS[st.metric].get(c, st.year))}`;

  function roundedBar(x0, y, w, h) {   // horizontal bar, 4px rounded data end
    w = Math.max(0, w); const r = Math.min(4, w, h / 2);
    return `M${x0},${y}H${x0 + w - r}Q${x0 + w},${y} ${x0 + w},${y + r}V${y + h - r}Q${x0 + w},${y + h} ${x0 + w - r},${y + h}H${x0}Z`;
  }
  function roundedCol(x, y0, w, h) {   // vertical bar anchored at baseline y0
    h = Math.max(0, h); const r = Math.min(3, w / 2, h);
    return `M${x},${y0}V${y0 - h + r}Q${x},${y0 - h} ${x + r},${y0 - h}H${x + w - r}Q${x + w},${y0 - h} ${x + w},${y0 - h + r}V${y0}Z`;
  }

  // ---- map ----
  const W = 520, H = 600;
  const proj = d3.geoConicEqualArea().parallels([34, 40.5]).rotate([120, 0]).fitSize([W, H], geo);
  const counties = d3.select("#map").append("svg").attr("viewBox", `0 0 ${W} ${H}`)
    .selectAll("path").data(geo.features).join("path").attr("class", "county").attr("d", d3.geoPath(proj))
    .on("mousemove", (e, f) => showTip(e, mapTip(byName.get(f.properties.name))))
    .on("mouseleave", hideTip)
    .on("click", (e, f) => { st.county = f.properties.name; save(); render(); })
    .attr("tabindex", 0).attr("role", "button")
    .on("keydown", (e, f) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); st.county = f.properties.name; save(); render(); } });
  d3.select("#map svg").attr("role", "group").attr("aria-label", "Map of California counties");
  const colorScale = () => d3.scaleThreshold().domain(METRICS[st.metric].thresholds).range(RAMP);

  function renderMap() {
    const m = METRICS[st.metric], c = colorScale();
    counties.attr("fill", f => c(m.get(byName.get(f.properties.name), st.year)))
      .classed("selected", f => f.properties.name === st.county)
      .attr("aria-pressed", f => f.properties.name === st.county)
      .attr("aria-label", f => { const cc = byName.get(f.properties.name); return `${cc.county} County: ${m.fmt(m.get(cc, st.year))}`; });
    const selF = geo.features.find(f => f.properties.name === st.county);
    d3.select("#map svg").selectAll("path.sel-outline").data([selF]).join("path").attr("class", "sel-outline")
      .attr("d", d3.geoPath(proj)).attr("fill", "none").attr("stroke", css("--sel")).attr("stroke-width", 2.5)
      .attr("pointer-events", "none").attr("aria-hidden", "true");
    d3.select("#legendTitle").text(`${m.short}, ${st.year}${st.metric === "hours" ? "" : dollarNote()}`);
    const t = m.thresholds;
    const labels = [`< ${m.fmt(t[0])}`, ...t.slice(1).map((v, i) => `${m.fmt(t[i])}–${m.fmt(v)}`), `≥ ${m.fmt(t[t.length - 1])}`];
    d3.select("#legend").selectAll("div.sw").data(RAMP).join("div").attr("class", "sw")
      .html((col, i) => `<i style="background:${col}"></i><span>${labels[i]}</span>`);
  }

  // ---- heroes ----
  function renderHeroes() {
    const y = st.year;
    const items = [
      { label: `Wage needed for a 2BR, statewide`, value: fmtW(adj(S.housing_wage[y], y)), sub: `per hour, full-time, ${y}${dollarNote()}` },
      { label: `California minimum wage`, value: fmtW(adj(MW[y], y)), sub: `per hour, ${y}${dollarNote()}` },
      { label: `Hours/week at minimum wage`, value: fmtN(S.hours_min_wage[y]), sub: `statewide, ${y} (${fmtN(S.hours_min_wage[Y[0]])} in ${Y[0]})` },
      { label: `Two-bedroom rent, statewide`, value: fmt$(adj(S.rent[y], y)), sub: `HUD Fair Market Rent, ${y}${dollarNote()}` },
    ];
    d3.select("#heroes").selectAll("div.hero").data(items).join("div").attr("class", "card hero")
      .html(d => `<div class="label">${d.label}</div><div class="value">${d.value}</div><div class="sub">${d.sub}</div>`);
  }

  // ---- detail ----
  function renderDetail() {
    const c = byName.get(st.county), y = st.year, y0 = Y[0];
    const hrs = c.hours_min_wage[y], jobs = d3.format(".1f")(hrs / 40);
    const rentChange = c.rent[y] / c.rent[y0] - 1, mwChange = MW[y] / MW[y0] - 1;
    d3.select("#detail").html(`
      <h2>${c.county} County</h2>
      <div class="area">HUD rental area: ${c.hud_area} · ${y}</div>
      <div class="big">${hrs} hours</div>
      <div class="big-sub">of minimum-wage work per week to afford a two-bedroom rental, or about <b>${jobs} full-time jobs</b>. In ${y0} it was ${c.hours_min_wage[y0]} hours.</div>
      <dl class="stats">
        <div><dt>Two-bedroom rent (monthly)</dt><dd>${fmt$(adj(c.rent[y], y))}</dd></div>
        <div><dt>Housing wage (hourly)</dt><dd>${fmtW(adj(c.housing_wage[y], y))}</dd></div>
        <div><dt>Income needed (yearly)</dt><dd>${fmt$(adj(c.rent[y] * 12 / 0.3, y))}</dd></div>
        <div><dt>Change since ${y0}</dt><dd>${rentChange >= 0 ? "+" : ""}${fmtP(rentChange)} <small>rent</small> · +${fmtP(mwChange)} <small>min. wage</small></dd></div>
      </dl>
      <p class="chart-title">Hourly pay: what's needed vs. minimum wage, ${y}${dollarNote()}</p>
      <div id="barChart"></div>`);
    const rows = [
      { label: `${c.county} housing wage`, v: adj(c.housing_wage[y], y), col: css("--s5") },
      { label: "Statewide housing wage", v: adj(S.housing_wage[y], y), col: css("--s3") },
      { label: "State minimum wage", v: adj(MW[y], y), col: css("--ref") },
    ];
    const bw = 440, rowH = 34, left = 160, right = 56;
    const x = d3.scaleLinear().domain([0, Math.max(...rows.map(r => r.v), 50)]).range([left, bw - right]);
    const g = d3.select("#barChart").append("svg").attr("viewBox", `0 0 ${bw} ${rows.length * rowH}`).style("width", "100%")
      .attr("role", "img").attr("aria-label", rows.map(r => `${r.label} ${fmtW(r.v)}`).join(", "))
      .selectAll("g").data(rows).join("g").attr("transform", (d, i) => `translate(0,${i * rowH})`);
    g.append("text").attr("y", rowH / 2).attr("dy", "0.35em").attr("font-size", 12).attr("fill", css("--text-secondary")).text(d => d.label);
    g.append("path").attr("fill", d => d.col).attr("d", d => roundedBar(x(0), 8, x(d.v) - x(0), rowH - 16));
    g.append("text").attr("x", d => x(d.v) + 6).attr("y", rowH / 2).attr("dy", "0.35em").attr("font-size", 12)
      .attr("font-weight", 600).attr("fill", css("--text-primary")).text(d => fmtW(d.v));
  }

  // ---- history line chart + policy strip ----
  const HW = 1060, HM = { t: 14, r: 120, b: 26, l: 48 };
  function renderHistory() {
    const c = byName.get(st.county);
    d3.select("#histTitle").text(`${c.county} County over time, ${Y[0]}–${YMAX}`);
    const series = [
      { key: "hw", name: `Wage needed for a 2BR (${c.county})`, color: C1, dash: null, vals: Y.map(y => ({ y, v: adj(c.housing_wage[y], y) })) },
      { key: "st", name: "Wage needed, statewide", color: css("--ref"), dash: "5 4", vals: Y.map(y => ({ y, v: adj(S.housing_wage[y], y) })) },
      { key: "mw", name: "State minimum wage", color: C2, dash: null, vals: Y.map(y => ({ y, v: adj(MW[y], y) })) },
    ];
    d3.select("#histLegend").html(series.map(s => `<span><i class="${s.dash ? "dash" : ""}" style="background:${s.color};color:${s.color}"></i>${s.name}</span>`).join(""));
    const Hh = 300;
    const x = d3.scaleLinear().domain([Y[0], YMAX]).range([HM.l, HW - HM.r]);
    const yS = d3.scaleLinear().domain([0, d3.max(series, s => d3.max(s.vals, d => d.v)) * 1.08]).nice().range([Hh - HM.b, HM.t]);
    const svg = d3.select("#histChart").html("").append("svg").attr("viewBox", `0 0 ${HW} ${Hh}`).style("width", "100%").style("display", "block")
      .attr("role", "img").attr("aria-label", `Line chart, ${Y[0]} to ${YMAX}. ` + series.map(s => `${s.name}: ${fmtW(s.vals[0].v)} in ${Y[0]}, ${fmtW(s.vals[s.vals.length - 1].v)} in ${YMAX}`).join(". ") + `. Hours per week at minimum wage went from ${c.hours_min_wage[Y[0]]} to ${c.hours_min_wage[YMAX]}.`);
    svg.append("g").attr("class", "axis").attr("transform", `translate(${HM.l},0)`)
      .call(d3.axisLeft(yS).ticks(5).tickFormat(d3.format("$,.0f")).tickSize(-(HW - HM.l - HM.r))).call(g => g.select(".domain").remove());
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${Hh - HM.b})`)
      .call(d3.axisBottom(x).ticks(10).tickFormat(d3.format("d")).tickSize(0).tickPadding(8)).call(g => g.select(".domain").remove());
    svg.append("rect").attr("x", x(st.year) - 1).attr("width", 2).attr("y", HM.t).attr("height", Hh - HM.t - HM.b).attr("fill", css("--grid"));
    const line = d3.line().x(d => x(d.y)).y(d => yS(d.v));
    svg.selectAll("path.s").data(series).join("path").attr("class", "s").attr("fill", "none")
      .attr("stroke", d => d.color).attr("stroke-width", 2).attr("stroke-dasharray", d => d.dash).attr("d", d => line(d.vals));
    // direct labels at the right end (<= 4 series)
    const ends = series.map(s => ({ s, yy: yS(s.vals[s.vals.length - 1].v) })).sort((a, b) => a.yy - b.yy);
    for (let i = 1; i < ends.length; i++) if (ends[i].yy - ends[i - 1].yy < 14) ends[i].yy = ends[i - 1].yy + 14;
    svg.selectAll("text.end").data(ends).join("text").attr("class", "end").attr("x", HW - HM.r + 8).attr("y", d => d.yy).attr("dy", "0.35em")
      .attr("font-size", 12).attr("fill", css("--text-primary")).text(d => fmtW(d.s.vals[d.s.vals.length - 1].v) + " " + (d.s.key === "mw" ? "min." : d.s.key === "st" ? "state" : "needed"));
    // crosshair + tooltip
    const cross = svg.append("line").attr("stroke", css("--text-muted")).attr("y1", HM.t).attr("y2", Hh - HM.b).style("opacity", 0);
    const dots = svg.selectAll("circle.h").data(series).join("circle").attr("class", "h").attr("r", 4).attr("fill", d => d.color)
      .attr("stroke", css("--surface-1")).attr("stroke-width", 2).style("opacity", 0);
    svg.append("rect").attr("x", HM.l).attr("y", HM.t).attr("width", HW - HM.l - HM.r).attr("height", Hh - HM.t - HM.b).attr("fill", "transparent")
      .on("mousemove", function (e) {
        const [mx] = d3.pointer(e, this); const yr = Math.round(x.invert(mx)); if (yr < Y[0] || yr > YMAX) return;
        cross.attr("x1", x(yr)).attr("x2", x(yr)).style("opacity", 1);
        dots.attr("cx", x(yr)).attr("cy", d => yS(d.vals[yr - Y[0]].v)).style("opacity", 1);
        showTip(e, `<b>${yr}</b>` + series.map(s => `${s.name}: ${fmtW(s.vals[yr - Y[0]].v)}`).join("<br>") +
          `<br>Hours/week at min. wage: ${c.hours_min_wage[yr]}`);
      })
      .on("mouseleave", () => { cross.style("opacity", 0); dots.style("opacity", 0); hideTip(); })
      .on("click", function (e) { const [mx] = d3.pointer(e, this); st.year = Math.max(Y[0], Math.min(YMAX, Math.round(x.invert(mx)))); render(); });

    // policy strip on the same x scale
    d3.select("#eventLegend").html(Object.values(EVT).map(t => `<span><b style="background:${t.color}">${t.letter}</b>${t.label}</span>`).join(""));
    const lanes = Object.keys(EVT), laneH = 22, SH = lanes.length * laneH + 8;
    const sv = d3.select("#eventStrip").html("").append("svg").attr("viewBox", `0 0 ${HW} ${SH}`).style("width", "100%").style("display", "block")
      .attr("role", "img").attr("aria-label", "Policy timeline: " + data.events.map(e => `${e.date.slice(0, 4)}, ${e.title}`).join("; "));
    sv.selectAll("text.lane").data(lanes).join("text").attr("class", "lane").attr("x", HM.l - 6).attr("y", (d, i) => i * laneH + laneH / 2 + 4)
      .attr("dy", "0.35em").attr("text-anchor", "end").attr("font-size", 11).attr("fill", css("--text-muted")).text(d => EVT[d].letter);
    sv.selectAll("line.lane").data(lanes).join("line").attr("class", "lane").attr("x1", HM.l).attr("x2", HW - HM.r)
      .attr("y1", (d, i) => i * laneH + laneH / 2 + 4).attr("y2", (d, i) => i * laneH + laneH / 2 + 4).attr("stroke", css("--grid"));
    const dec = d => { const dt = new Date(d + "T00:00:00"); return dt.getFullYear() + (dt.getMonth() + dt.getDate() / 31) / 12; };
    const ev = sv.selectAll("g.ev").data(data.events.filter(e => dec(e.date) >= Y[0])).join("g").attr("class", "ev")
      .attr("transform", d => `translate(${x(Math.min(dec(d.date), YMAX))},${lanes.indexOf(d.type) * laneH + laneH / 2 + 4})`).style("cursor", "default")
      .on("mousemove", (e, d) => showTip(e, `<b>${d.title}</b>${new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}<br>${d.detail}`))
      .on("mouseleave", hideTip);
    ev.append("circle").attr("r", 12).attr("fill", "transparent");
    ev.append("circle").attr("r", 7).attr("fill", d => EVT[d.type].color).attr("stroke", css("--surface-1")).attr("stroke-width", 2);
    ev.append("text").attr("text-anchor", "middle").attr("dy", "0.35em").attr("font-size", 8).attr("font-weight", 700).attr("fill", "#fff").text(d => EVT[d.type].letter);
  }

  // ---- jobs ----
  function renderJobs() {
    const c = byName.get(st.county), occ = data.occupations;
    const latest = 2025, first = data.job_years[0];
    const hw = adj(c.housing_wage[latest], latest);
    d3.select("#jobsTitle").text(`Pay for common jobs: ${c.county} County`);
    d3.select("#jobsSub").text(`Median hourly pay from the Bureau of Labor Statistics for the ${c.oews_area} area, which includes ${c.county} County. A job "covers" rent if its median pay is at or above the housing wage.`);
    d3.select("#jobsChartTitle").text(`Median hourly pay, May ${latest}, vs. the ${fmtW(hw)} housing wage for FY${latest} rent${dollarNote()}`);
    const rows = Object.entries(occ).map(([k, label]) => ({ k, label, v: adj(c.jobs[k][latest], latest) })).filter(r => r.v != null).sort((a, b) => b.v - a.v);
    const bw = 520, rowH = 30, left = 175, right = 120, top = 18;
    const x = d3.scaleLinear().domain([0, Math.max(d3.max(rows, r => r.v), hw) * 1.05]).range([left, bw - right]);
    const svg = d3.select("#jobsChart").html("").append("svg").attr("viewBox", `0 0 ${bw} ${top + rows.length * rowH + 6}`).style("width", "100%")
      .attr("role", "img").attr("aria-label", `Bar chart. Housing wage ${fmtW(hw)}. ` + rows.map(r => `${r.label} ${fmtW(r.v)}${r.v >= hw ? ", covers rent" : ""}`).join("; "));
    const g = svg.selectAll("g.r").data(rows).join("g").attr("class", "r").attr("transform", (d, i) => `translate(0,${top + i * rowH})`)
      .on("mousemove", (e, d) => showTip(e, `<b>${d.label}</b>Median pay: ${fmtW(d.v)}/hr<br>Hours/week to afford a 2BR at this pay: ${fmtN(hw * 40 / d.v)}`)).on("mouseleave", hideTip);
    g.append("rect").attr("width", bw).attr("height", rowH).attr("fill", "transparent");
    g.append("text").attr("y", rowH / 2).attr("dy", "0.35em").attr("font-size", 12).attr("fill", css("--text-secondary")).text(d => d.label);
    g.append("path").attr("fill", d => d.v >= hw ? css("--s5") : css("--s3")).attr("d", d => roundedBar(x(0), 7, x(d.v) - x(0), rowH - 14));
    g.append("text").attr("x", d => x(d.v) + 6).attr("y", rowH / 2).attr("dy", "0.35em").attr("font-size", 12).attr("fill", css("--text-primary"))
      .attr("stroke", css("--surface-1")).attr("stroke-width", 4).attr("paint-order", "stroke").attr("stroke-linejoin", "round")
      .text(d => `${fmtW(d.v)} · ${d.v >= hw ? "covers rent" : fmtN(hw * 40 / d.v) + " hrs/wk"}`);
    svg.append("line").attr("x1", x(hw)).attr("x2", x(hw)).attr("y1", top - 6).attr("y2", top + rows.length * rowH)
      .attr("stroke", css("--text-primary")).attr("stroke-dasharray", "4 3").attr("stroke-width", 1.5);
    svg.append("text").attr("x", x(hw)).attr("y", 10).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", css("--text-primary")).text("Housing wage");
    svg.selectAll("g.r").raise();

    // growth table: pay first->latest vs rent same years
    const rentG = c.rent[latest] / c.rent[first] - 1;
    const trs = Object.entries(occ).map(([k, label]) => {
      const a = c.jobs[k][first], b = c.jobs[k][latest];
      return { label, a: adj(a, first), b: adj(b, latest), g: a && b ? (st.dollars === "real" ? (b * REAL[latest]) / (a * REAL[first]) - 1 : b / a - 1) : null };
    });
    const rentGd = st.dollars === "real" ? (c.rent[latest] * REAL[latest]) / (c.rent[first] * REAL[first]) - 1 : rentG;
    const t = d3.select("#jobsTable").html("").attr("aria-labelledby", "jobsTableTitle");
    t.append("thead").append("tr").selectAll("th").data(["Job", `${first} pay`, `${latest} pay`, "Change"]).join("th").attr("scope", "col").text(d => d);
    const tb = t.append("tbody");
    tb.selectAll("tr.j").data(trs).join("tr").attr("class", "j").selectAll("td")
      .data(d => [d.label, d.a ? fmtW(d.a) : "n/a", d.b ? fmtW(d.b) : "n/a", d.g == null ? "n/a" : (d.g >= 0 ? "+" : "") + fmtP(d.g)]).join("td").text(d => d);
    const tr = tb.append("tr").style("font-weight", 700);
    [`Two-bedroom rent (FY${first}→FY${latest})`, fmt$(adj(c.rent[first], first)), fmt$(adj(c.rent[latest], latest)), (rentGd >= 0 ? "+" : "") + fmtP(rentGd)]
      .forEach(v => tr.append("td").text(v));
    d3.select("#jobsNote").text(`${st.dollars === "real" ? "Changes are after inflation (2025 dollars). " : "Changes are before inflation. "}"n/a" means BLS did not publish a reliable estimate for this job and area that year${first === 2016 && c.oews_area.includes("nonmetro") && !c.jobs["00-0000"][2016] ? ", or used different rural-area boundaries in 2016" : ""}.`);
  }

  // ---- housing ----
  function renderHousing() {
    const c = byName.get(st.county);
    d3.select("#housingTitle").text(`Housing supply and renter stress: ${c.county} County`);
    const yrs = Object.keys(c.permits).map(Number).sort();
    const pw = 520, ph = 230, m = { t: 10, r: 10, b: 24, l: 52 };
    const x = d3.scaleBand().domain(yrs).range([m.l, pw - m.r]).paddingInner(0.2);
    const yS = d3.scaleLinear().domain([0, d3.max(yrs, y => c.permits[y]) * 1.1 || 1]).nice().range([ph - m.b, m.t]);
    d3.select("#permitLegend").html(`<span><i style="background:${css("--s5")};height:10px;width:10px"></i>Apartments (5+ units)</span><span><i style="background:${css("--s2")};height:10px;width:10px"></i>Houses and small buildings (1–4 units)</span>`);
    const svg = d3.select("#permitChart").html("").append("svg").attr("viewBox", `0 0 ${pw} ${ph}`).style("width", "100%")
      .attr("role", "img").attr("aria-label", "Homes permitted per year: " + yrs.map(y => `${y} ${fmtN(c.permits[y])}`).join(", "));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(yS).ticks(5).tickFormat(d3.format(",.0f")).tickSize(-(pw - m.l - m.r))).call(g => g.select(".domain").remove());
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${ph - m.b})`)
      .call(d3.axisBottom(x).tickValues(yrs.filter(y => y % 4 === 2)).tickFormat(d3.format("d")).tickSize(0).tickPadding(6)).call(g => g.select(".domain").remove());
    const g = svg.selectAll("g.b").data(yrs).join("g").attr("class", "b")
      .on("mousemove", (e, y) => showTip(e, `<b>${y}</b>${fmtN(c.permits[y])} homes permitted<br>${fmtN(c.permits_5plus[y])} in buildings with 5+ units`)).on("mouseleave", hideTip);
    g.append("rect").attr("x", y => x(y)).attr("width", x.bandwidth()).attr("y", m.t).attr("height", ph - m.t - m.b).attr("fill", "transparent");
    // stacked: 5+ at the baseline, 1-4 on top, 2px surface gap between segments
    g.append("rect").attr("x", y => x(y)).attr("width", x.bandwidth()).attr("y", y => yS(c.permits_5plus[y]))
      .attr("height", y => Math.max(0, yS(0) - yS(c.permits_5plus[y]))).attr("fill", css("--s5"));
    g.append("path").attr("fill", css("--s2")).attr("d", y => {
      const small = c.permits[y] - c.permits_5plus[y];
      const base = yS(c.permits_5plus[y]) - (c.permits_5plus[y] > 0 ? 2 : 0);
      return roundedCol(x(y), base, x.bandwidth(), Math.max(0, base - yS(c.permits[y])));
    });
    const tiles = [
      { label: "Renters who are cost-burdened", value: fmtP(c.cost_burden), sub: `pay 30%+ of income on rent · state ${fmtP(S.cost_burden)}` },
      { label: "Severely cost-burdened", value: fmtP(c.severe_cost_burden), sub: "pay 50%+ of income on rent" },
      { label: "Rental vacancy rate", value: d3.format(".1%")(c.rental_vacancy), sub: `share of rentals vacant and for rent · state ${d3.format(".1%")(S.rental_vacancy)}` },
      { label: "Renter households", value: fmtN(c.renter_households), sub: "ACS 2020–2024" },
    ];
    d3.select("#housingTiles").selectAll("div.tile").data(tiles).join("div").attr("class", "tile")
      .html(d => `<div class="label">${d.label}</div><div class="value">${d.value}</div><div class="sub">${d.sub}</div>`);
  }

  // ---- ranked bars ----
  function renderRank() {
    const m = METRICS[st.metric], c = colorScale(), y = st.year;
    const rows = [...data.counties].sort((a, b) => d3.descending(m.get(a, y), m.get(b, y)) || d3.ascending(a.county, b.county));
    d3.select("#rankTitle").text(`All 58 counties ranked by ${m.short.toLowerCase()}, ${y}`);
    d3.select("#rankSub").text(`The dashed line marks the statewide figure (${m.fmt(stateVal(st.metric, y))}). Counties in the same HUD rental area have the same value.${st.metric === "hours" ? "" : dollarNote()}`);
    const w = 1060, rowH = 16, top = 22, left = 120, right = 70;
    const x = d3.scaleLinear().domain([0, d3.max(rows, r => m.get(r, y))]).nice().range([left, w - right]);
    const root = d3.select("#rank").html("").append("svg").attr("viewBox", `0 0 ${w} ${top + rows.length * rowH + 4}`)
      .attr("role", "img").attr("aria-label", `Ranked bar chart. Highest: ${rows.slice(0, 3).map(r => `${r.county} ${m.fmt(m.get(r, y))}`).join(", ")}. Lowest: ${rows.slice(-3).map(r => `${r.county} ${m.fmt(m.get(r, y))}`).join(", ")}. Full values are in the data table.`);
    root.append("g").attr("class", "axis").attr("transform", `translate(0,${top - 4})`)
      .call(d3.axisTop(x).ticks(6).tickFormat(m.fmt).tickSize(-(rows.length * rowH + 4))).call(g => g.select(".domain").remove());
    const g = root.selectAll("g.rank-row").data(rows).join("g")
      .attr("class", d => "rank-row" + (d.county === st.county ? " selected" : ""))
      .attr("transform", (d, i) => `translate(0,${top + i * rowH})`).style("cursor", "pointer")
      .on("mousemove", (e, d) => showTip(e, mapTip(d))).on("mouseleave", hideTip)
      .on("click", (e, d) => { st.county = d.county; save(); render(); });
    g.append("rect").attr("width", w).attr("height", rowH).attr("fill", "transparent");
    g.append("text").attr("x", left - 8).attr("y", rowH / 2).attr("dy", "0.35em").attr("text-anchor", "end").text(d => d.county);
    g.append("path").attr("fill", d => d.county === st.county ? css("--sel") : c(m.get(d, y))).attr("d", d => roundedBar(x(0), 3, x(m.get(d, y)) - x(0), rowH - 5));
    g.append("text").attr("x", d => x(m.get(d, y)) + 5).attr("y", rowH / 2).attr("dy", "0.35em").text(d => m.fmt(m.get(d, y)));
    const sv = stateVal(st.metric, y);
    root.append("line").attr("x1", x(sv)).attr("x2", x(sv)).attr("y1", top - 4).attr("y2", top + rows.length * rowH)
      .attr("stroke", css("--text-primary")).attr("stroke-dasharray", "4 3").attr("stroke-width", 1.5);
    root.append("text").attr("x", x(sv) + 4).attr("y", top + rows.length * rowH - 4).attr("font-size", 11).attr("fill", css("--text-primary")).text("Statewide");
  }

  // ---- table ----
  let sortK = "hours", sortDesc = true;
  function renderTable() {
    const y = st.year;
    const COLS = [
      { k: "county", t: "County", v: d => d.county, f: v => v },
      { k: "area", t: "HUD rental area", v: d => d.hud_area, f: v => v },
      { k: "rent", t: `2BR rent ${y}`, v: d => adj(d.rent[y], y), f: fmt$ },
      { k: "wage", t: "Housing wage", v: d => adj(d.housing_wage[y], y), f: fmtW },
      { k: "hours", t: "Hrs/wk at min. wage", v: d => d.hours_min_wage[y], f: fmtN },
      { k: "chg", t: `Rent change since ${Y[0]}`, v: d => d.rent[y] / d.rent[Y[0]] - 1, f: v => (v >= 0 ? "+" : "") + fmtP(v) },
      { k: "burden", t: "Cost-burdened renters", v: d => d.cost_burden, f: fmtP },
      { k: "vac", t: "Rental vacancy", v: d => d.rental_vacancy, f: d3.format(".1%") },
    ];
    const col = COLS.find(c => c.k === sortK);
    const rows = [...data.counties].sort((a, b) => (sortDesc ? d3.descending : d3.ascending)(col.v(a), col.v(b)));
    d3.select("#tableSub").text(`Values for ${y}${dollarNote()}. Click a column to sort.`);
    const t = d3.select("#table"); t.selectAll("thead, tbody").remove();
    t.append("thead").append("tr").selectAll("th").data(COLS).join("th").attr("scope", "col")
      .attr("aria-sort", d => d.k === sortK ? (sortDesc ? "descending" : "ascending") : null)
      .append("button").attr("type", "button").attr("class", "sort")
      .text(d => d.t + (d.k === sortK ? (sortDesc ? " ▾" : " ▴") : ""))
      .on("click", (e, d) => { sortDesc = d.k === sortK ? !sortDesc : !["county", "area"].includes(d.k); sortK = d.k; renderTable(); });
    t.append("tbody").selectAll("tr").data(rows).join("tr").style("font-weight", d => d.county === st.county ? 700 : null)
      .selectAll("td").data(d => COLS.map(c => c.f(c.v(d)))).join("td").text(d => d);
  }

  function render() {
    d3.select("#countySelect").property("value", st.county);
    d3.select("#yearRange").property("value", st.year).attr("aria-valuetext", st.year); d3.select("#yearLabel").text(st.year);
    d3.selectAll("#metricSeg button").attr("aria-pressed", ([k]) => k === st.metric);
    d3.selectAll("#dollarSeg button").attr("aria-pressed", function () { return this.dataset.v === st.dollars; });
    renderHeroes(); renderMap(); renderDetail(); renderHistory(); renderJobs(); renderHousing(); renderRank(); renderTable();
  }
  render();
})().catch(err => {
  document.getElementById("asof").textContent = "Couldn't load data. If you opened index.html directly, run a local server: python3 -m http.server";
  console.error(err);
});
