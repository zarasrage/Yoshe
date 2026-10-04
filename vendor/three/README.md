# three.js r186 (vendorizado)

- `three.module.min.js` = `build/three.module.js` + `build/three.core.js` del paquete npm `three@0.186.1`,
  unidos en un solo ESM y minificados una única vez con esbuild.
- `postprocessing.min.js` = `EffectComposer`, `RenderPass`, `ShaderPass`, `UnrealBloomPass` y `OutputPass` de
  `examples/jsm/postprocessing/` (con sus shaders), unidos en un ESM que importa `./three.module.min.js`
  (misma instancia de three que la escena). Solo se carga en desktop, para el bloom.

```bash
npm pack three@0.186.1 && tar xzf three-0.186.1.tgz
npx esbuild package/build/three.module.js --bundle --format=esm --minify --legal-comments=inline \
  --outfile=vendor/three/three.module.min.js
# entry.js reexporta las 5 clases desde package/examples/jsm/postprocessing/
npx esbuild entry.js --bundle --format=esm --minify --legal-comments=inline --external:three \
  --outfile=vendor/three/postprocessing.min.js
sed -i 's#from"three"#from"./three.module.min.js"#g' vendor/three/postprocessing.min.js
```

No es un build step del sitio: los archivos se commitean tal cual y se cargan con `import()` desde `solar.js`.
Licencia MIT en `LICENSE`.
