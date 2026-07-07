/* ================================================================
   Discipline Mobility Visualization Module (DiscViz)
   ================================================================ */
const DiscViz = (function() {
  const DATA_BASE = 'Discipline-Mobility-Visualization/data/processed/';

  let FULLDATA = null;
  let ANALYSIS_MAP = {};
  // 默认切换到留守/稳定视图，突出学科稳定性与邻近性约束
  let currentPeriod = 'full', currentView = 'retention', topN = 15;
  let colorMode = 'category';
  let flowAnim = true, flowSpeed = 1, flowDensity = 3;
  let initialized = false;

  const roleColorMap = {
    'output-dominant':'#e74c3c','input-dominant':'#3498db','bridge':'#f39c12',
    'isolated':'#9aa0a6','balanced':'#2ecc71','unknown':'#999999'
  };

  // Tooltip for discipline tab
  const tt = document.getElementById('discTooltip');
  function showTT(x, y, h) {
    tt.style.left = Math.min(x+10, window.innerWidth-310)+'px';
    tt.style.top = (y-10)+'px';
    tt.innerHTML = h;
    tt.style.display = 'block';
    tt.style.opacity = '1';
  }
  function hideTT() { tt.style.display = 'none'; tt.style.opacity = '0'; }

  // Category colors
  function catColor(c) {
    if (!FULLDATA||!FULLDATA.cats) return '#999';
    const map = Object.fromEntries(FULLDATA.cats||[]);
    return map[c]||'#999';
  }

  function colorForNodeObj(d) {
    if (!d) return '#999';
    const role = d.role || (ANALYSIS_MAP[d.n]&&ANALYSIS_MAP[d.n].role);
    if (colorMode==='role') return roleColorMap[role]||roleColorMap.unknown;
    return catColor(d.c);
  }

  // ===== Data Loading =====
  async function init() {
    try {
      const resp = await fetch(DATA_BASE + 'Discipline_Mobility_Network.json');
      if (resp.ok) FULLDATA = await resp.json();
      else throw new Error('Failed to load network data');
    } catch(e) {
      console.error('Failed to load discipline data', e);
      return false;
    }
    try {
      const aresp = await fetch(DATA_BASE + 'Discipline_Mobility_Analysis.json');
      if (aresp.ok) {
        const aj = await aresp.json();
        if (aj&&aj.analysis) aj.analysis.forEach(x=>{ANALYSIS_MAP[x.name]=x;});
      }
    } catch(e) { console.warn('No analysis data', e); }

    initialized = true;
    setupControls();
    return true;
  }

  // ===== Controls =====
  function setupControls() {
    const pc = document.getElementById('periodBtns');
    if (!pc||!FULLDATA||!FULLDATA.periods) return;
    pc.innerHTML = '';
    Object.keys(FULLDATA.periods).forEach((k,i)=>{
      const b = document.createElement('button');
      b.className = 'btn'+(i?'':' active');
      b.textContent = FULLDATA.periods[k].l;
      b.dataset.period = k;
      b.onclick = ()=>{pc.querySelectorAll('.btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');currentPeriod=k;renderAll();};
      pc.appendChild(b);
    });
  }

  function setupViewButtons() {
    document.querySelectorAll('#viewBtns .view-btn').forEach(b=>{
      b.onclick = ()=>{
        document.querySelectorAll('#viewBtns .view-btn').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        currentView = b.dataset.view;
        renderAll();
      };
    });
    const fg = document.getElementById('focusBtns');
    if (fg) {
      fg.querySelectorAll('.focus-btn').forEach(b=>{
        b.onclick = ()=>{
          fg.querySelectorAll('.focus-btn').forEach(x=>x.classList.remove('active'));
          b.classList.add('active');
          currentView = 'focus';
          renderFocusSankey(b.dataset.focus);
        };
      });
    }
    const flowToggle = document.getElementById('flowAnimToggle');
    if (flowToggle) {
      flowAnim = !!flowToggle.checked;
      flowToggle.addEventListener('change', ()=>{flowAnim=!!flowToggle.checked;if(!flowAnim&&window._flowTimer2){try{window._flowTimer2.stop()}catch(e){}}renderAll();});
    }
    const fs = document.getElementById('flowSpeed');
    if(fs){fs.value=flowSpeed;fs.addEventListener('input',()=>{flowSpeed=+fs.value;});}
    const fd = document.getElementById('flowDensity');
    if(fd){fd.value=flowDensity;fd.addEventListener('input',()=>{flowDensity=+fd.value;renderAll();});}
  }

  // ===== Main Render =====
  function renderAll() {
    if (!initialized) return;
    const raw = FULLDATA.periods[currentPeriod];
    const data = {l:raw.l, d:(raw.d||[]).map(dd=>Object.assign({},dd)), m:raw.m, n:(raw.d||[]).length};
    data.d.forEach(dd=>{
      const a=ANALYSIS_MAP[dd.n];
      if(a){dd.role=a.role||'unknown';dd.pagerank=a.pagerank||0;dd.community=a.community||-1;}
      else{dd.role='unknown';}
    });

    const container = document.getElementById('chartArea');
    container.innerHTML = '';

    // Legend
    const leg = document.getElementById('legend');
    if (leg) {
      leg.style.display = 'block';
      leg.innerHTML = '';
      const catMap = Object.fromEntries(FULLDATA.cats||[]);
      const wrap = document.createElement('div'); wrap.className = 'legend-cats';
      Object.keys(catMap).forEach(k=>{
        const it = document.createElement('div'); it.className='legend-item';
        const sw = document.createElement('span'); sw.className='swatch'; sw.style.background=catMap[k];
        const lbl = document.createElement('span'); lbl.className='lbl'; lbl.textContent=k;
        it.appendChild(sw); it.appendChild(lbl); wrap.appendChild(it);
      });
      leg.appendChild(wrap);
    }

    // Stats
    const total = data.d.reduce((s,d)=>s+d.o,0);
    let totalFlow = 0;
    for(let i=0;i<data.n;i++) for(let j=0;j<data.n;j++){
      if(i===j) continue;
      totalFlow += (data.m[i]&&data.m[i][j])?data.m[i][j]:0;
    }
    document.getElementById('statsBar').innerHTML = `
      <div class="stat-item"><div class="stat-value">${data.n}</div><div class="stat-label">学科数</div></div>
      <div class="stat-item"><div class="stat-value">${(total/1000).toFixed(0)}k</div><div class="stat-label">总流出</div></div>
      <div class="stat-item"><div class="stat-value">${(totalFlow/1000000).toFixed(1)}M</div><div class="stat-label">总流动量</div></div>`;

    if (!data.n) { container.innerHTML = '<div class="empty-hint">未找到数据</div>'; return; }

    if (currentView==='focus') return; // handled by renderFocusSankey directly

    switch(currentView) {
      case 'chord': renderChord(data, container); break;
      case 'netflow': renderNetFlow(data, container); break;
      case 'network': renderDiscNetwork(FULLDATA.periods[currentPeriod], container); break;
      case 'heatmap': renderDiscHeatmap(data, container); break;
      case 'openness': renderOpenness(data, container); break;
      case 'retention': renderDiscRetention(data, container); break;
      case 'diff_heatmap': renderDiscDiffHeatmap(data, container); break;
      case 'role_sankey': if(typeof renderRoleSankey==='function') renderRoleSankey(); break;
    }
    if (leg) leg.style.display = 'block';
  }

  // ===== Net Flow View =====
  function renderNetFlow(data, container) {
    const raw = FULLDATA.periods[currentPeriod];
    const discs = raw.d||[];
    const categories = (FULLDATA.cats||[]).map(([n])=>n);
    const catIdx = Object.fromEntries(categories.map((c,i)=>[c,i]));
    const k = categories.length;

    const catStats = categories.map(()=>({o:0,i:0,s:0}));
    for(let i=0;i<discs.length;i++){
      const c=discs[i].c||'Other';
      const idx=catIdx[c];
      const self=discs[i].s||0;
      catStats[idx].o += (discs[i].o||0)-self;
      catStats[idx].i += (discs[i].i||0)-self;
    }

    const items = categories.map((c,idx)=>({n:c,c:c,o:catStats[idx].o,i:catStats[idx].i,net:(catStats[idx].i||0)-(catStats[idx].o||0)}));
    items.sort((a,b)=>b.net-a.net);

    const n=items.length;
    const width=Math.max(980,container.clientWidth||980);
    const margin={top:80,right:40,bottom:24,left:320};
    const barH=Math.max(18,Math.min(40,(600-margin.top-margin.bottom)/n));
    const height=n*barH+margin.top+margin.bottom+50;
    const midX=width/2+50;
    const maxAbs=d3.max(items,d=>Math.abs(d.net))||1;
    const xScale=d3.scaleSqrt().domain([0,maxAbs]).range([0,Math.max(0,width/2-margin.left-60)]);
    const svg=d3.select(container).append('svg').attr('width',width).attr('height',height);
    const g=svg.append('g').attr('transform',`translate(${margin.left},${margin.top})`);

    g.append('line').attr('x1',midX-margin.left).attr('x2',midX-margin.left).attr('y1',-8).attr('y2',n*barH+4).attr('stroke','#ccc').attr('stroke-width',1).attr('stroke-dasharray','4,3');

    items.forEach((d,i)=>{
      const y=i*barH, absv=Math.abs(d.net), barW=xScale(absv);
      if(d.net<0) g.append('rect').attr('x',midX-margin.left-barW).attr('y',y+1).attr('width',barW).attr('height',barH-2).attr('fill','#e74c3c').attr('opacity',0.75).attr('rx',2);
      if(d.net>0) g.append('rect').attr('x',midX-margin.left).attr('y',y+1).attr('width',barW).attr('height',barH-2).attr('fill','#3498db').attr('opacity',0.75).attr('rx',2);
      g.append('rect').attr('x',midX-margin.left-6).attr('y',y+1).attr('width',6).attr('height',barH-2).attr('fill',d.net<0?'#c0392b':d.net>0?'#2980b9':'#ccc').attr('rx',2);
      const tx=d.net>=0?midX-margin.left+barW+4:midX-margin.left-barW-4;
      g.append('text').attr('x',tx).attr('y',y+barH/2).attr('dy','0.32em').attr('text-anchor',d.net>=0?'start':'end').attr('font-size','11px').attr('fill','#555').text(d.net?(d.net>0?'+':'')+d.net.toLocaleString():'0');
    });

    g.selectAll('.lbl').data(items).join('text').attr('x',-30).attr('y',(d,i)=>i*barH+barH/2).attr('dy','0.32em').attr('text-anchor','end').attr('font-size','12px').attr('fill','#333').text(d=>d.n);
    g.selectAll('.cd').data(items).join('circle').attr('cx',-18).attr('cy',(d,i)=>i*barH+barH/2).attr('r',5).attr('fill',d=>colorForNodeObj(d));

    svg.append('text').attr('x',midX-margin.left-12).attr('y',40).attr('text-anchor','end').attr('font-size','12px').attr('fill','#e74c3c').attr('font-weight','600').text('净流出（送出人才）');
    svg.append('text').attr('x',midX-margin.left+12).attr('y',40).attr('text-anchor','start').attr('font-size','12px').attr('fill','#3498db').attr('font-weight','600').text('净流入（吸纳人才）');
  }

  // ===== Heatmap View =====
  function renderDiscHeatmap(data, container) {
    container.innerHTML = '';
    const disc=data.d, matrix=data.m, n=data.n;
    const categories=Array.from(new Set(disc.map(d=>d.c||'Other')));
    const k=categories.length;
    const catIdx=Object.fromEntries(categories.map((c,i)=>[c,i]));

    const catMatrix=Array.from({length:k},()=>Array(k).fill(0));
    for(let i=0;i<n;i++) for(let j=0;j<n;j++){
      if(i===j) continue;
      const v=(matrix[i]&&matrix[i][j])?matrix[i][j]:0;
      if(!v) continue;
      const ci=catIdx[disc[i].c||'Other'], cj=catIdx[disc[j].c||'Other'];
      catMatrix[ci][cj]+=v;
    }

    const catDisc=categories.map(c=>({n:c,c:c}));
    const nCat=k;
    const cellSize=nCat<=8?48:nCat<=12?36:Math.max(12,Math.min(32,700/nCat));
    const hw=cellSize*nCat, hh=cellSize*nCat;
    const margin={top:Math.max(100,18*5),right:30,bottom:90,left:Math.max(300,22*9)};
    const width=hw+margin.left+margin.right, height=hh+margin.top+margin.bottom;
    const maxVal=d3.max(catMatrix.flat())||1;
    const logMax=Math.log(maxVal+1);
    const colorScale=v=>d3.interpolateRgb('#f7f7f7','#08306b')(Math.pow(Math.log(v+1)/logMax,0.6));

    const svg=d3.select(container).append('svg').attr('width',width).attr('height',height);
    const g=svg.append('g').attr('transform',`translate(${margin.left},${margin.top})`);

    g.selectAll('.hlr').data(catDisc).join('text').attr('class','heatmap-label').attr('x',-30).attr('y',(d,i)=>i*cellSize+cellSize/2).attr('dy','0.35em').attr('text-anchor','end').style('font-size',Math.min(9,cellSize*0.32)+'px').style('fill','#333').text(d=>d.n);

    g.selectAll('.hlc').data(catDisc).join('text').attr('class','heatmap-label').attr('x',(d,i)=>i*cellSize+cellSize/2).attr('y',-14).attr('dy','0.35em').attr('text-anchor','start').attr('transform',(d,i)=>`rotate(-60,${i*cellSize+cellSize/2},-14)`).style('font-size',Math.min(8,cellSize*0.28)+'px').style('fill','#333').text(d=>d.n);

    g.selectAll('.cbr').data(catDisc).join('rect').attr('x',-12).attr('y',(d,i)=>i*cellSize+2).attr('width',4).attr('height',cellSize-4).attr('fill',d=>colorForNodeObj(d)).attr('rx',1);
    g.selectAll('.cbc').data(catDisc).join('rect').attr('x',(d,i)=>i*cellSize+2).attr('y',-12).attr('width',cellSize-4).attr('height',4).attr('fill',d=>colorForNodeObj(d)).attr('ry',1);

    g.selectAll('.cell').data(d3.cross(d3.range(nCat),d3.range(nCat))).join('rect').attr('class','heatmap-cell')
      .attr('x',([,j])=>j*cellSize).attr('y',([i])=>i*cellSize).attr('width',cellSize).attr('height',cellSize)
      .attr('fill',([i,j])=>colorScale(catMatrix[i][j])).attr('stroke','#fff').attr('stroke-width',0.5)
      .on('mouseenter',function(ev,[i,j]){d3.select(this).attr('stroke','#e74c3c').attr('stroke-width',2);showTT(ev.offsetX,ev.offsetY,`<div class="tt-title">${catDisc[i].n} → ${catDisc[j].n}</div><div class="tt-row"><span>流动</span><span>${catMatrix[i][j]?catMatrix[i][j].toLocaleString():'0'}</span></div>`);})
      .on('mouseleave',function(){d3.select(this).attr('stroke','#fff').attr('stroke-width',0.5);hideTT();});

    svg.append('text').attr('class','axis-label').attr('x',margin.left+hw/2).attr('y',margin.top+hh+28).attr('text-anchor','middle').attr('font-size','11px').attr('fill','#888').text('目标学科');
    svg.append('text').attr('class','axis-label').attr('x',-(margin.top+hh/2)).attr('y',18).attr('transform','rotate(-90)').attr('text-anchor','middle').attr('font-size','11px').attr('fill','#888').text('来源学科');

    // Legend
    const legW=200, legH=12, legX=margin.left+(hw-legW)/2, legY=margin.top+hh+42;
    const defs=svg.append('defs');
    const grad=defs.append('linearGradient').attr('id','discHeatGrad').attr('x1','0%').attr('y1','0%').attr('x2','100%').attr('y2','0%');
    [0,0.2,0.4,0.6,0.8,1].forEach(p=>{grad.append('stop').attr('offset',`${p*100}%`).attr('stop-color',d3.interpolateRgb('#f7f7f7','#08306b')(Math.pow(p,0.6)));});
    svg.append('rect').attr('x',legX).attr('y',legY).attr('width',legW).attr('height',legH).attr('fill','url(#discHeatGrad)').attr('rx',2);
    [0,maxVal*0.25,maxVal*0.5,maxVal*0.75,maxVal].forEach((val,idx)=>{
      const x=legX+(idx/4)*legW;
      const wan=val/10000, rounded=Math.round(wan/10)*10;
      svg.append('text').attr('x',x).attr('y',legY+legH+12).attr('text-anchor','middle').style('font-size','9px').style('fill','#667085').text(val?`约${rounded}万`:'0');
    });
    svg.append('text').attr('x',legX+legW/2).attr('y',legY-6).attr('text-anchor','middle').style('font-size','10px').style('fill','#64748b').style('font-weight','600').text('学科间流动量（约）');
  }

  // ===== Openness View =====
  function renderOpenness(data, container) {
    container.innerHTML = '';
    const disc=(data.d||[]).map(d=>Object.assign({},d));
    disc.forEach(d=>{const o=d.o||0,i=d.i||0,s=d.s||0;d.open=(o-s)/Math.max(1,o+i-s);});
    disc.sort((a,b)=>b.open-a.open);
    const top=disc.slice(0,Math.min(10,disc.length));

    const width=Math.max(900,container.clientWidth||900);
    const barH=32, widthPad=40, svgWidth=Math.max(900,container.clientWidth||900);
    const barAreaW=svgWidth-widthPad*2;
    const barsH=top.length*barH+40;
    const radius=Math.min(180,Math.floor((svgWidth-160)/4));
    const donutCenterY=barsH+radius+30;
    const svgHeight=donutCenterY+radius+80;
    const svg=d3.select(container).append('svg').attr('width',svgWidth).attr('height',svgHeight);
    const maxOpen=d3.max(top,d=>Math.abs(d.open))||1;
    const maxBarW=Math.max(120,Math.min(520,barAreaW-260));
    const x=d3.scaleLinear().domain([0,maxOpen]).range([0,maxBarW]);

    const leftG=svg.append('g').attr('transform',`translate(${widthPad+180},20)`);
    leftG.selectAll('rect').data(top).join('rect').attr('x',180).attr('y',(d,i)=>i*barH).attr('height',barH-6).attr('width',d=>x(d.open)).attr('fill','#4f6db6').attr('opacity',0.95);
    leftG.selectAll('text.name').data(top).join('text').attr('x',175).attr('y',(d,i)=>i*barH+barH/2).attr('dy','0.32em').attr('text-anchor','end').attr('font-size','12px').text(d=>d.n);
    leftG.selectAll('text.val').data(top).join('text').attr('x',d=>180+x(d.open)+8).attr('y',(d,i)=>i*barH+barH/2).attr('dy','0.32em').attr('font-size','12px').text(d=>(d.open*100).toFixed(1)+'%');
    leftG.append('text').attr('x',10).attr('y',-6).attr('font-size','13px').attr('font-weight','700').text('按开放度排序（前10）');

    // Donut: category avg openness
    const categories=Array.from(new Set(disc.map(d=>d.c||'Other')));
    const catStats=categories.map(c=>({c,vals:[]}));
    const idx=Object.fromEntries(categories.map((c,i)=>[c,i]));
    disc.forEach(d=>{const k=idx[d.c||'Other'];if(k!==undefined)catStats[k].vals.push(d.open);});
    const catAgg=catStats.map(cs=>({c:cs.c,open:cs.vals.length?d3.mean(cs.vals):0}));
    const pie=d3.pie().value(d=>Math.max(0.0001,Math.abs(d.open))).sort(null);
    const arc=d3.arc().innerRadius(radius*0.5).outerRadius(radius);
    const rightG=svg.append('g').attr('transform',`translate(${svgWidth/2},${donutCenterY})`);
    const arcs=rightG.selectAll('.arc').data(pie(catAgg)).join('g');
    arcs.append('path').attr('d',arc).attr('fill',d=>colorForNodeObj({c:d.data.c})).attr('stroke','#fff').attr('stroke-width',0.5).style('cursor','pointer')
      .on('mouseenter',function(ev,d){d3.select(this).attr('stroke-width',1.5);showTT(ev.pageX,ev.pageY,`<div class="tt-title">${d.data.c}</div><div class="tt-row"><span>开放度</span><span>${(d.data.open*100).toFixed(1)}%</span></div>`);})
      .on('mouseleave',function(){d3.select(this).attr('stroke-width',0.5);hideTT();});

    const legX=widthPad+10, approxColW=260;
    const cols=Math.max(1,Math.min(4,Math.floor((svgWidth-widthPad*2)/approxColW)));
    const rows=Math.ceil(catAgg.length/cols);
    const finalSvgH=svgHeight+rows*22+24;
    svg.attr('height',finalSvgH);
    const leg=svg.append('g').attr('transform',`translate(${widthPad+10},${donutCenterY+radius+18})`);
    leg.selectAll('g').data(catAgg).join('g').attr('transform',(d,i)=>`translate(${(i%cols)*approxColW},${Math.floor(i/cols)*22})`).each(function(d){
      const g=d3.select(this);
      g.append('rect').attr('width',14).attr('height',14).attr('fill',colorForNodeObj({c:d.c})).attr('rx',2);
      g.append('text').attr('x',18).attr('y',12).attr('font-size','12px').attr('fill','#222').text(`${d.c} ${(d.open*100).toFixed(1)}%`);
    });
  }

  // ===== Discipline Network =====
  function renderDiscNetwork(data, container) {
    const disc=data.d||[], matrix=data.m||[], n=data.n||0;
    const totalN=disc.length;
    container.innerHTML = '';
    const width=Math.min(1200,Math.max(720,container.clientWidth||900));
    const height=Math.max(520,Math.round(width*0.58));
    const svg=d3.select(container).append('svg').attr('width',width).attr('height',height).style('display','block').style('margin','0 auto');
    const g=svg.append('g');

    const categories=Array.from(new Set(disc.map(d=>d.c||'Other')));
    const catIdx=Object.fromEntries(categories.map((c,i)=>[c,i]));
    const k=categories.length;
    const catMatrix=Array.from({length:k},()=>Array(k).fill(0));
    const catStats=categories.map(()=>({o:0,i:0,s:0}));

    for(let i=0;i<totalN;i++){
      const ci=catIdx[disc[i].c||'Other'];
      const self=disc[i].s||0;
      catStats[ci].o+=(disc[i].o||0)-self;
      catStats[ci].i+=(disc[i].i||0)-self;
      for(let j=0;j<totalN;j++){
        if(i===j)continue;
        const v=(matrix[i]&&matrix[i][j])?matrix[i][j]:0;
        if(!v)continue;
        const cj=catIdx[disc[j].c||'Other'];
        catMatrix[ci][cj]+=v;
      }
    }

    const nodes=categories.map((c,i)=>({id:i,n:c,name:c,c,size:catStats[i].o+catStats[i].i}));
    const allEdges=[];
    for(let i=0;i<k;i++)for(let j=0;j<k;j++){if(i===j)continue;const v=catMatrix[i][j];if(v>0)allEdges.push({source:i,target:j,value:v});}
    allEdges.sort((a,b)=>b.value-a.value);
    const links=allEdges.slice(0,Math.max(30,Math.min(500,totalN*6)));

    const nSize=d3.scaleSqrt().domain([0,d3.max(nodes,d=>d.size)||1]).range([4,20]);
    const lw=d3.scaleSqrt().domain([0,d3.max(links,d=>d.value)||1]).range([0.6,6]);

    const sim=d3.forceSimulation(nodes)
      .force('link',d3.forceLink(links).id(d=>d.id).distance(80).strength(0.6))
      .force('charge',d3.forceManyBody().strength(-180))
      .force('center',d3.forceCenter(width/2,height/2))
      .force('collide',d3.forceCollide().radius(d=>nSize(d.size)+6));

    svg.call(d3.zoom().on('zoom',ev=>{g.attr('transform',ev.transform);}));

    const linkG=g.append('g');
    const link=linkG.selectAll('path').data(links).join('path')
      .attr('fill','none').attr('stroke','#999').attr('stroke-opacity',0.35).attr('stroke-width',d=>Math.max(0.6,lw(d.value)));

    const nodeG=g.append('g');
    const node=nodeG.selectAll('g').data(nodes).join('g');

    node.append('circle')
      .attr('r',d=>nSize(d.size)).attr('fill',d=>colorForNodeObj(d)).attr('stroke','rgba(0,0,0,0.12)').attr('stroke-width',0.8)
      .on('mouseenter',function(ev,d){d3.select(this).attr('stroke-width',1.6);const info=catStats[d.id]||{o:0,i:0};showTT(ev.offsetX,ev.offsetY,`<div class="tt-title">${d.name}</div><div class="tt-row"><span>流出</span><span>${(info.o||0).toLocaleString()}</span></div><div class="tt-row"><span>流入</span><span>${(info.i||0).toLocaleString()}</span></div>`);})
      .on('mouseleave',function(){d3.select(this).attr('stroke-width',0.8);hideTT();});

    node.append('text').attr('x',d=>nSize(d.size)+6).attr('y',3).attr('font-size',11).attr('fill','#222').text(d=>d.name).style('pointer-events','none');

    function drag(sim){return d3.drag().on('start',(ev,d)=>{if(!ev.active)sim.alphaTarget(0.3).restart();d.fx=d.x;d.fy=d.y;}).on('drag',(ev,d)=>{d.fx=ev.x;d.fy=ev.y;}).on('end',(ev,d)=>{if(!ev.active)sim.alphaTarget(0);d.fx=null;d.fy=null;});}
    node.call(drag(sim));

    function linkArc(d){const dx=d.target.x-d.source.x,dy=d.target.y-d.source.y,dr=Math.sqrt(dx*dx+dy*dy);return`M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;}

    sim.on('tick',()=>{link.attr('d',linkArc);node.attr('transform',d=>`translate(${d.x},${d.y})`);});

    if(window._flowTimer2){try{window._flowTimer2.stop()}catch(e){}window._flowTimer2=null;}
    try{
      if(links.length>0){
        const maxLinkVal=d3.max(links,d=>d.value)||1;
        const linkNodes=link.nodes();
        const particles=[];
        links.forEach((lk,idx)=>{
          const pn=linkNodes[idx];
          if(!pn||typeof pn.getTotalLength!=='function')return;
          const ratio=lk.value/maxLinkVal;
          const count=Math.max(1,Math.ceil(flowDensity*ratio*3));
          for(let kk=0;kk<count;kk++){const c=g.append('circle').attr('class','flow-dot').attr('r',Math.max(1.2,Math.min(3,nSize(nodes[lk.source]?.size||1)*0.16))).attr('pointer-events','none');particles.push({pathNode:pn,t:Math.random(),speed:(0.2+0.8*ratio)*flowSpeed,circle:c});}
        });
        let last=null;
        window._flowTimer2=d3.timer((elapsed)=>{
          if(!flowAnim)return;
          if(last===null){last=elapsed;return;}
          const dt=(elapsed-last)/1000;last=elapsed;
          particles.forEach(p=>{try{const L=p.pathNode.getTotalLength();if(!L)return;p.t=(p.t+p.speed*dt)%1;const pt=p.pathNode.getPointAtLength(p.t*L);p.circle.attr('cx',pt.x).attr('cy',pt.y);}catch(e){}});
        });
      }
    }catch(e){console.warn('flow anim failed',e);}
  }

  // ===== Focus Sankey =====
  function renderFocusSankey(mode) {
    const raw=FULLDATA.periods[currentPeriod];
    const data={l:raw.l,d:(raw.d||[]).map(dd=>Object.assign({},dd)),m:raw.m,n:(raw.d||[]).length};
    data.d.forEach(dd=>{const a=ANALYSIS_MAP[dd.n];if(a){dd.role=a.role||'unknown';dd.pagerank=a.pagerank||0;}else{dd.role='unknown';}});
    const disc=data.d, matrix=data.m, n=data.n;
    const container=document.getElementById('chartArea');
    container.innerHTML='';

    const width=Math.min(1000,container.clientWidth?container.clientWidth-160:740);
    const height=Math.max(360,Math.min(520,Math.round(width*0.48)));
    const legendReserve=280;
    const sankeyRight=Math.max(220,width-legendReserve);
    const svg=d3.select(container).append('svg').attr('width',width).attr('height',height);

    const categories=Array.from(new Set(disc.map(d=>d.c||'Other')));
    const k=categories.length;
    const catIdx=Object.fromEntries(categories.map((c,i)=>[c,i]));
    const catMatrix=Array.from({length:k},()=>Array(k).fill(0));
    for(let i=0;i<n;i++)for(let j=0;j<n;j++){
      if(i===j)continue;
      const v=(matrix[i]&&matrix[i][j])?matrix[i][j]:0;
      if(!v)continue;
      catMatrix[catIdx[disc[i].c||'Other']][catIdx[disc[j].c||'Other']]+=v;
    }

    const catOut=catMatrix.map(row=>row.reduce((a,b)=>a+b,0));
    const catIn=catMatrix.map((_,j)=>catMatrix.reduce((s,row)=>s+(row[j]||0),0));
    const catNames=categories;

    let nodes=[],links=[];
    const topK=10;
    if(mode==='outA'){
      let outIdx=catOut.reduce((iM,v,idx,arr)=>v>arr[iM]?idx:iM,0);
      const dests=[];
      for(let j=0;j<k;j++){if(j===outIdx)continue;const v=catMatrix[outIdx][j]||0;if(v>0)dests.push({j,v});}
      dests.sort((a,b)=>b.v-a.v);
      const top=dests.slice(0,topK);
      nodes.push({name:catNames[outIdx],c:catNames[outIdx]});
      top.forEach(d=>nodes.push({name:catNames[d.j],c:catNames[d.j]}));
      links=top.map((d,idx)=>({source:0,target:idx+1,value:d.v}));
    }else if(mode==='inB'){
      let inIdx=catIn.reduce((iM,v,idx,arr)=>v>arr[iM]?idx:iM,0);
      const srcs=[];
      for(let i=0;i<k;i++){if(i===inIdx)continue;const v=catMatrix[i][inIdx]||0;if(v>0)srcs.push({i,v});}
      srcs.sort((a,b)=>b.v-a.v);
      const top=srcs.slice(0,topK);
      top.forEach(s=>nodes.push({name:catNames[s.i],c:catNames[s.i]}));
      nodes.push({name:catNames[inIdx],c:catNames[inIdx]});
      links=top.map((s,idx)=>({source:idx,target:nodes.length-1,value:s.v}));
    }else{return;}

    const graph={nodes:nodes.map(d=>({name:d.name,c:d.c})),links:links.map(l=>({source:l.source,target:l.target,value:l.value}))};
    const align=mode==='outA'?d3.sankeyLeft:d3.sankeyRight;
    const sankey=d3.sankey().nodeWidth(18).nodePadding(8).nodeAlign(align).extent([[1,1],[sankeyRight,height-1]]);
    sankey(graph);

    svg.append('g').selectAll('path').data(graph.links).join('path')
      .attr('d',d3.sankeyLinkHorizontal()).attr('fill','none')
      .attr('stroke',d=>{try{return d3.color(colorForNodeObj(d.source)).darker(0.5);}catch(e){return'#999';}})
      .attr('stroke-opacity',0.6).attr('stroke-width',d=>Math.max(1,d.width))
      .on('mouseenter',function(ev,d){showTT(ev.offsetX,ev.offsetY,`<div class="tt-title">${d.source.name} → ${d.target.name}</div><div class="tt-row"><span>流量</span><span>${(d.value||0).toLocaleString()}</span></div>`);d3.select(this).attr('stroke-opacity',1);})
      .on('mouseleave',function(){hideTT();d3.select(this).attr('stroke-opacity',0.6);});

    const nodeG=svg.append('g').selectAll('g').data(graph.nodes).join('g').attr('transform',d=>`translate(${d.x0},${d.y0})`);
    nodeG.append('rect').attr('height',d=>Math.max(6,d.y1-d.y0)).attr('width',d=>Math.max(6,d.x1-d.x0)).attr('fill',d=>colorForNodeObj(d)).attr('stroke','rgba(0,0,0,0.15)').attr('stroke-width',0.6);
    nodeG.append('text').attr('x',d=>(mode==='outA'&&d.x1>sankeyRight-40)?-6:(mode==='outA'?d.x1-d.x0+6:-6)).attr('text-anchor',d=>(mode==='outA'&&d.x1>sankeyRight-40)?'end':(mode==='outA'?'start':'end')).attr('y',d=>(d.y1-d.y0)/2).attr('dy','0.32em').attr('font-size','11px').attr('fill','#333').text(d=>d.name);
  }

  // ===== Retention (Disc) =====
  function renderDiscRetention(data, container) {
    container.innerHTML='';
    const raw=FULLDATA.periods[currentPeriod];
    const discs=raw.d||[];
    const categories=(FULLDATA.cats||[]).map(([n])=>n);
    const catIdx=Object.fromEntries(categories.map((c,i)=>[c,i]));
    const k=categories.length;
    const catStats=categories.map(c=>({name:c,self:0,out:0,incoming:0}));
    discs.forEach(d=>{const ci=catIdx[d.c||'Other'];if(ci===undefined)return;catStats[ci].self+=d.s||0;catStats[ci].out+=d.o||0;catStats[ci].incoming+=d.i||0;});
    catStats.forEach(cs=>{cs.total=cs.out;cs.retentionRate=cs.total>0?cs.self/cs.total:0;});
    catStats.sort((a,b)=>b.retentionRate-a.retentionRate);

    const width=Math.max(980,container.clientWidth||980);
    const nCats=catStats.length;
    const cols=Math.min(nCats,Math.max(3,Math.floor(width/210)));
    const cellW=Math.floor(width/cols), outerR=Math.min(68,cellW*0.4), innerR=outerR*0.58;
    const cellH=outerR*2+48, nRows=Math.ceil(nCats/cols), height=nRows*cellH+60;

    const svg=d3.select(container).append('svg').attr('width',width).attr('height',height);
    const pie=d3.pie().value(d=>d.value).sort(null);
    const arc=d3.arc().innerRadius(innerR).outerRadius(outerR);

    catStats.forEach((cs,idx)=>{
      const col=idx%cols, row=Math.floor(idx/cols), cx=col*cellW+cellW/2, cy=row*cellH+outerR+10;
      const g=svg.append('g').attr('transform',`translate(${cx},${cy})`);
      const pieData=pie([{name:'cross',value:Math.max(0,cs.out-cs.self)},{name:'self',value:cs.self}]);
      g.selectAll('path').data(pieData).join('path').attr('d',arc)
        .attr('fill',d=>d.data.name==='self'?'#2ecc71':'#3498db').attr('opacity',0.82).attr('stroke','#fff').attr('stroke-width',0.5);
      g.append('text').attr('text-anchor','middle').attr('dy','-0.2em').attr('font-size',Math.max(11,outerR*0.32)).attr('font-weight','700').attr('fill','#2ecc71').text(d3.format('.0%')(cs.retentionRate));
      g.append('text').attr('text-anchor','middle').attr('y',outerR+16).attr('font-size',Math.max(9,outerR*0.24)).attr('fill','#555').text(cs.name);
      g.on('mousemove',ev=>showTT(ev.clientX,ev.clientY,`<div class="tt-title">${cs.name}</div><div class="tt-row"><span>自引</span><span>${cs.self.toLocaleString()}</span></div><div class="tt-row"><span>跨学科</span><span>${(cs.out-cs.self).toLocaleString()}</span></div><div class="tt-row"><span>自引率</span><span>${d3.format('.1%')(cs.retentionRate)}</span></div>`)).on('mouseleave',hideTT);
    });

    const lg=svg.append('g').attr('transform',`translate(30,${height-22})`);
    [{lbl:'自引留存',c:'#2ecc71'},{lbl:'跨学科流出',c:'#3498db'}].forEach((item,i)=>{const gg=lg.append('g').attr('transform',`translate(${i*120},0)`);gg.append('rect').attr('width',10).attr('height',10).attr('fill',item.c).attr('rx',2);gg.append('text').attr('x',15).attr('y',9).attr('font-size','11px').attr('fill','#555').text(item.lbl);});
    svg.append('text').attr('x',30).attr('y',22).attr('font-size','13px').attr('font-weight','700').attr('fill','#1f4f9a').text(`学科大类留守率 — ${raw.l}`);
  }

  // ===== Chord Diagram =====
  function renderChord(data, container) {
    container.innerHTML='';
    const raw=FULLDATA.periods[currentPeriod];
    const discs=raw.d||[];
    const categories=(FULLDATA.cats||[]).map(([n])=>n);
    const nCats=categories.length;
    const catIdx=Object.fromEntries(categories.map((c,i)=>[c,i]));
    const catColors=Object.fromEntries(FULLDATA.cats||[]);

    const catMatrix=Array.from({length:nCats},()=>Array(nCats).fill(0));
    const m=raw.m||[], n=discs.length;
    for(let i=0;i<n;i++){const ci=catIdx[discs[i].c||'Other'];if(ci===undefined)continue;for(let j=0;j<n;j++){if(i===j)continue;const v=(m[i]&&m[i][j])?m[i][j]:0;if(!v)continue;const cj=catIdx[discs[j].c||'Other'];if(cj===undefined)continue;catMatrix[ci][cj]+=v;}}

    const width=Math.min(900,Math.max(500,container.clientWidth||700));
    const height=Math.round(width*0.78);
    const outerR=Math.min(width,height)*0.42, innerR=outerR*0.88;

    const svg=d3.select(container).append('svg').attr('width',width).attr('height',height).append('g').attr('transform',`translate(${width/2},${height/2})`);

    const chords=d3.chord().padAngle(0.04).sortSubgroups(d3.descending).sortChords(d3.descending)(catMatrix);

    const groupData=categories.map((name,idx)=>{
      let s0=Infinity,s1=-Infinity;
      chords.forEach(c=>{if(c.source.index===idx){if(c.source.startAngle<s0)s0=c.source.startAngle;if(c.source.endAngle>s1)s1=c.source.endAngle;}if(c.target.index===idx){if(c.target.startAngle<s0)s0=c.target.startAngle;if(c.target.endAngle>s1)s1=c.target.endAngle;}});
      const to=d3.sum(catMatrix[idx]), ti=d3.sum(catMatrix.map(r=>r[idx]));
      return{name,index:idx,startAngle:s0,endAngle:s1,value:to+ti,totalOut:to,totalIn:ti};
    });

    const arcGen=d3.arc().innerRadius(innerR).outerRadius(outerR);
    const group=svg.append('g').selectAll('g').data(groupData).join('g');

    group.append('path').attr('d',d=>arcGen(d)).attr('fill',d=>catColors[d.name]||'#999').attr('stroke','#fff').attr('stroke-width',1).style('cursor','pointer')
      .on('mouseenter',function(ev,d){d3.select(this).attr('opacity',0.85);svg.selectAll('.chord-ribbon').attr('opacity',rd=>rd.source.index===d.index||rd.target.index===d.index?0.8:0.1);})
      .on('mouseleave',function(){d3.select(this).attr('opacity',1);svg.selectAll('.chord-ribbon').attr('opacity',0.55);})
      .on('mousemove',(ev,d)=>showTT(ev.clientX,ev.clientY,`<div class="tt-title">${d.name}</div><div class="tt-row"><span>流出</span><span>${d.totalOut.toLocaleString()}</span></div><div class="tt-row"><span>流入</span><span>${d.totalIn.toLocaleString()}</span></div>`)).on('mouseleave',hideTT);

    group.append('text').each(d=>{d.angle=(d.startAngle+d.endAngle)/2;}).attr('dy','0.35em').attr('transform',d=>{const a=d.angle*180/Math.PI-90;const r=outerR+18;const x=r*Math.cos(d.angle-Math.PI/2);const y=r*Math.sin(d.angle-Math.PI/2);return`translate(${x},${y}) rotate(${a})`;}).attr('text-anchor',d=>d.angle>Math.PI?'end':'start').attr('font-size','11px').attr('fill','#333').text(d=>d.name);

    const ribbon=d3.ribbon().radius(innerR);
    svg.append('g').selectAll('path').data(chords).join('path').attr('class','chord-ribbon').attr('d',ribbon)
      .attr('fill',d=>catColors[categories[d.source.index]]||'#999').attr('fill-opacity',0.55).attr('stroke','#fff').attr('stroke-width',0.3)
      .on('mouseenter',function(ev,d){d3.select(this).attr('fill-opacity',0.9).attr('stroke-width',1);svg.selectAll('.chord-ribbon').filter(rd=>rd!==d).attr('opacity',0.08);})
      .on('mouseleave',function(){d3.select(this).attr('fill-opacity',0.55).attr('stroke-width',0.3);svg.selectAll('.chord-ribbon').attr('opacity',1);})
      .on('mousemove',(ev,d)=>showTT(ev.clientX,ev.clientY,`<div class="tt-title">${categories[d.source.index]} → ${categories[d.target.index]}</div><div class="tt-row"><span>流动次数</span><span>${d.source.value.toLocaleString()}</span></div>`)).on('mouseleave',hideTT);
  }

  // ===== Diff Heatmap (Disc) =====
  function renderDiscDiffHeatmap(data, container) {
    container.innerHTML='';
    const early=FULLDATA.periods.early, late=FULLDATA.periods.late;
    if(!early||!late)return;
    const categories=(FULLDATA.cats||[]).map(([n])=>n);
    const nCats=categories.length;
    const catIdx=Object.fromEntries(categories.map((c,i)=>[c,i]));

    function aggregateCat(period){
      const discs=period.d||[], m=period.m||[], n=discs.length;
      const cm=Array.from({length:nCats},()=>Array(nCats).fill(0));
      for(let i=0;i<n;i++){const ci=catIdx[discs[i].c||'Other'];if(ci===undefined)continue;for(let j=0;j<n;j++){if(i===j)continue;const v=(m[i]&&m[i][j])?m[i][j]:0;if(!v)continue;const cj=catIdx[discs[j].c||'Other'];if(cj===undefined)continue;cm[ci][cj]+=v;}}
      return cm;
    }

    const earlyM=aggregateCat(early), lateM=aggregateCat(late);
    let maxAbs=0;
    const diffM=Array.from({length:nCats},()=>Array(nCats).fill(0));
    for(let i=0;i<nCats;i++)for(let j=0;j<nCats;j++){diffM[i][j]=lateM[i][j]-earlyM[i][j];if(Math.abs(diffM[i][j])>maxAbs)maxAbs=Math.abs(diffM[i][j]);}
    if(maxAbs===0)maxAbs=1;

    const maxW = Math.max(500, (container.clientWidth || 900) - 32);
    const margin = {top:80, right:20, bottom:60, left: Math.min(240, maxW * 0.35)};
    const cellSize = Math.max(22, Math.min(40, Math.floor((maxW - margin.left - margin.right) / nCats)));
    const hw = cellSize * nCats, hh = cellSize * nCats;
    const width = hw + margin.left + margin.right, height = hh + margin.top + margin.bottom;

    const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
    const g=svg.append('g').attr('transform',`translate(${margin.left},${margin.top})`);

    const cs=d3.scaleSequential(d3.interpolateRdBu).domain([maxAbs,-maxAbs]);

    g.selectAll('.hlr').data(categories).join('text').attr('class','heatmap-label').attr('x',-14).attr('y',(d,i)=>i*cellSize+cellSize/2).attr('dy','0.35em').attr('text-anchor','end').style('font-size','11px').style('fill','#333').text(d=>d);
    g.selectAll('.hlc').data(categories).join('text').attr('class','heatmap-label').attr('x',(d,i)=>i*cellSize+cellSize/2).attr('y',-14).attr('dy','0.35em').attr('text-anchor','start').attr('transform',(d,i)=>`rotate(-60,${i*cellSize+cellSize/2},-14)`).style('font-size','10px').style('fill','#333').text(d=>d);

    const cells=[];
    for(let i=0;i<nCats;i++)for(let j=0;j<nCats;j++)cells.push({i,j,diff:diffM[i][j],early:earlyM[i][j],late:lateM[i][j]});

    g.selectAll('.cell').data(cells).join('rect').attr('class','heatmap-cell')
      .attr('x',d=>d.j*cellSize).attr('y',d=>d.i*cellSize).attr('width',cellSize).attr('height',cellSize)
      .attr('fill',d=>cs(d.diff)).attr('stroke','#fff').attr('stroke-width',0.5)
      .on('mouseenter',function(ev,d){d3.select(this).attr('stroke','#333').attr('stroke-width',2);const changePct=d.early>0?((d.diff/d.early)*100).toFixed(1):'N/A';showTT(ev.offsetX,ev.offsetY,`<div class="tt-title">${categories[d.i]} → ${categories[d.j]}</div><div class="tt-row"><span>2009-2013</span><span>${d.early.toLocaleString()}</span></div><div class="tt-row"><span>2014-2018</span><span>${d.late.toLocaleString()}</span></div><div class="tt-row"><span>变化</span><span>${d.diff>0?'+':''}${d.diff.toLocaleString()}(${changePct}%)</span></div>`);})
      .on('mouseleave',function(){d3.select(this).attr('stroke','#fff').attr('stroke-width',0.5);hideTT();});

    // Legend
    const legW=240, legH=14, legX=margin.left+(hw-legW)/2, legY=margin.top+hh+24;
    const defs=svg.append('defs');
    const grad=defs.append('linearGradient').attr('id','discDiffHeatLeg').attr('x1','0%').attr('x2','100%').attr('y1','0%').attr('y2','0%');
    grad.append('stop').attr('offset','0%').attr('stop-color',d3.interpolateRdBu(0));
    grad.append('stop').attr('offset','50%').attr('stop-color',d3.interpolateRdBu(0.5));
    grad.append('stop').attr('offset','100%').attr('stop-color',d3.interpolateRdBu(1));
    svg.append('rect').attr('x',legX).attr('y',legY).attr('width',legW).attr('height',legH).attr('fill','url(#discDiffHeatLeg)').attr('rx',2);
    [-maxAbs,0,maxAbs].forEach((v,idx)=>{const tx=legX+(idx/2)*legW;svg.append('text').attr('x',tx).attr('y',legY+legH+14).attr('text-anchor','middle').style('font-size','10px').style('fill','#667085').text(v>0?`+${(v/1000).toFixed(0)}k`:v<0?`${(v/1000).toFixed(0)}k`:'0');});
    svg.append('text').attr('x',legX+legW/2).attr('y',legY-8).attr('text-anchor','middle').style('font-size','11px').style('fill','#64748b').style('font-weight','600').text('流动变化 (2014-2018 — 2009-2013)');
  }

  // ===== Role Sankey (inline from original HTML) =====
  function renderRoleSankey() {
    const nodes=[{"name":"传播者(Outflow-dominant)","color":"#e74c3c"},{"name":"孤立者(Isolated)","color":"#95a5a6"},{"name":"定居者(Inflow-dominant)","color":"#3498db"},{"name":"超越者(Bridge)","color":"#f39c12"},{"name":"均衡者(Balanced)","color":"#2ecc71"},{"name":"Medicine & Health","color":"#3498db"},{"name":"Arts & Humanities","color":"#e91e63"},{"name":"Biology & Biochemistry","color":"#2ecc71"},{"name":"Chemistry","color":"#9b59b6"},{"name":"Earth & Environmental","color":"#1abc9c"},{"name":"Engineering & Technology","color":"#f39c12"},{"name":"Mathematics & CS","color":"#1a5276"},{"name":"Multidisciplinary","color":"#95a5a6"},{"name":"Physics & Astronomy","color":"#e74c3c"},{"name":"Social Sciences","color":"#e67e22"}];
    const links=[{"source":1,"target":5,"value":4},{"source":1,"target":6,"value":13},{"source":1,"target":8,"value":1},{"source":1,"target":9,"value":1},{"source":1,"target":10,"value":3},{"source":1,"target":14,"value":9},{"source":3,"target":5,"value":26},{"source":3,"target":7,"value":4},{"source":3,"target":8,"value":2},{"source":3,"target":9,"value":4},{"source":3,"target":10,"value":3},{"source":3,"target":11,"value":1},{"source":3,"target":12,"value":2},{"source":3,"target":13,"value":2},{"source":3,"target":14,"value":2},{"source":4,"target":5,"value":21},{"source":4,"target":6,"value":2},{"source":4,"target":7,"value":11},{"source":4,"target":8,"value":4},{"source":4,"target":9,"value":9},{"source":4,"target":10,"value":8},{"source":4,"target":11,"value":1},{"source":4,"target":13,"value":4},{"source":4,"target":14,"value":14}];

    const container=d3.select('#chartArea');
    const width=container.node().clientWidth||960;
    const height=Math.max(380,container.node().clientHeight||700);
    container.selectAll('*').remove();
    const svg=container.append('svg').attr('width',width).attr('height',height).append('g').attr('transform','translate(20,0)');

    const maxX=Math.floor(width*0.65);
    const sankey=d3.sankey().nodeWidth(20).nodePadding(12).extent([[1,5],[maxX,height-10]]);
    const{ nodes:snodes, links:slinks }=sankey({nodes:nodes.map(d=>({...d})),links:links.map(d=>({...d}))});

    svg.append('g').selectAll('path').data(slinks).join('path').attr('d',d3.sankeyLinkHorizontal()).attr('fill','none').attr('stroke',d=>d.source.color||'#aaa').attr('stroke-opacity',0.4).attr('stroke-width',d=>Math.max(1,d.width))
      .on('mouseover',function(ev,d){d3.select(this).attr('stroke-opacity',0.8);showTT(ev.pageX,ev.pageY,`${d.source.name} → ${d.target.name}: ${d.value}`);})
      .on('mousemove',function(ev,d){showTT(ev.pageX,ev.pageY,`${d.source.name} → ${d.target.name}: ${d.value}`);})
      .on('mouseout',function(){d3.select(this).attr('stroke-opacity',0.4);hideTT();});

    svg.append('g').selectAll('rect').data(snodes).join('rect').attr('x',d=>d.x0).attr('y',d=>d.y0).attr('height',d=>d.y1-d.y0).attr('width',d=>d.x1-d.x0).attr('fill',d=>d.color).attr('stroke','#000').attr('stroke-width',0.5)
      .on('mouseover',function(ev,d){d3.select(this).attr('stroke-width',1);showTT(ev.pageX,ev.pageY,`<div class="tt-title">${d.name}</div><div>${d.value} 学科</div>`);})
      .on('mousemove',function(ev,d){showTT(ev.pageX,ev.pageY,`<div class="tt-title">${d.name}</div><div>${d.value} 学科</div>`);})
      .on('mouseout',function(){d3.select(this).attr('stroke-width',0.5);hideTT();});

    svg.append('g').selectAll('text').data(snodes).join('text').attr('x',d=>d.x0<maxX/2?d.x1+6:d.x0-6).attr('y',d=>(d.y0+d.y1)/2).attr('dy','0.35em').attr('text-anchor',d=>d.x0<width/2?'start':'end').attr('font-size','12px').attr('fill','#333').text(d=>d.name);
  }

  // ===== Public API =====
  function getSummary() {
    if (!FULLDATA||!FULLDATA.periods||!FULLDATA.periods.full) return null;
    const full=FULLDATA.periods.full, discs=full.d||[];
    let totalO=0,totalS=0,totalI=0;
    discs.forEach(d=>{totalO+=d.o||0;totalI+=d.i||0;totalS+=d.s||0;});
    const totalFlow=totalO+totalI-totalS;
    const selfRate=totalFlow>0?totalS/totalFlow:0;
    // Find most open discipline
    let maxOpen=0, maxOpenName='—';
    discs.forEach(d=>{const o=d.o||0,i=d.i||0,s=d.s||0;const open=(o-s)/Math.max(1,o+i-s);if(open>maxOpen){maxOpen=open;maxOpenName=d.n;}});
    return {
      total: d3.format(".3s")(Math.round(totalFlow)).replace("G","B"),
      cross: d3.format(".3s")(Math.round(totalFlow-totalS)).replace("G","B"),
      retention: d3.format(".1%")(selfRate),
      n: discs.length,
      topOpen: maxOpenName
    };
  }

  function getHeatmapData() {
    if (!FULLDATA||!FULLDATA.periods||!FULLDATA.periods.full) return null;
    const raw=FULLDATA.periods.full;
    const discs=raw.d||[], m=raw.m||[], n=discs.length;
    const categories=(FULLDATA.cats||[]).map(([nm])=>nm);
    const catIdx=Object.fromEntries(categories.map((c,i)=>[c,i]));
    const k=categories.length;
    const matrix=Array.from({length:k},()=>Array(k).fill(0));
    for(let i=0;i<n;i++){const ci=catIdx[discs[i].c||'Other'];if(ci===undefined)continue;for(let j=0;j<n;j++){if(i===j)continue;const v=(m[i]&&m[i][j])?m[i][j]:0;if(!v)continue;const cj=catIdx[discs[j].c||'Other'];if(cj===undefined)continue;matrix[ci][cj]+=v;}}
    return {categories,matrix};
  }

  // Init: load data, setup buttons, render
  init().then(ok => {
    if (ok) {
      setupViewButtons();
      renderAll();
    }
  });

  function renderViewTo(viewName, containerId) {
    if (!initialized) return;
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    const raw = FULLDATA.periods[currentPeriod];
    const data = {l:raw.l, d:(raw.d||[]).map(dd=>Object.assign({},dd)), m:raw.m, n:(raw.d||[]).length};
    data.d.forEach(dd=>{
      const a=ANALYSIS_MAP[dd.n];
      if(a){dd.role=a.role||'unknown';dd.pagerank=a.pagerank||0;dd.community=a.community||-1;}
      else{dd.role='unknown';}
    });
    switch(viewName) {
      case 'heatmap': renderDiscHeatmap(data, container); break;
      case 'chord': renderChord(data, container); break;
      case 'network': renderDiscNetwork(raw, container); break;
      case 'netflow': renderNetFlow(data, container); break;
      case 'openness': renderOpenness(data, container); break;
      case 'retention': renderDiscRetention(data, container); break;
      case 'diff_heatmap': renderDiscDiffHeatmap(data, container); break;
    }
  }

  return { get initialized() { return initialized; }, renderAll, renderViewTo, getSummary, getHeatmapData };
})();
