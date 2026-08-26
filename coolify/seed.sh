#!/usr/bin/env bash
# Siembra inicial de MDMesh dentro de Coolify. Espejo de la lógica de setup.sh (secciones
# "Waiting for the server to finish first-boot" y "Seeding settings + admin").
set -uo pipefail

SALT='5YdSYHyg2U'   # PasswordUtil.PASS_SALT — tiene que coincidir con el servidor.
# users.password = SHA1( UPPER(MD5(raw)) + SALT )
pwhash() {
  local md5
  md5=$(printf '%s' "$1" | md5sum | awk '{print toupper($1)}')
  printf '%s' "${md5}${SALT}" | sha1sum | awk '{print $1}'
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

# 2) Sembrar SÓLO si la tabla users está vacía. hmdm_init.en.sql borra configuraciones y reinserta
#    filas demo: jamás debe correr sobre datos vivos.
USER_COUNT=$(psql -tAc "SELECT count(*) FROM users;" 2>/dev/null | tr -d '[:space:]')
if [ -z "$USER_COUNT" ] || [ "$USER_COUNT" = "0" ]; then
  say "base vacía → sembrando settings + admin…"
  RESET_TOKEN=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')   # ≤40 chars
  sed "s/_ADMIN_EMAIL_/${ADMIN_EMAIL}/g" /seed/sql/hmdm_init.en.sql | psql -q >/dev/null 2>&1 \
    || say "aviso: el seed reportó incidencias (suele ser inocuo)."
  psql -q -c "UPDATE users SET password='$(pwhash "$ADMIN_PASSWORD")', passwordreset=true, passwordresettoken='${RESET_TOKEN}' WHERE login='admin';" >/dev/null \
    && say "admin sembrado (se forzará cambio de contraseña en el primer login)."
else
  say "ya hay ${USER_COUNT} usuario(s) → no siembro; credenciales y configuraciones intactas."
fi

# 3) Reparaciones idempotentes que corren SIEMPRE (habilita el alta por QR y limpia las apps
#    auxiliares de Headwind).
psql -q -f /seed/sql/post_seed.sql >/dev/null 2>&1 \
  || say "aviso: post_seed.sql reportó incidencias."
say "post_seed aplicado."

say "listo. El contenedor queda en reposo (Coolify lo mantiene 'running')."
exec sleep infinity
