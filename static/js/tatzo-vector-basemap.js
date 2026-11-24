/* Experimental Tatzo vector basemap. Default map is unchanged. */
(() => {
  "use strict";
const palettes={
 midnight:{bg:'#0b191e',green:'#15332f',water:'#153c49',building:'#20343b',outline:'#2a4148',road:'#34545b',major:'#4a7478',edge:'#14272e',text:'#b7d1d2',halo:'#0b191e',boundary:'#607879'},
 porcelain:{bg:'#f3f1eb',green:'#dce8d9',water:'#c5dfe5',building:'#dfdbd2',outline:'#cfcac0',road:'#ffffff',major:'#fffdf7',edge:'#d5d1c7',text:'#425359',halo:'#f3f1eb',boundary:'#a1a8a2'},
 ink:{bg:'#19171e',green:'#282e2c',water:'#283647',building:'#322c37',outline:'#443947',road:'#514653',major:'#786174',edge:'#26212b',text:'#e2cedb',halo:'#19171e',boundary:'#7a6477'}
};

const zoom=(...stops)=>['interpolate',['linear'],['zoom'],...stops];
const cls=(...values)=>['in',['get','class'],['literal',values]];
function makeStyle(base, theme, tilted = false){
 const p=palettes[theme];
 if (!p) throw new Error('Unknown Tatzo map theme');
 const source=Object.keys(base.sources).find(k=>base.sources[k].type==='vector');
 if(!source||!base.glyphs)throw new Error('Vector source or glyphs unavailable');
 const font=base.layers.find(l=>l.type==='symbol'&&Array.isArray(l.layout?.['text-font'])&&l.layout['text-font'].every(x=>typeof x==='string'))?.layout['text-font'];
 if(!font)throw new Error('Font stack unavailable');
 const layer=(id,type,src,paint,extra={})=>({id,type,source,'source-layer':src,paint,...extra});
 const fill=(id,src,color,extra={})=>layer(id,'fill',src,{'fill-color':color},extra);
 const line=(id,src,color,width,extra={})=>layer(id,'line',src,{'line-color':color,'line-width':width},{layout:{'line-cap':'round','line-join':'round'},...extra});
 const label=(id,src,size,extra={})=>layer(id,'symbol',src,{'text-color':p.text,'text-halo-color':p.halo,'text-halo-width':1.2},{...extra,layout:{'text-field':['coalesce',['get','name'],['get','name:en'],''],'text-font':font,'text-size':size,'text-max-width':9,...extra.layout}});
 const roadFilter=cls('motorway','trunk','primary','secondary','tertiary','minor','service','track','path');
 const majorFilter=cls('motorway','trunk','primary','secondary');
 return {version:8,name:'Tatzo '+theme,glyphs:base.glyphs,sources:{[source]:base.sources[source]},layers:[
 {id:'tatzo-background',type:'background',paint:{'background-color':p.bg}},
 fill('tatzo-nature','landcover',p.green),
 fill('tatzo-parks','park',p.green),
 fill('tatzo-water','water',p.water),
 line('tatzo-waterways','waterway',p.water,zoom(8,.4,16,3),{minzoom:8}),
 fill('tatzo-buildings','building',p.building,{minzoom:13}),
 layer('tatzo-building-3d','fill-extrusion','building',{'fill-extrusion-color':p.building,'fill-extrusion-height':['max',3,['to-number',['get','render_height'],['get','height'],5]],'fill-extrusion-base':0,'fill-extrusion-opacity':.88},{minzoom:14,layout:{visibility:tilted?'visible':'none'}}),
 line('tatzo-borders','boundary',p.boundary,zoom(2,.5,10,1.1),{maxzoom:12}),
 line('tatzo-road-casing','transportation',p.edge,zoom(5,.8,10,2,14,5,18,16),{filter:roadFilter}),
 line('tatzo-roads','transportation',p.road,zoom(5,.4,10,1.1,14,3.4,18,12),{filter:roadFilter}),
 line('tatzo-main-casing','transportation',p.edge,zoom(5,1.2,10,3.2,14,7,18,20),{filter:majorFilter}),
 line('tatzo-main-roads','transportation',p.major,zoom(5,.7,10,2,14,5,18,16),{filter:majorFilter}),
 label('tatzo-city-labels','place',zoom(3,10,10,14,15,17),{filter:cls('city','town','village','suburb','neighbourhood','quarter','country','state')}),
 label('tatzo-street-labels','transportation_name',zoom(12,10,17,13),{minzoom:12,filter:roadFilter,layout:{'symbol-placement':'line','symbol-spacing':250,'text-max-angle':35}})
 ]};
}

  const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
  const CDN = "https://unpkg.com/";
  const MAPLIBRE = "maplibre-gl@5.6.1/dist/";
  const BRIDGE = "@maplibre/maplibre-gl-leaflet@0.1.3";
  const CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · <a href="https://openmaptiles.org/">OpenMapTiles</a> · <a href="https://openfreemap.org/">OpenFreeMap</a>';
  const allowed = ["midnight", "porcelain", "ink"];
  function asset(tag, url) {
    return new Promise((resolve, reject) => {
      const el = document.createElement(tag);
      let timer;
      const finish = (err) => { clearTimeout(timer); el.onload = el.onerror = null; if(err) { el.remove(); reject(err); } else resolve(); };
      if(tag === "link") { el.rel = "stylesheet"; el.href = url; }
      else { el.src = url; el.async = true; }
      el.onload = () => finish();
      el.onerror = () => finish(new Error("Map dependency unavailable"));
      timer = setTimeout(() => finish(new Error("Map dependency timeout")), 10000);
      document.head.appendChild(el);
    });
  }
  async function fetchStyle() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(STYLE_URL, {signal:controller.signal, credentials:"omit", referrerPolicy:"no-referrer"});
      if (!response.ok) throw new Error("Vector style unavailable");
      return await response.json();
    } finally {clearTimeout(timer);}
  }
  async function activate(map, raster) {
    const params = new URLSearchParams(location.search);
    const requested = params.get("basemap");
    if (!allowed.includes(requested)) return;
    const L = window.L;
    let vector, gl, deadline, observer, control, credited = false, stopped = false, ready = false;
    const container = map.getContainer();
    container.dataset.tatzoBasemap = "loading";
    function fallback(reason) {
      if (stopped) return;
      stopped = true;
      clearTimeout(deadline);
      observer?.disconnect();
      if (!map.hasLayer(raster)) raster.addTo(map);
      if (vector && map.hasLayer(vector)) map.removeLayer(vector);
      if (credited) map.attributionControl?.removeAttribution(CREDIT);
      if (control) map.removeControl(control);
      container.dataset.tatzoBasemap = "raster-fallback";
      console.warn("Tatzo vector basemap fallback:", reason);
    }
    try {
      const base = await fetchStyle();
      await Promise.all([asset("link",CDN+MAPLIBRE+"maplibre-gl.css"),asset("script",CDN+MAPLIBRE+"maplibre-gl.js")]);
      if (!window.maplibregl?.supported()) throw new Error("WebGL unavailable");
      await asset("script", CDN+BRIDGE);
      if (typeof L.maplibreGL !== "function") throw new Error("Leaflet adapter unavailable");
      const style = makeStyle(base,requested);
      // Render below the raster while warming up; keep old map visible until idle.
      const pane = map.createPane("tatzoVectorPane");
      pane.style.zIndex = "190";
      pane.style.pointerEvents = "none";
      vector = L.maplibreGL({style, pane:"tatzoVectorPane", attributionControl:false, interactive:false, renderWorldCopies:false, maxPitch:0});
      vector.addTo(map);
      gl = vector.getMaplibreMap();
      if (!gl) throw new Error("Vector renderer unavailable");
      deadline = setTimeout(() => fallback("Vector map did not become ready"), 16000);
      gl.on("error", event => fallback(event.error?.message || "Vector resource failed"));
      gl.getCanvas().addEventListener("webglcontextlost", () => fallback("WebGL context lost"), {once:true});
      gl.once("idle", () => {
        if (stopped) return;
        clearTimeout(deadline);
        ready = true;
        map.attributionControl?.addAttribution(CREDIT);
        credited = true;
        map.removeLayer(raster);
        container.dataset.tatzoBasemap = requested;
        const ThemeControl = L.Control.extend({
          onAdd() {
            const box = L.DomUtil.create("div","leaflet-bar tatzo-basemap-control");
            const select = document.createElement("select");
            select.setAttribute("aria-label","Tatzo map theme");
            for (const name of [...allowed,"raster"]) {
              const option = document.createElement("option");
              option.value = name;
              option.textContent = name === "raster" ? "Classic map" : "Tatzo "+name[0].toUpperCase()+name.slice(1);
              select.appendChild(option);
            }
            select.value = requested;
            select.style.cssText = "max-width:150px;padding:6px;background:#071317;color:#efffff;border:0;font:inherit";
            L.DomEvent.disableClickPropagation(box);
            L.DomEvent.disableScrollPropagation(box);
            select.addEventListener("change", () => {
              const url = new URL(location.href);
              if (select.value === "raster") url.searchParams.delete("basemap");
              else url.searchParams.set("basemap",select.value);
              // Keep Leaflet camera and filters intact when changing vector styles.
              if (select.value === "raster") { history.replaceState(history.state,"",url); fallback("Classic map selected"); return; }
              try {
                if (!ready || stopped) return;
                const next = select.value;
                ready = false;
                if (!map.hasLayer(raster)) raster.addTo(map);
                container.dataset.tatzoBasemap = "loading";
                clearTimeout(deadline);
                deadline = setTimeout(() => fallback("Theme load timeout"),16000);
                gl.once("idle", () => {
                  if(stopped) return;
                  clearTimeout(deadline);
                  ready = true;
                  map.removeLayer(raster);
                  container.dataset.tatzoBasemap = next;
                  history.replaceState(history.state,"",url);
                  select.disabled = false;
                });
                select.disabled = true;
                gl.setStyle(makeStyle(base,next),{diff:false});
              } catch (err) {fallback(err.message);}
            });
            box.appendChild(select);
            return box;
          }
        });
        control = new ThemeControl({position:"topright"}).addTo(map);
      });
      if (window.ResizeObserver) {
        observer = new ResizeObserver(() => { if (!stopped && container.clientWidth && container.clientHeight) map.invalidateSize({pan:false}); });
        observer.observe(container);
      }
      map.once("unload", () => { stopped=true; clearTimeout(deadline); observer?.disconnect(); });
    } catch (error) {fallback(error.message);}
  }
  window.TatzoVectorBasemap = Object.freeze({activate, makeStyle});
})();
