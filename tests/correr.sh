#!/usr/bin/env bash
# Corre todas las pruebas de MiTV contra la app tal como va dentro del APK.
# Uso: bash tests/correr.sh            (todas)
#      bash tests/correr.sh v314 diag  (solo algunas)
set -u
cd "$(dirname "$0")"

PRUEBAS=(full v3 v33 v35 tv diag audit audit2 radio36 v38 v39 v310 v311 vlist v313 v314)
[ $# -gt 0 ] && PRUEBAS=("$@")

# La app que se prueba es la misma que se empaqueta en Android
cp ../app/src/main/assets/index.html media/MiTV.html
# Ajustar la guía de prueba a la hora actual
python3 regen_guia.py

# Servidores locales: con permiso CORS (8766 y 8767), sin permiso (8765) y una lista sin permiso (8770)
mkdir -p /tmp/mitv-sincors
printf '#EXTM3U\n#EXTINF:-1,Canal A\nhttp://127.0.0.1:8766/clip.mp4\n' > /tmp/mitv-sincors/l.m3u
python3 srv.py media & S1=$!
python3 srv2.py media & S2=$!
python3 -m http.server 8765 --bind 127.0.0.1 --directory media >/dev/null 2>&1 & S3=$!
python3 -m http.server 8770 --bind 127.0.0.1 --directory /tmp/mitv-sincors >/dev/null 2>&1 & S4=$!
trap 'kill $S1 $S2 $S3 $S4 2>/dev/null' EXIT
sleep 2

# Una prueba falla si muestra ❌, si se cae o si la app tuvo errores de JavaScript
correr(){
  local salida codigo
  salida=$(timeout 420 node -r ./sin-internet.js "$1.js" 2>&1); codigo=$?
  echo "$salida" > "resultado-$1.txt"
  if [ $codigo -ne 0 ] || echo "$salida" | grep -q '❌' || echo "$salida" | grep 'Errores JS' | grep -vq 'ninguno'; then return 1; fi
  return 0
}

FALLAS=()
for t in "${PRUEBAS[@]}"; do
  if correr "$t"; then
    echo "✅ $t ($(grep -c '✅' "resultado-$t.txt") comprobaciones)"
  else
    # Un segundo intento, por si la máquina iba lenta
    echo "↻ $t falló, reintentando…"
    if correr "$t"; then echo "✅ $t (en el segundo intento)"
    else echo "❌ $t"; grep -E '❌|Error|rror:' "resultado-$t.txt" | head -15 | sed 's/^/     /'; FALLAS+=("$t"); fi
  fi
done

echo
if [ ${#FALLAS[@]} -gt 0 ]; then echo "Fallaron ${#FALLAS[@]} de ${#PRUEBAS[@]}: ${FALLAS[*]}"; exit 1; fi
echo "Todas las pruebas pasaron (${#PRUEBAS[@]})."
