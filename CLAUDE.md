# UPK_Server — contexto para Claude

Servidor de versiones/actualizaciones que consulta **UPK Launcher** (`../UPK_Launcher`, Java 8). Idioma: **español**.
Uso y despliegue: `README.md`. Decisiones: `../UPK_Launcher/docs/PROPUESTA_SERVIDOR.md`.

## Decisiones del dueño
- VPS con EasyPanel, ~1 GB libre → **ligero** (Hono, sin Next.js/Spring; límite 128 MB, `--max-old-space-size=96`).
- MongoDB existente (driver oficial, sin ORM). Jar en disco (`DATA_DIR`), nunca en memoria completos (busboy + streams).
- Sin canal beta. URL https de EasyPanel (sin dominio propio).
- La clave privada **nunca** llega al servidor; solo `PUBLIC_KEY_B64` (= `update_public_key.b64` del Launcher).

## Estructura
`src/index.ts` (arranque, cabeceras, límites) · `src/rutas/publica.ts` (actualizacion, descargas con Range, reporte) ·
`src/rutas/admin.ts` (subida con token Bearer) · `src/panel/` (JSX en servidor, sesión con cookie firmada, CSRF por
Origin + SameSite=Strict) · `src/lib/versiones.ts` (`calcularActualizacion`: regla de destino/obligatoria) ·
`src/lib/version.ts` (debe comportarse igual que `VersionUtil.comparar` del Launcher).

## Contrato con el Launcher (no romper)
JSON de `UpdateResponse`: `hayActualizacion, nuevaVersion, urlDescarga, sha256, firma, versionMinima, obligatoria,
mensaje, nuevaApiUrl`. El Launcher deriva `…/reporte` reemplazando `/actualizacion` al final de su `update.api.url`.

## Probar en local
Mongo temporal: `mongod --dbpath <tmp> --port 27099` (hay MongoDB 7 en `C:\Program Files\MongoDB`; el servicio
de Windows está detenido, no tocarlo). `.env` con `COOKIE_SEGURA=false`, `npm run build && node --env-file=.env dist/src/index.js`.
Para firmar jars de prueba: claves de prueba con `Firmador genkeys` y su pública en `PUBLIC_KEY_B64`; en el
Launcher, poner la carpeta de esa pública antes de `Launcher.jar` en el classpath.
Lección: `secureHeaders` con `Referrer-Policy: no-referrer` hace que el navegador envíe `Origin: null` y el login
falla (403); por eso se usa `same-origin`.

## Estado
Verificado en local: subida/firma, cálculo obligatoria/opcional, Range/416, reportes, panel (login, publicar,
clientes, reportes), Launcher E2E (cancelar, actualizar, revertir, posponer), ~58 MB RAM.
**Sin probar**: build del Dockerfile (no hay Docker local) y despliegue en EasyPanel.
