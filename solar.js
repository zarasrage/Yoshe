/* ===== SISTEMA SOLAR 3D de la home =====
   solarCapable() / mountSolar(container, opts) / unmountSolar()

   app.js lo monta en viewHome() encima de la constelación 2D (que queda de respaldo) y lo
   desmonta en render() antes de cada cambio de vista.

   solarCapable(force): ¿vale la pena intentarlo? false sin WebGL, con render por software
   (failIfMajorPerformanceCaveat), con poca memoria/CPU o con "ahorro de datos". force=true
   solo exige que exista WebGL.

   opts (todos opcionales):
     seasons          arreglo de temporadas (por defecto DATA.seasons)
     hrefFor(id)      URL de una temporada (por defecto "#/season/<id>")
     armageddonHref   URL del Armagedón (por defecto "#/armageddon")
     onMood(doom)     se llama al entrar/salir del foco del Hoyo (y con false al desmontar);
                      por defecto pone/saca body.mood-doom
     onReady()        el primer cuadro ya se pintó: recién ahí conviene mostrar la escena
     onFail(reason)   la escena dejó de servir ("context-lost", "shader", "slow"): quien
                      montó debe desmontar y volver al respaldo
     restoreView      true: retomar el ángulo guardado en sessionStorage (volver con "atrás")
     intro            false: sin la entrada (cámara desde lejos, planetas en orden)
     keysBlocked()    true mientras otra capa (modal, buscador) es dueña del teclado
     ownsGestures()   true mientras la escena es dueña de los gestos (la home, que no scrollea:
                      la rueda y el pellizco hacen zoom y
                      el dedo gira en cualquier dirección. false: la rueda y el swipe vertical
                      son del scroll, como una página normal
     force            no apagarse por lento (pruebas con ?3d=1); igual puede bajar de nivel
     quality          "high" | "medium" | "low": nivel inicial (por defecto, según el equipo)
     onQuality(q)     se llama con el nivel al montar y cada vez que baja
     bloom            false: sin bloom aunque el nivel sea alto

   Calidad por niveles (ver TIERS): alto = bloom + DPR hasta 1.5 + shaders completos; medio =
   sin bloom, DPR hasta 1.5, menos octavas de ruido; bajo = DPR 1, lo mínimo de ruido. El nivel
   inicial sale del equipo y después solo BAJA, nunca sube (no hay oscilación), si el ritmo de
   cuadros medido en vivo no da. En el nivel bajo, si ni así da, onFail("slow").

   Batería: se dibuja al ritmo de la pantalla siempre (se probó bajar a 30fps en reposo en
   táctiles y se notaba);
   el bucle se detiene del todo fuera de pantalla o con la pestaña oculta (en el foco sigue animado).

   Carga: en la home, three.js no se pide hasta que la página ya pintó y está ociosa. Desde las
   otras vistas, app.js lo precarga con preloadSolar() (<link rel="modulepreload"
   fetchpriority="low">, tras el load), y el import() de la home después reusa esa descarga.

   Interacción: arrastrar rota (yaw libre, pitch acotado), con inercia; clic/toque/Enter en
   un planeta o en el Hoyo abre el "foco": la cámara vuela hasta el objetivo y un panel
   muestra la temporada (o el Armagedón). Esc, clic en el vacío o "←" vuelven. El ángulo se
   guarda en sessionStorage para volver igual con "atrás".

   Escena: el Hoyo (agujero negro = Armagedón) al centro, con disco de acreción, anillo de
   fotones y la imagen "lenteada" del disco que se curva por encima y por debajo de la sombra;
   seis planetas S0..S5 en órbitas inclinadas, S0 la más lejana y S5 la más cercana (el tiempo
   cae hacia el Hoyo); y el "hilo del tiempo", una curva de luz que los une en orden.

   Todo el arte es procedural (shaders), sin texturas de imagen. Three.js vive en vendor/ y se
   carga con import() dinámico la primera vez que se monta. En desktop se carga además el bloom
   (vendor/three/postprocessing.min.js); en móvil el brillo sale de sprites aditivos, que cuestan
   casi nada. Si el bloom no sostiene el framerate, se apaga solo y se vuelve a los sprites.

   Script clásico, sin módulos, igual que app.js (index.html lo carga entre data.js y app.js):
   expone solarCapable/mountSolar/unmountSolar en window. Solo three.js es ESM y entra con
   import() recién al montar, así que las otras vistas nunca lo descargan.
   Todo lo que se crea al montar (renderer, composer, geometrías, materiales, texturas,
   listeners, el bucle rAF, observers y nodos del DOM) se libera en unmountSolar(). */
(function(){
  // las rutas de vendor/ se resuelven contra la URL de ESTE script, no la de la página
  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || location.href;
  const THREE_URL = new URL("vendor/three/three.module.min.js", SCRIPT_SRC).href;
  const POST_URL = new URL("vendor/three/postprocessing.min.js", SCRIPT_SRC).href;
  const cache = {};
  function load(url){
    if(!cache[url]) cache[url] = import(url).catch(err=>{ delete cache[url]; throw err; });
    return cache[url];
  }

  let current = null;   // { token, dispose } del montaje vivo
  let wheelHook = null; // zoom con la rueda del montaje vivo (ver solarWheel)
  // app.js le pasa la rueda mientras la home está en modo galaxia; true = la escena la usó
  function solarWheel(e){ return wheelHook ? wheelHook(e) : false; }

  let capable = null;
  function solarCapable(force){
    if(!force && capable !== null) return capable;
    let ok = false;
    try{
      const nav = navigator, conn = nav.connection;
      const weak = (conn && conn.saveData) || (nav.deviceMemory && nav.deviceMemory < 2) ||
        (nav.hardwareConcurrency && nav.hardwareConcurrency < 4);
      if(force || !weak){
        // sonda: un contexto de prueba que se suelta en el acto. Con failIfMajorPerformanceCaveat
        // el navegador dice que no si renderizaría por software (sin GPU real)
        const cv = document.createElement("canvas");
        const attrs = force ? {} : { failIfMajorPerformanceCaveat:true };
        const gl = cv.getContext("webgl2", attrs) || cv.getContext("webgl", attrs);
        ok = !!gl;
        if(gl){ const ext = gl.getExtension("WEBGL_lose_context"); if(ext) ext.loseContext(); }
      }
    }catch(e){ ok = false; }
    if(!force) capable = ok;
    return ok;
  }

  function cssVar(name, fallback){
    try{
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    }catch(e){ return fallback; }
  }

  // mouse fino y pantalla ancha = desktop; todo lo demás (teléfonos, tablets) se trata como móvil
  function isDesktop(){
    try{
      return window.matchMedia("(hover: hover) and (pointer: fine)").matches && window.innerWidth >= 900;
    }catch(e){ return false; }
  }

  // niveles de calidad. dpr: tope del devicePixelRatio; detail: octavas de ruido y capas de
  // cráteres/grietas en los shaders (2 completo, 1 menos, 0 mínimo); bloom: solo en alto
  // Ojo con el DPR: los teléfonos tienen pantallas 3x, y bajo ~1.5 la escena se ve borrosa y
  // los anillos dentados (pasó en un iPhone con dpr 1). El ahorro grande está en el bloom y en
  // el detalle de los shaders, no en dibujar a baja resolución.
  const TIERS = {
    high:   { dpr:2,    detail:2, bloom:true  },
    medium: { dpr:2,    detail:1, bloom:false },
    low:    { dpr:1.5,  detail:0, bloom:false },
  };
  const TIER_DOWN = { high:"medium", medium:"low", low:null };
  function initialTier(){
    const nav = navigator;
    // Safari no informa deviceMemory, y hardwareConcurrency no dice nada útil en iOS: sin el
    // dato no se castiga (antes un iPhone partía en "low" por eso). El ritmo medido en vivo
    // corrige después si hace falta
    const mem = nav.deviceMemory || 8, cores = nav.hardwareConcurrency || 8;
    if(isDesktop()) return (mem >= 4 && cores >= 4) ? "high" : "medium";
    // teléfonos y tablets nunca parten en alto (sin bloom); "low" solo con poca memoria declarada
    return mem <= 2 ? "low" : "medium";
  }

  // precarga de baja prioridad: no compite con el primer pintado ni con las fotos
  const preloaded = {};
  function preloadSolar(withPost){
    try{
      const urls = [THREE_URL];
      if(withPost === undefined ? isDesktop() : withPost) urls.push(POST_URL);
      urls.forEach(u=>{
        if(preloaded[u]) return;
        preloaded[u] = true;
        const l = document.createElement("link");
        l.rel = "modulepreload"; l.href = u;
        l.setAttribute("fetchpriority", "low");
        document.head.appendChild(l);
      });
    }catch(e){ /* sin precarga: el import() la hace igual */ }
  }
  // espera a que la página haya pintado (dos rAF) y esté ociosa, con tope de medio segundo
  function afterFirstPaint(){
    return new Promise(res=>{
      const go = ()=>{
        if(window.requestIdleCallback) requestIdleCallback(()=>res(), { timeout:500 });
        else setTimeout(res, 50);
      };
      requestAnimationFrame(()=>requestAnimationFrame(go));
    });
  }

  async function mountSolar(container, opts){
    opts = opts || {};
    unmountSolar();
    const token = {};
    current = { token, dispose: null };

    const tier = TIERS[opts.quality] ? opts.quality : initialTier();
    const bloom = TIERS[tier].bloom && opts.bloom !== false;
    // la 2D ya está en pantalla: three.js espera a que la página pinte y quede ociosa. Acá
    // (en la home) se pide con la prioridad normal de un módulo: con fetchpriority="low"
    // quedaba en la cola detrás de las fotos del elenco y el 3D llegaba segundos después
    await afterFirstPaint();
    if(!current || current.token !== token) return null;
    const THREE = await load(THREE_URL);
    let POST = null;
    if(bloom){
      try{ POST = await load(POST_URL); }catch(e){ POST = null; /* sin bloom, con sprites */ }
    }
    // se desmontó (o se volvió a montar) mientras cargaba: no construir nada
    if(!current || current.token !== token) return null;

    try{ current.dispose = build(THREE, POST, container, Object.assign({}, opts, { quality: tier })); }
    catch(err){ current = null; throw err; }
    return { unmount: unmountSolar };
  }

  function unmountSolar(){
    if(!current) return;
    const c = current; current = null;
    if(c.dispose) c.dispose();
  }

  /* ---------- texturas generadas en canvas (solo los sprites de brillo) ---------- */
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

  /* ---------- GLSL compartido ---------- */
  // simplex 3D (Ashima Arts / Stefan Gustavson, MIT) + fbm + worley + hashes
  const NOISE = `
    #ifndef DETAIL
    #define DETAIL 2
    #endif
    #if DETAIL >= 2
    #define FBM_OCT 5
    #define FBM3_OCT 3
    #elif DETAIL == 1
    #define FBM_OCT 4
    #define FBM3_OCT 2
    #else
    #define FBM_OCT 3
    #define FBM3_OCT 2
    #endif
    vec3 mod289(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }
    vec4 mod289(vec4 x){ return x - floor(x*(1.0/289.0))*289.0; }
    vec4 permute(vec4 x){ return mod289(((x*34.0)+10.0)*x); }
    vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314*r; }
    float snoise(vec3 v){
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0*floor(p*ns.z*ns.z);
      vec4 x_ = floor(j*ns.z);
      vec4 y_ = floor(j - 7.0*x_);
      vec4 x = x_*ns.x + ns.yyyy;
      vec4 y = y_*ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m*m;
      return 105.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }
    float fbm(vec3 p){
      float s = 0.0, a = 0.5;
      for(int k=0; k<FBM_OCT; k++){ s += a*snoise(p); p = p*2.03 + 17.1; a *= 0.5; }
      return s;
    }
    float fbm3(vec3 p){
      float s = 0.0, a = 0.5;
      for(int k=0; k<FBM3_OCT; k++){ s += a*snoise(p); p = p*2.07 + 9.7; a *= 0.5; }
      return s;
    }
    vec3 hash3(vec3 p){
      p = vec3(dot(p, vec3(127.1,311.7,74.7)), dot(p, vec3(269.5,183.3,246.1)), dot(p, vec3(113.5,271.9,124.6)));
      return fract(sin(p)*43758.5453);
    }
    float hash1(float x){ return fract(sin(x*127.1)*43758.5453); }
    float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float noise1(float x){ float i = floor(x), f = fract(x); return mix(hash1(i), hash1(i+1.0), f*f*(3.0-2.0*f)); }
    // distancias a la 1a y 2a semilla más cercana (cráteres, grietas)
    vec2 worley(vec3 p){
      vec3 i = floor(p), f = fract(p);
      float d1 = 8.0, d2 = 8.0;
      for(int x=-1; x<=1; x++) for(int y=-1; y<=1; y++) for(int z=-1; z<=1; z++){
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 r = g + hash3(i+g) - f;
        float d = dot(r, r);
        if(d < d1){ d2 = d1; d1 = d; } else if(d < d2){ d2 = d; }
      }
      return sqrt(vec2(d1, d2));
    }`;

  /* ---------- disco de acreción ---------- */
  const DISC_VERT = `
    varying vec2 vP; varying float vBeam;
    void main(){
      vP = position.xy;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      // beaming relativista: el lado del disco que viene hacia la cámara brilla más
      vec3 tangent = normalize(normalMatrix * vec3(-position.y, position.x, 0.0));
      vBeam = dot(tangent, normalize(-mv.xyz));
      gl_Position = projectionMatrix * mv;
    }`;
  const DISC_FRAG = NOISE + `
    uniform float uTime, uInner, uOuter, uReveal;
    uniform vec3 uHot, uCyan, uViolet, uDeep;
    varying vec2 vP; varying float vBeam;
    // turbulencia arrastrada por la rotación diferencial (adentro gira más rápido). Dos capas
    // desfasadas que se van cruzando (flow map), para que la cizalla no se acumule sin fin
    float swirl(float a, float t, float phase){
      float w = 0.9 / pow(0.22 + t, 1.4);
      float sw = a + w * phase;
      vec3 q = vec3(cos(sw)*1.7, sin(sw)*1.7, t*7.0);
      return fbm(q + vec3(0.0, 0.0, phase*0.05));
    }
    void main(){
      float r = length(vP);
      float t = clamp((r - uInner)/(uOuter - uInner), 0.0, 1.0);
      float a = atan(vP.y, vP.x);
      const float PERIOD = 9.0;
      float ph = uTime / PERIOD;
      float f0 = fract(ph), f1 = fract(ph + 0.5);
      float n = swirl(a, t, f0*PERIOD) * (1.0 - abs(2.0*f0 - 1.0))
              + swirl(a, t, f1*PERIOD + 37.0) * (1.0 - abs(2.0*f1 - 1.0));
      n = 0.5 + 0.5*n;
      // filamentos finos: ruido de alta frecuencia en el radio
      float fil = 0.9 + 0.1*sin(t*70.0 + n*9.0);

      float temp = pow(1.0 - t, 1.25);
      float body = temp * smoothstep(0.0, 0.03, t) * smoothstep(1.0, 0.75, t);
      float rim = exp(-t*22.0) * 1.6;                         // borde interno al rojo blanco
      float beam = pow(max(0.0, 1.0 + 0.62*vBeam), 2.4);
      float inten = (body * (0.35 + 1.1*n*n) * fil + rim) * beam;

      // caliente -> frío: blanco, cian, violeta, índigo profundo
      vec3 col = mix(uHot, uCyan, smoothstep(0.02, 0.2, t));
      col = mix(col, uViolet, smoothstep(0.2, 0.55, t));
      col = mix(col, uDeep, smoothstep(0.65, 1.0, t));
      col = mix(col, uHot, clamp(vBeam, 0.0, 1.0)*0.25*(1.0 - t));   // el lado que se acerca, más blanco

      gl_FragColor = vec4(col, clamp(inten * 1.35 * uReveal, 0.0, 1.0));
      #include <colorspace_fragment>
    }`;

  /* ---------- lente: anillo de fotones + imagen curvada del disco ---------- */
  // Un cuadrado mirando a la cámara, centrado en el Hoyo. La esfera negra tapa su interior,
  // así que todo lo que dibuja queda alrededor de la sombra.
  const LENS_VERT = `
    varying vec2 vQ;
    void main(){ vQ = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const LENS_FRAG = NOISE + `
    uniform float uTime, uRs, uReveal;
    uniform vec3 uDiscN, uHot, uCyan, uViolet;
    varying vec2 vQ;
    void main(){
      float r = length(vQ);
      vec2 dir = vQ / max(r, 1e-4);
      float ang = atan(vQ.y, vQ.x);

      // anillo de fotones: un aro muy fino y nítido, con un halo suave
      float ring = exp(-pow((r - uRs*1.035)/(uRs*0.014), 2.0))*1.5
                 + exp(-pow((r - uRs*1.07)/(uRs*0.09), 2.0))*0.28;

      // la imagen del lado lejano del disco, doblada sobre la sombra. De canto se ve como dos
      // arcos (arriba y abajo, perpendiculares al disco); de frente, como un anillo parejo
      vec3 nd = normalize(uDiscN);
      float edge = clamp(length(nd.xy), 0.0, 1.0);
      vec2 nhat = edge > 1e-3 ? nd.xy/edge : vec2(0.0, 1.0);
      float angW = mix(1.0, pow(abs(dot(dir, nhat)), 1.2), edge);
      float band = smoothstep(uRs*1.05, uRs*1.12, r) * (1.0 - smoothstep(uRs*1.15, uRs*1.8, r));
      float sw = ang + uTime*0.3;
      float n = 0.5 + 0.5*fbm3(vec3(cos(sw)*2.2, sin(sw)*2.2, r*4.0 - uTime*0.15));
      float arc = band * angW * (0.3 + 0.95*n) * 1.15;

      vec3 col = mix(uHot, uCyan, smoothstep(uRs*1.05, uRs*1.3, r));
      col = mix(col, uViolet, smoothstep(uRs*1.25, uRs*1.65, r));
      col = mix(col, uHot, clamp(ring, 0.0, 1.0)*0.6);
      float a = (ring + arc) * uReveal;
      gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
      #include <colorspace_fragment>
    }`;
  // oscurece el cielo justo alrededor del horizonte: así la sombra se lee como un pozo, no
  // como una pelota negra pegada encima de la foto
  const SHADOW_FRAG = `
    uniform float uRs, uReveal;
    varying vec2 vQ;
    void main(){
      float r = length(vQ);
      float a = (1.0 - smoothstep(uRs*0.98, uRs*2.3, r)) * 0.82 * uReveal;
      gl_FragColor = vec4(0.0, 0.0, 0.0, a);
    }`;

  /* ---------- planetas ---------- */
  const PLANET_VERT = `
    varying vec3 vObj; varying vec3 vN; varying vec3 vView;
    void main(){
      vObj = normalize(position);
      vN = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vView = mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`;
  const PLANET_FRAG = NOISE + `
    uniform int uType;
    uniform float uSeed, uTime, uHover;
    uniform vec3 uC0, uC1, uC2, uC3, uAtmo, uLightPos, uLightCol;
    varying vec3 vObj; varying vec3 vN; varying vec3 vView;
    void main(){
      vec3 p = normalize(vObj);
      vec3 sp = p + vec3(uSeed*3.1, uSeed*1.7, uSeed*2.3);
      vec3 col; vec3 emis = vec3(0.0); float specMask = 0.0;

      if(uType == 0){
        // rocoso con cráteres: lo primordial
        float h = fbm(sp*2.2);
        col = mix(uC0, uC1, smoothstep(-0.5, 0.5, h));
        col = mix(col, uC2, smoothstep(0.25, 0.7, fbm3(sp*5.0))*0.45);
        vec2 w = worley(sp*4.0);
        float bowl = smoothstep(0.42, 0.18, w.x);
        float rimL = exp(-pow((w.x - 0.44)/0.05, 2.0));
        float bowl2 = 0.0;
        #if DETAIL >= 1
        vec2 w2 = worley(sp*9.0 + 4.0);   // cráteres chicos: 27 celdas más por píxel
        bowl2 = smoothstep(0.35, 0.12, w2.x);
        #endif
        col *= 1.0 - bowl*0.35 - bowl2*0.2;
        col += uC2*rimL*0.25;
      } else if(uType == 1 || uType == 4){
        // gigante gaseoso: bandas por latitud, deformadas por turbulencia
        float turb = fbm(sp*vec3(1.6, 5.5, 1.6) + vec3(uTime*0.012, 0.0, 0.0));
        float lat = p.y;
        float b  = sin(lat*11.0 + turb*2.6 + uSeed*5.0);
        float b2 = sin(lat*29.0 + turb*4.0);
        col = mix(uC0, uC1, smoothstep(-0.9, 0.9, b));
        col = mix(col, uC2, smoothstep(0.35, 1.0, b2)*0.55);
        col = mix(col, uC3, smoothstep(0.55, 0.95, abs(lat))*0.35);
        if(uType == 4){
          // tormenta gigante (La Expansión): un ojo que gira
          vec3 c = normalize(vec3(0.62, -0.22, 0.75));
          float d = distance(p, c);
          float swirlA = atan(dot(p - c, vec3(0.0,1.0,0.0)), dot(p - c, vec3(1.0,0.0,0.0)));
          float storm = smoothstep(0.26, 0.05, d + 0.04*sin(swirlA*3.0 + d*40.0 - uTime*0.8));
          col = mix(col, uC3, storm*0.85);
          col = mix(col, uC2*1.2, exp(-pow((d - 0.24)/0.03, 2.0))*0.5);
        }
      } else if(uType == 2){
        // océano con continentes y nubes (El Grupo)
        float h = fbm(sp*2.1);
        float land = smoothstep(0.06, 0.12, h);
        vec3 ocean = mix(uC0, uC1, smoothstep(-0.5, 0.06, h));
        vec3 ground = mix(uC2*0.75, uC3, smoothstep(0.12, 0.55, h));
        col = mix(ocean, ground, land);
        specMask = 1.0 - land;
        float cl = fbm(sp*3.2 + vec3(uTime*0.02, 0.0, uTime*0.01) + 11.0);
        float clouds = smoothstep(0.05, 0.55, cl);
        col = mix(col, vec3(0.93, 0.97, 1.0), clouds*0.8);
        specMask *= 1.0 - clouds;
      } else if(uType == 3){
        // volcánico, agrietado, con lava viva (Caos)
        float h = fbm(sp*2.6);
        col = mix(uC0*0.55, uC1*0.6, smoothstep(-0.6, 0.6, h));
        vec2 w = worley(sp*3.6 + h*0.35);
        float crack = 1.0 - smoothstep(0.0, 0.07, w.y - w.x);
        float crack2 = 0.0;
        #if DETAIL >= 1
        vec2 w2 = worley(sp*8.0 + 2.0);   // grietas finas
        crack2 = 1.0 - smoothstep(0.0, 0.05, w2.y - w2.x);
        #endif
        float pulse = 0.75 + 0.25*sin(uTime*1.7 + h*9.0);
        emis = uC3 * (crack*1.5 + crack2*0.6) * pulse;
        col *= 1.0 - crack*0.5;
      } else {
        // hielo: casquetes, vetas y velos finos (La Estabilidad)
        float h = fbm(sp*1.8);
        col = mix(uC1, uC2, smoothstep(-0.4, 0.6, h));
        float streak = fbm3(sp*vec3(9.0, 1.4, 9.0));
        col = mix(col, uC0, smoothstep(0.2, 0.6, streak)*0.35);
        col = mix(col, vec3(0.92, 0.96, 1.0), smoothstep(0.62, 0.85, abs(p.y) + h*0.1));
        vec2 w = worley(sp*5.0);
        col = mix(col, uC3, (1.0 - smoothstep(0.0, 0.03, w.y - w.x))*0.4);
        specMask = 0.5;
      }

      // luz: viene del Hoyo (su disco). Terminador suave con un filo de color.
      vec3 N = normalize(vN);
      vec3 L = normalize(uLightPos - vView);
      vec3 V = normalize(-vView);
      float ndl = dot(N, L);
      float diff = smoothstep(-0.12, 0.65, ndl);
      float term = exp(-pow((ndl - 0.02)/0.12, 2.0));
      vec3 lit = col * (uLightCol*diff*1.25 + vec3(0.035, 0.045, 0.08));
      lit += uAtmo * term * 0.22;
      float spec = pow(max(dot(reflect(-L, N), V), 0.0), 36.0) * specMask * diff;
      lit += uLightCol * spec * 0.55;
      lit += emis * (0.7 + 0.3*(1.0 - diff));

      // atmósfera (fresnel), más intensa en el lado iluminado
      float fr = pow(1.0 - max(dot(N, V), 0.0), 2.6);
      lit += uAtmo * fr * (0.12 + 0.95*smoothstep(-0.35, 0.6, ndl)) * (1.0 + uHover*0.9);
      lit *= 1.0 + uHover*0.22;

      gl_FragColor = vec4(lit, 1.0);
      #include <colorspace_fragment>
    }`;
  // cáscara de atmósfera: se dibuja por detrás (BackSide) y se desvanece hacia afuera
  const ATMO_VERT = `
    varying vec3 vN; varying vec3 vView;
    void main(){
      vN = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vView = mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`;
  const ATMO_FRAG = `
    uniform vec3 uAtmo, uLightPos;
    uniform float uInner, uHover, uReveal;
    varying vec3 vN; varying vec3 vView;
    void main(){
      vec3 N = normalize(vN);
      vec3 V = normalize(-vView);
      float d = -dot(N, V);                       // 0 en el borde exterior, uInner en el limbo del planeta
      float x = clamp(d/uInner, 0.0, 1.0);
      float g = pow(x, 2.2);
      float lit = smoothstep(-0.45, 0.55, dot(N, normalize(uLightPos - vView)));
      float a = g * (0.18 + 0.82*lit) * (0.75 + uHover*0.7) * uReveal;
      gl_FragColor = vec4(uAtmo, clamp(a, 0.0, 1.0));
      #include <colorspace_fragment>
    }`;
  // lunas: una por historia. Roca chica teñida con el color de la temporada, iluminada desde el
  // Hoyo como los planetas; en pantalla miden pocos píxeles, así que el shader es barato igual
  const MOON_FRAG = NOISE + `
    uniform float uSeed, uHover;
    uniform vec3 uTint, uLightPos, uLightCol;
    varying vec3 vObj; varying vec3 vN; varying vec3 vView;
    void main(){
      vec3 p = normalize(vObj);
      vec3 sp = p*2.6 + vec3(uSeed*3.7, uSeed*1.3, uSeed*2.9);
      float h = fbm3(sp);
      vec3 col = mix(vec3(0.46, 0.5, 0.56), uTint, 0.42) * (0.78 + 0.4*h);
      vec2 w = worley(sp*1.6);
      col *= 1.0 - smoothstep(0.38, 0.12, w.x)*0.32;              // cráteres
      col += vec3(0.08)*exp(-pow((w.x - 0.4)/0.05, 2.0));          // borde de cráter
      vec3 N = normalize(vN), L = normalize(uLightPos - vView), V = normalize(-vView);
      float ndl = dot(N, L);
      vec3 lit = col * (uLightCol*smoothstep(-0.1, 0.6, ndl)*1.25 + vec3(0.14, 0.16, 0.22));
      // sin un piso de luz y un borde, la cara de noche se leía como un agujero negro chico
      float fr = pow(1.0 - max(dot(N, V), 0.0), 2.2);
      lit += uTint * fr * (0.45 + 0.6*uHover);
      lit += mix(uTint, vec3(1.0), 0.4) * uHover * 0.35;
      gl_FragColor = vec4(lit, 1.0);
      #include <colorspace_fragment>
    }`;

  const RING_VERT = `
    varying vec2 vP; varying vec3 vW;
    void main(){
      vP = position.xy;
      vec4 w = modelMatrix * vec4(position, 1.0);
      vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const RING_FRAG = NOISE + `
    uniform float uIn, uOut, uSeed, uR, uReveal;
    uniform vec3 uC1, uC2, uCenter, uLightW;
    varying vec2 vP; varying vec3 vW;
    void main(){
      float r = length(vP);
      float t = clamp((r - uIn)/(uOut - uIn), 0.0, 1.0);
      float n = noise1(t*38.0 + uSeed*10.0)*0.6 + noise1(t*140.0 + uSeed*3.0)*0.4;
      float a = (0.18 + 0.82*n) * smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.86, t);
      a *= smoothstep(0.015, 0.04, abs(t - 0.63));          // la "división de Cassini"
      vec3 col = mix(uC1, uC2, n);
      // sombra del planeta sobre el anillo
      vec3 dir = normalize(uLightW - vW);
      vec3 oc = uCenter - vW;
      float b = dot(oc, dir);
      float shadow = (b > 0.0 && dot(oc, oc) - b*b < uR*uR) ? 0.18 : 1.0;
      gl_FragColor = vec4(col * (0.35 + 0.75*shadow), a * 0.8 * uReveal);
      #include <colorspace_fragment>
    }`;

  /* ---------- estelas de órbita e hilo del tiempo ---------- */
  const TRAIL_VERT = `
    attribute float aAng;
    varying float vAng;
    void main(){ vAng = aAng; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const TRAIL_FRAG = `
    uniform float uHead, uLen, uGap, uAlpha;
    uniform vec3 uColor;
    varying float vAng;
    void main(){
      // distancia angular hacia atrás desde el planeta (el planeta "avanza" en +ángulo)
      float d = mod(vAng - uHead, 6.2831853);
      float k = d / uLen;
      if(k > 1.0) discard;
      float a = pow(1.0 - k, 2.3) * smoothstep(0.0, uGap, d) * uAlpha;
      gl_FragColor = vec4(uColor, a);
      #include <colorspace_fragment>
    }`;
  // El tubo central del hilo mide 0.011: casi siempre menos de un píxel, y un triángulo más
  // fino que un píxel se dibuja a saltos (escalones, tramos cortados). Así que el radio tiene un
  // mínimo en píxeles de pantalla (uMinPx, con uPxK = unidades de mundo por píxel por unidad de
  // profundidad): donde el tubo se ensancha para llegar a ese mínimo, se atenúa en la misma
  // proporción (vThin), así el brillo total no cambia y la línea queda continua y suave.
  // Además, el tubo no es una geometría fija: los planetas avanzan por sus órbitas, así que la
  // curva (Catmull-Rom por las posiciones de los planetas, uPts) se calcula acá en cada cuadro.
  // La geometría solo trae uv: u a lo largo del hilo (0..1) y v alrededor del tubo (0..1).
  const THREAD_VERT = `
    uniform vec3 uPts[6];
    uniform float uN;
    uniform float uSoft, uRadius, uMinPx, uPxK;
    varying float vU; varying float vFacing; varying float vThin;
    vec3 crPos(vec3 p0, vec3 p1, vec3 p2, vec3 p3, float t){
      return 0.5*(2.0*p1 + (p2 - p0)*t + (2.0*p0 - 5.0*p1 + 4.0*p2 - p3)*t*t + (3.0*p1 - p0 - 3.0*p2 + p3)*t*t*t);
    }
    vec3 crTan(vec3 p0, vec3 p1, vec3 p2, vec3 p3, float t){
      return 0.5*((p2 - p0) + 2.0*(2.0*p0 - 5.0*p1 + 4.0*p2 - p3)*t + 3.0*(3.0*p1 - p0 - 3.0*p2 + p3)*t*t);
    }
    vec3 pt(int i){
      // fuera de los extremos se extrapola, para que el primer y el último tramo no se doblen
      if(i < 0) return 2.0*uPts[0] - uPts[1];
      int last = int(uN) - 1;
      if(i > last) return 2.0*uPts[last] - uPts[last - 1];
      return uPts[i];
    }
    void main(){
      vU = uv.x;
      float f = uv.x*(uN - 1.0);
      int i = int(min(floor(f), uN - 2.0));
      float t = f - float(i);
      vec3 p0 = pt(i - 1), p1 = pt(i), p2 = pt(i + 1), p3 = pt(i + 2);
      vec3 axis = crPos(p0, p1, p2, p3, t);
      vec3 tg = normalize(crTan(p0, p1, p2, p3, t) + vec3(1e-5));
      vec3 up = abs(tg.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
      vec3 na = normalize(cross(tg, up)), nb = cross(tg, na);
      float th = uv.y*6.2831853;
      vec3 nrm = cos(th)*na + sin(th)*nb;
      float depth = max(1e-3, -(modelViewMatrix * vec4(axis, 1.0)).z);
      float r = max(uRadius, depth*uPxK*uMinPx);
      vThin = uRadius / r;
      vec4 mv = modelViewMatrix * vec4(axis + nrm*r, 1.0);
      vec3 n = normalize(normalMatrix * nrm);
      vFacing = pow(abs(dot(n, normalize(-mv.xyz))), uSoft);
      gl_Position = projectionMatrix * mv;
    }`;
  const THREAD_FRAG = `
    uniform float uTime, uAlpha, uReveal;
    uniform vec3 uColors[6];
    varying float vU; varying float vFacing; varying float vThin;
    void main(){
      if(vU > uReveal) discard;
      float f = clamp(vU, 0.0, 1.0) * 5.0;
      float fi = min(floor(f), 4.0);
      int i = int(fi);
      vec3 c = mix(uColors[i], uColors[i+1], smoothstep(0.0, 1.0, f - fi));
      // pulsos tipo cometa que viajan de S0 a S5: cabeza brillante, cola hacia atrás
      float ph = fract(vU*2.2 - uTime*0.11);
      float comet = pow(ph, 18.0) + pow(ph, 4.0)*0.25;
      comet *= smoothstep(1.0, 0.985, ph);
      // mientras se dibuja en la entrada, la punta brilla
      float tip = exp(-pow((vU - uReveal)/0.012, 2.0)) * step(uReveal, 0.999);
      float a = uAlpha * (0.42 + 2.2*comet + 2.0*tip) * vFacing * vThin;
      a *= smoothstep(0.0, 0.03, vU) * smoothstep(1.0, 0.97, vU);
      gl_FragColor = vec4(mix(c, vec3(1.0), clamp(0.2 + 0.7*comet + tip, 0.0, 1.0)), clamp(a, 0.0, 1.0));
      #include <colorspace_fragment>
    }`;

  /* ---------- tipos de planeta ---------- */
  // Uno por temporada, elegido por el nombre/tono de cada una. type: 0 rocoso con cráteres,
  // 1 gaseoso, 2 océano con nubes, 3 volcánico, 4 gaseoso con tormenta, 5 hielo.
  const PLANET_LOOK = [
    { type:0, ring:false },  // S0 Preludio: rocoso, primordial
    { type:1, ring:true  },  // S1 Los Inicios: gigante con anillos
    { type:2, ring:false },  // S2 El Grupo: mundo océano, con nubes
    { type:3, ring:false },  // S3 Caos: volcánico, grietas de lava
    { type:4, ring:true  },  // S4 La Expansión: tormenta gigante + anillo
    { type:5, ring:false },  // S5 La Estabilidad: hielo
  ];

  // paleta de un planeta a partir del color de su temporada
  function paletteFor(THREE, hex){
    const base = new THREE.Color(hex);
    const hsl = {}; base.getHSL(hsl);
    const mk = (dh, s, l)=> new THREE.Color().setHSL((hsl.h + dh + 1) % 1, Math.min(1, Math.max(0, s)), Math.min(0.95, Math.max(0.03, l)));
    return {
      c0: mk(-0.02, hsl.s*0.9, hsl.l*0.38),
      c1: mk(0, hsl.s, hsl.l*0.85),
      c2: mk(0.03, hsl.s*0.75, hsl.l + (1-hsl.l)*0.42),
      c3: mk(0.07, Math.min(1, hsl.s*1.15), hsl.l*1.05 + 0.08),
      atmo: mk(0.01, Math.min(1, hsl.s*1.1), Math.min(0.78, hsl.l + 0.2)),
    };
  }

  const easeOutCubic = x=> 1 - Math.pow(1 - x, 3);
  const easeOutBack = x=>{ const c1 = 1.5, c3 = c1 + 1; return 1 + c3*Math.pow(x - 1, 3) + c1*Math.pow(x - 1, 2); };
  const clamp01 = x=> Math.max(0, Math.min(1, x));

  /* ---------- escena ---------- */
  function build(THREE, POST, container, opts){
    // si algo revienta a medio construir, se suelta lo que alcanzó a crearse (DOM, listeners,
    // el contexto WebGL) y el error sigue hacia mountSolar, que lo rechaza
    const partial = [];
    try{ return buildScene(THREE, POST, container, opts, partial); }
    catch(err){ partial.forEach(fn=>{ try{ fn(); }catch(e){} }); throw err; }
  }

  function buildScene(THREE, POST, container, opts, partial){
    const seasons = (opts.seasons || (typeof DATA !== "undefined" ? DATA.seasons : [])).slice(0, 6);
    const hrefFor = opts.hrefFor || (id => `#/season/${id}`);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const CYAN = cssVar("--amber", "#68d8ff");
    const VIOLET = cssVar("--violet", "#6f8fe8");
    const TEAL = cssVar("--teal", "#33d6e0");

    const cleanups = partial;
    const textures = [];
    let dead = false;   // desmontado o fallido: ningún callback hacia afuera después de esto
    function fail(reason){
      if(dead) return;
      dead = true;
      stop();
      if(opts.onFail) setTimeout(()=>opts.onFail(reason), 0);   // fuera del cuadro / del evento
    }
    const on = (target, type, fn, o)=>{ target.addEventListener(type, fn, o); cleanups.push(()=>target.removeEventListener(type, fn, o)); };

    // ---- DOM ----
    const root = document.createElement("div");
    root.className = "solar-root";
    const canvas = document.createElement("canvas");
    canvas.className = "solar-canvas";
    // touch-action va en el CSS: pan-y por defecto (el swipe vertical es del scroll) y none
    // mientras la home está en modo galaxia (los gestos son de la escena)
    const labelsLayer = document.createElement("div");
    labelsLayer.className = "solar-labels";
    root.appendChild(canvas); root.appendChild(labelsLayer);
    container.appendChild(root);
    cleanups.push(()=>root.remove());

    // ---- renderer / cámara ----
    const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true, powerPreference:"high-performance" });
    cleanups.push(()=>{
      renderer.dispose();
      // soltar el contexto ya, sin esperar al GC (si no, 20 visitas a la home = 20 contextos)
      const gl = renderer.getContext();
      if(gl && !gl.isContextLost()) renderer.forceContextLoss();
    });
    // un shader que no compila deja la escena vacía: mejor volver al respaldo
    renderer.debug.onShaderError = ()=> fail("shader");
    // el sistema puede quitarnos el contexto (GPU reiniciada, demasiadas pestañas)
    on(canvas, "webglcontextlost", e=>{ e.preventDefault(); fail("context-lost"); });
    renderer.setClearColor(0x000000, 0);
    const dpr = window.devicePixelRatio || 1;
    let tier = opts.quality;
    renderer.setPixelRatio(Math.min(dpr, TIERS[tier].dpr));
    // los materiales cuyo shader usa NOISE: al bajar de nivel se recompilan con menos detalle
    const detailMats = [];
    const detailed = m=>{ m.defines = Object.assign({}, m.defines, { DETAIL: TIERS[tier].detail }); detailMats.push(m); return m; };
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    camera.position.set(0, 0, 20);

    // stage: giro de la entrada (alrededor del eje vertical de la cámara);
    // world: todo el sistema, lo que rota el usuario
    const stage = new THREE.Group();
    scene.add(stage);
    const world = new THREE.Group();
    // orientación: yaw libre, pitch acotado (nunca queda de cabeza). Vista inicial desde
    // arriba; en vertical más inclinada, para llenar el alto disponible
    const portraitAtMount = container.clientWidth < container.clientHeight*0.8;
    // vista inicial: más cenital mientras más angosta la caja (las órbitas se ven más redondas
    // y llenan el alto); en una franja ancha, rasante
    const narrowAtMount = container.clientWidth < 640;
    let yaw = 0, pitch = portraitAtMount ? 1.18 : narrowAtMount ? 0.9 : 0.46;
    // giro libre en los dos ejes (la escena puede darse vuelta entera); el pitch se guarda
    // envuelto en (-PI, PI]
    const TAU = Math.PI*2;
    const wrapAngle = a=> a - TAU*Math.floor((a + Math.PI)/TAU);
    // zoom de la vista general: multiplica la distancia de la cámara (menos = más cerca)
    const ZOOM_MIN = 0.4, ZOOM_MAX = 1.45;
    // zoom inicial: un poco más cerca que el encuadre que muestra el sistema entero
    const ZOOM_START = 0.78;
    let zoom = ZOOM_START, zoomTarget = ZOOM_START;
    const clampZoom = z=> Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    stage.add(world);

    const glowTex = glowTexture(THREE); textures.push(glowTex);
    const additive = { transparent:true, depthWrite:false, blending:THREE.AdditiveBlending };
    const C = s=> new THREE.Color(s);

    // luz compartida por los planetas, en espacio de vista (se actualiza cada cuadro)
    const lightUniforms = { uLightPos:{ value: new THREE.Vector3() }, uLightCol:{ value: C("#d8f3ff") } };

    // ---- el Hoyo ----
    const HOLE_R = 0.9, DISC_IN = 1.18, DISC_OUT = 3.0;
    const hole = new THREE.Mesh(new THREE.SphereGeometry(HOLE_R, 64, 40), new THREE.MeshBasicMaterial({ color:0x000000 }));
    world.add(hole);

    const discU = {
      uTime:{ value:0 }, uInner:{ value:DISC_IN }, uOuter:{ value:DISC_OUT }, uReveal:{ value:0 },
      uHot:{ value:C("#f4fcff") }, uCyan:{ value:C(CYAN) }, uViolet:{ value:C(VIOLET) }, uDeep:{ value:C("#2a2370") }
    };
    const disc = new THREE.Mesh(
      new THREE.RingGeometry(DISC_IN, DISC_OUT, 220, 24),
      detailed(new THREE.ShaderMaterial({ uniforms:discU, vertexShader:DISC_VERT, fragmentShader:DISC_FRAG, side:THREE.DoubleSide, ...additive }))
    );
    disc.rotation.x = -Math.PI/2;
    disc.renderOrder = 2;
    world.add(disc);

    // lente y sombra: cuadrados en el centro, de cara a la cámara (que nunca rota), así que
    // viven en la escena y no en `world`
    const LENS_SIZE = HOLE_R*7.2;
    const lensGeo = new THREE.PlaneGeometry(LENS_SIZE, LENS_SIZE);
    const lensU = {
      uTime:{ value:0 }, uRs:{ value:HOLE_R }, uReveal:{ value:0 }, uDiscN:{ value:new THREE.Vector3(0,1,0) },
      uHot:discU.uHot, uCyan:discU.uCyan, uViolet:discU.uViolet
    };
    const lens = new THREE.Mesh(lensGeo, detailed(new THREE.ShaderMaterial({ uniforms:lensU, vertexShader:LENS_VERT, fragmentShader:LENS_FRAG, ...additive })));
    lens.renderOrder = 3;
    scene.add(lens);
    const shadowU = { uRs:{ value:HOLE_R }, uReveal:lensU.uReveal };
    const shadow = new THREE.Mesh(lensGeo, new THREE.ShaderMaterial({ uniforms:shadowU, vertexShader:LENS_VERT, fragmentShader:SHADOW_FRAG, transparent:true, depthWrite:false }));
    shadow.renderOrder = -1;
    scene.add(shadow);

    // halos amplios con sprites: el brillo base en móvil; con bloom se bajan
    const haloV = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:C(VIOLET), opacity:0, ...additive }));
    haloV.scale.setScalar(10);
    world.add(haloV);
    const haloC = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:C(TEAL), opacity:0, ...additive }));
    haloC.scale.setScalar(5.6);
    world.add(haloC);

    // ---- planetas ----
    // S0 afuera, S5 adentro. Inclinaciones y ángulos fijos (dibujados, no aleatorios) para que
    // el hilo del tiempo trace una espiral legible hacia el Hoyo.
    const ORBIT_R = [7.6, 6.65, 5.75, 4.9, 4.1, 3.45];
    const INC_X   = [ 0.30, -0.16,  0.12, -0.26,  0.20, -0.08];
    const INC_Z   = [-0.10,  0.22, -0.24,  0.08,  0.28, -0.18];
    const ANGLE0  = [ 2.55,  1.35,  0.15, -1.05, -2.25, -3.45];
    const planets = [];

    seasons.forEach((s, i)=>{
      const R = ORBIT_R[i];
      const look = PLANET_LOOK[i] || PLANET_LOOK[0];
      const color = s.color || CYAN;
      const pal = paletteFor(THREE, color);
      const orbit = new THREE.Group();
      orbit.rotation.set(INC_X[i], 0, INC_Z[i]);
      world.add(orbit);

      // estela: la órbita entera como geometría, pero el shader solo dibuja el tramo detrás
      // del planeta, desvaneciéndose
      const SEG = 256, pos = new Float32Array((SEG+1)*3), angs = new Float32Array(SEG+1);
      for(let k=0;k<=SEG;k++){
        const a = k/SEG*Math.PI*2;
        pos[k*3] = Math.cos(a)*R; pos[k*3+1] = 0; pos[k*3+2] = Math.sin(a)*R;
        angs[k] = a;
      }
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      trailGeo.setAttribute("aAng", new THREE.BufferAttribute(angs, 1));
      const a0 = ((ANGLE0[i] % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
      const count = (s.events || []).length;
      const r = 0.24 + 0.17*Math.sqrt(Math.max(1, count));
      const trailU = { uHead:{ value:a0 }, uLen:{ value:Math.PI*0.85 }, uGap:{ value:(r*1.3)/R }, uAlpha:{ value:0 }, uColor:{ value:pal.atmo } };
      const trail = new THREE.Line(trailGeo, new THREE.ShaderMaterial({ uniforms:trailU, vertexShader:TRAIL_VERT, fragmentShader:TRAIL_FRAG, ...additive }));
      orbit.add(trail);

      // el planeta: group (posición, escala de entrada/hover) > tilt (eje) > esfera (gira)
      const group = new THREE.Group();
      group.position.set(Math.cos(a0)*R, 0, Math.sin(a0)*R);
      group.scale.setScalar(0.0001);
      orbit.add(group);
      const tilt = new THREE.Group();
      tilt.rotation.z = 0.28 + (i%3)*0.12;
      tilt.rotation.x = (i%2 ? -0.18 : 0.12);
      group.add(tilt);

      const planetU = {
        uType:{ value:look.type }, uSeed:{ value:i*1.37 + 0.4 }, uTime:{ value:0 }, uHover:{ value:0 },
        uC0:{ value:pal.c0 }, uC1:{ value:pal.c1 }, uC2:{ value:pal.c2 }, uC3:{ value:pal.c3 }, uAtmo:{ value:pal.atmo },
        uLightPos:lightUniforms.uLightPos, uLightCol:lightUniforms.uLightCol
      };
      if(look.type === 3) planetU.uC3.value = new THREE.Color(color).lerp(C("#ffb347"), 0.55).multiplyScalar(1.6);
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 40),
        detailed(new THREE.ShaderMaterial({ uniforms:planetU, vertexShader:PLANET_VERT, fragmentShader:PLANET_FRAG })));
      tilt.add(sphere);

      const ATMO_K = 1.16;
      const atmoU = { uAtmo:{ value:pal.atmo }, uLightPos:lightUniforms.uLightPos, uInner:{ value:Math.sqrt(1 - 1/(ATMO_K*ATMO_K)) }, uHover:planetU.uHover, uReveal:{ value:0 } };
      const atmo = new THREE.Mesh(new THREE.SphereGeometry(r*ATMO_K, 48, 32),
        new THREE.ShaderMaterial({ uniforms:atmoU, vertexShader:ATMO_VERT, fragmentShader:ATMO_FRAG, side:THREE.BackSide, ...additive }));
      group.add(atmo);

      let ringU = null;
      if(look.ring){
        ringU = { uIn:{ value:r*1.45 }, uOut:{ value:r*2.35 }, uSeed:{ value:i*0.73 }, uR:{ value:r }, uReveal:{ value:0 },
          uC1:{ value:pal.c1.clone().lerp(C("#ffffff"), 0.15) }, uC2:{ value:pal.c2 }, uCenter:{ value:new THREE.Vector3() }, uLightW:{ value:new THREE.Vector3() } };
        const ring = new THREE.Mesh(new THREE.RingGeometry(r*1.45, r*2.35, 128, 4),
          detailed(new THREE.ShaderMaterial({ uniforms:ringU, vertexShader:RING_VERT, fragmentShader:RING_FRAG, transparent:true, depthWrite:false, side:THREE.DoubleSide })));
        ring.rotation.x = -Math.PI/2 + 0.08;
        tilt.add(ring);
      }

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:C(color), opacity:0, ...additive }));
      glow.scale.setScalar(r*5);
      group.add(glow);

      // ---- lunas: una por historia de la temporada ----
      // Cada una en su propia órbita alrededor del planeta (inclinada distinto, más lenta
      // mientras más lejos), con una estela corta como la de los planetas. Viven dentro de
      // `group`, así que crecen con el hover y aparecen con el planeta. La primera órbita parte
      // por fuera de los anillos, si hay.
      const moons = [];
      const moonStart = r*(look.ring ? 2.7 : 1.75), moonStep = r*0.34;
      (s.events || []).forEach((ev, j)=>{
        const mR = moonStart + j*moonStep;
        const mr = Math.min(0.085, 0.05 + 0.012*((i*7 + j*3) % 4) + r*0.03);
        const mOrbit = new THREE.Group();
        mOrbit.rotation.set(0.55*Math.sin(j*2.1 + i*1.3), 0, 0.45*Math.cos(j*1.7 + i*0.9));
        group.add(mOrbit);
        const MSEG = 96, mpos = new Float32Array((MSEG+1)*3), mangs = new Float32Array(MSEG+1);
        for(let k=0;k<=MSEG;k++){
          const a = k/MSEG*TAU;
          mpos[k*3] = Math.cos(a)*mR; mpos[k*3+1] = 0; mpos[k*3+2] = Math.sin(a)*mR;
          mangs[k] = a;
        }
        const mGeo = new THREE.BufferGeometry();
        mGeo.setAttribute("position", new THREE.BufferAttribute(mpos, 3));
        mGeo.setAttribute("aAng", new THREE.BufferAttribute(mangs, 1));
        const mTrailU = { uHead:{ value:0 }, uLen:{ value:Math.PI*1.1 }, uGap:{ value:(mr*1.6)/mR }, uAlpha:{ value:0 }, uColor:{ value:pal.atmo } };
        mOrbit.add(new THREE.Line(mGeo, new THREE.ShaderMaterial({ uniforms:mTrailU, vertexShader:TRAIL_VERT, fragmentShader:TRAIL_FRAG, ...additive })));
        const moonU = { uSeed:{ value:i*3.1 + j*1.7 }, uHover:{ value:0 }, uTint:{ value:pal.atmo },
          uLightPos:lightUniforms.uLightPos, uLightCol:lightUniforms.uLightCol };
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(mr, 20, 14),
          detailed(new THREE.ShaderMaterial({ uniforms:moonU, vertexShader:PLANET_VERT, fragmentShader:MOON_FRAG })));
        mOrbit.add(mesh);
        const mGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:C(color), opacity:0, ...additive }));
        mGlow.scale.setScalar(mr*6);
        mOrbit.add(mGlow);
        // velocidad tipo Kepler (más lejos, más lenta), y fases repartidas para que no salgan en fila
        const omega = 0.32*Math.pow(moonStart/mR, 1.5);
        const theta0 = j*2.399 + i*0.7;   // ángulo dorado: quedan bien repartidas
        moons.push({ kind:"moon", index:j, event:ev, mesh, glow:mGlow, trailU:mTrailU, moonU, mR, mr, omega, theta0,
          world:new THREE.Vector3(), hover:false, hoverK:0, appear:0, label:null, planet:null });
      });

      const label = document.createElement("a");
      label.className = "solar-label";
      label.href = hrefFor(s.id);
      label.style.setProperty("--pcolor", color);
      label.style.opacity = "0";
      label.innerHTML = `<span class="solar-code"></span><span class="solar-title"></span>`;
      label.firstChild.textContent = s.code || `S${s.id}`;
      label.lastChild.textContent = s.title || "";
      const nEv = (s.events || []).length;
      label.setAttribute("aria-label", `${s.code || "S"+s.id}, ${s.title || "temporada"}: ${nEv} ${nEv === 1 ? "historia" : "historias"}. Enter para ver la temporada en detalle.`);
      labelsLayer.appendChild(label);

      const planet = { kind:"planet", index:i, season:s, group, sphere, r, ringed:!!look.ring, label, planetU, atmoU, ringU, trailU, glow, R, a0, orbit, moons,
        moonMax: moons.length ? moonStart + (moons.length - 1)*moonStep + 0.1 : 0,
        world:new THREE.Vector3(), hover:false, hoverK:0, appear:0, lw:0, lh:0, cw:0 };
      moons.forEach(m=>{ m.planet = planet; });
      planets.push(planet);
    });

    // ---- hilo del tiempo ----
    const threadPxK = { value:0.001 };   // se calcula en resize()
    const threadU = {
      uTime:{ value:0 }, uReveal:{ value:0 },
      uColors:{ value: seasons.map(s=> paletteFor(THREE, s.color || CYAN).atmo) }
    };
    while(threadU.uColors.value.length < 6) threadU.uColors.value.push(C(CYAN));
    // posiciones de los planetas en el espacio de `world` (lo que lee el shader del hilo)
    const threadPts = { value: Array.from({ length:6 }, ()=> new THREE.Vector3()) };
    if(planets.length >= 2){
      // la malla del hilo: una grilla de uv (u a lo largo, v alrededor); la forma la pone el shader
      const SEG = 480, RAD = 10;
      const uvs = new Float32Array((SEG + 1)*(RAD + 1)*2), idx = [];
      for(let a=0; a<=SEG; a++) for(let b=0; b<=RAD; b++){ const k = (a*(RAD + 1) + b)*2; uvs[k] = a/SEG; uvs[k + 1] = b/RAD; }
      for(let a=0; a<SEG; a++) for(let b=0; b<RAD; b++){
        const v0 = a*(RAD + 1) + b, v1 = v0 + RAD + 1;
        idx.push(v0, v1, v0 + 1, v1, v1 + 1, v0 + 1);
      }
      const threadGeo = new THREE.BufferGeometry();
      threadGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(uvs.length/2*3), 3));   // three la exige; no se usa
      threadGeo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
      threadGeo.setIndex(idx);
      const mk = (radius, alpha, soft, minPx)=>{
        const m = new THREE.Mesh(threadGeo, new THREE.ShaderMaterial({
          uniforms:{ uTime:threadU.uTime, uReveal:threadU.uReveal, uColors:threadU.uColors, uAlpha:{ value:alpha }, uSoft:{ value:soft },
            uRadius:{ value:radius }, uMinPx:{ value:minPx }, uPxK:threadPxK, uPts:threadPts, uN:{ value:planets.length } },
          vertexShader:THREAD_VERT, fragmentShader:THREAD_FRAG, ...additive
        }));
        m.frustumCulled = false;   // la geometría "real" la arma el shader: three no conoce sus límites
        return m;
      };
      world.add(mk(0.011, 1.0, 0.4, 0.8));    // núcleo: al menos ~1.6px de ancho
      world.add(mk(0.05, 0.22, 2.4, 2.2));    // halo suave
    }
    // los planetas avanzan por sus órbitas, todos a la misma velocidad angular: así el hilo
    // conserva la espiral dibujada (la distancia angular entre temporadas no cambia). Van hacia
    // -ángulo, el sentido contrario al giro automático del sistema: si fueran a favor, en
    // pantalla se compensarían y parecerían quietos
    const ORBIT_SPEED = 0.05;   // rad/s: una vuelta cada ~2 minutos
    let orbitT = 0;
    function placePlanets(){
      planets.forEach((p, k)=>{
        const a = p.a0 - ORBIT_SPEED*orbitT;
        p.group.position.set(Math.cos(a)*p.R, 0, Math.sin(a)*p.R);
        p.trailU.uHead.value = ((a % TAU) + TAU) % TAU;
        threadPts.value[k].copy(p.group.position).applyEuler(p.orbit.rotation);
      });
    }

    // ---- bloom (solo desktop) ----
    let composer = null, bloomPass = null, shadowPass = null;
    function setupBloom(){
      // el render target del composer es donde se dibuja la escena con bloom: sin muestras
      // propias no hay ningún antialiasing (el MSAA del canvas no aplica acá) y los bordes de
      // geometría (la esfera del Hoyo, el disco de canto, órbitas, el hilo) salían dentados
      const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
      const samples = Math.min(8, renderer.capabilities.maxSamples || 4);   // 8 en casi toda GPU de escritorio
      composer = new POST.EffectComposer(renderer, new THREE.WebGLRenderTarget(sz.x, sz.y, { type:THREE.HalfFloatType, samples }));
      composer.addPass(new POST.RenderPass(scene, camera));
      bloomPass = new POST.UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.42, 0.8);
      composer.addPass(bloomPass);
      // el bloom derrama luz sobre la sombra y la deja gris; este pase le resta el bloom
      // dentro del círculo proyectado del horizonte, para que el Hoyo siga negro
      shadowPass = new POST.ShaderPass({
        uniforms:{ tDiffuse:{ value:null }, uBloom:{ value:null },
          uCenter:{ value:new THREE.Vector2(0.5, 0.5) }, uRadius:{ value:0 }, uAspect:{ value:1 } },
        vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader:`
          uniform sampler2D tDiffuse, uBloom; uniform vec2 uCenter; uniform float uRadius, uAspect;
          varying vec2 vUv;
          void main(){
            vec4 c = texture2D(tDiffuse, vUv);
            vec3 b = texture2D(uBloom, vUv).rgb;
            float d = length((vUv - uCenter) * vec2(uAspect, 1.0));
            // uBloom ya es el bloom compuesto entero: se resta completo dentro de la sombra (si
            // no, el Hoyo queda gris), con un borde justo en la silueta
            float m = 1.0 - smoothstep(uRadius*0.97, uRadius*1.01, d);
            c.rgb = max(c.rgb - b*m, 0.0);
            gl_FragColor = c;
          }`
      });
      // ShaderPass clona sus uniforms y la textura de un render target no se clona: va después
      shadowPass.uniforms.uBloom.value = bloomPass.renderTargetsHorizontal[0].texture;
      composer.addPass(shadowPass);
      composer.addPass(new POST.OutputPass());
    }
    function dropBloom(){
      if(!composer) return;
      composer.passes.forEach(p=>{ if(p.dispose) p.dispose(); });
      composer.dispose();
      composer = null; bloomPass = null; shadowPass = null;
    }
    if(POST && TIERS[tier].bloom){ try{ setupBloom(); }catch(e){ composer = null; } }
    // bajar un nivel: sin bloom, menos píxeles, shaders con menos detalle (se recompilan una
    // vez). Solo hacia abajo: nunca se vuelve a subir, así no hay idas y vueltas
    function lowerTier(){
      const next = TIER_DOWN[tier];
      if(!next) return false;
      tier = next;
      const T = TIERS[tier];
      if(!T.bloom) dropBloom();
      renderer.setPixelRatio(Math.min(dpr, T.dpr));
      detailMats.forEach(m=>{ m.defines.DETAIL = T.detail; m.needsUpdate = true; });
      resize();
      root.dataset.quality = tier;
      if(opts.onQuality) opts.onQuality(tier);
      return true;
    }
    // intensidad de los sprites: con bloom hacen falta mucho menos
    const spriteK = ()=> composer ? 0.35 : 1;

    // ---- tamaño / encuadre ----
    let W = 1, H = 1, baseZ = 20;
    function resize(){
      W = Math.max(1, container.clientWidth); H = Math.max(1, container.clientHeight);
      renderer.setSize(W, H, false);
      if(composer){ composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(W, H); }
      camera.aspect = W/H;
      portrait = camera.aspect < 0.8;
      // la hoja inferior del foco (objeto arriba, panel abajo): en vertical, y también en cajas
      // angostas aunque no sean verticales (un teléfono con la galaxia a pantalla completa)
      sheet = portrait || W < 640;
      root.classList.toggle("is-portrait", sheet);
      // alejar la cámara lo justo para que el sistema completo quepa a lo ancho y a lo alto;
      // en vertical se acepta que las órbitas exteriores rocen el borde, si no queda diminuto
      const extent = ORBIT_R[0] + 0.8;
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      // en la home la caja es una franja ancha y baja: ahí manda el alto, y la vista desde
      // arriba (pitch ~0.46) ocupa bastante menos que el radio entero, así que se aprieta más
      const dV = (extent*(camera.aspect < 1.25 ? 0.82 : 0.7))/tanV, dH = extent*(portrait ? 0.9 : 1)/(tanV*camera.aspect);
      baseZ = Math.max(dV, dH) + 1.5;
      camera.updateProjectionMatrix();
      threadPxK.value = 2*tanV/(H*renderer.getPixelRatio());
      measureLabels();
      wake();
    }
    function measureLabels(){
      planets.forEach(p=>{
        p.label.classList.remove("is-compact");
        p.lw = p.label.offsetWidth; p.lh = p.label.offsetHeight;
        p.cw = p.label.firstChild.offsetWidth + 16;
      });
      holeItem.lw = holeItem.label.offsetWidth; holeItem.lh = holeItem.label.offsetHeight;
    }
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    cleanups.push(()=>ro.disconnect());
    if(document.fonts && document.fonts.ready){
      let alive = true; cleanups.push(()=>{ alive = false; });
      document.fonts.ready.then(()=>{ if(alive) measureLabels(); });
    }

    // ---- el Hoyo como objetivo (clic, Tab, foco) ----
    const holeItem = { kind:"hole", r:HOLE_R, world:new THREE.Vector3(), hover:false, hoverK:0, appear:0, label:null };
    const armHref = opts.armageddonHref || "#/armageddon";
    {
      const hl = document.createElement("a");
      hl.className = "solar-label solar-label-hole";
      hl.href = armHref;
      hl.style.setProperty("--pcolor", "#ff6a6a");
      hl.style.opacity = "0";
      hl.innerHTML = `<span class="solar-code">el hoyo</span><span class="solar-title">Armagedón</span>`;
      hl.setAttribute("aria-label", "El Hoyo: el Armagedón. Enter para verlo en detalle.");
      labelsLayer.appendChild(hl);   // después de S0..S5: el Tab llega al Hoyo al final
      holeItem.label = hl;
    }
    const items = planets.concat([holeItem]);

    // ---- lunas: etiquetas y destino ----
    // Cada luna es una historia: en el foco de su planeta muestra su número (el mismo de la lista
    // del panel) y, al pasar encima, el título. Clic = ir a esa historia en la temporada. No
    // entran al Tab: para el teclado está la lista del panel, que lleva a los mismos lugares.
    const storyHref = opts.storyHref || ((sid, idx)=> `#/season/${sid}/${idx}`);
    const allMoons = [];
    planets.forEach(p=> p.moons.forEach(m=>{
      const a = document.createElement("a");
      a.className = "solar-moon";
      a.href = storyHref(p.season.id, m.index);
      a.tabIndex = -1;
      a.setAttribute("aria-hidden", "true");
      a.style.setProperty("--pcolor", p.season.color || CYAN);
      a.style.opacity = "0";
      a.innerHTML = `<span class="solar-moon-n"></span><span class="solar-moon-t"></span>`;
      a.firstChild.textContent = String(m.index + 1);
      a.lastChild.textContent = m.event.title || "";
      labelsLayer.appendChild(a);
      m.label = a;
      allMoons.push(m);
    }));
    function goStory(m){ saveView(); location.href = m.label.href; }
    allMoons.forEach(m=>{
      on(m.label, "click", ()=> saveView());
      on(m.label, "mouseenter", ()=>setHover(m));
      on(m.label, "mouseleave", ()=>setHover(null));
    });
    const hoverables = items.concat(allMoons);

    // ---- panel del foco ----
    const panelId = "solarPanel" + Math.random().toString(36).slice(2, 8);
    const panel = document.createElement("aside");
    panel.className = "solar-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", panelId + "-t");
    panel.inert = true;
    panel.innerHTML = `
      <button type="button" class="solar-back" aria-label="Volver a la vista general"><span aria-hidden="true">←</span> <span class="solar-back-txt">Vista general</span></button>
      <div class="solar-p-code"></div>
      <h2 class="solar-p-title" id="${panelId}-t"></h2>
      <p class="solar-p-text"></p>
      <div class="solar-p-stats"></div>
      <div class="solar-p-avatars" role="list"></div>
      <div class="solar-p-sub">Historias <span>· cada luna es una</span></div>
      <ol class="solar-p-stories"></ol>
      <a class="solar-p-enter" href="#"></a>`;
    root.appendChild(panel);
    const $p = sel => panel.querySelector(sel);

    function isPending(text){
      if(!text) return true;
      const t = String(text).trim().toLowerCase();
      return t.startsWith("cuéntame") || t.startsWith("cuentame") || t.startsWith("—") || t.startsWith("-");
    }
    function charsOf(list){
      const chars = (typeof DATA !== "undefined" && DATA.characters) || {};
      return list.map(id=>({ id, c:chars[id] })).filter(x=>x.c);
    }
    function avatarSrc(c){
      if(c.thumb) return c.thumb;
      if(Array.isArray(c.photos) && c.photos.length) return c.photos[0];
      return c.photoLarge || c.photo || null;
    }
    function initials(name){
      return name.split(" ").filter(w=>w[0] && w[0]===w[0].toUpperCase()).slice(0,2).map(w=>w[0]).join("").slice(0,2) || name.slice(0,2);
    }
    function fillAvatars(list){
      const box = $p(".solar-p-avatars");
      box.textContent = "";
      const MAX = 12;
      list.slice(0, MAX).forEach(({ c })=>{
        const d = document.createElement("span");
        d.className = "solar-ava";
        d.setAttribute("role", "listitem");
        d.title = c.name;
        d.style.setProperty("--acolor", c.color || "#68d8ff");
        const src = avatarSrc(c);
        if(src){
          const img = document.createElement("img");
          img.src = src; img.alt = c.name; img.loading = "lazy"; img.decoding = "async";
          if(!c.thumb) img.className = "is-full";
          d.appendChild(img);
        } else {
          d.textContent = initials(c.name);
          d.setAttribute("aria-label", c.name);
        }
        box.appendChild(d);
      });
      if(list.length > MAX){
        const more = document.createElement("span");
        more.className = "solar-ava solar-ava-more";
        more.setAttribute("role", "listitem");
        more.textContent = "+" + (list.length - MAX);
        box.appendChild(more);
      }
    }
    function fillPanel(item){
      const stats = $p(".solar-p-stats");
      const enter = $p(".solar-p-enter");
      const text = $p(".solar-p-text");
      panel.classList.toggle("is-doom", item.kind === "hole");
      if(item.kind === "planet"){
        const s = item.season;
        panel.style.setProperty("--pcolor", s.color || CYAN);
        $p(".solar-p-code").textContent = s.code || `S${s.id}`;
        $p(".solar-p-title").textContent = s.title || "";
        const pend = isPending(s.hito);
        text.textContent = pend ? "— hito pendiente —" : s.hito;
        text.classList.toggle("is-pending", pend);
        // personajes de la temporada, los que más aparecen primero
        const count = {};
        const evs = s.events || [];
        evs.forEach(e=> (e.chars || []).forEach(id=>{ count[id] = (count[id] || 0) + 1; }));
        const ids = Object.keys(count).sort((a,b)=> count[b] - count[a]);
        const people = charsOf(ids);
        stats.innerHTML = `<span><b>${evs.length}</b> ${evs.length === 1 ? "historia" : "historias"}</span><span><b>${people.length}</b> ${people.length === 1 ? "personaje" : "personajes"}</span>`;
        fillAvatars(people);
        // la lista de historias: una fila por luna, con su número; pasar encima enciende la luna
        const list = $p(".solar-p-stories");
        list.textContent = "";
        item.moons.forEach(m=>{
          const li = document.createElement("li");
          const a = document.createElement("a");
          a.href = m.label.href;
          a.innerHTML = `<span class="solar-st-n"></span><span class="solar-st-tx"><span class="solar-st-t"></span><span class="solar-st-d"></span></span>`;
          a.querySelector(".solar-st-n").textContent = String(m.index + 1);
          a.querySelector(".solar-st-t").textContent = m.event.title || "Historia sin título";
          a.querySelector(".solar-st-d").textContent = isPending(m.event.date) ? "fecha pendiente" : (m.event.date || "");
          a.addEventListener("mouseenter", ()=>setHover(m));
          a.addEventListener("mouseleave", ()=>setHover(null));
          a.addEventListener("focus", ()=>setHover(m));
          a.addEventListener("blur", ()=>setHover(null));
          a.addEventListener("click", saveView);
          li.appendChild(a);
          list.appendChild(li);
        });
        list.hidden = $p(".solar-p-sub").hidden = !item.moons.length;
        enter.href = hrefFor(s.id);
        enter.innerHTML = `Entrar a la temporada <span aria-hidden="true">→</span>`;
      } else {
        panel.style.setProperty("--pcolor", "#ff6a6a");
        $p(".solar-p-code").textContent = "El Hoyo";
        $p(".solar-p-title").textContent = "Armagedón";
        const arm = (typeof DATA !== "undefined" && DATA.armageddon) || {};
        const pend = isPending(arm.intro);
        text.textContent = pend ? "— la profecía está pendiente —" : arm.intro;
        text.classList.toggle("is-pending", pend);
        // los que el Hoyo se va a tragar: el núcleo del grupo
        const all = (typeof DATA !== "undefined" && DATA.characters) || {};
        const core = charsOf(Object.keys(all).filter(id=> all[id].tier === "primario"));
        const written = core.filter(x=> x.c.destino && !isPending(x.c.destino)).length;
        stats.innerHTML = `<span><b>${core.length}</b> en el grupo</span><span><b>${written}</b> ${written === 1 ? "destino escrito" : "destinos escritos"}</span>`;
        fillAvatars(core);
        $p(".solar-p-stories").hidden = $p(".solar-p-sub").hidden = true;
        enter.href = armHref;
        enter.innerHTML = `Ir al Armagedón <span aria-hidden="true">→</span>`;
      }
    }

    // ---- humor del Armagedón ----
    let doomOn = false;
    const setMood = opts.onMood || (doom=>{ try{ document.body.classList.toggle("mood-doom", doom); }catch(e){} });
    function mood(doom){ if(doom !== doomOn){ doomOn = doom; setMood(doom); } }
    // colores base y su versión "condenada", para teñir disco, lente, halos y la luz
    const DOOM = {
      hot:[discU.uHot.value.clone(), C("#fff0e2")], cyan:[discU.uCyan.value.clone(), C("#ff6a3d")],
      violet:[discU.uViolet.value.clone(), C("#b3123a")], deep:[discU.uDeep.value.clone(), C("#3a0610")],
      light:[lightUniforms.uLightCol.value.clone(), C("#ffb49a")],
      haloV:[haloV.material.color.clone(), C("#7a0a1c")], haloC:[haloC.material.color.clone(), C("#ff4a2a")]
    };
    let doomK = 0;
    function applyDoom(){
      discU.uHot.value.lerpColors(DOOM.hot[0], DOOM.hot[1], doomK);
      discU.uCyan.value.lerpColors(DOOM.cyan[0], DOOM.cyan[1], doomK);
      discU.uViolet.value.lerpColors(DOOM.violet[0], DOOM.violet[1], doomK);
      discU.uDeep.value.lerpColors(DOOM.deep[0], DOOM.deep[1], doomK);
      lightUniforms.uLightCol.value.lerpColors(DOOM.light[0], DOOM.light[1], doomK);
      haloV.material.color.lerpColors(DOOM.haloV[0], DOOM.haloV[1], doomK);
      haloC.material.color.lerpColors(DOOM.haloC[0], DOOM.haloC[1], doomK);
    }

    // ---- memoria de la vista (para volver con "atrás" al mismo ángulo) ----
    const VIEW_KEY = "ychSolarView";
    function saveView(){
      try{
        sessionStorage.setItem(VIEW_KEY, JSON.stringify({ yaw: ((yaw % TAU) + TAU) % TAU, pitch, zoom:zoomTarget, orbitT, t: Date.now() }));
      }catch(e){ /* sin storage (vista previa, modo privado estricto): no se recuerda, y listo */ }
    }
    let restored = false;
    if(opts.restoreView) try{
      const v = JSON.parse(sessionStorage.getItem(VIEW_KEY) || "null");
      if(v && isFinite(v.yaw) && isFinite(v.pitch) && Date.now() - (v.t || 0) < 6*3600*1000){
        yaw = v.yaw; pitch = wrapAngle(v.pitch);
        if(isFinite(v.zoom)) zoom = zoomTarget = clampZoom(v.zoom);
        if(isFinite(v.orbitT)) orbitT = v.orbitT;
        restored = true;
      }
    }catch(e){ /* storage bloqueado o JSON roto: vista por defecto */ }
    on(window, "pagehide", saveView);

    // ---- cámara: vista general <-> foco ----
    const FOCUS_DUR = 1.05;
    let focus = null;    // { item, dir }
    let tween = null;    // { from:{pos,target,k}, start }
    const cam = { pos:new THREE.Vector3(0, 0, 20), target:new THREE.Vector3(), k:0 };
    const dest = { pos:new THREE.Vector3(), target:new THREE.Vector3(), k:0 };
    const easeInOutCubic = x=> x < 0.5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2;
    let portrait = portraitAtMount, sheet = portraitAtMount;

    function overviewDest(camE){
      dest.pos.set(0, 2.5*(1 - camE), baseZ*zoom*(1 + 2.4*(1 - camE)));
      // el lado cercano de las órbitas baja más de lo que el lejano sube: mirar un poco más
      // abajo del Hoyo deja el conjunto centrado en la caja
      dest.target.set(0, portrait ? -0.45 : -0.55, 0);
      dest.k = 0;
    }
    function focusDest(){
      const it = focus.item;
      const center = it.world;
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      dest.target.copy(center);
      dest.k = 1;
      if(it.kind === "hole"){ dest.pos.copy(center).addScaledVector(focus.dir, holeFocusDist()); return; }
      let D;
      if(sheet){
        // teléfono: la hoja de abajo es baja (SHEET_TOP libre arriba) y el planeta manda. El
        // encuadre lo hace grande (66% del ancho para planeta + lunas cercanas); las lunas más
        // lejanas pueden asomarse al borde mientras giran
        const rEff = Math.max(it.r * (it.ringed ? 2.35 : 1.25), it.moonMax*0.72);
        D = Math.max(rEff/(0.66*tanV*camera.aspect), rEff/(0.8*SHEET_TOP*tanV));
      } else {
        // desktop: el objeto vive en la mitad izquierda, con sus lunas
        const rEff = Math.max(it.r * (it.ringed ? 2.35 : 1.2), it.moonMax*0.8), frac = 0.4;
        D = Math.max(rEff/(frac*tanV*1.6), rEff/(frac*tanV*camera.aspect*0.55*1.2));
      }
      dest.pos.copy(center).addScaledVector(focus.dir, D);
    }
    // en la hoja del teléfono, qué fracción del alto queda libre arriba para el objeto (la hoja
    // ocupa el resto; su alto máximo en el CSS va de la mano: .solar-root.is-portrait .solar-panel)
    const SHEET_TOP = 0.64;
    function holeFocusDist(){
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      const rEff = DISC_OUT*1.05;
      if(sheet) return Math.max(rEff/(0.92*tanV*camera.aspect), rEff/(0.85*SHEET_TOP*tanV));
      return Math.max(rEff/(0.7*tanV), rEff/(0.7*tanV*camera.aspect*0.55));
    }
    function startTween(){
      if(reduced){ tween = null; return; }   // con reduced-motion la cámara salta
      // reloj real, no dt: si un cuadro tarda, el vuelo no se alarga
      tween = { from:{ pos:cam.pos.clone(), target:cam.target.clone(), k:cam.k }, start:performance.now() };
    }
    function applyViewOffset(k){
      if(k < 0.001){ if(camera.view && camera.view.enabled) camera.clearViewOffset(); return; }
      // correr el encuadre: el objeto queda a un lado y el panel ocupa el otro
      // en la hoja: el objeto queda centrado en la parte libre de arriba (SHEET_TOP del alto)
      if(sheet) camera.setViewOffset(W, H, 0, H*(0.5 - SHEET_TOP/2)*k, W, H);
      else camera.setViewOffset(W, H, W*0.2*k, 0, W, H);
    }

    const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vN = new THREE.Vector3();
    let focusOrigin = null;   // a qué elemento devolver el foco del teclado al salir
    function openFocus(item, fromKeyboard){
      if(!item || (focus && focus.item === item)) return;
      // dirección desde la que la cámara mira al objetivo
      const dir = new THREE.Vector3();
      if(item.kind === "planet"){
        // entre la cámara actual y el Hoyo, un poco desde arriba: se ve la cara iluminada
        // y el Hoyo queda de fondo
        vA.copy(camera.position).sub(item.world).normalize();
        vB.copy(holeItem.world).sub(item.world).normalize();
        dir.copy(vA).addScaledVector(vB, 0.9).add(vN.set(0, 0.35, 0));
        if(dir.lengthSq() < 1e-4) dir.copy(vA);
        dir.normalize();
      } else {
        // al Hoyo, casi de canto respecto del disco: así se ve como Gargantúa. Las órbitas
        // de afuera rodean al Hoyo, así que se busca el azimut (cerca del actual) donde ningún
        // planeta quede entre la cámara y el disco
        vN.set(0, 1, 0).applyQuaternion(world.quaternion);
        vA.copy(camera.position).sub(item.world);
        vA.addScaledVector(vN, -vA.dot(vN));
        if(vA.lengthSq() < 1e-4) vA.set(0, 0, 1);
        vA.normalize();
        vB.crossVectors(vN, vA).normalize();               // completa la base del plano del disco
        const elev = 0.17, D = holeFocusDist();
        const rEff = DISC_OUT*1.05;
        const cand = new THREE.Vector3(), seg = new THREE.Vector3(), rel = new THREE.Vector3();
        let bestScore = Infinity;
        for(let k=0; k<36; k++){
          const az = (k < 18 ? k : k - 36) * (Math.PI/18);   // 0, +10°, ..., -10°
          cand.copy(vA).multiplyScalar(Math.cos(az)).addScaledVector(vB, Math.sin(az))
            .multiplyScalar(Math.cos(elev)).addScaledVector(vN, Math.sin(elev)).normalize();
          seg.copy(cand).multiplyScalar(D);                 // del Hoyo a la cámara candidata
          let score = Math.abs(az)*0.4;
          planets.forEach(p=>{
            rel.copy(p.world).sub(item.world);
            const t = rel.dot(seg)/(D*D);
            if(t <= 0.05 || t >= 1) return;                  // detrás del Hoyo o detrás de la cámara
            const perp = rel.addScaledVector(seg, -t).length();
            const block = (1 - t)*rEff*1.5 + p.r*(p.ringed ? 2.4 : 1.6);
            if(perp < block) score += (block - perp)*10;
          });
          if(score < bestScore){ bestScore = score; dir.copy(cand); }
        }
      }
      startTween();
      focus = { item, dir };
      velYaw = velPitch = 0;
      fillPanel(item);
      panel.inert = false;
      panel.classList.add("is-open");
      root.classList.add("is-focus");
      mood(item.kind === "hole");
      focusOrigin = item.label;
      lastInteract = performance.now();
      if(fromKeyboard){ try{ $p(".solar-p-enter").focus({ preventScroll:true }); }catch(e){} }
      wake();
    }
    function closeFocus(){
      if(!focus) return;
      const hadKeyboardFocus = panel.contains(document.activeElement);
      startTween();
      focus = null;
      panel.classList.remove("is-open");
      panel.inert = true;
      root.classList.remove("is-focus");
      mood(false);
      lastInteract = performance.now();
      if(hadKeyboardFocus && focusOrigin){ try{ focusOrigin.focus({ preventScroll:true }); }catch(e){} }
      wake();
    }
    on($p(".solar-back"), "click", closeFocus);
    on($p(".solar-p-enter"), "click", saveView);
    on(document, "keydown", e=>{
      if(e.key !== "Escape" || !focus || (opts.keysBlocked && opts.keysBlocked())) return;
      e.preventDefault(); closeFocus();
    });

    // etiquetas: clic / Enter abren el foco (ctrl/cmd-clic sigue abriendo el link)
    items.forEach(it=>{
      on(it.label, "click", e=>{
        if(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e.button !== undefined && e.button !== 0)){ saveView(); return; }
        e.preventDefault();
        openFocus(it, e.detail === 0);
      });
      on(it.label, "mouseenter", ()=>setHover(it));
      on(it.label, "mouseleave", ()=>setHover(null));
      on(it.label, "focus", ()=>setHover(it));
      on(it.label, "blur", ()=>setHover(null));
    });

    // ---- puntero: arrastrar rota, un toque/clic limpio selecciona ----
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const CLICK_SLOP = 5;                  // px: más que esto ya es arrastre, no selección
    let velYaw = 0, velPitch = 0;          // rad/s
    let drag = null;
    let lastInteract = -1e9;
    let hovered = null;

    const owns = ()=> !!(opts.ownsGestures && opts.ownsGestures());
    function radPerPx(){ return Math.PI / Math.max(360, W) * 1.15; }
    function setPitch(v){ pitch = wrapAngle(v); }

    function pick(clientX, clientY, isTouch){
      const rect = canvas.getBoundingClientRect();
      ndc.set(((clientX-rect.left)/rect.width)*2-1, -((clientY-rect.top)/rect.height)*2+1);
      raycaster.setFromCamera(ndc, camera);
      const ray = raycaster.ray;
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      // radio mínimo en pantalla: generoso para el dedo, sobre todo con planetas chicos
      const minPx = isTouch ? 26 : 14;
      let best = null, bestD = Infinity;
      // en el foco de un planeta, sus lunas también se eligen (en la vista general son puntitos y
      // le robarían el clic a los planetas)
      if(focus && focus.item.kind === "planet"){
        focus.item.moons.forEach(m=>{
          if(m.appear < 0.5) return;
          const d = ray.origin.distanceTo(m.world);
          const hitR = Math.max(m.mr*m.mesh.scale.x*1.8, (isTouch ? 22 : 12)*2*d*tanV/H);
          if(ray.distanceSqToPoint(m.world) > hitR*hitR) return;
          if(d < bestD){ bestD = d; best = m; }
        });
      }
      items.forEach(it=>{
        if(it.appear < 0.5) return;
        const d = ray.origin.distanceTo(it.world);
        const worldPerPx = 2*d*tanV/H;
        const own = it.kind === "hole" ? HOLE_R*1.25 : it.r*it.group.scale.x*(it.ringed ? 1.9 : 1.35);
        const hitR = Math.max(own, minPx*worldPerPx);
        if(ray.distanceSqToPoint(it.world) > hitR*hitR) return;
        if(d < bestD){ bestD = d; best = it; }
      });
      return best;
    }
    function cursor(){
      canvas.style.cursor = drag && drag.moved ? "grabbing" : hovered ? "pointer" : focus ? "default" : "grab";
    }
    function setHover(it){
      if(it === hovered) return;
      if(hovered){ hovered.hover = false; hovered.label.classList.remove("is-hover"); }
      hovered = it;
      if(it){ it.hover = true; it.label.classList.add("is-hover"); }
      cursor();
      wake();
    }

    // dedos sobre el canvas, para el pellizco (zoom con dos dedos)
    const touches = new Map();
    let pinch = null, noPickUntil = 0;
    const touchDist = ()=>{ const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
    function dropTouch(e){
      if(!touches.delete(e.pointerId)) return;
      if(pinch && touches.size < 2){ pinch = null; noPickUntil = performance.now() + 350; }
    }

    on(canvas, "pointerdown", e=>{
      if(e.button !== undefined && e.button !== 0) return;
      const now = performance.now();
      if(e.pointerType === "touch"){
        touches.set(e.pointerId, { x:e.clientX, y:e.clientY });
        if(touches.size === 2 && owns() && !focus){
          // segundo dedo: deja de ser un giro, pasa a ser un pellizco
          pinch = { d0:touchDist(), z0:zoomTarget };
          drag = null; velYaw = velPitch = 0;
          lastInteract = now; wake();
          return;
        }
        if(touches.size > 2 || pinch) return;
      }
      drag = { id:e.pointerId, type:e.pointerType, x0:e.clientX, y0:e.clientY, x:e.clientX, y:e.clientY, t:now, moved:false };
      if(e.pointerType !== "touch"){ try{ canvas.setPointerCapture(e.pointerId); }catch(err){} }
      velYaw = velPitch = 0;   // agarrar frena el giro en seco
      lastInteract = now;
      wake();
    });
    on(canvas, "pointermove", e=>{
      if(touches.has(e.pointerId)) touches.set(e.pointerId, { x:e.clientX, y:e.clientY });
      if(pinch){
        if(touches.size >= 2){ zoomTarget = clampZoom(pinch.z0 * pinch.d0/touchDist()); lastInteract = performance.now(); wake(); }
        return;
      }
      if(!drag || e.pointerId !== drag.id){
        if(e.pointerType === "mouse") setHover(pick(e.clientX, e.clientY, false));
        return;
      }
      const now = performance.now();
      if(!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > CLICK_SLOP){
        drag.moved = true;
        // el tramo dentro del margen no rota: así un clic tembloroso no mueve la escena
        drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
        if(hovered) setHover(null);
        cursor();
      }
      if(!drag.moved || focus){ lastInteract = now; return; }   // en foco la escena no rota
      const dx = e.clientX - drag.x;
      // en touch, fuera del modo galaxia solo el gesto horizontal rota (el vertical es del
      // scroll de la página); en modo galaxia el dedo gira en cualquier dirección
      const dy = drag.type === "touch" && !owns() ? 0 : e.clientY - drag.y;
      const dt = Math.max(8, now - drag.t)/1000;
      const k = radPerPx();
      yaw += dx*k;
      setPitch(pitch + dy*k*0.8);
      // velocidad suavizada: el último tramo del gesto manda, sin saltos por un evento suelto
      velYaw = velYaw*0.5 + (dx*k/dt)*0.5;
      velPitch = velPitch*0.5 + (dy*k*0.8/dt)*0.5;
      drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
      lastInteract = now;
      wake();
    });
    function endDrag(e, cancelled){
      if(!drag || e.pointerId !== drag.id) return;
      const now = performance.now();
      const wasDrag = drag.moved;
      if(now - drag.t > 80){ velYaw = velPitch = 0; }   // se detuvo antes de soltar: sin inercia
      const type = drag.type;
      drag = null;
      lastInteract = now;
      if(!wasDrag && !cancelled && now > noPickUntil){
        velYaw = velPitch = 0;
        const it = pick(e.clientX, e.clientY, type === "touch");
        if(it && it.kind === "moon") goStory(it);
        else if(it) openFocus(it, false);
        else if(focus) closeFocus();     // clic en el vacío: vuelve a la vista general
      }
      const MAX = 5;   // tope de inercia, para que un latigazo no lo deje como trompo
      velYaw = Math.max(-MAX, Math.min(MAX, velYaw));
      velPitch = Math.max(-MAX, Math.min(MAX, velPitch));
      if(e.pointerType === "mouse") setHover(pick(e.clientX, e.clientY, false));
      cursor();
      wake();
    }
    on(canvas, "pointerup", e=>{ endDrag(e, false); dropTouch(e); });
    on(canvas, "pointercancel", e=>{ endDrag(e, true); dropTouch(e); });

    // rueda (y el pellizco del trackpad, que llega como rueda con ctrlKey): zoom. No escucha la
    // rueda por su cuenta: app.js tiene el único listener (solo en modo galaxia, en toda la
    // pantalla) y llama a solarWheel(e), que termina acá
    const onWheelZoom = e=>{
      if(focus) return true;          // en el foco no hay zoom, pero la rueda igual es nuestra
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1;
      const d = Math.max(-200, Math.min(200, e.deltaY*unit));
      zoomTarget = clampZoom(zoomTarget * Math.exp(d*(e.ctrlKey ? 0.01 : 0.0011)));
      lastInteract = performance.now();
      wake();
      return true;
    };
    wheelHook = onWheelZoom;
    cleanups.push(()=>{ if(wheelHook === onWheelZoom) wheelHook = null; });
    on(canvas, "pointerleave", e=>{ if(e.pointerType === "mouse" && !drag) setHover(null); });
    cursor();

    // ---- bucle ----
    let raf = null, lastT = 0, simTime = 0;
    let visible = !document.hidden, inView = true;
    let dirty = true;
    // entrada: la cámara llega desde lejos y el sistema aparece por partes, en orden. Si se
    // vuelve con "atrás" (vista recordada), se salta: ya la vio.
    const INTRO = 3.6;
    let introT = (reduced || restored || opts.intro === false) ? INTRO : 0, introStart = -1;
    const vTmp = new THREE.Vector3(), vSeg = new THREE.Vector3(), vHole = new THREE.Vector3(), vClosest = new THREE.Vector3();
    const qWorld = new THREE.Quaternion(), qCamInv = new THREE.Quaternion();
    // vigilancia del ritmo: intervalos entre callbacks de rAF (también los que se saltan a
    // 30fps), en ventanas de 90. Promedio sobre ~26ms (<38fps) = bajar un nivel; ya en el bajo
    // y sobre 60ms (<16fps) = rendirse. Tras bajar, una pausa para que se asiente.
    // El modo de bajo consumo de iOS topa el rAF en 30fps (33ms): eso baja la calidad hasta el
    // nivel bajo, que es justo lo que conviene ahí, pero nunca llega a rendirse.
    let paceN = 0, paceSum = 0, prevCb = 0, paceHold = 0, slowWins = 0;

    function wake(){ dirty = true; if(raf === null && visible && inView){ lastT = 0; prevCb = 0; raf = requestAnimationFrame(frame); } }
    function stop(){ if(raf !== null){ cancelAnimationFrame(raf); raf = null; } }

    on(document, "visibilitychange", ()=>{ visible = !document.hidden; if(visible) wake(); else { stop(); saveView(); } });
    if("IntersectionObserver" in window){
      const io = new IntersectionObserver(entries=>{
        inView = entries[0] ? entries[0].isIntersecting : true;
        if(inView) wake(); else stop();
      });
      io.observe(container);
      cleanups.push(()=>io.disconnect());
    }

    function hideLabel(l){ l.style.opacity = "0"; l.style.visibility = "hidden"; }
    const placed = [];
    function updateLabels(){
      vHole.copy(holeItem.world);
      const camPos = camera.position;
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      // en foco las etiquetas se van (el panel ya dice todo) y vuelven al salir
      const labelK = 1 - cam.k;
      updateMoonLabels(camPos, tanV);
      if(labelK < 0.05){ items.forEach(it=>hideLabel(it.label)); return; }

      placed.length = 0;
      // el Hoyo: discreto, bajo la sombra
      {
        vTmp.copy(vHole).project(camera);
        const x = (vTmp.x*0.5+0.5)*W, y = (-vTmp.y*0.5+0.5)*H;
        const dist = camPos.distanceTo(vHole);
        const rpx = HOLE_R*1.25*(H/2)/(dist*tanV);
        const op = (holeItem.hover ? 1 : 0.5) * holeItem.appear * labelK;
        holeItem.label.style.opacity = op.toFixed(2);
        holeItem.label.style.visibility = op > 0.02 ? "visible" : "hidden";
        holeItem.label.style.transform = `translate(${x.toFixed(1)}px, ${(y + rpx + 4).toFixed(1)}px) translate(-50%, 0)`;
        // entra al anti-choque: si una etiqueta de planeta le cae encima, esa queda compacta
        if(op > 0.02){
          const hw = (holeItem.lw || 80)/2;
          placed.push({ x0:x - hw, x1:x + hw, y0:y + rpx + 4, y1:y + rpx + 4 + (holeItem.lh || 30) });
        }
      }

      const order = planets.slice().sort((a,b)=> camPos.distanceToSquared(a.world) - camPos.distanceToSquared(b.world));
      order.forEach(p=>{
        vTmp.copy(p.world).project(camera);
        if(vTmp.z > 1 || p.appear < 0.02){ hideLabel(p.label); return; }
        const x = (vTmp.x*0.5+0.5)*W, y = (-vTmp.y*0.5+0.5)*H;
        const dist = camPos.distanceTo(p.world);
        const rpx = p.r * p.group.scale.x * (H/2) / (dist*tanV);
        // ¿lo tapa el Hoyo? distancia del centro del Hoyo al segmento cámara->planeta
        vSeg.copy(p.world).sub(camPos);
        const segLen = vSeg.length(); vSeg.divideScalar(segLen);
        const tProj = vClosest.copy(vHole).sub(camPos).dot(vSeg);
        let hidden = false;
        if(tProj > 0 && tProj < segLen){
          vClosest.copy(camPos).addScaledVector(vSeg, tProj);
          if(vClosest.distanceTo(vHole) < HOLE_R*1.1) hidden = true;
        }
        // si choca con una etiqueta más cercana a la cámara, queda solo el código
        const ly = y - rpx - 6;
        let compact = false;
        const box = { x0:x - p.lw/2, x1:x + p.lw/2, y0:ly - p.lh, y1:ly };
        if(!p.hover && !hidden){
          for(const b of placed){ if(box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0){ compact = true; break; } }
        }
        if(compact){ box.x0 = x - p.cw/2; box.x1 = x + p.cw/2; box.y0 = ly - p.lh*0.45; }
        if(!hidden) placed.push(box);
        p.label.classList.toggle("is-compact", compact);
        const depth = (dist - camPos.length())/ORBIT_R[0];   // ~ -1 (cerca) .. 1 (lejos)
        const op = hidden ? 0 : Math.max(0.42, Math.min(1, 0.8 - depth*0.4)) * clamp01((p.appear - 0.4)/0.6);
        p.label.style.opacity = ((p.hover ? Math.max(op, 1) : op) * labelK).toFixed(2);
        p.label.style.visibility = hidden ? "hidden" : "visible";
        p.label.style.transform = `translate(${x.toFixed(1)}px, ${ly.toFixed(1)}px) translate(-50%, -100%)`;
        p.label.style.zIndex = String(p.hover ? 2000 : 1000 - Math.round(dist*10));
      });
    }

    // números de las lunas del planeta en foco (y el título de la que está bajo el puntero)
    function updateMoonLabels(camPos, tanV){
      allMoons.forEach(m=>{
        const p = m.planet;
        const show = focus && focus.item === p && cam.k > 0.3 && m.appear > 0.5;
        if(!show){ if(m.label.style.visibility !== "hidden") hideLabel(m.label); return; }
        vTmp.copy(m.world).project(camera);
        const x = (vTmp.x*0.5+0.5)*W, y = (-vTmp.y*0.5+0.5)*H;
        // detrás de su planeta: no se ve, no se rotula
        vSeg.copy(m.world).sub(camPos);
        const segLen = vSeg.length(); vSeg.divideScalar(segLen);
        const tProj = vClosest.copy(p.world).sub(camPos).dot(vSeg);
        let hidden = false;
        if(tProj > 0 && tProj < segLen){
          vClosest.copy(camPos).addScaledVector(vSeg, tProj);
          if(vClosest.distanceTo(p.world) < p.r*p.group.scale.x) hidden = true;
        }
        const rpx = m.mr*m.mesh.scale.x*p.group.scale.x*(H/2)/(camPos.distanceTo(m.world)*tanV);
        m.label.style.visibility = hidden ? "hidden" : "visible";
        m.label.style.opacity = hidden ? "0" : ((cam.k - 0.3)/0.7).toFixed(2);
        m.label.style.transform = `translate(${(x + rpx + 3).toFixed(1)}px, ${(y - rpx - 3).toFixed(1)}px) translate(0, -100%)`;
        m.label.style.zIndex = m.hover ? "2100" : "1500";
      });
    }

    function busy(){
      return drag || pinch || velYaw || velPitch || tween || Math.abs(zoomTarget - zoom) > 0.0005 || introT < INTRO || Math.abs(doomTarget() - doomK) > 0.001 ||
        hoverables.some(it=> Math.abs(((it.hover || (focus && focus.item === it))?1:0) - it.hoverK) > 0.01);
    }
    function doomTarget(){ return focus && focus.item.kind === "hole" ? 1 : 0; }
    function pace(now){
      const gap = prevCb ? now - prevCb : 0;
      prevCb = now;
      if(!gap || gap > 250 || reduced || introT < INTRO || now < paceHold) return true;
      paceN++; paceSum += gap;
      if(paceN < 90) return true;
      const avg = paceSum/paceN;
      paceN = 0; paceSum = 0;
      // dos ventanas lentas seguidas: un tirón suelto (fotos decodificándose, otra pestaña) no
      // debe bajar la calidad para siempre
      slowWins = avg > 26 ? slowWins + 1 : 0;
      if(slowWins >= 2 && lowerTier()){ slowWins = 0; paceHold = now + 2500; return true; }
      if(avg > 60 && tier === "low" && !opts.force){ fail("slow"); return false; }
      return true;
    }

    function frame(now){
      raf = null;
      if(dead) return;
      if(!pace(now)) return;
      const dt = lastT ? Math.min((now-lastT)/1000, 0.05) : 0;
      lastT = now;

      // --- entrada ---
      // por reloj real, no por dt: si el equipo tironea, la entrada no se alarga. El reloj parte
      // recién después del primer cuadro, que es el que compila los shaders (puede tardar)
      if(introT < INTRO && introStart >= 0) introT = Math.min(INTRO, (performance.now() - introStart)/1000);
      const camE = easeOutCubic(clamp01(introT/2.6));
      const introYaw = -1.25*(1 - camE);
      const holeIn = clamp01((introT - 0.15)/1.0);
      discU.uReveal.value = holeIn;
      lensU.uReveal.value = clamp01((introT - 0.35)/0.9);
      haloV.material.opacity = 0.5*holeIn*spriteK();
      haloC.material.opacity = 0.32*holeIn*spriteK();
      threadU.uReveal.value = easeOutCubic(clamp01((introT - 2.15)/1.3)) * 1.001;
      holeItem.appear = holeIn;

      // --- rotación: inercia que frena natural y auto-giro que vuelve de a poco ---
      if(!drag && !focus){
        if(velYaw || velPitch){
          yaw += velYaw*dt;
          setPitch(pitch + velPitch*dt);
          // fricción exponencial + un roce constante chico, para que no se arrastre eterno
          const decay = Math.exp(-dt*3.2);
          velYaw = Math.sign(velYaw)*Math.max(0, Math.abs(velYaw)*decay - 0.06*dt);
          velPitch = Math.sign(velPitch)*Math.max(0, Math.abs(velPitch)*decay - 0.06*dt);
          if(Math.abs(velYaw) < 0.004 && Math.abs(velPitch) < 0.004) velYaw = velPitch = 0;
        }
        if(!reduced && !tween){
          // quieto 0.2s: el giro propio vuelve a entrar, de a poco (en 2s)
          const idle = clamp01((now - lastInteract - 200)/2000);
          if(idle > 0) yaw += 0.075*idle*idle*dt;
        }
      }
      world.rotation.set(pitch, yaw + introYaw, 0);
      zoom += (zoomTarget - zoom) * (dt ? 1 - Math.exp(-dt*9) : 1);

      // --- humor ---
      const kM = dt ? 1 - Math.exp(-dt*3) : 1;
      const doomT = doomTarget();
      if(Math.abs(doomT - doomK) > 0.001 || reduced){ doomK = reduced ? doomT : doomK + (doomT - doomK)*kM; applyDoom(); }

      if(!reduced){ simTime += dt; orbitT += dt; }
      placePlanets();
      discU.uTime.value = simTime;
      lensU.uTime.value = simTime;
      threadU.uTime.value = simTime;

      // --- planetas: aparición en orden, hover / foco ---
      planets.forEach((p, i)=>{
        p.appear = clamp01((introT - 0.75 - i*0.22)/0.7);
        const k = 1 - Math.exp(-dt*12);
        const lit = p.hover || (focus && focus.item === p);
        p.hoverK += ((lit ? 1 : 0) - p.hoverK) * (dt ? k : 1);
        const s = Math.max(0.0001, easeOutBack(p.appear) * (1 + 0.14*p.hoverK));
        p.group.scale.setScalar(s);
        p.planetU.uHover.value = p.hoverK;
        p.planetU.uTime.value = simTime;
        p.atmoU.uReveal.value = p.appear;
        if(p.ringU) p.ringU.uReveal.value = p.appear;
        p.trailU.uAlpha.value = (0.65 + 0.35*p.hoverK) * p.appear;
        p.glow.material.opacity = (0.45 + 0.5*p.hoverK) * p.appear * spriteK();
        if(!reduced) p.sphere.rotation.y += dt*(0.15 + i*0.027);
        // lunas: aparecen después de su planeta, una tras otra, y giran (hacia -ángulo, como
        // los planetas, así la estela queda detrás)
        const inFocus = focus && focus.item === p ? cam.k : 0;
        p.moons.forEach((m, j)=>{
          m.appear = clamp01((introT - 1.25 - i*0.22 - j*0.12)/0.6);
          m.hoverK += ((m.hover ? 1 : 0) - m.hoverK) * (dt ? k : 1);
          const th = m.theta0 - m.omega*simTime;
          m.mesh.position.set(Math.cos(th)*m.mR, 0, Math.sin(th)*m.mR);
          m.glow.position.copy(m.mesh.position);
          m.mesh.scale.setScalar(Math.max(0.0001, easeOutBack(m.appear)*(1 + 0.6*m.hoverK)));
          if(!reduced) m.mesh.rotation.y += dt*0.4;
          m.trailU.uHead.value = ((th % TAU) + TAU) % TAU;
          m.trailU.uAlpha.value = (0.22 + 0.5*inFocus + 0.35*m.hoverK) * m.appear;
          m.moonU.uHover.value = m.hoverK;
          m.glow.material.opacity = (0.3 + 0.25*inFocus + 0.6*m.hoverK) * m.appear * spriteK();
        });
      });

      holeItem.hoverK += (((holeItem.hover || (focus && focus.item === holeItem)) ? 1 : 0) - holeItem.hoverK) * (dt ? 1 - Math.exp(-dt*12) : 1);

      stage.updateMatrixWorld(true);
      holeItem.world.setFromMatrixPosition(world.matrixWorld);
      planets.forEach(p=>{ p.group.getWorldPosition(p.world); p.moons.forEach(m=> m.mesh.getWorldPosition(m.world)); });

      // --- cámara: vista general o foco, con vuelo suave entre ambas ---
      if(focus) focusDest(); else overviewDest(camE);
      if(tween){
        const tt = clamp01((performance.now() - tween.start)/1000/FOCUS_DUR);
        const e = easeInOutCubic(tt);
        const span = tween.from.pos.distanceTo(dest.pos);
        cam.pos.lerpVectors(tween.from.pos, dest.pos, e);
        cam.pos.y += Math.sin(Math.PI*e)*span*0.08;    // un leve arco, no una línea recta
        cam.target.lerpVectors(tween.from.target, dest.target, e);
        cam.k = tween.from.k + (dest.k - tween.from.k)*e;
        if(tt >= 1) tween = null;
      } else {
        cam.pos.copy(dest.pos); cam.target.copy(dest.target); cam.k = dest.k;
      }
      camera.position.copy(cam.pos);
      camera.lookAt(cam.target);
      applyViewOffset(cam.k);
      camera.updateMatrixWorld();
      lens.position.copy(holeItem.world);
      shadow.position.copy(holeItem.world);
      lens.quaternion.copy(camera.quaternion);
      shadow.quaternion.copy(camera.quaternion);

      // luz y normal del disco, en espacio de vista
      lightUniforms.uLightPos.value.copy(holeItem.world).applyMatrix4(camera.matrixWorldInverse);
      world.getWorldQuaternion(qWorld);
      lensU.uDiscN.value.set(0, 1, 0).applyQuaternion(qWorld).applyQuaternion(qCamInv.copy(camera.quaternion).invert());
      planets.forEach(p=>{
        if(p.ringU){
          p.ringU.uCenter.value.copy(p.world);
          p.ringU.uR.value = p.r * p.group.scale.x;
          p.ringU.uLightW.value.copy(holeItem.world);
        }
      });

      if(composer){
        // círculo de la sombra en pantalla (uv, unidades del alto)
        const dHole = camera.position.distanceTo(holeItem.world);
        vTmp.copy(holeItem.world).project(camera);
        shadowPass.uniforms.uCenter.value.set(vTmp.x*0.5 + 0.5, vTmp.y*0.5 + 0.5);
        shadowPass.uniforms.uRadius.value = (HOLE_R/Math.sqrt(Math.max(1e-3, dHole*dHole - HOLE_R*HOLE_R))) / Math.tan(THREE.MathUtils.degToRad(camera.fov/2)) / 2;
        shadowPass.uniforms.uAspect.value = camera.aspect;
        composer.render(dt);
      } else renderer.render(scene, camera);
      updateLabels();
      dirty = false;
      if(introStart < 0){
        introStart = performance.now();
        if(opts.onReady) setTimeout(()=>{ if(!dead) opts.onReady(); }, 0);
      }

      // con reduced-motion el bucle se duerme apenas se asienta, hasta la próxima interacción.
      // Si no, sigue siempre (también en el foco: el planeta gira, el disco y los pulsos siguen;
      // siempre al ritmo de la pantalla)
      if((!reduced || busy() || dirty) && visible && inView) raf = requestAnimationFrame(frame);
    }

    resize();
    root.dataset.quality = tier;
    if(opts.onQuality) opts.onQuality(tier);

    // ---- desmontaje ----
    return function dispose(){
      dead = true;
      stop();
      saveView();
      if(doomOn) setMood(false);
      if(composer){ composer.passes.forEach(p=>{ if(p.dispose) p.dispose(); }); composer.dispose(); composer = null; }
      const mats = new Set(), geos = new Set();
      scene.traverse(o=>{
        // incluida la geometría que todos los Sprite comparten (global del módulo three): el
        // renderer le cuelga un listener de "dispose", y si no se le hace dispose() ese
        // listener nunca se suelta y deja vivo TODO este montaje (renderer, escena, bloom).
        // Medido: 20 idas y vueltas con bloom pasaban de 7 a ~37MB. three la vuelve a subir
        // sola en el próximo montaje.
        if(o.geometry) geos.add(o.geometry);
        if(o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m=>mats.add(m));
      });
      geos.forEach(g=>g.dispose());
      mats.forEach(m=>m.dispose());
      textures.forEach(t=>t.dispose());
      // listeners, observers, el renderer y el DOM, en orden inverso al de creación: así el
      // listener de webglcontextlost ya no está cuando forceContextLoss() suelta el contexto
      for(let i = cleanups.length - 1; i >= 0; i--){ try{ cleanups[i](); }catch(e){} }
    };
  }

  window.solarCapable = solarCapable;
  window.preloadSolar = preloadSolar;
  window.solarWheel = solarWheel;
  window.mountSolar = mountSolar;
  window.unmountSolar = unmountSolar;
})();
