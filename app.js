/* =========================================================================
   PERSISTENCIA LOCAL (modo edición)
   Los cambios hechos desde la página (bios, apodos, frases, habilidades,
   hitos, títulos y nuevos eventos) se guardan en localStorage del navegador
   y se re-aplican sobre DATA cada vez que se carga la página. No es una
   base de datos compartida: vive solo en este navegador/dispositivo.
   Usa "Exportar cambios" para respaldarlos o pasarlos a otro dispositivo.
   ========================================================================= */
const OV_KEY = "ychOverrides_v1";
// extraCharacters / extraPlaces: personas y lugares nuevos que aparecieron en una historia
// escrita desde el editor (con sus campos pendientes, como pide la convención de contenido)
const OV_EMPTY = ()=> ({characters:{}, places:{}, seasonMeta:{}, extraEvents:{}, armageddon:{}, extraCharacters:{}, extraPlaces:{}, extraHookups:[]});
function loadOverrides(){
  let ov = null;
  try{ ov = JSON.parse(localStorage.getItem(OV_KEY)); }catch(e){ ov = null; }
  // un respaldo de una versión anterior no trae las llaves nuevas: se completan
  return Object.assign(OV_EMPTY(), ov || {});
}
function saveOverrides(ov){ try{ localStorage.setItem(OV_KEY, JSON.stringify(ov)); }catch(e){ /* storage unavailable — edits won't persist across reloads in this context */ } }
// id corto y único para las historias escritas desde el editor (así se pueden editar y borrar)
const newUid = ()=> "h" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
function applyOverrides(){
  const ov = loadOverrides();
  let fixed = false;
  Object.entries(ov.extraCharacters||{}).forEach(([id,c])=>{ if(!DATA.characters[id]) DATA.characters[id] = Object.assign({}, c); });
  Object.entries(ov.extraPlaces||{}).forEach(([id,p])=>{ if(!DATA.places[id]) DATA.places[id] = Object.assign({}, p); });
  Object.entries(ov.characters||{}).forEach(([id,patch])=>{ if(DATA.characters[id]) Object.assign(DATA.characters[id], patch); });
  Object.entries(ov.places||{}).forEach(([id,patch])=>{ if(DATA.places[id]) Object.assign(DATA.places[id], patch); });
  Object.entries(ov.seasonMeta||{}).forEach(([sid,patch])=>{ const s=DATA.seasons.find(x=>String(x.id)===String(sid)); if(s) Object.assign(s, patch); });
  Object.entries(ov.extraEvents||{}).forEach(([sid,events])=>{
    const s=DATA.seasons.find(x=>String(x.id)===String(sid));
    events.forEach(e=>{
      // historias guardadas antes de que existiera el editor nuevo: se les da su id
      if(!e.uid){ e.uid = newUid(); e.local = true; fixed = true; }
      if(s) s.events.push(e);
    });
  });
  if(ov.armageddon) Object.assign(DATA.armageddon, ov.armageddon);
  // la red de besos: lo agregado en modo edición se suma a DATA.hookups
  if((ov.extraHookups||[]).length) DATA.hookups = (DATA.hookups||[]).concat(ov.extraHookups);
  if(fixed) saveOverrides(ov);
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
// Lo guardado en este navegador, como texto para pegarle a Claude en el chat y que quede en
// data.js para todos (el JSON de "Exportar" sirve igual, pero esto se lee y se pega directo)
function overridesAsText(){
  const ov = loadOverrides();
  const L = [];
  const charName = id=> (DATA.characters[id]||{}).name || id;
  const placeName = id=> (DATA.places[id]||{}).name || id;
  const evs = [];
  Object.entries(ov.extraEvents||{}).forEach(([sid, list])=> (list||[]).forEach(e=> evs.push([sid, e])));
  if(evs.length){
    L.push(`## Historias nuevas (${evs.length})`);
    evs.forEach(([sid, e])=>{
      const s = DATA.seasons.find(x=> String(x.id) === String(sid));
      L.push("", `### ${e.title}`, `- Temporada: ${s ? s.code + " · " + s.title : sid}`, `- Fecha: ${e.date || "—"}`,
        `- Lugar: ${e.place ? placeName(e.place) + " (" + e.place + ")" : "—"}`,
        `- Quiénes: ${(e.chars||[]).map(id=> charName(id) + " (" + id + ")").join(", ") || "—"}`, "", plainText(e.content));
    });
  }
  const nc = Object.entries(ov.extraCharacters||{}), np = Object.entries(ov.extraPlaces||{});
  if(nc.length) L.push("", `## Personas nuevas`, ...nc.map(([id,c])=> `- ${c.name} (${id})`));
  if(np.length) L.push("", `## Lugares nuevos`, ...np.map(([id,p])=> `- ${p.icon||""} ${p.name} (${id})`));
  const hk = ov.extraHookups||[];
  if(hk.length) L.push("", `## Red de besos (agregados)`, ...hk.map(h=> `- ${charName(h.a)} (${h.a}) y ${charName(h.b)} (${h.b}): ${(HOOK_KINDS[h.kind]||HOOK_KINDS.beso).label}${h.story ? ` — historia: ${h.story.title}` : ""}${h.note ? ` — nota: ${h.note}` : ""}`));
  const fields = (title, obj, nameOf)=>{
    const rows = Object.entries(obj||{}).filter(([,patch])=> patch && Object.keys(patch).length);
    if(!rows.length) return;
    L.push("", `## ${title}`);
    rows.forEach(([id, patch])=>{
      L.push(`- ${nameOf(id)} (${id}):`);
      Object.entries(patch).forEach(([k,v])=>{ if(k === "photo" && String(v).startsWith("data:")) v = "[foto subida desde el navegador]"; L.push(`  - ${k}: ${v === null ? "—" : String(v)}`); });
    });
  };
  fields("Cambios en personajes", ov.characters, charName);
  fields("Cambios en lugares", ov.places, placeName);
  fields("Cambios en temporadas", ov.seasonMeta, sid=>{ const s = DATA.seasons.find(x=> String(x.id) === String(sid)); return s ? s.code : sid; });
  if(ov.armageddon && Object.keys(ov.armageddon).length) L.push("", "## Armagedón", ...Object.entries(ov.armageddon).map(([k,v])=> `- ${k}: ${v}`));
  if(!L.length) return "";
  return ["Cambios hechos en el sitio Yoshe con Hoyo (modo edición), para agregarlos a data.js:", ""].concat(L).join("\n");
}
function copyForClaude(){
  const text = overridesAsText();
  if(!text){ showToast("No hay cambios guardados en este navegador todavía."); return; }
  const fallback = ()=> openModal(`<h3>Copiar para Claude</h3><p class="se-sub">Copia este texto y pégalo en el chat.</p>
    <textarea readonly style="min-height:320px; font-family:'JetBrains Mono',monospace; font-size:.74rem;" onfocus="this.select()">${escapeHtml(text)}</textarea>
    <div class="modal-actions"><button onclick="closeModal()">Listo</button></div>`);
  try{
    navigator.clipboard.writeText(text).then(()=> showToast("Copiado: pégalo en el chat con Claude."), fallback);
  }catch(e){ fallback(); }
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
    const text = r.event.title + " " + plainText(r.event.content);
    return text.toLowerCase().includes(query);
  });

  if(!charMatches.length && !placeMatches.length && !eventMatches.length){
    box.innerHTML = `<div class="search-empty">Sin resultados para "${escapeHtml(q)}"</div>`; return;
  }

  let html="";
  if(charMatches.length){
    html += `<div class="search-result-group"><h4>Personajes</h4>` + charMatches.map(([id,c])=>
      `<div class="search-result-item sri-person" onclick="toggleSearch();navigateTo('character','${id}')">
        ${faceHtml(id, {static:true})}<div><div class="srn">${escapeHtml(c.name)}</div><div class="srd">${c.apodo?`“${escapeHtml(c.apodo)}” · `:""}${characterStats(id).count} historias · ${c.tier==='secundario'?'aparición especial':'del grupo'}</div></div>
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
      `<div class="search-result-item" onclick="toggleSearch();location.hash='${storyHref(r.season.id, r.index)}'">
        <div class="srn">${escapeHtml(r.event.title)}</div><div class="srd"><span style="color:${r.season.color}">${r.season.code}</span> · ${escapeHtml(isPending(r.event.date)?"fecha pendiente":r.event.date)} — ${escapeHtml(excerpt(r.event.content, 90))}</div>
      </div>`).join("") + `</div>`;
  }
  box.innerHTML = html;
}

/* =========================== HISTORIA ALEATORIA =========================== */
function goRandomStory(){
  const all = allEventsFlat();
  if(!all.length){ alert("Todavía no hay historias cargadas."); return; }
  const pick = all[Math.floor(Math.random()*all.length)];
  const href = storyHref(pick.season.id, pick.index);
  // misma historia que la actual: el hash no cambia y no habría render; se destaca igual
  if(location.hash === href) flashEvent(pick.season.id, pick.index); else location.hash = href;
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
  const box = document.getElementById("modalBox");
  box.classList.remove("modal-wide");
  box.innerHTML = html;
  document.getElementById("modalOverlay").classList.add("active");
}
function closeModal(){
  document.getElementById("modalOverlay").classList.remove("active");
  document.getElementById("modalBox").classList.remove("modal-wide");
  SE = null;
}
// Esc cierra el modal; un clic afuera también, salvo en el editor de historias (ahí un clic
// perdido botaría lo que llevas escrito de una historia que estás corrigiendo)
document.addEventListener("keydown", e=>{
  if(e.key === "Escape" && document.getElementById("modalOverlay").classList.contains("active")){ e.stopPropagation(); closeModal(); }
}, true);
document.getElementById("modalOverlay").addEventListener("click", e=>{
  if(e.target.id === "modalOverlay" && !SE) closeModal();
});

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

/* =========================== EDITOR DE HISTORIAS =========================== */
// Escribir (o corregir) una historia desde la página. Lo que importa: no perder lo escrito
// (borrador autoguardado), que los nombres se marquen solos (autoTagText) y se vea cómo va a
// quedar antes de guardar, y que una persona o un lugar que todavía no existe se pueda agregar
// ahí mismo, con sus campos pendientes ("— rol pendiente —", "Cuéntame..."), como pide la
// convención de contenido. Todo queda en este navegador (overrides); "Exportar cambios" es el
// camino para que llegue al sitio de todos.
const DRAFT_KEY = "ychStoryDraft_v1";
const NEW_COLORS = ["#d9748a","#6b9bf2","#7fae6f","#e0b84f","#c9853f","#8b6bf2","#3f8c82","#f2a65a"];
let SE = null;   // el estado del editor abierto

function slugify(name){
  return String(name).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase()
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"") || "x";
}
function uniqueKey(base, taken){ let k = base, n = 2; while(taken[k]) k = `${base}-${n++}`; return k; }
function readDraft(){ try{ return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null; }catch(e){ return null; } }
function writeDraft(d){ try{ if(d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); else localStorage.removeItem(DRAFT_KEY); }catch(e){ /* sin storage: el borrador vive mientras el editor esté abierto */ } }
function findLocalEvent(uid){
  for(const s of DATA.seasons){ const i = s.events.findIndex(e=> e.uid === uid); if(i >= 0) return { season:s, index:i, event:s.events[i] }; }
  return null;
}

// la temporada que estás mirando (para el botón "Nueva historia" de la barra de edición);
// fuera de una temporada, la actual (la última)
function currentSeasonId(){
  const m = location.hash.match(/^#\/season\/([^/]+)/);
  if(m && DATA.seasons.some(s=> String(s.id) === m[1])) return m[1];
  return DATA.seasons[DATA.seasons.length-1].id;
}
// compatibilidad: los botones viejos llaman a openAddEventModal
function openAddEventModal(seasonId){ openStoryEditor(seasonId); }

function openStoryEditor(seasonId, uid){
  const found = uid ? findLocalEvent(uid) : null;
  const draft = !found ? readDraft() : null;
  const cur = DATA.seasons.find(x=> String(x.id) === String(seasonId)) || DATA.seasons[DATA.seasons.length-1];
  SE = found ? {
    uid, season: String(found.season.id), date: isPending(found.event.date) ? "" : (found.event.date||""), title: found.event.title||"",
    place: found.event.place||"", text: plainText(found.event.content), chars: found.event.chars.slice(),
    newPeople: [], newPlace: null, dismissed: [], placeTouched: true
  } : Object.assign({
    uid:null, season: String(cur.id), date:"", title:"", place:"", text:"", chars:[], newPeople:[], newPlace:null, dismissed:[], placeTouched:false
  }, draft || {});
  const hasDraft = !found && draft && (draft.text || draft.title);

  const seasonOpts = DATA.seasons.map(s=> `<option value="${s.id}" ${String(s.id)===SE.season?"selected":""}>${escapeHtml(s.code)} · ${escapeHtml(s.title)}</option>`).join("");
  openModal(`
    <div class="se">
      <h3>${found ? "Editar historia" : "Nueva historia"}</h3>
      <p class="se-sub">${found ? "Esta historia se escribió en este navegador: puedes corregirla o borrarla." : "Cuéntala como te salga; los nombres que el sitio conoce se marcan solos."}${hasDraft ? ` <button type="button" class="se-link" onclick="discardStoryDraft()">Descartar borrador</button>` : ""}</p>
      <div class="se-grid">
        <div><label for="se_season">Temporada</label><select id="se_season">${seasonOpts}</select></div>
        <div><label for="se_date">Fecha</label><input id="se_date" placeholder="ej: 14 de agosto de 2025" value="${escapeHtml(SE.date)}"></div>
      </div>
      <label for="se_title">Título</label><input id="se_title" placeholder="ej: La noche del asado" value="${escapeHtml(SE.title)}">
      <label for="se_text">La historia</label>
      <textarea id="se_text" rows="8" placeholder="Quiénes estaban, dónde, qué pasó y cómo terminó… Deja una línea en blanco para separar párrafos.">${escapeHtml(SE.text)}</textarea>
      <div class="se-hint">¿Falta un dato? Termina con <code>— Cuéntame más: …</code> y queda marcado como pendiente.</div>
      <label for="se_place">Lugar</label>
      <select id="se_place"></select>
      <div class="se-newplace" id="se_newplace" hidden>
        <input id="se_np_icon" maxlength="4" placeholder="📍" aria-label="Ícono del lugar (emoji)">
        <input id="se_np_name" placeholder="Nombre del lugar nuevo" aria-label="Nombre del lugar nuevo">
      </div>
      <label for="se_find">Quiénes estuvieron <span class="se-count" id="se_count"></span></label>
      <div class="se-people">
        <div class="se-chips" id="se_chips"></div>
        <input id="se_find" placeholder="Busca a alguien, o escribe un nombre nuevo…" autocomplete="off">
        <div class="se-suggest" id="se_suggest"></div>
      </div>
      <label>Así se va a ver</label>
      <div class="se-preview" id="se_preview"></div>
      <div class="se-error" id="se_error" role="alert"></div>
      <div class="modal-actions">
        ${found ? `<button type="button" class="danger se-del" onclick="deleteLocalStory()">Borrar</button>` : ""}
        <button type="button" onclick="closeStoryEditor()">Cancelar</button>
        <button type="button" class="primary" onclick="saveStoryEditor()">${found ? "Guardar cambios" : "Guardar historia"}</button>
      </div>
    </div>`);
  document.getElementById("modalBox").classList.add("modal-wide");

  const $ = id=> document.getElementById(id);
  const sync = ()=>{
    SE.season = $("se_season").value; SE.date = $("se_date").value; SE.title = $("se_title").value; SE.text = $("se_text").value;
    if(SE.newPlace){ SE.newPlace.icon = $("se_np_icon").value; SE.newPlace.name = $("se_np_name").value; }
  };
  let t = null;
  const changed = ()=>{
    sync();
    detectFromText();
    renderEditorPeople(); renderEditorPreview();
    if(!SE.uid){ clearTimeout(t); t = setTimeout(()=> writeDraft(draftOf()), 400); }
  };
  ["se_season","se_date","se_title","se_text","se_np_icon","se_np_name"].forEach(id=> $(id).addEventListener("input", changed));
  $("se_season").addEventListener("change", changed);
  $("se_place").addEventListener("change", ()=>{
    SE.placeTouched = true;
    const v = $("se_place").value;
    if(v === "__new"){ SE.newPlace = SE.newPlace || { icon:"", name:"" }; SE.place = ""; }
    else { SE.newPlace = null; SE.place = v; }
    renderEditorPlace(); changed();
    if(v === "__new") setTimeout(()=> $("se_np_name").focus(), 30);
  });
  $("se_find").addEventListener("input", renderEditorSuggest);
  $("se_find").addEventListener("keydown", e=>{
    if(e.key === "Enter"){ e.preventDefault(); const first = $("se_suggest").querySelector("button"); if(first) first.click(); }
  });
  renderEditorPlace(); detectFromText(); renderEditorPeople(); renderEditorSuggest(); renderEditorPreview();
  setTimeout(()=> (SE.text ? $("se_title") : $("se_text")).focus(), 60);
}
function draftOf(){ const d = Object.assign({}, SE); delete d.uid; return (d.text || d.title || d.date) ? d : null; }
function discardStoryDraft(){ writeDraft(null); const sid = SE && SE.season; closeStoryEditor(); openStoryEditor(sid); }
function closeStoryEditor(){ closeModal(); }

// los nombres que aparecen en el texto se suman solos a "quiénes estuvieron" (salvo que los
// hayas sacado a mano), y el primer lugar que aparece se elige solo si no tocaste el lugar
function detectFromText(){
  if(!SE) return;
  const segs = autoTagText(SE.text);
  segs.forEach(sg=>{
    if(sg.t === "char" && !SE.chars.includes(sg.id) && !SE.dismissed.includes(sg.id)) SE.chars.push(sg.id);
  });
  SE.newPeople.forEach(np=>{
    if(!np.inText && new RegExp(`(^|[^\\p{L}])${np.name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}([^\\p{L}]|$)`, "u").test(SE.text)) np.inText = true;
  });
  if(!SE.placeTouched && !SE.newPlace){
    const pl = segs.find(sg=> sg.t === "place");
    if(pl && SE.place !== pl.id){ SE.place = pl.id; renderEditorPlace(); }
  }
}
function renderEditorPlace(){
  const sel = document.getElementById("se_place"); if(!sel) return;
  sel.innerHTML = `<option value="">— sin lugar —</option>` +
    Object.entries(DATA.places).sort((a,b)=> a[1].name.localeCompare(b[1].name)).map(([id,p])=> `<option value="${id}" ${id===SE.place?"selected":""}>${p.icon||"📍"} ${escapeHtml(p.name)}</option>`).join("") +
    `<option value="__new" ${SE.newPlace?"selected":""}>➕ Lugar nuevo…</option>`;
  const np = document.getElementById("se_newplace");
  np.hidden = !SE.newPlace;
  if(SE.newPlace){ document.getElementById("se_np_icon").value = SE.newPlace.icon||""; document.getElementById("se_np_name").value = SE.newPlace.name||""; }
}
function renderEditorPeople(){
  const box = document.getElementById("se_chips"); if(!box) return;
  const known = SE.chars.filter(id=> DATA.characters[id]);
  box.innerHTML = known.map(id=> `<span class="se-chip" style="--fcolor:${DATA.characters[id].color}">${faceHtml(id,{static:true})}${escapeHtml(DATA.characters[id].name)}<button type="button" aria-label="Quitar a ${escapeHtml(DATA.characters[id].name)}" onclick="editorRemovePerson('${id}')">×</button></span>`).join("") +
    SE.newPeople.map((np,i)=> `<span class="se-chip is-new">${escapeHtml(np.name)} <em>nuevo</em><button type="button" aria-label="Quitar a ${escapeHtml(np.name)}" onclick="editorRemoveNew(${i})">×</button></span>`).join("") ||
    `<span class="se-none">Todavía nadie: escribe la historia o búscalos abajo.</span>`;
  const n = known.length + SE.newPeople.length;
  document.getElementById("se_count").textContent = n ? `· ${n}` : "";
}
function renderEditorSuggest(){
  const box = document.getElementById("se_suggest"); if(!box || !SE) return;
  const q = document.getElementById("se_find").value.trim();
  const norm = x=> String(x||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
  const nq = norm(q);
  let list = Object.entries(DATA.characters).filter(([id])=> !SE.chars.includes(id));
  if(nq) list = list.filter(([,c])=> norm(c.name).includes(nq) || norm(c.apodo).includes(nq));
  // sin búsqueda: el grupo primero y después los que más aparecen
  const cnt = {}; allEventsFlat().forEach(r=> r.event.chars.forEach(id=> cnt[id] = (cnt[id]||0)+1));
  list.sort((a,b)=> (a[1].tier==="secundario") - (b[1].tier==="secundario") || (cnt[b[0]]||0) - (cnt[a[0]]||0) || a[1].name.localeCompare(b[1].name));
  const exact = q && Object.values(DATA.characters).some(c=> norm(c.name) === nq) || SE.newPeople.some(np=> norm(np.name) === nq);
  box.innerHTML = list.slice(0, q ? 8 : 12).map(([id,c])=> `<button type="button" onclick="editorAddPerson('${id}')">${faceHtml(id,{static:true})}<span>${escapeHtml(c.name)}</span></button>`).join("") +
    (q && !exact ? `<button type="button" class="se-add-new" onclick="editorAddNew()">➕ Agregar a <b>${escapeHtml(q)}</b> como persona nueva</button>` : "");
}
function editorAddPerson(id){
  if(!SE.chars.includes(id)) SE.chars.push(id);
  SE.dismissed = SE.dismissed.filter(x=> x !== id);
  const f = document.getElementById("se_find"); f.value = ""; f.focus();
  renderEditorPeople(); renderEditorSuggest(); if(!SE.uid) writeDraft(draftOf());
}
function editorAddNew(){
  const f = document.getElementById("se_find");
  const name = f.value.trim().replace(/\s+/g," ");
  if(!name) return;
  SE.newPeople.push({ name });
  f.value = ""; f.focus();
  renderEditorPeople(); renderEditorSuggest(); if(!SE.uid) writeDraft(draftOf());
}
function editorRemovePerson(id){
  SE.chars = SE.chars.filter(x=> x !== id);
  if(!SE.dismissed.includes(id)) SE.dismissed.push(id);
  renderEditorPeople(); renderEditorSuggest(); if(!SE.uid) writeDraft(draftOf());
}
function editorRemoveNew(i){ SE.newPeople.splice(i,1); renderEditorPeople(); renderEditorSuggest(); if(!SE.uid) writeDraft(draftOf()); }

function renderEditorPreview(){
  const box = document.getElementById("se_preview"); if(!box || !SE) return;
  const s = DATA.seasons.find(x=> String(x.id) === SE.season);
  const place = SE.newPlace && SE.newPlace.name ? { icon: SE.newPlace.icon || "📍", name: SE.newPlace.name } : DATA.places[SE.place];
  const body = SE.text.trim() ? renderContent(autoTagText(SE.text.trim())) : `<span class="se-ph">La historia va a aparecer acá, con los nombres marcados.</span>`;
  box.style.setProperty("--scolor", s ? s.color : "var(--amber)");
  box.innerHTML = `
    <div class="se-pv-meta"><span>${s ? escapeHtml(s.code) : ""}</span>${escapeHtml(SE.date.trim() || "fecha pendiente")}${place ? ` · ${place.icon||"📍"} ${escapeHtml(place.name)}` : ""}</div>
    <h4>${escapeHtml(SE.title.trim() || "Sin título todavía")}</h4>
    <div class="se-pv-body">${body}</div>`;
}

function saveStoryEditor(){
  if(!SE) return;
  const $ = id=> document.getElementById(id);
  SE.season = $("se_season").value; SE.date = $("se_date").value.trim(); SE.title = $("se_title").value.trim(); SE.text = $("se_text").value.trim();
  const err = $("se_error");
  const fail = (msg, el)=>{ err.textContent = msg; if(el) el.focus(); };
  if(!SE.text) return fail("Falta la historia: escribe aunque sea un par de líneas.", $("se_text"));
  if(!SE.title) return fail("Ponle un título (aunque sea provisorio).", $("se_title"));
  if(SE.newPlace && !(SE.newPlace.name||"").trim()) return fail("Escribe el nombre del lugar nuevo, o elige uno de la lista.", $("se_np_name"));

  const ov = loadOverrides();
  // 1) personas y lugares nuevos, con sus campos pendientes (no se inventa nada)
  const newIds = SE.newPeople.map((np, i)=>{
    const existing = Object.entries(DATA.characters).find(([,c])=> c.name.toLowerCase() === np.name.toLowerCase());
    if(existing) return existing[0];
    const id = uniqueKey(slugify(np.name), DATA.characters);
    const c = { name:np.name, role:"— rol pendiente —", tier:"secundario", color: NEW_COLORS[(Object.keys(DATA.characters).length + i) % NEW_COLORS.length],
      bio:`Cuéntame más sobre ${np.name}: quién es y cómo se relaciona con el grupo.`, apodo:null, frase:null, habilidad:null, destino:null, tags:[] };
    DATA.characters[id] = c; ov.extraCharacters[id] = Object.assign({}, c);
    return id;
  });
  let placeId = SE.place || null;
  if(SE.newPlace){
    const name = SE.newPlace.name.trim();
    const existing = Object.entries(DATA.places).find(([,p])=> p.name.toLowerCase() === name.toLowerCase());
    if(existing) placeId = existing[0];
    else {
      placeId = uniqueKey(slugify(name), DATA.places);
      const p = { name, icon:(SE.newPlace.icon||"").trim() || "📍", desc:`Cuéntame más sobre ${name}: dónde queda y por qué importa en la historia del grupo.` };
      DATA.places[placeId] = p; ov.extraPlaces[placeId] = Object.assign({}, p);
    }
  }
  // 2) el texto con sus nombres marcados (ya con las personas nuevas en DATA)
  const content = autoTagText(SE.text);
  const chars = [...new Set(SE.chars.filter(id=> DATA.characters[id]).concat(newIds))];
  content.forEach(sg=>{ if(sg.t === "char" && !chars.includes(sg.id)) chars.push(sg.id); });
  if(!placeId){ const pl = content.find(sg=> sg.t === "place"); if(pl) placeId = pl.id; }
  const ev = { date: SE.date || "Fecha sin especificar", title: SE.title, place: placeId, chars, content, uid: SE.uid || newUid(), local:true };

  // 3) guardar: nueva, o reemplazando la anterior (también si cambió de temporada)
  const target = DATA.seasons.find(x=> String(x.id) === SE.season);
  if(SE.uid){
    const f = findLocalEvent(SE.uid);
    if(f) f.season.events.splice(f.index, 1);
    Object.keys(ov.extraEvents).forEach(k=>{ ov.extraEvents[k] = ov.extraEvents[k].filter(e=> e.uid !== SE.uid); });
    if(f && String(f.season.id) === SE.season) target.events.splice(f.index, 0, ev);
    else target.events.push(ev);
  } else target.events.push(ev);
  // el orden de las locales en overrides sigue al de la temporada
  ov.extraEvents[SE.season] = target.events.filter(e=> e.local).map(e=> Object.assign({}, e));
  saveOverrides(ov);
  if(!SE.uid) writeDraft(null);
  const madeNew = newIds.length > 0 || !!SE.newPlace;
  closeStoryEditor();
  const href = storyHref(target.id, target.events.indexOf(ev));
  if(location.hash === href) render(); else location.hash = href;
  setTimeout(()=> flashEvent(target.id, target.events.indexOf(ev)), 140);
  showToast(madeNew ? "Historia guardada. Completa después la ficha de lo nuevo (sale como pendiente)." : "Historia guardada en este navegador. Para que la vean todos: 📋 Copiar para Claude, y pégalo en el chat.");
}
function deleteLocalStory(){
  if(!SE || !SE.uid) return;
  if(!confirm("¿Borrar esta historia? No se puede deshacer.")) return;
  const f = findLocalEvent(SE.uid);
  const ov = loadOverrides();
  Object.keys(ov.extraEvents).forEach(k=>{ ov.extraEvents[k] = ov.extraEvents[k].filter(e=> e.uid !== SE.uid); });
  saveOverrides(ov);
  if(f) f.season.events.splice(f.index, 1);
  closeStoryEditor();
  if(f) location.hash = `#/season/${f.season.id}`;
  render();
  showToast("Historia borrada.");
}

// aviso chico abajo, que se va solo
function showToast(msg){
  let el = document.getElementById("toast");
  if(!el){ el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role","status"); document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  clearTimeout(showToast.t); showToast.t = setTimeout(()=> el.classList.remove("show"), 4200);
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
function getPhotos(c){
  if(Array.isArray(c.photos) && c.photos.length) return c.photos;
  if(c.photoLarge) return [c.photoLarge];
  return [];
}
/* The small circular avatar uses `thumb` when there is one: a 224px head-and-shoulders
   WebP pre-cut from the first portrait by tools/make_thumbs.py (~12KB instead of the
   ~350KB full portrait). Without it, it falls back to the first large portrait and
   .avatar-img.is-full zooms the CSS crop onto roughly the same region. The large
   portraits beat the legacy `photo` avatars (Hugo and Gerardo): those are flat JPGs
   with an opaque light background that showed as a white disc against the sky.
   `photo` is still the last resort for a character with only a small avatar. */
function avatarSrc(c){ return c.thumb || getPhotos(c)[0] || c.photo || null; }
function avatarInner(c){
  const src = avatarSrc(c);
  if(src) return `<img src="${src}" alt="${escapeHtml(c.name)}" class="avatar-img${c.thumb?'':' is-full'}" loading="lazy" decoding="async">`;
  return initials(c.name);
}
function cyclePhoto(imgEl){
  const id = imgEl.dataset.id;
  const c = DATA.characters[id];
  if(!c) return;
  const photos = getPhotos(c);
  if(photos.length < 2) return;
  if(imgEl.dataset.swapping === "1") return;
  const idx = parseInt(imgEl.dataset.idx, 10);
  const nextIdx = (idx + 1) % photos.length;
  imgEl.dataset.swapping = "1";

  /* Warm the next photo while the outgoing half plays, then - crucially - wait on the
     <img> ELEMENT's own decode() before warping it back in. Assigning a cold src leaves
     the old bitmap on screen until the new one downloads, so the warp-in used to animate
     the photo you were leaving and the new one popped in afterwards. Waiting on a
     throwaway new Image() isn't enough: that only warms the cache, it doesn't guarantee
     this element has pixels. The element sits at opacity 0 through the wait, so a slow
     load just holds the blank beat a little longer - it never warps the wrong photo. */
  const warm = new Image();
  warm.src = photos[nextIdx];
  const flippedOut = new Promise(res=>setTimeout(res, 240));

  imgEl.classList.add("portrait-flip-out");
  flippedOut.then(()=>{
    imgEl.src = photos[nextIdx];
    imgEl.dataset.idx = nextIdx;
    return imgEl.decode ? imgEl.decode().catch(()=>{}) : Promise.resolve();
  }).then(()=>{
    imgEl.classList.remove("portrait-flip-out");
    imgEl.classList.add("portrait-flip-in");
    /* animationend, not a 420ms timer: the animation starts on the next style flush rather
       than the instant the class lands, so a timer cut it a frame or two short - and the
       leftover delta then got *transitioned* back to the base style over another 240ms
       (see .portrait-img's transition), which is what made the landing feel jolty. */
    imgEl.addEventListener("animationend", ()=>{
      imgEl.classList.remove("portrait-flip-in");
      imgEl.dataset.swapping = "";
    }, {once:true});
    const frame = imgEl.closest(".portrait-frame");
    const dots = frame ? frame.querySelectorAll(".photo-dot") : [];
    dots.forEach((d,i)=>d.classList.toggle("active", i===nextIdx));
  });
}
function renderContent(content){
  return content.map(seg=>{
    if(seg.t==="text"){
      // "— Cuéntame más: ..." dentro de una historia es una nota para completar: se ve como tal
      const m = seg.v.match(/^([\s\S]*?)(—\s*Cu[ée]ntame[\s\S]*)$/);
      if(m) return escapeHtml(m[1]) + `<span class="ask-note">${escapeHtml(m[2].replace(/^—\s*/, ""))}</span>`;
      return escapeHtml(seg.v);
    }
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

/* ---------- ayudantes compartidos por las vistas ---------- */
// Una historia como texto plano, CON los nombres de personajes y lugares (los extractos y la
// búsqueda solo tomaban los segmentos de texto y quedaban frases como "carreteando en , en...")
function plainText(content){
  return (content||[]).map(seg=>{
    if(seg.t==="text") return seg.v;
    if(seg.t==="char") return (DATA.characters[seg.id]||{}).name || "";
    if(seg.t==="place") return (DATA.places[seg.id]||{}).name || "";
    return "";
  }).join("");
}
// Las historias traen a veces una nota para completar al final ("— Cuéntame más: ..."): es un
// recordatorio, no parte del relato, así que el extracto la deja fuera
const ASK_RE = /\s*—\s*Cu[ée]ntame[\s\S]*$/;
function excerpt(content, n){
  n = n || 150;
  const t = plainText(content).replace(ASK_RE, "").replace(/\s+/g, " ").trim();
  if(t.length <= n) return t;
  const cut = t.slice(0, n);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), n*0.7)).replace(/[,;:.\s—-]+$/, "") + "…";
}
// enlace directo a una historia (el router hace scroll a la tarjeta y la destaca)
function storyHref(seasonId, idx){ return `#/season/${seasonId}/${idx}`; }
// Un campo pendiente ("Cuéntame...") no se muestra como si fuera contenido: en modo lectura sale
// una marca discreta; en modo edición, el texto completo (es el recordatorio de qué falta).
function pendingHtml(text, label){
  if(isEditOn()) return `<span class="pending-note is-edit">${escapeHtml(text||label)}</span>`;
  return `<span class="pending-note">${escapeHtml(label)}</span>`;
}
// personajes de una lista de historias, con cuántas veces aparece cada uno (mayor a menor)
function castOf(events){
  const count = {};
  events.forEach(e=> (e.chars||[]).forEach(id=>{ if(DATA.characters[id]) count[id] = (count[id]||0) + 1; }));
  return Object.entries(count).sort((a,b)=> b[1]-a[1] || DATA.characters[a[0]].name.localeCompare(DATA.characters[b[0]].name));
}
// fila de caritas clicables (avatar o iniciales con el color del personaje). Dentro de algo que
// ya es un enlace (una tarjeta), `static` las hace <span>: un <a> dentro de otro <a> no es HTML
// válido y el navegador parte la tarjeta en dos
function faceHtml(id, opts){
  const c = DATA.characters[id]; if(!c) return "";
  const o = opts || {};
  const src = avatarSrc(c);
  const inner = src ? `<img src="${src}" alt="" class="avatar-img${c.thumb?'':' is-full'}" loading="lazy" decoding="async">` : `<span>${escapeHtml(initials(c.name))}</span>`;
  const label = escapeHtml(c.name) + (o.count ? ` · ${o.count} ${o.count===1?"historia":"historias"}` : "");
  if(o.static) return `<span class="face${src?'':' is-initials'}" style="--fcolor:${c.color}" title="${label}">${inner}</span>`;
  return `<a class="face${src?'':' is-initials'}" href="#/character/${id}" style="--fcolor:${c.color}" title="${label}" aria-label="${label}" onclick="event.stopPropagation()">${inner}</a>`;
}
function facesHtml(ids, max, cls, isStatic){
  const shown = ids.slice(0, max);
  const more = ids.length - shown.length;
  return `<div class="faces ${cls||''}">${shown.map(x=> Array.isArray(x) ? faceHtml(x[0], {count:x[1], static:isStatic}) : faceHtml(x, {static:isStatic})).join("")}${more>0?`<span class="face face-more">+${more}</span>`:""}</div>`;
}
// nombre corto para etiquetas chicas: el primer nombre, o con la inicial del apellido si se
// repite ("María D." / "María C.", "Hernán S." / "Hernán M.")
function shortName(id){
  const c = DATA.characters[id]; if(!c) return "";
  const parts = c.name.split(" ");
  const first = parts[0];
  const dup = Object.entries(DATA.characters).some(([k,o])=> k!==id && o.name.split(" ")[0]===first);
  return dup && parts.length > 1 ? `${first} ${parts[parts.length-1][0]}.` : first;
}
// fechas en texto libre ("Sábado 13 de junio", "Del 2 al 8 de febrero de 2024"): se saca lo que
// se pueda (día, mes, año) para el marcador grande del timeline; si no hay, null
const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
function parseDate(text){
  if(!text || isPending(text)) return null;
  const t = String(text).toLowerCase();
  const m = t.match(/(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/);
  if(!m) return null;
  const y = t.match(/(20\d\d)/);
  return { day: m[1], month: m[2].slice(0,3), year: y ? y[1] : "" };
}
function seasonOfEvent(e){ return DATA.seasons.find(s=> s.events.includes(e)); }
function siteFooter(){
  return `<footer class="site-footer reveal">
    <div class="sf-brand">Yoshe con <em>Hoyo</em></div>
    <nav class="sf-links">
      <a href="#/home">Galaxia</a><a href="#/elenco">Elenco</a><a href="#/map">Mapa</a><a href="#/records">Récords</a><a href="#/resumen">Resúmenes</a><a href="#/juego">Juego</a><a href="#/armageddon" class="sf-doom">Armagedón</a>
    </nav>
    <div class="sf-note">una crónica en construcción · S0 → S5</div>
  </footer>`;
}

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
  // quiénes estuvieron: caritas clicables (las mismas del elenco) en vez de una lista de nombres
  const people = e.chars.filter(cid=>DATA.characters[cid]);
  const tagsHtml = people.length ? `<div class="event-people">
        ${facesHtml(people, 16)}
        <span class="ep-count">${people.length} ${people.length===1?"persona":"personas"}</span>
      </div>` : "";
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
// activeId: undefined = la home; "elenco"; el id de una temporada; null = ninguno (mapa, récords...)
function renderSeasonsStrip(activeId){
  const strip=document.getElementById("seasonsStrip");
  let html = `<button data-s="home" class="${activeId===undefined?'active':''}" onclick="location.hash='#/home'">Inicio</button>`;
  html += `<button data-s="elenco" class="${activeId==='elenco'?'active':''}" onclick="location.hash='#/elenco'">Elenco</button>`;
  DATA.seasons.forEach(s=>{
    html+=`<button data-s="${s.id}" class="${activeId===s.id?'active':''}" onclick="location.hash='#/season/${s.id}'">${s.code}</button>`;
  });
  strip.innerHTML = html;
}

/* =========================== render: HOME =========================== */
// La home tiene dos versiones del mapa de temporadas, en la misma caja (.home-sky):
//  - la constelación 2D (HTML + SVG), que se pinta al instante y es el respaldo;
//  - el sistema solar 3D (solar.js + three.js), que se monta encima y la reemplaza con un
//    fundido cuando su primer cuadro ya está pintado (.hero.solar-on).
// Si el 3D no se puede (sin WebGL, equipo débil, import() que falla, contexto perdido, va
// lento), la 2D simplemente se queda: la home nunca queda en blanco.

// Hand-arranged constellation layout (percent coordinates) — not a circle, like a scattered star chart.
// Two layouts: a wide scatter for the 16:9 desktop box, a tall serpentine for the 3:4 mobile box
// (stretching one set of points across both boxes made the lines steep and chunky on narrow screens).
function constellationHtml(){
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
    </div>`;
  }).join("");

  const armageddonIdelay = (0.55 + DATA.seasons.length*0.13 + 0.2).toFixed(2);
  const armageddonNode = `<div class="star-node armageddon-node" style="left:${ARMAGEDDON_POS.x}%; top:${ARMAGEDDON_POS.y}%; --idelay:${armageddonIdelay}s" onclick="location.hash='#/armageddon'">
    <div class="star-dot"><i class="core"></i></div>
  </div>`;

  return `<svg id="constellationSvg" viewBox="0 0 100 ${vbH.toFixed(3)}" preserveAspectRatio="none">${linesSvg}</svg>
    ${microStars}${seasonNodesHtml}${armageddonNode}`;
}

function viewHome(){
  renderSeasonsStrip(undefined);
  lockWheel = e=>{ if(typeof solarWheel === "function") solarWheel(e); };
  const app=document.getElementById("app");

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
      <span class="tag-2d">Elige una estrella para caer dentro de esa temporada.</span><span class="tag-3d">Elige un planeta para caer dentro de esa temporada.</span></p>
    </div>
    <div class="home-sky">
      <div class="constellation-wrap">${constellationHtml()}</div>
      <div class="solar-stage" id="solarStage"></div>
      <div class="solar-hint" aria-hidden="true"><span class="hint-desk">arrastra para girar · rueda para acercar · clic en un planeta o el Hoyo</span><span class="hint-touch">gira con el dedo · pellizca · toca un planeta</span></div>
    </div>
    <a class="explore-tab" href="#/elenco">Personajes y lugares<span class="chevron" aria-hidden="true"></span></a>
  </section>
  `;


  if(playIntro){ try{ sessionStorage.setItem(INTRO_KEY, "1"); }catch(e){} }
  setupConstellationFX();
  // la entrada del 3D (cámara desde lejos) va con la del hero: una vez por sesión
  mountHomeSolar({ intro: playIntro, restoreView: routeFromHistory });
}

/* =========================== render: ELENCO (personajes y lugares) =========================== */
// Pantalla propia, separada de la galaxia: la home no scrollea nunca (es solo la galaxia) y
// acá el scroll es el normal de la página. Se entra con la pestaña "Personajes y lugares" de
// la home y se vuelve con "← Galaxia".
function viewCast(){
  renderSeasonsStrip("elenco");
  const app=document.getElementById("app");

  const storyCount = {};
  allEventsFlat().forEach(r=> r.event.chars.forEach(id=>{ storyCount[id] = (storyCount[id]||0) + 1; }));
  const seasonsOf = id => DATA.seasons.filter(s=> s.events.some(e=> e.chars.includes(id)));
  // la tarjeta dice lo que sí se sabe: apodo, cuántas historias y en qué temporadas. El rol
  // pendiente ya no sale repetido en cada una
  const castCard = ([id,c])=>{
    const n = storyCount[id] || 0;
    const ss = seasonsOf(id);
    return `
    <a class="cast-card${c.tier==='secundario'?' is-sec':''}" href="#/character/${id}" style="--pcolor:${c.color}">
      <div class="cast-avatar" style="background:${avatarSrc(c)?'transparent':c.color}; overflow:hidden;">${avatarInner(c)}</div>
      <div class="cname">${escapeHtml(c.name)}</div>
      ${c.apodo ? `<div class="capodo">“${escapeHtml(c.apodo)}”</div>` : (!isPending(c.role) ? `<div class="crole">${escapeHtml(c.role)}</div>` : "")}
      <div class="cmeta">
        <span class="cn">${n} ${n===1?"historia":"historias"}</span>
        <span class="cdots">${ss.map(s=>`<i style="background:${s.color}" title="${s.code}"></i>`).join("")}</span>
      </div>
    </a>`;
  };
  const entries = Object.entries(DATA.characters);
  const byStories = (a,b)=> (storyCount[b[0]]||0) - (storyCount[a[0]]||0) || a[1].name.localeCompare(b[1].name);
  const primary = entries.filter(([,c])=>c.tier!=='secundario');
  const secondary = entries.filter(([,c])=>c.tier==='secundario').sort(byStories);

  const placeCount = {};
  allEventsFlat().forEach(r=>{ if(r.event.place) placeCount[r.event.place] = (placeCount[r.event.place]||0) + 1; });
  const placesHtml = Object.entries(DATA.places).sort((a,b)=> (placeCount[b[0]]||0) - (placeCount[a[0]]||0)).map(([id,p])=>{
    const n = placeCount[id] || 0;
    return `
    <a class="place-card" href="#/place/${id}">
      <span class="picon">${p.icon}</span>
      <div class="pname">${escapeHtml(p.name)}</div>
      ${isPending(p.desc) ? `<div class="pdesc is-pending">${pendingHtml(p.desc, "descripción pendiente")}</div>` : `<div class="pdesc">${escapeHtml(p.desc)}</div>`}
      <div class="cmeta"><span class="cn">${n} ${n===1?"historia":"historias"}</span></div>
    </a>`;
  }).join("");

  app.innerHTML = `
  <div class="page-topbar"><a class="back-btn" href="#/home"><span aria-hidden="true">←</span> Galaxia</a><a class="back-btn recap-btn" href="#/resumen">▶ Resúmenes</a><a class="back-btn" href="#/juego">🎯 Juego</a></div>
  <section class="section-wrap cast-page">
    <div class="cast-intro">
      <div class="eyebrow">El elenco</div>
      <h1>Quiénes son</h1>
      <p>${primary.length} integrantes del grupo, ${secondary.length} apariciones especiales y ${Object.keys(DATA.places).length} lugares donde pasaron las cosas.</p>
    </div>
    <div class="section-head">
      <div class="eyebrow">El grupo</div>
      <h2>Los personajes</h2>
    </div>
    <div class="grid-cast reveal-stagger">${primary.map(castCard).join("")}</div>
  </section>

  <section class="section-wrap" style="padding-top:0;">
    <div class="section-head">
      <div class="eyebrow">Elenco invitado</div>
      <h2>Apariciones especiales</h2>
    </div>
    <div class="grid-cast grid-cast-sec reveal-stagger">${secondary.map(castCard).join("") || '<div style="color:var(--ink-dim); font-size:.9rem;">Todavía no hay personajes secundarios.</div>'}</div>
  </section>

  <section class="section-wrap" style="padding-top:0;">
    <div class="section-head">
      <div class="eyebrow">Escenarios</div>
      <h2>Los lugares</h2>
    </div>
    <div class="grid-places reveal-stagger">${placesHtml}</div>
  </section>

  ${siteFooter()}
  `;

  setupReveals();
}
// ---- la home: la galaxia, a pantalla completa y sin scroll ----
// En la home la página no scrollea nunca (html.galaxy-lock): la rueda (y el pinch del
// trackpad) y el pellizco hacen zoom en la galaxia, y el dedo la gira en cualquier dirección
// (solar.js, vía ownsGestures). Personajes y lugares viven en otra pantalla (#/elenco), a la
// que se va con la pestaña de abajo; así los dos scroll nunca se mezclan.
// El mapa de relaciones (#/map) usa el mismo bloqueo: también es una escena a pantalla
// completa que se gira con el dedo y se acerca con la rueda. `lockWheel` es a quién le llega la
// rueda (la galaxia o la red); render() lo vacía antes de cada vista.
// Fuera de esas dos pantallas, galaxyOn es false y no se bloquea nada.
let galaxyOn = false, galaxyListening = false, lockWheel = null;
const overlayOpen = ()=> !!document.querySelector(".modal-overlay.active, .search-overlay.active");
// los gestos son de la escena mientras no haya un modal o el buscador encima
function galaxyOwnsGestures(){ return galaxyOn && !overlayOpen(); }
function setGalaxyLock(on){
  galaxyOn = on;
  document.documentElement.classList.toggle("galaxy-lock", on);
  // los listeners no-pasivos (que pueden cancelar el scroll) existen solo en la home: en el
  // resto del sitio el navegador scrollea sin esperar a ningún JS
  if(on !== galaxyListening){
    const f = on ? "addEventListener" : "removeEventListener";
    window[f]("wheel", onGalaxyWheel, { passive:false });
    window[f]("touchmove", onGalaxyTouchMove, { passive:false });
    galaxyListening = on;
  }
}
// lo que tiene scroll propio y debe seguir funcionando sobre la galaxia
const OWN_SCROLL = ".solar-panel, .map-info, .modal-overlay, .search-overlay";
const inOwnScroll = t=> !!(t && t.closest && t.closest(OWN_SCROLL));
function onGalaxyWheel(e){
  if(!galaxyOn || inOwnScroll(e.target)) return;
  e.preventDefault();   // la rueda nunca mueve la página acá
  if(galaxyOwnsGestures() && lockWheel) lockWheel(e);   // zoom (la galaxia 2D de respaldo no hace nada)
}
function onGalaxyTouchMove(e){
  if(galaxyOn && !inOwnScroll(e.target)) e.preventDefault();
}
// --nav-h: el alto real del nav (sin condensar), para que el hero mida justo una pantalla
(function(){
  const nav = document.querySelector("header.topnav");
  if(!nav) return;
  const set = ()=>{ if(!nav.classList.contains("condensed")) document.documentElement.style.setProperty("--nav-h", nav.offsetHeight + "px"); };
  set();
  if(window.ResizeObserver) new ResizeObserver(set).observe(nav);
})();

// ---- sistema solar 3D: montaje sobre la 2D ----
// ?3d=0 apaga el 3D (para ver el respaldo); ?3d=1 lo fuerza aunque el equipo parezca débil
// o el navegador renderice por software (headless, pruebas)
// ?q=high|medium|low fija el nivel inicial de calidad (pruebas; si no, lo elige solar.js)
const SOLAR_PARAM = (()=>{ try{ return new URLSearchParams(location.search).get("3d"); }catch(e){ return null; } })();
const SOLAR_Q = (()=>{ try{ return new URLSearchParams(location.search).get("q"); }catch(e){ return null; } })();
let solarGaveUp = false;   // falló sin remedio en esta carga (lento, shader): no reintentar
// pérdida de contexto WebGL: iOS la provoca seguido al volver de otra app o al desbloquear.
// Se reintenta montando de nuevo (sin entrada, con el ángulo guardado) cuando la pestaña está
// visible; si se pierde 3 veces en la misma carga, queda la 2D.
let solarLosses = 0, solarRetry = null;
function cancelSolarRetry(){
  if(!solarRetry) return;
  clearTimeout(solarRetry.timer);
  document.removeEventListener("visibilitychange", solarRetry.onVis);
  solarRetry = null;
}
function scheduleSolarRetry(){
  cancelSolarRetry();
  const r = solarRetry = { timer:null, onVis:null };
  const go = ()=>{
    if(solarRetry !== r) return;
    cancelSolarRetry();
    if(document.getElementById("solarStage")) mountHomeSolar({ intro:false, restoreView:true });
  };
  r.onVis = ()=>{ if(!document.hidden){ clearTimeout(r.timer); r.timer = setTimeout(go, 400); } };
  document.addEventListener("visibilitychange", r.onVis);
  if(!document.hidden) r.timer = setTimeout(go, 1200);
}
// desmontar del todo antes de cambiar de vista: la escena y un reintento pendiente
function unmountHomeSolar(){
  cancelSolarRetry();
  try{ if(typeof unmountSolar === "function") unmountSolar(); }catch(e){}
}
function setStarDensityFor(q){ if(window.setStarDensity) window.setStarDensity(q === "low" ? 0.55 : q === "medium" ? 0.8 : 1); }
function routeIsArmageddon(){ return /^#\/?armageddon/.test(location.hash); }
// body.mood-doom tiene dos dueños: la ruta (#/armageddon) y el foco del Hoyo en la home. Se
// calcula siempre desde ambos, así desmontar o cerrar el foco deja lo que pide la ruta
function syncMood(focusDoom){ document.body.classList.toggle("mood-doom", !!focusDoom || routeIsArmageddon()); }
function mountHomeSolar(o){
  const stage = document.getElementById("solarStage");
  const hero = document.querySelector(".hero");
  if(!stage || !hero || solarGaveUp || SOLAR_PARAM === "0") return;
  if(typeof mountSolar !== "function" || typeof solarCapable !== "function") return;
  const force = SOLAR_PARAM === "1";
  try{ if(!solarCapable(force)) return; }catch(e){ return; }
  const back2d = ()=>{ hero.classList.remove("solar-on"); };
  try{
    mountSolar(stage, {
      intro: o.intro,
      restoreView: o.restoreView,
      force,
      quality: SOLAR_Q || undefined,
      onQuality: setStarDensityFor,
      onMood: syncMood,
      onReady: ()=>{ if(stage.isConnected) hero.classList.add("solar-on"); },
      onFail: reason=>{
        try{ unmountSolar(); }catch(e){}
        back2d();
        if(reason === "context-lost" && ++solarLosses < 3){ scheduleSolarRetry(); return; }
        solarGaveUp = true;
        if(window.console) console.warn("sistema 3D desactivado:", reason);
      },
      keysBlocked: ()=> !!document.querySelector(".modal-overlay.active, .search-overlay.active"),
      ownsGestures: galaxyOwnsGestures,
    }).catch(err=>{
      // import() que falla (offline, file://), WebGL que no arranca: queda la 2D
      back2d();
      if(window.console) console.warn("sistema 3D no disponible:", err && err.message ? err.message : err);
    });
  }catch(err){ back2d(); }
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
  renderSeasonsStrip(s?s.id:null);
  const app=document.getElementById("app");
  if(!s){ app.innerHTML = `<div class="section-wrap">Temporada no encontrada.</div>`; return; }

  const sIdx = DATA.seasons.indexOf(s);
  const prev = DATA.seasons[sIdx-1], next = DATA.seasons[sIdx+1];
  const cast = castOf(s.events);
  const placeIds = [...new Set(s.events.map(e=>e.place).filter(p=>p && DATA.places[p]))];

  // la cabecera: código, título, hito (o su marca de pendiente), cifras y el reparto
  const statsHtml = s.events.length ? `
      <div class="season-stats">
        <div><b>${s.events.length}</b><span>${s.events.length===1?"historia":"historias"}</span></div>
        <div><b>${cast.length}</b><span>${cast.length===1?"personaje":"personajes"}</span></div>
        <div><b>${placeIds.length}</b><span>${placeIds.length===1?"lugar":"lugares"}</span></div>
      </div>
      ${cast.length ? `<div class="season-cast"><div class="season-cast-label">Reparto</div>${facesHtml(cast, 14, "faces-lg")}</div>` : ""}` : "";
  const seasonHeroHtml = `
    <section class="season-hero" style="--scolor:${s.color}">
      <div class="scode-big">${s.code} <span>· temporada ${sIdx+1} de ${DATA.seasons.length}</span></div>
      <h1>${escapeHtml(s.title)}</h1>
      <p class="hito">${isPending(s.hito) ? pendingHtml(s.hito, "— el hito de esta temporada está por escribirse —") : escapeHtml(s.hito)}</p>
      ${statsHtml}
      <div class="edit-only-btn edit-row">
        <button class="back-btn" style="margin:0;" onclick="openSeasonMetaModal('${s.id}')">✏️ Editar título/hito</button>
        <button class="back-btn" style="margin:0;" onclick="openStoryEditor('${s.id}')">➕ Agregar historia</button>
      </div>
    </section>`;

  // anterior / siguiente: la temporada no es un callejón sin salida
  const seasonNavHtml = `
    <nav class="season-nav reveal" aria-label="Otras temporadas">
      ${prev ? `<a class="sn-card sn-prev" href="#/season/${prev.id}" style="--scolor:${prev.color}"><span class="sn-dir">← Anterior</span><span class="sn-code">${prev.code}</span><span class="sn-title">${escapeHtml(prev.title)}</span></a>` : `<span class="sn-card sn-empty"></span>`}
      <a class="sn-home" href="#/home"><span class="sn-orbit" aria-hidden="true"></span>Galaxia</a>
      ${next ? `<a class="sn-card sn-next" href="#/season/${next.id}" style="--scolor:${next.color}"><span class="sn-dir">Siguiente →</span><span class="sn-code">${next.code}</span><span class="sn-title">${escapeHtml(next.title)}</span></a>`
             : `<a class="sn-card sn-next sn-doom" href="#/armageddon"><span class="sn-dir">Y después →</span><span class="sn-code">†</span><span class="sn-title">El Armagedón</span></a>`}
    </nav>`;

  if(!s.events.length){
    app.innerHTML = seasonHeroHtml + `
    <div class="season-empty reveal">
      <div class="empty-orbit" style="--scolor:${s.color}"><span></span><span></span><span></span></div>
      <h3>Esta temporada todavía está por escribirse</h3>
      <p>No hay historias cargadas para ${escapeHtml(s.code)} — ${escapeHtml(s.title)}.</p>
    </div>` + seasonNavHtml + siteFooter();
    setupReveals();
    return;
  }
  const eventsHtml = s.events.map((e,idx)=>{
    const side = idx%2===0 ? "left" : "right";
    const place = DATA.places[e.place];
    const rot = (idx%2===0? -1 : 1) * (1 + (idx%3));
    const d = parseDate(e.date);
    const pendingDate = isPending(e.date);
    // al otro lado del eje (en desktop), la fecha grande y el lugar: así el timeline no deja
    // media pantalla vacía y se puede recorrer de un vistazo
    const sideHtml = `
      <div class="event-side" aria-hidden="true">
        <div class="es-n">Historia ${idx+1} <span>de ${s.events.length}</span></div>
        ${d ? `<div class="es-date"><b>${d.day}</b><span>${d.month}${d.year?` ${d.year}`:""}</span></div>` : `<div class="es-date es-nodate"><span>${pendingDate?"fecha pendiente":escapeHtml(e.date)}</span></div>`}
        ${place ? `<div class="es-place">${place.icon} ${escapeHtml(place.name)}</div>` : ""}
      </div>`;
    return `
    <article class="event ${side}" id="event-${s.id}-${idx}" data-idx="${idx}" style="--rot:${rot}deg; --scolor:${s.color}">
      <div class="node-dot" style="border-color:${s.color}"></div>
      ${sideHtml}
      <div class="edate"><span class="edate-n">${idx+1}</span>${escapeHtml(pendingDate ? "fecha pendiente" : e.date)}
        <button type="button" class="share-btn" onclick="shareStory(${s.id},${idx},this)" aria-label="Compartir esta historia" title="Copiar enlace a esta historia">🔗</button></div>
      <h3>${escapeHtml(e.title)}</h3>
      ${renderEventBody(e, place, side)}
      ${e.local ? `<div class="edit-only-btn edit-row local-row"><span class="local-tag">escrita en este navegador</span><button class="back-btn" style="margin:0;" onclick="openStoryEditor('${s.id}','${e.uid}')">✏️ Editar o borrar</button></div>` : ""}
    </article>`;
  }).join("");

  app.innerHTML = seasonHeroHtml + `
    <div class="timeline" id="timeline" style="--scolor:${s.color}">
      <div class="tl-progress" id="tlProgress" style="background:linear-gradient(to bottom, ${s.color}, var(--violet))"></div>
      ${eventsHtml}
    </div>
  ` + seasonNavHtml + siteFooter();
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
  // sin lookbehind (/(?<=\.)\s/): Safari anterior a 16.4 no lo entiende y no carga app.js entero
  const m = t.match(/^[\s\S]*?\.(?=\s)/);
  const cut = m ? m[0] : t;
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
  viewCleanups.push(()=>window.removeEventListener("scroll", onScroll, {passive:true}));
  onScroll();
}

/* =========================== render: CHARACTER =========================== */
// tarjeta de una historia en las bitácoras (ficha de personaje y de lugar): color de su
// temporada, lugar, quiénes estuvieron y un extracto que sí incluye los nombres
function storyCardHtml(r, opts){
  const o = opts || {};
  const place = DATA.places[r.event.place];
  const people = r.event.chars.filter(id=> DATA.characters[id] && id !== o.skip);
  return `
    <a class="story-link-card" href="${storyHref(r.season.id, r.index)}" style="--scolor:${r.season.color}">
      <div class="slc-top">
        <span class="slc-season">${r.season.code} · ${escapeHtml(r.season.title)}</span>
        <span class="slc-date">${escapeHtml(isPending(r.event.date) ? "fecha pendiente" : r.event.date)}</span>
      </div>
      <h4>${escapeHtml(r.event.title)}</h4>
      <p>${escapeHtml(excerpt(r.event.content, 170))}</p>
      <div class="slc-foot">
        ${place && !o.noPlace ? `<span class="slc-place">${place.icon} ${escapeHtml(place.name)}</span>` : ""}
        ${people.length ? facesHtml(people, 7, "faces-sm", true) : ""}
      </div>
    </a>`;
}
// en qué temporadas aparece: seis puntos, encendidos los suyos
function seasonDotsHtml(codes){
  return `<div class="season-dots" aria-label="Temporadas: ${codes.join(", ") || "ninguna"}">${DATA.seasons.map(s=>{
    const on = codes.includes(s.code);
    return `<a class="sd${on?' on':''}" href="#/season/${s.id}" style="--scolor:${s.color}" title="${s.code} · ${escapeHtml(s.title)}"><i></i><span>${s.code}</span></a>`;
  }).join("")}</div>`;
}

function viewCharacter(id){
  renderSeasonsStrip("elenco");
  const c = DATA.characters[id];
  const app=document.getElementById("app");
  if(!c){ app.innerHTML=`<div class="section-wrap">Personaje no encontrado.</div>`; return; }

  const related = allEventsFlat().filter(x=>x.event.chars.includes(id));
  const stats = characterStats(id);
  const placeId = stats.topPlace ? Object.keys(DATA.places).find(k=>DATA.places[k]===stats.topPlace) : null;

  const statCards = `
    <div class="stat-cell"><div class="stat-num">${stats.count}</div><div class="stat-label">historia${stats.count===1?"":"s"}</div></div>
    <div class="stat-cell"><div class="stat-num">${stats.seasons.length}</div><div class="stat-label">temporada${stats.seasons.length===1?"":"s"}</div></div>
    ${stats.topPlace ? `<a class="stat-cell" href="#/place/${placeId}"><div class="stat-num">${stats.topPlace.icon}</div><div class="stat-label">su lugar: ${escapeHtml(stats.topPlace.name)}</div></a>` : ""}
    ${stats.topCoChar ? `<a class="stat-cell" href="#/character/${stats.topCoCharId}"><div class="stat-num stat-face">${faceHtml(stats.topCoCharId, {static:true})}</div><div class="stat-label">más junto a: ${escapeHtml(stats.topCoChar.name.split(" ")[0])}</div></a>` : ""}
  `;

  const rolePending = isPending(c.role);
  const bioPending = isPending(c.bio);
  const infoContent = `
      <div class="dossier-eyebrow">${c.tier==='secundario' ? "Aparición especial" : "Del grupo"}</div>
      <h1>${escapeHtml(c.name)}</h1>
      ${c.apodo ? `<div class="apodo">“${escapeHtml(c.apodo)}”</div>` : ""}
      ${rolePending && !isEditOn() ? "" : `<div class="meta-row"><span class="role-chip">${escapeHtml(c.role)}</span></div>`}
      ${bioPending
        ? `<p class="profile-bio is-pending">${pendingHtml(c.bio, "Perfil por escribir: todavía no hay una descripción de " + c.name.split(" ")[0] + ".")}</p>`
        : `<p class="profile-bio">${escapeHtml(c.bio)}</p>`}
      ${c.habilidad ? `<div class="skill-card"><div class="skill-icon">⟡</div><div><div class="skill-label">Habilidad especial</div><div class="skill-value">${escapeHtml(c.habilidad)}</div></div></div>` : ""}
      ${c.frase ? `<blockquote class="quote-block">${escapeHtml(c.frase)}</blockquote>` : ""}
      ${(c.tags||[]).length ? `<div class="profile-tags">${c.tags.map(t=>`<span class="chip-small">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
      <div class="stat-rail">${statCards}</div>
      ${seasonDotsHtml(stats.seasons)}
  `;

  // su gente: con quiénes comparte más historias
  const co = castOf(related.map(r=>r.event)).filter(([cid])=> cid !== id);
  const coHtml = co.length ? `
    <section class="co-section reveal" style="--pcolor:${c.color}">
      <div class="dossier-eyebrow">Su gente</div>
      <h2>Con quién comparte la crónica</h2>
      <p class="co-sub">Toca a alguien para ver todo lo que han vivido juntos.</p>
      <div class="co-grid">${co.slice(0, 12).map(([cid, n])=>{
        const p = DATA.characters[cid];
        return `<a class="co-card" href="#/juntos/${id}/${cid}" style="--fcolor:${p.color}" title="${escapeHtml(c.name.split(" ")[0])} y ${escapeHtml(p.name.split(" ")[0])}: sus historias juntos">
          ${faceHtml(cid, {static:true})}
          <span class="co-name">${escapeHtml(p.name)}</span>
          <span class="co-n">${n} ${n===1?"historia":"historias"} en común</span>
        </a>`;
      }).join("")}</div>
    </section>` : "";

  const photos = getPhotos(c);

  app.innerHTML = `
    <div class="page-topbar">
      <div class="back-btn" onclick="history.length>1?history.back():location.hash='#/elenco'">← Volver</div>
      ${related.length ? `<a class="back-btn recap-btn" href="#/resumen/${id}">▶ Ver su resumen</a>` : ""}
      <button class="back-btn edit-only-btn" onclick="openCharEditModal('${id}')">✏️ Editar personaje</button>
    </div>
    ${photos.length ? `
    <section class="profile-hero-split" style="--pcolor:${c.color}">
      <div class="hero-wash"></div>
      <div class="info-side">${infoContent}</div>
      <div class="portrait-side">
        <div class="portrait-frame${photos.length>1?' is-cyclable':''}">
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
      <div class="profile-avatar" style="background:${avatarSrc(c)?'transparent':c.color}; overflow:hidden;">${avatarInner(c)}</div>
      ${infoContent}
    </section>
    `}
    ${coHtml}
    <section class="related-stories reveal" style="--pcolor:${c.color}">
      <div class="dossier-eyebrow">Bitácora</div>
      <h2>Historias de ${escapeHtml(c.name.split(" ")[0])}</h2>
      <div class="sub">${related.length} historia${related.length===1?"":"s"} en la crónica</div>
      ${related.length ? related.map(r=>storyCardHtml(r, {skip:id})).join("") : `<div class="empty-note">Todavía no aparece en ninguna historia.</div>`}
    </section>
    ${siteFooter()}
  `;
  /* Warm the rest of the carousel now, not on first click: an un-cached photo makes the
     first swap to it hold a blank beat while it downloads (cyclePhoto waits for pixels
     before warping in), and it only ever looked wrong the first time through each photo. */
  photos.slice(1).forEach(src=>{ const pre = new Image(); pre.src = src; });
  setupReveals();
}

/* =========================== render: PLACE =========================== */
function viewPlace(id){
  renderSeasonsStrip("elenco");
  const p = DATA.places[id];
  const app=document.getElementById("app");
  if(!p){ app.innerHTML=`<div class="section-wrap">Lugar no encontrado.</div>`; return; }

  const related = allEventsFlat().filter(x=>x.event.place===id);
  const stats = placeStats(id);
  const visitors = castOf(related.map(r=>r.event));

  const statCards = `
    <div class="stat-cell"><div class="stat-num">${stats.count}</div><div class="stat-label">historia${stats.count===1?"":"s"}</div></div>
    <div class="stat-cell"><div class="stat-num">${visitors.length}</div><div class="stat-label">${visitors.length===1?"persona ha pasado":"personas han pasado"}</div></div>
    ${stats.topChar ? `<a class="stat-cell" href="#/character/${stats.topCharId}"><div class="stat-num stat-face">${faceHtml(stats.topCharId, {static:true})}</div><div class="stat-label">habitué: ${escapeHtml(stats.topChar.name.split(" ")[0])}</div></a>` : ""}
  `;

  app.innerHTML = `
    <div class="page-topbar">
      <div class="back-btn" onclick="history.length>1?history.back():location.hash='#/elenco'">← Volver</div>
      <button class="back-btn edit-only-btn" onclick="openPlaceEditModal('${id}')">✏️ Editar lugar</button>
    </div>
    <section class="profile-hero place-hero" style="--pcolor:var(--teal)">
      <div class="hero-wash"></div>
      <div class="profile-avatar place-avatar">${p.icon}</div>
      <div class="dossier-eyebrow">Escenario</div>
      <h1>${escapeHtml(p.name)}</h1>
      ${isPending(p.desc)
        ? `<p class="profile-bio is-pending">${pendingHtml(p.desc, "Todavía no hay una descripción de este lugar.")}</p>`
        : `<p class="profile-bio">${escapeHtml(p.desc)}</p>`}
      <div class="stat-rail">${statCards}</div>
      ${seasonDotsHtml(stats.seasons)}
      ${visitors.length ? `<div class="place-visitors"><div class="season-cast-label">Quiénes han estado aquí</div>${facesHtml(visitors, 24, "faces-lg")}</div>` : ""}
    </section>
    <section class="related-stories reveal" style="--pcolor:var(--teal)">
      <div class="dossier-eyebrow">Bitácora</div>
      <h2>Lo que pasó en ${escapeHtml(p.name)}</h2>
      <div class="sub">${related.length} historia${related.length===1?"":"s"} en la crónica</div>
      ${related.length ? related.map(r=>storyCardHtml(r, {noPlace:true})).join("") : `<div class="empty-note">Todavía no hay historias en este lugar.</div>`}
    </section>
    ${siteFooter()}
  `;
  setupReveals();
}

/* =========================== render: MAPA DE RELACIONES =========================== */
/* =========================== render: ARMAGEDDON =========================== */
function viewArmageddon(){
  renderSeasonsStrip(null);
  const app=document.getElementById("app");
  const a = DATA.armageddon;
  const primaryChars = Object.entries(DATA.characters).filter(([,c])=>c.tier!=='secundario');
  const written = primaryChars.filter(([,c])=> c.destino && !isPending(c.destino)).length;

  // lápidas: cara apagada (se enciende al pasar), nombre y su destino, o la marca de pendiente
  const cardsHtml = primaryChars.map(([id,c])=>{
    const src = avatarSrc(c);
    const has = c.destino && !isPending(c.destino);
    return `
    <a class="epitaph-card${has?'':' is-pending'}" href="#/character/${id}" style="--pcolor:${c.color}">
      <div class="ep-face">${src ? `<img src="${src}" alt="" class="avatar-img${c.thumb?'':' is-full'}" loading="lazy" decoding="async">` : `<span>${escapeHtml(initials(c.name))}</span>`}</div>
      <div class="ep-body">
        <div class="ename">${escapeHtml(c.name)}</div>
        <div class="edestino ${has?'':'pending'}">${has ? escapeHtml(c.destino) : 'Destino aún sin escribir…'}</div>
      </div>
    </a>`;
  }).join("");

  app.innerHTML = `
    <div class="page-topbar">
      <div class="back-btn" onclick="history.length>1?history.back():location.hash='#/home'">← Volver</div>
      <button class="back-btn edit-only-btn" onclick="openArmageddonModal()">✏️ Editar profecía</button>
    </div>
    <section class="armageddon-hero">
      <div class="wash"></div>
      <div class="arm-hole" aria-hidden="true"><i></i></div>
      <div class="eyebrow">Capítulo final</div>
      <h1>ARMAGEDÓN</h1>
      ${isPending(a.intro)
        ? `<p class="prophecy is-pending">${isEditOn() ? escapeHtml(a.intro) : "La profecía todavía no ha sido escrita. El Hoyo espera."}</p>`
        : `<p class="prophecy">${escapeHtml(a.intro)}</p>`}
      <div class="arm-progress">
        <div class="arm-bar"><i style="width:${primaryChars.length ? (written/primaryChars.length*100).toFixed(1) : 0}%"></i></div>
        <span>${written} de ${primaryChars.length} destinos escritos</span>
      </div>
    </section>
    <div class="section-wrap arm-section">
      <div class="section-head">
        <div class="eyebrow" style="color:#ff5252;">El destino de cada uno</div>
        <h2>¿Cómo termina cada integrante?</h2>
      </div>
      <div class="armageddon-grid reveal-stagger">${cardsHtml}</div>
    </div>
    ${siteFooter()}
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

// ---- el mapa de relaciones (3D) ----
// Una nube 3D de personas (net3d.js): cada una del tamaño de cuántas historias tiene, con su
// foto; las líneas unen a quienes comparten historias, más gruesas mientras más compartan, y
// los que más se cruzan quedan cerca. Es una pantalla fija, como la galaxia (html.galaxy-lock,
// ver setGalaxyLock): el dedo la gira, la rueda y el pellizco acercan, y la página no scrollea.
// El panel #mapInfo (a la derecha en desktop, hoja abajo en el teléfono) muestra el resumen
// o a la persona encendida.
let mapMode = "all";   // "all" | "group" (solo el núcleo)
function mapData(mode){
  const count = {};
  allEventsFlat().forEach(r=> r.event.chars.forEach(id=>{ count[id] = (count[id]||0) + 1; }));
  const ids = Object.keys(DATA.characters).filter(id=> (mode !== "group" || DATA.characters[id].tier !== "secundario") && (count[id]||0) > 0);
  const inSet = new Set(ids);
  const weights = {};
  allEventsFlat().forEach(r=>{
    const cs = r.event.chars.filter(id=> inSet.has(id));
    for(let i=0;i<cs.length;i++) for(let j=i+1;j<cs.length;j++){
      const key = [cs[i],cs[j]].sort().join("|");
      weights[key] = (weights[key]||0) + 1;
    }
  });
  const edges = Object.entries(weights).map(([k,w])=>{ const [a,b] = k.split("|"); return {a,b,w}; });
  const nodes = ids.map(id=>{
    const c = DATA.characters[id], img = avatarSrc(c);
    return { id, name:c.name, label:shortName(id), color:c.color || "#7fb8ff", img, imgFull: !!img && !c.thumb,
      initials:initials(c.name), n:count[id], primary: c.tier !== "secundario" };
  });
  return { nodes, edges };
}

// ---- quién se comió a quién (DATA.hookups + los agregados en modo edición) ----
// Solo lo que cuentan las historias o lo que contó el usuario; cada línea dice de dónde sale.
const HOOK_KINDS = {
  beso:   { label:"se comieron",            rgb:"255,111,168", icon:"💋" },
  pinche: { label:"pinches",                rgb:"255,179,92",  icon:"🔥" },
  ex:     { label:"ex",                     rgb:"180,140,255", icon:"💔" },
  full:   { label:"llegaron hasta el final", rgb:"255,77,94",  icon:"🌶️" }
};
function hookupsAll(){
  return (DATA.hookups||[]).filter(h=> DATA.characters[h.a] && DATA.characters[h.b] && h.a !== h.b);
}
// la historia que lo cuenta: {season, index} (por título, así no se rompe si cambia el orden)
function hookStory(h){
  if(!h.story) return null;
  const s = DATA.seasons.find(x=> String(x.id) === String(h.story.season)); if(!s) return null;
  const i = s.events.findIndex(e=> e.title === h.story.title);
  return i >= 0 ? { season:s, index:i, event:s.events[i] } : null;
}
function hookKind(h){ return HOOK_KINDS[h.kind] || HOOK_KINDS.beso; }
function mapDataHookups(){
  const hs = hookupsAll();
  const deg = {}; hs.forEach(h=>{ deg[h.a] = (deg[h.a]||0) + 1; deg[h.b] = (deg[h.b]||0) + 1; });
  const nodes = Object.keys(deg).map(id=>{
    const c = DATA.characters[id], img = avatarSrc(c);
    return { id, name:c.name, label:shortName(id), color:c.color || "#7fb8ff", img, imgFull: !!img && !c.thumb,
      initials:initials(c.name), n:deg[id], primary: c.tier !== "secundario" };
  });
  // una línea por pareja (si hay dos registros de la misma pareja, gana el primero)
  const seen = new Set(), edges = [];
  hs.forEach(h=>{ const k = [h.a,h.b].sort().join("|"); if(seen.has(k)) return; seen.add(k); edges.push({ a:h.a, b:h.b, w:1, rgb:hookKind(h).rgb, h }); });
  return { nodes, edges, deg };
}
// modo edición: agregar o borrar los que se agregaron en este navegador
function openHookupEditor(){
  const people = Object.entries(DATA.characters).sort((a,b)=> a[1].name.localeCompare(b[1].name));
  const opts = `<option value="">— elige —</option>` + people.map(([id,c])=> `<option value="${id}">${escapeHtml(c.name)}</option>`).join("");
  const stories = `<option value="">— ninguna (lo cuento yo) —</option>` + allEventsFlat().map(r=> `<option value="${r.season.id}|${escapeHtml(r.event.title)}">${escapeHtml(r.season.code)} · ${escapeHtml(r.event.title)}</option>`).join("");
  const local = (loadOverrides().extraHookups||[]);
  openModal(`
    <h3>Agregar a la red 💋</h3>
    <p class="se-sub">Queda en este navegador; pásalo al sitio de todos con 📋 Copiar para Claude.</p>
    <div class="se-grid">
      <div><label for="hk_a">Persona</label><select id="hk_a">${opts}</select></div>
      <div><label for="hk_b">Con</label><select id="hk_b">${opts}</select></div>
    </div>
    <label for="hk_kind">Qué fue</label>
    <select id="hk_kind">${Object.entries(HOOK_KINDS).map(([k,v])=> `<option value="${k}">${v.icon} ${escapeHtml(v.label)}</option>`).join("")}</select>
    <label for="hk_story">La historia donde pasó (opcional)</label><select id="hk_story">${stories}</select>
    <label for="hk_note">Nota (opcional)</label><input id="hk_note" placeholder="ej: en el Año Nuevo">
    <div class="se-error" id="hk_err" role="alert"></div>
    ${local.length ? `<label>Agregados en este navegador</label><ul class="hk-local">${local.map(h=> `<li>${escapeHtml((DATA.characters[h.a]||{}).name||h.a)} ${hookKind(h).icon} ${escapeHtml((DATA.characters[h.b]||{}).name||h.b)}<button type="button" onclick="deleteHookup('${h.uid}')">Borrar</button></li>`).join("")}</ul>` : ""}
    <div class="modal-actions">
      <button type="button" onclick="closeModal()">Cerrar</button>
      <button type="button" class="primary" onclick="saveHookup()">Agregar</button>
    </div>`);
}
function saveHookup(){
  const v = id=> document.getElementById(id).value;
  const a = v("hk_a"), b = v("hk_b"), err = document.getElementById("hk_err");
  if(!a || !b){ err.textContent = "Elige a las dos personas."; return; }
  if(a === b){ err.textContent = "Tienen que ser dos personas distintas."; return; }
  if(hookupsAll().some(h=> (h.a===a && h.b===b) || (h.a===b && h.b===a))){ err.textContent = "Esa pareja ya está en la red."; return; }
  const st = v("hk_story");
  const h = { a, b, kind:v("hk_kind"), story: st ? { season:Number(st.split("|")[0]), title:st.split("|").slice(1).join("|") } : null, note:v("hk_note").trim() || null, uid:newUid(), local:true };
  const ov = loadOverrides();
  ov.extraHookups = (ov.extraHookups||[]).concat([h]);
  saveOverrides(ov);
  DATA.hookups = (DATA.hookups||[]).concat([h]);
  closeModal(); render();
  showToast("Agregado a la red. Para que lo vean todos: 📋 Copiar para Claude.");
}
function deleteHookup(uid){
  if(!confirm("¿Borrar esta línea de la red?")) return;
  const ov = loadOverrides();
  ov.extraHookups = (ov.extraHookups||[]).filter(h=> h.uid !== uid);
  saveOverrides(ov);
  DATA.hookups = (DATA.hookups||[]).filter(h=> h.uid !== uid);
  closeModal(); render();
}

function viewMap(which){
  renderSeasonsStrip(null);
  const app = document.getElementById("app");
  const besos = which === "besos";
  const canHover = matchMedia("(hover:hover) and (pointer:fine)").matches;
  const wide = ()=> matchMedia("(min-width:901px)").matches;
  app.innerHTML = `
    <section class="net-page${besos ? " is-besos" : ""}">
      <div class="net-stage" id="netStage" aria-hidden="true"></div>
      <div class="net-head">
        <div class="map-nets" role="tablist" aria-label="Qué red mostrar">
          <a href="#/map" role="tab" aria-selected="${!besos}" class="${besos ? "" : "active"}">🕸️ Historias</a>
          <a href="#/map/besos" role="tab" aria-selected="${besos}" class="${besos ? "active" : ""}">💋 Quién se comió a quién</a>
        </div>
        <h1>${besos ? "Quién se comió a quién" : "Red de relaciones"}</h1>
        <div class="net-head-row">
          ${besos ? `<button type="button" class="map-add edit-only-btn" onclick="openHookupEditor()">➕ Agregar</button>` : `
          <div class="map-modes" role="group" aria-label="Quiénes mostrar">
            <button type="button" data-mode="all" class="${mapMode==='all'?'active':''}">Todos</button>
            <button type="button" data-mode="group" class="${mapMode==='group'?'active':''}">Solo el grupo</button>
          </div>`}
          <div class="net-hint">${canHover ? "arrastra para girar · rueda para acercar" : "desliza para girar · pellizca para acercar"}</div>
        </div>
      </div>
      <aside class="map-info" id="mapInfo" aria-live="polite"></aside>
      <ul class="sr-only" id="netList" aria-label="Personas de la red"></ul>
    </section>
  `;
  const stage = document.getElementById("netStage");
  const info = document.getElementById("mapInfo");
  const head = app.querySelector(".net-head");
  let g = null, net = null, selected = null;
  const hint = canHover ? "Pasa sobre alguien para ver sus conexiones; clic para abrir su ficha." : "Toca a alguien para ver sus conexiones; tócalo de nuevo para abrir su ficha.";

  const idleInfo = ()=>{
    if(besos){
      const top = Object.entries(g.deg||{}).sort((x,y)=> y[1]-x[1]);
      const max = top.length ? top[0][1] : 0, leaders = top.filter(x=> x[1] === max).map(x=> x[0]);
      const used = [...new Set(g.edges.map(e=> e.h.kind in HOOK_KINDS ? e.h.kind : "beso"))];
      info.innerHTML = g.edges.length ? `
        <div class="mi-eyebrow">La red de besos</div>
        <div class="mi-big"><b>${g.nodes.length}</b> personas · <b>${g.edges.length}</b> ${g.edges.length===1?"pareja":"parejas"}</div>
        ${max > 1 ? `<div class="mi-sub">${leaders.length > 1 ? "Los que suman más" : "Quien suma más"}</div>
        <div class="mi-leaders">${leaders.map(id=> `<button type="button" class="mi-pair" data-pick="${id}">${faceHtml(id,{static:true})}<span class="mi-pn">${escapeHtml(shortName(id))}<em>${max} en la red</em></span></button>`).join("")}</div>` : ""}
        <div class="mi-legend">${used.map(k=> `<span style="--k:rgb(${HOOK_KINDS[k].rgb})"><i></i>${HOOK_KINDS[k].icon} ${escapeHtml(HOOK_KINDS[k].label)}</span>`).join("")}</div>
        <p class="mi-hint">Solo lo que cuentan las historias o lo que se ha contado aparte, nada supuesto. ${hint}</p>`
      : `<div class="mi-eyebrow">La red de besos</div><p class="mi-hint">Todavía no hay nadie en esta red.${isEditOn() ? " Agrega el primero con ➕." : ""}</p>`;
      return;
    }
    const strongest = g.edges.slice().sort((a,b)=> b.w-a.w)[0];
    info.innerHTML = `
      <div class="mi-eyebrow">La red</div>
      <div class="mi-big"><b>${g.nodes.length}</b> personas · <b>${g.edges.length}</b> conexiones</div>
      ${strongest ? `<div class="mi-sub">El lazo más fuerte</div>
      <button type="button" class="mi-pair" data-pick="${strongest.a}">${faceHtml(strongest.a,{static:true})}${faceHtml(strongest.b,{static:true})}<span class="mi-pn">${escapeHtml(shortName(strongest.a))} y ${escapeHtml(shortName(strongest.b))}<em>${strongest.w} historias en común</em></span></button>` : ""}
      <p class="mi-hint">${hint}</p>`;
  };
  const nodeInfo = id=>{
    const n = g.nodes.find(x=> x.id === id); if(!n) return idleInfo();
    if(besos){
      const links = g.edges.filter(e=> e.a===id || e.b===id);
      info.innerHTML = `
        <div class="mi-head">${faceHtml(id)}<div class="mi-who"><div class="mi-name">${escapeHtml(n.name)}</div><div class="mi-sub2">${links.length} en la red</div></div>
          <a class="mi-go" href="#/character/${id}">Ver ficha →</a></div>
        <ol class="mi-hooks">${links.map(e=>{
          const o = e.a===id ? e.b : e.a, k = hookKind(e.h), st = hookStory(e.h);
          return `<li style="--k:rgb(${k.rgb})"><button type="button" data-pick="${o}">${faceHtml(o,{static:true})}<span class="mi-ln">${escapeHtml(DATA.characters[o].name)}</span><em>${k.icon} ${escapeHtml(k.label)}</em></button>
            ${e.h.note || st ? `<div class="mi-hk-note">${e.h.note ? escapeHtml(e.h.note) : ""}${st ? ` <a href="${storyHref(st.season.id, st.index)}">${escapeHtml(st.season.code)} · ${escapeHtml(st.event.title)} →</a>` : ""}</div>` : ""}</li>`;
        }).join("")}</ol>`;
      return;
    }
    const links = g.edges.filter(e=> e.a===id || e.b===id).map(e=> [e.a===id?e.b:e.a, e.w]).sort((a,b)=> b[1]-a[1]);
    info.innerHTML = `
      <div class="mi-head">${faceHtml(id)}<div class="mi-who"><div class="mi-name">${escapeHtml(n.name)}</div><div class="mi-sub2">${n.n} ${n.n===1?"historia":"historias"} · ${links.length} ${links.length===1?"conexión":"conexiones"}</div></div>
        <a class="mi-go" href="#/character/${id}">Ver ficha →</a></div>
      <ol class="mi-links">${links.map(([o,w])=>`<li><button type="button" data-pick="${o}">${faceHtml(o,{static:true})}<span class="mi-ln">${escapeHtml(DATA.characters[o].name)}</span><b>${w}</b></button></li>`).join("")}</ol>`;
  };
  const showInfo = id=> id ? nodeInfo(id) : idleInfo();
  // tocar a alguien en el panel lo elige en la red (gira hasta dejarlo al frente)
  info.addEventListener("click", e=>{
    const b = e.target.closest("[data-pick]");
    if(b && net) net.select(b.dataset.pick);
  });

  function mount(){
    g = besos ? mapDataHookups() : mapData(mapMode);
    selected = null;
    showInfo(null);
    document.getElementById("netList").innerHTML = besos
      ? g.edges.map(e=> `<li>${escapeHtml(DATA.characters[e.a].name)} y ${escapeHtml(DATA.characters[e.b].name)}: ${escapeHtml(hookKind(e.h).label)}</li>`).join("")
      : g.nodes.slice().sort((a,b)=> b.n-a.n).map(n=> `<li><a href="#/character/${n.id}">${escapeHtml(n.name)}, ${n.n} ${n.n===1?"historia":"historias"}</a></li>`).join("");
    if(typeof mountNet3D !== "function" || !g.nodes.length) return;
    net = mountNet3D(stage, {
      nodes: g.nodes, edges: g.edges, canHover,
      // lo que tapan el título y el panel: la nube se centra en lo que queda libre
      insets: ()=> wide()
        ? { top: head.offsetHeight*0.5, right: info.offsetWidth + 28, bottom: 0 }
        : { top: head.offsetHeight, right: 0, bottom: info.offsetHeight + 10 },
      onHover: id=> showInfo(id || selected),
      onSelect: id=>{ selected = id; showInfo(id); },
      onOpen: id=>{ location.hash = `#/character/${id}`; }
    });
  }
  app.querySelectorAll(".map-modes button").forEach(b=> b.addEventListener("click", ()=>{
    if(mapMode === b.dataset.mode) return;
    mapMode = b.dataset.mode;
    app.querySelectorAll(".map-modes button").forEach(x=> x.classList.toggle("active", x === b));
    mount();
  }));
  mount();
  lockWheel = e=>{ if(typeof net3dWheel === "function") net3dWheel(e); };
  const onKey = e=>{ if(e.key === "Escape" && selected && net && !overlayOpen()) net.select(null); };
  document.addEventListener("keydown", onKey);
  viewCleanups.push(()=>{ document.removeEventListener("keydown", onKey); if(typeof unmountNet3D === "function") unmountNet3D(); net = null; });
}

/* =========================== render: RESÚMENES (#/resumen) =========================== */
// El paso de cada persona por la crónica, en diapositivas a pantalla completa (como los
// resúmenes del año de las apps de música): cuántas historias, su debut, su temporada, su
// dupla, su lugar, la noche más concurrida... Todo sale de DATA: si una cifra no existe, la
// diapositiva no sale (nada se inventa). La pantalla no scrollea (mismo bloqueo que la galaxia):
// toque a la derecha avanza, a la izquierda vuelve, deslizar también, y las flechas del teclado.
function personRecap(id){
  const all = allEventsFlat();            // en orden: temporada por temporada, como la crónica
  const mine = all.filter(r=> r.event.chars.includes(id));
  const counts = {};
  all.forEach(r=> r.event.chars.forEach(c=>{ if(DATA.characters[c]) counts[c] = (counts[c]||0) + 1; }));
  const n = mine.length;
  const ahead = Object.entries(counts).filter(([c,k])=> c !== id && k > n).length;
  const tied = Object.entries(counts).filter(([c,k])=> c !== id && k === n).length;
  const tally = list=>{ const m = {}; list.forEach(k=>{ if(k !== null && k !== undefined) m[k] = (m[k]||0) + 1; });
    const arr = Object.entries(m).sort((a,b)=> b[1]-a[1]); const top = arr.length ? arr[0][1] : 0;
    return { top, keys: arr.filter(x=> x[1] === top).map(x=> x[0]) }; };
  const seasons = tally(mine.map(r=> r.season.id));
  const places = tally(mine.map(r=> DATA.places[r.event.place] ? r.event.place : null));
  const co = castOf(mine.map(r=> r.event)).filter(([c])=> c !== id);
  const crowd = mine.slice().sort((a,b)=> b.event.chars.length - a.event.chars.length)[0] || null;
  const seasonSet = [...new Set(mine.map(r=> r.season.code))];
  return { n, total: all.length, ahead, tied, mine, seasons, places, co, crowd, seasonSet,
    first: mine[0] || null, last: mine[mine.length-1] || null, people: Object.keys(counts).length };
}
const andList = arr=> arr.length <= 1 ? (arr[0]||"") : arr.slice(0,-1).join(", ") + " y " + arr[arr.length-1];

function recapSlides(id){
  const c = DATA.characters[id], R = personRecap(id);
  const first = c.name.split(" ")[0];
  const photo = getPhotos(c)[0] || avatarSrc(c);
  const big = (cid, cls)=>{ const p = DATA.characters[cid], src = avatarSrc(p);
    return `<span class="wr-face ${cls||""}" style="--fcolor:${p.color}">${src ? `<img src="${src}" alt="" class="${p.thumb?'':'is-full'}">` : `<b>${escapeHtml(initials(p.name))}</b>`}</span>`; };
  const storyLink = (r, label)=> `<a class="wr-story" href="${storyHref(r.season.id, r.index)}" style="--scolor:${r.season.color}">
      <span class="wr-story-meta">${escapeHtml(r.season.code)} · ${escapeHtml(isPending(r.event.date) ? "fecha pendiente" : r.event.date)}</span>
      <span class="wr-story-title">${escapeHtml(r.event.title)}</span>
      <span class="wr-story-ex">${escapeHtml(excerpt(r.event.content, 130))}</span>
      <span class="wr-story-go">${label || "Leer la historia →"}</span></a>`;
  const S = [];
  S.push({ key:"intro", color:c.color, html:`
    <div class="wr-eyebrow wr-a" style="--d:0">Yoshe con Hoyo · Resumen</div>
    <div class="wr-portrait wr-a" style="--d:1">${photo ? `<img src="${photo}" alt="${escapeHtml(c.name)}">` : `<b>${escapeHtml(initials(c.name))}</b>`}</div>
    <h1 class="wr-title wr-a" style="--d:2">La crónica de <em>${escapeHtml(first)}</em></h1>
    <p class="wr-sub wr-a" style="--d:3">${R.n ? `${R.n} ${R.n===1?"historia":"historias"} · ${R.seasonSet.length} ${R.seasonSet.length===1?"temporada":"temporadas"}` : "Todavía sin historias"}</p>
    <p class="wr-tip wr-a" style="--d:4">toca a la derecha para avanzar</p>` });
  if(!R.n){
    S.push({ key:"empty", color:c.color, html:`
      <h2 class="wr-h wr-a" style="--d:0">La crónica de ${escapeHtml(first)} todavía no empieza</h2>
      <p class="wr-sub wr-a" style="--d:1">Cuando aparezca en una historia, acá va a salir su resumen.</p>` });
  } else {
    const rankLine = R.ahead === 0 ? (R.tied ? `Nadie aparece más (empata con ${R.tied===1?"otra persona":`${R.tied} personas`}).` : "Nadie aparece más en toda la crónica.")
      : R.ahead === 1 ? "Solo una persona aparece más." : `Solo ${R.ahead} personas aparecen más, de ${R.people}.`;
    S.push({ key:"count", color:c.color, html:`
      <div class="wr-eyebrow wr-a" style="--d:0">En la crónica</div>
      <div class="wr-num wr-a" style="--d:1">${R.n}</div>
      <p class="wr-big wr-a" style="--d:2">${R.n===1?"historia":"historias"} con ${escapeHtml(first)} adentro</p>
      <p class="wr-sub wr-a" style="--d:3">de las ${R.total} que tiene la crónica. ${rankLine}</p>
      <div class="wr-dots wr-a" style="--d:4">${DATA.seasons.map(s=> `<span class="${R.seasonSet.includes(s.code)?"on":""}" style="--scolor:${s.color}">${escapeHtml(s.code)}</span>`).join("")}</div>` });
    S.push({ key:"debut", color:R.first.season.color, html:`
      <div class="wr-eyebrow wr-a" style="--d:0">${R.n===1 ? "Su historia, hasta ahora" : "El debut"}</div>
      <h2 class="wr-h wr-a" style="--d:1">${R.n===1 ? `Por ahora, ${escapeHtml(first)} aparece en una sola` : `Todo empezó en ${escapeHtml(R.first.season.code)}`}</h2>
      <div class="wr-a" style="--d:2">${storyLink(R.first)}</div>` });
    if(R.n >= 2){
      const sids = R.seasons.keys, ss = sids.map(k=> DATA.seasons.find(s=> String(s.id) === String(k)));
      const s0 = ss[0];
      S.push({ key:"season", color:s0.color, html:`
        <div class="wr-eyebrow wr-a" style="--d:0">${ss.length > 1 ? "Sus temporadas" : "Su temporada"}</div>
        <div class="wr-code wr-a" style="--d:1">${ss.map(s=> `<span style="color:${s.color}">${escapeHtml(s.code)}</span>`).join(" · ")}</div>
        <p class="wr-big wr-a" style="--d:2">${ss.map(s=> escapeHtml(s.title)).join(" y ")}</p>
        <p class="wr-sub wr-a" style="--d:3">${ss.length > 1 ? `Empatadas: ${R.seasons.top} ${R.seasons.top===1?"historia":"historias"} en cada una.` : `${R.seasons.top} de sus ${R.n} historias pasaron ahí.`}</p>` });
    }
    if(R.co.length){
      const top = R.co[0][1], duo = R.co.filter(x=> x[1] === top).map(x=> x[0]);
      const rest = R.co.filter(x=> x[1] < top).slice(0, 4);
      const names = duo.slice(0, 4).map(x=> escapeHtml(duo.length === 1 ? DATA.characters[x].name : shortName(x)));
      S.push({ key:"duo", color:DATA.characters[duo[0]].color, html:`
        <div class="wr-eyebrow wr-a" style="--d:0">${duo.length > 1 ? (top === 1 ? "Quiénes estuvieron" : "Sus duplas") : "Su dupla"}</div>
        <div class="wr-duo wr-a" style="--d:1">${big(id, "is-me")}<span class="wr-plus">+</span>${duo.slice(0,4).map(x=> big(x)).join("")}</div>
        <h2 class="wr-h wr-a" style="--d:2">${andList(names)}${duo.length > 4 ? ` y ${duo.length-4} más` : ""}</h2>
        <p class="wr-sub wr-a" style="--d:3">${top === 1 && duo.length > 1 ? "Una historia en común con cada persona: la crónica todavía está repartida." : `${top} ${top===1?"historia":"historias"} en común${duo.length > 1 ? " con cada persona" : ""}.`}</p>
        ${rest.length ? `<div class="wr-rest wr-a" style="--d:4">${rest.map(([x,k])=> `<span>${faceHtml(x,{static:true})}${escapeHtml(shortName(x))} <b>${k}</b></span>`).join("")}</div>` : ""}` });
    }
    if(R.places.keys.length){
      const pl = R.places.keys.map(k=> DATA.places[k]);
      S.push({ key:"place", color:"#5fd3c4", html:`
        <div class="wr-eyebrow wr-a" style="--d:0">${pl.length > 1 ? "Sus lugares" : "Su lugar"}</div>
        <div class="wr-icon wr-a" style="--d:1">${pl.slice(0,3).map(p=> p.icon || "📍").join(" ")}</div>
        <h2 class="wr-h wr-a" style="--d:2">${andList(pl.slice(0,3).map(p=> escapeHtml(p.name)))}</h2>
        <p class="wr-sub wr-a" style="--d:3">${R.places.top === 1 ? (pl.length > 1 ? "Una vez en cada uno." : "Una visita registrada, por ahora.") : `${R.places.top} historias ahí${pl.length > 1 ? ", en cada uno" : ""}.`}</p>` });
    }
    if(R.crowd && R.n >= 2 && R.crowd.event.chars.length >= 3){
      const r = R.crowd;
      S.push({ key:"crowd", color:r.season.color, html:`
        <div class="wr-eyebrow wr-a" style="--d:0">La más concurrida</div>
        <div class="wr-num wr-a" style="--d:1">${r.event.chars.length}</div>
        <p class="wr-big wr-a" style="--d:2">personas en una misma historia</p>
        <div class="wr-a" style="--d:3">${storyLink(r)}</div>
        <div class="wr-crowd wr-a" style="--d:4">${facesHtml(r.event.chars.filter(x=> DATA.characters[x]), 14, "faces-sm", true)}</div>` });
    }
    const traits = [
      c.apodo && !isPending(c.apodo) ? `<div class="wr-trait"><span>Le dicen</span><b>“${escapeHtml(c.apodo)}”</b></div>` : "",
      c.habilidad && !isPending(c.habilidad) ? `<div class="wr-trait"><span>Habilidad especial</span><b>${escapeHtml(c.habilidad)}</b></div>` : "",
      c.frase && !isPending(c.frase) ? `<div class="wr-trait"><span>Su frase</span><b>${escapeHtml(c.frase)}</b></div>` : ""
    ].filter(Boolean);
    if(traits.length) S.push({ key:"traits", color:c.color, html:`
        <div class="wr-eyebrow wr-a" style="--d:0">Lo que la crónica dice</div>
        <div class="wr-traits wr-a" style="--d:1">${traits.join("")}</div>` });
  }
  const destino = c.destino && !isPending(c.destino) ? c.destino : null;
  S.push({ key:"outro", color: destino ? "#ff6a6a" : c.color, doom: !!destino, final:true, html:`
    <div class="wr-eyebrow wr-a" style="--d:0">${destino ? "Y en el Armagedón…" : "Y la crónica sigue"}</div>
    ${destino ? `<p class="wr-quote wr-a" style="--d:1">${escapeHtml(destino)}</p>`
      : R.last && R.n > 1 ? `<h2 class="wr-h wr-a" style="--d:1">Su última aparición, por ahora</h2><div class="wr-a" style="--d:2">${storyLink(R.last)}</div>`
      : `<h2 class="wr-h wr-a" style="--d:1">Lo que viene todavía no está escrito.</h2>`}
    <div class="wr-actions wr-a" style="--d:3">
      <a class="wr-btn primary" href="#/character/${id}">Ver la ficha de ${escapeHtml(first)}</a>
      <button type="button" class="wr-btn" data-act="share">Compartir este resumen</button>
      <button type="button" class="wr-btn" data-act="again">Ver de nuevo</button>
      <a class="wr-btn" href="#/resumen">Ver otro resumen</a>
    </div>` });
  return S;
}

function viewRecap(id){
  renderSeasonsStrip(null);
  const app = document.getElementById("app");
  const c = DATA.characters[id];
  if(!c){ location.replace("#/resumen"); return; }
  const slides = recapSlides(id);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DUR = 6500;
  app.innerHTML = `
    <section class="wr-page" style="--pcolor:${c.color}" aria-roledescription="presentación" aria-label="Resumen de ${escapeHtml(c.name)}">
      <div class="wr-bars">${slides.map(()=> `<span><i></i></span>`).join("")}</div>
      <div class="wr-top">
        <a class="wr-who" href="#/character/${id}">${faceHtml(id,{static:true})}<span>${escapeHtml(c.name)}</span></a>
        <button type="button" class="wr-x" aria-label="Pausar" data-act="pause">❚❚</button>
        <a class="wr-x" href="#/resumen" aria-label="Cerrar">✕</a>
      </div>
      <div class="wr-stage">${slides.map((s,i)=> `<div class="wr-slide${s.doom?" is-doom":""}" data-i="${i}" style="--scolor:${s.color}" aria-hidden="true"><div class="wr-inner">${s.html}</div></div>`).join("")}</div>
      <button type="button" class="wr-nav wr-prev" aria-label="Anterior">‹</button>
      <button type="button" class="wr-nav wr-next" aria-label="Siguiente">›</button>
    </section>`;
  const page = app.querySelector(".wr-page");
  const els = [...page.querySelectorAll(".wr-slide")], bars = [...page.querySelectorAll(".wr-bars i")];
  const pauseBtn = page.querySelector('[data-act="pause"]');
  let i = 0, t0 = 0, acc = 0, paused = reduced, raf = null, alive = true, held = false;
  function show(k){
    i = Math.max(0, Math.min(slides.length-1, k));
    els.forEach((el,j)=>{ el.classList.toggle("is-on", j === i); el.classList.toggle("is-past", j < i); el.setAttribute("aria-hidden", j === i ? "false" : "true"); });
    bars.forEach((b,j)=> b.style.transform = `scaleX(${j < i ? 1 : 0})`);
    page.style.setProperty("--scolor", slides[i].color);
    page.classList.toggle("is-doom", !!slides[i].doom);
    acc = 0; t0 = performance.now();
    loop();
  }
  function setPaused(p){ paused = p; pauseBtn.textContent = p ? "▶" : "❚❚"; pauseBtn.setAttribute("aria-label", p ? "Seguir" : "Pausar"); t0 = performance.now(); loop(); }
  function loop(){
    if(raf !== null || !alive) return;
    raf = requestAnimationFrame(function tick(now){
      raf = null; if(!alive) return;
      const run = !paused && !held && !document.hidden && !slides[i].final;
      if(run){ acc += now - t0; }
      t0 = now;
      const k = Math.min(1, acc / DUR);
      if(bars[i]) bars[i].style.transform = `scaleX(${slides[i].final ? 1 : k})`;
      if(k >= 1 && !slides[i].final){ show(i+1); return; }
      if(run) raf = requestAnimationFrame(tick);
    });
  }
  // toque: derecha avanza, izquierda vuelve; mantener apretado pausa; deslizar cambia
  const stage = page.querySelector(".wr-stage");
  let down = null, holdT = null;
  stage.addEventListener("pointerdown", e=>{
    if(e.target.closest("a, button")) return;
    down = { x:e.clientX, y:e.clientY, t:performance.now() };
    holdT = setTimeout(()=>{ held = true; page.classList.add("is-held"); }, 220);
  });
  const up = e=>{
    clearTimeout(holdT);
    const wasHeld = held; held = false; page.classList.remove("is-held");
    if(!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y; const d = down; down = null;
    if(Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)){ show(i + (dx < 0 ? 1 : -1)); return; }
    if(wasHeld || performance.now() - d.t > 400){ t0 = performance.now(); loop(); return; }
    const r = stage.getBoundingClientRect();
    show(i + (e.clientX - r.left < r.width*0.33 ? -1 : 1));
  };
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", ()=>{ clearTimeout(holdT); held = false; down = null; page.classList.remove("is-held"); t0 = performance.now(); loop(); });
  page.querySelector(".wr-prev").addEventListener("click", ()=> show(i-1));
  page.querySelector(".wr-next").addEventListener("click", ()=> show(i+1));
  pauseBtn.addEventListener("click", ()=> setPaused(!paused));
  page.addEventListener("click", e=>{
    const b = e.target.closest("[data-act]"); if(!b) return;
    if(b.dataset.act === "again") show(0);
    if(b.dataset.act === "share"){
      const url = location.href.split("#")[0] + `#/resumen/${id}`;
      try{
        if(navigator.share && matchMedia("(pointer:coarse)").matches){ navigator.share({ title:`Resumen de ${c.name}`, url }).catch(()=>{}); return; }
        navigator.clipboard.writeText(url).then(()=> showToast("Enlace del resumen copiado."), ()=> showToast("No se pudo copiar el enlace."));
      }catch(err){ showToast("No se pudo copiar el enlace."); }
    }
  });
  const onKey = e=>{
    if(overlayOpen()) return;
    if(e.key === "ArrowRight" || e.key === " "){ e.preventDefault(); show(i+1); }
    else if(e.key === "ArrowLeft"){ e.preventDefault(); show(i-1); }
    else if(e.key === "Escape") location.hash = "#/resumen";
  };
  const onVis = ()=>{ t0 = performance.now(); if(!document.hidden) loop(); };
  document.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVis);
  viewCleanups.push(()=>{ alive = false; if(raf !== null) cancelAnimationFrame(raf); clearTimeout(holdT);
    document.removeEventListener("keydown", onKey); document.removeEventListener("visibilitychange", onVis); });
  if(reduced) setPaused(true);
  show(0);
}

// el índice: elegir de quién ver el resumen
function viewRecapIndex(){
  renderSeasonsStrip(null);
  const app = document.getElementById("app");
  const counts = {}; allEventsFlat().forEach(r=> r.event.chars.forEach(c=>{ counts[c] = (counts[c]||0) + 1; }));
  const ids = Object.keys(DATA.characters).filter(id=> counts[id]);
  const group = ids.filter(id=> DATA.characters[id].tier !== "secundario").sort((a,b)=> counts[b]-counts[a] || DATA.characters[a].name.localeCompare(DATA.characters[b].name));
  const others = ids.filter(id=> DATA.characters[id].tier === "secundario").sort((a,b)=> counts[b]-counts[a] || DATA.characters[a].name.localeCompare(DATA.characters[b].name));
  const card = id=>{ const c = DATA.characters[id], src = avatarSrc(c);
    return `<a class="ri-card" href="#/resumen/${id}" style="--fcolor:${c.color}">
      <span class="ri-face">${src ? `<img src="${src}" alt="" loading="lazy" class="${c.thumb?'':'is-full'}">` : `<b>${escapeHtml(initials(c.name))}</b>`}</span>
      <span class="ri-name">${escapeHtml(c.name)}</span>
      <span class="ri-n">${counts[id]} ${counts[id]===1?"historia":"historias"}</span>
      <span class="ri-play" aria-hidden="true">▶</span></a>`; };
  app.innerHTML = `
    <section class="season-hero ri-hero" style="--scolor:var(--amber); border-bottom:none;">
      <div class="scode-big">Resúmenes</div>
      <h1>El paso de cada uno por la crónica</h1>
      <p class="hito">Elige a alguien y mira su resumen en diapositivas: su debut, su temporada, su dupla, su lugar. Todo sale de las historias, nada inventado.</p>
    </section>
    <div class="ri-wrap">
      <h2 class="ri-h">Del grupo</h2>
      <div class="ri-grid reveal-stagger">${group.map(card).join("")}</div>
      ${others.length ? `<h2 class="ri-h">Apariciones especiales</h2><div class="ri-grid ri-grid-sm reveal-stagger">${others.map(card).join("")}</div>` : ""}
    </div>
    ${siteFooter()}`;
  setupReveals();
}

/* =========================== render: JUEGO (#/juego) =========================== */
// "¿Cuánto sabes de la crónica?": 10 preguntas armadas al azar desde DATA (quién no estuvo,
// de qué historia es este pedazo, dónde fue, en qué temporada, la dupla de alguien...). Nada
// inventado: cada pregunta sale de una historia real y la respuesta enlaza a ella. El mejor
// puntaje queda en este navegador (localStorage, con try/catch como todo lo demás).
const QZ_BEST = "ychQuizBest_v1";
const QZ_LEN = 10;
const qzPick = arr=> arr[Math.floor(Math.random()*arr.length)];
function qzShuffle(arr){ const a = arr.slice(); for(let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; } return a; }
const qzSample = (arr, n)=> qzShuffle(arr).slice(0, n);
function qzPersonOpt(id){ const c = DATA.characters[id]; return { key:id, label:c.name, html:`${faceHtml(id,{static:true})}<span class="qz-l">${escapeHtml(c.name)}</span>` }; }
function qzStoryRef(r){ return `«${escapeHtml(r.event.title)}» <span class="qz-code" style="color:${r.season.color}">${escapeHtml(r.season.code)}</span>`; }

function quizGenerators(){
  const all = allEventsFlat();
  const counts = {}; all.forEach(r=> r.event.chars.forEach(c=>{ if(DATA.characters[c]) counts[c] = (counts[c]||0) + 1; }));
  const people = Object.keys(counts);
  const regular = people.filter(id=> counts[id] >= 2);
  const valid = r=> r.event.chars.filter(c=> DATA.characters[c]);
  return {
    // quién NO estuvo en una historia
    notThere(){
      const r = qzPick(all.filter(x=> valid(x).length >= 3)); if(!r) return null;
      const inIt = valid(r);
      const pool = regular.filter(id=> !inIt.includes(id)); if(!pool.length) return null;
      const odd = qzPick(pool);
      const opts = qzShuffle(qzSample(inIt, 3).concat([odd])).map(qzPersonOpt);
      return { kind:"¿Quién no estuvo?", key:"not:"+r.season.id+":"+r.index, r,
        prompt:`¿Quién <b>no</b> estuvo en ${qzStoryRef(r)}?`, opts, answer:odd,
        explain:`${escapeHtml(DATA.characters[odd].name)} no aparece en esa historia. Estuvieron: ${escapeHtml(andList(inIt.map(shortName)))}.` };
    },
    // de qué historia es este pedazo (con los nombres tapados)
    whichStory(){
      if(all.length < 4) return null;
      const r = qzPick(all);
      const masked = (r.event.content||[]).map(sg=> sg.t === "text" ? sg.v : "▁▁▁").join("").replace(ASK_RE, "");
      // (sin lookbehind en la regex: un Safari viejo no la entiende y se caería todo app.js)
      const sentences = masked.replace(/([.!?…])\s+/g, "$1\n").split(/\n+/).map(x=> x.trim()).filter(x=> x.length >= 45 && x.length <= 230 && (x.match(/▁▁▁/g)||[]).length <= 3);
      if(!sentences.length) return null;
      const snippet = qzPick(sentences);
      const others = qzSample(all.filter(x=> x !== r), 3);
      const opts = qzShuffle([r].concat(others)).map(x=> ({ key:x.season.id+":"+x.index, label:x.event.title, html:`<span class="qz-l">${escapeHtml(x.event.title)}</span><em style="color:${x.season.color}">${escapeHtml(x.season.code)}</em>` }));
      return { kind:"¿De qué historia es?", key:"which:"+r.season.id+":"+r.index, r,
        prompt:"¿De qué historia es este pedazo?", context:`<blockquote class="qz-quote">“${escapeHtml(snippet).replace(/▁▁▁/g, '<span class="qz-blank">▁▁▁</span>')}”</blockquote>`,
        opts, answer:r.season.id+":"+r.index, explain:`Es de ${qzStoryRef(r)}.` };
    },
    // dónde fue
    where(){
      const r = qzPick(all.filter(x=> DATA.places[x.event.place])); if(!r) return null;
      const placeIds = Object.keys(DATA.places).filter(p=> p !== r.event.place);
      if(placeIds.length < 3) return null;
      const opts = qzShuffle([r.event.place].concat(qzSample(placeIds, 3))).map(p=> ({ key:p, label:DATA.places[p].name, html:`<b class="qz-ico">${DATA.places[p].icon||"📍"}</b><span class="qz-l">${escapeHtml(DATA.places[p].name)}</span>` }));
      return { kind:"¿Dónde fue?", key:"where:"+r.season.id+":"+r.index, r,
        prompt:`¿Dónde pasó «${escapeHtml(r.event.title)}»?`, opts, answer:r.event.place,
        explain:`Fue en ${DATA.places[r.event.place].icon||""} ${escapeHtml(DATA.places[r.event.place].name)}.` };
    },
    // en qué temporada
    when(){
      const r = qzPick(all); if(!r || DATA.seasons.length < 4) return null;
      const opts = qzShuffle([r.season].concat(qzSample(DATA.seasons.filter(s=> s !== r.season), 3))).map(s=> ({ key:String(s.id), label:s.code, html:`<b class="qz-ico" style="color:${s.color}">${escapeHtml(s.code)}</b><span class="qz-l">${escapeHtml(s.title)}</span>` }));
      return { kind:"¿En qué temporada?", key:"when:"+r.season.id+":"+r.index, r,
        prompt:`¿En qué temporada pasó «${escapeHtml(r.event.title)}»?`, opts, answer:String(r.season.id),
        explain:`Fue en ${escapeHtml(r.season.code)} · ${escapeHtml(r.season.title)}${isPending(r.event.date) ? "" : ` (${escapeHtml(r.event.date)})`}.` };
    },
    // quién estuvo en las dos
    both(){
      const id = qzPick(regular); if(!id) return null;
      const mine = all.filter(r=> r.event.chars.includes(id)); if(mine.length < 2) return null;
      const [a, b] = qzSample(mine, 2);
      const inBoth = x=> a.event.chars.includes(x) && b.event.chars.includes(x);
      const pool = people.filter(x=> !inBoth(x)); if(pool.length < 3) return null;
      const opts = qzShuffle([id].concat(qzSample(pool, 3))).map(qzPersonOpt);
      return { kind:"¿Quién estuvo en las dos?", key:"both:"+id, r:a,
        prompt:`¿Quién estuvo en ${qzStoryRef(a)} <i>y también</i> en ${qzStoryRef(b)}?`, opts, answer:id,
        explain:`${escapeHtml(DATA.characters[id].name)} estuvo en las dos${people.filter(inBoth).length > 1 ? ` (no fue la única persona: ${escapeHtml(andList(people.filter(inBoth).filter(x=> x !== id).map(shortName)))} también)` : ""}.` };
    },
    // la dupla de alguien
    duo(){
      const id = qzPick(regular.filter(x=> DATA.characters[x].tier !== "secundario")); if(!id) return null;
      const co = castOf(all.filter(r=> r.event.chars.includes(id)).map(r=> r.event)).filter(([c])=> c !== id);
      if(co.length < 2 || co[0][1] === co[1][1] || co[0][1] < 2) return null;   // sin empate en el primer lugar
      const top = co[0][0];
      const pool = people.filter(x=> x !== id && x !== top); if(pool.length < 3) return null;
      const opts = qzShuffle([top].concat(qzSample(pool, 3))).map(qzPersonOpt);
      return { kind:"Su dupla", key:"duo:"+id,
        prompt:`¿Con quién ha compartido más historias ${escapeHtml(DATA.characters[id].name)}?`, opts, answer:top,
        explain:`Con ${escapeHtml(DATA.characters[top].name)}: ${co[0][1]} historias en común.`, href:`#/resumen/${id}` };
    },
    // quién aparece más
    most(){
      const byN = {}; people.forEach(x=>{ (byN[counts[x]] = byN[counts[x]] || []).push(x); });
      const ns = Object.keys(byN).map(Number).sort((a,b)=> b-a);
      if(ns.length < 4) return null;
      const picks = qzSample(ns.slice(0, 8), 4).map(n=> qzPick(byN[n]));
      const top = picks.slice().sort((a,b)=> counts[b]-counts[a])[0];
      return { kind:"¿Quién aparece más?", key:"most:"+picks.slice().sort().join(","),
        prompt:"De estas cuatro personas, ¿quién aparece en más historias?", opts:qzShuffle(picks).map(qzPersonOpt), answer:top,
        explain:picks.slice().sort((a,b)=> counts[b]-counts[a]).map(x=> `${escapeHtml(shortName(x))}: ${counts[x]}`).join(" · ") };
    },
    // a quién le dicen así
    nickname(){
      const withNick = people.filter(x=> DATA.characters[x].apodo && !isPending(DATA.characters[x].apodo));
      const id = qzPick(withNick); if(!id) return null;
      const pool = people.filter(x=> x !== id); if(pool.length < 3) return null;
      const opts = qzShuffle([id].concat(qzSample(pool, 3))).map(qzPersonOpt);
      return { kind:"El apodo", key:"nick:"+id, prompt:`¿A quién le dicen <b>«${escapeHtml(DATA.characters[id].apodo)}»</b>?`, opts, answer:id,
        explain:`A ${escapeHtml(DATA.characters[id].name)}.`, href:`#/character/${id}` };
    },
    // cuántos estuvieron
    howMany(){
      const r = qzPick(all.filter(x=> valid(x).length >= 2)); if(!r) return null;
      const n = valid(r).length;
      const set = new Set([n]); const deltas = qzShuffle([-3,-2,-1,1,2,3,4]);
      for(const d of deltas){ if(set.size >= 4) break; if(n + d >= 1) set.add(n + d); }
      const opts = [...set].sort((a,b)=> a-b).map(k=> ({ key:String(k), label:String(k), html:`<b class="qz-ico">${k}</b><span class="qz-l">${k===1?"persona":"personas"}</span>` }));
      return { kind:"¿Cuántos fueron?", key:"many:"+r.season.id+":"+r.index, r,
        prompt:`¿Cuántas personas aparecen en ${qzStoryRef(r)}?`, opts, answer:String(n),
        explain:`${n}: ${escapeHtml(andList(valid(r).map(shortName)))}.` };
    },
    // qué pasó primero (dos historias de temporadas distintas)
    first(){
      const a = qzPick(all), b = qzPick(all.filter(x=> x.season !== (a && a.season)));
      if(!a || !b) return null;
      const first = DATA.seasons.indexOf(a.season) < DATA.seasons.indexOf(b.season) ? a : b;
      const opts = qzShuffle([a, b]).map(x=> ({ key:x.season.id+":"+x.index, label:x.event.title, html:`<span class="qz-l">${escapeHtml(x.event.title)}</span>` }));
      return { kind:"¿Qué pasó primero?", key:"first:"+[a,b].map(x=> x.season.id+":"+x.index).sort().join("|"), r:first,
        prompt:"¿Cuál de estas dos historias pasó primero?", opts, answer:first.season.id+":"+first.index,
        explain:`${qzStoryRef(first)} fue antes${first === a ? ` que ${qzStoryRef(b)}` : ` que ${qzStoryRef(a)}`}.` };
    }
  };
}
// una partida: QZ_LEN preguntas de tipos variados, sin repetir la misma pregunta
function buildQuizRound(){
  const G = quizGenerators();
  const weights = [["notThere",3],["whichStory",3],["where",2],["when",2],["both",2],["duo",1],["most",1],["nickname",1],["howMany",1],["first",2]];
  const bag = []; weights.forEach(([k,w])=>{ for(let i=0;i<w;i++) bag.push(k); });
  const out = [], seen = new Set(), kindCount = {};
  for(let tries = 0; out.length < QZ_LEN && tries < 400; tries++){
    const k = qzPick(bag);
    if((kindCount[k]||0) >= 3) continue;
    let q = null; try{ q = G[k](); }catch(e){ q = null; }
    if(!q || seen.has(q.key) || q.opts.length < 2) continue;
    seen.add(q.key); kindCount[k] = (kindCount[k]||0) + 1;
    q.explain = q.explain.replace(/\.\.$/, ".");   // "…y María C.." → "…y María C."
    out.push(q);
  }
  return out;
}
function quizRank(score, n){
  const k = score / Math.max(1, n);
  if(k === 1) return ["Historiador del Hoyo", "Perfecto. Te sabes la crónica mejor que quienes la vivieron."];
  if(k >= .8) return ["Del núcleo duro", "Estuviste en todas, o te las contaron con lujo de detalles."];
  if(k >= .5) return ["Fue a hartos carretes", "Te sabes lo importante; algunos detalles se perdieron en la noche."];
  if(k >= .3) return ["Escuchó un par de historias", "Hay temporadas enteras que te tocan leer."];
  return ["¿Recién llegaste?", "Buen momento para leer la crónica desde la S0."];
}
function readBest(){ try{ return JSON.parse(localStorage.getItem(QZ_BEST)) || null; }catch(e){ return null; } }
function writeBest(v){ try{ localStorage.setItem(QZ_BEST, JSON.stringify(v)); }catch(e){ /* sin storage: no se recuerda el récord */ } }

function viewQuiz(){
  renderSeasonsStrip(null);
  const app = document.getElementById("app");
  let round = [], qi = 0, score = 0, streak = 0, bestStreak = 0, answered = false, log = [];
  const best = ()=> readBest();
  function frame(inner){
    app.innerHTML = `<section class="qz-page"><div class="qz-wrap">${inner}</div></section>`;
  }
  function start(){
    const b = best();
    frame(`
      <div class="qz-hero">
        <div class="qz-eyebrow">El juego de la crónica</div>
        <h1>¿Cuánto sabes de Yoshe con Hoyo?</h1>
        <p class="qz-lead">${QZ_LEN} preguntas armadas al azar desde las historias: quién no estuvo, de qué historia es un pedazo, dónde fue, en qué temporada… Cada partida es distinta.</p>
        <button type="button" class="qz-btn primary qz-go" data-act="start">Empezar</button>
        ${b ? `<div class="qz-best">Tu mejor partida en este navegador: <b>${b.score}/${b.n}</b> · ${escapeHtml(quizRank(b.score, b.n)[0])}</div>` : ""}
        <div class="qz-kinds">${["¿Quién no estuvo?","¿De qué historia es?","¿Dónde fue?","¿En qué temporada?","¿Quién estuvo en las dos?","Su dupla","¿Qué pasó primero?"].map(k=> `<span>${k}</span>`).join("")}</div>
      </div>
      ${siteFooter()}`);
    setupReveals();
  }
  function ask(){
    answered = false;
    const q = round[qi];
    frame(`
      <div class="qz-top">
        <div class="qz-progress"><i style="width:${(qi/round.length*100).toFixed(1)}%"></i></div>
        <div class="qz-meta"><span>Pregunta <b>${qi+1}</b> de ${round.length}</span><span class="qz-score">${score} ${score===1?"punto":"puntos"}${streak >= 2 ? ` · <em>racha ${streak} 🔥</em>` : ""}</span></div>
      </div>
      <div class="qz-card" style="--scolor:${q.r ? q.r.season.color : "var(--amber)"}">
        <div class="qz-kind">${escapeHtml(q.kind)}</div>
        <h2 class="qz-q">${q.prompt}</h2>
        ${q.context || ""}
        <div class="qz-opts${q.opts.length === 2 ? " is-two" : ""}">${q.opts.map((o,k)=> `<button type="button" class="qz-opt" data-key="${escapeHtml(o.key)}"><span class="qz-n">${k+1}</span>${o.html}</button>`).join("")}</div>
        <div class="qz-feedback" id="qzFeedback" aria-live="polite"></div>
      </div>`);
  }
  function answer(key){
    if(answered) return;
    answered = true;
    const q = round[qi];
    const ok = key === q.answer;
    if(ok){ score++; streak++; bestStreak = Math.max(bestStreak, streak); } else streak = 0;
    log.push({ q, ok });
    app.querySelectorAll(".qz-opt").forEach(b=>{
      b.disabled = true;
      if(b.dataset.key === q.answer) b.classList.add("is-right");
      else if(b.dataset.key === key) b.classList.add("is-wrong");
      else b.classList.add("is-dim");
    });
    const href = q.href || (q.r ? storyHref(q.r.season.id, q.r.index) : null);
    const last = qi === round.length - 1;
    document.getElementById("qzFeedback").innerHTML = `
      <div class="qz-verdict ${ok ? "ok" : "bad"}">${ok ? qzPick(["¡Bien!","¡Exacto!","¡Eso!","Correcto."]) : qzPick(["No…","Casi.","Nop.","Fallaste esta."])}</div>
      <p>${q.explain}</p>
      <div class="qz-next-row">
        ${href ? `<a class="qz-link" href="${href}" target="_blank" rel="noopener">${q.r && !q.href ? "Leer la historia ↗" : "Ver más ↗"}</a>` : "<span></span>"}
        <button type="button" class="qz-btn primary" data-act="next">${last ? "Ver resultado" : "Siguiente →"}</button>
      </div>`;
    const sc = app.querySelector(".qz-score"); if(sc) sc.innerHTML = `${score} ${score===1?"punto":"puntos"}${streak >= 2 ? ` · <em>racha ${streak} 🔥</em>` : ""}`;
    const nb = app.querySelector('[data-act="next"]'); if(nb) nb.focus({ preventScroll:true });
    const fb = document.getElementById("qzFeedback"); if(fb && fb.scrollIntoView) fb.scrollIntoView({ block:"nearest", behavior:"smooth" });
  }
  function finish(){
    const n = round.length;
    const [title, line] = quizRank(score, n);
    const prev = best();
    const isBest = !prev || score/n > prev.score/prev.n;
    if(isBest) writeBest({ score, n });
    frame(`
      <div class="qz-end">
        <div class="qz-eyebrow">Resultado</div>
        <div class="qz-final"><b>${score}</b><span>/ ${n}</span></div>
        <h1 class="qz-rank">${escapeHtml(title)}</h1>
        <p class="qz-lead">${escapeHtml(line)}${bestStreak >= 3 ? ` Mejor racha: ${bestStreak} seguidas.` : ""}</p>
        ${isBest && prev ? `<div class="qz-best is-new">¡Tu mejor partida hasta ahora!</div>` : ""}
        <div class="qz-end-actions">
          <button type="button" class="qz-btn primary" data-act="start">Otra partida</button>
          <button type="button" class="qz-btn" data-act="share">Compartir resultado</button>
        </div>
        <ol class="qz-review">${log.map(({q, ok})=>{
          const href = q.href || (q.r ? storyHref(q.r.season.id, q.r.index) : null);
          return `<li class="${ok ? "ok" : "bad"}"><span class="qz-mark">${ok ? "✓" : "✗"}</span><div><div class="qz-rv-q">${q.prompt}</div><div class="qz-rv-a">${q.explain}</div></div>${href ? `<a href="${href}" aria-label="Ver">→</a>` : ""}</li>`;
        }).join("")}</ol>
      </div>
      ${siteFooter()}`);
    setupReveals();
  }
  function begin(){ round = buildQuizRound(); qi = 0; score = 0; streak = 0; bestStreak = 0; log = []; if(!round.length){ frame(`<div class="qz-hero"><h1>Todavía no hay suficientes historias para jugar.</h1></div>`); return; } ask(); window.scrollTo({ top:0, behavior:"instant" }); }
  app.onclick = e=>{
    const opt = e.target.closest(".qz-opt"); if(opt){ answer(opt.dataset.key); return; }
    const b = e.target.closest("[data-act]"); if(!b) return;
    const act = b.dataset.act;
    if(act === "start") begin();
    else if(act === "next"){ if(qi < round.length - 1){ qi++; ask(); window.scrollTo({ top:0, behavior:"instant" }); } else finish(); }
    else if(act === "share"){
      const text = `Saqué ${score}/${round.length} en el juego de Yoshe con Hoyo (${quizRank(score, round.length)[0]}). ¿Cuánto sabes tú?`;
      const url = location.href.split("#")[0] + "#/juego";
      try{
        if(navigator.share && matchMedia("(pointer:coarse)").matches){ navigator.share({ title:"Yoshe con Hoyo", text, url }).catch(()=>{}); return; }
        navigator.clipboard.writeText(`${text} ${url}`).then(()=> showToast("Resultado copiado: pégalo en el grupo."), ()=> showToast("No se pudo copiar."));
      }catch(err){ showToast("No se pudo copiar."); }
    }
  };
  // teclado: 1-4 responde, Enter sigue
  const onKey = e=>{
    if(overlayOpen() || e.target.closest && e.target.closest("input, textarea")) return;
    if(/^[1-4]$/.test(e.key) && !answered){ const b = app.querySelectorAll(".qz-opt")[Number(e.key)-1]; if(b){ e.preventDefault(); b.click(); } }
  };
  document.addEventListener("keydown", onKey);
  viewCleanups.push(()=>{ document.removeEventListener("keydown", onKey); app.onclick = null; });
  start();
}

/* =========================== render: JUNTOS (#/juntos/a/b) =========================== */
// Dos personas frente a frente: cuántas historias comparten, qué parte de la crónica de cada
// una es con la otra, la primera y la última juntas, sus lugares y quién más suele estar.
// Si no comparten ninguna, quién las une. Todo calculado desde DATA.
function viewTogether(a, b){
  renderSeasonsStrip(null);
  const app = document.getElementById("app");
  const all = allEventsFlat();
  const counts = {}; all.forEach(r=> r.event.chars.forEach(c=>{ if(DATA.characters[c]) counts[c] = (counts[c]||0) + 1; }));
  const people = Object.keys(counts).sort((x,y)=> (DATA.characters[x].tier==="secundario") - (DATA.characters[y].tier==="secundario") || counts[y]-counts[x] || DATA.characters[x].name.localeCompare(DATA.characters[y].name));
  if(!DATA.characters[a]) a = null;
  if(!DATA.characters[b] || b === a) b = null;
  // las parejas que más se repiten: atajos
  const pairs = {};
  all.forEach(r=>{ const cs = r.event.chars.filter(c=> DATA.characters[c]); for(let i=0;i<cs.length;i++) for(let j=i+1;j<cs.length;j++){ const k = [cs[i],cs[j]].sort().join("|"); pairs[k] = (pairs[k]||0) + 1; } });
  const topPairs = Object.entries(pairs).sort((x,y)=> y[1]-x[1]).slice(0, 6);
  const opt = (sel, other)=> `<option value="">— elige a alguien —</option>` + people.map(id=> `<option value="${id}" ${id===sel?"selected":""} ${id===other?"disabled":""}>${escapeHtml(DATA.characters[id].name)} (${counts[id]})</option>`).join("");
  const big = id=>{ const c = DATA.characters[id], src = avatarSrc(c);
    return `<a class="tg-face" href="#/character/${id}" style="--fcolor:${c.color}" title="${escapeHtml(c.name)}">${src ? `<img src="${src}" alt="" class="${c.thumb?'':'is-full'}">` : `<b>${escapeHtml(initials(c.name))}</b>`}</a>`; };

  let body = "";
  if(a && b){
    const A = DATA.characters[a], B = DATA.characters[b];
    const fa = shortName(a), fb = shortName(b);
    const shared = all.filter(r=> r.event.chars.includes(a) && r.event.chars.includes(b));
    const n = shared.length;
    const pct = id=> Math.round(n / counts[id] * 100);
    if(n){
      const placeT = {}; shared.forEach(r=>{ if(DATA.places[r.event.place]) placeT[r.event.place] = (placeT[r.event.place]||0) + 1; });
      const pl = Object.entries(placeT).sort((x,y)=> y[1]-x[1]);
      const others = castOf(shared.map(r=> r.event)).filter(([c])=> c !== a && c !== b);
      const seasonsT = [...new Set(shared.map(r=> r.season.code))];
      const hk = hookupsAll().find(h=> (h.a===a && h.b===b) || (h.a===b && h.b===a));
      const hkSt = hk && hookStory(hk);
      body = `
        <div class="tg-num"><b>${n}</b><span>${n===1?"historia":"historias"} en común</span></div>
        ${hk ? `<div class="tg-hook" style="--k:rgb(${hookKind(hk).rgb})"><span>${hookKind(hk).icon} ${escapeHtml(hookKind(hk).label)}${hkSt ? ` · <a href="${storyHref(hkSt.season.id, hkSt.index)}">${escapeHtml(hkSt.event.title)} →</a>` : ""} · <a href="#/map/besos">ver la red</a></span></div>` : ""}
        <div class="tg-bars">
          <div class="tg-bar" style="--fcolor:${A.color}"><span>${escapeHtml(fa)}</span><i><em style="width:${pct(a)}%"></em></i><b>${pct(a)}%</b><small>de sus ${counts[a]} historias son con ${escapeHtml(fb)}</small></div>
          <div class="tg-bar" style="--fcolor:${B.color}"><span>${escapeHtml(fb)}</span><i><em style="width:${pct(b)}%"></em></i><b>${pct(b)}%</b><small>de sus ${counts[b]} historias son con ${escapeHtml(fa)}</small></div>
        </div>
        ${seasonDotsHtml(seasonsT)}
        <div class="tg-grid">
          ${n > 1 ? `<div class="tg-cell"><div class="tg-k">La primera juntos</div>${storyCardHtml(shared[0], {noPlace:false})}</div>
          <div class="tg-cell"><div class="tg-k">La última, por ahora</div>${storyCardHtml(shared[n-1])}</div>`
                  : `<div class="tg-cell tg-wide"><div class="tg-k">Su única historia juntos</div>${storyCardHtml(shared[0])}</div>`}
        </div>
        <div class="tg-grid">
          ${pl.length ? `<div class="tg-cell"><div class="tg-k">Dónde coinciden</div><ul class="tg-list">${pl.map(([p,k])=> `<li><a href="#/place/${p}">${DATA.places[p].icon||"📍"} ${escapeHtml(DATA.places[p].name)}</a><b>${k}</b></li>`).join("")}</ul></div>` : ""}
          ${others.length ? `<div class="tg-cell"><div class="tg-k">Quién más suele estar</div><ul class="tg-list">${others.slice(0,6).map(([c,k])=> `<li><a href="#/juntos/${a}/${c}">${faceHtml(c,{static:true})} ${escapeHtml(DATA.characters[c].name)}</a><b>${k}</b></li>`).join("")}</ul></div>` : ""}
        </div>
        ${n > 2 ? `<h2 class="tg-h">Todas sus historias juntos</h2><div class="tg-stories">${shared.map(r=> storyCardHtml(r)).join("")}</div>` : ""}`;
    } else {
      // no comparten: ¿quién los une? (alguien que comparte historias con los dos)
      const coA = {}, coB = {};
      all.forEach(r=>{ const cs = r.event.chars; if(cs.includes(a)) cs.forEach(c=> coA[c] = (coA[c]||0) + 1); if(cs.includes(b)) cs.forEach(c=> coB[c] = (coB[c]||0) + 1); });
      const bridges = Object.keys(coA).filter(c=> c !== a && c !== b && coB[c] && DATA.characters[c]).sort((x,y)=> (coA[y]+coB[y]) - (coA[x]+coB[x])).slice(0, 5);
      body = `
        <div class="tg-num tg-zero"><b>0</b><span>historias en común, todavía</span></div>
        <p class="tg-lead">${escapeHtml(fa)} y ${escapeHtml(fb)} no han coincidido en ninguna historia de la crónica.</p>
        ${bridges.length ? `<div class="tg-cell tg-wide"><div class="tg-k">Los une</div><ul class="tg-list">${bridges.map(c=> `<li><span>${faceHtml(c)} ${escapeHtml(DATA.characters[c].name)}</span><b>${coA[c]} con ${escapeHtml(fa)} · ${coB[c]} con ${escapeHtml(fb)}</b></li>`).join("")}</ul></div>` : ""}`;
    }
  }
  app.innerHTML = `
    <section class="season-hero tg-hero" style="--scolor:var(--amber); border-bottom:none;">
      <div class="scode-big">Juntos</div>
      <h1>${a && b ? `${escapeHtml(DATA.characters[a].name.split(" ")[0])} <span class="tg-amp">&</span> ${escapeHtml(DATA.characters[b].name.split(" ")[0])}` : "Dos personas, frente a frente"}</h1>
      ${a && b ? `<div class="tg-faces">${big(a)}<span class="tg-amp">&</span>${big(b)}</div>` : `<p class="hito">Elige a dos personas y mira todo lo que han vivido juntas en la crónica.</p>`}
      <div class="tg-pick">
        <select id="tgA" aria-label="Primera persona">${opt(a, b)}</select>
        <button type="button" class="tg-swap" id="tgSwap" aria-label="Intercambiar" ${a && b ? "" : "disabled"}>⇄</button>
        <select id="tgB" aria-label="Segunda persona">${opt(b, a)}</select>
      </div>
    </section>
    <div class="tg-wrap">
      ${body}
      ${topPairs.length ? `<div class="tg-pairs"><div class="tg-k">Las parejas que más se repiten</div>${topPairs.map(([k,n])=>{ const [x,y] = k.split("|");
        return `<a href="#/juntos/${x}/${y}" class="${(x===a&&y===b)||(x===b&&y===a)?"on":""}">${faceHtml(x,{static:true})}${faceHtml(y,{static:true})}<span>${escapeHtml(shortName(x))} y ${escapeHtml(shortName(y))}</span><b>${n}</b></a>`; }).join("")}</div>` : ""}
    </div>
    ${siteFooter()}`;
  const go = ()=>{ const x = document.getElementById("tgA").value, y = document.getElementById("tgB").value; location.replace(`#/juntos/${x||"-"}/${y||"-"}`); };
  document.getElementById("tgA").addEventListener("change", go);
  document.getElementById("tgB").addEventListener("change", go);
  document.getElementById("tgSwap").addEventListener("click", ()=>{ if(a && b) location.replace(`#/juntos/${b}/${a}`); });
  setupReveals();
}

/* =========================== render: RÉCORDS =========================== */
// El salón de la fama: todo calculado desde DATA (quién aparece más, el lugar más visitado, el
// dúo inseparable, la noche más concurrida...). Nada inventado: si cambian las historias,
// cambian los récords solos.
function viewRecords(){
  renderSeasonsStrip(null);
  const app = document.getElementById("app");
  const all = allEventsFlat();
  const chars = DATA.characters;

  const count = {};
  all.forEach(r=> r.event.chars.forEach(id=>{ if(chars[id]) count[id] = (count[id]||0) + 1; }));
  const ranking = Object.entries(count).sort((a,b)=> b[1]-a[1] || chars[a[0]].name.localeCompare(chars[b[0]].name));
  const topN = ranking.length ? ranking[0][1] : 1;

  const placeCount = {};
  all.forEach(r=>{ if(r.event.place && DATA.places[r.event.place]) placeCount[r.event.place] = (placeCount[r.event.place]||0) + 1; });
  const places = Object.entries(placeCount).sort((a,b)=> b[1]-a[1]);

  const pairs = {};
  all.forEach(r=>{ const cs = r.event.chars.filter(id=>chars[id]); for(let i=0;i<cs.length;i++) for(let j=i+1;j<cs.length;j++){ const k=[cs[i],cs[j]].sort().join("|"); pairs[k]=(pairs[k]||0)+1; } });
  const duo = Object.entries(pairs).sort((a,b)=> b[1]-a[1])[0];
  const crowd = all.slice().sort((a,b)=> b.event.chars.length - a.event.chars.length)[0];
  const busiest = DATA.seasons.slice().sort((a,b)=> b.events.length - a.events.length)[0];
  const media = all.filter(r=> getEventMedia(r.event).length).length;
  const oneTimers = ranking.filter(([,n])=> n===1).length;
  const longest = all.slice().sort((a,b)=> plainText(b.event.content).length - plainText(a.event.content).length)[0];
  const words = all.reduce((t,r)=> t + plainText(r.event.content).split(/\s+/).filter(Boolean).length, 0);

  const bar = (id, n)=> `
    <a class="rk-row" href="#/character/${id}" style="--fcolor:${chars[id].color}">
      ${faceHtml(id, {static:true})}
      <span class="rk-name">${escapeHtml(chars[id].name)}</span>
      <span class="rk-bar"><i style="width:${(n/topN*100).toFixed(1)}%"></i></span>
      <b>${n}</b>
    </a>`;

  app.innerHTML = `
    <section class="season-hero records-hero" style="--scolor:#e0b84f; border-bottom:none;">
      <div class="scode-big">Salón de la fama</div>
      <h1>Récords</h1>
      <p class="hito">Las cifras de la crónica, sacadas de las historias mismas. Se actualizan solas con cada historia nueva.</p>
    </section>
    <div class="records-wrap">
      <div class="rec-totals reveal-stagger">
        <div><b>${all.length}</b><span>historias</span></div>
        <div><b>${Object.keys(count).length}</b><span>personas en la crónica</span></div>
        <div><b>${Object.keys(DATA.places).length}</b><span>lugares</span></div>
        <div><b>${words.toLocaleString("es-CL")}</b><span>palabras escritas</span></div>
        <div><b>${media}</b><span>${media===1?"historia con foto o video":"historias con foto o video"}</span></div>
      </div>

      <div class="rec-grid">
        <section class="rec-card rec-wide reveal">
          <div class="rec-eyebrow">Los más presentes</div>
          <h2>Quién aparece en más historias</h2>
          <div class="rk-list">${ranking.slice(0,10).map(([id,n])=>bar(id,n)).join("")}</div>
          ${oneTimers ? `<div class="rec-foot">${oneTimers} ${oneTimers===1?"persona aparece":"personas aparecen"} una sola vez.</div>` : ""}
        </section>

        ${duo ? (()=>{ const [a,b] = duo[0].split("|"); return `
        <section class="rec-card reveal">
          <div class="rec-eyebrow">Dúo inseparable</div>
          <div class="rec-duo">${faceHtml(a)}<span class="rec-amp">&</span>${faceHtml(b)}</div>
          <h3>${escapeHtml(chars[a].name.split(" ")[0])} y ${escapeHtml(chars[b].name.split(" ")[0])}</h3>
          <p>${duo[1]} historias en común: la pareja que más se repite en la crónica.</p>
          <a class="rec-more" href="#/juntos/${a}/${b}">Todo lo que han vivido juntos →</a>
        </section>`; })() : ""}

        ${places.length ? `
        <section class="rec-card reveal">
          <div class="rec-eyebrow">El lugar de siempre</div>
          <div class="rec-icon">${DATA.places[places[0][0]].icon}</div>
          <h3><a href="#/place/${places[0][0]}">${escapeHtml(DATA.places[places[0][0]].name)}</a></h3>
          <p>${places[0][1]} historias pasaron ahí.${places[1] ? ` Le sigue ${escapeHtml(DATA.places[places[1][0]].name)} (${places[1][1]}).` : ""}</p>
        </section>` : ""}

        ${crowd ? `
        <section class="rec-card reveal">
          <div class="rec-eyebrow">La más concurrida</div>
          <h3><a href="${storyHref(crowd.season.id, crowd.index)}">${escapeHtml(crowd.event.title)}</a></h3>
          <p>${crowd.event.chars.length} personas en una sola historia (${crowd.season.code}).</p>
          ${facesHtml(crowd.event.chars, 12, "faces-sm")}
        </section>` : ""}

        ${busiest ? `
        <section class="rec-card reveal" style="--scolor:${busiest.color}">
          <div class="rec-eyebrow">La temporada más intensa</div>
          <h3><a href="#/season/${busiest.id}">${busiest.code} · ${escapeHtml(busiest.title)}</a></h3>
          <p>${busiest.events.length} historias, más que ninguna otra temporada.</p>
          <div class="rec-seasons">${DATA.seasons.map(s=>`<a href="#/season/${s.id}" title="${s.code}: ${s.events.length}" style="--scolor:${s.color}"><i style="height:${(s.events.length/Math.max(1,busiest.events.length)*100).toFixed(0)}%"></i><span>${s.code}</span></a>`).join("")}</div>
        </section>` : ""}

        ${longest ? `
        <section class="rec-card reveal">
          <div class="rec-eyebrow">La más larga</div>
          <h3><a href="${storyHref(longest.season.id, longest.index)}">${escapeHtml(longest.event.title)}</a></h3>
          <p>${plainText(longest.event.content).split(/\s+/).filter(Boolean).length} palabras: la historia más contada de la crónica.</p>
        </section>` : ""}
      </div>
    </div>
    ${siteFooter()}
  `;
  setupReveals();
}

// compartir una historia: el menú nativo del teléfono si existe; si no, copiar el enlace directo
function shareStory(seasonId, idx, btn){
  const s = DATA.seasons.find(x=>String(x.id)===String(seasonId));
  const e = s && s.events[idx];
  const url = location.href.split("#")[0] + storyHref(seasonId, idx);
  const done = msg=>{ if(!btn) return; btn.dataset.msg = msg; btn.classList.add("is-done"); setTimeout(()=>btn.classList.remove("is-done"), 1600); };
  try{
    if(navigator.share && matchMedia("(pointer:coarse)").matches){
      navigator.share({ title: e ? e.title : "Yoshe con Hoyo", url }).catch(()=>{});
      return;
    }
    navigator.clipboard.writeText(url).then(()=>done("enlace copiado"), ()=>done("no se pudo copiar"));
  }catch(err){ done("no se pudo copiar"); }
}

function flashEvent(seasonId, idx){
  const el=document.getElementById(`event-${seasonId}-${idx}`);
  if(el){ el.scrollIntoView({behavior:"smooth", block:"center"}); el.classList.add("visible"); el.classList.add("flash");
    setTimeout(()=>el.classList.remove("flash"), 1700); }
}

/* =========================== ROUTER =========================== */
/* Scroll memory: keyed by the exact hash string, captured right before we leave it (see
   the hashchange listener below). Restored only when this navigation came from a real
   back/forward (popstate fires for that, never for a plain location.hash= click) - so
   clicking "← Volver" out of a character card returns you to your spot in the elenco
   grid instead of the top of the hero, while every other click (nav buttons, cast cards,
   the logo) still lands at the top like a fresh visit. */
let cameFromPopstate = false;
window.addEventListener("popstate", ()=>{ cameFromPopstate = true; });
let lastHash = location.hash;
const scrollMemory = {};
// true while rendering a back/forward navigation: viewHome() passes it to the 3D scene so
// it restores its camera angle (sessionStorage) along with the router's scroll position
let routeFromHistory = false;
// listeners on window/document that a view adds for itself: render() removes them before the
// next view (otherwise every visit to a season left one more scroll handler behind, holding
// that visit's detached timeline alive)
const viewCleanups = [];
function render(){
  try{
    scrollMemory[lastHash] = window.scrollY;
    lastHash = location.hash;
    const restoreY = cameFromPopstate ? scrollMemory[location.hash] : undefined;
    routeFromHistory = cameFromPopstate;
    cameFromPopstate = false;

    // the 3D home scene goes away before any view swap (even home -> home): it frees its
    // WebGL context, rAF loop and listeners, saves its camera angle and drops a doom mood
    // it may have set. viewHome() mounts a fresh one.
    unmountHomeSolar();
    viewCleanups.splice(0).forEach(fn=>{ try{ fn(); }catch(e){} });
    setGalaxyLock(false);
    lockWheel = null;
    setStarDensityFor("high");

    const hash = location.hash.replace(/^#\/?/,"");
    const parts = hash.split("/").filter(Boolean);
    // Armagedón is the one view with its own (red) mood; everywhere else keeps the blue sky
    // (the home's Hoyo focus also sets it, see syncMood).
    syncMood(false);
    document.body.classList.toggle("route-home", !parts[0] || parts[0]==="home");
    // pantallas inmersivas (sin la fila de temporadas en el teléfono): los resúmenes y el juego
    document.body.classList.toggle("route-full", (parts[0]==="resumen" && !!parts[1]) || parts[0]==="juego");
    if(parts[0]==="season" && parts[1]!==undefined) viewSeason(parts[1]);
    else if(parts[0]==="character" && parts[1]!==undefined) viewCharacter(parts[1]);
    else if(parts[0]==="place" && parts[1]!==undefined) viewPlace(parts[1]);
    else if(parts[0]==="map") viewMap(parts[1]);
    else if(parts[0]==="armageddon") viewArmageddon();
    else if(parts[0]==="elenco") viewCast();
    else if(parts[0]==="records") viewRecords();
    else if(parts[0]==="resumen") parts[1] ? viewRecap(parts[1]) : viewRecapIndex();
    else if(parts[0]==="juego") viewQuiz();
    else if(parts[0]==="juntos") viewTogether(parts[1], parts[2]);
    else viewHome();
    window.scrollTo({top: restoreY!==undefined ? restoreY : 0, behavior:"instant"});
    // #/season/N/M: enlace directo a una historia (las lunas del 3D, el buscador, las fichas).
    // Al volver con "atrás" manda la posición recordada, no el salto a la historia.
    if(parts[0]==="season" && parts[2]!==undefined && restoreY===undefined){
      const sid = parts[1], idx = parts[2];
      setTimeout(()=>flashEvent(sid, idx), 90);
    }
    // la home (solo la galaxia) y el mapa de relaciones: sin scroll, los gestos son de la escena
    if(document.querySelector(".hero .home-sky, .net-page, .wr-page")) setGalaxyLock(true);
    // el título de la pestaña dice dónde estás (y es lo que se ve al compartir el enlace)
    const h1 = document.querySelector("#app h1");
    const isHome = !parts[0] || parts[0]==="home";
    document.title = isHome || !h1 ? "Yoshe con Hoyo — La Crónica" : `${h1.textContent.trim()} · Yoshe con Hoyo`;
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
// three.js se precarga con baja prioridad una vez que la página terminó de cargar y está
// ociosa, aunque se haya entrado por otra vista: así volver a la home no espera la descarga.
// (En la home misma, mountSolar ya la pide después del primer pintado.)
window.addEventListener("load", ()=>{
  if(SOLAR_PARAM === "0" || typeof preloadSolar !== "function") return;
  const go = ()=>{ try{ if(solarCapable(SOLAR_PARAM === "1")) preloadSolar(); }catch(e){} };
  if(window.requestIdleCallback) requestIdleCallback(go, { timeout:3000 }); else setTimeout(go, 1500);
});
(function(){
  // the constellation uses a different point layout above/below the 600px breakpoint
  // (see constellationHtml), so crossing it needs a rebuild of the 2D points - just the 2D:
  // the 3D scene on top handles its own resize and must not be remounted for this
  let resizeTimer;
  const mq = window.matchMedia("(max-width:600px)");
  let wasNarrow = mq.matches;
  window.addEventListener("resize", ()=>{
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(()=>{
      const nowNarrow = mq.matches;
      const onHome = !location.hash || location.hash==="#/" || location.hash==="#/home";
      const wrap = document.querySelector(".hero .constellation-wrap");
      if(onHome && wrap && nowNarrow!==wasNarrow){ wrap.innerHTML = constellationHtml(); setupConstellationFX(); }
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
  // density: share of the stars that get painted (the 3D home lowers it on weaker devices,
  // see setStarDensityFor). Stars are generated in random order, so drawing the first N is a
  // uniform thinning with no visible reshuffle.
  let density = 1;
  window.setStarDensity = k=>{ density = Math.max(0.2, Math.min(1, k)); if(reduced) drawStatic(); };
  // touch devices (phones, tablets): the twinkle runs at ~30fps, which looks the same and
  // halves the battery cost of a layer that animates on every page
  const halfRate = (()=>{ try{ return !window.matchMedia("(hover: hover) and (pointer: fine)").matches; }catch(e){ return false; } })();

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
    const sameWidth = stars.length && c.cssW === window.innerWidth;
    c.cssW = window.innerWidth; c.cssH = window.innerHeight;
    c.width = Math.round(c.cssW*dpr); c.height = Math.round(c.cssH*dpr);
    c.style.width = c.cssW+"px"; c.style.height = c.cssH+"px";
    ctx.setTransform(dpr,0,0,dpr,0,0);
    // a height-only change is the mobile browser bar showing/hiding while scrolling: keep the
    // same stars (they wrap to the new height) instead of reshuffling the whole sky
    if(sameWidth){ if(reduced) drawStatic(); return; }
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
    const n = Math.round(stars.length*density);
    for(let i=0;i<n;i++) paintStar(stars[i],stars[i].base,0,0);
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
    if(halfRate && lastT && t-lastT < 28){ rafId = requestAnimationFrame(draw); return; }
    const dt = lastT? Math.min((t-lastT)/1000, 0.08) : 0;
    lastT = t;
    const W=c.cssW, H=c.cssH;
    const n = Math.round(stars.length*density);
    // drift speeds were tuned per 60fps frame; scale by the real elapsed time so they move
    // the same at 30fps (or on a slow device)
    const k = dt ? dt*60 : 1;

    for(let i=0;i<n;i++){
      const s = stars[i];
      s.x += s.vx*k; s.y += s.vy*k;
      if(s.x<-6) s.x=W+6; else if(s.x>W+6) s.x=-6;
      if(s.y<-6) s.y=H+6; else if(s.y>H+6) s.y=-6;
    }
    dust.forEach(d=>{ d.y += 0.05*k; if(d.y>H+4) d.y=-4; });

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

    for(let i=0;i<n;i++){
      const s = stars[i];
      const a = s.base*(0.34+0.66*Math.sin(t*0.0013*s.speed+s.phase));
      let oy = driftY - sy*s.par;
      // wrap the parallax offset so stars never march off the top of a long page
      const span = H+12;
      oy = ((oy % span) + span) % span;
      if(s.y+oy > H+6) oy -= span;
      paintStar(s, a, driftX, oy);
    }

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

// Scroll driven chrome: the nav condenses once you leave the top of the page. One rAF per
// scroll (or resize / route change), not a loop on every frame: with nothing scrolling,
// nothing runs.
try{
  let rafId = null;
  let navCondensed = false;
  function tick(){
    const sy = window.scrollY || 0;
    const nav = document.querySelector("header.topnav");
    if(nav){
      const should = sy > 40;
      if(should !== navCondensed){ nav.classList.toggle("condensed", should); navCondensed = should; }
    }
    rafId = null;
  }
  function schedule(){ if(rafId===null) rafId = requestAnimationFrame(tick); }
  window.addEventListener("scroll", schedule, { passive:true });
  window.addEventListener("resize", schedule);
  window.addEventListener("hashchange", ()=>setTimeout(schedule, 0));   // after render()
  schedule();
}catch(e){ /* decorative chrome failing should never block the app */ }

render();
