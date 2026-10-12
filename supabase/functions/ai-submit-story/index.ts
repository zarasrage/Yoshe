// Yoshe con Hoyo — "Subir historia con IA": la persona manda texto suelto (y fotos, ya
// subidas a Storage por el cliente) y esta función arma la historia completa (título,
// temporada, lugar, quiénes estuvieron, texto pulido) con la API de Claude y la publica
// directo en la tabla `stories` — sin paso de revisión, a pedido del usuario (ver
// CLAUDE.md, "Historias subidas por la gente").
//
// La IA NUNCA inventa hechos: solo pulsa redacción, elige entre las temporadas/lugares/
// personas que ya existen en el sitio (roster, mandado por el cliente) y, para alguien o
// un lugar que no reconoce en el roster, lo deja como "nuevo" — igual que hace el
// formulario manual, con los mismos campos pendientes ("— rol pendiente —",
// "Cuéntame..."), que se agregan recién al mezclar en el cliente (applySupabaseStories()).
// El resaltado de nombres (`content`) NO lo decide el modelo: se calcula acá mismo con el
// mismo algoritmo determinístico que usa app.js (autoTagText/buildNameIndex), para no
// depender de que la IA arme bien un formato de segmentos.
//
// Secreto necesario: ANTHROPIC_API_KEY (Dashboard → Edge Functions → Secrets).
// SUPABASE_URL y SUPABASE_ANON_KEY los inyecta la plataforma solos.

import Anthropic from "npm:@anthropic-ai/sdk";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk/helpers/zod";
import { z } from "npm:zod";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ---------- mismo algoritmo que buildNameIndex()/autoTagText() de app.js ---------- */
type RosterChar = { id: string; name: string; apodo?: string | null };
type RosterPlace = { id: string; name: string };
type NameItem = { id: string; name: string; type: "char" | "place" };

function buildNameIndex(characters: RosterChar[], places: RosterPlace[]): NameItem[] {
  const items: NameItem[] = [];
  const firstNameCount: Record<string, number> = {};
  characters.forEach((c) => {
    const fn = c.name.split(" ")[0];
    firstNameCount[fn] = (firstNameCount[fn] || 0) + 1;
  });
  characters.forEach((c) => {
    items.push({ id: c.id, name: c.name, type: "char" });
    const fn = c.name.split(" ")[0];
    if (firstNameCount[fn] === 1 && fn !== c.name) items.push({ id: c.id, name: fn, type: "char" });
    if (c.apodo) items.push({ id: c.id, name: c.apodo, type: "char" });
  });
  places.forEach((p) => items.push({ id: p.id, name: p.name, type: "place" }));
  items.sort((a, b) => b.name.length - a.name.length);
  return items;
}

type Segment = { t: "text"; v: string } | { t: "char" | "place"; id: string };

function autoTagText(text: string, characters: RosterChar[], places: RosterPlace[]): Segment[] {
  const items = buildNameIndex(characters, places);
  if (!items.length || !text) return [{ t: "text", v: text || "" }];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = items.map((it) => esc(it.name)).join("|");
  const re = new RegExp("(" + pattern + ")", "g");
  const parts = text.split(re);
  const segs: Segment[] = [];
  parts.forEach((part) => {
    if (part === undefined || part === "") return;
    const found = items.find((it) => it.name === part);
    if (found) segs.push({ t: found.type, id: found.id });
    else segs.push({ t: "text", v: part });
  });
  return segs;
}

function slugify(name: string): string {
  return (
    String(name)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "x"
  );
}
function uniqueKey(base: string, taken: Set<string>): string {
  let k = base, n = 2;
  while (taken.has(k)) k = `${base}-${n++}`;
  return k;
}

/* ---------- lo que le pedimos a Claude ---------- */
const StorySchema = z.object({
  title: z.string().describe("Título corto y evocador para la historia, en español de Chile, tono crónica."),
  season_id: z.number().describe("El id de la temporada que mejor calza, de la lista de temporadas dada."),
  date_text: z.string().nullable().describe("Fecha tal como se menciona en el texto (texto libre), o null si no se menciona ninguna."),
  place_id: z.string().nullable().describe("El id de un lugar YA EXISTENTE en la lista, si el texto menciona claramente ese lugar; si no, null."),
  new_place: z
    .object({ name: z.string(), icon: z.string().describe("Un solo emoji que represente el lugar") })
    .nullable()
    .describe("Solo si el texto menciona un lugar que NO está en la lista de lugares existentes; si no, null."),
  char_ids: z.array(z.string()).describe("Los ids de las personas YA EXISTENTES en la lista que estuvieron en la historia."),
  new_people: z
    .array(z.object({ name: z.string() }))
    .describe("Personas que el texto menciona claramente por nombre y que NO están en la lista existente."),
  polished_text: z
    .string()
    .describe("La historia pulida: mismo relato y mismos hechos del texto original, prosa mejorada, sin inventar nada nuevo."),
});

const SYSTEM_PROMPT = `Ayudas a armar entradas para "Yoshe con Hoyo", la crónica de un grupo de amigos.
Te llega un texto suelto que alguien escribió contando algo que pasó, y una lista (roster) de las
temporadas, personas y lugares que YA existen en el sitio. Tu trabajo:

1. Pulir el texto: mejora redacción y fluidez, en español de Chile, tono de crónica/aventura épica
   pero honesto (sin embellecer de más ni trivializar momentos incómodos). NUNCA inventes hechos,
   diálogos, fechas o nombres que el texto no dé — si algo no está claro, simplemente no lo agregues.
2. Elige la temporada (season_id) que mejor calza según cualquier pista de fecha en el texto; si no
   hay pista clara, usa la temporada más reciente de la lista (el id más alto).
3. Identifica el lugar: si el texto menciona claramente un lugar que ya está en la lista, usa su id
   (place_id). Si menciona un lugar que NO está en la lista, ponlo en new_place con un emoji simple
   como ícono. Si no se menciona ningún lugar, deja ambos en null.
4. Identifica a las personas: para cada persona que el texto menciona, si coincide con alguien de la
   lista (por nombre completo, primer nombre si es único, o apodo), agrega su id a char_ids. Si el
   texto nombra claramente a alguien que NO está en la lista, agrégalo a new_people. Ante la duda
   (nombre parecido pero no exacto, podría ser cualquiera), trátalo como persona nueva en vez de
   adivinar — nunca le atribuyas una historia a la persona equivocada.
5. Dale un título corto (pocas palabras, evocador, en el mismo tono).

Responde solo con los campos pedidos — nada de texto fuera del esquema.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "JSON inválido" }, 400);
  }

  const text = String(body?.text || "").trim();
  const submitterName = body?.submitterName ? String(body.submitterName).trim().slice(0, 120) : null;
  const images = Array.isArray(body?.images) ? body.images.filter((u: unknown) => typeof u === "string").slice(0, 8) : [];
  const roster = body?.roster || {};
  const seasons: { id: number; code: string; title: string }[] = Array.isArray(roster.seasons) ? roster.seasons : [];
  const characters: RosterChar[] = Array.isArray(roster.characters) ? roster.characters : [];
  const places: RosterPlace[] = Array.isArray(roster.places) ? roster.places : [];

  if (!text) return json({ ok: false, error: "Falta el texto de la historia." }, 400);
  if (!seasons.length) return json({ ok: false, error: "Falta la lista de temporadas." }, 400);

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return json({ ok: false, error: "Falta configurar ANTHROPIC_API_KEY en la Edge Function." }, 500);

  const client = new Anthropic({ apiKey: anthropicKey });

  const rosterText = [
    "Temporadas:",
    ...seasons.map((s) => `- id:${s.id} ${s.code} "${s.title}"`),
    "",
    "Personas existentes:",
    ...characters.map((c) => `- id:${c.id} ${c.name}${c.apodo ? ` (apodo: ${c.apodo})` : ""}`),
    "",
    "Lugares existentes:",
    ...places.map((p) => `- id:${p.id} ${p.name}`),
  ].join("\n");

  let parsed: z.infer<typeof StorySchema>;
  try {
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${rosterText}\n\n---\nTexto de la historia (tal como lo escribió la persona):\n${text}`,
        },
      ],
      output_config: { format: zodOutputFormat(StorySchema) },
    });
    if (!response.parsed_output) return json({ ok: false, error: "La IA no devolvió una respuesta válida." }, 502);
    parsed = response.parsed_output;
  } catch (e) {
    return json({ ok: false, error: `Error llamando a la IA: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  // nunca confiar ciegamente en lo que vuelve: se valida contra el roster real antes de guardar
  const seasonIds = seasons.map((s) => s.id);
  const season_id = seasonIds.includes(parsed.season_id) ? parsed.season_id : Math.max(...seasonIds);
  const charIdSet = new Set(characters.map((c) => c.id));
  const placeIdSet = new Set(places.map((p) => p.id));
  const char_ids = [...new Set(parsed.char_ids.filter((id) => charIdSet.has(id)))];
  const place_id = parsed.place_id && placeIdSet.has(parsed.place_id) ? parsed.place_id : null;

  // ids determinísticos para personas/lugares nuevos — mismo criterio que slugify()/uniqueKey()
  // del editor local, nunca inventados por el modelo
  const takenChars = new Set(characters.map((c) => c.id));
  const new_people = (parsed.new_people || [])
    .filter((np) => np.name && np.name.trim())
    .map((np) => {
      const id = uniqueKey(slugify(np.name), takenChars);
      takenChars.add(id);
      return { id, name: np.name.trim() };
    });
  new_people.forEach((np) => char_ids.push(np.id));

  let new_place: { id: string; name: string; icon: string } | null = null;
  if (!place_id && parsed.new_place && parsed.new_place.name.trim()) {
    const takenPlaces = new Set(places.map((p) => p.id));
    const id = uniqueKey(slugify(parsed.new_place.name), takenPlaces);
    new_place = { id, name: parsed.new_place.name.trim(), icon: (parsed.new_place.icon || "📍").trim() || "📍" };
  }

  // el resaltado de nombres se calcula acá, determinístico, con el roster + lo nuevo de esta historia
  const extCharacters = characters.concat(new_people);
  const extPlaces = new_place ? places.concat([{ id: new_place.id, name: new_place.name }]) : places;
  const content = autoTagText(parsed.polished_text, extCharacters, extPlaces);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) return json({ ok: false, error: "Falta configuración de Supabase en la Edge Function." }, 500);
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { error } = await supabase.from("stories").insert({
    season_id,
    date_text: parsed.date_text || null,
    title: parsed.title,
    body_text: text,
    content,
    place_id,
    new_place,
    char_ids,
    new_people,
    images,
    submitter_name: submitterName,
  });
  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true });
});
