# three.js r186 (vendorizado, recortado)

- `three.module.min.js` = **solo las clases que usan `solar.js` y `postprocessing.min.js`**, sacadas de
  `build/three.module.js` del paquete npm `three@0.186.1`, unidas en un ESM y minificadas una única vez con
  esbuild (tree-shaking). Pesa ~550KB (~140KB con gzip) contra ~740KB (~190KB gzip) del three completo.
- `postprocessing.min.js` = `EffectComposer`, `RenderPass`, `ShaderPass`, `UnrealBloomPass` y `OutputPass` de
  `examples/jsm/postprocessing/` (con sus shaders), unidos en un ESM que importa `./three.module.min.js`
  (misma instancia de three que la escena). Solo se carga en el nivel de calidad alto (desktop), para el bloom.

**Si `solar.js` empieza a usar una clase nueva (`THREE.Algo`), hay que regenerar `three.module.min.js`**: si no,
`THREE.Algo` es `undefined`, el montaje falla y la home se queda en la constelación 2D (no se rompe, pero no hay 3D).
La lista de exports sale sola de lo que usan los dos archivos:

```bash
npm pack three@0.186.1 && tar xzf three-0.186.1.tgz
SOLAR=$(grep -o "THREE\.[A-Za-z0-9_]*" solar.js | sed 's/THREE\.//' | sort -u)
POST=$(grep -o 'import{[^}]*}from"./three.module.min.js"' vendor/three/postprocessing.min.js \
  | sed 's/import{//; s/}from.*//' | tr ',' '\n' | sed 's/ as .*//' | sort -u)
echo "export { $(printf '%s\n%s\n' "$SOLAR" "$POST" | sort -u | paste -sd, -) } from './package/build/three.module.js';" > three-lite.js
npx esbuild three-lite.js --bundle --format=esm --minify --legal-comments=inline \
  --outfile=vendor/three/three.module.min.js

# postprocesado (solo si cambia la versión de three): entry.js reexporta las 5 clases
# desde package/examples/jsm/postprocessing/
npx esbuild entry.js --bundle --format=esm --minify --legal-comments=inline --external:three \
  --outfile=vendor/three/postprocessing.min.js
sed -i 's#from"three"#from"./three.module.min.js"#g' vendor/three/postprocessing.min.js
```

No es un build step del sitio: los archivos se commitean tal cual y se cargan con `import()` desde `solar.js`.
Licencia MIT en `LICENSE`.
