// Arma la app MiTV en un solo archivo HTML:
//   app.src.html + features*.js (código propio) + hls.js (reproductor HLS)
// y lo copia a la app Android (app/src/main/assets) y a la página (docs/app).
// Uso: cd fuente && npm install && npm run build
const fs = require('fs'), path = require('path');
const here = (...p) => path.join(__dirname, ...p);
const repo = (...p) => path.join(__dirname, '..', ...p);

const FEATURES = ['features3', 'features4', 'features5', 'features6', 'features7', 'features8', 'features9'];
let src = fs.readFileSync(here('app.src.html'), 'utf8');
const hls = fs.readFileSync(require.resolve('hls.js/dist/hls.min.js'), 'utf8')
  .replace(/<\/script/gi, '<\\/script').replace(/\/\/# sourceMappingURL=.*$/m, '');
src = src.replace('/*FEATURES3*/', () => FEATURES.map(f => fs.readFileSync(here(f + '.js'), 'utf8')).join('\n'));

// Minificar el código y los estilos de la app (hls.js ya viene minificado)
{
  const esb = require('esbuild');
  const i = src.lastIndexOf('<script>'), j = src.indexOf('</script>', i);
  const min = esb.transformSync(src.slice(i + 8, j), { minify: true, target: 'es2020', charset: 'utf8', legalComments: 'none' }).code.replace(/<\/script/gi, '<\\/script');
  src = src.slice(0, i + 8) + min + src.slice(j);
  const a = src.indexOf('<style>'), b = src.indexOf('</style>', a);
  const css = esb.transformSync(src.slice(a + 7, b), { loader: 'css', minify: true, target: 'chrome70', charset: 'utf8' }).code;
  src = src.slice(0, a + 7) + css + src.slice(b);
}
const out = src.replace('/*HLS_JS*/', () => hls);
new Function(out.split('<script>').pop().split('</script>')[0]); // revisa que no haya errores de sintaxis
fs.mkdirSync(here('out'), { recursive: true });
fs.writeFileSync(here('out', 'MiTV.html'), out);
console.log('ok', out.length);

// Versión: la misma que el APK (versionName en app/build.gradle)
const version = (fs.readFileSync(repo('app', 'build.gradle'), 'utf8').match(/versionName\s+"([^"]+)"/) || [])[1];
const pwa = out.replace('<meta name="theme-color" content="#0b0f17">', '<meta name="theme-color" content="#0b0f17">\n<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icons/icon-192.png">\n<link rel="apple-touch-icon" href="icons/icon-192.png">\n<meta name="apple-mobile-web-app-capable" content="yes">');
fs.writeFileSync(repo('docs', 'app', 'index.html'), pwa);
fs.writeFileSync(repo('app', 'src', 'main', 'assets', 'index.html'), out);
fs.writeFileSync(repo('docs', 'version.json'), JSON.stringify({ version, apk: 'MiTV.apk' }) + '\n');
console.log('copias listas · versión', version);
