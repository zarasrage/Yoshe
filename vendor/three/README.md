# three.js r186 (vendorizado)

`three.module.min.js` = `build/three.module.js` + `build/three.core.js` del paquete npm `three@0.186.1`,
unidos en un solo ESM y minificados una única vez con esbuild:

```bash
npm pack three@0.186.1 && tar xzf three-0.186.1.tgz
npx esbuild package/build/three.module.js --bundle --format=esm --minify --legal-comments=inline \
  --outfile=vendor/three/three.module.min.js
```

No es un build step del sitio: el archivo se commitea tal cual y se carga con `import()` desde `solar.js`.
Licencia MIT en `LICENSE`.
