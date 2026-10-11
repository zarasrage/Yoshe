# @supabase/supabase-js (vendorizado)

- `supabase.esm.js` = solo `createClient` de `@supabase/supabase-js@2` (incluye por dentro el
  cliente de Postgrest y el de Storage, que son los dos que usa `supabase.js`), empaquetado en
  un único archivo ESM y minificado una vez con esbuild — igual receta que `vendor/three/README.md`.
  Pesa ~217KB (~57KB con gzip). No se usa Realtime ni Functions desde este sitio, pero sus clases
  quedan igual instanciadas adentro de `SupabaseClient` (no se pueden tree-shakear aparte); si algún
  día se nota el peso, vendría de ahí.
- No es un build step del sitio: el archivo se commitea tal cual y se carga con `import()` desde
  `supabase.js`, igual que `solar.js` carga `vendor/three/`. Licencia MIT en `LICENSE`.

Para regenerar (por ejemplo al subir de versión):

```bash
mkdir -p /tmp/supa-vendor && cd /tmp/supa-vendor
npm init -y >/dev/null
npm install @supabase/supabase-js@2 esbuild --no-save
echo 'export { createClient } from "@supabase/supabase-js";' > entry.js
npx esbuild entry.js --bundle --format=esm --minify --platform=browser \
  --legal-comments=inline --outfile=supabase.esm.js
cp supabase.esm.js /home/user/Yoshe/vendor/supabase/supabase.esm.js
```
