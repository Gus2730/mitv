// Se carga antes de cada prueba (node -r ./sin-internet.js prueba.js).
// Bloquea internet en el navegador de pruebas: solo responden los servidores locales
// y lo que cada prueba simula. Así las pruebas dan el mismo resultado en GitHub
// (que sí tiene internet) que en una máquina sin conexión.
const pw = require('playwright');
const launch = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = (o = {}) => launch({
  ...o,
  args: [...(o.args || []), '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']
});
