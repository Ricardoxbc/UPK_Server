# UPK Server

Servidor de versiones y actualizaciones del sistema **UPK**. Lo consulta **UPK Launcher** en cada
inicio para saber si hay una versión nueva, descargarla y reportar el resultado. Incluye un panel
web para publicar versiones y ver qué versión tiene cada cliente.

- **Node 22 + Hono + TypeScript**, panel con JSX en el servidor (sin React en el navegador).
- **MongoDB** (el existente en el VPS), base propia `upk_server`.
- Los jar se guardan en disco (`DATA_DIR`, volumen `/data`) y se sirven con `Range` (el Launcher
  reanuda descargas canceladas).
- Ligero: ~60 MB de RAM en ejecución.

## Seguridad: la firma

Los jar se **firman en la PC del desarrollador** (`Firmador`, dentro de `Launcher.jar`) con la clave
privada, que **nunca sube al servidor**. El servidor solo tiene la clave pública
(`PUBLIC_KEY_B64`) y **rechaza** cualquier jar cuya firma no coincida. Cada Launcher vuelve a
verificar SHA-256 y firma antes de instalar. Aunque alguien tomara el servidor, no podría
distribuir un jar que los Launcher acepten.

## Desarrollo local

```bash
npm install
cp .env.example .env      # completar MONGO_URL, SESSION_SECRET, PUBLIC_KEY_B64, ADMIN_*
# en local por http: COOKIE_SEGURA=false y BASE_URL=http://127.0.0.1:3000
npm run dev               # recarga en caliente
```
Panel: http://127.0.0.1:3000/panel · Salud: `/salud`

## Despliegue en EasyPanel

1. **MongoDB** (servicio existente): crear la base y un usuario solo para ella:
   ```js
   use upk_server
   db.createUser({ user: "upk_server", pwd: "<clave>", roles: [{ role: "readWrite", db: "upk_server" }] })
   ```
2. **Nuevo servicio App** → origen GitHub `Ricardoxbc/UPK_Server`, rama `main`, construcción
   **Dockerfile**. Activar el despliegue automático al hacer push.
3. **Montaje**: volumen en `/data` (aquí quedan los jar; incluirlo en los respaldos).
4. **Dominio**: usar la URL https que ofrece EasyPanel; puerto interno `3000`.
5. **Variables de entorno** (ver `.env.example`): `MONGO_URL` (host interno del servicio Mongo),
   `MONGO_DB`, `SESSION_SECRET`, `PUBLIC_KEY_B64`, `BASE_URL` (la URL https del paso 4),
   `ADMIN_USUARIO`, `ADMIN_CLAVE`.
6. **Recursos**: límite de memoria 128 MB.
7. Desplegar, entrar al panel con el administrador inicial y **quitar `ADMIN_CLAVE`** de las variables.
   (Para restablecer una clave: consola del servicio → `npm run crear-admin -- <usuario> <clave>`.)
8. Panel → **Tokens** → crear un token de publicación para la PC de desarrollo.

Respaldos: `mongodump --db upk_server` + copia del volumen `/data`.

## Publicar una versión

Desde la PC de desarrollo (la clave privada no sale de ahí):

```powershell
$env:UPK_TOKEN = "upk_…"
java -cp Launcher.jar com.upksoft.launcher.tools.Firmador publicar app.jar C:\ruta\segura\private_key.b64 `
     --url https://upk-server.xxxx.easypanel.host --notas "Novedades de la versión"
```
Opciones: `--version 1.5.0` (por defecto la `Implementation-Version` del jar), `--obligatoria`,
`--borrador` (sube sin publicar). También se puede subir desde el panel pegando la firma que
imprime `Firmador firmar`.

En el panel → **Versiones**: publicar / retirar, marcar obligatoria u opcional, editar notas,
eliminar borradores o retiradas.

## Cómo decide qué ofrecer

Para un cliente con versión local `L`:
- **Destino** = la versión fijada al cliente (panel → Clientes) si está publicada; si no hay fijada,
  la mayor versión publicada. Un cliente **inactivo** no recibe nada.
- **versionMinima** = la mayor versión obligatoria publicada ≤ destino.
- **obligatoria** = hay alguna versión obligatoria entre `L` (exclusive) y destino (inclusive): si
  un cliente salta de 1.2 a 1.6 y la 1.4 era obligatoria, la 1.6 le llega como obligatoria.
- **mensaje** = notas de todas las versiones que se salta.

Para deshacer una versión: retirarla y publicar una nueva mayor (el Launcher nunca baja de versión).

## API

| Método y ruta | Uso |
|---|---|
| `GET /api/v1/actualizacion?cliente=ID&version=X` | Consulta del Launcher. Registra/actualiza el cliente |
| `GET /api/v1/descargas/{version}` | Jar de una versión publicada (admite `Range`) |
| `POST /api/v1/reporte` | `{cliente, equipo, versionAntes, versionDespues, resultado, detalle}`; `resultado` = actualizado / cancelado / fallido / revertido / omitido / pospuesto |
| `POST /api/admin/versiones` | Subida (multipart: `jar`, `version`, `firma`, `sha256`, `notas`, `obligatoria`, `publicar`). Requiere `Authorization: Bearer <token>` |
| `GET /salud` | Comprobación de vida |

Respuesta de ejemplo:
```json
{ "hayActualizacion": true, "nuevaVersion": "1.5.0",
  "urlDescarga": "https://…/api/v1/descargas/1.5.0", "sha256": "…", "firma": "…",
  "versionMinima": "1.5.0", "obligatoria": true, "mensaje": "Notas" }
```
Si se define `NUEVA_API_URL`, la respuesta incluye `nuevaApiUrl` y cada Launcher actualiza su
`update.api.url` (para cambiar de dominio sin visitar cada PC).

## Datos (MongoDB `upk_server`)

`versiones`, `clientes`, `reportes` (caducan a los 180 días), `admins`, `tokens` (solo el hash),
`auditoria`. Los índices se crean al arrancar.
