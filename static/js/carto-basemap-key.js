(() => {
  const shell = document.querySelector('.maps-shell');
  const apiKey = shell?.dataset.cartoBasemapApiKey?.trim();
  const tileLayerPrototype = window.L?.TileLayer?.prototype;
  const originalInitialize = tileLayerPrototype?.initialize;

  if (!apiKey || typeof originalInitialize !== 'function') return;

  tileLayerPrototype.initialize = function initializeCartoTileLayer(url, options) {
    let nextUrl = url;

    if (
      typeof nextUrl === 'string'
      && nextUrl.includes('basemaps.cartocdn.com')
      && !/[?&]key=/.test(nextUrl)
    ) {
      const separator = nextUrl.includes('?') ? '&' : '?';
      nextUrl = `${nextUrl}${separator}key=${encodeURIComponent(apiKey)}`;
    }

    return originalInitialize.call(this, nextUrl, options);
  };
})();
