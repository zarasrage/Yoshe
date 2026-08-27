# Yoshe con Hoyo — crónica del grupo

Sitio de una sola página (HTML/CSS/JS puro, sin build, sin frameworks) que cuenta la historia de un grupo de amigos a través de temporadas (S0–S5), con personajes, lugares, un mapa de relaciones, y una sección final "Armagedón" con el destino de cada integrante.

**Archivos principales:** `index.html` (esqueleto HTML, ~60 líneas), `styles.css` (todo el CSS), `app.js` (toda la lógica/vistas JS) y `data.js` (el objeto `DATA` con toda la historia: personajes, lugares, temporadas). `index.html` carga los tres vía `<link rel="stylesheet" href="styles.css">` y `<script src="data.js">` + `<script src="app.js">` (data.js primero, porque `app.js` usa `DATA` como variable de módulo top-level sin imports). No hay build step: se edita directo y se abre en el navegador — los cuatro archivos son texto plano, sin bundler, sin transpilación. Se separó `DATA` a su propio archivo porque es la parte que más crece con cada historia nueva, y CSS/JS se separaron de `index.html` por lo mismo en sentido inverso: son las partes que casi no cambian de tamaño pero sí se tocan seguido, así que aislarlas evita cargar ~2300 líneas de HTML+CSS+JS mezclado para tocar un solo estilo o una sola función. Las fotos de personajes son archivos reales en `/images` (NO base64 inline — se sacaron de ahí porque hacían el archivo pesadísimo), referenciadas por ruta relativa.

## Cómo probar cambios

No hay servidor ni build. Para validar que el JS no tiene errores de sintaxis después de editar:

```bash
node -e "
const fs = require('fs');
new Function(fs.readFileSync('app.js','utf8'));
new Function(fs.readFileSync('data.js','utf8'));
console.log('JS syntax OK');
"
```

Para probar funcionalmente con jsdom (simula un navegador headless):

```bash
npm install jsdom --no-save   # si no está instalado
node -e "
const { JSDOM } = require('jsdom');
const fs = require('fs');
const dom = new JSDOM(fs.readFileSync('index.html','utf8'), { runScripts:'dangerously', resources:'usable', pretendToBeVisual:true, url:'http://localhost/' });
const win = dom.window;
win.IntersectionObserver = class { observe(){} };
setTimeout(()=>{
  win.viewHome();
  console.log('star-nodes:', win.document.querySelectorAll('.star-node').length);
}, 300);
"
```

No hay tests automatizados formales — la validación es: syntax check + un par de aserciones puntuales en jsdom sobre la vista que tocaste, y listo.

## Arquitectura

Todo vive en un objeto global `DATA` (en `data.js`), con esta forma:

```js
const DATA = {
  characters: {
    "id-slug": {
      name, role, tier: "primario"|"secundario", color: "#hex",
      bio, apodo, frase, habilidad, destino,   // cualquiera puede ser null
      photo: "images/id-slug-1.jpg",     // avatar chico circular (opcional), ruta relativa a /images
      photoLarge: "images/id-slug-2.png", // retrato grande, UNA foto (legacy, usar photos en su lugar)
      photos: ["images/id-slug-2.png", ...], // retrato grande, VARIAS fotos con carrusel (preferido)
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
          content: [
            {t:"text", v:"..."},
            {t:"char", id:"char-id"},   // se renderiza con el nombre de DATA.characters[id]
            {t:"place", id:"place-id"}
          ]
        }
      ]
    }
  ],
  armageddon: { intro: "..." }  // profecía general; el destino de cada persona vive en character.destino
};
```

**Por qué `content` es un arreglo de segmentos y no un string:** así los nombres de personajes/lugares quedan resaltados y clicables de forma confiable (sin regex sobre texto libre). Al escribir una historia nueva, usa `{t:"char", id:"..."}` / `{t:"place", id:"..."}` en vez de escribir el nombre a mano.

Hay una función `autoTagText(text)` que hace esto automáticamente a partir de texto plano (detecta nombres completos, primer nombre si es único, y apodos) — la usa el formulario de "agregar historia" en modo edición.

### Vistas (router por hash, sin librería)

`render()` lee `location.hash` y despacha a: `viewHome()`, `viewSeason(id)`, `viewCharacter(id)`, `viewPlace(id)`, `viewMap()`, `viewArmageddon()`. Viven en `app.js`, sin imports — `DATA` (de `data.js`) está disponible ahí porque `data.js` se carga antes que `app.js` en el HTML, no porque cuelgue de `window`.

### Persistencia (modo edición)

Los cambios hechos desde el botón ✏️ (bios, apodos, frases, habilidades, destinos, hitos, nuevas historias) se guardan en `localStorage` del navegador vía `patchCharacter()`, `patchPlace()`, `patchSeasonMeta()`, `addEventToSeason()`, `patchArmageddon()` — todas mutan `DATA` en memoria Y persisten un "override" parcial. `applyOverrides()` los reaplica al cargar. Hay export/import de JSON como respaldo manual (no hay backend ni base de datos).

**Importante:** todo acceso a `localStorage` está envuelto en try/catch. Algunos visores (Quick Look de iOS, vistas previas sandboxed) bloquean `localStorage` y sin el try/catch eso rompía toda la página (pantalla en blanco). Si agregas una llamada nueva a `localStorage`, protégela igual.

## Imágenes de personajes

Proceso para agregar una foto de personaje:

1. El usuario manda una ilustración (idealmente ya con fondo transparente, herramientas como Photoroom sirven).
2. Verificar transparencia real: `Image.open(path).convert('RGBA').getchannel('A').getextrema()` — si da `(0,255)` hay canal alfa real; si no, es fondo blanco sólido y hay que removerlo (ver más abajo).
3. Redimensionar a max width ~700px, guardar como PNG optimizado.
4. Guardar el archivo en `/images/<id-slug>-N.png` (o `.jpg`) y referenciarlo por ruta relativa dentro de `photos: [...]` (o `photoLarge` si es solo una). **No** convertir a base64 inline — eso es lo que hacía el `index.html` pesar varios MB.
5. Si el fondo NO era transparente, removerlo con flood-fill desde las esquinas (tolerancia por distancia de color) + `scipy.ndimage.gaussian_filter` para suavizar el borde — ver conversación anterior para el script exacto (usa `skimage.segmentation.flood`).

El carrusel de fotos (`cyclePhoto()`) cicla entre `photos[]` con una transición tipo "portal warp" (scale + rotateY + blur). Si un personaje solo tiene una foto, el click no hace nada (por diseño).

## Diseño / paleta

Tema "espacio profundo, cielo estrellado azul". Variables CSS en `:root`: `--void`, `--void-2`, `--void-3`, `--hole`, `--ink`, `--ink-dim`, `--ink-faint`, `--amber` (acento principal, cian, el nombre quedó por historia), `--violet`, `--teal`, `--line`, `--line-soft`, `--card`, `--card-hi`, `--ease`. Cambiar la paleta = redefinir estas variables, no hay que tocar el resto del CSS. Los valores actuales están muestreados de los píxeles reales de `images/fondo_definitivo.jpg`.

Tipografías: `Cormorant Garamond` (serif de display: títulos, nombres, números de stats), `Outfit` (body/UI), `JetBrains Mono` (labels, fechas, chips, código).

### El cielo (fondo)

Tres capas `position:fixed` a tamaño de viewport, detrás de todo, en este orden de pintado:

1. `#skyPhoto` — la foto real (`images/sky-wide.jpg`, o `sky-tall.jpg` bajo 700px de ancho), con un `skyDrift` de 140s que la desplaza lentísimo.
2. `#skyWash` — degradados de tono/viñeta que garantizan un piso de contraste constante para el texto, sea cual sea la zona de la foto que quede detrás.
3. `#stars` — canvas animado (titileo, deriva en 360°, parallax por profundidad al hacer scroll, estrellas fugaces desde los 4 bordes).

**Por qué fijas y no del alto del documento:** la página mide varios miles de px; una foto estirada a ese alto se ve borrosa y en mosaico se nota la repetición. Fijas, el cielo simplemente se queda quieto mientras el contenido pasa por encima — y de paso el canvas solo necesita el tamaño del viewport (mucho más barato de animar) en vez del alto completo del documento.

La fuente original del cielo (`images/fondo_definitivo.jpg`, 3840×2160) se conserva en el repo, pero la página **nunca la carga**: sirve las versiones optimizadas `sky-wide.jpg` (2560px) y `sky-tall.jpg` (recorte vertical para teléfonos). Al cambiar el fondo hay que regenerar esas dos y volver a muestrear la paleta de `:root`.

### Movimiento

- `.reveal` / `.reveal-stagger` + `setupReveals()` — entrada al hacer scroll, vía IntersectionObserver. Hay que llamar a `setupReveals()` al final de cada `view*()` que use esas clases. Si no hay IntersectionObserver o el usuario pidió `prefers-reduced-motion`, todo se muestra de inmediato (importante: `.reveal` arranca en `opacity:0`, así que sin ese fallback la página quedaría en blanco).
- `#app.route-in` — transición de entrada en cada cambio de ruta (`replayRouteAnimation()`).
- Un solo bucle `requestAnimationFrame` maneja el nav que se condensa, el hero que retrocede al hacer scroll y el tilt de la constelación con el puntero.
- `backdrop-filter` se usa **solo** en superficies grandes y pocas a la vez (nav, modales, buscador, paneles del timeline, paneles de perfil). Las tarjetas que se renderizan de a decenas (`.cast-card`, `.place-card`, `.epitaph-card`, `.story-link-card`) usan un fondo plano más opaco: se ve casi igual sobre la foto oscura y cuesta una fracción.

Página principal: los nodos de temporada son una **constelación dibujada a mano** (posiciones fijas en `CONSTELLATION_POS`, no un layout circular), conectados por curvas SVG. El nodo "Armagedón" está deliberadamente apagado/discreto, separado de la constelación principal. El ancho de `.constellation-wrap` está limitado también por `vh` para que todo el hero (copy + constelación + scroll cue) entre en pantallas de laptop bajitas (1280×720).

Armagedón es la única ruta que cambia el humor del sitio: `body.mood-doom` (lo pone el router) tiñe `#skyWash` de rojo y desatura `#skyPhoto`.

Cada ficha de personaje tiene un wash de color de fondo (`--pcolor`, tomado de `character.color`) y, si tiene `photos`/`photoLarge`, un layout partido (texto a un lado, retrato grande con marco de esquinas al otro). Sin foto, cae a un layout centrado con avatar circular chico.

## Convenciones de contenido

- Todo el copy es en español (Chile), tono de crónica/aventura épica pero honesto — incluso los momentos incómodos se cuentan directo, sin embellecer de más ni trivializar.
- Personajes "primario" = del grupo; "secundario" = gente que aparece en alguna historia pero no es del núcleo.
- Lugares y personajes nuevos que aparecen dentro de una historia se agregan a `DATA` con campos en null/pendiente y se le pide al usuario que los complete después.
- No inventar hechos, fechas o roles que el usuario no haya dado — dejar marcado "— rol pendiente —" / "Cuéntame..." en vez de rellenar con suposiciones.

## Deploy

Pensado para GitHub Pages: el archivo se llama `index.html` a propósito para que quede servido en la raíz del sitio sin configurar nada más. `data.js` y la carpeta `/images` viajan junto al `index.html` en el mismo repo/rama, así las rutas relativas funcionan igual en local y en Pages. `git init` → commit → push a `main` → activar Pages en Settings del repo (source: `main` branch, carpeta raíz).

Se trabaja siempre directo sobre `main` (sin ramas ni PRs) — es un proyecto de una sola persona.
