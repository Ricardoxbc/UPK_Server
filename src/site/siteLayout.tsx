import { SITE_ICONS } from './icons.js'

/** Versión de los recursos del sitio: cambiarla al modificar site.css o site.js (caché de 1 h). */
export const SITE_ASSET_VERSION = 2

export function iconUrl(name: string): string {
  if (!(name in SITE_ICONS)) throw new Error(`Icono desconocido: ${name}`)
  return `/site/img/${name}.png`
}

export function SiteHead(props: { title: string; description: string }) {
  return (
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>{props.title}</title>
      <meta name="description" content={props.description} />
      <meta property="og:title" content={props.title} />
      <meta property="og:description" content={props.description} />
      <link rel="icon" href={iconUrl('registerIcon')} />
      <link rel="stylesheet" href={`/site/site.css?v=${SITE_ASSET_VERSION}`} />
    </head>
  )
}
