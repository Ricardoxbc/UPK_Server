# UPK_Server — contexto para Claude

Servidor de versiones/actualizaciones que consulta **UPK Launcher** (`../UPK_Launcher`, Java 8). Uso y despliegue:
`README.md`. Decisiones: `../UPK_Launcher/docs/PROPUESTA_SERVIDOR.md`.

## Reglas del dueño
- **Código en inglés y camelCase** (identificadores, archivos, rutas, JSON, campos de Mongo, variables de entorno).
  Solo comentarios, textos de la interfaz y explicaciones en español.
- VPS con EasyPanel, ~1 GB libre → **ligero** (Hono, sin Next.js/Spring; límite 128 MB, `--max-old-space-size=96`).
- MongoDB existente (driver oficial, sin ORM). Jar en disco (`DATA_DIR`), nunca completos en memoria (busboy + streams).
- La clave privada **nunca** llega al servidor; solo `PUBLIC_KEY_B64` (= `update_public_key.b64` del Launcher).
- **Cada cliente tiene su propia versión (personalizada)**. Una versión existe solo para sus `clientIds`. Nunca se
  debe actualizar un cliente por error: asignar solo a clientes registrados, sin números repetidos por cliente,
  descarga restringida por `clientId`, confirmación con la lista exacta antes de publicar, y el Launcher ignora
  respuestas cuyo `clientId` no es su `cliente.id` (y no se actualiza con `CLIENTE_DEMO`).
- `isGlobal` = "versión general de la app"; solo para el historial, no decide a quién se entrega.

## Estructura
`src/index.ts` (arranque, cabeceras, límites) · `src/routes/public.ts` (update, downloads con Range, report) ·
`src/routes/admin.ts` (subida con token Bearer, lista de clientes) · `src/lib/releases.ts` (`registerVersion`,
`validateTargets`, `computeUpdate`, `clientVersionKinds`) · `src/lib/version.ts` (debe comportarse igual que
`VersionUtil.comparar` del Launcher) · `src/panel/` (JSX en servidor; `ClientPicker` + `PANEL_SCRIPT` en `layout.tsx`;
sesión con cookie firmada, CSRF por Origin + SameSite=Strict).

## Contrato con el Launcher (no romper)
`UpdateResponse` (Java usa @SerializedName): `clientId, hasUpdate, newVersion, downloadUrl, sha256, signature,
minVersion, mandatory, message, newApiUrl`. El Launcher deriva `…/report` reemplazando `/update` al final de su
`update.api.url`. Multipart de `Firmador publicar`: `version, sha256, signature, notes, mandatory, isGlobal, publish,
clientIds` (coma-separado) + `jar`.

## Componentes (servicio de sincronización UPK Sync)
`src/lib/components.ts` + `src/panel/componentsPages.tsx` (menú *Sincronización*). Paquetes zip firmados en
`componentPackages` (`DATA_DIR/components/{id}/package.zip`); estado deseado por cliente en `clients.syncService`
(`enabled`, `packageId` null = el más reciente, `env` con `UPK_MONGODB_URI/UPK_MONGODB_DB/UPK_WEBHOOK_URL/SYNC_CRON`,
vínculo `keyHash/boundMachine`, último `status`); historial en `componentReports` (180 días). Rutas públicas
`GET /api/v1/components`, `GET /api/v1/components/downloads/:id`, `POST /api/v1/components/report`: exigen
`X-Client-Key`; el primer Launcher que consulta queda vinculado (los demás 403) porque la respuesta lleva la URI de
MongoDB. Subida: `POST /api/admin/components` (multipart, archivo `package`) o `Firmador publicar-componente`.
La auditoría nunca guarda la URI. Guía: `../UPK_Launcher/docs/SINCRONIZACION_REMOTA.md`.
Reinicio del estado: el panel fija `syncService.resetId` (aleatorio); `/components` lo envía como `resetId` y el
reporte que trae el mismo `resetId` lo limpia (`resetDoneAt`).

Página del cliente en Sincronización: URI visible, comando `mongosh` (usuario `upk_<cliente>` con `readWrite` solo en su
base, clave nueva en cada carga), *Probar webhook* (POST `event:"test"` desde el servidor al webhook guardado) y la
descripción del cron en `cronText` de `PANEL_SCRIPT` (casos comunes; el resto dice "Personalizada").

## Launcher (autoactualización) y panel
`src/lib/launcher.ts` (`registerLauncherRelease` con validaciones: versión mayor, manifest = versión, Main-Class,
**misma clave pública embebida**, bytecode ≤ 52; `launcherOffer`; URL firmada HMAC derivada de `SESSION_SECRET`,
10 min; enlaces públicos con hash en `launcherLinks`) + `src/lib/zip.ts` (lector zip mínimo, sin dependencias) +
`src/panel/launcherPages.tsx`. Una sola versión `current` para todos los clientes activos; `settings._id=launcher`
→ `distribution` (pausa). `/update` agrega `launcher` solo si llega `launcherVersion` menor (Launchers < 1.1.0 no lo
envían). Reportes con `component: 'launcher'` (no cambian `clients.lastVersion`); `clientMachines.launcherVersion`.
Panel: menú lateral agrupado, modo oscuro automático, tokens CSS en `STYLESHEET`; subidas multipart por XHR con
barra de progreso y botones deshabilitados (`PANEL_SCRIPT`; sigue `xhr.responseURL` tras la redirección);
`?v=2` en style.css/panel.js para romper la caché de 1 h al cambiarlos.

## Registro de equipos (telemetría básica)
`/update` recibe además `machine`, `machineId` (32 hex: SHA-256 del MachineGuid de Windows, lo calcula el Launcher) y
`mode`; `recordMachine` hace upsert en `clientMachines` (único por clientId+machineId). Se desactiva por cliente
(`clients.telemetry=false`, casilla *Registrar equipos* en Clientes). Clientes muestra equipos de los últimos 30 días
y marca en rojo más de uno en modo servidor; detalle en `/panel/clients/:id/machines`. Launchers viejos no lo envían.

## Identificación (launcher.properties perdido)
`POST /api/v1/identify {clientId, version, machine, hasApp}` (en `routes/public.ts`): **no crea clientes**
(a diferencia de `/update`). Acepta solo cliente existente + activo + versión = mayor publicada para él
(`expectedVersion`; sin publicadas, `lastVersion`), comparada como **texto exacto** ("1.0" ≠ "1.0.0", a propósito). Mismo 403 para ID y versión (no revela si el ID existe); 5 fallos
por IP → 429 durante 15 min (en memoria). Cada intento va a `identifications` (365 días) y se ve en *Clientes*.

## Probar en local
Mongo temporal: `mongod --dbpath <tmp> --port 27099` (MongoDB 7 en `C:\Program Files\MongoDB`; el servicio de Windows
está detenido, no tocarlo). Env en un archivo fuera del repo con `SECURE_COOKIE=false`;
`npm run build && node --env-file=<archivo> dist/src/index.js`. Jars de prueba: claves con `Firmador genkeys`, su
pública en `PUBLIC_KEY_B64`; en el Launcher, la carpeta de esa pública antes de `Launcher.jar` en el classpath.
Lección: `secureHeaders` con `Referrer-Policy: no-referrer` hace que el navegador envíe `Origin: null` y el login
falla (403); por eso `same-origin`. Los `confirm()` del panel bloquean la automatización del navegador: probar esos
POST con curl.

## Estado
Desplegado en EasyPanel (nombres en inglés) y probado en el servidor real: funciona, incluidos el panel rediseñado y
la página Launcher. El despliegue automático por webhook de GitHub funciona (push a `main` → EasyPanel despliega).
