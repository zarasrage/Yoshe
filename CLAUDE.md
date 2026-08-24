# Yoshe con Hoyo — crónica del grupo

Sitio de una sola página (HTML/CSS/JS puro, sin build, sin frameworks) que cuenta la historia de un grupo de amigos a través de temporadas (S0–S5), con personajes, lugares, un mapa de relaciones, y una sección final "Armagedón" con el destino de cada integrante.

**Archivo principal:** `index.html` — todo (HTML, CSS, JS y las imágenes de personajes en base64) vive en este único archivo. No hay build step: se edita directo y se abre en el navegador.

## Cómo probar cambios

No hay servidor ni build. Para validar que el JS no tiene errores de sintaxis después de editar:

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('index.html','utf8');
const script = html.split('<script>')[1].split('</script>')[0];
new Function(script);
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

Todo vive en un objeto global `DATA` (dentro del `<script>`), con esta forma:

```js
const DATA = {
  characters: {
    "id-slug": {
      name, role, tier: "primario"|"secundario", color: "#hex",
      bio, apodo, frase, habilidad, destino,   // cualquiera puede ser null
      photo: "data:image/jpeg;base64,...",     // avatar chico circular (opcional)
      photoLarge: "data:image/png;base64,...", // retrato grande, UNA foto (legacy, usar photos en su lugar)
      photos: ["data:image/png;base64,...", ...], // retrato grande, VARIAS fotos con carrusel (preferido)
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

`render()` lee `location.hash` y despacha a: `viewHome()`, `viewSeason(id)`, `viewCharacter(id)`, `viewPlace(id)`, `viewMap()`, `viewArmageddon()`. Todo vive en el mismo `<script>`, sin imports.

### Persistencia (modo edición)

Los cambios hechos desde el botón ✏️ (bios, apodos, frases, habilidades, destinos, hitos, nuevas historias) se guardan en `localStorage` del navegador vía `patchCharacter()`, `patchPlace()`, `patchSeasonMeta()`, `addEventToSeason()`, `patchArmageddon()` — todas mutan `DATA` en memoria Y persisten un "override" parcial. `applyOverrides()` los reaplica al cargar. Hay export/import de JSON como respaldo manual (no hay backend ni base de datos).

**Importante:** todo acceso a `localStorage` está envuelto en try/catch. Algunos visores (Quick Look de iOS, vistas previas sandboxed) bloquean `localStorage` y sin el try/catch eso rompía toda la página (pantalla en blanco). Si agregas una llamada nueva a `localStorage`, protégela igual.

## Imágenes de personajes

Proceso para agregar una foto de personaje:

1. El usuario manda una ilustración (idealmente ya con fondo transparente, herramientas como Photoroom sirven).
2. Verificar transparencia real: `Image.open(path).convert('RGBA').getchannel('A').getextrema()` — si da `(0,255)` hay canal alfa real; si no, es fondo blanco sólido y hay que removerlo (ver más abajo).
3. Redimensionar a max width ~700px, guardar como PNG optimizado.
4. Convertir a base64 y pegar como `data:image/png;base64,...` dentro de `photos: [...]` (o `photoLarge` si es solo una).
5. Si el fondo NO era transparente, removerlo con flood-fill desde las esquinas (tolerancia por distancia de color) + `scipy.ndimage.gaussian_filter` para suavizar el borde — ver conversación anterior para el script exacto (usa `skimage.segmentation.flood`).

El carrusel de fotos (`cyclePhoto()`) cicla entre `photos[]` con una transición tipo "portal warp" (scale + rotateY + blur). Si un personaje solo tiene una foto, el click no hace nada (por diseño).

## Diseño / paleta

Tema "espacio profundo, cielo estrellado azul" (nebulosa azul-cian sobre negro-azulado, estrellas con glow). Variables CSS en `:root`: `--void`, `--void-2`, `--void-3`, `--hole`, `--ink`, `--ink-dim`, `--amber` (acento brillante, ahora azul-cian pese al nombre), `--violet`, `--teal`, `--line`, `--card`. Cambiar la paleta = redefinir estas variables, no hay que tocar el resto del CSS.

Tipografías: `Fraunces` (serif, títulos/nombres), `Inter` (body), `JetBrains Mono` (labels, fechas, código).

Página principal: los nodos de temporada son una **constelación dibujada a mano** (posiciones fijas en `CONSTELLATION_POS`, no un layout circular), conectados por líneas SVG finas. El nodo "Armagedón" está deliberadamente apagado/discreto (opacity baja, sin glow), separado de la constelación principal.

Cada ficha de personaje tiene un wash de color de fondo (`--pcolor`, tomado de `character.color`) y, si tiene `photos`/`photoLarge`, un layout partido (texto a un lado, retrato grande con marco de esquinas al otro). Sin foto, cae a un layout centrado con avatar circular chico.

## Convenciones de contenido

- Todo el copy es en español (Chile), tono de crónica/aventura épica pero honesto — incluso los momentos incómodos se cuentan directo, sin embellecer de más ni trivializar.
- Personajes "primario" = del grupo; "secundario" = gente que aparece en alguna historia pero no es del núcleo.
- Lugares y personajes nuevos que aparecen dentro de una historia se agregan a `DATA` con campos en null/pendiente y se le pide al usuario que los complete después.
- No inventar hechos, fechas o roles que el usuario no haya dado — dejar marcado "— rol pendiente —" / "Cuéntame..." en vez de rellenar con suposiciones.

## Deploy

Pensado para GitHub Pages: el archivo se llama `index.html` a propósito para que quede servido en la raíz del sitio sin configurar nada más. `git init` → commit → push a `main` → activar Pages en Settings del repo (source: `main` branch, carpeta raíz).
