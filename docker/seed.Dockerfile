# Sembrador del admin/settings para el despliegue en Coolify.
# setup.sh hace esto desde el host con `docker compose exec`; Coolify no ejecuta pasos post-deploy,
# así que va como un contenedor más: espera a Liquibase, siembra si la base está vacía, aplica
# post_seed.sql y se duerme. Idempotente: en un redeploy detecta datos y no toca nada.
FROM postgres:14
COPY install/sql/ /seed/sql/
COPY coolify/seed.sh /seed/seed.sh
RUN chmod +x /seed/seed.sh
ENTRYPOINT ["/bin/bash", "/seed/seed.sh"]
