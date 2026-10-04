/* ===== SISTEMA SOLAR 3D (prototipo F0) =====
   mountSolar(container, opts) / unmountSolar()

   Escena: el Hoyo (agujero negro = Armagedón) al centro, con su disco de acreción; seis
   planetas S0..S5 en órbitas inclinadas, S0 la más lejana y S5 la más cercana (el tiempo cae
   hacia el Hoyo); y el "hilo del tiempo", una curva de luz que los une en orden.

   Three.js vive en vendor/ y se carga con import() dinámico la primera vez que se monta, así
   la página que no muestra el sistema no paga los ~190 KB (gzip). Script clásico, sin módulos,
   igual que app.js: expone mountSolar/unmountSolar en window.

   Todo lo que se crea al montar (renderer, geometrías, materiales, texturas, listeners, el
   bucle rAF, observers y nodos del DOM) se registra para que unmountSolar() lo libere entero. */
(function(){
  // la ruta de three se resuelve contra la URL de ESTE script, no la de la página que lo carga
  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || location.href;
  const THREE_URL = new URL("vendor/three/three.module.min.js", SCRIPT_SRC).href;
  let threePromise = null;
  function loadThree(){
    if(!threePromise) threePromise = import(THREE_URL).catch(err=>{ threePromise = null; throw err; });
    return threePromise;
  }

  let current = null;   // { token, dispose } del montaje vivo

  function cssVar(name, fallback){
    try{
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    }catch(e){ return fallback; }
  }

  async function mountSolar(container, opts){
    opts = opts || {};
    unmountSolar();
    const token = {};
    current = { token, dispose: null };

    const THREE = await loadThree();
    // se desmontó (o se volvió a montar) mientras three cargaba: no construir nada
    if(!current || current.token !== token) return null;

    const dispose = build(THREE, container, opts);
    current.dispose = dispose;
    return { unmount: unmountSolar };
  }

  function unmountSolar(){
    if(!current) return;
    const c = current; current = null;
    if(c.dispose) c.dispose();
  }

  /* ---------- texturas generadas en canvas ---------- */
  function glowTexture(THREE){
    const s = 128, cv = document.createElement("canvas"); cv.width = cv.height = s;
    const g = cv.getContext("2d");
    const grad = g.createRadialGradient(s/2,s/2,0, s/2,s/2,s/2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.18, "rgba(255,255,255,.55)");
    grad.addColorStop(0.45, "rgba(255,255,255,.14)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0,0,s,s);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  // anillo de fotones: un aro fino y brillante justo por fuera de la sombra del Hoyo
  function photonRingTexture(THREE, cyan, violet){
    const s = 256, cv = document.createElement("canvas"); cv.width = cv.height = s;
    const g = cv.getContext("2d");
    const grad = g.createRadialGradient(s/2,s/2,0, s/2,s/2,s/2);
    grad.addColorStop(0.00, "rgba(0,0,0,0)");
    grad.addColorStop(0.36, "rgba(0,0,0,0)");
    grad.addColorStop(0.405, "rgba(235,250,255,1)");
    grad.addColorStop(0.44, hexA(cyan,.75));
    grad.addColorStop(0.58, hexA(violet,.22));
    grad.addColorStop(1.00, hexA(violet,0));
    g.fillStyle = grad; g.fillRect(0,0,s,s);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  // bandas tipo gigante gaseoso, teñidas con el color de la temporada
  function planetTexture(THREE, hex, seed){
    const w = 256, h = 128, cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const g = cv.getContext("2d");
    let r = seed*9301+49297;
    const rnd = ()=>{ r = (r*9301+49297) % 233280; return r/233280; };
    const base = new THREE.Color(hex);
    const hsl = {}; base.getHSL(hsl);
    for(let y=0; y<h; ){
      const bh = 3 + Math.floor(rnd()*14);
      const l = Math.min(0.85, Math.max(0.12, hsl.l + (rnd()-0.5)*0.32));
      const s = Math.min(1, Math.max(0, hsl.s + (rnd()-0.5)*0.2));
      const c = new THREE.Color().setHSL(hsl.h + (rnd()-0.5)*0.04, s, l);
      g.fillStyle = "#"+c.getHexString();
      g.fillRect(0, y, w, bh);
      y += bh;
    }
    // un poco de turbulencia para que las bandas no se vean de regla
    g.globalAlpha = 0.18;
    for(let i=0;i<60;i++){
      g.fillStyle = rnd()<0.5 ? "#ffffff" : "#000000";
      g.beginPath();
      g.ellipse(rnd()*w, rnd()*h, 8+rnd()*30, 1+rnd()*3, 0, 0, Math.PI*2);
      g.fill();
    }
    g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function hexA(hex, a){
    const n = parseInt(hex.replace("#",""),16);
    return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
  }

  /* ---------- shaders ---------- */
  const DISC_VERT = `
    varying vec2 vP;
    void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
  const DISC_FRAG = `
    uniform float uTime, uInner, uOuter;
    uniform vec3 uHot, uCyan, uViolet;
    varying vec2 vP;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), u.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x), u.y);
    }
    void main(){
      float r = length(vP);
      float t = clamp((r-uInner)/(uOuter-uInner), 0.0, 1.0);
      float a = atan(vP.y, vP.x);
      // rotación diferencial: lo de adentro gira más rápido
      float sw = a + uTime * (0.55/(0.25+t));
      // muestreo en (cos,sin) para que el ruido sea periódico y no haya costura en ±PI
      vec2 q = vec2(cos(sw), sin(sw)) * (2.5 + t*9.0);
      float n = noise(q)*0.6 + noise(q*2.3 + 7.0)*0.4;
      float body = pow(1.0-t, 1.35) * smoothstep(0.0, 0.05, t);
      float beam = 0.72 + 0.38*cos(a - 0.7);   // un lado más brillante (beaming)
      float inten = body * (0.5 + 0.85*n) * beam;
      vec3 col = mix(uHot, uCyan, smoothstep(0.0, 0.3, t));
      col = mix(col, uViolet, smoothstep(0.32, 1.0, t));
      gl_FragColor = vec4(col, clamp(inten*2.1, 0.0, 1.0));
      #include <colorspace_fragment>
    }`;
  const THREAD_VERT = `
    uniform float uSoft;
    varying float vU; varying float vFacing;
    void main(){
      vU = uv.x;
      vec4 mv = modelViewMatrix * vec4(position,1.0);
      vec3 n = normalize(normalMatrix * normal);
      vFacing = pow(abs(dot(n, normalize(-mv.xyz))), uSoft);
      gl_Position = projectionMatrix * mv;
    }`;
  const THREAD_FRAG = `
    uniform float uTime, uAlpha;
    uniform vec3 uColors[6];
    varying float vU; varying float vFacing;
    void main(){
      float f = clamp(vU, 0.0, 1.0) * 5.0;
      float fi = min(floor(f), 4.0);
      int i = int(fi);
      vec3 c = mix(uColors[i], uColors[i+1], smoothstep(0.0, 1.0, f - fi));
      // pulsos de luz que viajan de S0 hacia S5
      float pulse = pow(0.5 + 0.5*sin((vU*3.0 - uTime*0.22) * 6.2831853), 10.0);
      float a = uAlpha * (0.6 + 1.3*pulse) * vFacing;
      a *= smoothstep(0.0, 0.04, vU) * smoothstep(1.0, 0.96, vU);
      gl_FragColor = vec4(mix(c, vec3(1.0), 0.3 + 0.35*pulse), clamp(a, 0.0, 1.0));
      #include <colorspace_fragment>
    }`;

  /* ---------- escena ---------- */
  function build(THREE, container, opts){
    const seasons = (opts.seasons || (typeof DATA !== "undefined" ? DATA.seasons : [])).slice(0, 6);
    const hrefFor = opts.hrefFor || (id => `#/season/${id}`);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const CYAN = cssVar("--amber", "#68d8ff");
    const VIOLET = cssVar("--violet", "#6f8fe8");
    const TEAL = cssVar("--teal", "#33d6e0");

    const cleanups = [];   // funciones a correr al desmontar (listeners, observers, DOM)
    const textures = [];
    const on = (target, type, fn, o)=>{ target.addEventListener(type, fn, o); cleanups.push(()=>target.removeEventListener(type, fn, o)); };

    // ---- DOM ----
    const root = document.createElement("div");
    root.className = "solar-root";
    const canvas = document.createElement("canvas");
    canvas.className = "solar-canvas";
    // el navegador se queda con el gesto vertical (scroll); el horizontal nos llega a nosotros
    canvas.style.touchAction = "pan-y";
    const labelsLayer = document.createElement("div");
    labelsLayer.className = "solar-labels";
    root.appendChild(canvas); root.appendChild(labelsLayer);
    container.appendChild(root);
    cleanups.push(()=>root.remove());

    // ---- renderer / cámara ----
    const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true, powerPreference:"high-performance" });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);

    // todo el sistema cuelga de `world`; arrastrar rota `world`, la cámara no se mueve
    const world = new THREE.Group();
    // vista inicial desde arriba; en pantallas verticales más inclinada, para que el sistema
    // ocupe el alto disponible en vez de quedar como una franja angosta
    const portrait = container.clientWidth < container.clientHeight*0.8;
    world.rotation.x = portrait ? 0.78 : 0.5;
    scene.add(world);

    scene.add(new THREE.AmbientLight(0x8fb4ff, 0.55));
    const coreLight = new THREE.PointLight(new THREE.Color(CYAN), 3.2, 0, 0); // el disco ilumina a los planetas
    world.add(coreLight);

    const glowTex = glowTexture(THREE); textures.push(glowTex);

    // ---- el Hoyo ----
    const HOLE_R = 0.9, DISC_IN = 1.08, DISC_OUT = 2.85;
    const hole = new THREE.Mesh(new THREE.SphereGeometry(HOLE_R, 48, 32), new THREE.MeshBasicMaterial({ color:0x000000 }));
    hole.renderOrder = 1;
    world.add(hole);

    const discUniforms = {
      uTime:{ value: 0 }, uInner:{ value: DISC_IN }, uOuter:{ value: DISC_OUT },
      uHot:{ value: new THREE.Color("#f2fbff") }, uCyan:{ value: new THREE.Color(CYAN) }, uViolet:{ value: new THREE.Color(VIOLET) }
    };
    const disc = new THREE.Mesh(
      new THREE.RingGeometry(DISC_IN, DISC_OUT, 160, 8),
      new THREE.ShaderMaterial({ uniforms: discUniforms, vertexShader: DISC_VERT, fragmentShader: DISC_FRAG,
        transparent:true, depthWrite:false, side:THREE.DoubleSide, blending:THREE.AdditiveBlending })
    );
    disc.rotation.x = -Math.PI/2;
    disc.rotation.z = 0.0;
    disc.renderOrder = 2;
    world.add(disc);

    // halo y anillo de fotones: sprites (siempre miran a la cámara) centrados en el Hoyo; la
    // esfera negra los tapa por dentro, así que solo se ve el aro alrededor de la sombra
    const ringTex = photonRingTexture(THREE, CYAN, VIOLET); textures.push(ringTex);
    const ringSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending }));
    ringSprite.scale.setScalar(2 * HOLE_R * 1.03 / 0.405);
    ringSprite.renderOrder = 3;
    world.add(ringSprite);
    const haloSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(VIOLET), transparent:true, opacity:0.55, depthWrite:false, blending:THREE.AdditiveBlending }));
    haloSprite.scale.setScalar(9);
    world.add(haloSprite);
    const haloCyan = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(TEAL), transparent:true, opacity:0.35, depthWrite:false, blending:THREE.AdditiveBlending }));
    haloCyan.scale.setScalar(5.2);
    world.add(haloCyan);

    // ---- planetas ----
    // S0 afuera, S5 adentro. Inclinaciones y ángulos fijos (dibujados, no aleatorios) para que
    // el hilo del tiempo trace una espiral legible hacia el Hoyo.
    const ORBIT_R = [7.4, 6.5, 5.6, 4.75, 3.95, 3.2];
    const INC_X   = [ 0.30, -0.16,  0.12, -0.26,  0.20, -0.08];
    const INC_Z   = [-0.10,  0.22, -0.24,  0.08,  0.28, -0.18];
    const ANGLE0  = [ 2.55,  1.35,  0.15, -1.05, -2.25, -3.45];
    const planets = [];
    const orbitMat = new THREE.LineBasicMaterial({ color: new THREE.Color(CYAN), transparent:true, opacity:0.16, depthWrite:false });

    seasons.forEach((s, i)=>{
      const R = ORBIT_R[i];
      const orbit = new THREE.Group();
      orbit.rotation.set(INC_X[i], 0, INC_Z[i]);
      world.add(orbit);

      const pts = [];
      for(let k=0;k<128;k++){ const a = k/128*Math.PI*2; pts.push(new THREE.Vector3(Math.cos(a)*R, 0, Math.sin(a)*R)); }
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), orbitMat);
      orbit.add(ring);

      const count = (s.events || []).length;
      const r = 0.22 + 0.17*Math.sqrt(Math.max(1, count));
      const color = s.color || CYAN;
      const tex = planetTexture(THREE, color, i+1); textures.push(tex);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 40, 28),
        new THREE.MeshStandardMaterial({ map: tex, roughness:0.85, metalness:0.0,
          emissive: new THREE.Color(color), emissiveIntensity: 0.16 })
      );
      mesh.rotation.z = 0.35;   // eje inclinado, para que las bandas no queden de regla
      const a0 = ANGLE0[i];
      mesh.position.set(Math.cos(a0)*R, 0, Math.sin(a0)*R);
      orbit.add(mesh);

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(color), transparent:true, opacity:0.6, depthWrite:false, blending:THREE.AdditiveBlending }));
      glow.scale.setScalar(r*5.2);
      glow.position.copy(mesh.position);
      orbit.add(glow);

      const label = document.createElement("a");
      label.className = "solar-label";
      label.href = hrefFor(s.id);
      label.style.setProperty("--pcolor", color);
      label.innerHTML = `<span class="solar-code"></span><span class="solar-title"></span>`;
      label.firstChild.textContent = s.code || `S${s.id}`;
      label.lastChild.textContent = s.title || "";
      labelsLayer.appendChild(label);

      planets.push({ season: s, mesh, glow, r, label, world: new THREE.Vector3(), hover:false });
    });

    // ---- hilo del tiempo ----
    let threadMeshes = [];
    const threadUniformsBase = {
      uTime:{ value: 0 },
      uColors:{ value: seasons.map(s=> new THREE.Color(s.color || CYAN)) }
    };
    while(threadUniformsBase.uColors.value.length < 6) threadUniformsBase.uColors.value.push(new THREE.Color(CYAN));
    if(planets.length >= 2){
      world.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(world.matrixWorld).invert();
      const pts = planets.map(p=> p.mesh.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv));
      const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
      const mk = (radius, alpha, soft)=> new THREE.Mesh(
        new THREE.TubeGeometry(curve, 280, radius, 8, false),
        new THREE.ShaderMaterial({
          uniforms: { uTime: threadUniformsBase.uTime, uColors: threadUniformsBase.uColors, uAlpha:{ value: alpha }, uSoft:{ value: soft } },
          vertexShader: THREAD_VERT, fragmentShader: THREAD_FRAG,
          transparent:true, depthWrite:false, blending:THREE.AdditiveBlending
        })
      );
      threadMeshes = [ mk(0.022, 0.95, 0.6), mk(0.11, 0.32, 2.2) ];
      threadMeshes.forEach(m=> world.add(m));
    }

    // ---- tamaño / encuadre ----
    let W = 1, H = 1;
    function resize(){
      W = Math.max(1, container.clientWidth); H = Math.max(1, container.clientHeight);
      renderer.setSize(W, H, false);
      camera.aspect = W/H;
      // alejar la cámara lo justo para que el sistema completo quepa a lo ancho y a lo alto
      const extent = ORBIT_R[0] + 0.8;
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      // en vertical se acepta que las órbitas exteriores rocen el borde: si no, queda diminuto
      const dV = (extent*0.82)/tanV, dH = extent*(camera.aspect < 0.8 ? 0.86 : 1)/(tanV*camera.aspect);
      camera.position.z = Math.max(dV, dH) + 1.5;
      camera.updateProjectionMatrix();
      wake();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    cleanups.push(()=>ro.disconnect());

    // ---- interacción ----
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const Y_AXIS = new THREE.Vector3(0,1,0), X_AXIS = new THREE.Vector3(1,0,0);
    const qTmp = new THREE.Quaternion();
    let velYaw = 0, velPitch = 0;          // rad/s
    let drag = null;                        // { id, type, x0, y0, x, y, t, t0, moved }
    let lastInteract = -1e9;
    let hovered = null;

    function rotateBy(yaw, pitch){
      if(yaw){ qTmp.setFromAxisAngle(Y_AXIS, yaw); world.quaternion.premultiply(qTmp); }
      if(pitch){ qTmp.setFromAxisAngle(X_AXIS, pitch); world.quaternion.premultiply(qTmp); }
    }
    function radPerPx(){ return Math.PI / Math.max(360, W) * 1.15; }

    function pick(clientX, clientY){
      const rect = canvas.getBoundingClientRect();
      ndc.set(((clientX-rect.left)/rect.width)*2-1, -((clientY-rect.top)/rect.height)*2+1);
      raycaster.setFromCamera(ndc, camera);
      const ray = raycaster.ray;
      let best = null, bestD = Infinity;
      planets.forEach(p=>{
        const hitR = Math.max(p.r*1.5, 0.55);   // blanco generoso, sobre todo para el dedo
        if(ray.distanceSqToPoint(p.world) > hitR*hitR) return;
        const d = ray.origin.distanceTo(p.world);
        if(d < bestD){ bestD = d; best = p; }
      });
      return best;
    }
    function setHover(p){
      if(p === hovered) return;
      if(hovered){ hovered.hover = false; hovered.label.classList.remove("is-hover"); }
      hovered = p;
      if(p){ p.hover = true; p.label.classList.add("is-hover"); }
      canvas.style.cursor = p ? "pointer" : (drag ? "grabbing" : "grab");
      wake();
    }

    on(canvas, "pointerdown", e=>{
      if(e.button !== undefined && e.button !== 0) return;
      drag = { id:e.pointerId, type:e.pointerType, x0:e.clientX, y0:e.clientY, x:e.clientX, y:e.clientY, t:performance.now(), t0:performance.now(), moved:false };
      if(e.pointerType !== "touch"){ try{ canvas.setPointerCapture(e.pointerId); }catch(err){} canvas.style.cursor = "grabbing"; }
      velYaw = velPitch = 0;
      lastInteract = performance.now();
      wake();
    });
    on(canvas, "pointermove", e=>{
      if(!drag || e.pointerId !== drag.id){
        if(e.pointerType === "mouse") setHover(pick(e.clientX, e.clientY));
        return;
      }
      const now = performance.now();
      const dx = e.clientX - drag.x;
      // en touch solo el gesto horizontal rota; el vertical es del scroll de la página
      const dy = drag.type === "touch" ? 0 : e.clientY - drag.y;
      const dt = Math.max(1, now - drag.t)/1000;
      const k = radPerPx();
      rotateBy(dx*k, dy*k);
      velYaw = velYaw*0.6 + (dx*k/dt)*0.4;
      velPitch = velPitch*0.6 + (dy*k/dt)*0.4;
      drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
      if(Math.hypot(e.clientX-drag.x0, e.clientY-drag.y0) > 6) drag.moved = true;
      lastInteract = now;
      wake();
    });
    function endDrag(e, cancelled){
      if(!drag || e.pointerId !== drag.id) return;
      const now = performance.now();
      if(now - drag.t > 90){ velYaw = velPitch = 0; }   // se detuvo antes de soltar: sin inercia
      const clean = !cancelled && !drag.moved && (now - drag.t0) < 600;
      drag = null;
      canvas.style.cursor = hovered ? "pointer" : "grab";
      lastInteract = now;
      if(clean){
        const p = pick(e.clientX, e.clientY);
        if(p){ location.href = p.label.href; return; }
      }
      // inercia tope, para que un latigazo no lo deje girando como trompo
      const MAX = 6;
      velYaw = Math.max(-MAX, Math.min(MAX, velYaw));
      velPitch = Math.max(-MAX, Math.min(MAX, velPitch));
      wake();
    }
    on(canvas, "pointerup", e=>endDrag(e, false));
    on(canvas, "pointercancel", e=>endDrag(e, true));
    on(canvas, "pointerleave", e=>{ if(e.pointerType === "mouse" && !drag) setHover(null); });
    canvas.style.cursor = "grab";

    // ---- bucle ----
    let raf = null, lastT = 0, simTime = 0;
    let visible = !document.hidden, inView = true;
    let dirty = true;
    const vTmp = new THREE.Vector3(), vCam = new THREE.Vector3();

    function wake(){ dirty = true; if(raf === null && visible && inView) { lastT = 0; raf = requestAnimationFrame(frame); } }
    function stop(){ if(raf !== null){ cancelAnimationFrame(raf); raf = null; } }

    on(document, "visibilitychange", ()=>{ visible = !document.hidden; if(visible) wake(); else stop(); });
    if("IntersectionObserver" in window){
      const io = new IntersectionObserver(entries=>{
        inView = entries[0] ? entries[0].isIntersecting : true;
        if(inView) wake(); else stop();
      });
      io.observe(container);
      cleanups.push(()=>io.disconnect());
    }

    function updateLabels(){
      const holeWorld = vCam.setFromMatrixPosition(world.matrixWorld);
      const camPos = camera.position;
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      planets.forEach(p=>{
        vTmp.copy(p.world).project(camera);
        if(vTmp.z > 1){ p.label.style.opacity = "0"; p.label.style.visibility = "hidden"; return; }
        const x = (vTmp.x*0.5+0.5)*W, y = (-vTmp.y*0.5+0.5)*H;
        const dist = camPos.distanceTo(p.world);
        const rpx = p.r * (H/2) / (dist*tanV);
        // ¿lo tapa el Hoyo? distancia del centro del Hoyo al segmento cámara→planeta
        const seg = vTmp.copy(p.world).sub(camPos);
        const segLen = seg.length(); seg.divideScalar(segLen);
        const tProj = holeWorld.clone().sub(camPos).dot(seg);
        let hidden = false;
        if(tProj > 0 && tProj < segLen){
          const closest = camPos.clone().addScaledVector(seg, tProj);
          if(closest.distanceTo(holeWorld) < HOLE_R*1.05) hidden = true;
        }
        // los planetas del fondo quedan un poco más apagados
        const depth = (dist - camPos.length())/ORBIT_R[0];   // ~ -1 (cerca) .. 1 (lejos)
        const op = hidden ? 0 : Math.max(0.4, Math.min(1, 0.78 - depth*0.4));
        p.label.style.opacity = op.toFixed(2);
        p.label.style.visibility = hidden ? "hidden" : "visible";
        p.label.style.transform = `translate(${x.toFixed(1)}px, ${(y - rpx - 6).toFixed(1)}px) translate(-50%, -100%)`;
        p.label.style.zIndex = String(1000 - Math.round(dist*10));
      });
    }

    function frame(now){
      raf = null;
      const dt = lastT ? Math.min((now-lastT)/1000, 0.05) : 0;
      lastT = now;

      if(!drag){
        if(velYaw || velPitch){
          rotateBy(velYaw*dt, velPitch*dt);
          const decay = Math.exp(-dt*2.6);
          velYaw *= decay; velPitch *= decay;
          if(Math.abs(velYaw) < 0.002 && Math.abs(velPitch) < 0.002) velYaw = velPitch = 0;
        }
        if(!reduced){
          // giro propio muy lento alrededor del eje del sistema; entra suave tras soltar
          const idle = Math.min(1, Math.max(0, (now - lastInteract - 900)/2200));
          if(idle > 0){ qTmp.setFromAxisAngle(Y_AXIS, 0.05*idle*dt); world.quaternion.multiply(qTmp); }
        }
      }
      if(!reduced) simTime += dt;
      discUniforms.uTime.value = simTime;
      threadUniformsBase.uTime.value = simTime;
      planets.forEach((p, i)=>{
        if(!reduced) p.mesh.rotation.y += dt*(0.12 + i*0.02);
        const target = p.hover ? 0.95 : 0.6;
        p.glow.material.opacity += (target - p.glow.material.opacity)*Math.min(1, dt*10 || 1);
      });

      world.updateMatrixWorld(true);
      planets.forEach(p=> p.mesh.getWorldPosition(p.world));
      renderer.render(scene, camera);
      updateLabels();
      dirty = false;

      // con reduced-motion no hay nada que animar en reposo: el bucle se duerme hasta la
      // próxima interacción (wake). Sin reduced-motion sigue (auto-giro, disco, pulsos).
      const settling = drag || velYaw || velPitch || planets.some(p=> Math.abs((p.hover?0.95:0.6) - p.glow.material.opacity) > 0.01);
      if((!reduced || settling || dirty) && visible && inView) raf = requestAnimationFrame(frame);
    }

    resize();

    // ---- desmontaje ----
    return function dispose(){
      stop();
      cleanups.forEach(fn=>{ try{ fn(); }catch(e){} });
      const mats = new Set(), geos = new Set();
      scene.traverse(o=>{
        // los Sprite comparten una geometría interna de three: no es nuestra, no se libera
        if(o.geometry && !o.isSprite) geos.add(o.geometry);
        if(o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m=>mats.add(m));
      });
      geos.forEach(g=>g.dispose());
      mats.forEach(m=>{ if(m.map) m.map.dispose(); m.dispose(); });
      textures.forEach(t=>t.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }

  window.mountSolar = mountSolar;
  window.unmountSolar = unmountSolar;
})();
