# Yoshe con Hoyo — crónica del grupo

Sitio de una sola página (HTML/CSS/JS puro, sin build, sin frameworks) que cuenta la historia de un grupo de amigos a través de temporadas (S0–S5), con personajes, lugares, un mapa de relaciones, y una sección final "Armagedón" con el destino de cada integrante.

**Archivos principales:** `index.html` (esqueleto HTML, ~60 líneas), `styles.css` (todo el CSS), `app.js` (toda la lógica/vistas JS), `data.js` (el objeto `DATA` con toda la historia: personajes, lugares, temporadas), `solar.js` (el sistema solar 3D de la home) y `net3d.js` (la red de relaciones 3D de `#/map`). `index.html` los carga vía `<link rel="stylesheet" href="styles.css">` y `<script src="data.js">` + `<script src="solar.js">` + `<script src="net3d.js">` + `<script src="app.js">`, en ese orden (`app.js` usa `DATA` como variable de módulo top-level sin imports, y llama a `mountSolar`/`unmountSolar` de `solar.js`). Three.js vive vendorizado en `vendor/three/` y **no** se carga con un `<script>`: `solar.js` lo trae con `import()` dinámico recién al montar la home (ver "Página principal: el sistema solar 3D"). No hay build step: se edita directo y se abre en el navegador — todo es texto plano, sin bundler, sin transpilación. Se separó `DATA` a su propio archivo porque es la parte que más crece con cada historia nueva, y CSS/JS se separaron de `index.html` por lo mismo en sentido inverso: son las partes que casi no cambian de tamaño pero sí se tocan seguido, así que aislarlas evita cargar ~2300 líneas de HTML+CSS+JS mezclado para tocar un solo estilo o una sola función. Las fotos de personajes son archivos reales en `/images` (NO base64 inline — se sacaron de ahí porque hacían el archivo pesadísimo), referenciadas por ruta relativa.

## Cómo probar cambios

No hay build. Para validar que el JS no tiene errores de sintaxis después de editar:

```bash
node -e "
const fs = require('fs');
['app.js','data.js','solar.js','net3d.js'].forEach(f=>new Function(fs.readFileSync(f,'utf8')));
console.log('JS syntax OK');
"
```

Para probar funcionalmente con jsdom (simula un navegador headless):

```bash
npm install jsdom --no-save   # si no está instalado
node -e "
const { JSDOM } = require('jsdom');
const fs = require('fs');
const dom = new JSDOM(fs.readFileSync('index.html','utf8'), { runScripts:'dangerously', resources:'usable', pretendToBeVisual:true, url:'http://localhost/',
  beforeParse(w){ w.matchMedia = ()=>({ matches:false, addEventListener(){}, removeEventListener(){} }); } });
const win = dom.window;
win.IntersectionObserver = class { observe(){} };
setTimeout(()=>{
  win.viewHome();
  console.log('star-nodes:', win.document.querySelectorAll('.star-node').length);
}, 300);
"
```

En jsdom no hay WebGL ni `import()`, así que ahí la home siempre queda con la constelación 2D (el respaldo) — sirve para probar el respaldo, no la escena 3D.

**Probar la escena 3D** necesita un navegador de verdad y un servidor HTTP (con `file://` el `import()` de three.js falla y la home se queda, a propósito, en 2D):

```bash
python3 -m http.server 8765   # y abrir http://localhost:8765/
```

- `?3d=0` en la URL (`http://localhost:8765/?3d=0#/home`) apaga el 3D para ver el respaldo 2D; `?3d=1` lo fuerza aunque el equipo parezca débil o el navegador renderice por software. `&q=high|medium|low` fija el nivel de calidad inicial (igual puede bajar si va lento). El nivel vivo se ve en `.solar-root[data-quality]`.
- Chromium headless (Playwright) renderiza por software (SwiftShader): la sonda de `solarCapable()` lo descarta, así que ahí siempre hay que usar `?3d=1`, lanzar con `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` y esperar a `.hero.solar-on` (el primer cuadro tarda varios segundos en compilar los shaders por software).
- Por software todo va a ~250ms por cuadro, así que la escena baja sola hasta `low` a los pocos segundos: es lo esperado. Para medir rendimiento, el throttling de CPU de CDP (`Emulation.setCPUThrottlingRate`) simula un teléfono para el hilo principal, pero no la GPU.
- Gestos: en headless, `Input.dispatchTouchEvent` de CDP entrega un solo dedo; el pellizco se prueba despachando `PointerEvent`s sintéticos (`pointerType:'touch'`, dos `pointerId`) sobre `.solar-canvas`. El bloqueo se ve en `html.galaxy-lock` y `scrollY` (la rueda en modo galaxia no debe mover la página).
- Qué mirar: que aparezca `.hero.solar-on`; que haya un solo `.solar-root` aunque se entre y salga de la home muchas veces; que no salga el aviso "Too many active WebGL contexts"; que clic en una etiqueta (`.solar-label`) abra `.solar-root.is-focus` y el del Hoyo ponga `body.mood-doom`; y que forzar la pérdida de contexto (`getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`) deje la 2D de vuelta.

No hay tests automatizados formales — la validación es: syntax check + un par de aserciones puntuales en jsdom (o Playwright, si tocaste el 3D) sobre la vista que tocaste, y listo.

## Arquitectura

Todo vive en un objeto global `DATA` (en `data.js`), con esta forma:

```js
const DATA = {
  characters: {
    "id-slug": {
      name, role, tier: "primario"|"secundario", color: "#hex",
      bio, apodo, frase, habilidad, destino,   // cualquiera puede ser null
      thumb: "images/characters/id-slug/thumb.webp", // miniatura del círculo (elenco, foco 3D), generada con tools/make_thumbs.py
      photo: "images/characters/id-slug/avatar.jpg", // avatar chico circular legacy (opcional; thumb y photos[0] le ganan)
      photoLarge: "images/characters/id-slug/1.png", // retrato grande, UNA foto (legacy, usar photos en su lugar)
      photos: ["images/characters/id-slug/1.png", ...], // retrato grande, VARIAS fotos con carrusel (preferido)
      tags: ["..."]
    }
  },
  places: {
    "id-slug": { name, icon: "emoji", desc }
  },
  seasons: [
    {
      id: 0, code: "S0", title, color: "#hex", hito,
      events: [
        {
          date, title, place: "place-id"|null, chars: ["char-id", ...],
          images: ["images/events/....jpg", ...],  // opcional, foto(s) de esa historia (o `image` legacy, una sola)
          video: "images/events/....mp4",           // opcional, un video de esa historia
          content: [
            {t:"text", v:"..."},
            {t:"char", id:"char-id"},   // se renderiza con el nombre de DATA.characters[id]
            {t:"place", id:"place-id"}
          ]
        }
      ]
    }
  ],
  hookups: [   // la red de amoríos, quién se comió a quién (#/map/besos)
    { a:"char-id", b:"char-id", kind:"beso"|"pinche"|"ex",
      story:{ season:5, title:"título exacto de la historia" }|null, note:"..."|null }
  ],
  armageddon: { intro: "..." }  // profecía general; el destino de cada persona vive en character.destino
};
```

**Por qué `content` es un arreglo de segmentos y no un string:** así los nombres de personajes/lugares quedan resaltados y clicables de forma confiable (sin regex sobre texto libre). Al escribir una historia nueva, usa `{t:"char", id:"..."}` / `{t:"place", id:"..."}` en vez de escribir el nombre a mano.

Hay una función `autoTagText(text)` que hace esto automáticamente a partir de texto plano (detecta nombres completos, primer nombre si es único, y apodos) — la usa el formulario de "agregar historia" en modo edición.

### Vistas (router por hash, sin librería)

`render()` lee `location.hash` y despacha a: `viewHome()` (solo la galaxia), `viewCast()` (`#/elenco`: personajes y lugares), `viewSeason(id)`, `viewCharacter(id)`, `viewPlace(id)`, `viewMap()`, `viewArmageddon()`, `viewRecords()` (`#/records`: el salón de la fama, todo calculado desde `DATA`), `viewRecapIndex()` / `viewRecap(id)` (`#/resumen`, `#/resumen/<id>`), `viewQuiz()` (`#/juego`) y `viewTogether(a, b)` (`#/juntos/<a>/<b>`).

### Páginas calculadas desde DATA (resúmenes, juego, juntos)

Las tres se arman solas desde `DATA` y **no inventan nada**: si un dato no existe, esa parte no sale.

- **Resúmenes** (`#/resumen/<id>`, `personRecap(id)` + `recapSlides(id)`): el paso de una persona por la crónica en diapositivas a pantalla completa, estilo "resumen del año" (cuántas historias y su lugar en el ranking, el debut, su temporada, su dupla, su lugar, la historia más concurrida, apodo/habilidad/frase si no están pendientes, y al final el destino del Armagedón o su última aparición). Los empates se dicen como empates. Es una pantalla fija (`.wr-page` entra en el mismo `setGalaxyLock` que la galaxia y el mapa): toque derecha/izquierda, deslizar, flechas; avanza sola cada 6.5s con barras de progreso (no con reduced-motion); mantener apretado pausa. `#/resumen` es el índice. Botón "▶ Ver su resumen" en cada ficha.
- **Juego** (`#/juego`, `quizGenerators()` + `buildQuizRound()`): 10 preguntas al azar de 10 tipos (quién no estuvo, de qué historia es un pedazo con los nombres tapados, dónde, en qué temporada, quién estuvo en las dos, la dupla, quién aparece más, apodos, cuántos fueron, qué pasó primero). Cada generador devuelve `null` si los datos no alcanzan, y la ronda los reintenta. Cada respuesta enlaza a su historia. Mejor partida en `localStorage` (`ychQuizBest_v1`). Botón 🎯 en el nav.
- **Juntos** (`#/juntos/<a>/<b>`): dos personas frente a frente (historias en común, % de la crónica de cada una, primera/última juntas, lugares, quién más suele estar; si no comparten ninguna, quién las une). Las tarjetas "Con quién comparte la crónica" de las fichas y el dúo de Récords llevan acá.

`body.route-full` (resúmenes y juego) esconde la fila de temporadas del nav en el teléfono, igual que `route-home`.

**Regex:** nada de lookbehind (`(?<=...)`) en `app.js`: Safari anterior a 16.4 no lo entiende y un literal así hace que **todo** `app.js` no cargue (pantalla en blanco).

**Enlace directo a una historia:** `#/season/N/M` (M = índice en `s.events`) renderiza la temporada y hace scroll a esa tarjeta destacándola (`flashEvent`), salvo al volver con "atrás" (ahí manda el scroll recordado). Lo usan las lunas del 3D, el buscador, el dado, las bitácoras de las fichas, los récords y el botón 🔗 de cada historia (`shareStory`: menú nativo en el teléfono, copiar enlace en desktop). Para enlazar una historia usa `storyHref(seasonId, idx)`, no `location.hash` + `setTimeout(flashEvent)`.

**Ayudantes compartidos** (arriba en `app.js`, después de `escapeHtml`): `plainText(content)` (la historia como texto, **con** los nombres: no armar extractos solo con los segmentos `text`, quedan frases rotas como "carreteando en , en los JIM"), `excerpt(content, n)` (corta en palabra y deja fuera la nota "— Cuéntame más..."), `pendingHtml(text, label)`, `castOf(events)` (personajes con su cuenta, mayor a menor), `faceHtml(id, {static})` / `facesHtml(ids, max, cls, static)` (caritas clicables; **dentro de algo que ya es un `<a>`, pasar `static`**: un `<a>` dentro de otro parte la tarjeta en dos), `shortName(id)` (primer nombre, con inicial del apellido si se repite: "María D." / "María C."), `parseDate(text)` (día/mes/año de las fechas en texto libre, para el marcador grande del timeline), `siteFooter()` (pie con enlaces, en todas las vistas menos la home).

**Nav:** `renderSeasonsStrip(activeId)`: `undefined` = la home ("Inicio"), `"elenco"` (también fichas de personaje y lugar), el id de una temporada, o `null` = ninguno (mapa, récords, Armagedón). En el teléfono (≤720px) la fila de temporadas pasa a una segunda línea deslizable del nav, salvo en la home (`body.route-home`), donde la galaxia ya es el menú. Viven en `app.js`, sin imports — `DATA` (de `data.js`) está disponible ahí porque `data.js` se carga antes que `app.js` en el HTML, no porque cuelgue de `window`.

Antes de despachar, `render()` siempre llama a `unmountSolar()` (también de home a home) y recalcula `body.mood-doom` con `syncMood()`. Guarda el scroll de cada hash en `scrollMemory` y lo restaura solo en navegaciones de historial (atrás/adelante, vía `popstate`); en esas mismas navegaciones `routeFromHistory` es `true` y `viewHome()` le pide a la escena 3D que retome su ángulo de cámara guardado.

### Persistencia (modo edición)

Los cambios hechos desde el botón ✏️ (bios, apodos, frases, habilidades, destinos, hitos, nuevas historias) se guardan en `localStorage` del navegador vía `patchCharacter()`, `patchPlace()`, `patchSeasonMeta()`, `addEventToSeason()`, `patchArmageddon()` — todas mutan `DATA` en memoria Y persisten un "override" parcial. `applyOverrides()` los reaplica al cargar. Hay export/import de JSON como respaldo manual (no hay backend ni base de datos).

**Editor de historias** (`openStoryEditor(seasonId, uid?)`, botón "➕ Agregar historia" de cada temporada y "➕ Nueva historia" de la barra de edición): temporada, fecha, título, texto, lugar y quiénes estuvieron, con vista previa de cómo va a quedar (`renderContent(autoTagText(...))`). Los nombres que aparecen en el texto se suman solos a "quiénes estuvieron" (salvo que los saques a mano) y el primer lugar mencionado se elige solo. Se pueden crear ahí mismo **personas y lugares nuevos**: quedan con sus campos pendientes ("— rol pendiente —", "Cuéntame más sobre...") en `overrides.extraCharacters` / `extraPlaces`, que `applyOverrides()` agrega a `DATA` antes que todo lo demás. Mientras escribes, el borrador se guarda (`ychStoryDraft_v1`). Cada historia escrita desde el editor lleva `uid` y `local:true`: en modo edición su tarjeta muestra "✏️ Editar o borrar" (también se puede mover de temporada). Esc cierra los modales; el clic afuera no cierra el editor (botaría lo escrito).

**Pasar los cambios al sitio de todos:** lo del modo edición vive en un solo navegador. "📋 Copiar para Claude" (`copyForClaude()` / `overridesAsText()`) copia todo como texto legible (historias nuevas con su texto, personas/lugares nuevos, campos editados) para pegarlo en el chat y agregarlo a `data.js`; si el portapapeles falla, lo muestra en un modal. "⬇ Exportar" sigue bajando el JSON.

**IA en el editor (pendiente, decisión del usuario):** se pidió que el editor pula el texto con la API de Claude. No se hizo: llamar a la API desde el navegador en un sitio público exige dejar la API key en el cliente. Lo seguro es un proxy chico en un servidor (p. ej. una Edge Function de Supabase o un Cloudflare Worker) que guarde la key como secreto y que el editor llame a ese endpoint.

**Importante:** todo acceso a `localStorage` está envuelto en try/catch. Algunos visores (Quick Look de iOS, vistas previas sandboxed) bloquean `localStorage` y sin el try/catch eso rompía toda la página (pantalla en blanco). Si agregas una llamada nueva a `localStorage`, protégela igual.

## Imágenes de personajes

Proceso para agregar una foto de personaje:

1. El usuario manda una ilustración (idealmente ya con fondo transparente, herramientas como Photoroom sirven).
2. Verificar transparencia real: `Image.open(path).convert('RGBA').getchannel('A').getextrema()` — si da `(0,255)` hay canal alfa real; si no, es fondo blanco sólido y hay que removerlo (ver más abajo).
3. Redimensionar a max width ~700px, guardar como PNG optimizado.
4. Guardar el archivo en `/images/characters/<id-slug>/N.png` (o `.jpg`) — cada personaje tiene su propia carpeta, numerada desde 1; el avatar chico circular (si existe) va como `avatar.jpg`/`avatar.png` en la misma carpeta — y referenciarlo por ruta relativa dentro de `photos: [...]` (o `photoLarge` si es solo una). **No** convertir a base64 inline — eso es lo que hacía el `index.html` pesar varios MB.
5. Regenerar la miniatura: `python3 tools/make_thumbs.py <id-slug>` (necesita Pillow) y agregar `thumb:"images/characters/<id-slug>/thumb.webp"` al personaje. Recorta de `photos[0]` un cuadrado de cabeza y hombros guiado por el canal alfa (por eso necesita fondo transparente) y lo guarda a 224px en WebP (~12KB). Es lo que muestran los círculos del elenco y del panel de foco del 3D; sin `thumb` caen al retrato grande entero (~350KB) con un zoom por CSS (`.is-full`). Si cambia la primera foto, hay que regenerarla.
6. Si el fondo NO era transparente, removerlo con flood-fill desde las esquinas (tolerancia por distancia de color) + `scipy.ndimage.gaussian_filter` para suavizar el borde — ver conversación anterior para el script exacto (usa `skimage.segmentation.flood`).

El carrusel de fotos (`cyclePhoto()`) cicla entre `photos[]` con una transición tipo "portal warp" (scale + rotateY + blur). Si un personaje solo tiene una foto, el click no hace nada (por diseño).

## Diseño / paleta

Tema "espacio profundo, cielo estrellado azul". Variables CSS en `:root`: `--void`, `--void-2`, `--void-3`, `--hole`, `--ink`, `--ink-dim`, `--ink-faint`, `--amber` (acento principal, cian, el nombre quedó por historia), `--violet`, `--teal`, `--line`, `--line-soft`, `--card`, `--card-hi`, `--ease`. Cambiar la paleta = redefinir estas variables, no hay que tocar el resto del CSS. Los valores actuales están muestreados de los píxeles reales de `images/sky/fondo_definitivo.jpg`.

Tipografías: `Cormorant Garamond` (serif de display: títulos, nombres, números de stats), `Outfit` (body/UI), `JetBrains Mono` (labels, fechas, chips, código).

### El cielo (fondo)

Tres capas `position:fixed` a tamaño de viewport, detrás de todo, en este orden de pintado:

1. `#skyPhoto` — la foto real (`images/sky/sky-wide.jpg`, o `sky-tall.jpg` bajo 700px de ancho), con un `skyDrift` de 140s que la desplaza lentísimo.
2. `#skyWash` — degradados de tono/viñeta que garantizan un piso de contraste constante para el texto, sea cual sea la zona de la foto que quede detrás.
3. `#stars` — canvas animado (titileo, deriva en 360°, parallax por profundidad al hacer scroll, estrellas fugaces desde los 4 bordes).

**Por qué fijas y no del alto del documento:** la página mide varios miles de px; una foto estirada a ese alto se ve borrosa y en mosaico se nota la repetición. Fijas, el cielo simplemente se queda quieto mientras el contenido pasa por encima — y de paso el canvas solo necesita el tamaño del viewport (mucho más barato de animar) en vez del alto completo del documento.

La fuente original del cielo (`images/sky/fondo_definitivo.jpg`, 3840×2160) se conserva en el repo, pero la página **nunca la carga**: sirve las versiones optimizadas `sky-wide.jpg` (2560px) y `sky-tall.jpg` (recorte vertical para teléfonos), ambas en `images/sky/`. Al cambiar el fondo hay que regenerar esas dos y volver a muestrear la paleta de `:root`.

### Carpeta `/images`

```
images/
  characters/<id-slug>/    # N.png + thumb.webp (+ avatar.jpg legacy) por personaje (ver "Imágenes de personajes")
  sky/                      # sky-wide.jpg, sky-tall.jpg, fondo_definitivo.jpg (fuente, nunca cargada)
  events/                   # fotos/videos sueltos de una historia puntual (no de un personaje)
  unused/                   # archivos que quedaron sin usar tras algún cambio de fondo; no referenciados desde el código
```

### Estructura de archivos

```
index.html        # esqueleto; carga styles.css, data.js, solar.js, net3d.js, app.js
styles.css        # todo el CSS (incluye .home-sky / .solar-*)
data.js           # DATA
solar.js          # sistema solar 3D: solarCapable / mountSolar / unmountSolar
net3d.js          # red de relaciones 3D (canvas 2D): mountNet3D / unmountNet3D / net3dWheel
app.js            # router, vistas, modo edición, cielo animado
tools/            # make_thumbs.py: genera las miniaturas de personajes (Python + Pillow, se corre a mano)
vendor/three/     # three.js r186 vendorizado y recortado a lo que se usa (ESM minificado) +
                  # postprocesado para el bloom; README.md dice cómo se regeneran. No se editan a mano.
images/           # ver arriba
```

### Movimiento

- `.reveal` / `.reveal-stagger` + `setupReveals()` — entrada al hacer scroll, vía IntersectionObserver. Hay que llamar a `setupReveals()` al final de cada `view*()` que use esas clases. Si no hay IntersectionObserver o el usuario pidió `prefers-reduced-motion`, todo se muestra de inmediato (importante: `.reveal` arranca en `opacity:0`, así que sin ese fallback la página quedaría en blanco).
- `#app.route-in` — transición de entrada en cada cambio de ruta (`replayRouteAnimation()`).
- El nav que se condensa al hacer scroll corre en un rAF por evento de `scroll`/`resize`/cambio de ruta (al final de `app.js`), no en un bucle permanente: sin scroll, no corre nada. La escena 3D tiene su propio bucle dentro de `solar.js` (ver "Rendimiento").
- El cielo animado (`#stars`) dibuja a ~30fps en pantallas táctiles (el movimiento va por tiempo real, así que se ve igual) y su densidad baja con el nivel de calidad del 3D (`setStarDensity`). Un cambio solo de alto de la ventana (la barra del navegador móvil que aparece/desaparece) no regenera las estrellas.
- Las vistas que agregan listeners en `window`/`document` los registran en `viewCleanups`, que `render()` vacía antes de la vista siguiente (si no, cada visita a una temporada dejaba un listener de scroll vivo).
- **`body` va con `overflow-x:clip`, no `hidden`.** Con `html` en `overflow-x:clip`, un `body` con `hidden` se vuelve su propio contenedor de scroll (`overflow-y` pasa a `auto`); mientras las tarjetas `.reveal` entran desplazadas (`translateY`) sobresalen un instante y el primer swipe al llegar a una vista (Elenco, Mapa...) scrolleaba ese `body` interno y no la página: "pegado arriba, funciona al segundo intento". Para cortar desbordes horizontales, siempre `clip`.
- La entrada de cada ruta (`#app.route-in`) anima solo opacidad y un desplazamiento corto: nada de `filter`/`scale` sobre `#app` entero (una página de miles de px se re-rasterizaba en cada cuadro).
- `backdrop-filter` se usa **solo** en superficies grandes y pocas a la vez (nav, modales, buscador, paneles del timeline, paneles de perfil, el panel de foco del 3D). Las tarjetas que se renderizan de a decenas (`.cast-card`, `.place-card`, `.epitaph-card`, `.story-link-card`) usan un fondo plano más opaco: se ve casi igual sobre la foto oscura y cuesta una fracción.

### Página principal: el sistema solar 3D (y la constelación 2D de respaldo)

El hero de la home es la **pantalla de la galaxia** (y es todo lo que hay en la home): copy arriba, `.home-sky` al medio y la pestaña "Personajes y lugares" (`.explore-tab`, un link a `#/elenco`) abajo. `.hero` mide exactamente `100svh` menos el nav (`--nav-h`, medido por JS con el nav sin condensar; `svh` y no `dvh`, para que no cambie de alto —ni redimensione el canvas 3D— con la barra de iOS), también en el teléfono, donde el copy se compacta (sin el párrafo del tagline). `.home-sky` toma todo el alto que queda (máx. 820px) y es un *size container*: la constelación 2D se dimensiona con `cqw`/`cqh` para caber adentro.

**La home es solo la galaxia y no scrollea nunca; personajes y lugares son otra pantalla** (`#/elenco`, `viewCast()`), a la que se va con la pestaña de abajo (o "Elenco" en el nav) y desde la que se vuelve con "← Galaxia". Se separaron a propósito: probamos tener el elenco debajo de la galaxia en la misma página, con el scroll bloqueado/desbloqueado según dónde estabas, y se mezclaban los gestos (la rueda a veces hacía zoom y a veces bajaba). No volver a juntarlas.
- En la home, `setGalaxyLock(true)` pone `html.galaxy-lock` (sin scroll: recorta `#app` a una pantalla; **nunca** `overflow:hidden` en `html`/`body`, que son el scroll de la página: en iOS, al sacarlo, el primer swipe de la pantalla siguiente se perdía) y agrega los listeners no-pasivos de `wheel`/`touchmove` en `window`: la rueda (y el pinch del trackpad) hace zoom vía `solarWheel(e)`, el pellizco con dos dedos también, y el dedo gira la escena en cualquier dirección (`.solar-canvas` con `touch-action:none`; el pitch no tiene tope). Esos listeners solo existen en la home (y en el mapa de relaciones, que usa el mismo bloqueo); dejan pasar lo que tiene scroll propio (panel de foco, modales, buscador). `render()` siempre parte con `setGalaxyLock(false)`.
- `solar.js` recibe `ownsGestures()` (home, sin modal ni buscador encima). El zoom va de 0.4 a 1.45 (multiplica la distancia de la cámara; parte en 0.64, `ZOOM_START`, bastante más cerca que el encuadre del sistema entero: las órbitas de afuera pueden salirse de la caja), se suaviza por cuadro y se guarda junto al ángulo en `ychSolarView`. En el foco no hay zoom. Con la 2D de respaldo la rueda no hace nada.

Dentro de `.home-sky` conviven dos versiones del mapa de temporadas, en la misma caja:

1. **La constelación 2D** (`.constellation-wrap`, HTML + SVG, generada por `constellationHtml()`): se pinta al instante, sin esperar nada, y es el respaldo. Posiciones fijas dibujadas a mano en `CONSTELLATION_POS` (una para desktop 16:8.2 y otra para móvil 3:4), conectadas por curvas SVG; el nodo "Armagedón" deliberadamente apagado. Cruzar el breakpoint de 600px regenera solo la 2D, sin tocar el 3D.
2. **El sistema solar 3D** (`#solarStage`, montado por `mountHomeSolar()` en `app.js` con `mountSolar()` de `solar.js`): el Hoyo al centro (agujero negro con disco de acreción, anillo de fotones y lente) y seis planetas S0–S5 en órbitas inclinadas (S0 afuera, S5 adentro), cada uno con superficie procedural por shader, tamaño según cuántas historias tiene, unidos por el "hilo del tiempo". Los planetas **avanzan por sus órbitas** (todos a la misma velocidad angular, `ORBIT_SPEED`, para que el hilo conserve su espiral; en sentido contrario al giro automático del sistema, que si no los compensaría en pantalla). Por eso el hilo no es una geometría fija: su vertex shader arma la curva (Catmull-Rom) en cada cuadro a partir de las posiciones de los planetas (`uPts`), y la malla solo trae uv. La posición en la órbita (`orbitT`) se guarda con el ángulo en `ychSolarView`. Arrastrar rota en los dos ejes (con inercia; en touch fuera del modo galaxia solo el gesto horizontal, el vertical es scroll); rueda y pellizco hacen zoom en modo galaxia; clic/toque/Enter en un planeta abre el **modo foco** (la cámara vuela y aparece `.solar-panel` con la temporada y "Entrar a la temporada"); en el Hoyo, el foco del Armagedón (pone `body.mood-doom`, botón a `#/armageddon`). Esc, clic en el vacío o "← Vista general" vuelven. Bloom solo en desktop (`vendor/three/postprocessing.min.js`), sprites en móvil.

**Lunas = historias.** Cada planeta tiene una luna por historia de su temporada (`s.events`), en órbitas propias alrededor del planeta (inclinadas distinto, más lentas mientras más lejos, con una estela corta como la de los planetas; la primera parte por fuera de los anillos). En la vista general son puntos chicos y **no** se pueden elegir (le robarían el clic a los planetas). En el foco de su planeta muestran su número, que es el mismo de la lista "Historias" del panel; pasar el mouse por una luna o por su fila enciende las dos y muestra el título, y el clic lleva a la historia con el enlace directo `#/season/N/M` (el router hace scroll a la tarjeta y la destaca; `opts.storyHref` cambia el formato). El encuadre del foco abarca la órbita de la luna más lejana.

Cuando el primer cuadro 3D ya está pintado (`onReady`), `.hero` recibe `.solar-on`: la 2D se funde hacia afuera y la escena hacia adentro (también cambia el tagline: "estrella" → "planeta"). **Si el 3D no sirve, la 2D se queda** y la página nunca queda en blanco: `solarCapable()` lo descarta de entrada sin WebGL, con render por software (`failIfMajorPerformanceCaveat`), con poca memoria/CPU o con ahorro de datos; si el `import()` falla (offline, `file://`) la promesa se rechaza y no pasa nada; y si después un shader no compila o la escena no sostiene ~16fps ni en el nivel bajo, `onFail` desmonta y saca `.solar-on` (y no se reintenta hasta recargar). **Pérdida de contexto WebGL** (iOS la provoca al volver de otra app o al desbloquear): vuelve la 2D al instante y se remonta solo cuando la pestaña está visible (sin entrada, con el ángulo guardado); a la tercera pérdida en la misma carga queda la 2D (`scheduleSolarRetry` en `app.js`).

**Ciclo de vida:** `viewHome()` monta; `render()` llama a `unmountSolar()` antes de cualquier cambio de vista, que libera todo (renderer + `forceContextLoss()`, composer, geometrías, materiales, texturas, listeners, observers, el bucle rAF y el DOM). Si se desmonta mientras three.js todavía se descarga, el montaje se cancela solo (token). Al desmontar guarda el ángulo de cámara en `sessionStorage` (`ychSolarView`); `viewHome()` lo pide de vuelta solo al volver con "atrás" (igual que `scrollMemory`). La entrada animada del 3D (cámara desde lejos, planetas en orden) va con la del hero: una vez por sesión.

**`body.mood-doom` tiene dos dueños:** la ruta `#/armageddon` y el foco del Hoyo. Ambos pasan por `syncMood(focusDoom)` en `app.js`, que lo calcula desde los dos, así cerrar el foco o desmontar deja lo que pide la ruta.

En un teléfono la caja de la galaxia puede ser más ancha que alta: el panel del foco se vuelve hoja inferior (`.solar-root.is-portrait`) con la caja vertical **o** angosta (<640px), y la vista inicial es más cenital mientras más angosta la caja. En la hoja **el planeta manda**: la hoja es compacta (máx. 36% del alto: flecha ←, título, cifras en una línea, caras chicas, historias que se deslizan adentro y "Entrar" fijo abajo) y el encuadre (`SHEET_TOP` = 0.64 en `solar.js`, el alto libre de arriba) pone al planeta con sus lunas cercanas en ~66% del ancho; las lunas lejanas pueden asomarse al borde. Si cambia el alto máximo de la hoja en el CSS, ajustar `SHEET_TOP` igual.

**Capas:** dentro de `.home-sky`, de abajo hacia arriba: 2D, canvas 3D, etiquetas HTML proyectadas (`.solar-labels`), panel de foco (`.solar-panel`). Todo vive dentro de `#app`, así que el nav (z 40), la barra de edición (55), el buscador (60) y los modales (70) quedan siempre encima. Con un modal o el buscador abierto, Esc no cierra el foco de atrás (`keysBlocked`).

**Rendimiento (F4):**
- *Niveles de calidad* (`TIERS` en `solar.js`): `high` = bloom + DPR ≤2 + shaders completos (5 octavas de fbm, todas las capas de cráteres/grietas); `medium` = sin bloom, DPR ≤2, 4 octavas; `low` = DPR ≤1.5, 3 octavas y sin las capas de Worley secundarias (las más caras). **No bajar el DPR de 1.5**: en un iPhone (pantalla 3x) con DPR 1 la escena se veía borrosa y con los anillos dentados; el ahorro grande está en el bloom y en los shaders. El detalle va como `#define DETAIL` en los shaders. Nivel inicial: desktop con ≥4GB y ≥4 núcleos → `high`; teléfonos/tablets → `medium`, o `low` solo si declaran ≤2GB (`deviceMemory`, Android). Safari no informa memoria y en iOS `hardwareConcurrency` no sirve: sin el dato no se castiga. Después **solo baja, nunca sube** (sin oscilación): se mide el intervalo entre callbacks de rAF en ventanas de 90; dos ventanas seguidas sobre ~26ms (<38fps) bajan un nivel (una sola puede ser un tirón de carga) y luego espera 2.5s; ya en `low` y sobre 60ms (<16fps), se rinde a la 2D. El modo de bajo consumo de iOS topa el rAF a 30fps: eso lleva la escena a `low` (lo que conviene ahí) pero nunca a rendirse.
- *Batería:* la escena dibuja siempre al ritmo de la pantalla (se probó bajar a ~30fps en reposo en táctiles y se notaba: no volver a hacerlo). El bucle se detiene del todo fuera de pantalla (IntersectionObserver), con la pestaña oculta, y con reduced-motion en reposo. En el foco la escena sigue animada a propósito (el planeta gira, el disco y el hilo siguen): se probó dormirla con el foco quieto y se veía congelada. `unmountSolar()` no deja rAF, listeners, observers ni timers (los `setTimeout` de `onReady`/`onFail` quedan neutralizados por `dead`).
- *Carga:* `mountSolar` espera dos rAF + `requestIdleCallback` (la 2D ya pintó) antes de hacer el `import()` de three.js, con prioridad normal (probado: con `fetchpriority="low"` en la home, three.js quedaba en cola detrás de las fotos del elenco y el 3D llegaba segundos más tarde). En las demás vistas, `app.js` llama a `preloadSolar()` después de `load` cuando el navegador está ocioso (`<link rel="modulepreload" fetchpriority="low">`), así volver a la home no espera la red; el `import()` reusa esa descarga. Medido (CPU 4x, three.js en caché): sin esa espera, el build y la compilación de shaders caen antes del primer pintado y lo atrasan ~300ms; con ella, la 2D pinta primero. En Chromium headless (GPU por software) la espera hace que el 3D llegue varios segundos después, porque compite con el rasterizado de la página; con una GPU real ese rasterizado dura milisegundos. `vendor/three/three.module.min.js` es un build **recortado** a las clases usadas (ver `vendor/three/README.md`; si `solar.js` usa una clase nueva hay que regenerarlo). Los avatares del elenco van con `loading="lazy"`.
- *Bordes nítidos (antialiasing):* lo que sale de un shader (superficies, brillos, la lente) se ve suave solo; lo que es **borde de geometría** (la silueta de la esfera del Hoyo, el disco de canto, las órbitas `THREE.Line`, el tubo del hilo) depende del MSAA. El canvas lo tiene (`antialias:true`), pero con bloom la escena se dibuja en el render target del `EffectComposer`, que por defecto **no** tiene muestras: por eso se crea con `samples` (hasta 8). El tubo central del hilo (radio 0.011) suele medir menos de un píxel y se dibujaba a saltos: su vertex shader le pone un ancho mínimo en píxeles de pantalla y lo atenúa en la misma proporción. El pase que mantiene negra la sombra resta el bloom compuesto **entero** (con 95% el Hoyo quedaba gris).
- *Caché en GitHub Pages:* no hay control de headers; Pages sirve todo con `Cache-Control: max-age=600` (10 minutos) + `ETag`/`Last-Modified`, y comprime con gzip. O sea: dentro de 10 minutos, three.js sale de la caché sin red; después, una revalidación chica (304) por archivo. Aceptable para este sitio; si algún día se quisiera caché larga habría que versionar los nombres de archivo (`three.r186.min.js`) y servir desde otro lado.

**Por qué `solar.js` es un `<script>` clásico y three.js entra con `import()`:** `solar.js` sigue la convención del resto (script clásico, expone funciones en `window`, sin build) y se carga sincrónico entre `data.js` y `app.js` para que `mountSolar` exista cuando `app.js` hace el primer `render()`; además usa `document.currentScript.src` para resolver `vendor/` relativo a sí mismo, y eso solo existe en scripts clásicos. Pesa poco (shaders en texto). Three.js (~550KB recortado, ~140KB con gzip) en cambio es ESM y se pide con `import()` recién al montar la home: las demás vistas nunca lo descargan, el primer pintado no lo espera, y si falla (por ejemplo abriendo el HTML como `file://`, donde los navegadores bloquean módulos) solo se pierde el 3D, no la página. Un `<script type="module">` habría sido diferido (llegaría tarde al primer `render()`) y con `file://` no cargaría nada.

### Mapa de relaciones (`#/map`): la red 3D

Una nube 3D de personas (`net3d.js`, `mountNet3D(container, opts)`): cada una del tamaño de cuántas historias tiene, con su foto (`thumb`) o sus iniciales; las líneas unen a quienes comparten historias (más gruesas mientras más), y los que más se cruzan quedan cerca. `viewMap()` arma los datos (`mapData(mode)`) y el panel; `net3d.js` hace el layout y el dibujo.

- **Canvas 2D, no WebGL/three.js, a propósito:** son ~40 nodos y ~200 líneas; proyectarlos a mano (rotación + división por profundidad) cuesta casi nada, anda en cualquier teléfono, no compite con el contexto WebGL de la galaxia y deja fotos y nombres nítidos. El 3D sale de la perspectiva, el orden de dibujo (lo de atrás primero) y una niebla que apaga lo lejano.
- **Layout:** fuerzas en 3D calculadas una vez al montar (repulsión, resortes por historias compartidas, gravedad, choque; arranque en espiral de Fibonacci, así que siempre sale igual). Se normaliza para que el 85% quede dentro de radio 1 (con el máximo, un par de sueltos apretaba a todos al centro), y **el radio dibujado sale del mismo radio de choque, en la misma escala**: así los círculos no se pisan en 3D. Los nombres se ponen del encendido hacia afuera y de adelante hacia atrás, y uno que chocaría con otro ya puesto no sale.
- **Pantalla fija, como la galaxia:** `render()` pone el mismo bloqueo (`setGalaxyLock`, `html.galaxy-lock`) si existe `.net-page` (o `.wr-page`, los resúmenes); la rueda llega a la escena por `lockWheel` (la home lo apunta a `solarWheel`, el mapa a `net3dWheel`; `render()` lo vacía). Arrastrar gira en los dos ejes (con inercia, pitch con tope), rueda/pinch del trackpad y pellizco acercan, y en reposo gira sola despacio (no con alguien elegido ni con el mouse encima de alguien: se le escapaba de debajo antes del clic). `.map-info` está en `OWN_SCROLL`: su lista scrollea adentro.
- **Panel `#mapInfo`:** a la derecha en desktop; en el teléfono (≤900px) hoja inferior **chica** (96px): en reposo muestra solo cómo se usa (red de historias) o la leyenda de colores (amoríos), y las cifras y lo demás quedan más abajo, deslizando dentro de la hoja (`.mi-first` / `.mi-rest`). Al elegir a alguien crece (`.is-person`) para que se vea su lista; el cambio de alto es animado y la nube se re-centra suavizada, así que no salta. `insets()` le dice a `net3d` cuánto tapan el título y el panel, y la nube se centra (suavizado) en lo que queda libre. En reposo: totales y el lazo más fuerte. Desktop: pasar el mouse muestra a la persona y sus conexiones, clic abre la ficha. Touch: el 1er toque elige (la nube gira hasta dejarla al frente), el 2º abre la ficha. Tocar a alguien en la lista del panel lo elige en la red. Esc suelta. Filtro "Todos / Solo el grupo" (`mapMode`) remonta.
- **Dos redes en la misma pantalla** (pestañas arriba): `#/map` = historias compartidas; `#/map/besos` = **Amoríos**, quién se comió a quién (`DATA.hookups`, `mapDataHookups()`), con una línea por pareja coloreada por tipo (`HOOK_KINDS`: 💋 se comieron, 🔥 pinches, 💔 ex; "hasta el final" existió y se juntó con "se comieron" a pedido del usuario, un `kind` desconocido cuenta como beso; `net3d` acepta `rgb` por arista). El panel dice de qué historia sale cada una (`hookStory(h)` la busca por temporada + **título**, así no se rompe si cambia el orden). **Solo lo que cuentan las historias o lo que el usuario contó**: lo dudoso no entra (p. ej. Cristóbal con Daniela o Blanca). En modo edición, "➕ Agregar" (`openHookupEditor`) guarda en `overrides.extraHookups` y sale en "📋 Copiar para Claude". La página Juntos muestra el tipo si la pareja está en esta red.
- Hay una lista `.sr-only` con todos (el canvas no es accesible por sí solo). No hay pie de página (la pantalla no scrollea). `unmountNet3D()` va en `viewCleanups`: no deja rAF, listeners ni observers; sin canvas (jsdom) devuelve `null` y queda solo el panel.

Armagedón es la única ruta que cambia el humor del sitio: `body.mood-doom` (lo pone el router, y el foco del Hoyo mientras está abierto) tiñe `#skyWash` de rojo y desatura `#skyPhoto`.

Cada ficha de personaje tiene un wash de color de fondo (`--pcolor`, tomado de `character.color`) y, si tiene `photos`/`photoLarge`, un layout partido (texto a un lado, retrato grande con marco de esquinas al otro). Sin foto, cae a un layout centrado con avatar circular chico.

## Convenciones de contenido

- Todo el copy es en español (Chile), tono de crónica/aventura épica pero honesto — incluso los momentos incómodos se cuentan directo, sin embellecer de más ni trivializar.
- Personajes "primario" = del grupo; "secundario" = gente que aparece en alguna historia pero no es del núcleo.
- Lugares y personajes nuevos que aparecen dentro de una historia se agregan a `DATA` con campos en null/pendiente y se le pide al usuario que los complete después.
- No inventar hechos, fechas o roles que el usuario no haya dado — dejar marcado "— rol pendiente —" / "Cuéntame..." en vez de rellenar con suposiciones.
- **Cómo se ven los pendientes:** en modo lectura, un campo que es un recordatorio ("Cuéntame...", "— rol pendiente —"; ver `isPending`) no se muestra como contenido: sale una marca discreta (`pendingHtml`: "— el hito de esta temporada está por escribirse —", "Perfil por escribir...", "descripción pendiente") o directamente no sale (el chip de rol). En modo edición se ve el texto completo en amarillo con ✎, porque ahí es útil saber qué falta. Las notas "— Cuéntame más: ..." al final de una historia se dibujan como nota punteada "✎ por completar" (`.ask-note`), separadas del relato.

## Deploy

Pensado para GitHub Pages: el archivo se llama `index.html` a propósito para que quede servido en la raíz del sitio sin configurar nada más. `data.js`, `solar.js`, `vendor/` y la carpeta `/images` viajan junto al `index.html` en el mismo repo/rama, así las rutas relativas funcionan igual en local y en Pages. `git init` → commit → push a `main` → activar Pages en Settings del repo (source: `main` branch, carpeta raíz).

Se trabaja siempre directo sobre `main` (sin ramas ni PRs) — es un proyecto de una sola persona.
