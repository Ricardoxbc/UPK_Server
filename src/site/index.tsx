import { Hono } from 'hono'
import { config } from '../lib/config.js'
import { SITE_ICONS } from './icons.js'
import { LandingPage } from './landingPage.js'
import { ManualPage } from './manualPage.js'
import { SITE_SCRIPT } from './siteScript.js'
import { SITE_STYLESHEET } from './siteStyles.js'

/** Sitio público: presentación (/) y manual de usuario (/manual). Sin sesión ni datos de la BD. */
export const site = new Hono()

const ASSET_CACHE = 'public, max-age=3600'
const PAGE_CACHE = 'public, max-age=300'

site.get('/', (c) => {
  c.header('Cache-Control', PAGE_CACHE)
  return c.html(<LandingPage demoUrl={config.demoUrl} />)
})

site.get('/manual', (c) => {
  c.header('Cache-Control', PAGE_CACHE)
  return c.html(<ManualPage demoUrl={config.demoUrl} />)
})

site.get('/site/site.css', (c) => c.body(SITE_STYLESHEET, 200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': ASSET_CACHE }))
site.get('/site/site.js', (c) => c.body(SITE_SCRIPT, 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': ASSET_CACHE }))

const iconBuffers = new Map(Object.entries(SITE_ICONS).map(([name, b64]) => [name, Buffer.from(b64, 'base64')]))

site.get('/site/img/:file', (c) => {
  const name = c.req.param('file').replace(/\.png$/, '')
  const data = iconBuffers.get(name)
  if (!data) return c.notFound()
  return c.body(new Uint8Array(data), 200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' })
})
