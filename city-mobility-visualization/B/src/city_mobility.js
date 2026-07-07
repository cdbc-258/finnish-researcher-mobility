const state = {
  period: "2008-2018",
  topN: 50,
  showSelf: false,
  direction: "all",
  selectedCity: null,
  searchTerm: "",
  nodes: [],
  links: {},
  matrix: {},
  summary: {},
  projection: null,
  retention: {},
  diffMatrix: {},
};

const colors = {
  blue: "#3f73c9",
  blueDark: "#1f4f9a",
  green: "#66b96e",
  greenDark: "#27845b",
  red: "#d55a4f",
  gray: "#657386",
  pale: "#eef3f8",
};

const formatNumber = d3.format(",");
const shortNumber = d3.format(".3s");

const tooltip = d3.select("#tooltip");

Promise.all([
  d3.json("data/city_nodes.json"),
  d3.json("data/city_links.json"),
  d3.json("data/city_matrix.json"),
  d3.json("data/city_summary.json"),
  d3.json("data/city_retention.json"),
  d3.json("data/city_diff_matrix.json"),
]).then(([nodes, links, matrix, summary, retention, diffMatrix]) => {
  state.nodes = nodes;
  state.links = links;
  state.matrix = matrix;
  state.summary = summary;
  state.retention = retention;
  state.diffMatrix = diffMatrix;

  setupControls();
  render();
});

function setupControls() {
  const periods = state.summary.periods;
  d3.select("#periodControls")
    .selectAll("button")
    .data(periods)
    .join("button")
    .attr("class", d => (d === state.period ? "active" : null))
    .text(d => d)
    .on("click", (_, period) => {
      state.period = period;
      render();
    });

  d3.select("#topNSelect").on("change", event => {
    state.topN = Number(event.target.value);
    render();
  });

  d3.select("#selfLoopToggle").on("change", event => {
    state.showSelf = event.target.checked;
    render();
  });

  d3.select("#directionControls")
    .selectAll("button")
    .on("click", function () {
      state.direction = this.dataset.direction;
      render();
    });

  d3.select("#cityOptions")
    .selectAll("option")
    .data(state.nodes.map(d => d.id).sort())
    .join("option")
    .attr("value", d => d);

  d3.select("#citySearch").on("input", event => {
    const value = event.target.value.trim();
    state.searchTerm = value;
    const match = state.nodes.find(
      node => node.id.toLowerCase() === value.toLowerCase(),
    );
    state.selectedCity = match ? match.id : value || null;
    render();
  });

  d3.select("#resetButton").on("click", () => {
    state.period = "2008-2018";
    state.topN = 50;
    state.showSelf = false;
    state.direction = "all";
    state.selectedCity = null;
    state.searchTerm = "";
    d3.select("#citySearch").property("value", "");
    d3.select("#topNSelect").property("value", "50");
    d3.select("#selfLoopToggle").property("checked", false);
    render();
  });
}

function render() {
  d3.select("#periodControls")
    .selectAll("button")
    .classed("active", d => d === state.period);
  d3.select("#directionControls")
    .selectAll("button")
    .classed("active", function () {
      return this.dataset.direction === state.direction;
    });

  renderPeriodStats();
  renderFindings();
  renderMap();
  renderNetwork();
  renderMatrix();
  renderBars();
  renderTrendAndTopLinks();
  renderMetricCharts();
  renderRetentionDonuts();
  renderRetentionRanking();
  renderQuadrantChart();
  renderDiffHeatmap();
  renderComparison();
}

function currentLinks() {
  const base = [...state.links[state.period]]
    .filter(link => state.showSelf || !link.isSelf)
    .sort((a, b) => d3.descending(a.value, b.value))
    .slice(0, state.topN);

  if (!state.selectedCity || !knownCity(state.selectedCity)) {
    return base;
  }

  if (state.direction === "incoming") {
    return base.filter(link => link.target === state.selectedCity);
  }
  if (state.direction === "outgoing") {
    return base.filter(link => link.source === state.selectedCity);
  }
  return base.filter(
    link => link.source === state.selectedCity || link.target === state.selectedCity,
  );
}

function knownCity(city) {
  return state.nodes.some(node => node.id === city);
}

function isHighlightedCity(city) {
  if (!state.selectedCity) return false;
  return city.toLowerCase().includes(state.selectedCity.toLowerCase());
}

function nodeById(id) {
  return state.nodes.find(node => node.id === id);
}

function nodeColor(node) {
  if (node.type === "inflow") return colors.blue;
  if (node.type === "outflow") return colors.red;
  return colors.green;
}

function renderPeriodStats() {
  const totals = state.summary.periodTotals[state.period];
  const stats = [
    { label: "总流动次数", value: totals.total },
    { label: "跨城流动", value: totals.nonSelf },
    { label: "同城留存", value: totals.self },
  ];
  d3.select("#periodStats")
    .selectAll(".stat-item")
    .data(stats)
    .join("div")
    .attr("class", "stat-item")
    .html(d => `<strong>${formatNumber(d.value)}</strong><span>${d.label}</span>`);
}

function renderFindings() {
  d3.select("#findings")
    .selectAll("li")
    .data(state.summary.findings)
    .join("li")
    .text(d => d);
}

function renderMap() {
  const svg = d3.select("#mapChart");
  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;
  svg.selectAll("*").remove();

  const margin = { top: 8, right: 20, bottom: 18, left: 8 };
  const mapGroup = svg.append("g");
  const defs = svg.append("defs");
  const arrow = defs
    .append("marker")
    .attr("id", "flowArrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 9)
    .attr("refY", 0)
    .attr("markerWidth", 7)
    .attr("markerHeight", 7)
    .attr("orient", "auto");
  arrow.append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", colors.greenDark);

  const strongArrow = defs
    .append("marker")
    .attr("id", "flowArrowStrong")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 9)
    .attr("refY", 0)
    .attr("markerWidth", 4.8)
    .attr("markerHeight", 4.8)
    .attr("orient", "auto");
  strongArrow.append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", colors.greenDark);

  const projection = d3
    .geoMercator()
    .center([25.7, 62.1])
    .scale(Math.min(width * 2.45, height * 3.05))
    .translate([width * 0.48, height * 0.53]);
  state.projection = projection;

  drawFallbackFinland(mapGroup, projection);

  const links = currentLinks();
  const radius = d3
    .scaleSqrt()
    .domain([0, d3.max(state.nodes, d => d.total)])
    .range([4.2, 18]);
  const widthScale = d3
    .scaleSqrt()
    .domain([0, d3.max(links, d => d.value) || 1])
    .range([0.9, 10]);

  mapGroup
    .append("g")
    .selectAll("path")
    .data(links)
    .join("path")
    .attr("class", d => linkClass(d, "flow-line"))
    .attr("d", d => mapLinkPath(d, projection))
    .attr("stroke-width", d => widthScale(d.value))
    .attr("opacity", d => (d.isSelf ? 0.45 : 0.58))
    .attr("marker-end", d => (d.isSelf ? null : mapArrowMarker(widthScale(d.value))))
    .on("mousemove", (event, d) =>
      showTooltip(
        event,
        `<strong>${d.source} -> ${d.target}</strong><br>${state.period}<br>流动次数：${formatNumber(d.value)}`,
      ),
    )
    .on("mouseleave", hideTooltip);

  const cityGroups = mapGroup
    .append("g")
    .selectAll("g")
    .data(state.nodes)
    .join("g")
    .attr("transform", d => `translate(${projectCity(d, projection)})`)
    .attr("class", d => cityClass(d.id, "map-city"))
    .on("click", (_, d) => selectCity(d.id))
    .on("mousemove", (event, d) => {
      showTooltip(
        event,
        `<strong>${d.id}</strong><br>总流动：${formatNumber(d.total)}<br>流入：${formatNumber(d.incoming)}<br>流出：${formatNumber(d.outgoing)}<br>排名：${d.rank}`,
      );
    })
    .on("mouseleave", hideTooltip);

  cityGroups
    .append("circle")
    .attr("class", "city-node")
    .attr("r", d => radius(d.total))
    .attr("fill", nodeColor);

  cityGroups
    .append("text")
    .attr("class", "city-label")
    .attr("x", d => radius(d.total) + 4)
    .attr("y", 4)
    .text(d => d.label);

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", height - margin.bottom)
    .attr("fill", colors.gray)
    .attr("font-size", 11)
    .text("注：Other 为其他地区虚拟节点；底图为简化示意，用于承载城市坐标和迁移方向。");

}

function drawFallbackFinland(group, projection) {
  const outline = {
    type: "Polygon",
    coordinates: [
      [
        [20.55, 59.72],
        [22.2, 60.15],
        [23.7, 60.18],
        [25.2, 60.05],
        [26.6, 60.35],
        [28.6, 60.55],
        [30.05, 61.28],
        [30.15, 62.35],
        [29.32, 63.45],
        [30.1, 64.9],
        [29.65, 66.1],
        [29.05, 67.35],
        [28.5, 68.8],
        [27.7, 69.7],
        [25.8, 70.1],
        [23.7, 68.85],
        [22.4, 67.7],
        [23.1, 66.4],
        [24.0, 65.25],
        [23.15, 64.0],
        [22.25, 62.6],
        [21.2, 61.45],
        [20.55, 59.72],
      ],
    ],
  };

  group
    .append("path")
    .datum(outline)
    .attr("class", "country")
    .attr("d", d3.geoPath(projection));

  const lakes = [
    { lon: 27.7, lat: 62.4, r: 12 },
    { lon: 25.4, lat: 62.3, r: 9 },
    { lon: 28.2, lat: 61.8, r: 8 },
  ];
  group
    .append("g")
    .selectAll("circle")
    .data(lakes)
    .join("circle")
    .attr("cx", d => projection([d.lon, d.lat])[0])
    .attr("cy", d => projection([d.lon, d.lat])[1])
    .attr("r", d => d.r)
    .attr("fill", "#d9eaf7")
    .attr("opacity", 0.75);
}

function projectCity(city, projection) {
  if (city.id === "Other") {
    const width = d3.select("#mapChart").node().clientWidth;
    const height = d3.select("#mapChart").node().clientHeight;
    return [width - 95, height - 85];
  }
  return projection([city.lon, city.lat]);
}

function mapLinkPath(link, projection) {
  const source = nodeById(link.source);
  const target = nodeById(link.target);
  const [sx, sy] = projectCity(source, projection);
  const [tx, ty] = projectCity(target, projection);

  if (link.isSelf) {
    const r = 14;
    return `M${sx},${sy}c${r},-${r * 1.4} ${r * 2.2},${r * 1.4} 0,${r * 1.8}`;
  }

  const dx = tx - sx;
  const dy = ty - sy;
  const dr = Math.sqrt(dx * dx + dy * dy);
  if (!dr) return `M${sx},${sy}L${tx},${ty}`;
  const curve = Math.max(28, Math.min(130, dr * 0.26));
  const mx = (sx + tx) / 2 - (dy / dr) * curve;
  const my = (sy + ty) / 2 + (dx / dr) * curve;
  return `M${sx},${sy}Q${mx},${my} ${tx},${ty}`;
}

function mapArrowMarker(strokeWidth) {
  return strokeWidth >= 8.8 ? "url(#flowArrowStrong)" : "url(#flowArrow)";
}

function renderNetwork() {
  const svg = d3.select("#networkChart");
  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;
  svg.selectAll("*").remove();

  const links = currentLinks().filter(d => !d.isSelf);
  const included = new Set(links.flatMap(d => [d.source, d.target]));
  if (knownCity(state.selectedCity)) included.add(state.selectedCity);

  const nodes = state.nodes
    .filter(node => included.has(node.id))
    .map(node => ({ ...node }));
  const nodeIds = new Set(nodes.map(d => d.id));
  const networkLinks = links
    .filter(link => nodeIds.has(link.source) && nodeIds.has(link.target))
    .map(link => ({ ...link }));

  const linkWidth = d3
    .scaleSqrt()
    .domain([0, d3.max(networkLinks, d => d.value) || 1])
    .range([0.6, 7]);
  const radius = d3
    .scaleSqrt()
    .domain([0, d3.max(state.nodes, d => d.total)])
    .range([5, 22]);

  const simulation = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink(networkLinks)
        .id(d => d.id)
        .distance(d => 70 + 120 * (1 - d.normalized)),
    )
    .force("charge", d3.forceManyBody().strength(-280))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide(d => radius(d.total) + 18));

  const link = svg
    .append("g")
    .selectAll("line")
    .data(networkLinks)
    .join("line")
    .attr("class", d => linkClass(d, "network-link"))
    .attr("stroke-width", d => linkWidth(d.value))
    .attr("opacity", 0.62)
    .on("mousemove", (event, d) =>
      showTooltip(
        event,
        `<strong>${d.source.id || d.source} -> ${d.target.id || d.target}</strong><br>流动次数：${formatNumber(d.value)}`,
      ),
    )
    .on("mouseleave", hideTooltip);

  const node = svg
    .append("g")
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("class", d => cityClass(d.id, "node"))
    .attr("r", d => radius(d.total))
    .attr("fill", nodeColor)
    .call(
      d3
        .drag()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
    )
    .on("click", (_, d) => selectCity(d.id))
    .on("mousemove", (event, d) =>
      showTooltip(
        event,
        `<strong>${d.id}</strong><br>中心性：${d.centrality}<br>净流动：${formatNumber(d.net)}`,
      ),
    )
    .on("mouseleave", hideTooltip);

  const label = svg
    .append("g")
    .selectAll("text")
    .data(nodes)
    .join("text")
    .attr("class", "network-label")
    .text(d => d.id);

  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);
    node.attr("cx", d => d.x).attr("cy", d => d.y);
    label.attr("x", d => d.x + radius(d.total) + 4).attr("y", d => d.y + 4);
  });

}

function renderMatrix() {
  const svg = d3.select("#matrixChart");
  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;
  svg.selectAll("*").remove();

  const data = state.matrix[state.period];
  const cities = data.cities;
  const values = data.values;
  const matrixHasSideLegend = width >= 760;
  const margin = {
    top: 92,
    right: matrixHasSideLegend ? 214 : 12,
    bottom: matrixHasSideLegend ? 18 : 132,
    left: 104,
  };
  const available = Math.min(
    width - margin.left - margin.right,
    height - margin.top - margin.bottom,
  );
  const cell = Math.max(9, Math.floor(available / cities.length));
  const inner = cell * cities.length;

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  const maxLog = Math.log1p(data.maxValue);
  const colorScale = d3
    .scaleSequential(d3.interpolateYlGnBu)
    .domain([0, maxLog]);

  const rows = [];
  values.forEach((row, i) => {
    row.forEach((value, j) => {
      rows.push({ from: cities[i], to: cities[j], value, i, j });
    });
  });

  g.selectAll("rect")
    .data(rows)
    .join("rect")
    .attr("class", d => matrixClass(d))
    .attr("x", d => d.j * cell)
    .attr("y", d => d.i * cell)
    .attr("width", cell - 1)
    .attr("height", cell - 1)
    .attr("fill", d => matrixColor(d, colorScale))
    .on("mousemove", (event, d) =>
      showTooltip(
        event,
        `<strong>${d.from} -> ${d.to}</strong><br>${state.period}<br>次数：${formatNumber(d.value)}`,
      ),
    )
    .on("mouseleave", hideTooltip);

  g.append("g")
    .selectAll("text")
    .data(cities)
    .join("text")
    .attr("class", "matrix-label")
    .attr("x", -8)
    .attr("y", (_, i) => i * cell + cell * 0.72)
    .attr("text-anchor", "end")
    .text(d => d);

  g.append("g")
    .selectAll("text")
    .data(cities)
    .join("text")
    .attr("class", "matrix-label")
    .attr("transform", (_, i) => `translate(${i * cell + cell * 0.72},-8) rotate(-58)`)
    .attr("text-anchor", "start")
    .text(d => d);

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", margin.top + inner + 16)
    .attr("fill", colors.gray)
    .attr("font-size", 11)
    .text("行 = From，列 = To；绿色对角线强调同城留存，红色强调零值或弱连接。");

  drawMatrixLegend(svg, {
    colorScale,
    maxValue: data.maxValue,
    x: matrixHasSideLegend ? margin.left + inner + 32 : margin.left,
    y: matrixHasSideLegend ? margin.top + 6 : margin.top + inner + 34,
    width: matrixHasSideLegend ? 148 : Math.min(260, width - margin.left - 16),
  });
}

function matrixColor(d, colorScale) {
  if (d.i === d.j) return d.value === 0 ? "#f2aaa3" : "#63b96f";
  if (d.value === 0) return "#df6a60";
  return colorScale(Math.log1p(d.value));
}

function drawMatrixLegend(svg, config) {
  const legendHeight = 12;
  const gradientId = "matrixLegendGradient";
  const maxLog = Math.log1p(config.maxValue);
  const defs = svg.append("defs");
  const gradient = defs
    .append("linearGradient")
    .attr("id", gradientId)
    .attr("x1", "0%")
    .attr("x2", "100%")
    .attr("y1", "0%")
    .attr("y2", "0%");

  d3.range(0, 1.01, 0.1).forEach(t => {
    gradient
      .append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", config.colorScale(t * maxLog));
  });

  const legend = svg
    .append("g")
    .attr("class", "matrix-legend")
    .attr("transform", `translate(${config.x},${config.y})`);

  legend
    .append("text")
    .attr("class", "matrix-legend-title")
    .attr("x", 0)
    .attr("y", 0)
    .text("迁移次数 Times");

  legend
    .append("rect")
    .attr("x", 0)
    .attr("y", 12)
    .attr("width", config.width)
    .attr("height", legendHeight)
    .attr("fill", `url(#${gradientId})`);

  const tickValues = [1, 1000, 10000, 100000, config.maxValue]
    .filter((value, index, values) => value <= config.maxValue && values.indexOf(value) === index);
  const tickScale = d3
    .scaleLinear()
    .domain([0, maxLog])
    .range([0, config.width]);

  legend
    .append("g")
    .selectAll("line")
    .data(tickValues)
    .join("line")
    .attr("x1", d => tickScale(Math.log1p(d)))
    .attr("x2", d => tickScale(Math.log1p(d)))
    .attr("y1", 24)
    .attr("y2", 29)
    .attr("stroke", "#506176");

  legend
    .append("g")
    .selectAll("text")
    .data(tickValues)
    .join("text")
    .attr("class", "matrix-legend-tick")
    .attr("x", d => tickScale(Math.log1p(d)))
    .attr("y", 42)
    .attr("text-anchor", (d, i) => {
      if (i === 0) return "start";
      if (i === tickValues.length - 1) return "end";
      return "middle";
    })
    .text(d => legendNumber(d));

  const swatches = [
    { label: "零值/弱连接", color: "#df6a60" },
    { label: "同城留存", color: "#63b96f" },
  ];

  const swatch = legend
    .append("g")
    .attr("transform", "translate(0,60)")
    .selectAll("g")
    .data(swatches)
    .join("g")
    .attr("transform", (_, i) => `translate(0,${i * 21})`);

  swatch
    .append("rect")
    .attr("width", 14)
    .attr("height", 14)
    .attr("fill", d => d.color);

  swatch
    .append("text")
    .attr("class", "matrix-legend-note")
    .attr("x", 21)
    .attr("y", 11)
    .text(d => d.label);
}

function legendNumber(value) {
  if (value >= 1000000) return `${d3.format(".2s")(value).replace("G", "B")}`;
  if (value >= 1000) return `${d3.format(".0s")(value)}`;
  return `${value}`;
}

function renderBars() {
  const links = state.links[state.period];
  const incoming = d3.rollups(
    links,
    rows => d3.sum(rows, d => d.value),
    d => d.target,
  );
  const outgoing = d3.rollups(
    links,
    rows => d3.sum(rows, d => d.value),
    d => d.source,
  );
  drawBarChart("#incomingBars", incoming, "总流入排行", colors.blue);
  drawBarChart("#outgoingBars", outgoing, "总流出排行", colors.greenDark);
}

function drawBarChart(selector, values, title, color) {
  const svg = d3.select(selector);
  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;
  svg.selectAll("*").remove();

  const top = values
    .map(([city, value]) => ({ city, value }))
    .sort((a, b) => d3.descending(a.value, b.value))
    .slice(0, 8);
  const margin = { top: 28, right: 58, bottom: 14, left: 92 };
  const x = d3
    .scaleLinear()
    .domain([0, d3.max(top, d => d.value) || 1])
    .range([0, width - margin.left - margin.right]);
  const y = d3
    .scaleBand()
    .domain(top.map(d => d.city))
    .range([margin.top, height - margin.bottom])
    .padding(0.26);

  svg
    .append("text")
    .attr("x", 0)
    .attr("y", 15)
    .attr("fill", colors.blueDark)
    .attr("font-size", 13)
    .attr("font-weight", 700)
    .text(title);

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .selectAll("rect")
    .data(top)
    .join("rect")
    .attr("x", 0)
    .attr("y", d => y(d.city))
    .attr("width", d => x(d.value))
    .attr("height", y.bandwidth())
    .attr("fill", color)
    .attr("opacity", d => (isHighlightedCity(d.city) ? 1 : 0.82))
    .on("mousemove", (event, d) =>
      showTooltip(event, `<strong>${d.city}</strong><br>${title}：${formatNumber(d.value)}`),
    )
    .on("mouseleave", hideTooltip);

  svg
    .append("g")
    .selectAll("text")
    .data(top)
    .join("text")
    .attr("class", "bar-label")
    .attr("x", margin.left - 8)
    .attr("y", d => y(d.city) + y.bandwidth() * 0.68)
    .attr("text-anchor", "end")
    .text(d => d.city);

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .selectAll("text")
    .data(top)
    .join("text")
    .attr("class", "bar-value")
    .attr("x", d => x(d.value) + 5)
    .attr("y", d => y(d.city) + y.bandwidth() * 0.68)
    .text(d => shortNumber(d.value).replace("G", "B"));
}

function renderTrendAndTopLinks() {
  const svg = d3.select("#trendChart");
  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;
  svg.selectAll("*").remove();

  const periods = state.summary.periods;
  const data = periods.map(period => ({
    period,
    value: state.summary.periodTotals[period].nonSelf,
  }));
  const margin = { top: 18, right: 18, bottom: 32, left: 58 };
  const x = d3
    .scaleBand()
    .domain(periods)
    .range([margin.left, width - margin.right])
    .padding(0.28);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(data, d => d.value) || 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  svg
    .append("g")
    .selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", d => x(d.period))
    .attr("y", d => y(d.value))
    .attr("width", x.bandwidth())
    .attr("height", d => y(0) - y(d.value))
    .attr("fill", d => (d.period === state.period ? colors.blue : "#9bb7df"));

  const line = d3
    .line()
    .x(d => x(d.period) + x.bandwidth() / 2)
    .y(d => y(d.value));

  svg
    .append("path")
    .datum(data)
    .attr("d", line)
    .attr("fill", "none")
    .attr("stroke", "#111111")
    .attr("stroke-width", 1.6);

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", 10)
    .attr("fill", colors.gray)
    .attr("font-size", 11)
    .text("柱形 = 跨城流动总量；黑线 = 时间趋势");

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickSizeOuter(0));
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(4).tickFormat(shortNumber));

  const top = state.links[state.period]
    .filter(d => !d.isSelf)
    .sort((a, b) => d3.descending(a.value, b.value))
    .slice(0, 6);
  d3.select("#topLinks")
    .selectAll(".link-row")
    .data(top)
    .join("div")
    .attr("class", "link-row")
    .html(
      d =>
        `<strong>${d.source} -> ${d.target}</strong><span>${state.period}：${formatNumber(d.value)}</span>`,
    );
}

function renderMetricCharts() {
  drawRetentionBars();
  drawNetRateChart();
  drawAsymmetryChart();
  drawHerfindahlChart();
  drawCommunityChart();
}

function drawRetentionBars() {
  const svg = d3.select("#retentionBars");
  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;
  svg.selectAll("*").remove();

  const periods = state.summary.periods;
  const data = periods.flatMap(period => {
    const item = state.summary.retentionMobility[period];
    return [
      { period, type: "同城留存", value: item.self, rate: item.selfRate },
      { period, type: "跨城流动", value: item.nonSelf, rate: item.nonSelfRate },
    ];
  });
  const margin = { top: 22, right: 20, bottom: 42, left: 58 };
  const x0 = d3
    .scaleBand()
    .domain(periods)
    .range([margin.left, width - margin.right])
    .paddingInner(0.2);
  const x1 = d3
    .scaleBand()
    .domain(["同城留存", "跨城流动"])
    .range([0, x0.bandwidth()])
    .padding(0.08);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(data, d => d.value) || 1])
    .nice()
    .range([height - margin.bottom, margin.top]);
  const color = d3
    .scaleOrdinal()
    .domain(["同城留存", "跨城流动"])
    .range([colors.greenDark, colors.blue]);

  svg
    .append("g")
    .selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", d => x0(d.period) + x1(d.type))
    .attr("y", d => y(d.value))
    .attr("width", x1.bandwidth())
    .attr("height", d => y(0) - y(d.value))
    .attr("fill", d => color(d.type))
    .attr("opacity", d => (d.period === state.period ? 0.95 : 0.52))
    .on("mousemove", (event, d) =>
      showTooltip(
        event,
        `<strong>${d.period} ${d.type}</strong><br>次数：${formatNumber(d.value)}<br>占比：${d3.format(".1%")(d.rate)}`,
      ),
    )
    .on("mouseleave", hideTooltip);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x0).tickSizeOuter(0));
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(4).tickFormat(shortNumber));

  drawInlineLegend(svg, [
    { label: "同城留存", color: colors.greenDark },
    { label: "跨城流动", color: colors.blue },
  ], margin.left, 10);
}

function drawNetRateChart() {
  const svg = d3.select("#netRateChart");
  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;
  svg.selectAll("*").remove();

  const data = state.summary.netInflowRates[state.period]
    .filter(d => d.total > 500)
    .sort((a, b) => d3.descending(a.absRate, b.absRate))
    .slice(0, 10)
    .sort((a, b) => d3.ascending(a.netInflowRate, b.netInflowRate));
  const margin = { top: 18, right: 48, bottom: 34, left: 92 };
  const maxAbs = d3.max(data, d => Math.abs(d.netInflowRate)) || 0.05;
  const x = d3
    .scaleLinear()
    .domain([-maxAbs, maxAbs])
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleBand()
    .domain(data.map(d => d.city))
    .range([margin.top, height - margin.bottom])
    .padding(0.28);

  svg
    .append("line")
    .attr("class", "zero-line")
    .attr("x1", x(0))
    .attr("x2", x(0))
    .attr("y1", margin.top)
    .attr("y2", height - margin.bottom);

  svg
    .append("g")
    .selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", d => Math.min(x(0), x(d.netInflowRate)))
    .attr("y", d => y(d.city))
    .attr("width", d => Math.abs(x(d.netInflowRate) - x(0)))
    .attr("height", y.bandwidth())
    .attr("fill", d => (d.netInflowRate >= 0 ? colors.blue : colors.red))
    .on("mousemove", (event, d) =>
      showTooltip(
        event,
        `<strong>${d.city}</strong><br>净流入率：(In-Out)/(In+Out)<br>${d3.format("+.2%")(d.netInflowRate)}<br>净流动：${formatNumber(d.net)}`,
      ),
    )
    .on("mouseleave", hideTooltip);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("+.0%")));
  svg
    .append("g")
    .selectAll("text")
    .data(data)
    .join("text")
    .attr("class", "bar-label")
    .attr("x", margin.left - 8)
    .attr("y", d => y(d.city) + y.bandwidth() * 0.68)
    .attr("text-anchor", "end")
    .text(d => d.city);
}

function drawAsymmetryChart() {
  const svg = d3.select("#asymmetryChart");
  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;
  svg.selectAll("*").remove();

  const data = state.summary.asymmetryPairs[state.period]
    .filter(d => d.total >= 1000)
    .sort((a, b) => d3.descending(a.absAsymmetry, b.absAsymmetry))
    .slice(0, 9)
    .sort((a, b) => d3.ascending(a.asymmetry, b.asymmetry));
  const margin = { top: 18, right: 56, bottom: 34, left: 132 };
  const x = d3.scaleLinear().domain([-1, 1]).range([margin.left, width - margin.right]);
  const y = d3
    .scaleBand()
    .domain(data.map(d => `${d.cityA}-${d.cityB}`))
    .range([margin.top, height - margin.bottom])
    .padding(0.26);

  svg
    .append("line")
    .attr("class", "zero-line")
    .attr("x1", x(0))
    .attr("x2", x(0))
    .attr("y1", margin.top)
    .attr("y2", height - margin.bottom);

  svg
    .append("g")
    .selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", d => Math.min(x(0), x(d.asymmetry)))
    .attr("y", d => y(`${d.cityA}-${d.cityB}`))
    .attr("width", d => Math.abs(x(d.asymmetry) - x(0)))
    .attr("height", y.bandwidth())
    .attr("fill", d => (d.asymmetry >= 0 ? colors.blue : colors.greenDark))
    .on("mousemove", (event, d) =>
      showTooltip(
        event,
        `<strong>${d.cityA} / ${d.cityB}</strong><br>不对称指数：(Fij-Fji)/(Fij+Fji)<br>${d3.format("+.2f")(d.asymmetry)}<br>主导方向：${d.dominant}<br>总量：${formatNumber(d.total)}`,
      ),
    )
    .on("mouseleave", hideTooltip);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(5));
  svg
    .append("g")
    .selectAll("text")
    .data(data)
    .join("text")
    .attr("class", "bar-label")
    .attr("x", margin.left - 8)
    .attr("y", d => y(`${d.cityA}-${d.cityB}`) + y.bandwidth() * 0.68)
    .attr("text-anchor", "end")
    .text(d => `${d.cityA}-${d.cityB}`);
}

function drawHerfindahlChart() {
  const svg = d3.select("#hhiChart");
  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;
  svg.selectAll("*").remove();

  const data = state.summary.herfindahlOutgoing[state.period]
    .filter(d => d.outgoingNonSelf >= 1000)
    .slice(0, 10)
    .sort((a, b) => d3.ascending(a.hhi, b.hhi));
  const margin = { top: 18, right: 68, bottom: 34, left: 104 };
  const x = d3.scaleLinear().domain([0, 1]).range([margin.left, width - margin.right]);
  const y = d3
    .scaleBand()
    .domain(data.map(d => d.city))
    .range([margin.top, height - margin.bottom])
    .padding(0.28);

  svg
    .append("g")
    .selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", x(0))
    .attr("y", d => y(d.city))
    .attr("width", d => x(d.hhi) - x(0))
    .attr("height", y.bandwidth())
    .attr("fill", d => d3.interpolateYlGnBu(d.hhi))
    .on("mousemove", (event, d) =>
      showTooltip(
        event,
        `<strong>${d.city}</strong><br>Herfindahl 集中度：${d3.format(".3f")(d.hhi)}<br>最大目的地：${d.topDestination} (${d3.format(".1%")(d.topDestinationShare)})<br>目的地数量：${d.destinations}`,
      ),
    )
    .on("mouseleave", hideTooltip);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(5));
  svg
    .append("g")
    .selectAll("text")
    .data(data)
    .join("text")
    .attr("class", "bar-label")
    .attr("x", margin.left - 8)
    .attr("y", d => y(d.city) + y.bandwidth() * 0.68)
    .attr("text-anchor", "end")
    .text(d => d.city);

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", height - 6)
    .attr("fill", colors.gray)
    .attr("font-size", 10)
    .text("越接近 1：流出目的地越集中；越接近 0：越分散");
}

function drawCommunityChart() {
  const svg = d3.select("#communityChart");
  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;
  svg.selectAll("*").remove();

  const community = state.summary.communities[state.period];
  const data = community.groups
    .slice()
    .sort((a, b) => d3.descending(a.internalWeight, b.internalWeight));
  const margin = { top: 58, right: 220, bottom: 38, left: 76 };
  const palette = [
    colors.blue,
    colors.greenDark,
    "#57a6b2",
    "#7b8cc9",
    "#9a8f4f",
    "#c47d55",
  ];
  const x = d3
    .scaleLinear()
    .domain([0, d3.max(data, d => d.internalWeight) || 1])
    .nice()
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleBand()
    .domain(data.map(d => d.id))
    .range([margin.top, height - margin.bottom])
    .padding(0.3);

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", 18)
    .attr("fill", colors.blueDark)
    .attr("font-size", 12)
    .attr("font-weight", 700)
    .text(`社区数：${community.communityCount}    模块度 Q：${d3.format(".3f")(community.modularity)}`);

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", 38)
    .attr("fill", colors.gray)
    .attr("font-size", 11)
    .text("条形长度表示社区内部流动强度；右侧列出该社区的主要城市。");

  svg
    .append("g")
    .selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", x(0))
    .attr("y", d => y(d.id))
    .attr("width", d => x(d.internalWeight) - x(0))
    .attr("height", y.bandwidth())
    .attr("fill", (_, i) => palette[i % palette.length])
    .attr("opacity", 0.9)
    .on("mousemove", (event, d) =>
      showTooltip(
        event,
        `<strong>${d.id}：${d.cities.join(", ")}</strong><br>城市数：${d.size}<br>内部流动：${formatNumber(d.internalWeight)}<br>内部占比：${d3.format(".1%")(d.internalShare)}`,
      ),
    )
    .on("mouseleave", hideTooltip);

  svg
    .append("g")
    .selectAll("text")
    .data(data)
    .join("text")
    .attr("class", "bar-label")
    .attr("x", margin.left - 8)
    .attr("y", d => y(d.id) + y.bandwidth() * 0.68)
    .attr("text-anchor", "end")
    .text(d => d.id);

  svg
    .append("g")
    .selectAll("text")
    .data(data)
    .join("text")
    .attr("class", "bar-value")
    .attr("x", d => Math.min(x(d.internalWeight) + 8, width - margin.right + 8))
    .attr("y", d => y(d.id) + y.bandwidth() * 0.68)
    .text(d => `${shortNumber(d.internalWeight)} · ${d.size} 城市`);

  svg
    .append("g")
    .selectAll("text")
    .data(data)
    .join("text")
    .attr("class", "bar-value")
    .attr("x", width - margin.right + 92)
    .attr("y", d => y(d.id) + y.bandwidth() * 0.68)
    .text(d => {
      const names = d.cities.slice(0, 5).join(", ");
      return d.cities.length > 5 ? `${names}...` : names;
    });

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(shortNumber));
}

function drawInlineLegend(svg, items, x, y) {
  const legend = svg.append("g").attr("transform", `translate(${x},${y})`);
  const group = legend
    .selectAll("g")
    .data(items)
    .join("g")
    .attr("transform", (_, i) => `translate(${i * 82},0)`);
  group
    .append("rect")
    .attr("width", 10)
    .attr("height", 10)
    .attr("fill", d => d.color);
  group
    .append("text")
    .attr("class", "bar-value")
    .attr("x", 15)
    .attr("y", 9)
    .text(d => d.label);
}

function linkClass(link, base) {
  const active =
    state.selectedCity &&
    (link.source === state.selectedCity || link.target === state.selectedCity);
  const dimmed = state.selectedCity && knownCity(state.selectedCity) && !active;
  return `${base}${active ? " active" : ""}${dimmed ? " dimmed" : ""}`;
}

function cityClass(city, base) {
  const active = isHighlightedCity(city);
  const dimmed = state.selectedCity && knownCity(state.selectedCity) && !active;
  return `${base}${active ? " active" : ""}${dimmed ? " dimmed" : ""}`;
}

function matrixClass(cell) {
  const active =
    state.selectedCity &&
    (cell.from === state.selectedCity || cell.to === state.selectedCity);
  const dimmed = state.selectedCity && knownCity(state.selectedCity) && !active;
  return `matrix-cell${active ? " active" : ""}${dimmed ? " dimmed" : ""}`;
}

function selectCity(city) {
  state.selectedCity = state.selectedCity === city ? null : city;
  d3.select("#citySearch").property("value", state.selectedCity || "");
  render();
}

function showTooltip(event, html) {
  tooltip
    .attr("hidden", null)
    .style("left", `${event.clientX + 14}px`)
    .style("top", `${event.clientY + 14}px`)
    .html(html);
}

function hideTooltip() {
  tooltip.attr("hidden", true);
}

// ===== 留守率环图 =====
function renderRetentionDonuts() {
  const svg = d3.select("#retentionDonuts");
  const width = svg.node().clientWidth;
  svg.selectAll("*").remove();

  const period = state.period;
  const rows = state.retention[period];
  if (!rows || !rows.length) return;

  const nCities = rows.length;
  const cols = Math.min(nCities, Math.max(3, Math.floor(width / 170)));
  const cellW = Math.floor(width / cols);
  const outerR = Math.min(62, cellW * 0.38);
  const innerR = outerR * 0.58;
  const cellH = outerR * 2 + 44;
  const nRows = Math.ceil(nCities / cols);
  const height = nRows * cellH + 12;

  svg.attr("height", height);

  const arc = d3.arc();
  const pie = d3.pie().value(d => d.value).sort(null);

  const maxOut = d3.max(rows, d => d.outgoing) || 1;
  const rScale = d3.scaleSqrt().domain([0, maxOut]).range([innerR * 0.85, outerR]);

  rows.forEach((d, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cx = col * cellW + cellW / 2;
    const cy = row * cellH + outerR + 10;

    const g = svg.append("g")
      .attr("transform", `translate(${cx},${cy})`)
      .attr("class", cityClass(d.city, "donut-group"));

    const selfVal = d.self || 0;
    const nonSelfVal = d.nonSelf || 0;
    const total = selfVal + nonSelfVal;
    if (total === 0) return;

    // Outer ring: total outgoing size
    const outerData = pie([{ name: "cross", value: nonSelfVal }, { name: "self", value: selfVal }]);
    const outerArc = d3.arc().innerRadius(innerR).outerRadius(outerR);

    g.selectAll("path").data(outerData).join("path")
      .attr("d", outerArc)
      .attr("fill", d => d.data.name === "self" ? colors.greenDark : colors.blue)
      .attr("opacity", 0.82)
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.5);

    // Center text: retention rate
    const rate = total > 0 ? selfVal / d.outgoing : 0;
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.2em")
      .attr("font-size", Math.max(10, outerR * 0.34))
      .attr("font-weight", "700")
      .attr("fill", colors.greenDark)
      .text(d3.format(".0%")(rate));

    // City name below
    const label = d.city === "Other" ? "Other" : d.city;
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("y", outerR + 16)
      .attr("font-size", Math.max(8, outerR * 0.26))
      .attr("fill", colors.muted)
      .text(label);

    // Tooltip
    g.on("mousemove", (event) =>
      showTooltip(event,
        `<strong>${label}</strong><br>同城留存：${formatNumber(selfVal)}<br>跨城流出：${formatNumber(nonSelfVal)}<br>留守率：${d3.format(".1%")(rate)}`))
      .on("mouseleave", hideTooltip)
      .on("click", () => selectCity(d.city));
  });

  // Legend
  drawInlineLegend(svg, [
    { label: "同城留存", color: colors.greenDark },
    { label: "跨城流出", color: colors.blue },
  ], 20, height - 4);
}

// ===== 留守率排行榜 =====
function renderRetentionRanking() {
  const svg = d3.select("#retentionRanking");
  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;
  svg.selectAll("*").remove();

  const periods = state.summary.periods;
  // Show 3 mini bar charts side by side for all 3 periods
  const panelW = Math.floor((width - 80) / 3);
  const margin = { top: 24, right: 14, bottom: 10, left: 90 };
  const barAreaW = panelW - margin.left - margin.right;

  periods.forEach((period, pi) => {
    const rows = state.retention[period];
    if (!rows) return;
    const top = rows.slice(0, 16);
    const g = svg.append("g")
      .attr("transform", `translate(${40 + pi * panelW},0)`);

    g.append("text")
      .attr("x", margin.left)
      .attr("y", 14)
      .attr("fill", colors.blueDark)
      .attr("font-size", 12)
      .attr("font-weight", "700")
      .text(period);

    const maxRate = d3.max(top, d => d.retentionRate) || 0.8;
    const x = d3.scaleLinear().domain([0, maxRate]).range([0, barAreaW]).nice();
    const y = d3.scaleBand()
      .domain(top.map(d => d.city))
      .range([margin.top, height - margin.bottom])
      .padding(0.18);

    g.append("g").attr("transform", `translate(${margin.left},0)`)
      .selectAll("rect").data(top).join("rect")
      .attr("x", 0)
      .attr("y", d => y(d.city))
      .attr("width", d => x(d.retentionRate))
      .attr("height", y.bandwidth())
      .attr("fill", d => {
        const t = d.retentionRate / maxRate;
        return d3.interpolateRgb(colors.red, colors.greenDark)(t);
      })
      .attr("opacity", d => isHighlightedCity(d.city) ? 1 : 0.78)
      .on("mousemove", (event, d) =>
        showTooltip(event,
          `<strong>${d.city}</strong><br>${period}<br>留守率：${d3.format(".1%")(d.retentionRate)}<br>同城：${formatNumber(d.self)} / 总流出：${formatNumber(d.outgoing)}`))
      .on("mouseleave", hideTooltip);

    g.append("g").selectAll("text").data(top).join("text")
      .attr("class", "bar-label")
      .attr("x", margin.left - 6)
      .attr("y", d => y(d.city) + y.bandwidth() * 0.7)
      .attr("text-anchor", "end")
      .text(d => d.city);

    g.append("g").attr("transform", `translate(${margin.left},0)`)
      .selectAll("text").data(top).join("text")
      .attr("class", "bar-value")
      .attr("x", d => Math.min(x(d.retentionRate) + 4, barAreaW - 30))
      .attr("y", d => y(d.city) + y.bandwidth() * 0.7)
      .text(d => d3.format(".0%")(d.retentionRate));
  });
}

// ===== 四象限图 =====
function renderQuadrantChart() {
  const svg = d3.select("#quadrantChart");
  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;
  svg.selectAll("*").remove();

  const period = state.period;
  const retentionRows = state.retention[period];
  const inflowRows = state.summary.netInflowRates ? state.summary.netInflowRates[period] : null;
  if (!retentionRows || !inflowRows) return;

  // Merge retention and net inflow data
  const inflowMap = {};
  inflowRows.forEach(d => { inflowMap[d.city] = d; });

  const data = retentionRows
    .map(r => {
      const inf = inflowMap[r.city];
      if (!inf || inf.total < 100) return null; // filter tiny cities from quadrant but keep in data
      if (!inf) return null;
      const node = nodeById(r.city);
      return {
        city: r.city,
        retentionRate: r.retentionRate,
        netInflowRate: inf.netInflowRate,
        totalFlow: inf.total,
        label: node ? node.label : r.city,
      };
    })
    .filter(Boolean);

  const margin = { top: 28, right: 48, bottom: 46, left: 58 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const xMed = d3.median(data, d => d.retentionRate) || 0.5;
  const xMin = d3.min(data, d => d.retentionRate) || 0;
  const xMax = d3.max(data, d => d.retentionRate) || 1;
  const xDomain = [xMin - 0.03, xMax + 0.03];
  const yMax = d3.max(data, d => Math.abs(d.netInflowRate)) || 0.3;
  const yDomain = [-yMax - 0.03, yMax + 0.03];

  const x = d3.scaleLinear().domain(xDomain).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain(yDomain).range([height - margin.bottom, margin.top]);
  const r = d3.scaleSqrt().domain([0, d3.max(data, d => d.totalFlow) || 1]).range([5, 28]);

  const plotG = svg.append("g");

  // Quadrant backgrounds
  const quadrants = [
    { x1: x(xMed), x2: x(xMax + 0.03), y1: y(0), y2: y(yDomain[1]), fill: "#d5f0e2", label: "高留守·净流入" },
    { x1: x(xDomain[0]), x2: x(xMed), y1: y(0), y2: y(yDomain[1]), fill: "#dae8fc", label: "低留守·净流入" },
    { x1: x(xDomain[0]), x2: x(xMed), y1: y(yDomain[0]), y2: y(0), fill: "#f8cecc", label: "低留守·净流出" },
    { x1: x(xMed), x2: x(xMax + 0.03), y1: y(yDomain[0]), y2: y(0), fill: "#fff2cc", label: "高留守·净流出" },
  ];

  plotG.selectAll("rect.quad").data(quadrants).join("rect")
    .attr("class", "quad")
    .attr("x", d => d.x1)
    .attr("y", d => d.y1)
    .attr("width", d => d.x2 - d.x1)
    .attr("height", d => d.y2 - d.y1)
    .attr("fill", d => d.fill)
    .attr("opacity", 0.45);

  // Median lines
  plotG.append("line")
    .attr("x1", x(xMed)).attr("x2", x(xMed))
    .attr("y1", margin.top).attr("y2", height - margin.bottom)
    .attr("stroke", "#8896a8").attr("stroke-width", 1).attr("stroke-dasharray", "5,4");
  plotG.append("line")
    .attr("x1", margin.left).attr("x2", width - margin.right)
    .attr("y1", y(0)).attr("y2", y(0))
    .attr("stroke", "#8896a8").attr("stroke-width", 1).attr("stroke-dasharray", "5,4");

  // Bubbles
  plotG.selectAll("circle").data(data).join("circle")
    .attr("class", d => cityClass(d.city, "quad-bubble"))
    .attr("cx", d => x(d.retentionRate))
    .attr("cy", d => y(d.netInflowRate))
    .attr("r", d => r(d.totalFlow))
    .attr("fill", nodeColor)
    .attr("opacity", 0.78)
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.2)
    .attr("cursor", "pointer")
    .on("click", (_, d) => selectCity(d.city))
    .on("mousemove", (event, d) =>
      showTooltip(event,
        `<strong>${d.label}</strong><br>留守率：${d3.format(".1%")(d.retentionRate)}<br>净流入率：${d3.format("+.1%")(d.netInflowRate)}<br>总流动：${formatNumber(d.totalFlow)}`))
    .on("mouseleave", hideTooltip);

  // Labels for top cities by total flow
  const topN = data.slice().sort((a, b) => b.totalFlow - a.totalFlow).slice(0, 10);
  plotG.selectAll("text.quad-label").data(topN).join("text")
    .attr("class", "quad-label")
    .attr("x", d => x(d.retentionRate) + r(d.totalFlow) + 4)
    .attr("y", d => y(d.netInflowRate) + 4)
    .attr("font-size", 10)
    .attr("fill", colors.ink)
    .text(d => d.label);

  // Axes
  svg.append("g").attr("transform", `translate(0,${y(0)})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")));
  svg.append("g").attr("transform", `translate(${x(xMed)},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("+.0%")));

  // Axis labels
  svg.append("text")
    .attr("x", margin.left + plotW / 2).attr("y", height - 4)
    .attr("text-anchor", "middle").attr("font-size", 11).attr("fill", colors.muted)
    .text("留守率 (同城留存/总流出)");
  svg.append("text")
    .attr("x", -height / 2).attr("y", 14)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle").attr("font-size", 11).attr("fill", colors.muted)
    .text("净流入率");

  // Quadrant labels
  svg.append("text").attr("x", x(xMax) - 10).attr("y", y(yDomain[1]) + 16).attr("text-anchor", "end").attr("font-size", 10).attr("fill", colors.greenDark).text("高留守·净流入");
  svg.append("text").attr("x", x(xDomain[0]) + 10).attr("y", y(yDomain[1]) + 16).attr("text-anchor", "start").attr("font-size", 10).attr("fill", colors.blueDark).text("低留守·净流入");
  svg.append("text").attr("x", x(xDomain[0]) + 10).attr("y", y(yDomain[0]) - 6).attr("text-anchor", "start").attr("font-size", 10).attr("fill", colors.red).text("低留守·净流出");
  svg.append("text").attr("x", x(xMax) - 10).attr("y", y(yDomain[0]) - 6).attr("text-anchor", "end").attr("font-size", 10).attr("fill", "#c47d10").text("高留守·净流出");
}

// ===== 差异热力图 =====
function renderDiffHeatmap() {
  const svg = d3.select("#diffHeatmap");
  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;
  svg.selectAll("*").remove();

  const dm = state.diffMatrix;
  if (!dm || !dm.cities || !dm.cities.length) return;

  const cities = dm.cities;
  const n = cities.length;
  const margin = { top: 92, right: 120, bottom: 28, left: 104 };
  const available = Math.min(width - margin.left - margin.right, height - margin.top - margin.bottom);
  const cell = Math.max(8, Math.floor(available / n));
  const inner = cell * n;

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const maxAbs = dm.maxAbsDiff || 1;
  const colorScale = d3.scaleSequential(d3.interpolateRdBu)
    .domain([maxAbs, -maxAbs]);

  const cells = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      cells.push({
        from: cities[i], to: cities[j],
        diff: dm.diffValues[i][j],
        early: dm.earlyValues[i][j],
        late: dm.lateValues[i][j],
        i, j,
      });
    }
  }

  g.selectAll("rect").data(cells).join("rect")
    .attr("class", d => matrixClass(d))
    .attr("x", d => d.j * cell).attr("y", d => d.i * cell)
    .attr("width", cell - 1).attr("height", cell - 1)
    .attr("fill", d => diffColor(d, colorScale))
    .attr("stroke", d => d.i === d.j ? "#444" : null)
    .attr("stroke-width", d => d.i === d.j ? 0.8 : 0)
    .on("mousemove", (event, d) =>
      showTooltip(event,
        `<strong>${d.from} → ${d.to}</strong><br>2009-2013：${formatNumber(d.early)}<br>2014-2018：${formatNumber(d.late)}<br>变化：${d.diff > 0 ? "+" : ""}${formatNumber(d.diff)}`))
    .on("mouseleave", hideTooltip);

  // Row labels
  g.append("g").selectAll("text").data(cities).join("text")
    .attr("class", "matrix-label")
    .attr("x", -8).attr("y", (_, i) => i * cell + cell * 0.72)
    .attr("text-anchor", "end").text(d => d);

  // Column labels
  g.append("g").selectAll("text").data(cities).join("text")
    .attr("class", "matrix-label")
    .attr("transform", (_, i) => `translate(${i * cell + cell * 0.72},-8) rotate(-58)`)
    .attr("text-anchor", "start").text(d => d);

  // Legend
  const legX = margin.left + inner + 22;
  const legY = margin.top + 8;
  const legW = 16;
  const legH = 160;
  const defs = svg.append("defs");
  const gradient = defs.append("linearGradient").attr("id", "diffLegendGrad")
    .attr("x1", "0%").attr("x2", "0%").attr("y1", "100%").attr("y2", "0%");

  const stops = [
    { offset: "0%", color: d3.interpolateRdBu(0) },
    { offset: "50%", color: d3.interpolateRdBu(0.5) },
    { offset: "100%", color: d3.interpolateRdBu(1) },
  ];
  stops.forEach(s => gradient.append("stop").attr("offset", s.offset).attr("stop-color", s.color));

  const leg = svg.append("g").attr("transform", `translate(${legX},${legY})`);

  leg.append("rect").attr("x", 0).attr("y", 0).attr("width", legW).attr("height", legH).attr("fill", "url(#diffLegendGrad)");

  leg.append("text").attr("x", legW + 6).attr("y", 10).attr("font-size", 11).attr("fill", colors.blueDark).attr("font-weight", "700").text("变化 (Late - Early)");

  const colorScaleC = d3.scaleSequential(d3.interpolateRdBu).domain([maxAbs, -maxAbs]);
  const tickValues = [maxAbs, Math.floor(maxAbs / 2), 0, -Math.floor(maxAbs / 2), -maxAbs]
    .filter((v, i, arr) => arr.indexOf(v) === i);

  tickValues.forEach(v => {
    const ty = d3.scaleLinear().domain([maxAbs, -maxAbs]).range([0, legH])(v);
    leg.append("line").attr("x1", 0).attr("x2", legW).attr("y1", ty).attr("y2", ty)
      .attr("stroke", "#fff").attr("stroke-width", 1);
    leg.append("text").attr("x", legW + 6).attr("y", ty + 4)
      .attr("font-size", 10).attr("fill", "#506176")
      .text(v > 0 ? `+${shortNumber(v)}` : shortNumber(v).replace("G", "B"));
  });

  svg.append("text")
    .attr("x", margin.left).attr("y", margin.top + inner + 18)
    .attr("font-size", 11).attr("fill", colors.muted)
    .text("行=From / 列=To；蓝色=下降，红色=上升，白色=无明显变化。对角线表示同城留存变化。");
}

function diffColor(d, colorScale) {
  if (d.i === d.j) {
    // Diagonal: retention change, use muted colors
    if (d.diff === 0) return "#eee";
    const t = Math.min(1, Math.abs(d.diff) / 50000);
    return d.diff > 0 ? d3.interpolateRgb("#e0e0e0", "#27ae60")(t) : d3.interpolateRgb("#e0e0e0", "#e74c3c")(t);
  }
  if (d.diff === 0) return "#f7f7f7";
  return colorScale(d.diff);
}

// ===== 第四幕：城市 vs 学科比较 =====
function renderComparison() {
  const totals = state.summary.periodTotals ? state.summary.periodTotals["2008-2018"] : null;
  const retention = state.summary.retentionMobility ? state.summary.retentionMobility["2008-2018"] : null;

  if (totals) {
    d3.select("#compCityTotal").text(shortNumber(totals.total).replace("G", "B"));
    d3.select("#compCityCities").text(state.nodes.length);
  }
  if (retention) {
    d3.select("#compCityRetention").text(d3.format(".1%")(retention.selfRate));
  }

  // Fetch discipline summary for comparison
  Promise.resolve(
    fetch("../../Discipline-Mobility-Visualization/data/processed/Discipline_Mobility_Network.json")
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
  ).then(data => {
    if (!data || !data.periods || !data.periods.full) return;
    const full = data.periods.full;
    const discs = full.d || [];
    const n = discs.length;
    let totalO = 0, totalS = 0, totalI = 0;
    discs.forEach(d => {
      totalO += d.o || 0;
      totalI += d.i || 0;
      totalS += d.s || 0;
    });
    const totalFlow = totalO + totalI - totalS;
    const selfRate = totalFlow > 0 ? totalS / totalFlow : 0;

    d3.select("#compDiscTotal").text(shortNumber(Math.round(totalFlow)).replace("G", "B"));
    d3.select("#compDiscCount").text(n);
    d3.select("#compDiscRetention").text(d3.format(".1%")(selfRate));
  }).catch(() => {});
}
