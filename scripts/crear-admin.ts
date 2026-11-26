/**
 * Crea un administrador o restablece su clave.
 *   npm run crear-admin -- <usuario> <clave>
 * (en EasyPanel: consola del servicio, con las mismas variables de entorno).
 */
import { admins, cerrar, conectar } from '../src/lib/db.js'
import { hashClave } from '../src/lib/auth.js'

const [usuario, clave] = process.argv.slice(2)
if (!usuario || !clave || clave.length < 10) {
  console.error('Uso: npm run crear-admin -- <usuario> <clave de al menos 10 caracteres>')
  process.exit(1)
}

await conectar()
const r = await admins().updateOne(
  { usuario },
  { $set: { claveHash: await hashClave(clave) }, $setOnInsert: { usuario, creadoEn: new Date() } },
  { upsert: true },
)
console.log(r.upsertedCount ? `Administrador "${usuario}" creado.` : `Clave de "${usuario}" restablecida.`)
await cerrar()
