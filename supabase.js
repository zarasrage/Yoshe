/* =========================================================================
   Supabase: historias subidas desde la app, visibles para todos sin revisión
   (ver CLAUDE.md, "Historias subidas por la gente"). Script clásico, igual
   convención que solar.js/net3d.js (index.html lo carga entre net3d.js y
   app.js): expone submitStory/fetchStories en window. El cliente de
   @supabase/supabase-js es ESM y entra con import() recién al primer uso real
   (nunca bloquea el primer pintado), vendorizado en vendor/supabase/ igual
   que three.js en vendor/three/.

   Todo lo de aquí está envuelto en try/catch y nunca tira: si Supabase está
   lento, caído, o el import() falla (offline, file://), el sitio sigue
   funcionando exactamente igual que si esto no existiera — mismo criterio que
   ya rige el resto del proyecto para localStorage y para la escena 3D.
   ========================================================================= */
(function(){
  const SUPABASE_URL = "https://qfpvnriocisneyvwlfiv.supabase.co";
  // la anon key es pública por diseño (protegida por RLS en el proyecto, ver supabase/schema.sql)
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmcHZucmlvY2lzbmV5dndsZml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3NTY4NDksImV4cCI6MjEwNzMzMjg0OX0.JC6V4t3rMYAk1s3B1X6CcwkjYaMHmH0zAahCP8fa0n0";

  // las rutas de vendor/ se resuelven contra la URL de ESTE script, no la de la página
  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || location.href;
  const CLIENT_URL = new URL("vendor/supabase/supabase.esm.js", SCRIPT_SRC).href;

  let clientPromise = null;
  function getClient(){
    if(!clientPromise){
      clientPromise = import(CLIENT_URL)
        .then(mod=> mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY))
        .catch(err=>{ clientPromise = null; throw err; });
    }
    return clientPromise;
  }

  function randomId(){
    try{ if(crypto && crypto.randomUUID) return crypto.randomUUID(); }catch(e){}
    return Date.now().toString(36) + Math.random().toString(36).slice(2,10);
  }

  // sube las fotos de una historia nueva al bucket "media" y devuelve sus URLs públicas (en el
  // mismo orden); una foto que falla al subir simplemente no queda en la lista, no rompe el resto
  async function uploadStoryPhotos(client, photoBlobs){
    if(!photoBlobs || !photoBlobs.length) return [];
    const folder = randomId();
    const urls = [];
    for(let i=0;i<photoBlobs.length;i++){
      try{
        const path = `stories/${folder}/${i}.jpg`;
        const { error } = await client.storage.from("media").upload(path, photoBlobs[i], { contentType:"image/jpeg" });
        if(error) continue;
        const { data } = client.storage.from("media").getPublicUrl(path);
        if(data && data.publicUrl) urls.push(data.publicUrl);
      }catch(e){ /* esta foto no subió: la historia se guarda igual sin ella */ }
    }
    return urls;
  }

  // payload: {seasonId, dateText, title, bodyText, content, placeId, newPlace, charIds, newPeople, submitterName}
  // photoBlobs: Blob[] (ya redimensionadas, ver resizeImageFile en app.js)
  async function submitStory(payload, photoBlobs){
    try{
      const client = await getClient();
      const images = await uploadStoryPhotos(client, photoBlobs);
      const { error } = await client.from("stories").insert({
        season_id: Number(payload.seasonId),
        date_text: payload.dateText || null,
        title: payload.title,
        body_text: payload.bodyText,
        content: payload.content,
        place_id: payload.placeId || null,
        new_place: payload.newPlace || null,
        char_ids: payload.charIds || [],
        new_people: payload.newPeople || [],
        images,
        submitter_name: payload.submitterName || null
      });
      if(error) return { ok:false, error: error.message };
      return { ok:true };
    }catch(e){ return { ok:false, error: String((e && e.message) || e) }; }
  }

  // todas las historias subidas (sin filtro: no hay cola de revisión)
  async function fetchStories(){
    try{
      const client = await getClient();
      const { data, error } = await client.from("stories").select("*").order("created_at", { ascending:true });
      if(error || !data) return [];
      return data;
    }catch(e){ return []; }
  }

  // "Subir historia con IA": solo texto suelto + fotos. La Edge Function (ai-submit-story) arma
  // el resto (título, temporada, lugar, personas, texto pulido) con la API de Claude y publica
  // directo — ver supabase/functions/ai-submit-story/index.ts. `roster` es {seasons,characters,places}
  // tal como está en DATA, para que la IA solo elija entre lo que ya existe (o proponga algo nuevo).
  async function submitStoryWithAI(text, submitterName, photoBlobs, roster){
    try{
      const client = await getClient();
      const images = await uploadStoryPhotos(client, photoBlobs);
      const { data, error } = await client.functions.invoke("ai-submit-story", {
        body: { text, submitterName: submitterName || null, images, roster }
      });
      if(error) return { ok:false, error: error.message };
      if(data && data.ok === false) return { ok:false, error: data.error || "Error desconocido." };
      return { ok:true };
    }catch(e){ return { ok:false, error: String((e && e.message) || e) }; }
  }

  window.submitStory = submitStory;
  window.fetchStories = fetchStories;
  window.submitStoryWithAI = submitStoryWithAI;
})();
