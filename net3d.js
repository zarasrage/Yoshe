/* ===== RED DE RELACIONES EN 3D (#/map) =====
   mountNet3D(container, opts) / unmountNet3D() / net3dWheel(e)

   Una nube 3D de personas: cada nodo es alguien (con su foto, o sus iniciales), del tamaño de
   cuántas historias tiene; las líneas unen a quienes comparten historias, más gruesas mientras
   más compartan. Los que más se cruzan quedan cerca.

   Por qué canvas 2D y no WebGL/three.js: son ~40 nodos y ~200 líneas. Proyectarlos a mano (una
   rotación y una división por la profundidad) y dibujarlos en un canvas 2D cuesta casi nada,
   funciona en cualquier teléfono, no compite con el contexto WebGL de la galaxia y deja las
   fotos y los nombres nítidos. La sensación de 3D sale de la perspectiva, del orden de dibujo
   (lo de atrás primero) y de una niebla que apaga lo lejano.

   opts:
     nodes   [{ id, name, label, color, img|null, initials, n, primary }]
     edges   [{ a, b, w, rgb? }]   rgb: "r,g,b" de esa línea (si no, opts.edgeRGB o el cian)
     insets  ()=>({ top, right, bottom })  espacio que tapan los paneles: el centro se corre
     onHover(id|null), onSelect(id|null), onOpen(id)
     canHover  true en desktop (hover muestra, clic abre); false en touch (1er toque
               selecciona, 2º toque abre)
   Interacción: arrastrar gira (con inercia), rueda y pellizco acercan, giro solo y lento en
   reposo; elegir a alguien gira la nube hasta dejarlo al frente. */
(function(){
  let current = null;
  let wheelHook = null;
  function net3dWheel(e){ return wheelHook ? wheelHook(e) : false; }

  const clamp = (v, a, b)=> Math.max(a, Math.min(b, v));
  const TAU = Math.PI*2;
  const wrap = a=> a - TAU*Math.floor((a + Math.PI)/TAU);

  // ---- layout de fuerzas en 3D (determinista: siempre sale igual) ----
  function layout(nodes, edges){
    const N = nodes.length;
    const idx = {}; nodes.forEach((n,i)=> idx[n.id] = i);
    const deg = new Array(N).fill(0);
    edges.forEach(e=>{ deg[idx[e.a]] += e.w; deg[idx[e.b]] += e.w; });
    // posiciones iniciales: espiral de Fibonacci sobre esferas crecientes; los más conectados
    // parten al centro
    const order = nodes.map((_,i)=>i).sort((a,b)=> deg[b]-deg[a] || nodes[a].id.localeCompare(nodes[b].id));
    const P = new Array(N);
    order.forEach((i, k)=>{
      const t = (k + 0.5)/N;
      const y = 1 - 2*t, r = Math.sqrt(Math.max(0, 1 - y*y)), th = k*2.39996;
      const rho = 0.35 + 1.4*Math.sqrt(t);
      P[i] = { x:Math.cos(th)*r*rho, y:y*rho, z:Math.sin(th)*r*rho, vx:0, vy:0, vz:0 };
    });
    const R = nodes.map(n=> n.size*3);   // radio de choque, en unidades del layout
    const E = edges.map(e=> ({ a:idx[e.a], b:idx[e.b], w:e.w }));
    const IT = 460;
    for(let it=0; it<IT; it++){
      const cool = 1 - it/IT;
      for(let i=0;i<N;i++){
        const a = P[i];
        for(let j=i+1;j<N;j++){
          const b = P[j];
          let dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z, d2=dx*dx+dy*dy+dz*dz;
          if(d2 < 1e-6){ dx=0.01*(i-j); dy=0.01; dz=0.01; d2=dx*dx+dy*dy+dz*dz; }
          const d = Math.sqrt(d2);
          let f = 0.05/d2;
          const minD = 0.3 + R[i] + R[j];
          if(d < minD) f += (minD - d)*0.35;
          const fx=dx/d*f, fy=dy/d*f, fz=dz/d*f;
          a.vx-=fx; a.vy-=fy; a.vz-=fz; b.vx+=fx; b.vy+=fy; b.vz+=fz;
        }
      }
      E.forEach(e=>{
        const a=P[e.a], b=P[e.b];
        const dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z, d=Math.sqrt(dx*dx+dy*dy+dz*dz)||1;
        const L = 0.35 + 0.55/Math.sqrt(e.w);   // más historias juntas = más cerca
        const f = (d - L)*0.03*Math.sqrt(e.w);
        a.vx+=dx/d*f; a.vy+=dy/d*f; a.vz+=dz/d*f; b.vx-=dx/d*f; b.vy-=dy/d*f; b.vz-=dz/d*f;
      });
      P.forEach(p=>{
        p.vx -= p.x*0.02; p.vy -= p.y*0.02; p.vz -= p.z*0.02;
        const sp = Math.sqrt(p.vx*p.vx+p.vy*p.vy+p.vz*p.vz), max = 0.09*cool + 0.004;
        if(sp > max){ p.vx*=max/sp; p.vy*=max/sp; p.vz*=max/sp; }
        p.x+=p.vx; p.y+=p.vy; p.z+=p.vz;
        p.vx*=0.6; p.vy*=0.6; p.vz*=0.6;
      });
    }
    // centrar y normalizar: el 85% de la gente queda dentro de la esfera de radio 1 (con el
    // más lejano a 1, un par de sueltos en la orilla apretaban a todo el resto en el centro).
    // El radio dibujado de cada uno sale del mismo radio de choque, en la misma escala: así los
    // círculos nunca se pisan en 3D (de frente pueden taparse, como en cualquier cosa con fondo).
    let cx=0, cy=0, cz=0; P.forEach(p=>{ cx+=p.x; cy+=p.y; cz+=p.z; }); cx/=N||1; cy/=N||1; cz/=N||1;
    const dist = P.map(p=>{ p.x-=cx; p.y-=cy; p.z-=cz; return Math.hypot(p.x,p.y,p.z); }).sort((a,b)=>a-b);
    const mx = Math.max(0.001, dist[Math.floor(0.85*(N-1))] || 0);
    P.forEach((p,i)=>{ p.x/=mx; p.y/=mx; p.z/=mx; p.r = R[i]/mx; });
    return P;
  }

  // ---- sprites pre-dibujados: cara redonda con aro, y el brillo de cada color ----
  const SPR = 128;
  function faceSprite(node, img){
    const c = document.createElement("canvas"); c.width = c.height = SPR;
    const g = c.getContext("2d");
    const r = SPR/2;
    g.save();
    g.beginPath(); g.arc(r, r, r-5, 0, TAU); g.closePath(); g.clip();
    if(img){
      g.fillStyle = node.color; g.globalAlpha = 0.4; g.fillRect(0,0,SPR,SPR); g.globalAlpha = 1;
      // thumb: ya es cabeza y hombros; retrato entero (sin thumb): la franja de arriba
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      const s = Math.max(SPR/iw, SPR/ih) * (node.imgFull ? 1.7 : 1);
      const w = iw*s, h = ih*s;
      g.drawImage(img, (SPR - w)/2, node.imgFull ? 0 : (SPR - h)/2, w, h);
    } else {
      g.fillStyle = node.color; g.fillRect(0,0,SPR,SPR);
      g.fillStyle = "rgba(4,16,31,.92)";
      g.font = `700 ${Math.round(SPR*0.36)}px Outfit, system-ui, sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(node.initials, r, r + SPR*0.02);
    }
    g.restore();
    g.lineWidth = 6; g.strokeStyle = node.color;
    g.beginPath(); g.arc(r, r, r-4, 0, TAU); g.stroke();
    return c;
  }
  const glowCache = {};
  function glowSprite(color){
    if(glowCache[color]) return glowCache[color];
    const c = document.createElement("canvas"); c.width = c.height = SPR;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(SPR/2,SPR/2,0, SPR/2,SPR/2,SPR/2);
    grad.addColorStop(0, color); grad.addColorStop(0.35, color + "66"); grad.addColorStop(1, color + "00");
    g.fillStyle = grad; g.fillRect(0,0,SPR,SPR);
    return glowCache[color] = c;
  }
  const hexRgb = h=>{ const n = parseInt(String(h).replace("#",""),16); return [(n>>16)&255,(n>>8)&255,n&255]; };

  function mountNet3D(container, opts){
    unmountNet3D();
    const o = opts || {};
    // sin canvas 2D (visores raros, jsdom) no hay red: queda el panel. Se revisa antes de
    // pintar los sprites, que también usan canvas
    const canvas = document.createElement("canvas");
    canvas.className = "net-canvas";
    const ctx = canvas.getContext && canvas.getContext("2d");
    if(!ctx) return null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nodes = o.nodes.map(n=> Object.assign({}, n, { size: n.primary ? 0.045 + 0.022*Math.sqrt(n.n) : 0.026 + 0.011*Math.sqrt(n.n) }));
    const edges = o.edges.slice();
    const byId = {}; nodes.forEach(n=> byId[n.id] = n);
    const P = layout(nodes, edges);
    nodes.forEach((n,i)=>{ n.p = P[i]; n.v = { x:0, y:0, z:0, sx:0, sy:0, s:1, r:0 }; n.sprite = faceSprite(n, null); n.rgb = hexRgb(n.color); });
    const maxW = Math.max(1, ...edges.map(e=>e.w));
    const neigh = {}; nodes.forEach(n=> neigh[n.id] = new Set());
    edges.forEach(e=>{ neigh[e.a].add(e.b); neigh[e.b].add(e.a); });

    // fotos: se dibujan con iniciales hasta que cargan
    let alive = true;
    nodes.forEach(n=>{
      if(!n.img) return;
      const im = new Image();
      im.decoding = "async";
      im.onload = ()=>{ if(alive){ n.sprite = faceSprite(n, im); dirty = true; wake(); } };
      im.src = n.img;
    });

    container.appendChild(canvas);
    const cleanups = [()=>canvas.remove()];
    const on = (t, ev, fn, op)=>{ t.addEventListener(ev, fn, op); cleanups.push(()=>t.removeEventListener(ev, fn, op)); };

    let W = 1, H = 1, dpr = 1;
    function resize(){
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, container.clientWidth); H = Math.max(1, container.clientHeight);
      canvas.width = Math.round(W*dpr); canvas.height = Math.round(H*dpr);
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      dirty = true; wake();
    }
    if(window.ResizeObserver){ const ro = new ResizeObserver(resize); ro.observe(container); cleanups.push(()=>ro.disconnect()); }
    else on(window, "resize", resize);

    // ---- cámara: yaw/pitch, zoom ----
    let yaw = 0.5, pitch = -0.25, velYaw = 0, velPitch = 0;
    let zoom = 1, zoomTarget = 1;
    const ZMIN = 0.55, ZMAX = 2.6;
    let tween = null;          // giro hacia una persona elegida
    let lastInteract = -1e9;
    let hover = null, selected = null;
    let dirty = true;

    // el área libre (sin los paneles encima): su centro y su lado corto. Se suaviza por cuadro,
    // así un panel que cambia de alto corre la nube despacio y no a saltos
    let view = null;
    function viewTarget(){
      const ins = o.insets ? o.insets() : {};
      const top = ins.top||0, right = ins.right||0, bottom = ins.bottom||0;
      const aw = Math.max(120, W - right), ah = Math.max(120, H - top - bottom);
      return { cx:aw/2, cy:top + ah/2, fit:Math.min(aw, ah) };
    }
    function stepView(dt){
      const t = viewTarget();
      if(!view || reduced || !dt){ const same = view && Math.abs(view.cx-t.cx) + Math.abs(view.cy-t.cy) + Math.abs(view.fit-t.fit) < 0.5; view = t; return !same; }
      const k = 1 - Math.exp(-dt*7);
      const d = Math.abs(view.cx-t.cx) + Math.abs(view.cy-t.cy) + Math.abs(view.fit-t.fit);
      if(d < 0.5){ view = t; return false; }
      view = { cx:view.cx + (t.cx-view.cx)*k, cy:view.cy + (t.cy-view.cy)*k, fit:view.fit + (t.fit-view.fit)*k };
      return true;
    }
    function project(){
      if(!view) view = viewTarget();
      const { cx, cy } = view;
      const base = view.fit*0.42*zoom;   // radio de la nube en px, a profundidad 0
      const D = 3.2;
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      for(const n of nodes){
        const p = n.p;
        const x1 = p.x*cyw + p.z*syw, z1 = -p.x*syw + p.z*cyw;
        const y2 = p.y*cp - z1*sp, z2 = p.y*sp + z1*cp;
        const s = D/(D - z2);                      // z2 hacia la cámara
        n.v.x = x1; n.v.y = y2; n.v.z = z2; n.v.s = s;
        n.v.sx = cx + x1*base*s; n.v.sy = cy - y2*base*s;
        n.v.r = clamp(n.p.r*base*s, 4, 44);
      }
      return base;
    }

    function draw(){
      dirty = false;
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.clearRect(0,0,W,H);
      project();
      const focusId = hover || selected;   // pasar el mouse por alguien manda sobre el elegido
      const linked = focusId ? neigh[focusId] : null;
      const fog = z=> 0.28 + 0.72*clamp((z + 1)/2, 0, 1);   // lejos = apagado
      // líneas (las de la persona elegida, al final y encima)
      ctx.lineCap = "round";
      const hot = [];
      for(const e of edges){
        const a = byId[e.a], b = byId[e.b];
        const isHot = focusId && (e.a === focusId || e.b === focusId);
        if(isHot){ hot.push(e); continue; }
        const k = e.w/maxW;
        let al = (0.08 + 0.32*k) * fog((a.v.z + b.v.z)/2);
        if(focusId) al *= 0.25;
        ctx.strokeStyle = `rgba(${e.rgb || o.edgeRGB || "120,200,255"},${al.toFixed(3)})`;
        ctx.lineWidth = (0.6 + 2.6*k) * (a.v.s + b.v.s)/2;
        ctx.beginPath(); ctx.moveTo(a.v.sx, a.v.sy); ctx.lineTo(b.v.sx, b.v.sy); ctx.stroke();
      }
      for(const e of hot){
        const a = byId[e.a], b = byId[e.b], other = e.a === focusId ? b : a, k = e.w/maxW;
        if(e.rgb) ctx.strokeStyle = `rgba(${e.rgb},.95)`;   // la línea tiene su propio color (su tipo): se respeta
        else {
          const g = ctx.createLinearGradient(a.v.sx, a.v.sy, b.v.sx, b.v.sy);
          g.addColorStop(0, `rgba(${a.rgb.join(",")},.95)`); g.addColorStop(1, `rgba(${b.rgb.join(",")},.95)`);
          ctx.strokeStyle = g;
        }
        ctx.lineWidth = (1.4 + 3.4*k) * (a.v.s + b.v.s)/2;
        ctx.beginPath(); ctx.moveTo(a.v.sx, a.v.sy); ctx.lineTo(b.v.sx, b.v.sy); ctx.stroke();
        other._hot = true;
      }
      // nodos, de atrás hacia adelante
      const order = nodes.slice().sort((a,b)=> a.v.z - b.v.z);
      for(const n of order){
        const dim = focusId && n.id !== focusId && !(linked && linked.has(n.id));
        const f = fog(n.v.z) * (dim ? 0.28 : 1);
        const r = n.v.r * (n.id === focusId ? 1.25 : 1);
        ctx.globalAlpha = f*0.55;
        const gr = r*2.6;
        ctx.drawImage(glowSprite(n.color), n.v.sx - gr, n.v.sy - gr, gr*2, gr*2);
        ctx.globalAlpha = f;
        ctx.drawImage(n.sprite, n.v.sx - r, n.v.sy - r, r*2, r*2);
        if(n.id === focusId){
          ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeStyle = "#fff";
          ctx.beginPath(); ctx.arc(n.v.sx, n.v.sy, r + 3, 0, TAU); ctx.stroke();
        }
      }
      // nombres: el encendido y los suyos primero, después de adelante hacia atrás; uno que
      // chocaría con otro ya puesto no sale (en el centro de la nube se amontonaban)
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      const rank = n=> n.id === focusId ? 0 : (linked && linked.has(n.id)) ? 1 : 2;
      const placed = [];
      // la cara encendida tampoco se tapa con nombres ajenos
      const fn = focusId && byId[focusId];
      if(fn){ const r = fn.v.r*1.25 + 3; placed.push({ x0:fn.v.sx - r, x1:fn.v.sx + r, y0:fn.v.sy - r, y1:fn.v.sy + r }); }
      for(const n of order.slice().sort((a,b)=> rank(a) - rank(b) || b.v.z - a.v.z)){
        const isFocus = n.id === focusId, isLinked = linked && linked.has(n.id);
        const show = isFocus || isLinked || (!focusId && (n.primary || n.v.r > 10));
        if(!show) continue;
        const fs = isFocus ? 15 : clamp(Math.round(9 + n.v.r*0.18), 10, 13);
        ctx.font = n.primary || isFocus ? `600 ${fs+2}px "Cormorant Garamond", Georgia, serif` : `500 ${fs-1}px "JetBrains Mono", monospace`;
        const y = n.v.sy + n.v.r*(isFocus ? 1.25 : 1) + 4;
        const w = ctx.measureText(n.label).width + 6, h = fs + 4;
        const box = { x0:n.v.sx - w/2, x1:n.v.sx + w/2, y0:y - 1, y1:y + h };
        if(!isFocus && placed.some(q=> box.x0 < q.x1 && box.x1 > q.x0 && box.y0 < q.y1 && box.y1 > q.y0)) continue;
        placed.push(box);
        const dim = focusId && !isFocus && !isLinked;
        ctx.globalAlpha = fog(n.v.z) * (dim ? 0.3 : 1);
        ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(1,6,15,.92)";
        ctx.strokeText(n.label, n.v.sx, y);
        ctx.fillStyle = isFocus ? "#ffffff" : n.primary ? "#eaf3ff" : "#b9cde6";
        ctx.fillText(n.label, n.v.sx, y);
      }
      ctx.globalAlpha = 1;
      nodes.forEach(n=>{ n._hot = false; });
    }

    // ---- elegir a alguien: el más cercano a la cámara cuyo círculo toca el punto ----
    function pick(x, y, isTouch){
      let best = null, bestZ = -Infinity;
      for(const n of nodes){
        const hr = Math.max(n.v.r, isTouch ? 20 : 10);
        const dx = x - n.v.sx, dy = y - n.v.sy;
        if(dx*dx + dy*dy <= hr*hr && n.v.z > bestZ){ best = n; bestZ = n.v.z; }
      }
      return best ? best.id : null;
    }
    // girar la nube hasta dejar a esa persona al frente
    function bringToFront(id){
      const p = byId[id].p;
      const ty = Math.atan2(-p.x, p.z);
      const r = Math.hypot(p.x, p.z);
      const tp = clamp(Math.atan2(p.y, r), -1.2, 1.2);
      if(reduced){ yaw = ty; pitch = tp; dirty = true; wake(); return; }
      tween = { y0:yaw, p0:pitch, dy:wrap(ty - yaw), dp:tp - pitch, t0:performance.now(), dur:900 };
      velYaw = velPitch = 0;
      wake();
    }
    function setHover(id){ if(id === hover) return; hover = id; canvas.style.cursor = id ? "pointer" : (drag ? "grabbing" : "grab"); if(o.onHover) o.onHover(id); dirty = true; wake(); }
    function select(id){
      selected = id;
      if(o.onSelect) o.onSelect(id);
      if(id) bringToFront(id);
      dirty = true; wake();
    }

    // ---- puntero: arrastrar gira, toque limpio elige, dos dedos acercan ----
    const pts = new Map();
    let drag = null, pinch = null;
    const rect = ()=> canvas.getBoundingClientRect();
    on(canvas, "pointerdown", e=>{
      if(e.button !== undefined && e.button !== 0) return;
      const rc = rect();
      pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
      try{ canvas.setPointerCapture(e.pointerId); }catch(err){}
      if(pts.size === 2){
        const [a,b] = [...pts.values()];
        pinch = { d0:Math.hypot(a.x-b.x, a.y-b.y) || 1, z0:zoomTarget };
        drag = null; velYaw = velPitch = 0;
        return;
      }
      drag = { id:e.pointerId, x0:e.clientX, y0:e.clientY, x:e.clientX, y:e.clientY, t:performance.now(), moved:false, touch:e.pointerType !== "mouse", rx:rc.left, ry:rc.top };
      velYaw = velPitch = 0; tween = null;
      lastInteract = performance.now();
      canvas.style.cursor = "grabbing";
      wake();
    });
    on(canvas, "pointermove", e=>{
      if(pts.has(e.pointerId)) pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
      if(pinch && pts.size >= 2){
        const [a,b] = [...pts.values()];
        zoomTarget = clamp(pinch.z0 * Math.hypot(a.x-b.x, a.y-b.y)/pinch.d0, ZMIN, ZMAX);
        lastInteract = performance.now(); wake();
        return;
      }
      if(!drag || e.pointerId !== drag.id){
        if(e.pointerType === "mouse" && o.canHover){ const rc = rect(); setHover(pick(e.clientX - rc.left, e.clientY - rc.top, false)); }
        return;
      }
      const now = performance.now();
      if(!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6){ drag.moved = true; drag.x = e.clientX; drag.y = e.clientY; drag.t = now; }
      if(!drag.moved) return;
      const k = Math.PI / Math.max(320, Math.min(W, H)) * 1.1;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y, dt = Math.max(8, now - drag.t)/1000;
      yaw += dx*k; pitch = clamp(pitch + dy*k, -1.35, 1.35);
      velYaw = velYaw*0.5 + (dx*k/dt)*0.5; velPitch = velPitch*0.5 + (dy*k/dt)*0.5;
      drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
      lastInteract = now; dirty = true; wake();
    });
    function end(e, cancelled){
      pts.delete(e.pointerId);
      if(pinch){ if(pts.size < 2) pinch = null; lastInteract = performance.now(); return; }
      if(!drag || e.pointerId !== drag.id) return;
      const now = performance.now();
      if(now - drag.t > 80) velYaw = velPitch = 0;
      if(reduced) velYaw = velPitch = 0;
      const clean = !drag.moved && !cancelled;
      const touch = drag.touch;
      drag = null;
      canvas.style.cursor = hover ? "pointer" : "grab";
      lastInteract = now;
      if(clean){
        const rc = rect();
        const id = pick(e.clientX - rc.left, e.clientY - rc.top, touch);
        if(!id){ select(null); }
        else if(o.canHover && !touch){ if(o.onOpen) o.onOpen(id); }      // desktop: clic abre la ficha
        else if(selected === id){ if(o.onOpen) o.onOpen(id); }            // touch: 2º toque abre
        else select(id);                                                  // touch: 1er toque elige
      }
      wake();
    }
    on(canvas, "pointerup", e=>end(e, false));
    on(canvas, "pointercancel", e=>end(e, true));
    on(canvas, "pointerleave", e=>{ if(e.pointerType === "mouse" && !drag) setHover(null); });
    canvas.style.cursor = "grab";
    wheelHook = e=>{
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1;
      const d = clamp(e.deltaY*unit, -200, 200);
      zoomTarget = clamp(zoomTarget * Math.exp(-d*(e.ctrlKey ? 0.01 : 0.0012)), ZMIN, ZMAX);
      lastInteract = performance.now(); wake();
      return true;
    };

    // ---- bucle ----
    let raf = null, lastT = 0, visible = !document.hidden;
    function wake(){ if(raf === null && visible && alive){ lastT = 0; raf = requestAnimationFrame(frame); } }
    function frame(now){
      raf = null;
      const dt = lastT ? Math.min((now - lastT)/1000, 0.05) : 0;
      lastT = now;
      let moving = false;
      if(tween){
        const t = clamp((now - tween.t0)/tween.dur, 0, 1), e = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;
        yaw = tween.y0 + tween.dy*e; pitch = tween.p0 + tween.dp*e;
        if(t >= 1) tween = null;
        moving = true;
      } else if(!drag && !pinch){
        if(velYaw || velPitch){
          yaw += velYaw*dt; pitch = clamp(pitch + velPitch*dt, -1.35, 1.35);
          const dec = Math.exp(-dt*3);
          velYaw *= dec; velPitch *= dec;
          if(Math.abs(velYaw) < 0.003 && Math.abs(velPitch) < 0.003) velYaw = velPitch = 0;
          moving = true;
        }
        // en reposo gira sola, despacio (no con alguien elegido: se le quedaría de lado; ni con
        // el mouse encima de alguien: se le escaparía de debajo antes del clic)
        if(hover) lastInteract = now;
        else if(!reduced && !selected){
          const idle = clamp((now - lastInteract - 1500)/1500, 0, 1);
          if(idle > 0){ yaw += 0.09*idle*dt; moving = true; }
        }
      }
      if(stepView(dt)) moving = true;
      if(Math.abs(zoomTarget - zoom) > 0.0005){ zoom += (zoomTarget - zoom)*(dt ? 1 - Math.exp(-dt*10) : 1); moving = true; }
      if(moving || dirty || drag || pinch) draw();
      if((moving || drag || pinch || !reduced) && visible) raf = requestAnimationFrame(frame);
    }
    on(document, "visibilitychange", ()=>{ visible = !document.hidden; if(visible) wake(); else if(raf !== null){ cancelAnimationFrame(raf); raf = null; } });
    resize();
    draw();

    const api = {
      select: id=>{ select(id); },
      dispose(){
        alive = false;
        if(raf !== null) cancelAnimationFrame(raf);
        raf = null;
        if(wheelHook) wheelHook = null;
        cleanups.forEach(fn=>{ try{ fn(); }catch(e){} });
      }
    };
    current = api;
    return api;
  }
  function unmountNet3D(){ if(current){ const c = current; current = null; c.dispose(); } }

  window.mountNet3D = mountNet3D;
  window.unmountNet3D = unmountNet3D;
  window.net3dWheel = net3dWheel;
})();
