# MDMesh en Coolify (Reno)

Rama `coolify` del fork. Upstream: `MDMesh-app/MDMesh` (Apache-2.0). Los archivos originales no se
tocan; lo específico de Coolify vive en:

| Archivo | Para qué |
|---|---|
| `docker-compose.coolify.yml` | El stack que despliega Coolify (`Docker Compose Location`). |
| `docker/seed.Dockerfile` + `coolify/seed.sh` | Siembra el admin y `post_seed.sql` (lo que hace `setup.sh` desde el host). |

## Por qué no se usa `setup.sh` ni `quickstart.sh`

- `quickstart.sh` baja imágenes de GHCR y los paquetes de `MDMesh-app` **son privados** (`403`),
  así que aquí se **construye desde fuente** (Maven/JDK 17 + npm). El primer build es largo.
- `setup.sh` levanta el stack con `docker compose` desde el host y luego siembra con
  `docker compose exec`. Eso deja el stack fuera del control de Coolify, por eso se replicó
  como el servicio `seed`.

## Diferencias contra el compose de upstream

- Sin `image: ghcr.io/...`: sólo `build:`.
- Caddy en `:80` sin Let's Encrypt — el TLS lo termina el Traefik de Coolify.
- `supervisor` **sin** `/var/run/docker.sock` ni `./:/project`, con `APPLY_SUPPORTED=0`.
  Un despliegue construido desde fuente no puede auto-aplicar imágenes (lo dice `DEPLOY.md`), así
  que el socket sólo sería superficie de ataque. Se conserva por el espejo verificado del APK
  (`/files/agent.apk`) y por `/recovery`.
  **Para actualizar: `Redeploy` en Coolify**, no el botón "Update" de la consola.
- Sin `cloudflared`.

## Variables (en Coolify, no en el repo)

`DB_PASSWORD`, `HASH_SECRET`, `BASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
`VITE_AGENT_PACKAGE`, `VITE_AGENT_CHECKSUM`, `VITE_AGENT_APK_URL`.

`VITE_AGENT_CHECKSUM` es el `components.apk.signatureChecksum` del `manifest.json` del release
que sirva el supervisor. Si cambia el release del agente, actualízalo y vuelve a construir, o el
QR de alta no cuadrará con el APK.

## Sincronizar con upstream

```bash
git remote add upstream https://github.com/MDMesh-app/MDMesh.git
git fetch upstream && git rebase upstream/main   # sobre la rama coolify
```
