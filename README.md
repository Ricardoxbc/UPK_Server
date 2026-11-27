# UPK Server

Servidor de versiones y actualizaciones del sistema **UPK**. Lo consulta **UPK Launcher** en cada
inicio para saber si hay una versión nueva **para su cliente**, descargarla y reportar el resultado.
Incluye un panel web para publicar versiones, elegir qué clientes las reciben y ver qué versión
tiene cada uno.

- **Node 22 + Hono + TypeScript**, panel con JSX en el servidor (sin React en el navegador).
- **MongoDB** (el existente en el VPS), base propia `upk_server`.
- Los jar se guardan en disco (`DATA_DIR`, volumen `/data`) y se sirven con `Range` (el Launcher
  reanuda descargas canceladas).
- Ligero: ~60 MB de RAM en ejecución.
- Código en inglés (camelCase); comentarios e interfaz en español.

## Versiones por cliente

Cada cliente tiene su propia versión de la app (puede ser personalizada). Por eso **una versión
existe solo para los clientes asignados**:

- El cliente se identifica por el `cliente.id` del `launcher.properties` de su instalación.
- Una versión (un `app.jar` firmado) se asigna a uno o varios clientes. Un cliente recibe **la mayor
  versión publicada que tenga asignada**; las de otros clientes no existen para él.
- La descarga también exige el cliente: nadie puede bajar la versión de otro.
- El Launcher ignora cualquier respuesta cuyo `clientId` no sea el suyo, y una instalación con
  `cliente.id` vacío o `CLIENTE_DEMO` nunca se actualiza.
- **Global**: casilla que marca una versión como la versión general de la app. No cambia a quién
  se entrega (eso lo deciden los clientes asignados); sirve para el **Historial global**.

Casos típicos:
| Caso | Qué hacer |
|---|---|
| Cambio solo para el cliente A | Subir la versión asignada solo a `A` |
| Nueva versión general para A, B y C | Subirla con **Global** y asignarla a A, B, C (botón "Marcar los que están en versión global"; los clientes con versión personalizada quedan sin marcar) |
| Cliente nuevo | Agregarlo en **Clientes** (o se registra solo cuando su Launcher consulta) y asignarle su versión |

Reglas que evitan errores: solo se puede asignar a clientes registrados (evita errores de tipeo),
un cliente no puede tener dos versiones con el mismo número, una versión publicada debe tener al
menos un cliente, y antes de publicar se pide confirmar la lista exacta de clientes (avisando si
alguno tiene hoy una versión personalizada).

## Seguridad: la firma

Los jar se **firman en la PC del desarrollador** (`Firmador`, dentro de `Launcher.jar`) con la clave
privada, que **nunca sube al servidor**. El servidor solo tiene la clave pública
(`PUBLIC_KEY_B64`) y **rechaza** cualquier jar cuya firma no coincida. Cada Launcher vuelve a
verificar SHA-256 y firma antes de instalar.

## Publicar una versión

### Opción 1: `Firmador publicar` (recomendada)
Firma y sube en un paso desde la PC de desarrollo:

```powershell
$env:UPK_TOKEN = "upk_…"   # panel → Tokens
java -cp Launcher.jar com.upksoft.launcher.tools.Firmador publicar app.jar C:\ruta\segura\private_key.b64 `
     --url https://upk-server.xxxx.easypanel.host --clientes CLI_A,CLI_B,CLI_C --global --notas "Novedades"
```
Opciones: `--clientes` (cliente.id separados por coma; deben existir en el servidor), `--global`,
`--obligatoria`, `--borrador` (sube sin publicar; los clientes se pueden elegir luego en el panel),
`--version 1.5.0` (por defecto la `Implementation-Version` del jar).

### Opción 2: desde el panel
**Versiones → Subir versión** pide la **firma** y, opcionalmente, el **SHA-256**. Ambos salen de:

```powershell
java -cp Launcher.jar com.upksoft.launcher.tools.Firmador firmar app.jar C:\ruta\segura\private_key.b64
```
Imprime dos líneas: `"sha256": "…"` y `"firma": "…"`. Pegue el valor de `firma` en *Firma (Base64)*
y, si quiere, el de `sha256` en *SHA-256* (el servidor lo compara con el del archivo recibido).
Hay que repetirlo con **cada nuevo app.jar**: la firma depende del contenido exacto del archivo.

## Desarrollo local

```bash
npm install
cp .env.example .env      # completar MONGO_URL, SESSION_SECRET, PUBLIC_KEY_B64, ADMIN_*
# en local por http: SECURE_COOKIE=false y BASE_URL=http://127.0.0.1:3000
npm run dev               # recarga en caliente
```
Panel: http://127.0.0.1:3000/panel · Salud: `/health`

## Despliegue en EasyPanel

1. **MongoDB** (servicio existente): crear la base y un usuario solo para ella:
   ```js
   use upk_server
   db.createUser({ user: "upk_server", pwd: "<clave>", roles: [{ role: "readWrite", db: "upk_server" }] })
   ```
2. **Nuevo servicio App** → origen GitHub `Ricardoxbc/UPK_Server`, rama `main`, **Build Path `/`**
   (el Dockerfile está en la raíz del repo), construcción **Dockerfile**. Activar el despliegue
   automático al hacer push.
3. **Montaje**: volumen en `/data` (aquí quedan los jar; incluirlo en los respaldos). **Imprescindible**:
   sin volumen, cada redespliegue borra los jar y los clientes reciben error 500 al descargar (el panel
   marca esas versiones como "archivo faltante" y el log del servicio lo avisa al arrancar).
4. **Dominio**: la URL https que ofrece EasyPanel; puerto interno `3000`.
5. **Variables de entorno** (ver `.env.example`): `MONGO_URL`, `MONGO_DB`, `SESSION_SECRET`,
   `PUBLIC_KEY_B64`, `BASE_URL`, `ADMIN_USER`, `ADMIN_PASSWORD`.
6. **Recursos**: límite de memoria 128 MB.
7. Desplegar, entrar al panel con el administrador inicial y **quitar `ADMIN_PASSWORD`**.
   (Para restablecer una clave: consola del servicio → `npm run create-admin -- <usuario> <clave>`.)
8. Panel → **Tokens** → crear un token de publicación para la PC de desarrollo.

EasyPanel muestra las variables de entorno en el log de construcción (`--build-arg`): no comparta
ese log. Respaldos: `mongodump --db upk_server` + copia del volumen `/data`.

## Cómo decide qué ofrecer

Para el cliente `X` con versión local `L`, solo con las versiones **publicadas asignadas a X**:
- **target** = la mayor. Un cliente **inactivo** no recibe nada.
- **minVersion** = la mayor obligatoria ≤ target.
- **mandatory** = hay alguna obligatoria entre `L` (exclusive) y target (inclusive).
- **message** = notas de todas las versiones que se salta.

Para deshacer una versión: retirarla (el cliente vuelve a ver la anterior asignada, pero el
Launcher nunca baja de versión) y publicar una nueva mayor.

## Diagnóstico

Logs del servicio (EasyPanel → servicio → Logs):
- `[api] GET /api/v1/update?clientId=… → 200 (4 ms)`: una línea por petición del Launcher.
- `[download] Falta el archivo de la versión …`: el jar no está en `DATA_DIR` (volumen no persistente).
- `[storage] …`: al arrancar, `DATA_DIR` sin permiso de escritura o versiones publicadas sin archivo.

En el panel: **Reportes** muestra el resultado de cada intento con el motivo del fallo, y
**Versiones** marca "archivo faltante" / "archivo dañado". El nombre del jar subido no importa:
siempre se guarda y se sirve como `app.jar`.

## API

| Método y ruta | Uso |
|---|---|
| `GET /api/v1/update?clientId=ID&version=X` | Consulta del Launcher. Registra/actualiza el cliente |
| `GET /api/v1/downloads/{versionId}?clientId=ID` | Jar de una versión publicada asignada a ese cliente (admite `Range`) |
| `POST /api/v1/report` | `{clientId, machine, fromVersion, toVersion, result, detail}`; `result` = updated / cancelled / failed / reverted / skipped / postponed |
| `POST /api/admin/versions` | Subida (multipart: `jar`, `version`, `signature`, `sha256`, `notes`, `mandatory`, `isGlobal`, `publish`, `clientIds`). `Authorization: Bearer <token>` |
| `GET /api/admin/clients` | Clientes registrados (con token) |
| `GET /health` | Comprobación de vida |

Respuesta de ejemplo:
```json
{ "clientId": "CLI_A", "hasUpdate": true, "newVersion": "1.5.0",
  "downloadUrl": "https://…/api/v1/downloads/6b08…?clientId=CLI_A", "sha256": "…", "signature": "…",
  "minVersion": "1.5.0", "mandatory": true, "message": "Notas" }
```
Si se define `NEW_API_URL`, la respuesta incluye `newApiUrl` y cada Launcher actualiza su
`update.api.url` (para cambiar de dominio sin visitar cada PC).

## Datos (MongoDB `upk_server`)

`versions`, `clients`, `reports` (caducan a los 180 días), `admins`, `apiTokens` (solo el hash),
`auditLog`. Los índices se crean al arrancar.
