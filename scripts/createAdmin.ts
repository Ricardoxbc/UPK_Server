/**
 * Crea un administrador o restablece su clave.
 *   npm run create-admin -- <usuario> <clave>
 * (en EasyPanel: consola del servicio, con las mismas variables de entorno).
 */
import { admins, connect, disconnect } from '../src/lib/db.js'
import { hashPassword } from '../src/lib/auth.js'

const [username, password] = process.argv.slice(2)
if (!username || !password || password.length < 10) {
  console.error('Uso: npm run create-admin -- <usuario> <clave de al menos 10 caracteres>')
  process.exit(1)
}

await connect()
const result = await admins().updateOne(
  { username },
  { $set: { passwordHash: await hashPassword(password) }, $setOnInsert: { username, createdAt: new Date() } },
  { upsert: true },
)
console.log(result.upsertedCount ? `Administrador "${username}" creado.` : `Clave de "${username}" restablecida.`)
await disconnect()
