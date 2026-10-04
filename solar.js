/* ===== SISTEMA SOLAR 3D (prototipo, fase F1: arte) =====
   mountSolar(container, opts) / unmountSolar()

   Escena: el Hoyo (agujero negro = Armagedón) al centro, con disco de acreción, anillo de
   fotones y la imagen "lenteada" del disco que se curva por encima y por debajo de la sombra;
   seis planetas S0..S5 en órbitas inclinadas, S0 la más lejana y S5 la más cercana (el tiempo
   cae hacia el Hoyo); y el "hilo del tiempo", una curva de luz que los une en orden.

   Todo el arte es procedural (shaders), sin texturas de imagen. Three.js vive en vendor/ y se
   carga con import() dinámico la primera vez que se monta. En desktop se carga además el bloom
   (vendor/three/postprocessing.min.js); en móvil el brillo sale de sprites aditivos, que cuestan
   casi nada. Si el bloom no sostiene el framerate, se apaga solo y se vuelve a los sprites.

   Script clásico, sin módulos, igual que app.js: expone mountSolar/unmountSolar en window.
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

  function cssVar(name, fallback){
    try{
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    }catch(e){ return fallback; }
  }

  // bloom solo donde hay mouse fino y pantalla ancha: en teléfonos y tablets, sprites
  function wantsBloom(){
    try{
      return window.matchMedia("(hover: hover) and (pointer: fine)").matches && window.innerWidth >= 900;
    }catch(e){ return false; }
  }

  async function mountSolar(container, opts){
    opts = opts || {};
    unmountSolar();
    const token = {};
    current = { token, dispose: null };

    const bloom = opts.bloom !== undefined ? !!opts.bloom : wantsBloom();
    const THREE = await load(THREE_URL);
    let POST = null;
    if(bloom){
      try{ POST = await load(POST_URL); }catch(e){ POST = null; /* sin bloom, con sprites */ }
    }
    // se desmontó (o se volvió a montar) mientras cargaba: no construir nada
    if(!current || current.token !== token) return null;

    current.dispose = build(THREE, POST, container, opts);
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
      for(int k=0; k<5; k++){ s += a*snoise(p); p = p*2.03 + 17.1; a *= 0.5; }
      return s;
    }
    float fbm3(vec3 p){
      float s = 0.0, a = 0.5;
      for(int k=0; k<3; k++){ s += a*snoise(p); p = p*2.07 + 9.7; a *= 0.5; }
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
        vec2 w2 = worley(sp*9.0 + 4.0);
        float bowl2 = smoothstep(0.35, 0.12, w2.x);
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
        vec2 w2 = worley(sp*8.0 + 2.0);
        float crack2 = 1.0 - smoothstep(0.0, 0.05, w2.y - w2.x);
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
      float d = mod(uHead - vAng, 6.2831853);
      float k = d / uLen;
      if(k > 1.0) discard;
      float a = pow(1.0 - k, 2.3) * smoothstep(0.0, uGap, d) * uAlpha;
      gl_FragColor = vec4(uColor, a);
      #include <colorspace_fragment>
    }`;
  const THREAD_VERT = `
    uniform float uSoft;
    varying float vU; varying float vFacing;
    void main(){
      vU = uv.x;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec3 n = normalize(normalMatrix * normal);
      vFacing = pow(abs(dot(n, normalize(-mv.xyz))), uSoft);
      gl_Position = projectionMatrix * mv;
    }`;
  const THREAD_FRAG = `
    uniform float uTime, uAlpha, uReveal;
    uniform vec3 uColors[6];
    varying float vU; varying float vFacing;
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
      float a = uAlpha * (0.42 + 2.2*comet + 2.0*tip) * vFacing;
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
    const seasons = (opts.seasons || (typeof DATA !== "undefined" ? DATA.seasons : [])).slice(0, 6);
    const hrefFor = opts.hrefFor || (id => `#/season/${id}`);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const CYAN = cssVar("--amber", "#68d8ff");
    const VIOLET = cssVar("--violet", "#6f8fe8");
    const TEAL = cssVar("--teal", "#33d6e0");

    const cleanups = [];
    const textures = [];
    const on = (target, type, fn, o)=>{ target.addEventListener(type, fn, o); cleanups.push(()=>target.removeEventListener(type, fn, o)); };

    // ---- DOM ----
    const root = document.createElement("div");
    root.className = "solar-root";
    const canvas = document.createElement("canvas");
    canvas.className = "solar-canvas";
    canvas.style.touchAction = "pan-y";   // el gesto vertical es del scroll; el horizontal, nuestro
    const labelsLayer = document.createElement("div");
    labelsLayer.className = "solar-labels";
    root.appendChild(canvas); root.appendChild(labelsLayer);
    container.appendChild(root);
    cleanups.push(()=>root.remove());

    // ---- renderer / cámara ----
    const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true, powerPreference:"high-performance" });
    renderer.setClearColor(0x000000, 0);
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(Math.min(dpr, POST ? 1.5 : 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    camera.position.set(0, 0, 20);

    // stage: giro de la entrada (alrededor del eje vertical de la cámara);
    // world: todo el sistema, lo que rota el usuario
    const stage = new THREE.Group();
    scene.add(stage);
    const world = new THREE.Group();
    const portrait = container.clientWidth < container.clientHeight*0.8;
    // vista inicial desde arriba; en vertical más inclinada, para llenar el alto disponible
    world.rotation.x = portrait ? 0.74 : 0.46;
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
      new THREE.ShaderMaterial({ uniforms:discU, vertexShader:DISC_VERT, fragmentShader:DISC_FRAG, side:THREE.DoubleSide, ...additive })
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
    const lens = new THREE.Mesh(lensGeo, new THREE.ShaderMaterial({ uniforms:lensU, vertexShader:LENS_VERT, fragmentShader:LENS_FRAG, ...additive }));
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
        new THREE.ShaderMaterial({ uniforms:planetU, vertexShader:PLANET_VERT, fragmentShader:PLANET_FRAG }));
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
          new THREE.ShaderMaterial({ uniforms:ringU, vertexShader:RING_VERT, fragmentShader:RING_FRAG, transparent:true, depthWrite:false, side:THREE.DoubleSide }));
        ring.rotation.x = -Math.PI/2 + 0.08;
        tilt.add(ring);
      }

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:C(color), opacity:0, ...additive }));
      glow.scale.setScalar(r*5);
      group.add(glow);

      const label = document.createElement("a");
      label.className = "solar-label";
      label.href = hrefFor(s.id);
      label.style.setProperty("--pcolor", color);
      label.style.opacity = "0";
      label.innerHTML = `<span class="solar-code"></span><span class="solar-title"></span>`;
      label.firstChild.textContent = s.code || `S${s.id}`;
      label.lastChild.textContent = s.title || "";
      labelsLayer.appendChild(label);
      on(label, "mouseenter", ()=>setHover(planets[i]));
      on(label, "mouseleave", ()=>setHover(null));

      planets.push({ season:s, group, sphere, r, label, planetU, atmoU, ringU, trailU, glow,
        world:new THREE.Vector3(), hover:false, hoverK:0, appear:0, lw:0, lh:0, cw:0 });
    });

    // ---- hilo del tiempo ----
    const threadU = {
      uTime:{ value:0 }, uReveal:{ value:0 },
      uColors:{ value: seasons.map(s=> paletteFor(THREE, s.color || CYAN).atmo) }
    };
    while(threadU.uColors.value.length < 6) threadU.uColors.value.push(C(CYAN));
    if(planets.length >= 2){
      world.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(world.matrixWorld).invert();
      const pts = planets.map(p=> p.group.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv));
      const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
      const mk = (radius, alpha, soft)=> new THREE.Mesh(
        new THREE.TubeGeometry(curve, 360, radius, 6, false),
        new THREE.ShaderMaterial({
          uniforms:{ uTime:threadU.uTime, uReveal:threadU.uReveal, uColors:threadU.uColors, uAlpha:{ value:alpha }, uSoft:{ value:soft } },
          vertexShader:THREAD_VERT, fragmentShader:THREAD_FRAG, ...additive
        })
      );
      world.add(mk(0.011, 1.0, 0.4));
      world.add(mk(0.05, 0.22, 2.4));
    }

    // ---- bloom (solo desktop) ----
    let composer = null, bloomPass = null, shadowPass = null;
    function setupBloom(){
      composer = new POST.EffectComposer(renderer);
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
            float m = 1.0 - smoothstep(uRadius*0.88, uRadius*1.0, d);
            c.rgb = max(c.rgb - b*m*0.95, 0.0);
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
      renderer.setPixelRatio(Math.min(dpr, 2));
      resize();
    }
    if(POST){ try{ setupBloom(); }catch(e){ composer = null; } }
    // intensidad de los sprites: con bloom hacen falta mucho menos
    const spriteK = ()=> composer ? 0.35 : 1;

    // ---- tamaño / encuadre ----
    let W = 1, H = 1, baseZ = 20;
    function resize(){
      W = Math.max(1, container.clientWidth); H = Math.max(1, container.clientHeight);
      renderer.setSize(W, H, false);
      if(composer){ composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(W, H); }
      camera.aspect = W/H;
      // alejar la cámara lo justo para que el sistema completo quepa a lo ancho y a lo alto;
      // en vertical se acepta que las órbitas exteriores rocen el borde, si no queda diminuto
      const extent = ORBIT_R[0] + 0.8;
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      const dV = (extent*0.82)/tanV, dH = extent*(camera.aspect < 0.8 ? 0.86 : 1)/(tanV*camera.aspect);
      baseZ = Math.max(dV, dH) + 1.5;
      camera.updateProjectionMatrix();
      measureLabels();
      wake();
    }
    function measureLabels(){
      planets.forEach(p=>{
        p.label.classList.remove("is-compact");
        p.lw = p.label.offsetWidth; p.lh = p.label.offsetHeight;
        p.cw = p.label.firstChild.offsetWidth + 16;
      });
    }
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    cleanups.push(()=>ro.disconnect());
    if(document.fonts && document.fonts.ready){
      let alive = true; cleanups.push(()=>{ alive = false; });
      document.fonts.ready.then(()=>{ if(alive) measureLabels(); });
    }

    // ---- interacción ----
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const Y_AXIS = new THREE.Vector3(0,1,0), X_AXIS = new THREE.Vector3(1,0,0);
    const qTmp = new THREE.Quaternion();
    let velYaw = 0, velPitch = 0;          // rad/s
    let drag = null;
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
        if(p.appear < 0.5) return;
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
      const MAX = 6;   // tope de inercia, para que un latigazo no lo deje como trompo
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
    // entrada: la cámara llega desde lejos y el sistema aparece por partes, en orden
    const INTRO = 3.6;
    let introT = reduced ? INTRO : 0, introStart = -1;
    const vTmp = new THREE.Vector3(), vSeg = new THREE.Vector3(), vHole = new THREE.Vector3(), vClosest = new THREE.Vector3();
    const qWorld = new THREE.Quaternion(), qCamInv = new THREE.Quaternion();
    // vigilancia de framerate (solo con bloom): si no da, se apaga
    let perfFrames = 0, perfAccum = 0;

    function wake(){ dirty = true; if(raf === null && visible && inView){ lastT = 0; raf = requestAnimationFrame(frame); } }
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

    const placed = [];
    function updateLabels(){
      vHole.setFromMatrixPosition(world.matrixWorld);
      const camPos = camera.position;
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      const order = planets.slice().sort((a,b)=> camPos.distanceToSquared(a.world) - camPos.distanceToSquared(b.world));
      placed.length = 0;
      order.forEach(p=>{
        vTmp.copy(p.world).project(camera);
        if(vTmp.z > 1 || p.appear < 0.02){ p.label.style.opacity = "0"; p.label.style.visibility = "hidden"; return; }
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
        p.label.style.opacity = (p.hover ? Math.max(op, 1) : op).toFixed(2);
        p.label.style.visibility = hidden ? "hidden" : "visible";
        p.label.style.transform = `translate(${x.toFixed(1)}px, ${ly.toFixed(1)}px) translate(-50%, -100%)`;
        p.label.style.zIndex = String(p.hover ? 2000 : 1000 - Math.round(dist*10));
      });
    }

    function frame(now){
      raf = null;
      const dt = lastT ? Math.min((now-lastT)/1000, 0.05) : 0;
      lastT = now;

      // --- entrada ---
      // por reloj real, no por dt: si el equipo tironea, la entrada no se alarga. El reloj parte
      // recién después del primer cuadro, que es el que compila los shaders (puede tardar)
      if(introT < INTRO && introStart >= 0) introT = Math.min(INTRO, (performance.now() - introStart)/1000);
      const camE = easeOutCubic(clamp01(introT/2.6));
      camera.position.z = baseZ * (1 + 2.4*(1 - camE));
      camera.position.y = 2.5*(1 - camE);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      lens.quaternion.copy(camera.quaternion);
      shadow.quaternion.copy(camera.quaternion);
      stage.rotation.y = -1.25*(1 - camE);
      const holeIn = clamp01((introT - 0.15)/1.0);
      discU.uReveal.value = holeIn;
      lensU.uReveal.value = clamp01((introT - 0.35)/0.9);
      haloV.material.opacity = 0.5*holeIn*spriteK();
      haloC.material.opacity = 0.32*holeIn*spriteK();
      threadU.uReveal.value = easeOutCubic(clamp01((introT - 2.15)/1.3)) * 1.001;

      // --- rotación: arrastre, inercia, auto-giro ---
      if(!drag){
        if(velYaw || velPitch){
          rotateBy(velYaw*dt, velPitch*dt);
          const decay = Math.exp(-dt*2.6);
          velYaw *= decay; velPitch *= decay;
          if(Math.abs(velYaw) < 0.002 && Math.abs(velPitch) < 0.002) velYaw = velPitch = 0;
        }
        if(!reduced){
          // giro propio muy lento alrededor del eje del sistema; entra suave tras soltar
          const idle = clamp01((now - lastInteract - 900)/2200);
          if(idle > 0){ qTmp.setFromAxisAngle(Y_AXIS, 0.05*idle*dt); world.quaternion.multiply(qTmp); }
        }
      }
      if(!reduced) simTime += dt;
      discU.uTime.value = simTime;
      lensU.uTime.value = simTime;
      threadU.uTime.value = simTime;

      // --- planetas: aparición en orden, hover ---
      planets.forEach((p, i)=>{
        p.appear = clamp01((introT - 0.75 - i*0.22)/0.7);
        const k = 1 - Math.exp(-dt*12);
        p.hoverK += ((p.hover ? 1 : 0) - p.hoverK) * (dt ? k : 1);
        const s = Math.max(0.0001, easeOutBack(p.appear) * (1 + 0.14*p.hoverK));
        p.group.scale.setScalar(s);
        p.planetU.uHover.value = p.hoverK;
        p.planetU.uTime.value = simTime;
        p.atmoU.uReveal.value = p.appear;
        if(p.ringU) p.ringU.uReveal.value = p.appear;
        p.trailU.uAlpha.value = (0.65 + 0.35*p.hoverK) * p.appear;
        p.glow.material.opacity = (0.45 + 0.5*p.hoverK) * p.appear * spriteK();
        if(!reduced) p.sphere.rotation.y += dt*(0.1 + i*0.018);
      });

      stage.updateMatrixWorld(true);
      // luz y normal del disco, en espacio de vista
      lightUniforms.uLightPos.value.setFromMatrixPosition(world.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      world.getWorldQuaternion(qWorld);
      lensU.uDiscN.value.set(0, 1, 0).applyQuaternion(qWorld).applyQuaternion(qCamInv.copy(camera.quaternion).invert());
      planets.forEach(p=>{
        p.group.getWorldPosition(p.world);
        if(p.ringU){
          p.ringU.uCenter.value.copy(p.world);
          p.ringU.uR.value = p.r * p.group.scale.x;
          p.ringU.uLightW.value.setFromMatrixPosition(world.matrixWorld);
        }
      });

      if(composer){
        // círculo de la sombra en pantalla (uv, unidades del alto)
        vTmp.setFromMatrixPosition(world.matrixWorld);
        const dHole = camera.position.distanceTo(vTmp);
        vTmp.project(camera);
        shadowPass.uniforms.uCenter.value.set(vTmp.x*0.5 + 0.5, vTmp.y*0.5 + 0.5);
        shadowPass.uniforms.uRadius.value = (HOLE_R/Math.sqrt(Math.max(1e-3, dHole*dHole - HOLE_R*HOLE_R))) / Math.tan(THREE.MathUtils.degToRad(camera.fov/2)) / 2;
        shadowPass.uniforms.uAspect.value = camera.aspect;
        composer.render(dt);
      } else renderer.render(scene, camera);
      updateLabels();
      dirty = false;
      if(introStart < 0) introStart = performance.now();

      // si el bloom no sostiene ~40fps (medido después de la entrada), se apaga
      if(composer && introT >= INTRO && dt > 0){
        perfFrames++; perfAccum += dt;
        if(perfFrames >= 90){
          if(perfAccum/perfFrames > 0.025) dropBloom();
          perfFrames = 0; perfAccum = 0;
        }
      }

      // con reduced-motion no hay nada que animar en reposo: el bucle se duerme hasta la
      // próxima interacción. Sin reduced-motion sigue (auto-giro, disco, pulsos).
      const settling = drag || velYaw || velPitch || planets.some(p=> Math.abs((p.hover?1:0) - p.hoverK) > 0.01);
      if((!reduced || settling || dirty) && visible && inView) raf = requestAnimationFrame(frame);
    }

    resize();

    // ---- desmontaje ----
    return function dispose(){
      stop();
      cleanups.forEach(fn=>{ try{ fn(); }catch(e){} });
      if(composer){ composer.passes.forEach(p=>{ if(p.dispose) p.dispose(); }); composer.dispose(); composer = null; }
      const mats = new Set(), geos = new Set();
      scene.traverse(o=>{
        // los Sprite comparten una geometría interna de three: no es nuestra, no se libera
        if(o.geometry && !o.isSprite) geos.add(o.geometry);
        if(o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m=>mats.add(m));
      });
      geos.forEach(g=>g.dispose());
      mats.forEach(m=>m.dispose());
      textures.forEach(t=>t.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }

  window.mountSolar = mountSolar;
  window.unmountSolar = unmountSolar;
})();
