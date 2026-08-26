#!/usr/bin/env bash
# Siembra inicial de MDMesh dentro de Coolify. Equivalente a las secciones "Waiting for the server
# to finish first-boot" y "Seeding settings + admin" de setup.sh, con una diferencia importante:
#
#   setup.sh decide "¿siembro?" por `SELECT count(*) FROM users` == 0. Eso NUNCA se cumple: la fila
#   `admin` la crea Liquibase en el primer arranque (hmdm_init.en.sql sólo hace UPDATE ... WHERE
#   id=1). Resultado: el seed se salta siempre y el admin se queda con la contraseña por omisión de
#   Headwind. Aquí la condición es un marcador propio (tabla mdmesh_seed_marker), que sí distingue
#   "base recién migrada" de "base ya sembrada" y es idempotente en cada redeploy.
set -uo pipefail

SALT='5YdSYHyg2U'   # PasswordUtil.PASS_SALT — tiene que coincidir con el servidor.
# users.password = SHA1( UPPER(MD5(raw)) + SALT ).  Sin awk: no todas las imágenes lo traen.
pwhash() {
  local md5
  md5=$(printf '%s' "$1" | md5sum | cut -d' ' -f1 | tr '[:lower:]' '[:upper:]')
  printf '%s' "${md5}${SALT}" | sha1sum | cut -d' ' -f1
}

say() { echo "[seed] $*"; }

# 1) Esperar a que el servidor termine el primer arranque (Liquibase). El servidor escribe
#    /opt/mdmesh/initialized.txt (context.xml: initialization.completion.signal.file).
say "esperando a que el servidor termine Liquibase…"
BOOTED=0
for _ in $(seq 1 240); do            # hasta ~20 min: la primera migración es lenta
  if [ -f /srv/mdmesh/initialized.txt ]; then BOOTED=1; break; fi
  sleep 5
done
if [ "$BOOTED" != 1 ]; then
  say "ERROR: el servidor no terminó el primer arranque. No siembro sobre un esquema a medias."
  exec sleep infinity
fi
say "servidor inicializado."

# 2) Sembrar SÓLO una vez. hmdm_init.en.sql borra configuraciones y reinserta filas demo: jamás
#    debe correr sobre datos vivos, de ahí el marcador.
MARKER=$(psql -tAc "SELECT 1 FROM pg_class WHERE relname='mdmesh_seed_marker'" 2>/dev/null | tr -d '[:space:]')
if [ "$MARKER" != "1" ]; then
  say "primera vez → sembrando settings + admin…"
  RESET_TOKEN=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')   # ≤40 chars
  sed "s/_ADMIN_EMAIL_/${ADMIN_EMAIL}/g" /seed/sql/hmdm_init.en.sql | psql -v ON_ERROR_STOP=0 2>&1 | tail -5

  PWHASH=$(pwhash "$ADMIN_PASSWORD")
  if [ -z "$PWHASH" ]; then
    say "ERROR: no pude calcular el hash de la contraseña (¿falta md5sum/sha1sum?). No toco el admin."
  else
    psql -v ON_ERROR_STOP=1 -c \
      "UPDATE users SET password='${PWHASH}', passwordreset=true, passwordresettoken='${RESET_TOKEN}' WHERE login='admin';" \
      && say "contraseña del admin aplicada (se forzará el cambio en el primer login)." \
      || say "ERROR: falló el UPDATE del admin."
  fi

  psql -q -c "CREATE TABLE IF NOT EXISTS mdmesh_seed_marker (seeded_at timestamptz NOT NULL DEFAULT now());" >/dev/null 2>&1
  psql -q -c "INSERT INTO mdmesh_seed_marker DEFAULT VALUES;" >/dev/null 2>&1
  say "marcador de siembra escrito."
else
  say "ya sembrado antes → no toco datos ni credenciales."
fi

# 3) Reparaciones idempotentes que corren SIEMPRE (habilitan el alta por QR y limpian las apps
#    auxiliares de Headwind).
psql -q -f /seed/sql/post_seed.sql >/dev/null 2>&1 \
  && say "post_seed aplicado." || say "aviso: post_seed.sql reportó incidencias."

say "listo. El contenedor queda en reposo."
exec sleep infinity
