const CARTO_DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

/** CARTO returns an API-key watermark (with HTTP 200) for anonymous tiles. */
export function cartoTileUrl(apiKey: string): string {
  const key = apiKey.trim();
  if (!key) throw new Error('CARTO basemap key is not configured.');
  return `${CARTO_DARK_TILES}?key=${encodeURIComponent(key)}`;
}
