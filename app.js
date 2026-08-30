/* =========================================================================
   PERSISTENCIA LOCAL (modo edición)
   Los cambios hechos desde la página (bios, apodos, frases, habilidades,
   hitos, títulos y nuevos eventos) se guardan en localStorage del navegador
   y se re-aplican sobre DATA cada vez que se carga la página. No es una
   base de datos compartida: vive solo en este navegador/dispositivo.
   Usa "Exportar cambios" para respaldarlos o pasarlos a otro dispositivo.
   ========================================================================= */
const OV_KEY = "ychOverrides_v1";
function loadOverrides(){
  try{ return JSON.parse(localStorage.getItem(OV_KEY)) || {characters:{}, places:{}, seasonMeta:{}, extraEvents:{}, armageddon:{}}; }
  catch(e){ return {characters:{}, places:{}, seasonMeta:{}, extraEvents:{}, armageddon:{}}; }
}
function saveOverrides(ov){ try{ localStorage.setItem(OV_KEY, JSON.stringify(ov)); }catch(e){ /* storage unavailable — edits won't persist across reloads in this context */ } }
function applyOverrides(){
  const ov = loadOverrides();
  Object.entries(ov.characters||{}).forEach(([id,patch])=>{ if(DATA.characters[id]) Object.assign(DATA.characters[id], patch); });
  Object.entries(ov.places||{}).forEach(([id,patch])=>{ if(DATA.places[id]) Object.assign(DATA.places[id], patch); });
  Object.entries(ov.seasonMeta||{}).forEach(([sid,patch])=>{ const s=DATA.seasons.find(x=>String(x.id)===String(sid)); if(s) Object.assign(s, patch); });
  Object.entries(ov.extraEvents||{}).forEach(([sid,events])=>{ const s=DATA.seasons.find(x=>String(x.id)===String(sid)); if(s) events.forEach(e=>s.events.push(e)); });
  if(ov.armageddon) Object.assign(DATA.armageddon, ov.armageddon);
}
applyOverrides();

function patchCharacter(id, patch){
  Object.assign(DATA.characters[id], patch);
  const ov = loadOverrides();
  ov.characters[id] = Object.assign(ov.characters[id]||{}, patch);
  saveOverrides(ov);
}
function patchPlace(id, patch){
  Object.assign(DATA.places[id], patch);
  const ov = loadOverrides();
  ov.places[id] = Object.assign(ov.places[id]||{}, patch);
  saveOverrides(ov);
}
function patchArmageddon(patch){
  Object.assign(DATA.armageddon, patch);
  const ov = loadOverrides();
  ov.armageddon = Object.assign(ov.armageddon||{}, patch);
  saveOverrides(ov);
}
function patchSeasonMeta(seasonId, patch){
  const s = DATA.seasons.find(x=>String(x.id)===String(seasonId));
  if(s) Object.assign(s, patch);
  const ov = loadOverrides();
  ov.seasonMeta[seasonId] = Object.assign(ov.seasonMeta[seasonId]||{}, patch);
  saveOverrides(ov);
}
function addEventToSeason(seasonId, eventObj){
  const s = DATA.seasons.find(x=>String(x.id)===String(seasonId));
  if(s) s.events.push(eventObj);
  const ov = loadOverrides();
  ov.extraEvents[seasonId] = ov.extraEvents[seasonId]||[];
  ov.extraEvents[seasonId].push(eventObj);
  saveOverrides(ov);
}
function exportOverrides(){
  const ov = loadOverrides();
  const blob = new Blob([JSON.stringify(ov,null,2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "yoshe-con-hoyo-cambios.json";
  a.click();
}
function importOverridesFile(input){
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const parsed = JSON.parse(reader.result);
      saveOverrides(parsed);
      alert("Cambios importados. La página se va a recargar.");
      location.reload();
    }catch(e){ alert("Ese archivo no tiene un formato válido."); }
  };
  reader.readAsText(file);
}

/* =========================== auto-detección de nombres =========================== */
function buildNameIndex(){
  const items=[];
  const firstNameCount={};
  Object.values(DATA.characters).forEach(c=>{
    const fn=c.name.split(" ")[0];
    firstNameCount[fn]=(firstNameCount[fn]||0)+1;
  });
  Object.entries(DATA.characters).forEach(([id,c])=>{
    items.push({id,name:c.name,type:"char"});
    const fn=c.name.split(" ")[0];
    if(firstNameCount[fn]===1 && fn!==c.name) items.push({id,name:fn,type:"char"});
    if(c.apodo) items.push({id,name:c.apodo,type:"char"});
  });
  Object.entries(DATA.places).forEach(([id,p])=>items.push({id,name:p.name,type:"place"}));
  items.sort((a,b)=>b.name.length-a.name.length);
  return items;
}
function autoTagText(text){
  const items = buildNameIndex();
  if(!items.length || !text) return [{t:"text", v:text||""}];
  const esc = s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const pattern = items.map(it=>esc(it.name)).join("|");
  const re = new RegExp("("+pattern+")","g");
  const parts = text.split(re);
  const segs=[];
  parts.forEach(part=>{
    if(part===undefined || part==="") return;
    const found = items.find(it=>it.name===part);
    if(found) segs.push({t:found.type, id:found.id});
    else segs.push({t:"text", v:part});
  });
  return segs;
}

/* =========================== BUSCADOR =========================== */
function toggleSearch(){
  const ov = document.getElementById("searchOverlay");
  ov.classList.toggle("active");
  if(ov.classList.contains("active")){
    setTimeout(()=>document.getElementById("searchInput").focus(), 50);
    document.getElementById("searchInput").value="";
    document.getElementById("searchResults").innerHTML = `<div class="search-empty">Escribe para buscar…</div>`;
  }
}
function runSearch(q){
  const box = document.getElementById("searchResults");
  const query = q.trim().toLowerCase();
  if(query.length<2){ box.innerHTML = `<div class="search-empty">Escribe al menos 2 letras…</div>`; return; }

  const charMatches = Object.entries(DATA.characters).filter(([id,c])=>
    c.name.toLowerCase().includes(query) || (c.apodo&&c.apodo.toLowerCase().includes(query)) || (c.role&&c.role.toLowerCase().includes(query))
  );
  const placeMatches = Object.entries(DATA.places).filter(([id,p])=>
    p.name.toLowerCase().includes(query) || (p.desc&&p.desc.toLowerCase().includes(query))
  );
  const eventMatches = allEventsFlat().filter(r=>{
    const text = r.event.title + " " + r.event.content.filter(s=>s.t==="text").map(s=>s.v).join(" ");
    return text.toLowerCase().includes(query);
  });

  if(!charMatches.length && !placeMatches.length && !eventMatches.length){
    box.innerHTML = `<div class="search-empty">Sin resultados para "${escapeHtml(q)}"</div>`; return;
  }

  let html="";
  if(charMatches.length){
    html += `<div class="search-result-group"><h4>Personajes</h4>` + charMatches.map(([id,c])=>
      `<div class="search-result-item" onclick="toggleSearch();navigateTo('character','${id}')">
        <div class="srn">${escapeHtml(c.name)}</div><div class="srd">${escapeHtml(c.role)}</div>
      </div>`).join("") + `</div>`;
  }
  if(placeMatches.length){
    html += `<div class="search-result-group"><h4>Lugares</h4>` + placeMatches.map(([id,p])=>
      `<div class="search-result-item" onclick="toggleSearch();navigateTo('place','${id}')">
        <div class="srn">${p.icon} ${escapeHtml(p.name)}</div>
      </div>`).join("") + `</div>`;
  }
  if(eventMatches.length){
    html += `<div class="search-result-group"><h4>Historias</h4>` + eventMatches.map(r=>
      `<div class="search-result-item" onclick="toggleSearch();location.hash='#/season/${r.season.id}';setTimeout(()=>flashEvent(${r.season.id},${r.index}),120)">
        <div class="srn">${escapeHtml(r.event.title)}</div><div class="srd">${r.season.code} · ${escapeHtml(r.event.date)}</div>
      </div>`).join("") + `</div>`;
  }
  box.innerHTML = html;
}

/* =========================== HISTORIA ALEATORIA =========================== */
function goRandomStory(){
  const all = allEventsFlat();
  if(!all.length){ alert("Todavía no hay historias cargadas."); return; }
  const pick = all[Math.floor(Math.random()*all.length)];
  location.hash = `#/season/${pick.season.id}`;
  setTimeout(()=>flashEvent(pick.season.id, pick.index), 150);
}

/* =========================== MODO EDICIÓN =========================== */
function isEditOn(){ try{ return localStorage.getItem("ychEditOn")==="1"; }catch(e){ return false; } }
function toggleEditMode(){
  const on = !isEditOn();
  try{ localStorage.setItem("ychEditOn", on?"1":"0"); }catch(e){ /* storage unavailable (e.g. sandboxed preview) — continue without persisting */ }
  document.body.classList.toggle("edit-on", on);
  document.getElementById("editToggleBtn").classList.toggle("active", on);
  render();
}
function openModal(html){
  document.getElementById("modalBox").innerHTML = html;
  document.getElementById("modalOverlay").classList.add("active");
}
function closeModal(){ document.getElementById("modalOverlay").classList.remove("active"); }

function openCharEditModal(id){
  const c = DATA.characters[id];
  openModal(`
    <h3>Editar a ${escapeHtml(c.name)}</h3>
    <label>Foto de perfil</label>
    <div style="display:flex; align-items:center; gap:12px;">
      ${c.photo ? `<img src="${c.photo}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;">` : ""}
      <input type="file" id="f_photo" accept="image/*">
    </div>
    <label>Rol / apodo funcional</label><input id="f_role" value="${escapeHtml(c.role||"")}">
    <label>Apodo</label><input id="f_apodo" value="${escapeHtml(c.apodo||"")}">
    <label>Categoría</label>
    <select id="f_tier"><option value="primario" ${c.tier!=='secundario'?'selected':''}>Primario</option><option value="secundario" ${c.tier==='secundario'?'selected':''}>Secundario</option></select>
    <label>Biografía</label><textarea id="f_bio">${escapeHtml(c.bio||"")}</textarea>
    <label>Habilidad especial</label><input id="f_habilidad" value="${escapeHtml(c.habilidad||"")}">
    <label>Frase icónica</label><input id="f_frase" value="${escapeHtml(c.frase||"")}">
    <label>Destino final (Armagedón)</label><textarea id="f_destino" placeholder="¿Cómo termina la historia de este personaje?">${escapeHtml(c.destino||"")}</textarea>
    <div class="modal-actions">
      <button onclick="closeModal()">Cancelar</button>
      <button class="primary" onclick="submitCharEdit('${id}')">Guardar</button>
    </div>
  `);
}
function resizeImageFile(file, maxW, cb){
  const reader = new FileReader();
  reader.onload = ()=>{
    const img = new Image();
    img.onload = ()=>{
      const scale = Math.min(1, maxW/img.width);
      const w = Math.round(img.width*scale), h = Math.round(img.height*scale);
      const canvas = document.createElement("canvas");
      canvas.width=w; canvas.height=h;
      canvas.getContext("2d").drawImage(img,0,0,w,h);
      cb(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function submitCharEdit(id){
  const patch = {
    role: document.getElementById("f_role").value,
    apodo: document.getElementById("f_apodo").value || null,
    tier: document.getElementById("f_tier").value,
    bio: document.getElementById("f_bio").value,
    habilidad: document.getElementById("f_habilidad").value || null,
    frase: document.getElementById("f_frase").value || null,
    destino: document.getElementById("f_destino").value || null,
  };
  const fileInput = document.getElementById("f_photo");
  if(fileInput && fileInput.files && fileInput.files[0]){
    resizeImageFile(fileInput.files[0], 500, (dataUrl)=>{
      patch.photo = dataUrl;
      patchCharacter(id, patch);
      closeModal(); render();
    });
  } else {
    patchCharacter(id, patch);
    closeModal(); render();
  }
}

function openPlaceEditModal(id){
  const p = DATA.places[id];
  openModal(`
    <h3>Editar ${escapeHtml(p.name)}</h3>
    <label>Ícono (emoji)</label><input id="f_icon" value="${escapeHtml(p.icon||"")}">
    <label>Descripción</label><textarea id="f_desc">${escapeHtml(p.desc||"")}</textarea>
    <div class="modal-actions">
      <button onclick="closeModal()">Cancelar</button>
      <button class="primary" onclick="submitPlaceEdit('${id}')">Guardar</button>
    </div>
  `);
}
function submitPlaceEdit(id){
  patchPlace(id, {
    icon: document.getElementById("f_icon").value,
    desc: document.getElementById("f_desc").value,
  });
  closeModal(); render();
}

function openSeasonMetaModal(seasonId){
  const s = DATA.seasons.find(x=>String(x.id)===String(seasonId));
  openModal(`
    <h3>Editar ${s.code}</h3>
    <label>Título de la temporada</label><input id="f_title" value="${escapeHtml(s.title||"")}">
    <label>Hito de inicio</label><textarea id="f_hito">${escapeHtml(s.hito||"")}</textarea>
    <div class="modal-actions">
      <button onclick="closeModal()">Cancelar</button>
      <button class="primary" onclick="submitSeasonMeta('${seasonId}')">Guardar</button>
    </div>
  `);
}
function submitSeasonMeta(seasonId){
  patchSeasonMeta(seasonId, {
    title: document.getElementById("f_title").value,
    hito: document.getElementById("f_hito").value,
  });
  closeModal(); render();
}

function openAddEventModal(seasonId){
  const charOptions = Object.entries(DATA.characters).map(([id,c])=>
    `<label style="font-weight:400; display:flex; align-items:center; gap:8px; margin:4px 0;">
      <input type="checkbox" value="${id}" style="width:auto;">${escapeHtml(c.name)}
    </label>`).join("");
  const placeOptions = `<option value="">— sin lugar —</option>` + Object.entries(DATA.places).map(([id,p])=>
    `<option value="${id}">${escapeHtml(p.name)}</option>`).join("");
  openModal(`
    <h3>Nueva historia</h3>
    <label>Fecha</label><input id="ne_date" placeholder="ej: Marzo 2024">
    <label>Título</label><input id="ne_title" placeholder="ej: La noche del asado">
    <label>Lugar</label><select id="ne_place">${placeOptions}</select>
    <label>Personajes involucrados</label>
    <div style="max-height:140px; overflow-y:auto; border:1px solid var(--line); border-radius:8px; padding:10px;">${charOptions}</div>
    <label>Cuenta la historia (escribe los nombres tal cual — se resaltan solos)</label>
    <textarea id="ne_content" placeholder="Escribe la anécdota completa acá…"></textarea>
    <div class="modal-actions">
      <button onclick="closeModal()">Cancelar</button>
      <button class="primary" onclick="submitAddEvent('${seasonId}')">Agregar historia</button>
    </div>
  `);
}
function submitAddEvent(seasonId){
  const date = document.getElementById("ne_date").value || "Fecha sin especificar";
  const title = document.getElementById("ne_title").value || "Historia sin título";
  const place = document.getElementById("ne_place").value || null;
  const chars = Array.from(document.querySelectorAll('#modalBox input[type="checkbox"]:checked')).map(el=>el.value);
  const contentText = document.getElementById("ne_content").value || "";
  const eventObj = {date, title, place, chars, content: autoTagText(contentText)};
  addEventToSeason(seasonId, eventObj);
  closeModal();
  location.hash = `#/season/${seasonId}`;
  render();
}


function allEventsFlat(){
  const out=[];
  DATA.seasons.forEach(s=>s.events.forEach((e,i)=>out.push({season:s, event:e, index:i})));
  return out;
}
function characterStats(id){
  const related = allEventsFlat().filter(x=>x.event.chars.includes(id));
  const seasonSet = [...new Set(related.map(r=>r.season.code))];
  const placeCounts = {}, coCharCounts = {};
  related.forEach(r=>{
    if(r.event.place) placeCounts[r.event.place] = (placeCounts[r.event.place]||0)+1;
    r.event.chars.forEach(cid=>{ if(cid!==id) coCharCounts[cid]=(coCharCounts[cid]||0)+1; });
  });
  const topOf = obj => Object.entries(obj).sort((a,b)=>b[1]-a[1])[0];
  const topPlace = topOf(placeCounts);
  const topCoChar = topOf(coCharCounts);
  const first = related[0];
  return {
    count: related.length,
    seasons: seasonSet,
    topPlace: topPlace ? DATA.places[topPlace[0]] : null,
    topCoChar: topCoChar ? DATA.characters[topCoChar[0]] : null,
    topCoCharId: topCoChar ? topCoChar[0] : null,
    first
  };
}
function placeStats(id){
  const related = allEventsFlat().filter(x=>x.event.place===id);
  const seasonSet = [...new Set(related.map(r=>r.season.code))];
  const charCounts = {};
  related.forEach(r=>r.event.chars.forEach(cid=>{ charCounts[cid]=(charCounts[cid]||0)+1; }));
  const topOf = obj => Object.entries(obj).sort((a,b)=>b[1]-a[1])[0];
  const topChar = topOf(charCounts);
  return {
    count: related.length,
    seasons: seasonSet,
    topChar: topChar ? DATA.characters[topChar[0]] : null,
    topCharId: topChar ? topChar[0] : null
  };
}
function initials(name){
  return name.split(" ").filter(w=>w[0]===w[0].toUpperCase()).slice(0,2).map(w=>w[0]).join("").slice(0,2) || name.slice(0,2);
}
function avatarInner(c){
  if(c.photo) return `<img src="${c.photo}" alt="${escapeHtml(c.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">`;
  return initials(c.name);
}
function getPhotos(c){
  if(Array.isArray(c.photos) && c.photos.length) return c.photos;
  if(c.photoLarge) return [c.photoLarge];
  return [];
}
function cyclePhoto(imgEl){
  const id = imgEl.dataset.id;
  const c = DATA.characters[id];
  if(!c) return;
  const photos = getPhotos(c);
  if(photos.length < 2) return;
  const idx = parseInt(imgEl.dataset.idx, 10);
  const nextIdx = (idx + 1) % photos.length;
  imgEl.classList.add("portrait-flip-out");
  setTimeout(()=>{
    imgEl.src = photos[nextIdx];
    imgEl.dataset.idx = nextIdx;
    imgEl.classList.remove("portrait-flip-out");
    imgEl.classList.add("portrait-flip-in");
    setTimeout(()=>imgEl.classList.remove("portrait-flip-in"), 420);
    const frame = imgEl.closest(".portrait-frame");
    const dots = frame ? frame.querySelectorAll(".photo-dot") : [];
    dots.forEach((d,i)=>d.classList.toggle("active", i===nextIdx));
  }, 240);
}
function renderContent(content){
  return content.map(seg=>{
    if(seg.t==="text") return escapeHtml(seg.v);
    if(seg.t==="char"){
      const c=DATA.characters[seg.id]; if(!c) return "";
      return `<span class="tag-char" onclick="event.stopPropagation();navigateTo('character','${seg.id}')">${escapeHtml(c.name)}</span>`;
    }
    if(seg.t==="place"){
      const p=DATA.places[seg.id]; if(!p) return "";
      return `<span class="tag-place" onclick="event.stopPropagation();navigateTo('place','${seg.id}')">${escapeHtml(p.name)}</span>`;
    }
    return "";
  }).join("");
}
function escapeHtml(s){const d=document.createElement("div");d.textContent=(s===null||s===undefined)?"":String(s);return d.innerHTML;}

/* An event can carry photos (e.images[], or legacy single e.image) and/or a video (e.video). */
function getEventMedia(e){
  const media = [];
  (Array.isArray(e.images) && e.images.length ? e.images : (e.image ? [e.image] : []))
    .forEach(src=>media.push({type:"image", src}));
  if(e.video) media.push({type:"video", src:e.video});
  return media;
}
/* Multiple items render as a fanned strip of polaroids instead of one — same card, same
   frame, just more of them. */
function renderMediaItems(media, e, place){
  const cap = `${place?escapeHtml(place.name):"lugar sin registrar"} · ${escapeHtml(e.date)}`;
  const items = media.map((m,i)=>{
    const rot = (i%2===0? -1.4 : 1.6) * (1 + (i%2));
    const frame = m.type==="video"
      ? `<div class="frame"><video controls playsinline preload="metadata" src="${escapeHtml(m.src)}"></video></div>`
      : `<div class="frame" style="background:url('${escapeHtml(m.src)}') center/cover no-repeat"></div>`;
    return `<div class="polaroid" style="--rot:${rot}deg">${frame}<div class="cap">${cap}</div></div>`;
  }).join("");
  return media.length>1 ? `<div class="polaroid-stack">${items}</div>` : items;
}
function renderPlacePlate(e, place){
  return `<div class="place-plate"${e.place?` onclick="navigateTo('place','${e.place}')"`:""}>
             <span class="pp-icon">${place?place.icon:"✧"}</span>
             <span class="pp-name">${place?escapeHtml(place.name):"Lugar sin registrar"}</span>
           </div>`;
}
/* No media at all falls back to the place-plate, full width: a real place plate reads as
   finished design, whereas an empty polaroid frame reads as a missing asset.
   With media, the card splits into two columns - copy and media - and which side each
   sits on flips with the card: media always faces the timeline spine (the side the node-dot
   connects to), copy always faces the outer margin. So a left-side card reads copy-then-media
   and a right-side card reads media-then-copy, mirroring each other across the spine. */
function renderEventBody(e, place, side){
  const media = getEventMedia(e);
  const tagsHtml = `<div class="event-tags">
        ${e.chars.map(cid=>DATA.characters[cid]?`<span class="chip-small">${escapeHtml(DATA.characters[cid].name)}</span>`:"").join("")}
      </div>`;
  if(!media.length){
    return `${renderPlacePlate(e, place)}
      <div class="story-text">${renderContent(e.content)}</div>
      ${tagsHtml}`;
  }
  const mediaHtml = `<div class="event-media">${renderMediaItems(media, e, place)}</div>`;
  const copyHtml = `<div class="event-copy"><div class="story-text">${renderContent(e.content)}</div>${tagsHtml}</div>`;
  return `<div class="event-split">${side==="left" ? copyHtml+mediaHtml : mediaHtml+copyHtml}</div>`;
}
function navigateTo(view,id){ location.hash = `#/${view}/${id}`; }

/* =========================== render: NAV STRIP =========================== */
function renderSeasonsStrip(activeId){
  const strip=document.getElementById("seasonsStrip");
  let html = `<button data-s="home" class="${activeId===undefined?'active':''}" onclick="location.hash='#/home'">Inicio</button>`;
  DATA.seasons.forEach(s=>{
    html+=`<button data-s="${s.id}" class="${activeId===s.id?'active':''}" onclick="location.hash='#/season/${s.id}'">${s.code}</button>`;
  });
  strip.innerHTML = html;
}

/* =========================== render: HOME =========================== */
function viewHome(){
  renderSeasonsStrip(undefined);
  const app=document.getElementById("app");

  // Hand-arranged constellation layout (percent coordinates) — not a circle, like a scattered star chart.
  // Two layouts: a wide scatter for the 16:9 desktop box, a tall serpentine for the 3:4 mobile box
  // (stretching one set of points across both boxes made the lines steep and chunky on narrow screens).
  const isNarrow = window.matchMedia("(max-width:600px)").matches;
  const CONSTELLATION_POS = isNarrow ? [
    {x:32, y:7},  {x:74, y:19}, {x:22, y:36},
    {x:70, y:52}, {x:26, y:68}, {x:66, y:85}
  ] : [
    {x:7,  y:68}, {x:23, y:26}, {x:40, y:52},
    {x:59, y:15}, {x:76, y:44}, {x:94, y:22}
  ];
  const ARMAGEDDON_POS = isNarrow ? {x:50, y:96} : {x:96, y:88};

  // The star nodes are plain positioned divs (left/top %), so they don't care about the
  // svg's own coordinate system - but the connecting <path>s do. A 100x100 viewBox stretched
  // non-uniformly onto a 16:9 (or 3:4) box via preserveAspectRatio="none" used to make the
  // *visual* curve line up with the divs, but it also meant path-length-based math (the dash
  // draw-in below) was computed in a squashed space that didn't match the rendered geometry -
  // stroke-dasharray/getTotalLength() and vector-effect:non-scaling-stroke disagreed about
  // what "the whole line" meant, so the draw-in animation stalled a few percent in. Building
  // the viewBox in the box's real aspect ratio (and rescaling only the Y going into the path
  // data) keeps the scale uniform, so both agree again.
  const vbH = isNarrow ? 100 * (4/3) : 100 * (9/16);
  const toVB = p => ({x:p.x, y:p.y*vbH/100});

  // gentle arcs instead of straight zigzag segments, alternating bow direction, colored by a
  // gradient between each pair of season colors
  const linesSvg = DATA.seasons.slice(1).map((s,i)=>{
    const a = toVB(CONSTELLATION_POS[i]), b = toVB(CONSTELLATION_POS[i+1]);
    const prev = DATA.seasons[i];
    const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
    const dx = b.x-a.x, dy = b.y-a.y;
    const bow = (i%2===0? 1 : -1) * 6;
    const len = Math.hypot(dx,dy) || 1;
    const cx = mx + (-dy/len)*bow, cy = my + (dx/len)*bow;
    const gid = `seg-grad-${i}`;
    return `<defs><linearGradient id="${gid}" x1="${a.x}%" y1="${a.y}%" x2="${b.x}%" y2="${b.y}%">
        <stop offset="0%" stop-color="${prev.color}" stop-opacity=".55"/>
        <stop offset="100%" stop-color="${s.color}" stop-opacity=".55"/>
      </linearGradient></defs>
      <path class="constellation-line" data-idx="${i}" stroke="url(#${gid})" d="M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}"></path>`;
  }).join("");

  const microStars = Array.from({length:26}, (_,i)=>{
    const x = (i*37.4113) % 100, y = (i*61.803) % 100;
    const size = (2 + (i%5)*0.7).toFixed(1);
    const delay = (i*0.71) % 4.5;
    return `<div class="micro-star" style="left:${x}%; top:${y}%; width:${size}px; height:${size}px; animation-delay:${delay}s"></div>`;
  }).join("");

  const seasonNodesHtml = DATA.seasons.map((s,i)=>{
    const p = CONSTELLATION_POS[i] || {x:50,y:50};
    const bdelay = ((i*0.63) % 3.6).toFixed(2);
    const idelay = (0.55 + i*0.13).toFixed(2);
    return `<div class="star-node ${s.id===0?'s0':''}" data-nodeidx="${i}" style="left:${p.x}%; top:${p.y}%; --pcolor:${s.color}; --bdelay:${bdelay}s; --idelay:${idelay}s" onclick="location.hash='#/season/${s.id}'">
      <div class="star-dot"><i class="ray ray-h"></i><i class="ray ray-v"></i><i class="core"></i></div>
      <div class="star-code" style="color:${s.color}">${s.code}</div>
      <div class="star-label">${escapeHtml(s.title)}</div>
    </div>`;
  }).join("");

  const armageddonIdelay = (0.55 + DATA.seasons.length*0.13 + 0.2).toFixed(2);
  const armageddonNode = `<div class="star-node armageddon-node" style="left:${ARMAGEDDON_POS.x}%; top:${ARMAGEDDON_POS.y}%; --idelay:${armageddonIdelay}s" onclick="location.hash='#/armageddon'">
    <div class="star-dot"><i class="core"></i></div>
    <div class="star-code">†</div>
    <div class="star-label">armagedón</div>
  </div>`;

  const castCard = ([id,c])=>`
    <div class="cast-card" onclick="navigateTo('character','${id}')">
      <div class="cast-avatar" style="background:${c.photo?'transparent':c.color}; overflow:hidden;">${avatarInner(c)}</div>
      <div class="cname">${escapeHtml(c.name)}</div>
      <div class="crole">${escapeHtml(c.role)}</div>
      <div class="tier-badge tier-${c.tier==='secundario'?'sec':'pri'}">${c.tier==='secundario'?'Secundario':'Primario'}</div>
    </div>`;
  const entries = Object.entries(DATA.characters);
  const primaryHtml = entries.filter(([,c])=>c.tier!=='secundario').map(castCard).join("");
  const secondaryHtml = entries.filter(([,c])=>c.tier==='secundario').map(castCard).join("");

  const placesHtml = Object.entries(DATA.places).map(([id,p])=>`
    <div class="place-card" onclick="navigateTo('place','${id}')">
      <span class="picon">${p.icon}</span>
      <div class="pname">${escapeHtml(p.name)}</div>
      <div class="pdesc">${escapeHtml(p.desc)}</div>
    </div>`).join("");

  // the hero's "ignite" entrance only plays once per browser session, and never under
  // prefers-reduced-motion - a returning visit (or a second trip back to #/home) just
  // renders the final state directly instead of replaying the reveal
  const INTRO_KEY = "ychHeroIntroPlayed";
  let playIntro = false;
  try{
    playIntro = !sessionStorage.getItem(INTRO_KEY) && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }catch(e){ playIntro = false; }

  app.innerHTML = `
  <section class="hero${playIntro?' intro-play':''}">
    <div class="hero-copy">
      <div class="eyebrow">La crónica de un grupo de amigos</div>
      <h1>Yoshe con <em>Hoyo</em></h1>
      <p class="tag">Cinco temporadas (y una S0) de historias, viajes y desastres compartidos.
      Elige una estrella para caer dentro de esa temporada.</p>
    </div>
    <div class="constellation-wrap">
      <div class="constellation-tilt" id="constellationTilt">
        <svg id="constellationSvg" viewBox="0 0 100 ${vbH.toFixed(3)}" preserveAspectRatio="none">${linesSvg}</svg>
        ${microStars}${seasonNodesHtml}${armageddonNode}
      </div>
    </div>
    <div class="scroll-cue">Explora el elenco y los lugares<div class="chevron"></div></div>
  </section>

  <section class="section-wrap">
    <div class="section-head">
      <div class="eyebrow">Elenco · principales</div>
      <h2>Los personajes</h2>
    </div>
    <div class="grid-cast reveal-stagger">${primaryHtml}</div>
  </section>

  <section class="section-wrap" style="padding-top:0;">
    <div class="section-head">
      <div class="eyebrow">Elenco · secundarios</div>
      <h2>Apariciones especiales</h2>
    </div>
    <div class="grid-cast reveal-stagger">${secondaryHtml || '<div style="color:var(--ink-dim); font-size:.9rem;">Todavía no hay personajes secundarios.</div>'}</div>
  </section>

  <section class="section-wrap">
    <div class="section-head">
      <div class="eyebrow">Escenarios</div>
      <h2>Los lugares</h2>
    </div>
    <div class="grid-places reveal-stagger">${placesHtml}</div>
  </section>

  <footer class="site-footer reveal">Yoshe con Hoyo · una crónica en construcción · S0 → S5</footer>
  `;

  if(playIntro){ try{ sessionStorage.setItem(INTRO_KEY, "1"); }catch(e){} }
  setupConstellationFX();
  setupReveals();
}

// lines fade in one after another on first appearance, and glow along the pair connected
// to whichever season star you're hovering - both purely visual, both skipped under
// prefers-reduced-motion (the paths just render fully drawn, hover highlight still works
// since it's an instant class toggle, not an animation).
// NOTE: this used to be a stroke-dasharray "hand drawn" reveal, but Chromium's dash-pattern
// layout for vector-effect:non-scaling-stroke paths doesn't match what getTotalLength()
// reports once any scale transform is involved (confirmed by testing: the exact same
// dasharray/dashoffset values render a full line with non-scaling-stroke off, and a few
// percent of it with non-scaling-stroke on) - so the "on" dash only ever covered the first
// few percent of each curve, never the whole line. A plain fade sidesteps the bug entirely.
function setupConstellationFX(){
  const svg = document.getElementById("constellationSvg");
  const wrap = document.querySelector(".constellation-wrap");
  if(!svg || !wrap) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const paths = Array.from(svg.querySelectorAll(".constellation-line"));

  if(!reduced && paths.length){
    paths.forEach((p,i)=>{
      p.style.opacity = "0";
      p.style.transition = `opacity .85s ease ${(i*0.12).toFixed(2)}s, stroke-width .25s, filter .25s`;
    });
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(en=>{
        if(en.isIntersecting){
          paths.forEach(p=>{ p.style.opacity = "1"; });
          io.disconnect();
        }
      });
    }, {threshold:0.3});
    io.observe(wrap);
  }

  wrap.querySelectorAll(".star-node[data-nodeidx]").forEach(node=>{
    const idx = Number(node.dataset.nodeidx);
    const related = svg.querySelectorAll(`.constellation-line[data-idx="${idx-1}"], .constellation-line[data-idx="${idx}"]`);
    node.addEventListener("mouseenter", ()=> related.forEach(p=>p.classList.add("line-hot")));
    node.addEventListener("mouseleave", ()=> related.forEach(p=>p.classList.remove("line-hot")));
  });
}

/* =========================== render: SEASON =========================== */
function viewSeason(id){
  const s = DATA.seasons.find(x=>String(x.id)===String(id));
  renderSeasonsStrip(s?s.id:undefined);
  const app=document.getElementById("app");
  if(!s){ app.innerHTML = `<div class="section-wrap">Temporada no encontrada.</div>`; return; }

  const seasonHeroHtml = `
    <section class="season-hero" style="--scolor:${s.color}">
      <div class="scode-big">${s.code}</div>
      <h1>${escapeHtml(s.title)}</h1>
      <p class="hito">${escapeHtml(s.hito)}</p>
      ${isPending(s.hito) ? "" : `<div class="hito-badge">Hito de inicio · ${escapeHtml(firstSentence(s.hito))}</div>`}
      <div class="edit-only-btn edit-row">
        <button class="back-btn" style="margin:0;" onclick="openSeasonMetaModal('${s.id}')">✏️ Editar título/hito</button>
        <button class="back-btn" style="margin:0;" onclick="openAddEventModal('${s.id}')">➕ Agregar historia</button>
      </div>
    </section>`;

  if(!s.events.length){
    app.innerHTML = seasonHeroHtml + `
    <div class="season-empty reveal">
      <div class="empty-orbit" style="--scolor:${s.color}"><span></span><span></span><span></span></div>
      <h3>Esta temporada todavía está por escribirse</h3>
      <p>No hay historias cargadas para ${escapeHtml(s.code)} — ${escapeHtml(s.title)}.
         Cuéntamelas y las agrego al timeline.</p>
      <div class="empty-actions">
        <div class="back-btn" style="margin:0;" onclick="location.hash='#/'">← Volver a la constelación</div>
      </div>
    </div>`;
    setupReveals();
    return;
  }
  const eventsHtml = s.events.map((e,idx)=>{
    const side = idx%2===0 ? "left" : "right";
    const place = DATA.places[e.place];
    const rot = (idx%2===0? -1 : 1) * (1 + (idx%3));
    return `
    <div class="event ${side}" id="event-${s.id}-${idx}" data-idx="${idx}" style="--rot:${rot}deg">
      <div class="node-dot" style="border-color:${s.color}"></div>
      <div class="edate">${escapeHtml(e.date)} · ${s.code}</div>
      <h3>${escapeHtml(e.title)}</h3>
      ${renderEventBody(e, place, side)}
    </div>`;
  }).join("");

  app.innerHTML = seasonHeroHtml + `
    <div class="timeline" id="timeline">
      <div class="tl-progress" id="tlProgress" style="background:linear-gradient(to bottom, ${s.color}, var(--violet))"></div>
      ${eventsHtml}
    </div>
  `;
  setupScrollReveal();
  setupTimelineProgress();
  setupReveals();
}

/* Placeholder copy in DATA is written as a prompt to the user ("Cuéntame...", "— algo
   pendiente —"). Views use this to decide whether to render a field at all, instead of
   showing the prompt dressed up as if it were real content. */
function isPending(text){
  if(!text) return true;
  const t = String(text).trim().toLowerCase();
  return t.startsWith("cuéntame") || t.startsWith("cuentame") || t.startsWith("—") || t.startsWith("-");
}
function firstSentence(text){
  const t = String(text||"").trim();
  const cut = t.split(/(?<=\.)\s/)[0] || t;
  return cut.length > 120 ? cut.slice(0,117)+"…" : cut;
}

function setupScrollReveal(){
  const items=document.querySelectorAll(".event");
  const obs = new IntersectionObserver((entries)=>{
    entries.forEach(en=>{ if(en.isIntersecting) en.target.classList.add("visible"); });
  }, {threshold:0.18});
  items.forEach(it=>obs.observe(it));
}

/* Generic entrance-on-scroll for anything tagged .reveal / .reveal-stagger. Called at the end
   of every view render. Children of a .reveal-stagger get an increasing transition-delay so
   grids cascade in rather than all snapping at once. Reduced motion short-circuits to visible. */
function setupReveals(root){
  const scope = root || document;
  const nodes = scope.querySelectorAll(".reveal, .reveal-stagger, .section-head");
  if(!nodes.length) return;
  // .reveal starts at opacity:0, so anything that stops the observer from running would
  // leave the page permanently blank below the hero. Reduced motion and missing
  // IntersectionObserver both fall through to "just show everything".
  if(typeof IntersectionObserver === "undefined" ||
     window.matchMedia("(prefers-reduced-motion: reduce)").matches){
    nodes.forEach(n=>n.classList.add("is-in"));
    return;
  }
  scope.querySelectorAll(".reveal-stagger").forEach(g=>{
    Array.from(g.children).forEach((ch,i)=>{
      ch.style.transitionDelay = Math.min(i*55, 520)+"ms";
    });
  });
  const obs = new IntersectionObserver((entries)=>{
    entries.forEach(en=>{
      if(en.isIntersecting){ en.target.classList.add("is-in"); obs.unobserve(en.target); }
    });
  }, {threshold:0.12, rootMargin:"0px 0px -8% 0px"});
  nodes.forEach(n=>obs.observe(n));
}
function setupTimelineProgress(){
  const tl=document.getElementById("timeline");
  const bar=document.getElementById("tlProgress");
  if(!tl||!bar) return;
  function onScroll(){
    const rect=tl.getBoundingClientRect();
    const vh=window.innerHeight;
    const total = rect.height;
    const scrolled = Math.min(Math.max(vh*0.5 - rect.top, 0), total);
    bar.style.height = (scrolled/total*100)+"%";
  }
  window.addEventListener("scroll", onScroll, {passive:true});
  onScroll();
}

/* =========================== render: CHARACTER =========================== */
function viewCharacter(id){
  renderSeasonsStrip(undefined);
  const c = DATA.characters[id];
  const app=document.getElementById("app");
  if(!c){ app.innerHTML=`<div class="section-wrap">Personaje no encontrado.</div>`; return; }

  const related = allEventsFlat().filter(x=>x.event.chars.includes(id));
  const stats = characterStats(id);

  const statCards = `
    <div class="stat-cell"><div class="stat-num">${stats.count}</div><div class="stat-label">historia${stats.count===1?"":"s"}</div></div>
    <div class="stat-cell"><div class="stat-num">${stats.seasons.length}</div><div class="stat-label">temporada${stats.seasons.length===1?"":"s"}${stats.seasons.length?` (${stats.seasons.join(", ")})`:""}</div></div>
    ${stats.topPlace ? `<div class="stat-cell" data-clickable onclick="navigateTo('place','${Object.keys(DATA.places).find(k=>DATA.places[k]===stats.topPlace)}')"><div class="stat-num">${stats.topPlace.icon}</div><div class="stat-label">lugar frecuente: ${escapeHtml(stats.topPlace.name)}</div></div>` : ""}
    ${stats.topCoChar ? `<div class="stat-cell" data-clickable onclick="navigateTo('character','${stats.topCoCharId}')"><div class="stat-num">🤝</div><div class="stat-label">compañero frecuente: ${escapeHtml(stats.topCoChar.name)}</div></div>` : ""}
  `;

  const infoContent = `
      <h1>${escapeHtml(c.name)}</h1>
      ${c.apodo ? `<div class="apodo">"${escapeHtml(c.apodo)}"</div>` : ""}
      <div class="meta-row">
        <span class="role-chip">${escapeHtml(c.role)}</span>
        <span class="tier-badge tier-${c.tier==='secundario'?'sec':'pri'}">${c.tier==='secundario'?'Personaje secundario':'Personaje primario'}</span>
      </div>
      <p class="profile-bio">${escapeHtml(c.bio)}</p>
      ${c.habilidad ? `<div class="skill-card"><div class="skill-icon">⟡</div><div><div class="skill-label">Habilidad especial</div><div class="skill-value">${escapeHtml(c.habilidad)}</div></div></div>` : ""}
      ${c.frase ? `<blockquote class="quote-block">${escapeHtml(c.frase)}</blockquote>` : ""}
      <div class="profile-tags">${c.tags.map(t=>`<span class="chip-small">${escapeHtml(t)}</span>`).join("")}</div>
      <div class="stat-rail">${statCards}</div>
  `;

  const photos = getPhotos(c);

  app.innerHTML = `
    <div class="back-btn" onclick="history.back()">← Volver</div>
    <button class="back-btn edit-only-btn" style="margin-left:8px;" onclick="openCharEditModal('${id}')">✏️ Editar personaje</button>
    ${photos.length ? `
    <section class="profile-hero-split" style="--pcolor:${c.color}">
      <div class="hero-wash"></div>
      <div class="info-side">${infoContent}</div>
      <div class="portrait-side">
        <div class="portrait-frame">
          <div class="portrait-glow"></div>
          <div class="frame-corner tl"></div>
          <div class="frame-corner tr"></div>
          <div class="frame-corner bl"></div>
          <div class="frame-corner br"></div>
          <img class="portrait-img" src="${photos[0]}" alt="${escapeHtml(c.name)}" data-id="${id}" data-idx="0" onclick="cyclePhoto(this)" title="${photos.length>1?'Toca para ver más fotos':''}">
          ${photos.length>1 ? `<div class="photo-dots">${photos.map((_,i)=>`<span class="photo-dot${i===0?' active':''}"></span>`).join("")}</div>` : ""}
        </div>
      </div>
    </section>
    ` : `
    <section class="profile-hero" style="--pcolor:${c.color}">
      <div class="hero-wash"></div>

      <div class="profile-avatar" style="background:${c.photo?'transparent':c.color}; overflow:hidden;">${avatarInner(c)}</div>
      ${infoContent}
    </section>
    `}    <section class="related-stories">
      <div class="dossier-eyebrow" style="--pcolor:${c.color}">Bitácora</div>
      <h2>Historias que involucran a ${escapeHtml(c.name.split(" ")[0])}</h2>
      <div class="sub">${related.length} historia${related.length===1?"":"s"} registrada${related.length===1?"":"s"} en la crónica</div>
      ${related.map(r=>`
        <a class="story-link-card" href="#/season/${r.season.id}" onclick="setTimeout(()=>flashEvent(${r.season.id},${r.index}),60)">
          <div class="slc-top">
            <span class="slc-season" style="color:${r.season.color}">${r.season.code} · ${escapeHtml(r.season.title)}</span>
            <span class="slc-date">${escapeHtml(r.event.date)}</span>
          </div>
          <h4>${escapeHtml(r.event.title)}</h4>
          <p>${r.event.content.filter(s=>s.t==="text").map(s=>s.v).join("").slice(0,140)}…</p>
        </a>
      `).join("")}
    </section>
  `;
  setupReveals();
}

/* =========================== render: PLACE =========================== */
function viewPlace(id){
  renderSeasonsStrip(undefined);
  const p = DATA.places[id];
  const app=document.getElementById("app");
  if(!p){ app.innerHTML=`<div class="section-wrap">Lugar no encontrado.</div>`; return; }

  const related = allEventsFlat().filter(x=>x.event.place===id);
  const stats = placeStats(id);

  const statCards = `
    <div class="stat-cell"><div class="stat-num">${stats.count}</div><div class="stat-label">historia${stats.count===1?"":"s"}</div></div>
    <div class="stat-cell"><div class="stat-num">${stats.seasons.length}</div><div class="stat-label">temporada${stats.seasons.length===1?"":"s"}${stats.seasons.length?` (${stats.seasons.join(", ")})`:""}</div></div>
    ${stats.topChar ? `<div class="stat-cell" data-clickable onclick="navigateTo('character','${stats.topCharId}')"><div class="stat-num">⭐</div><div class="stat-label">quien más lo frecuenta: ${escapeHtml(stats.topChar.name)}</div></div>` : ""}
  `;

  app.innerHTML = `
    <div class="back-btn" onclick="history.back()">← Volver</div>
    <button class="back-btn edit-only-btn" style="margin-left:8px;" onclick="openPlaceEditModal('${id}')">✏️ Editar lugar</button>
    <section class="profile-hero" style="--pcolor:var(--teal)">
      <div class="hero-wash"></div>
      <div class="profile-avatar" style="background:linear-gradient(135deg, var(--teal), var(--violet)); font-size:2.2rem;">${p.icon}</div>
      <h1>${escapeHtml(p.name)}</h1>
      <div class="meta-row"><span class="role-chip">Lugar</span></div>
      <p class="profile-bio">${escapeHtml(p.desc)}</p>
      <div class="stat-rail">${statCards}</div>
    </section>
    <section class="related-stories">
      <div class="dossier-eyebrow" style="--pcolor:var(--teal)">Bitácora</div>
      <h2>Historias ocurridas en ${escapeHtml(p.name)}</h2>
      <div class="sub">${related.length} historia${related.length===1?"":"s"} registrada${related.length===1?"":"s"} en la crónica</div>
      ${related.map(r=>`
        <a class="story-link-card" href="#/season/${r.season.id}" onclick="setTimeout(()=>flashEvent(${r.season.id},${r.index}),60)">
          <div class="slc-top">
            <span class="slc-season" style="color:${r.season.color}">${r.season.code} · ${escapeHtml(r.season.title)}</span>
            <span class="slc-date">${escapeHtml(r.event.date)}</span>
          </div>
          <h4>${escapeHtml(r.event.title)}</h4>
          <p>${r.event.content.filter(s=>s.t==="text").map(s=>s.v).join("").slice(0,140)}…</p>
        </a>
      `).join("")}
    </section>
  `;
  setupReveals();
}

/* =========================== render: MAPA DE RELACIONES =========================== */
/* =========================== render: ARMAGEDDON =========================== */
function viewArmageddon(){
  renderSeasonsStrip(undefined);
  const app=document.getElementById("app");
  const a = DATA.armageddon;
  const primaryChars = Object.entries(DATA.characters).filter(([,c])=>c.tier!=='secundario');

  const cardsHtml = primaryChars.map(([id,c])=>`
    <div class="epitaph-card" onclick="navigateTo('character','${id}')">
      <div class="ename">${escapeHtml(c.name)}</div>
      <div class="edestino ${c.destino?'':'pending'}">${c.destino?escapeHtml(c.destino):'Destino aún sin escribir…'}</div>
    </div>
  `).join("");

  app.innerHTML = `
    <div class="back-btn" onclick="history.back()">← Volver</div>
    <button class="back-btn edit-only-btn" style="margin-left:8px;" onclick="openArmageddonModal()">✏️ Editar profecía</button>
    <section class="armageddon-hero">
      <div class="wash"></div>
      <div class="eyebrow">Capítulo final</div>
      <h1>ARMAGEDÓN</h1>
      <p class="prophecy">${escapeHtml(a.intro)}</p>
    </section>
    <div class="section-wrap" style="padding-top:60px;">
      <div class="section-head">
        <div class="eyebrow" style="color:#ff5252;">El destino de cada uno</div>
        <h2>¿Cómo termina cada integrante?</h2>
      </div>
      <div class="armageddon-grid reveal-stagger">${cardsHtml}</div>
    </div>
  `;
  setupReveals();
}
function openArmageddonModal(){
  openModal(`
    <h3>Editar la profecía</h3>
    <label>Cómo termina la historia del grupo</label>
    <textarea id="f_armageddon_intro">${escapeHtml(DATA.armageddon.intro||"")}</textarea>
    <div class="modal-actions">
      <button onclick="closeModal()">Cancelar</button>
      <button class="primary" onclick="submitArmageddonEdit()">Guardar</button>
    </div>
  `);
}
function submitArmageddonEdit(){
  patchArmageddon({ intro: document.getElementById("f_armageddon_intro").value });
  closeModal(); render();
}

function viewMap(){
  renderSeasonsStrip(undefined);
  const app=document.getElementById("app");
  const ids = Object.keys(DATA.characters);
  const n = ids.length;
  const cx=300, cy=300, r=230;
  const pos = {};
  ids.forEach((id,i)=>{
    const angle = (i/n)*2*Math.PI - Math.PI/2;
    pos[id] = { x: cx + r*Math.cos(angle), y: cy + r*Math.sin(angle) };
  });

  // co-occurrence weights
  const weights = {};
  allEventsFlat().forEach(r=>{
    const chars = r.event.chars;
    for(let i=0;i<chars.length;i++){
      for(let j=i+1;j<chars.length;j++){
        const key = [chars[i],chars[j]].sort().join("|");
        weights[key] = (weights[key]||0)+1;
      }
    }
  });

  // edges are drawn behind the nodes, brightest where two people share the most stories,
  // and each one animates its dash pattern so the network reads as alive rather than a
  // static wire diagram
  const maxW = Math.max(1, ...Object.values(weights));
  const edgesSvg = Object.entries(weights).map(([key,w],i)=>{
    const [a,b] = key.split("|");
    if(!pos[a]||!pos[b]) return "";
    const strength = w/maxW;
    return `<line class="map-edge" x1="${pos[a].x}" y1="${pos[a].y}" x2="${pos[b].x}" y2="${pos[b].y}"
      data-a="${a}" data-b="${b}"
      stroke-width="${(0.7+strength*2.4).toFixed(2)}"
      style="stroke-opacity:${(0.09+strength*0.26).toFixed(2)}; animation-delay:${(i*0.35).toFixed(2)}s"></line>`;
  }).join("");

  const nodesSvg = ids.map((id,i)=>{
    const c = DATA.characters[id];
    const p = pos[id];
    const rad = c.tier==="secundario" ? 13 : 19;
    return `
      <g class="map-node" data-id="${id}" onclick="navigateTo('character','${id}')" style="--ncolor:${c.color}; animation-delay:${(i*0.09).toFixed(2)}s">
        <circle class="map-node-halo" cx="${p.x}" cy="${p.y}" r="${rad+13}" fill="${c.color}"></circle>
        <circle class="map-node-circle" cx="${p.x}" cy="${p.y}" r="${rad}" fill="${c.color}"></circle>
        <circle class="map-node-shine" cx="${p.x-rad*0.3}" cy="${p.y-rad*0.32}" r="${rad*0.34}" fill="#fff"></circle>
        <text class="map-node-label" x="${p.x}" y="${p.y+rad+17}">${escapeHtml(c.name.split(" ")[0])}</text>
      </g>`;
  }).join("");

  const noEdges = Object.keys(weights).length===0;

  app.innerHTML = `
    <section class="season-hero" style="--scolor:var(--violet); border-bottom:none;">
      <div class="scode-big">Mapa</div>
      <h1>Red de relaciones</h1>
      <p class="hito">Quiénes han compartido más historias entre sí. El grosor y el brillo de la línea indican cuántas historias los conectan.</p>
    </section>
    <div class="map-wrap reveal">
      <div class="map-svg-wrap">
        <svg viewBox="0 0 600 600" width="100%" height="100%">
          ${edgesSvg}
          ${nodesSvg}
        </svg>
      </div>
      ${noEdges ? `<div class="map-legend">Todavía no hay suficientes historias con más de un personaje para trazar conexiones.</div>` : `<div class="map-legend">Pasa por encima de alguien para ver sus conexiones · toca para ir a su perfil.</div>`}
    </div>
  `;
  setupMapFX();
  setupReveals();
}

/* hovering a node dims every edge that doesn't touch it, so a single person's web of
   relationships pops out of the tangle */
function setupMapFX(){
  const wrap = document.querySelector(".map-svg-wrap");
  if(!wrap) return;
  const edges = Array.from(wrap.querySelectorAll(".map-edge"));
  const nodes = Array.from(wrap.querySelectorAll(".map-node"));
  nodes.forEach(node=>{
    const id = node.dataset.id;
    node.addEventListener("mouseenter", ()=>{
      wrap.classList.add("focusing");
      edges.forEach(e=>{
        const on = e.dataset.a===id || e.dataset.b===id;
        e.classList.toggle("edge-hot", on);
        e.classList.toggle("edge-dim", !on);
      });
      nodes.forEach(n=>{
        const linked = n===node || edges.some(e=>
          (e.dataset.a===id&&e.dataset.b===n.dataset.id) || (e.dataset.b===id&&e.dataset.a===n.dataset.id));
        n.classList.toggle("node-dim", !linked);
      });
    });
    node.addEventListener("mouseleave", ()=>{
      wrap.classList.remove("focusing");
      edges.forEach(e=>e.classList.remove("edge-hot","edge-dim"));
      nodes.forEach(n=>n.classList.remove("node-dim"));
    });
  });
}


function flashEvent(seasonId, idx){
  const el=document.getElementById(`event-${seasonId}-${idx}`);
  if(el){ el.scrollIntoView({behavior:"smooth", block:"center"}); el.classList.add("visible"); el.classList.add("flash");
    setTimeout(()=>el.classList.remove("flash"), 1700); }
}

/* =========================== ROUTER =========================== */
function render(){
  try{
    const hash = location.hash.replace(/^#\/?/,"");
    const parts = hash.split("/").filter(Boolean);
    window.scrollTo({top:0, behavior:"instant"});
    // Armagedón is the one view with its own (red) mood; everywhere else keeps the blue sky.
    document.body.classList.toggle("mood-doom", parts[0]==="armageddon");
    if(parts[0]==="season" && parts[1]!==undefined) viewSeason(parts[1]);
    else if(parts[0]==="character" && parts[1]!==undefined) viewCharacter(parts[1]);
    else if(parts[0]==="place" && parts[1]!==undefined) viewPlace(parts[1]);
    else if(parts[0]==="map") viewMap();
    else if(parts[0]==="armageddon") viewArmageddon();
    else viewHome();
    replayRouteAnimation();
  }catch(err){
    const app = document.getElementById("app");
    if(app){
      app.innerHTML = `<div class="section-wrap" style="text-align:center; padding-top:90px; color:var(--ink-dim);">
        <p>Algo no cargó bien en esta vista.</p>
        <p style="font-size:.85rem; opacity:.8;">Si estás viendo este archivo dentro de una vista previa (Quick Look, WhatsApp, Files, etc.), ábrelo directamente en Safari o Chrome — algunas vistas previas bloquean funciones que la página necesita.</p>
        <p class="mono" style="font-size:.7rem; opacity:.5; margin-top:18px;">${(err && err.message) ? String(err.message).replace(/[<>]/g,"") : "Error desconocido"}</p>
      </div>`;
    }
    if(window.console && console.error) console.error(err);
  }
}

// restart the route-entrance animation. Just re-adding the class does nothing while it's
// already applied (the animation is considered still running), so the class is removed and
// a reflow is forced before re-adding it.
function replayRouteAnimation(){
  const app = document.getElementById("app");
  if(!app) return;
  if(window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  app.classList.remove("route-in");
  void app.offsetWidth;
  app.classList.add("route-in");
}
window.addEventListener("hashchange", render);
(function(){
  // the constellation uses a different point layout above/below the 600px breakpoint
  // (see viewHome), so crossing it needs a re-render, not just a redraw of the same points
  let resizeTimer;
  const mq = window.matchMedia("(max-width:600px)");
  let wasNarrow = mq.matches;
  window.addEventListener("resize", ()=>{
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(()=>{
      const nowNarrow = mq.matches;
      const onHome = !location.hash || location.hash==="#/" || location.hash==="#/home";
      if(onHome && nowNarrow!==wasNarrow) viewHome();
      wasNarrow = nowNarrow;
    }, 200);
  });
})();

try{
  if(isEditOn()){
    document.body.classList.add("edit-on");
    const editBtn=document.getElementById("editToggleBtn"); if(editBtn) editBtn.classList.add("active");
  }
}catch(e){ /* ignore — edit mode simply stays off */ }

/* starfield background */
try{
(function starfield(){
  const c=document.getElementById("stars");
  const ctx=c.getContext("2d");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let stars=[], shots=[], dust=[];
  let rafId=null, lastT=0, shotCooldown=1.5+Math.random()*2.5;
  let dpr=1;

  // The canvas is a VIEWPORT-sized fixed layer sitting on top of the (also fixed) sky photo.
  // It used to be document-sized, which meant allocating a buffer several thousand px tall and
  // animating thousands of off-screen stars nobody could see. Viewport-sized costs a fraction
  // of that, and since the photo behind it is fixed too, nothing needs to scroll.
  // No procedural nebulae any more either: the photo brings far better nebula texture than
  // blurred canvas blobs could, and painting blobs over it only muddied the real thing.
  // The canvas now does what the photo can't - twinkle, drift, and shooting stars.

  function randomDrift(maxSpeed){
    const angle = Math.random()*Math.PI*2;
    const speed = maxSpeed * Math.pow(Math.random(), 2.2); // biased slow, a few fast outliers
    return { vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed };
  }

  // depth tiers: faint far dust, mid-field stars, and a few vivid near stars that carry a
  // 4-point glint. `par` is the parallax factor - nearer stars shift more as you scroll.
  function makeStar(){
    const roll = Math.random();
    let s;
    if(roll<0.56){
      s = { r:Math.random()*0.85+0.25, base:Math.random()*0.3+0.1, color:"178,205,235",
        glow:false, sparkle:false, speed:0.45+Math.random()*0.95, par:0.012,
        ...randomDrift(0.03) };
    } else if(roll<0.89){
      s = { r:Math.random()*1.05+0.55, base:Math.random()*0.42+0.34, color:"228,241,255",
        glow:false, sparkle:false, speed:0.55+Math.random()*1.2, par:0.03,
        ...randomDrift(0.042) };
    } else {
      s = { r:Math.random()*1.2+1.25, base:Math.random()*0.28+0.7, color:"186,232,255",
        glow:true, sparkle:Math.random()<0.45, speed:0.6+Math.random()*1.1, par:0.055,
        ...randomDrift(0.055) };
    }
    s.x = Math.random()*c.cssW; s.y = Math.random()*c.cssH;
    s.phase = Math.random()*Math.PI*2;
    return s;
  }

  function resize(){
    dpr = Math.min(window.devicePixelRatio||1, 2);
    c.cssW = window.innerWidth; c.cssH = window.innerHeight;
    c.width = Math.round(c.cssW*dpr); c.height = Math.round(c.cssH*dpr);
    c.style.width = c.cssW+"px"; c.style.height = c.cssH+"px";
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const area = c.cssW*c.cssH;
    const count = Math.min(560, Math.max(150, Math.round(area/2600)));
    stars = Array.from({length: count}, makeStar);
    // slow cosmic dust: a sparse near layer that parallaxes strongly, for a sense of travel
    dust = Array.from({length: Math.round(count*0.12)}, ()=>({
      x:Math.random()*c.cssW, y:Math.random()*c.cssH,
      r:Math.random()*0.7+0.3, a:Math.random()*0.16+0.05, par:0.11+Math.random()*0.09
    }));
    if(reduced) drawStatic();
  }

  function paintStar(s, a, ox, oy){
    const x = s.x+ox, y = s.y+oy;
    ctx.beginPath(); ctx.arc(x,y,s.r,0,Math.PI*2);
    ctx.fillStyle=`rgba(${s.color},${Math.max(0,a).toFixed(3)})`;
    if(s.glow){ ctx.shadowColor="rgba(150,215,255,.95)"; ctx.shadowBlur=10; } else { ctx.shadowBlur=0; }
    ctx.fill();
    ctx.shadowBlur=0;
    if(s.sparkle && a>0.34){
      const len = s.r*8*a;
      const grad = ctx.createRadialGradient(x,y,0,x,y,len);
      grad.addColorStop(0, `rgba(226,244,255,${(a*0.55).toFixed(3)})`);
      grad.addColorStop(1, "rgba(226,244,255,0)");
      ctx.save(); ctx.translate(x,y);
      ctx.strokeStyle=grad; ctx.lineWidth=0.9;
      ctx.beginPath(); ctx.moveTo(-len,0); ctx.lineTo(len,0);
      ctx.moveTo(0,-len); ctx.lineTo(0,len); ctx.stroke();
      ctx.restore();
    }
  }

  // single static frame for prefers-reduced-motion
  function drawStatic(){
    ctx.clearRect(0,0,c.cssW,c.cssH);
    stars.forEach(s=>paintStar(s,s.base,0,0));
  }

  function spawnShot(){
    // viewport coordinates now, so a shot is always somewhere the reader can actually see
    const edge = Math.floor(Math.random()*4);
    const spread = (Math.random()-0.5)*(Math.PI*0.6);
    let x,y,baseAngle;
    if(edge===0){ x=-30; y=Math.random()*c.cssH*0.95; baseAngle=0; }
    else if(edge===1){ x=c.cssW+30; y=Math.random()*c.cssH*0.95; baseAngle=Math.PI; }
    else if(edge===2){ x=Math.random()*c.cssW; y=-30; baseAngle=Math.PI/2; }
    else { x=Math.random()*c.cssW; y=c.cssH+30; baseAngle=-Math.PI/2; }
    const angle = baseAngle + spread;
    const speed = 520+Math.random()*380;
    shots.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:0,
      maxLife:0.8+Math.random()*0.5, hue:Math.random()<0.3?"196,236,255":"255,255,255"});
  }
  function maybeSpawnShot(dt){
    shotCooldown -= dt;
    if(shotCooldown>0) return;
    shotCooldown = 1.8+Math.random()*3.4;
    spawnShot();
    if(Math.random()<0.18) setTimeout(()=>{ if(shots.length<8) spawnShot(); }, 160+Math.random()*260);
  }

  function draw(t){
    const dt = lastT? Math.min((t-lastT)/1000, 0.08) : 0;
    lastT = t;
    const W=c.cssW, H=c.cssH;

    stars.forEach(s=>{
      s.x += s.vx; s.y += s.vy;
      if(s.x<-6) s.x=W+6; else if(s.x>W+6) s.x=-6;
      if(s.y<-6) s.y=H+6; else if(s.y>H+6) s.y=-6;
    });
    dust.forEach(d=>{ d.y += 0.05; if(d.y>H+4) d.y=-4; });

    maybeSpawnShot(dt||0.016);
    shots.forEach(sh=>{ sh.x+=sh.vx*dt; sh.y+=sh.vy*dt; sh.life+=dt; });
    shots = shots.filter(sh=> sh.life<sh.maxLife && sh.x>-90 && sh.x<W+90 && sh.y>-90 && sh.y<H+90);

    ctx.clearRect(0,0,W,H);

    // whole-sky slow pan, plus a scroll-linked parallax offset per depth tier
    const driftX = Math.sin(t*0.000022)*18;
    const driftY = Math.cos(t*0.000017)*12;
    const sy = window.scrollY || 0;

    dust.forEach(d=>{
      const y = d.y + driftY - sy*d.par;
      const yy = ((y % (H+8)) + (H+8)) % (H+8) - 4;
      ctx.beginPath(); ctx.arc(d.x+driftX, yy, d.r, 0, Math.PI*2);
      ctx.fillStyle=`rgba(200,224,255,${d.a})`; ctx.fill();
    });

    stars.forEach(s=>{
      const a = s.base*(0.34+0.66*Math.sin(t*0.0013*s.speed+s.phase));
      let oy = driftY - sy*s.par;
      // wrap the parallax offset so stars never march off the top of a long page
      const span = H+12;
      oy = ((oy % span) + span) % span;
      if(s.y+oy > H+6) oy -= span;
      paintStar(s, a, driftX, oy);
    });

    shots.forEach(sh=>{
      const p = sh.life/sh.maxLife;
      const fade = p<0.14 ? p/0.14 : 1-((p-0.14)/0.86);
      const tailX = sh.x - sh.vx*0.06, tailY = sh.y - sh.vy*0.06;
      const grad = ctx.createLinearGradient(tailX,tailY,sh.x,sh.y);
      grad.addColorStop(0, `rgba(${sh.hue},0)`);
      grad.addColorStop(1, `rgba(${sh.hue},${(0.92*fade).toFixed(3)})`);
      ctx.strokeStyle=grad; ctx.lineWidth=1.8; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(tailX,tailY); ctx.lineTo(sh.x,sh.y); ctx.stroke();
      const headGlow = ctx.createRadialGradient(sh.x,sh.y,0,sh.x,sh.y,12);
      headGlow.addColorStop(0, `rgba(255,255,255,${(0.75*fade).toFixed(3)})`);
      headGlow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle=headGlow;
      ctx.beginPath(); ctx.arc(sh.x,sh.y,12,0,Math.PI*2); ctx.fill();
    });

    rafId = requestAnimationFrame(draw);
  }

  function start(){ if(rafId===null){ lastT=0; rafId = requestAnimationFrame(draw); } }
  function stop(){ if(rafId!==null){ cancelAnimationFrame(rafId); rafId=null; } }

  let rt; window.addEventListener("resize", ()=>{ clearTimeout(rt); rt=setTimeout(resize,150); });
  document.addEventListener("visibilitychange", ()=>{
    if(reduced) return;
    if(document.hidden) stop(); else start();
  });
  resize(); if(!reduced) start();
})();
}catch(e){ /* decorative starfield failing should never block the app */ }

// One shared rAF loop for the scroll/pointer driven chrome: nav condensing, the hero
// receding as it scrolls away, and the constellation's pointer tilt. All cheap transform /
// class writes, no layout thrash. The star canvas is fixed and handles its own parallax
// internally, so it needs nothing here.
try{
  const heroReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = !heroReduced && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  let rafId = null;
  let targetTiltX = 0, targetTiltY = 0, tiltX = 0, tiltY = 0;
  let navCondensed = false;

  if(canHover){
    document.addEventListener("pointermove", (e)=>{
      const wrap = document.querySelector(".constellation-wrap");
      if(!wrap) return;
      const r = wrap.getBoundingClientRect();
      const px = (e.clientX - (r.left + r.width/2)) / (r.width/2 || 1);
      const py = (e.clientY - (r.top + r.height/2)) / (r.height/2 || 1);
      targetTiltX = Math.max(-1, Math.min(1, px)) * 13;
      targetTiltY = Math.max(-1, Math.min(1, py)) * 9;
    });
  }

  function tick(){
    const sy = window.scrollY || 0;

    const nav = document.querySelector("header.topnav");
    if(nav){
      const should = sy > 40;
      if(should !== navCondensed){ nav.classList.toggle("condensed", should); navCondensed = should; }
    }

    if(!heroReduced){
      const hero = document.querySelector(".hero");
      if(hero){
        const rect = hero.getBoundingClientRect();
        const span = rect.height || window.innerHeight;
        const progress = Math.min(1, Math.max(0, -rect.top/span));
        const wrap = hero.querySelector(".constellation-wrap");
        if(wrap){
          wrap.style.transform = `translateY(${(progress*54).toFixed(1)}px) scale(${(1-progress*0.07).toFixed(3)})`;
          wrap.style.opacity = (1 - progress*0.6).toFixed(3);
        }
        const copy = hero.querySelector(".hero-copy");
        if(copy){
          copy.style.transform = `translateY(${(progress*-26).toFixed(1)}px)`;
          copy.style.opacity = (1 - progress*0.85).toFixed(3);
        }
      }
      if(canHover){
        tiltX += (targetTiltX-tiltX)*0.08; tiltY += (targetTiltY-tiltY)*0.08;
        const tilt = document.getElementById("constellationTilt");
        if(tilt) tilt.style.transform = `translate(${tiltX.toFixed(2)}px, ${tiltY.toFixed(2)}px)`;
      }
    }
    rafId = requestAnimationFrame(tick);
  }
  function start(){ if(rafId===null) rafId = requestAnimationFrame(tick); }
  function stop(){ if(rafId!==null){ cancelAnimationFrame(rafId); rafId=null; } }
  document.addEventListener("visibilitychange", ()=>{ if(document.hidden) stop(); else start(); });
  start();
}catch(e){ /* decorative depth effects failing should never block the app */ }

render();
