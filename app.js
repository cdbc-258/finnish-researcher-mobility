/* ================================================================
   芬兰科研人员流动可视化 — 单页叙事 + 导航跳转
   City Mobility + Discipline Mobility + Cross-Analysis
   ================================================================ */

// ===== NAV HIGHLIGHT & LAZY RENDER =====
(function() {
  const nav = document.getElementById('topnav');
  const navLinks = document.querySelectorAll('.topnav__link');
  const sceneIds = ['hero', 'scene1', 'scene2', 'scene3', 'scene4', 'final'];

  // Shadow on nav when scrolled
  window.addEventListener('scroll', () => {
    nav.classList.toggle('topnav--shadowed', window.scrollY > 20);
  }, { passive: true });

  // Intersection Observer — highlight active nav link
  const observer = new IntersectionObserver(entries => {
    let best = null;
    entries.forEach(e => {
      if (e.isIntersecting) {
        if (!best || e.boundingClientRect.top < best.boundingClientRect.top) {
          best = e;
        }
      }
    });
    if (best) {
      const id = best.target.id;
      navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === '#' + id);
      });
    }
  }, { threshold: 0.25, rootMargin: '-60px 0px -40% 0px' });

  sceneIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });

  // ===== Lazy render comparison when Scene 4 enters view =====
  let comparisonRendered = false;

  function tryRenderComparison() {
    if (!comparisonRendered
        && typeof CityViz !== 'undefined' && CityViz.initialized
        && typeof DiscViz !== 'undefined' && DiscViz.initialized) {
      comparisonRendered = true;
      renderComparisonContent();
      DiscViz.renderViewTo('diff_heatmap', 'discDiffFull');
    }
  }

  const scene4Observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      tryRenderComparison();
      scene4Observer.unobserve(entries[0].target);
    }
  }, { threshold: 0.05 });
  const scene4El = document.getElementById('scene4');
  if (scene4El) scene4Observer.observe(scene4El);

  let pollCount = 0;
  const pollInterval = setInterval(() => {
    pollCount++;
    if (typeof CityViz !== 'undefined' && CityViz.initialized
        && typeof DiscViz !== 'undefined' && DiscViz.initialized) {
      clearInterval(pollInterval);
      tryRenderComparison();
    } else if (pollCount > 300) {
      clearInterval(pollInterval);
    }
  }, 100);

  function renderComparisonContent() {
    const cityTotals = CityViz.getSummary();
    const discTotals = DiscViz.getSummary();
    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    if (cityTotals) {
      setEl('compCityTotal', cityTotals.total);
      setEl('compCityRetention', cityTotals.retention);
      setEl('compCityCities', cityTotals.n);
    }
    if (discTotals) {
      setEl('compDiscTotal', discTotals.total);
      setEl('compDiscRetention', discTotals.retention);
      setEl('compDiscCount', discTotals.n);
    }
    renderCompCityNetwork();
    renderCompDiscHeatmap();
  }

  function renderCompCityNetwork() {
    const svg = d3.select('#compCityNetwork');
    const width = svg.node().clientWidth || 500;
    const height = svg.node().clientHeight || 300;
    svg.selectAll('*').remove();
    const data = CityViz.getNetworkData();
    if (!data) { svg.append('text').attr('x',width/2).attr('y',height/2).attr('text-anchor','middle').attr('fill','#999').text('加载中…'); return; }
    const { nodes, links } = data;
    const r = d3.scaleSqrt().domain([0, d3.max(nodes, d => d.total) || 1]).range([5, 22]);
    const lw = d3.scaleSqrt().domain([0, d3.max(links, d => d.value) || 1]).range([0.6, 6]);
    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(60))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width/2, height/2))
      .force('collide', d3.forceCollide(d => r(d.total) + 8));
    const link = svg.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', '#4a8c5c').attr('stroke-opacity',0.4)
      .attr('stroke-width', d => lw(d.value));
    const node = svg.append('g').selectAll('circle').data(nodes).join('circle')
      .attr('r', d => r(d.total))
      .attr('fill', d => d.type === 'inflow' ? '#2b5ea7' : d.type === 'outflow' ? '#c0392b' : '#4a8c5c')
      .attr('stroke', '#fff').attr('stroke-width', 1);
    const label = svg.append('g').selectAll('text').data(nodes).join('text')
      .attr('font-size', 9).attr('fill', '#1a3a6e').text(d => d.id);
    sim.on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('cx', d => d.x).attr('cy', d => d.y);
      label.attr('x', d => d.x + r(d.total) + 3).attr('y', d => d.y + 3);
    });
  }

  function renderCompDiscHeatmap() {
    const svg = d3.select('#compDiscHeatmap');
    const width = svg.node().clientWidth || 500;
    const height = svg.node().clientHeight || 300;
    svg.selectAll('*').remove();
    const data = DiscViz.getHeatmapData();
    if (!data) { svg.append('text').attr('x',width/2).attr('y',height/2).attr('text-anchor','middle').attr('fill','#999').text('加载中…'); return; }
    const { categories, matrix } = data;
    const n = categories.length;
    const cell = Math.max(8, Math.min(32, Math.floor((Math.min(width, height) - 100) / n)));
    const margin = { top: 70, left: 120, bottom: 16, right: 16 };
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const maxVal = d3.max(matrix.flat()) || 1;
    const logMax = Math.log(maxVal + 1);
    const colorFn = v => d3.interpolateRgb('#f7f7f7', '#08306b')(Math.pow(Math.log(v+1)/logMax, 0.6));
    g.selectAll('rect').data(d3.cross(d3.range(n), d3.range(n))).join('rect')
      .attr('x', ([,j]) => j*cell).attr('y', ([i]) => i*cell)
      .attr('width', cell-1).attr('height', cell-1)
      .attr('fill', ([i,j]) => colorFn(matrix[i][j]));
    g.selectAll('.rl').data(categories).join('text')
      .attr('x', -6).attr('y', (_,i) => i*cell+cell*0.7)
      .attr('text-anchor', 'end').attr('font-size', 8).attr('fill', '#4a5568').text(d => d);
    g.selectAll('.cl').data(categories).join('text')
      .attr('transform', (_,i) => `translate(${i*cell+cell*0.7},-6) rotate(-55)`)
      .attr('text-anchor', 'start').attr('font-size', 8).attr('fill', '#4a5568').text(d => d);
  }
})();

// ===== CITY MOBILITY MODULE =====
const CityViz = (function() {
  const state = {
    period: "2008-2018", topN: 50, showSelf: false, direction: "all",
    selectedCity: null, searchTerm: "",
    nodes: [], links: {}, matrix: {}, summary: {}, projection: null, retention: {}, diffMatrix: {}
  };
  const DATA_BASE = 'city-mobility-visualization/B/data/';
  const colors = {
    blue: "#3f73c9", blueDark: "#1a3a6e", green: "#66b96e", greenDark: "#27845b",
    red: "#d55a4f", gray: "#657386", pale: "#eef3f8", ink: "#1d2733", muted: "#657386"
  };
  // highlight color for core city (赫尔辛基)
  colors.core = "#c47d10";
  const fmt = d3.format(","), shortNum = d3.format(".3s");
  let initialized = false;

  const ttip = d3.select("#tooltip");

  function showTT(ev, html) {
    ttip.attr("hidden", null).style("left", (ev.clientX+14)+"px").style("top", (ev.clientY+14)+"px").html(html);
  }
  function hideTT() { ttip.attr("hidden", true); }

  // ===== Data Loading =====
  function init() {
    return Promise.all([
      d3.json(DATA_BASE + "city_nodes.json"),
      d3.json(DATA_BASE + "city_links.json"),
      d3.json(DATA_BASE + "city_matrix.json"),
      d3.json(DATA_BASE + "city_summary.json"),
      d3.json(DATA_BASE + "city_retention.json"),
      d3.json(DATA_BASE + "city_diff_matrix.json"),
    ]).then(([nodes, links, matrix, summary, retention, diffMatrix]) => {
      state.nodes = nodes; state.links = links; state.matrix = matrix;
      state.summary = summary; state.retention = retention; state.diffMatrix = diffMatrix;
      initialized = true;
      setupControls();
      renderAll();
    });
  }

  // ===== Controls =====
  function setupControls() {
    const periods = state.summary.periods;
    d3.selectAll(".period-controls").each(function() {
      const container = d3.select(this);
      container.selectAll("button").data(periods).join("button")
        .attr("class", d => d === state.period ? "active" : null).text(d => d)
        .on("click", (_, p) => { state.period = p; renderAll(); });
    });

    d3.select("#topNSelect").on("change", ev => { state.topN = +ev.target.value; renderAll(); });
    d3.select("#selfLoopToggle").on("change", ev => { state.showSelf = ev.target.checked; renderAll(); });
    d3.select("#directionControls").selectAll("button").on("click", function() { state.direction = this.dataset.direction; renderAll(); });

    d3.select("#cityOptions").selectAll("option").data(state.nodes.map(d => d.id).sort()).join("option").attr("value", d => d);
    d3.select("#citySearch").on("input", ev => {
      const val = ev.target.value.trim();
      state.searchTerm = val;
      const match = state.nodes.find(n => n.id.toLowerCase() === val.toLowerCase());
      state.selectedCity = match ? match.id : val || null;
      renderAll();
    });
    d3.select("#resetButton").on("click", () => {
      state.period = "2008-2018"; state.topN = 50; state.showSelf = false;
      state.direction = "all"; state.selectedCity = null; state.searchTerm = "";
      d3.select("#citySearch").property("value", "");
      d3.select("#topNSelect").property("value", "50");
      d3.select("#selfLoopToggle").property("checked", false);
      renderAll();
    });
  }

  // ===== Helpers =====
  function currentLinks() {
    const base = [...state.links[state.period]]
      .filter(l => state.showSelf || !l.isSelf)
      .sort((a, b) => d3.descending(a.value, b.value))
      .slice(0, state.topN);
    if (!state.selectedCity || !knownCity(state.selectedCity)) return base;
    if (state.direction === "incoming") return base.filter(l => l.target === state.selectedCity);
    if (state.direction === "outgoing") return base.filter(l => l.source === state.selectedCity);
    return base.filter(l => l.source === state.selectedCity || l.target === state.selectedCity);
  }
  function knownCity(c) { return state.nodes.some(n => n.id === c); }
  function isHighlightedCity(c) { return state.selectedCity ? c.toLowerCase().includes(state.selectedCity.toLowerCase()) : false; }
  function nodeById(id) { return state.nodes.find(n => n.id === id); }
  function nodeColor(n) { return n.type === "inflow" ? colors.blue : n.type === "outflow" ? colors.red : colors.green; }
  function nodeColor(n) {
    if (!n) return colors.gray;
    if (n.id === "Helsinki" || (n.label && n.label.indexOf('Helsinki') >= 0) || (n.label && n.label.indexOf('赫尔辛基')>=0)) return colors.core;
    return n.type === "inflow" ? colors.blue : n.type === "outflow" ? colors.red : colors.green;
  }
  function selectCity(c) { state.selectedCity = state.selectedCity === c ? null : c; d3.select("#citySearch").property("value", state.selectedCity || ""); renderAll(); }
  function linkClass(l, base) {
    const active = state.selectedCity && (l.source === state.selectedCity || l.target === state.selectedCity);
    return base + (active ? " active" : "") + (state.selectedCity && knownCity(state.selectedCity) && !active ? " dimmed" : "");
  }
  function cityClass(c, base) {
    const active = isHighlightedCity(c);
    return base + (active ? " active" : "") + (state.selectedCity && knownCity(state.selectedCity) && !active ? " dimmed" : "") + (c==="Helsinki"?" core-city":"");
  }
  function matrixClass(cell) {
    const active = state.selectedCity && (cell.from === state.selectedCity || cell.to === state.selectedCity);
    return "matrix-cell" + (active ? " active" : "") + (state.selectedCity && knownCity(state.selectedCity) && !active ? " dimmed" : "");
  }

  // ===== Render All =====
  function renderAll() {
    d3.selectAll(".period-controls").selectAll("button").classed("active", d => d === state.period);
    d3.select("#directionControls").selectAll("button").classed("active", function() { return this.dataset.direction === state.direction; });
    renderPeriodStats(); renderFindings(); renderMap(); renderNetwork();
    renderMatrix(); renderBars(); renderTrendAndTopLinks(); renderMetricCharts();
    renderRetentionDonuts(); renderRetentionRanking(); renderQuadrantChart();
    renderDiffHeatmap(); renderComparison();
  }

  function renderPeriodStats() {
    const totals = state.summary.periodTotals[state.period];
    const stats = [{label:"总流动次数",value:totals.total},{label:"跨城流动",value:totals.nonSelf},{label:"同城留存",value:totals.self}];
    d3.select("#periodStats").selectAll(".stat-item").data(stats).join("div").attr("class","stat-item")
      .html(d => `<strong>${fmt(d.value)}</strong><span>${d.label}</span>`);
  }
  function renderFindings() {
    d3.select("#findings").selectAll("li").data(state.summary.findings).join("li").text(d => d);
  }

  // ===== Map =====
  function renderMap() {
    const svg = d3.select("#mapChart"), width = svg.node().clientWidth, height = svg.node().clientHeight;
    svg.selectAll("*").remove();
    const defs = svg.append("defs");
    ["flowArrow","flowArrowStrong"].forEach(id => {
      const a = defs.append("marker").attr("id",id).attr("viewBox","0 -5 10 10").attr("refX",9).attr("refY",0).attr("markerWidth",id==="flowArrow"?7:4.8).attr("markerHeight",id==="flowArrow"?7:4.8).attr("orient","auto");
      a.append("path").attr("d","M0,-5L10,0L0,5").attr("fill",colors.greenDark);
    });
    const projection = d3.geoMercator().center([25.7,62.1]).scale(Math.min(width*2.45,height*3.05)).translate([width*0.48,height*0.53]);
    state.projection = projection;
    drawFallbackFinland(svg, projection);
    const links = currentLinks();
    const radius = d3.scaleSqrt().domain([0,d3.max(state.nodes,d=>d.total)]).range([4.2,18]);
    const wScale = d3.scaleSqrt().domain([0,d3.max(links,d=>d.value)||1]).range([0.9,10]);

    svg.append("g").selectAll("path").data(links).join("path")
      .attr("class", d => linkClass(d,"flow-line"))
      .attr("d", d => mapLinkPath(d, projection))
      .attr("stroke-width", d => wScale(d.value))
      .attr("opacity", d => d.isSelf?0.45:0.58)
      .attr("marker-end", d => d.isSelf?null:mapArrowMarker(wScale(d.value)))
      .on("mousemove", (ev,d) => showTT(ev,`<strong>${d.source} → ${d.target}</strong><br>${state.period}<br>流动次数：${fmt(d.value)}`))
      .on("mouseleave", hideTT);

    const cg = svg.append("g").selectAll("g").data(state.nodes).join("g")
      .attr("transform", d => `translate(${projectCity(d,projection)})`)
      .attr("class", d => cityClass(d.id,"map-city"))
      .on("click", (_,d) => selectCity(d.id))
      .on("mousemove", (ev,d) => showTT(ev,`<strong>${d.id}</strong><br>总流动：${fmt(d.total)}<br>流入：${fmt(d.incoming)}<br>流出：${fmt(d.outgoing)}<br>排名：${d.rank}`))
      .on("mouseleave", hideTT);
    cg.append("circle").attr("class","city-node").attr("r", d => radius(d.total) * (d.id==="Helsinki"?1.4:1)).attr("fill", nodeColor);
    cg.append("text").attr("class","city-label").attr("x", d => radius(d.total) * (d.id==="Helsinki"?1.4:1) + 4).attr("y",4).text(d => d.label);

    svg.append("text").attr("x",8).attr("y",height-10).attr("fill",colors.gray).attr("font-size",11)
      .text("注：Other 为其他地区虚拟节点；底图为简化示意。");
  }

  function drawFallbackFinland(svg, projection) {
    const outline = {type:"Polygon",coordinates:[[[20.55,59.72],[22.2,60.15],[23.7,60.18],[25.2,60.05],[26.6,60.35],[28.6,60.55],[30.05,61.28],[30.15,62.35],[29.32,63.45],[30.1,64.9],[29.65,66.1],[29.05,67.35],[28.5,68.8],[27.7,69.7],[25.8,70.1],[23.7,68.85],[22.4,67.7],[23.1,66.4],[24.0,65.25],[23.15,64.0],[22.25,62.6],[21.2,61.45],[20.55,59.72]]]};
    svg.append("path").datum(outline).attr("class","country").attr("d",d3.geoPath(projection));
    const lakes = [{lon:27.7,lat:62.4,r:12},{lon:25.4,lat:62.3,r:9},{lon:28.2,lat:61.8,r:8}];
    svg.append("g").selectAll("circle").data(lakes).join("circle")
      .attr("cx", d => projection([d.lon,d.lat])[0]).attr("cy", d => projection([d.lon,d.lat])[1])
      .attr("r", d => d.r).attr("fill","#d9eaf7").attr("opacity",0.75);
  }
  function projectCity(city, projection) {
    if (city.id === "Other") { const w = d3.select("#mapChart").node().clientWidth, h = d3.select("#mapChart").node().clientHeight; return [w-95, h-85]; }
    return projection([city.lon, city.lat]);
  }
  function mapLinkPath(l, proj) {
    const [sx,sy] = projectCity(nodeById(l.source),proj), [tx,ty] = projectCity(nodeById(l.target),proj);
    if (l.isSelf) { const r=14; return `M${sx},${sy}c${r},-${r*1.4} ${r*2.2},${r*1.4} 0,${r*1.8}`; }
    const dx=tx-sx, dy=ty-sy, dr=Math.sqrt(dx*dx+dy*dy);
    if (!dr) return `M${sx},${sy}L${tx},${ty}`;
    const curve = Math.max(28,Math.min(130,dr*0.26));
    const mx=(sx+tx)/2-(dy/dr)*curve, my=(sy+ty)/2+(dx/dr)*curve;
    return `M${sx},${sy}Q${mx},${my} ${tx},${ty}`;
  }
  function mapArrowMarker(sw) { return sw>=8.8?"url(#flowArrowStrong)":"url(#flowArrow)"; }

  // ===== Network =====
  function renderNetwork() {
    const svg = d3.select("#networkChart"), width = svg.node().clientWidth, height = svg.node().clientHeight;
    svg.selectAll("*").remove();
    const links = currentLinks().filter(d => !d.isSelf);
    const included = new Set(links.flatMap(d => [d.source, d.target]));
    if (knownCity(state.selectedCity)) included.add(state.selectedCity);
    const nodes = state.nodes.filter(n => included.has(n.id)).map(n => ({...n}));
    const nodeIds = new Set(nodes.map(d => d.id));
    const netLinks = links.filter(l => nodeIds.has(l.source) && nodeIds.has(l.target)).map(l => ({...l}));

    const lw = d3.scaleSqrt().domain([0,d3.max(netLinks,d=>d.value)||1]).range([0.6,7]);
    const radius = d3.scaleSqrt().domain([0,d3.max(state.nodes,d=>d.total)]).range([5,22]);
    const sim = d3.forceSimulation(nodes)
      .force("link",d3.forceLink(netLinks).id(d=>d.id).distance(d=>70+120*(1-(d.normalized||0))))
      .force("charge",d3.forceManyBody().strength(-280))
      .force("center",d3.forceCenter(width/2,height/2))
      .force("collide",d3.forceCollide(d=>radius(d.total)+18));

    const link = svg.append("g").selectAll("line").data(netLinks).join("line")
      .attr("class",d=>linkClass(d,"network-link")).attr("stroke-width",d=>lw(d.value)).attr("opacity",0.62)
      .on("mousemove",(ev,d)=>showTT(ev,`<strong>${d.source.id||d.source} → ${d.target.id||d.target}</strong><br>流动次数：${fmt(d.value)}`)).on("mouseleave",hideTT);

    const node = svg.append("g").selectAll("circle").data(nodes).join("circle")
      .attr("class",d=>cityClass(d.id,"node")).attr("r",d=>radius(d.total) * (d.id==="Helsinki"?1.35:1)).attr("fill",nodeColor)
      .call(d3.drag().on("start",(ev,d)=>{if(!ev.active)sim.alphaTarget(0.3).restart();d.fx=d.x;d.fy=d.y;})
        .on("drag",(ev,d)=>{d.fx=ev.x;d.fy=ev.y;}).on("end",(ev,d)=>{if(!ev.active)sim.alphaTarget(0);d.fx=null;d.fy=null;}))
      .on("click",(_,d)=>selectCity(d.id))
      .on("mousemove",(ev,d)=>showTT(ev,`<strong>${d.id}</strong><br>中心性：${d.centrality}<br>净流动：${fmt(d.net)}`)).on("mouseleave",hideTT);

    const label = svg.append("g").selectAll("text").data(nodes).join("text")
      .attr("class","network-label").text(d=>d.id);

    sim.on("tick",()=>{
      link.attr("x1",d=>d.source.x).attr("y1",d=>d.source.y).attr("x2",d=>d.target.x).attr("y2",d=>d.target.y);
      node.attr("cx",d=>d.x).attr("cy",d=>d.y);
      label.attr("x",d=>d.x+radius(d.total)+4).attr("y",d=>d.y+4);
    });
  }

  // ===== Matrix =====
  function renderMatrix() {
    const svg = d3.select("#matrixChart"), width = svg.node().clientWidth, height = svg.node().clientHeight;
    svg.selectAll("*").remove();
    const data = state.matrix[state.period], cities = data.cities, values = data.values;
    const hasSideLegend = width >= 760;
    const margin = {top:92,right:hasSideLegend?214:12,bottom:hasSideLegend?18:132,left:104};
    const available = Math.min(width-margin.left-margin.right, height-margin.top-margin.bottom);
    const cell = Math.max(9, Math.floor(available/cities.length));
    const inner = cell * cities.length;
    const neededH = hasSideLegend
      ? margin.top + inner + margin.bottom + 20
      : margin.top + inner + 40 + 100;
    svg.attr("height", Math.max(height, neededH));
    const g = svg.append("g").attr("transform",`translate(${margin.left},${margin.top})`);
    const maxLog = Math.log1p(data.maxValue);
    const cs = d3.scaleSequential(d3.interpolateYlGnBu).domain([0,maxLog]);

    const rows = []; values.forEach((row,i)=>{row.forEach((v,j)=>{rows.push({from:cities[i],to:cities[j],value:v,i,j});});});
    g.selectAll("rect").data(rows).join("rect")
      .attr("class",d=>matrixClass(d)).attr("x",d=>d.j*cell).attr("y",d=>d.i*cell)
      .attr("width",cell-1).attr("height",cell-1)
      .attr("fill",d=>d.i===d.j?(d.value===0?"#f2aaa3":"#63b96f"):(d.value===0?"#df6a60":cs(Math.log1p(d.value))))
      .on("mousemove",(ev,d)=>showTT(ev,`<strong>${d.from} → ${d.to}</strong><br>${state.period}<br>次数：${fmt(d.value)}`)).on("mouseleave",hideTT);
    // labels
    g.append("g").selectAll("text").data(cities).join("text").attr("class","matrix-label").attr("x",-8).attr("y",(_,i)=>i*cell+cell*0.72).attr("text-anchor","end").text(d=>d);
    g.append("g").selectAll("text").data(cities).join("text").attr("class","matrix-label").attr("transform",(_,i)=>`translate(${i*cell+cell*0.72},-8) rotate(-58)`).attr("text-anchor","start").text(d=>d);
    const legendY = hasSideLegend ? margin.top + 6 : margin.top + inner + 18;
    drawMatrixLegend(svg,{colorScale:cs,maxValue:data.maxValue,x:hasSideLegend?margin.left+inner+32:margin.left,y:legendY,width:hasSideLegend?148:Math.min(260,width-margin.left-16)});
    const noteY = hasSideLegend ? margin.top + inner + 16 : legendY + 95;
    svg.append("text").attr("x",margin.left).attr("y",noteY).attr("fill",colors.gray).attr("font-size",11).text("行=From，列=To；绿对角线=同城留存，红=零值或弱连接。");
  }

  function drawMatrixLegend(svg, cfg) {
    const legH=12, gradId="matrixLegendGradient";
    const maxLog=Math.log1p(cfg.maxValue);
    const defs=svg.append("defs"), grad=defs.append("linearGradient").attr("id",gradId).attr("x1","0%").attr("x2","100%").attr("y1","0%").attr("y2","0%");
    d3.range(0,1.01,0.1).forEach(t=>{grad.append("stop").attr("offset",`${t*100}%`).attr("stop-color",cfg.colorScale(t*maxLog));});
    const leg=svg.append("g").attr("class","matrix-legend").attr("transform",`translate(${cfg.x},${cfg.y})`);
    leg.append("text").attr("class","matrix-legend-title").attr("x",0).attr("y",0).text("迁移次数 Times");
    leg.append("rect").attr("x",0).attr("y",12).attr("width",cfg.width).attr("height",legH).attr("fill",`url(#${gradId})`);
    const tvs=[1,1000,10000,100000,cfg.maxValue].filter(v=>v<=cfg.maxValue), tScale=d3.scaleLinear().domain([0,maxLog]).range([0,cfg.width]);
    leg.append("g").selectAll("line").data(tvs).join("line").attr("x1",d=>tScale(Math.log1p(d))).attr("x2",d=>tScale(Math.log1p(d))).attr("y1",24).attr("y2",29).attr("stroke","#506176");
    leg.append("g").selectAll("text").data(tvs).join("text").attr("class","matrix-legend-tick").attr("x",d=>tScale(Math.log1p(d))).attr("y",42).attr("text-anchor",(d,i)=>i===0?"start":i===tvs.length-1?"end":"middle").text(d=>d>=1e6?d3.format(".2s")(d).replace("G","B"):d>=1000?d3.format(".0s")(d):`${d}`);
    [{label:"零值/弱连接",color:"#df6a60"},{label:"同城留存",color:"#63b96f"}].forEach((sw,i)=>{
      const sg=leg.append("g").attr("transform",`translate(0,${60+i*21})`);
      sg.append("rect").attr("width",14).attr("height",14).attr("fill",sw.color);
      sg.append("text").attr("class","matrix-legend-note").attr("x",21).attr("y",11).text(sw.label);
    });
  }

  // ===== Bars =====
  function renderBars() {
    const links = state.links[state.period];
    const incoming = d3.rollups(links, rows => d3.sum(rows, d => d.value), d => d.target);
    const outgoing = d3.rollups(links, rows => d3.sum(rows, d => d.value), d => d.source);
    drawBarChart("#incomingBars", incoming, "总流入排行", colors.blue);
    drawBarChart("#outgoingBars", outgoing, "总流出排行", colors.greenDark);
  }

  function drawBarChart(sel, values, title, color) {
    const svg = d3.select(sel), width = svg.node().clientWidth, height = svg.node().clientHeight;
    svg.selectAll("*").remove();
    const top = values.map(([city,value]) => ({city,value})).sort((a,b)=>d3.descending(a.value,b.value)).slice(0,8);
    const margin = {top:28,right:58,bottom:14,left:92};
    const x = d3.scaleLinear().domain([0,d3.max(top,d=>d.value)||1]).range([0,width-margin.left-margin.right]);
    const y = d3.scaleBand().domain(top.map(d=>d.city)).range([margin.top,height-margin.bottom]).padding(0.26);

    svg.append("text").attr("x",0).attr("y",15).attr("fill",colors.blueDark).attr("font-size",13).attr("font-weight",700).text(title);
    svg.append("g").attr("transform",`translate(${margin.left},0)`).selectAll("rect").data(top).join("rect")
      .attr("x",0).attr("y",d=>y(d.city)).attr("width",d=>x(d.value)).attr("height",y.bandwidth())
      .attr("fill",color).attr("opacity",d=>isHighlightedCity(d.city)?1:0.82)
      .on("mousemove",(ev,d)=>showTT(ev,`<strong>${d.city}</strong><br>${title}：${fmt(d.value)}`)).on("mouseleave",hideTT);
    svg.append("g").selectAll("text").data(top).join("text").attr("class","bar-label")
      .attr("x",margin.left-8).attr("y",d=>y(d.city)+y.bandwidth()*0.68).attr("text-anchor","end").text(d=>d.city);
    svg.append("g").attr("transform",`translate(${margin.left},0)`).selectAll("text").data(top).join("text")
      .attr("class","bar-value").attr("x",d=>x(d.value)+5).attr("y",d=>y(d.city)+y.bandwidth()*0.68).text(d=>shortNum(d.value).replace("G","B"));
  }

  // ===== Trend & Top Links =====
  function renderTrendAndTopLinks() {
    const svg = d3.select("#trendChart"), width = svg.node().clientWidth, height = svg.node().clientHeight;
    svg.selectAll("*").remove();
    const periods = state.summary.periods;
    const data = periods.map(p => ({period:p, value:state.summary.periodTotals[p].nonSelf}));
    const margin = {top:18,right:18,bottom:32,left:58};
    const x = d3.scaleBand().domain(periods).range([margin.left,width-margin.right]).padding(0.28);
    const y = d3.scaleLinear().domain([0,d3.max(data,d=>d.value)||1]).nice().range([height-margin.bottom,margin.top]);

    svg.append("g").selectAll("rect").data(data).join("rect")
      .attr("x",d=>x(d.period)).attr("y",d=>y(d.value)).attr("width",x.bandwidth()).attr("height",d=>y(0)-y(d.value))
      .attr("fill",d=>d.period===state.period?colors.blue:"#9bb7df");
    const line = d3.line().x(d=>x(d.period)+x.bandwidth()/2).y(d=>y(d.value));
    svg.append("path").datum(data).attr("d",line).attr("fill","none").attr("stroke","#111").attr("stroke-width",1.6);
    svg.append("g").attr("transform",`translate(0,${height-margin.bottom})`).call(d3.axisBottom(x).tickSizeOuter(0));
    svg.append("g").attr("transform",`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(shortNum));

    const top = state.links[state.period].filter(d=>!d.isSelf).sort((a,b)=>d3.descending(a.value,b.value)).slice(0,6);
    d3.select("#topLinks").selectAll(".link-row").data(top).join("div").attr("class","link-row")
      .html(d=>`<strong>${d.source} → ${d.target}</strong><span>${state.period}：${fmt(d.value)}</span>`);
  }

  // ===== Metric Charts =====
  function renderMetricCharts() { drawRetentionBars(); drawNetRateChart(); drawAsymmetryChart(); drawHerfindahlChart(); drawCommunityChart(); }

  function drawRetentionBars() {
    const svg = d3.select("#retentionBars"), width = svg.node().clientWidth, height = svg.node().clientHeight;
    svg.selectAll("*").remove();
    const periods = state.summary.periods;
    const data = periods.flatMap(p => {
      const item = state.summary.retentionMobility[p];
      return [{period:p,type:"同城留存",value:item.self,rate:item.selfRate},{period:p,type:"跨城流动",value:item.nonSelf,rate:item.nonSelfRate}];
    });
    const margin = {top:22,right:20,bottom:42,left:58};
    const x0 = d3.scaleBand().domain(periods).range([margin.left,width-margin.right]).paddingInner(0.2);
    const x1 = d3.scaleBand().domain(["同城留存","跨城流动"]).range([0,x0.bandwidth()]).padding(0.08);
    const y = d3.scaleLinear().domain([0,d3.max(data,d=>d.value)||1]).nice().range([height-margin.bottom,margin.top]);
    const color = d3.scaleOrdinal().domain(["同城留存","跨城流动"]).range([colors.greenDark,colors.blue]);

    svg.append("g").selectAll("rect").data(data).join("rect")
      .attr("x",d=>x0(d.period)+x1(d.type)).attr("y",d=>y(d.value)).attr("width",x1.bandwidth()).attr("height",d=>y(0)-y(d.value))
      .attr("fill",d=>color(d.type)).attr("opacity",d=>d.period===state.period?0.95:0.52)
      .on("mousemove",(ev,d)=>showTT(ev,`<strong>${d.period} ${d.type}</strong><br>次数：${fmt(d.value)}<br>占比：${d3.format(".1%")(d.rate)}`)).on("mouseleave",hideTT);
    svg.append("g").attr("transform",`translate(0,${height-margin.bottom})`).call(d3.axisBottom(x0).tickSizeOuter(0));
    svg.append("g").attr("transform",`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(shortNum));
    drawInlineLegend(svg,[{label:"同城留存",color:colors.greenDark},{label:"跨城流动",color:colors.blue}],margin.left,10);
  }

  function drawInlineLegend(svg,items,x,y) {
    const legend = svg.append("g").attr("transform",`translate(${x},${y})`);
    const group = legend.selectAll("g").data(items).join("g").attr("transform",(_,i)=>`translate(${i*82},0)`);
    group.append("rect").attr("width",10).attr("height",10).attr("fill",d=>d.color);
    group.append("text").attr("class","bar-value").attr("x",15).attr("y",9).text(d=>d.label);
  }

  function drawNetRateChart() {
    const svg = d3.select("#netRateChart"), width = svg.node().clientWidth, height = svg.node().clientHeight;
    svg.selectAll("*").remove();
    const data = state.summary.netInflowRates[state.period].filter(d=>d.total>500)
      .sort((a,b)=>d3.descending(a.absRate,b.absRate)).slice(0,10).sort((a,b)=>d3.ascending(a.netInflowRate,b.netInflowRate));
    const margin = {top:18,right:48,bottom:34,left:92};
    const maxAbs = d3.max(data,d=>Math.abs(d.netInflowRate))||0.05;
    const x = d3.scaleLinear().domain([-maxAbs,maxAbs]).range([margin.left,width-margin.right]);
    const y = d3.scaleBand().domain(data.map(d=>d.city)).range([margin.top,height-margin.bottom]).padding(0.28);
    svg.append("line").attr("class","zero-line").attr("x1",x(0)).attr("x2",x(0)).attr("y1",margin.top).attr("y2",height-margin.bottom);
    svg.append("g").selectAll("rect").data(data).join("rect")
      .attr("x",d=>Math.min(x(0),x(d.netInflowRate))).attr("y",d=>y(d.city))
      .attr("width",d=>Math.abs(x(d.netInflowRate)-x(0))).attr("height",y.bandwidth())
      .attr("fill",d=>d.netInflowRate>=0?colors.blue:colors.red)
      .on("mousemove",(ev,d)=>showTT(ev,`<strong>${d.city}</strong><br>净流入率：${d3.format("+.2%")(d.netInflowRate)}<br>净流动：${fmt(d.net)}`)).on("mouseleave",hideTT);
    svg.append("g").attr("transform",`translate(0,${height-margin.bottom})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("+.0%")));
    svg.append("g").selectAll("text").data(data).join("text").attr("class","bar-label").attr("x",margin.left-8).attr("y",d=>y(d.city)+y.bandwidth()*0.68).attr("text-anchor","end").text(d=>d.city);
  }

  function drawAsymmetryChart() {
    const svg = d3.select("#asymmetryChart"), width = svg.node().clientWidth, height = svg.node().clientHeight;
    svg.selectAll("*").remove();
    const data = state.summary.asymmetryPairs[state.period].filter(d=>d.total>=1000)
      .sort((a,b)=>d3.descending(a.absAsymmetry,b.absAsymmetry)).slice(0,9).sort((a,b)=>d3.ascending(a.asymmetry,b.asymmetry));
    const margin = {top:18,right:56,bottom:34,left:132};
    const x = d3.scaleLinear().domain([-1,1]).range([margin.left,width-margin.right]);
    const y = d3.scaleBand().domain(data.map(d=>`${d.cityA}-${d.cityB}`)).range([margin.top,height-margin.bottom]).padding(0.26);
    svg.append("line").attr("class","zero-line").attr("x1",x(0)).attr("x2",x(0)).attr("y1",margin.top).attr("y2",height-margin.bottom);
    svg.append("g").selectAll("rect").data(data).join("rect")
      .attr("x",d=>Math.min(x(0),x(d.asymmetry))).attr("y",d=>y(`${d.cityA}-${d.cityB}`))
      .attr("width",d=>Math.abs(x(d.asymmetry)-x(0))).attr("height",y.bandwidth())
      .attr("fill",d=>d.asymmetry>=0?colors.blue:colors.greenDark)
      .on("mousemove",(ev,d)=>showTT(ev,`<strong>${d.cityA}/${d.cityB}</strong><br>不对称指数：${d3.format("+.2f")(d.asymmetry)}<br>主导方向：${d.dominant}<br>总量：${fmt(d.total)}`)).on("mouseleave",hideTT);
    svg.append("g").attr("transform",`translate(0,${height-margin.bottom})`).call(d3.axisBottom(x).ticks(5));
    svg.append("g").selectAll("text").data(data).join("text").attr("class","bar-label").attr("x",margin.left-8).attr("y",d=>y(`${d.cityA}-${d.cityB}`)+y.bandwidth()*0.68).attr("text-anchor","end").text(d=>`${d.cityA}-${d.cityB}`);
  }

  function drawHerfindahlChart() {
    const svg = d3.select("#hhiChart"), width = svg.node().clientWidth, height = svg.node().clientHeight;
    svg.selectAll("*").remove();
    const data = state.summary.herfindahlOutgoing[state.period].filter(d=>d.outgoingNonSelf>=1000).slice(0,10).sort((a,b)=>d3.ascending(a.hhi,b.hhi));
    const margin = {top:18,right:68,bottom:34,left:104};
    const x = d3.scaleLinear().domain([0,1]).range([margin.left,width-margin.right]);
    const y = d3.scaleBand().domain(data.map(d=>d.city)).range([margin.top,height-margin.bottom]).padding(0.28);
    svg.append("g").selectAll("rect").data(data).join("rect")
      .attr("x",x(0)).attr("y",d=>y(d.city)).attr("width",d=>x(d.hhi)-x(0)).attr("height",y.bandwidth())
      .attr("fill",d=>d3.interpolateYlGnBu(d.hhi))
      .on("mousemove",(ev,d)=>showTT(ev,`<strong>${d.city}</strong><br>集中度：${d3.format(".3f")(d.hhi)}<br>最大目的地：${d.topDestination}(${d3.format(".1%")(d.topDestinationShare)})`)).on("mouseleave",hideTT);
    svg.append("g").attr("transform",`translate(0,${height-margin.bottom})`).call(d3.axisBottom(x).ticks(5));
    svg.append("g").selectAll("text").data(data).join("text").attr("class","bar-label").attr("x",margin.left-8).attr("y",d=>y(d.city)+y.bandwidth()*0.68).attr("text-anchor","end").text(d=>d.city);
    svg.append("text").attr("x",margin.left).attr("y",height-6).attr("fill",colors.gray).attr("font-size",10).text("越接近1：流出越集中；越接近0：越分散");
  }

  function drawCommunityChart() {
    const svg = d3.select("#communityChart"), width = svg.node().clientWidth, height = svg.node().clientHeight;
    svg.selectAll("*").remove();
    const community = state.summary.communities[state.period];
    const data = community.groups.slice().sort((a,b)=>d3.descending(a.internalWeight,b.internalWeight));
    const margin = {top:58,right:220,bottom:38,left:76};
    const palette = [colors.blue,colors.greenDark,"#57a6b2","#7b8cc9","#9a8f4f","#c47d55"];
    const x = d3.scaleLinear().domain([0,d3.max(data,d=>d.internalWeight)||1]).nice().range([margin.left,width-margin.right]);
    const y = d3.scaleBand().domain(data.map(d=>d.id)).range([margin.top,height-margin.bottom]).padding(0.3);

    svg.append("text").attr("x",margin.left).attr("y",18).attr("fill",colors.blueDark).attr("font-size",12).attr("font-weight",700)
      .text(`社区数：${community.communityCount}    模块度 Q：${d3.format(".3f")(community.modularity)}`);
    svg.append("text").attr("x",margin.left).attr("y",38).attr("fill",colors.gray).attr("font-size",11).text("条形=内部流动强度；右侧=主要城市");

    svg.append("g").selectAll("rect").data(data).join("rect")
      .attr("x",x(0)).attr("y",d=>y(d.id)).attr("width",d=>x(d.internalWeight)-x(0)).attr("height",y.bandwidth())
      .attr("fill",(_,i)=>palette[i%palette.length]).attr("opacity",0.9)
      .on("mousemove",(ev,d)=>showTT(ev,`<strong>${d.id}：${d.cities.join(", ")}</strong><br>城市数：${d.size}<br>内部流动：${fmt(d.internalWeight)}<br>内部占比：${d3.format(".1%")(d.internalShare)}`)).on("mouseleave",hideTT);

    svg.append("g").selectAll("text").data(data).join("text").attr("class","bar-label").attr("x",margin.left-8).attr("y",d=>y(d.id)+y.bandwidth()*0.68).attr("text-anchor","end").text(d=>d.id);
    svg.append("g").selectAll("text").data(data).join("text").attr("class","bar-value").attr("x",d=>Math.min(x(d.internalWeight)+8,width-margin.right+8)).attr("y",d=>y(d.id)+y.bandwidth()*0.68).text(d=>{const names=d.cities.slice(0,3).join("、");const more=d.cities.length>3?`等${d.size}城`:`${d.size}城`;return `${shortNum(d.internalWeight)} · ${more}：${names}`;});
    svg.append("g").attr("transform",`translate(0,${height-margin.bottom})`).call(d3.axisBottom(x).ticks(5).tickFormat(shortNum));
  }

  // ===== Retention stacked bar (replaces donuts) =====
  function renderRetentionDonuts() {
    const svg = d3.select("#retentionDonuts"), width = svg.node().clientWidth;
    svg.selectAll("*").remove();
    const rows = state.retention[state.period];
    if (!rows || !rows.length) return;

    // Sort by retention rate descending
    const data = rows.slice().sort((a, b) => d3.descending(a.retentionRate, b.retentionRate));
    const n = data.length;
    const margin = { top: 26, right: 28, bottom: 4, left: 90 };
    const barH = Math.min(22, Math.max(14, 300 / n));
    const h = n * barH + margin.top + margin.bottom + 16;
    svg.attr("height", h);

    const xMax = d3.max(data, d => d.self + d.nonSelf) || 1;
    const x = d3.scaleLinear().domain([0, xMax]).range([margin.left, width - margin.right]).nice();

    const g = svg.append("g");

    // City labels
    g.selectAll(".rlbl").data(data).join("text")
      .attr("class", "bar-label").attr("x", margin.left - 6).attr("y", (_, i) => margin.top + i * barH + barH * 0.65)
      .attr("text-anchor", "end").attr("font-size", Math.min(11, barH * 0.7))
      .text(d => d.city);

    // Self bar (green)
    g.selectAll(".rself").data(data).join("rect")
      .attr("x", d => x(0)).attr("y", (_, i) => margin.top + i * barH + 1)
      .attr("width", d => Math.max(0, x(d.self) - x(0)))
      .attr("height", barH - 2)
      .attr("fill", colors.greenDark).attr("opacity", 0.85).attr("rx", 1);

    // Non-self bar (blue)
    g.selectAll(".rnon").data(data).join("rect")
      .attr("x", d => x(d.self)).attr("y", (_, i) => margin.top + i * barH + 1)
      .attr("width", d => Math.max(0, x(d.nonSelf) - x(0)))
      .attr("height", barH - 2)
      .attr("fill", colors.blue).attr("opacity", 0.85).attr("rx", 1);

    // Retention % label
    g.selectAll(".rpct").data(data).join("text")
      .attr("x", d => x(d.self + d.nonSelf) + 4)
      .attr("y", (_, i) => margin.top + i * barH + barH * 0.65)
      .attr("font-size", Math.min(11, barH * 0.68)).attr("font-weight", "700")
      .attr("fill", colors.greenDark)
      .text(d => d3.format(".0%")(d.retentionRate));

    // Hover rects
    g.selectAll(".rhover").data(data).join("rect")
      .attr("x", margin.left).attr("y", (_, i) => margin.top + i * barH)
      .attr("width", width - margin.left - margin.right).attr("height", barH)
      .attr("fill", "transparent").attr("cursor", "pointer")
      .on("mousemove", (ev, d) => showTT(ev,
        `<strong>${d.city}</strong><br>同城留存：${fmt(d.self)}<br>跨城流出：${fmt(d.nonSelf)}<br>留守率：${d3.format(".1%")(d.retentionRate)}`))
      .on("mouseleave", hideTT)
      .on("click", (_, d) => selectCity(d.city));

    // X axis (top) — sits above the bars
    g.append("g").attr("transform", `translate(0,${margin.top - 4})`)
      .call(d3.axisTop(x).ticks(4).tickFormat(d3.format("~s")));

    drawInlineLegend(svg, [{ label: "同城留存", color: colors.greenDark }, { label: "跨城流出", color: colors.blue }], margin.left, h - 10);
  }

  // ===== Retention Ranking =====
  function renderRetentionRanking() {
    const svg = d3.select("#retentionRanking"), width = svg.node().clientWidth, height = svg.node().clientHeight;
    svg.selectAll("*").remove();
    const periods = state.summary.periods;
    const panelW = Math.floor((width-80)/3);
    const margin = {top:24,right:34,bottom:10,left:90};
    const barAreaW = panelW-margin.left-margin.right;

    periods.forEach((period,pi)=>{
      const rows = state.retention[period];
      if(!rows) return;
      const top = rows.slice(0,16);
      const g = svg.append("g").attr("transform",`translate(${40+pi*panelW},0)`);
      g.append("text").attr("x",margin.left).attr("y",14).attr("fill",colors.blueDark).attr("font-size",12).attr("font-weight","700").text(period);
      const maxRate = d3.max(top,d=>d.retentionRate)||0.8;
      const x = d3.scaleLinear().domain([0,maxRate]).range([0,barAreaW]).nice();
      const y = d3.scaleBand().domain(top.map(d=>d.city)).range([margin.top,height-margin.bottom]).padding(0.18);

      g.append("g").attr("transform",`translate(${margin.left},0)`).selectAll("rect").data(top).join("rect")
        .attr("x",0).attr("y",d=>y(d.city)).attr("width",d=>x(d.retentionRate)).attr("height",y.bandwidth())
        .attr("fill",d=>{const t=d.retentionRate/maxRate;return d3.interpolateRgb(colors.red,colors.greenDark)(t);})
        .attr("opacity",d=>isHighlightedCity(d.city)?1:0.78)
        .on("mousemove",(ev,d)=>showTT(ev,`<strong>${d.city}</strong><br>${period}<br>留守率：${d3.format(".1%")(d.retentionRate)}<br>同城：${fmt(d.self)}/总流出：${fmt(d.outgoing)}`)).on("mouseleave",hideTT);
      g.append("g").selectAll("text").data(top).join("text").attr("class","bar-label").attr("x",margin.left-6).attr("y",d=>y(d.city)+y.bandwidth()*0.7).attr("text-anchor","end").text(d=>d.city);
      g.append("g").attr("transform",`translate(${margin.left},0)`).selectAll("text").data(top).join("text").attr("class","bar-value").attr("x",d=>x(d.retentionRate)+4).attr("y",d=>y(d.city)+y.bandwidth()*0.7).text(d=>d3.format(".0%")(d.retentionRate));
    });
  }

  // ===== Quadrant =====
  function renderQuadrantChart() {
    const svg = d3.select("#quadrantChart"), width = svg.node().clientWidth, height = svg.node().clientHeight;
    svg.selectAll("*").remove();
    const retentionRows = state.retention[state.period];
    const inflowRows = state.summary.netInflowRates?state.summary.netInflowRates[state.period]:null;
    if(!retentionRows||!inflowRows) return;

    const inflowMap = {}; inflowRows.forEach(d=>{inflowMap[d.city]=d;});
    const data = retentionRows.map(r=>{
      const inf=inflowMap[r.city]; if(!inf||inf.total<100) return null;
      const node=nodeById(r.city); return {city:r.city,retentionRate:r.retentionRate,netInflowRate:inf.netInflowRate,totalFlow:inf.total,label:node?node.label:r.city};
    }).filter(Boolean);

    const margin = {top:28,right:48,bottom:46,left:58};
    const plotW=width-margin.left-margin.right, plotH=height-margin.top-margin.bottom;
    const xMed = d3.median(data,d=>d.retentionRate)||0.5;
    const xMin=d3.min(data,d=>d.retentionRate)||0, xMax=d3.max(data,d=>d.retentionRate)||1;
    const yMax=d3.max(data,d=>Math.abs(d.netInflowRate))||0.3;
    const xDomain=[xMin-0.03,xMax+0.03], yDomain=[-yMax-0.03,yMax+0.03];
    const x=d3.scaleLinear().domain(xDomain).range([margin.left,width-margin.right]);
    const y=d3.scaleLinear().domain(yDomain).range([height-margin.bottom,margin.top]);
    const r=d3.scaleSqrt().domain([0,d3.max(data,d=>d.totalFlow)||1]).range([5,28]);

    const plotG=svg.append("g");
    const quads=[
      {x1:x(xMed),x2:x(xMax+0.03),y1:y(0),y2:y(yDomain[1]),fill:"#d5f0e2",label:"高留守·净流入"},
      {x1:x(xDomain[0]),x2:x(xMed),y1:y(0),y2:y(yDomain[1]),fill:"#dae8fc",label:"低留守·净流入"},
      {x1:x(xDomain[0]),x2:x(xMed),y1:y(yDomain[0]),y2:y(0),fill:"#f8cecc",label:"低留守·净流出"},
      {x1:x(xMed),x2:x(xMax+0.03),y1:y(yDomain[0]),y2:y(0),fill:"#fff2cc",label:"高留守·净流出"},
    ];
    plotG.selectAll("rect.quad").data(quads).join("rect").attr("class","quad").attr("x",d=>Math.min(d.x1,d.x2)).attr("y",d=>Math.min(d.y1,d.y2)).attr("width",d=>Math.abs(d.x2-d.x1)).attr("height",d=>Math.abs(d.y2-d.y1)).attr("fill",d=>d.fill).attr("opacity",0.45);

    plotG.append("line").attr("x1",x(xMed)).attr("x2",x(xMed)).attr("y1",margin.top).attr("y2",height-margin.bottom).attr("stroke","#8896a8").attr("stroke-width",1).attr("stroke-dasharray","5,4");
    plotG.append("line").attr("x1",margin.left).attr("x2",width-margin.right).attr("y1",y(0)).attr("y2",y(0)).attr("stroke","#8896a8").attr("stroke-width",1).attr("stroke-dasharray","5,4");

    plotG.selectAll("circle").data(data).join("circle").attr("class",d=>cityClass(d.city,"quad-bubble"))
      .attr("cx",d=>x(d.retentionRate)).attr("cy",d=>y(d.netInflowRate)).attr("r",d=>r(d.totalFlow))
      .attr("fill",d=>{const n=nodeById(d.city);return n?nodeColor(n):colors.green;}).attr("opacity",0.78).attr("stroke","#fff").attr("stroke-width",1.2).attr("cursor","pointer")
      .on("click",(_,d)=>selectCity(d.city))
      .on("mousemove",(ev,d)=>showTT(ev,`<strong>${d.label}</strong><br>留守率：${d3.format(".1%")(d.retentionRate)}<br>净流入率：${d3.format("+.1%")(d.netInflowRate)}<br>总流动：${fmt(d.totalFlow)}`)).on("mouseleave",hideTT);

    const topN=data.slice().sort((a,b)=>b.totalFlow-a.totalFlow).slice(0,10);
    plotG.selectAll("text.quad-label").data(topN).join("text").attr("class","quad-label").attr("x",d=>x(d.retentionRate)+r(d.totalFlow)+4).attr("y",d=>y(d.netInflowRate)+4).attr("font-size",10).attr("fill",colors.ink).text(d=>d.label);

    svg.append("g").attr("transform",`translate(0,${y(0)})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")));
    svg.append("g").attr("transform",`translate(${x(xMed)},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("+.0%")));
    svg.append("text").attr("x",margin.left+plotW/2).attr("y",height-4).attr("text-anchor","middle").attr("font-size",11).attr("fill",colors.muted).text("留守率(同城留存/总流出)");
    svg.append("text").attr("x",-height/2).attr("y",14).attr("transform","rotate(-90)").attr("text-anchor","middle").attr("font-size",11).attr("fill",colors.muted).text("净流入率");
    svg.append("text").attr("x",x(xMax)-10).attr("y",y(yDomain[1])+16).attr("text-anchor","end").attr("font-size",10).attr("fill",colors.greenDark).text("高留守·净流入");
    svg.append("text").attr("x",x(xDomain[0])+10).attr("y",y(yDomain[1])+16).attr("text-anchor","start").attr("font-size",10).attr("fill",colors.blueDark).text("低留守·净流入");
    svg.append("text").attr("x",x(xDomain[0])+10).attr("y",y(yDomain[0])-6).attr("text-anchor","start").attr("font-size",10).attr("fill",colors.red).text("低留守·净流出");
    svg.append("text").attr("x",x(xMax)-10).attr("y",y(yDomain[0])-6).attr("text-anchor","end").attr("font-size",10).attr("fill","#c47d10").text("高留守·净流出");
  }

  // ===== Diff Heatmap (City) =====
  function renderDiffHeatmap() {
    const svg = d3.select("#diffHeatmap"), width = svg.node().clientWidth, height = svg.node().clientHeight;
    svg.selectAll("*").remove();
    const dm = state.diffMatrix;
    if(!dm||!dm.cities||!dm.cities.length) return;
    const cities=dm.cities, n=cities.length;
    const margin={top:92,right:120,bottom:28,left:104};
    const available=Math.min(width-margin.left-margin.right,height-margin.top-margin.bottom);
    const cell=Math.max(8,Math.floor(available/n));
    const inner=cell*n;
    const g=svg.append("g").attr("transform",`translate(${margin.left},${margin.top})`);
    const maxAbs=dm.maxAbsDiff||1;
    const cs=d3.scaleSequential(d3.interpolateRdBu).domain([maxAbs,-maxAbs]);

    const cells=[];
    for(let i=0;i<n;i++)for(let j=0;j<n;j++)cells.push({from:cities[i],to:cities[j],diff:dm.diffValues[i][j],early:dm.earlyValues[i][j],late:dm.lateValues[i][j],i,j});

    g.selectAll("rect").data(cells).join("rect").attr("class",d=>matrixClass(d))
      .attr("x",d=>d.j*cell).attr("y",d=>d.i*cell).attr("width",cell-1).attr("height",cell-1)
      .attr("fill",d=>d.i===d.j?(d.diff===0?"#eee":(d.diff>0?d3.interpolateRgb("#e0e0e0","#27ae60")(Math.min(1,Math.abs(d.diff)/50000)):d3.interpolateRgb("#e0e0e0","#e74c3c")(Math.min(1,Math.abs(d.diff)/50000)))):(d.diff===0?"#f7f7f7":cs(d.diff)))
      .attr("stroke",d=>d.i===d.j?"#444":null).attr("stroke-width",d=>d.i===d.j?0.8:0)
      .on("mousemove",(ev,d)=>showTT(ev,`<strong>${d.from}→${d.to}</strong><br>2009-2013：${fmt(d.early)}<br>2014-2018：${fmt(d.late)}<br>变化：${d.diff>0?"+":""}${fmt(d.diff)}`)).on("mouseleave",hideTT);

    g.append("g").selectAll("text").data(cities).join("text").attr("class","matrix-label").attr("x",-8).attr("y",(_,i)=>i*cell+cell*0.72).attr("text-anchor","end").text(d=>d);
    g.append("g").selectAll("text").data(cities).join("text").attr("class","matrix-label").attr("transform",(_,i)=>`translate(${i*cell+cell*0.72},-8) rotate(-58)`).attr("text-anchor","start").text(d=>d);

    // Legend
    const legX=margin.left+inner+22, legY=margin.top+8, legW=16, legH=160;
    const defs=svg.append("defs");
    const grad=defs.append("linearGradient").attr("id","diffLegendGrad").attr("x1","0%").attr("x2","0%").attr("y1","100%").attr("y2","0%");
    grad.append("stop").attr("offset","0%").attr("stop-color",d3.interpolateRdBu(0));
    grad.append("stop").attr("offset","50%").attr("stop-color",d3.interpolateRdBu(0.5));
    grad.append("stop").attr("offset","100%").attr("stop-color",d3.interpolateRdBu(1));

    const leg=svg.append("g").attr("transform",`translate(${legX},${legY})`);
    leg.append("rect").attr("x",0).attr("y",0).attr("width",legW).attr("height",legH).attr("fill","url(#diffLegendGrad)");
    leg.append("text").attr("x",0).attr("y",-6).attr("font-size",11).attr("fill",colors.blueDark).attr("font-weight","700").text("变化(Late-Early)");
    [maxAbs,Math.floor(maxAbs/2),0,-Math.floor(maxAbs/2),-maxAbs].filter((v,i,arr)=>arr.indexOf(v)===i).forEach(v=>{
      const ty=d3.scaleLinear().domain([maxAbs,-maxAbs]).range([0,legH])(v);
      leg.append("line").attr("x1",0).attr("x2",legW).attr("y1",ty).attr("y2",ty).attr("stroke","#fff").attr("stroke-width",1);
      leg.append("text").attr("x",legW+6).attr("y",ty+4).attr("font-size",10).attr("fill","#506176").text(v>0?`+${shortNum(v)}`:shortNum(v).replace("G","B"));
    });
    svg.append("text").attr("x",margin.left).attr("y",margin.top+inner+18).attr("font-size",11).attr("fill",colors.muted).text("行=From/列=To；蓝=下降，红=上升，白=无变化。对角线=同城留存变化。");
  }

  // ===== Comparison (City tab Act 4) =====
  function renderComparison() {
    const totals = state.summary.periodTotals?state.summary.periodTotals["2008-2018"]:null;
    const retention = state.summary.retentionMobility?state.summary.retentionMobility["2008-2018"]:null;
    if(totals) {
      d3.select("#compCityTotal").text(shortNum(totals.total).replace("G","B"));
      d3.select("#compCityCities").text(state.nodes.length);
    }
    if(retention) d3.select("#compCityRetention").text(d3.format(".1%")(retention.selfRate));

    // Fetch discipline data for comparison
    fetch("Discipline-Mobility-Visualization/data/processed/Discipline_Mobility_Network.json")
      .then(r=>r.ok?r.json():null).catch(()=>null)
      .then(data=>{
        if(!data||!data.periods||!data.periods.full) return;
        const full=data.periods.full, discs=full.d||[];
        let totalO=0,totalS=0,totalI=0;
        discs.forEach(d=>{totalO+=d.o||0;totalI+=d.i||0;totalS+=d.s||0;});
        const totalFlow=totalO+totalI-totalS;
        const selfRate=totalFlow>0?totalS/totalFlow:0;
        d3.select("#compDiscTotal").text(shortNum(Math.round(totalFlow)).replace("G","B"));
        d3.select("#compDiscCount").text(discs.length);
        d3.select("#compDiscRetention").text(d3.format(".1%")(selfRate));
      }).catch(()=>{});
  }

  // ===== Public API =====
  function getSummary() {
    const totals = state.summary.periodTotals?state.summary.periodTotals["2008-2018"]:null;
    const retention = state.summary.retentionMobility?state.summary.retentionMobility["2008-2018"]:null;
    if(!totals) return null;
    const top = state.links["2008-2018"]?state.links["2008-2018"].filter(d=>!d.isSelf).sort((a,b)=>d3.descending(a.value,b.value))[0]:null;
    return {
      total: shortNum(totals.total).replace("G","B"),
      cross: shortNum(totals.nonSelf).replace("G","B"),
      retention: retention?d3.format(".1%")(retention.selfRate):"—",
      n: state.nodes.length,
      topFlow: top?`${top.source}→${top.target}`:"—"
    };
  }

  function getNetworkData() {
    if(!state.nodes.length) return null;
    const links = currentLinks().filter(d=>!d.isSelf).slice(0,30);
    const included = new Set(links.flatMap(d=>[d.source,d.target]));
    const nodes = state.nodes.filter(n=>included.has(n.id)).map(n=>({...n}));
    return {nodes,links:links.filter(l=>included.has(l.source)&&included.has(l.target)).map(l=>({...l}))};
  }

  // Auto-init
  init();

  return { get initialized() { return initialized; }, init, renderAll, getSummary, getNetworkData };
})();
