# MiTV 3.0

Este proyecto genera tres cosas desde un solo lugar:

1. **La app para Android** (celular, Android TV, Fire TV y TV box), firmada para que cada versión nueva se instale encima de la anterior.
2. **La página web de MiTV** con instrucciones de instalación y botón de descarga.
3. **MiTV en el navegador**, instalable como app (PWA) en computadoras y celulares.

Todo se compila y publica gratis con GitHub cada vez que subes un cambio.

---

## 1. Publicar por primera vez (unos 15 minutos)

### a) Crear el repositorio
1. Entra a https://github.com y crea una cuenta si no tienes.
2. Toca **New** para crear un repositorio, por ejemplo `mitv`. Déjalo **Public**, porque la página web gratis de GitHub necesita que el repositorio sea público.
3. Toca **uploading an existing file** y arrastra **todo el contenido** de esta carpeta, incluida la carpeta oculta `.github`. Confirma con **Commit changes**.
   - Si tu computadora no muestra la carpeta `.github`, créala en GitHub con **Add file → Create new file**, escribe el nombre `.github/workflows/build.yml` y pega el contenido del archivo.

### b) Guardar la firma del APK (una sola vez)
La firma es lo que permite que el teléfono acepte las actualizaciones. Te la entregué aparte en el archivo `MITV_KEYSTORE.txt`. **No la subas al repositorio** y guarda una copia en un lugar seguro: si la pierdes, habrá que desinstalar la app para instalar versiones nuevas.

1. En tu repositorio ve a **Settings → Secrets and variables → Actions → New repository secret**.
2. En **Name** escribe `MITV_KEYSTORE`.
3. En **Secret** pega todo el texto de `MITV_KEYSTORE.txt` y guarda.

### c) Activar la página web
1. Ve a **Settings → Pages**.
2. En **Source** elige **GitHub Actions**.

### d) Compilar
1. Ve a la pestaña **Actions**, elige **Compilar y publicar MiTV** y toca **Run workflow**. Tarda unos 5 minutos.
2. Cuando tenga la marca verde, tu página queda en `https://TU-USUARIO.github.io/mitv/`. Ahí está:
   - el botón **Descargar para Android** (`…/mitv/MiTV.apk`),
   - MiTV en el navegador (`…/mitv/app/`),
   - las instrucciones para cada dispositivo.

## 2. Instalar

- **Celular Android:** abre tu página en el teléfono y toca **Descargar para Android**.
- **Fire TV / Android TV / TV box:** instala **Downloader** desde la tienda del televisor y escribe la dirección `https://TU-USUARIO.github.io/mitv/MiTV.apk`.
- **Computadora:** abre `…/mitv/app/` en Chrome o Edge e instálala con el ícono de la barra de direcciones. Para ver más canales y usar las grabaciones, usa el archivo `MiTV.html` descargado (enlace en la página).

## 3. Actualizar la app

Cuando cambies algo (por ejemplo, un `index.html` nuevo que te pase):
1. Reemplaza `app/src/main/assets/index.html` y `docs/app/index.html`.
2. Sube el número de versión en `app/build.gradle` (`versionCode` +1 y `versionName`) y en el `index.html` (`APP_VERSION`).
3. GitHub compila y publica solo. Las apps instaladas muestran el aviso **"Hay una versión nueva"**.

---

## 4. Funciones que necesitan un paso tuyo

### Cuenta en la nube y control remoto (Firebase, gratis)
Sirve para sincronizar perfiles, favoritos, listas y ajustes entre dispositivos, y para usar el celular como control remoto del televisor.

1. Entra a https://console.firebase.google.com y crea un proyecto (puedes desactivar Google Analytics).
2. **Agregar app → Web (</>)**, ponle un nombre y copia el valor de `apiKey`.
3. Menú **Compilación → Authentication → Comenzar → Correo electrónico/contraseña → Habilitar**.
4. Menú **Compilación → Realtime Database → Crear base de datos** (modo bloqueado). Copia la dirección que aparece arriba (termina en `firebaseio.com` o `firebasedatabase.app`).
5. En la pestaña **Reglas** de la base de datos pega esto y publica:
   ```json
   {
     "rules": {
       "users": {
         "$uid": {
           ".read": "$uid === auth.uid",
           ".write": "$uid === auth.uid"
         }
       }
     }
   }
   ```
6. En MiTV ve a **Ajustes → Cuenta en la nube**, pega la clave y la dirección, y toca **Crear cuenta**. En los demás dispositivos usa **Iniciar sesión** con el mismo correo.
7. El botón 📱 de arriba abre el control remoto: elige el televisor y úsalo como un control normal.

### Portadas de películas (TMDB)
Crea una cuenta gratis en https://www.themoviedb.org, ve a **Configuración → API**, pide una clave y pégala en **Ajustes → Portadas de películas**.

### Servidor de películas (Jellyfin)
Instala Jellyfin (gratis) en una computadora de tu casa desde https://jellyfin.org, agrega tus carpetas de películas y conecta MiTV en **Ajustes → Servidor Jellyfin** con la dirección que te muestra (por ejemplo `http://192.168.1.10:8096`).

### Canales de YouTube
En **Ajustes → Canales de YouTube** pega el enlace del canal con su ID (empieza con `UC`), una lista de reproducción o un video en vivo. Para obtener el ID: en YouTube abre el canal → **Más información** → **Compartir canal** → **Copiar ID del canal**.

### Guía de programación
Los canales gratuitos no traen guía. Si tu proveedor de IPTV te da un enlace XMLTV (`.xml` o `.xml.gz`), agrégalo en **Ajustes → Guía de programación**.

---

## 5. Notas

- **Contenido:** los canales gratuitos vienen del catálogo público iptv-org; las radios, de radio-browser.info; la agenda deportiva, de los marcadores públicos de ESPN; los podcasts, del directorio público de Apple. Para canales de pago, agrega la lista M3U de un proveedor con licencia.
- **Versión web vs. Android:** en el navegador, algunos canales gratuitos no cargan porque usan conexiones `http` o no permiten ser abiertos desde páginas web. La app Android y el archivo `MiTV.html` abren muchos más.
- **Grabaciones:** funcionan en la computadora (Chrome o Edge) y la app debe quedar abierta mientras graba.
- **Recordatorios:** en Android llegan como notificación aunque la app esté cerrada (si reinicias el dispositivo, vuelve a abrir MiTV una vez). En la computadora, avisan mientras la app está abierta.
- **Radio con pantalla apagada:** en Android la radio sigue sonando al apagar la pantalla; algunos equipos con ahorro de batería agresivo pueden detenerla después de un rato.
