/* Project Atlas: standalone native MapLibre renderer, opt-in only. */
(() => {
"use strict";
const rootURL="https://unpkg.com/maplibre-gl@5.6.1/dist/";
const sourceURL="https://tiles.openfreemap.org/styles/liberty";
const themes=["midnight","porcelain","ink"];
const palettes={
 midnight:{bg:"#12242b",land:"#1b3036",park:"#21473e",forest:"#285a49",water:"#174352",shore:"#36717c",building:"#435d65",outline:"#263c44",road:"#91a9a9",local:"#55727a",main:"#b7c7c3",edge:"#273c44",text:"#e1edeb"},
 porcelain:{bg:"#e9e6dd",land:"#dedbd0",park:"#b7d4b7",forest:"#9bc39d",water:"#a5cfdd",shore:"#80b3c8",building:"#e9ded1",outline:"#c4b5a7",road:"#fffaf0",local:"#f9f5ed",main:"#fffdf7",edge:"#c5bdb0",text:"#31434a"},
 ink:{bg:"#211d29",land:"#2e2938",park:"#344a43",forest:"#426258",water:"#303f60",shore:"#576a88",building:"#615269",outline:"#3e3549",road:"#a99bad",local:"#776a82",main:"#d0b6cb",edge:"#44384d",text:"#f3e5f3"}
};
const z=(...stops)=>["interpolate",["linear"],["zoom"],...stops];
const cls=(...values)=>["in",["get","class"],["literal",values]];
function style(base,theme,quality){
 const p=palettes[theme];if(!p)throw Error("Unknown Atlas theme");
 const s=window.TatzoVectorBasemap.makeStyle(base,theme,false);
 s.name="Tatzo Atlas "+theme;
 const source=Object.keys(s.sources)[0];
 const extra=(id,type,sourceLayer,paint,options={})=>({id,type,source,"source-layer":sourceLayer,paint,...options});
 const by=id=>s.layers.find(l=>l.id===id);
 const before=(id,layer)=>s.layers.splice(s.layers.findIndex(l=>l.id===id),0,layer);
 const paint=(id,changes)=>Object.assign(by(id).paint,changes);
 paint("tatzo-background",{"background-color":p.bg});
 paint("tatzo-nature",{"fill-color":p.forest,"fill-opacity":.55});
 paint("tatzo-parks",{"fill-color":p.park,"fill-outline-color":p.forest});
 before("tatzo-nature",extra("atlas-neighbourhoods","fill","landuse",{"fill-color":p.land,"fill-opacity":.65},{minzoom:9,filter:cls("residential","commercial","industrial","retail","cemetery")}));
 paint("tatzo-water",{"fill-color":p.water,"fill-outline-color":p.shore});
 paint("tatzo-buildings",{"fill-color":p.building,"fill-outline-color":p.outline});
 by("tatzo-buildings").minzoom=13;
 paint("tatzo-road-casing",{"line-color":p.edge,"line-width":z(5,.7,10,2,14,5,18,17)});
 paint("tatzo-roads",{"line-color":p.local,"line-width":z(5,.4,10,1.1,14,3.4,18,12)});
 paint("tatzo-main-casing",{"line-color":p.edge,"line-width":z(5,1.2,10,3.5,14,9,18,25)});
 paint("tatzo-main-roads",{"line-color":p.main,"line-width":z(5,.7,10,2.2,14,6,18,19)});
 before("tatzo-city-labels",extra("atlas-avenues","line","transportation",{"line-color":p.road,"line-width":z(11,.6,15,2.8,18,8)},{minzoom:11,filter:cls("tertiary"),layout:{"line-cap":"round","line-join":"round"}}));
 const extrusion=by("tatzo-building-3d");
 s.layers=s.layers.filter(l=>l!==extrusion);
 extrusion.minzoom=14;
 extrusion.filter=["!=",["to-string",["get","hide_3d"]],"true"];
 extrusion.layout={visibility:quality==="low"?"none":"visible"};
 const height=["max",3,["to-number",["get","render_height"],["get","height"],6]];
 extrusion.paint={"fill-extrusion-color":["interpolate",["linear"],height,3,p.building,45,p.road,120,p.main],"fill-extrusion-height":height,"fill-extrusion-base":["min",height,["max",0,["to-number",["get","render_min_height"],0]]],"fill-extrusion-opacity":1,"fill-extrusion-vertical-gradient":true};
 before("tatzo-city-labels",extrusion);
 s.light={anchor:"map",color:"#fff5e8",intensity:.38,position:[1.5,210,35]};
 for(const id of ["tatzo-city-labels","tatzo-street-labels"]){paint(id,{"text-color":p.text,"text-halo-color":p.bg,"text-halo-width":1.4});}
 by("tatzo-city-labels").layout["text-size"]=z(3,12,10,16,15,18);
 by("tatzo-street-labels").layout["symbol-spacing"]=320;
 return s;
}
function load(tag,url){
 return new Promise((resolve,reject)=>{
  const el=document.createElement(tag);let timer;
  const done=err=>{clearTimeout(timer);el.onload=el.onerror=null;if(err){el.remove();reject(err)}else resolve()};
  if(tag==="link"){el.rel="stylesheet";el.href=url}else{el.src=url;el.async=true}
  el.onload=()=>done();el.onerror=()=>done(Error("Asset unavailable: "+url.split("/").pop()));
  timer=setTimeout(()=>done(Error("Asset timeout")),12000);document.head.append(el);
 });
}
function features(cards){
 return {type:"FeatureCollection",features:cards.flatMap((card,i)=>{
  const d=card.dataset,lat=Number(d.lat),lng=Number(d.lng);
  if(card.classList.contains("is-hidden")||!d.lat?.trim()||!d.lng?.trim()||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>85||Math.abs(lng)>180)return [];
  return [{type:"Feature",id:i,geometry:{type:"Point",coordinates:[lng,lat]},properties:{idx:i,verified:d.source==="verified"?1:0}}];
 })};
}
function addLocations(map,cards){
 map.addSource("atlas-artists",{type:"geojson",data:features(cards),cluster:true,clusterRadius:52,clusterMaxZoom:14,clusterProperties:{verified:["+",["get","verified"]]}});
 const color=["case",["==",["get","verified"],["get","point_count"]],"#04c5bf",["==",["get","verified"],0],"#ee0c6f","#a46ac9"];
 map.addLayer({id:"atlas-cluster-halo",type:"circle",source:"atlas-artists",filter:["has","point_count"],paint:{"circle-color":color,"circle-radius":["step",["get","point_count"],24,25,30,100,36],"circle-opacity":.22}});
 map.addLayer({id:"atlas-clusters",type:"circle",source:"atlas-artists",filter:["has","point_count"],paint:{"circle-color":color,"circle-radius":["step",["get","point_count"],18,25,24,100,30],"circle-stroke-color":"#ffffff","circle-stroke-width":2}});
 const font=map.getStyle().layers.find(l=>l.type==="symbol"&&l.layout?.["text-font"])?.layout["text-font"];
 map.addLayer({id:"atlas-count",type:"symbol",source:"atlas-artists",filter:["has","point_count"],layout:{"text-field":["get","point_count_abbreviated"],"text-font":font,"text-size":13,"text-allow-overlap":true},paint:{"text-color":"#071317","text-halo-color":"#ffffff","text-halo-width":.6}});
 map.addLayer({id:"atlas-points",type:"circle",source:"atlas-artists",filter:["!",["has","point_count"]],paint:{"circle-color":["case",["==",["get","verified"],1],"#04c5bf","#ee0c6f"],"circle-radius":9,"circle-stroke-color":"#fff","circle-stroke-width":2}});
}
async function activate({leafletMap,cards,markers,onPick}){
 const params=new URLSearchParams(location.search);if(params.get("basemap")!=="atlas")return;
 const status=document.querySelector("[data-basemap-status]");
 const classic=leafletMap.getContainer(),frame=classic.parentElement;
 let map,host,controls,observer,resizeObserver,popup,pick,deadline,stopped=false,avatars=new Map(),raf=0,filterFrame=0,base;
 let lastData="";
 let theme=themes.includes(params.get("theme"))?params.get("theme"):"midnight";
 let quality=["low","medium","high"].includes(params.get("quality"))?params.get("quality"):"medium";
 const say=t=>{if(status)status.textContent=t};
 function clearAvatars(){for(const m of avatars.values())m.remove();avatars.clear()}
 function fallback(reason){
  if(stopped)return;stopped=true;clearTimeout(deadline);cancelAnimationFrame(raf);cancelAnimationFrame(filterFrame);observer?.disconnect();resizeObserver?.disconnect();clearAvatars();try{map?.remove()}catch(_){}
  host?.remove();controls?.remove();classic.style.visibility="";leafletMap.invalidateSize({pan:false});say("Atlas → Classic: "+String(reason).slice(0,130));
 }
 function openCard(idx,coord){
  const card=cards[idx];if(!card)return;
  popup?.remove();
  if(window.matchMedia("(max-width:760px)").matches){markers.get(card.dataset.mapKey)?.fire("click");return}
  const html=markers.get(card.dataset.mapKey)?.getPopup()?.getContent();
  if(typeof html==="string")popup=new maplibregl.Popup({offset:20,maxWidth:"350px"}).setLngLat(coord).setHTML(html).addTo(map);
  card.scrollIntoView({behavior:"smooth",block:"nearest"});
 }
 function refreshAvatars(){
  if(stopped||!map?.getLayer("atlas-points"))return;
  if(map.getZoom()<13){clearAvatars();return}
  const found=new Map();
  for(const f of map.queryRenderedFeatures({layers:["atlas-points"]})){
   const idx=Number(f.properties.idx);if(!found.has(idx))found.set(idx,f.geometry.coordinates);
   if(found.size>=90)break;
  }
  for(const [idx,m] of avatars)if(!found.has(idx)){m.remove();avatars.delete(idx)}
  for(const [idx,coord] of found){
   if(avatars.has(idx))continue;const card=cards[idx];if(!card)continue;
   const el=document.createElement("button");el.type="button";el.className="atlas-avatar "+(card.dataset.source==="verified"?"verified":"unclaimed");
   el.setAttribute("aria-label",card.dataset.name||"Tatzo location");
   const img=card.querySelector(".maps-avatar img");
   if(img){const clone=document.createElement("img");clone.src=img.src;clone.alt="";clone.addEventListener("error",()=>{clone.remove();el.textContent=(card.dataset.name||"T").slice(0,1).toUpperCase()},{once:true});el.append(clone)}else{el.textContent=card.dataset.source==="verified"?(card.dataset.name||"T").slice(0,1).toUpperCase():"⌖"}
   el.addEventListener("click",e=>{e.stopPropagation();if(onPick(coord[1],coord[0])){popup?.remove();if(pick)pick.setLngLat(coord);else pick=new maplibregl.Marker({color:"#ee0c6f"}).setLngLat(coord).addTo(map);return}openCard(idx,coord)});
   avatars.set(idx,new maplibregl.Marker({element:el,anchor:"bottom"}).setLngLat(coord).addTo(map));
  }
 }
 function update(){if(stopped||!map?.getSource("atlas-artists"))return;const data=features(cards),signature=JSON.stringify(data);if(signature===lastData)return;lastData=signature;map.getSource("atlas-artists").setData(data);popup?.remove();clearAvatars()}
 try{
  say("Atlas · loading native 3D");
  const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),12000);
  try{const response=await fetch(sourceURL,{signal:abort.signal,credentials:"omit",referrerPolicy:"no-referrer"});if(!response.ok)throw Error("Geography unavailable");base=await response.json()}finally{clearTimeout(timeout)}
  await Promise.all([load("link",rootURL+"maplibre-gl.css"),load("script",rootURL+"maplibre-gl.js")]);
  if(!window.maplibregl?.Map)throw Error("MapLibre unavailable");
  host=document.createElement("div");host.className="atlas-native-map";frame.append(host);
  const c=leafletMap.getCenter();
  map=new maplibregl.Map({container:host,style:style(base,theme,quality),center:[c.lng,c.lat],zoom:Math.max(2,leafletMap.getZoom()-1),pitch:0,maxPitch:65,maxZoom:19,minZoom:2,renderWorldCopies:false,attributionControl:false,canvasContextAttributes:{antialias:quality==="high"}});
  map.addControl(new maplibregl.AttributionControl({compact:true,customAttribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://openmaptiles.org/">OpenMapTiles</a> · <a href="https://openfreemap.org/">OpenFreeMap</a>'}),"bottom-right");
  map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),"top-left");
  deadline=setTimeout(()=>fallback("Native map startup timeout"),22000);
  map.on("error",e=>{if(status&& !stopped)status.title=e.error?.message||"Map resource error"});
  map.getCanvas().addEventListener("webglcontextlost",()=>fallback("WebGL context lost"),{once:true});
  map.once("load",()=>{
   if(stopped)return;
   try{addLocations(map,cards);lastData=JSON.stringify(features(cards))}catch(e){fallback(e.message);return}
   map.once("idle",()=>{
    if(stopped)return;clearTimeout(deadline);classic.style.visibility="hidden";host.classList.add("atlas-ready");say("Tatzo Atlas · "+theme+" / "+quality);
    controls=document.createElement("div");controls.className="atlas-controls";
    const button=(label,fn)=>{const b=document.createElement("button");b.type="button";b.textContent=label;b.addEventListener("click",fn);controls.append(b)};
    button("2D",()=>map.easeTo({pitch:0,bearing:0}));
    button("3D",()=>{if(quality==="low"){say("Atlas · choose Medium or High for 3D");return}map.easeTo({pitch:55,bearing:-22,zoom:Math.max(15,map.getZoom())})});
    button("Clermont-Ferrand",()=>map.flyTo({center:[3.087,45.777],zoom:15.5,pitch:quality==="low"?0:55,bearing:quality==="low"?0:-22}));
    for(const [key,values,current] of [["theme",themes,theme],["quality",["low","medium","high"],quality]]){
     const select=document.createElement("select");select.setAttribute("aria-label","Atlas "+key);
     for(const value of values){const o=document.createElement("option");o.value=value;o.textContent=value;o.selected=value===current;select.append(o)}
     select.addEventListener("change",()=>{const url=new URL(location.href);url.searchParams.set(key,select.value);location.assign(url)});controls.append(select);
    }
    frame.append(controls);refreshAvatars();
   });
  });
  map.on("click",async e=>{
   if(stopped||!map.getLayer("atlas-points"))return;
   if(onPick(e.lngLat.lat,e.lngLat.lng)){
    popup?.remove();if(pick)pick.setLngLat(e.lngLat);else pick=new maplibregl.Marker({color:"#ee0c6f"}).setLngLat(e.lngLat).addTo(map);return
   }
   const hits=map.queryRenderedFeatures(e.point,{layers:["atlas-clusters","atlas-points"]});const f=hits[0];if(!f)return;
   if(f.layer.id==="atlas-clusters"){try{const zoom=await map.getSource("atlas-artists").getClusterExpansionZoom(f.properties.cluster_id);if(!stopped)map.easeTo({center:f.geometry.coordinates,zoom})}catch(_){}}else openCard(Number(f.properties.idx),f.geometry.coordinates);
  });
  map.on("moveend",refreshAvatars);map.on("sourcedata",e=>{if(e.sourceId==="atlas-artists"&&e.isSourceLoaded){cancelAnimationFrame(raf);raf=requestAnimationFrame(refreshAvatars)}});
  observer=new MutationObserver(()=>{cancelAnimationFrame(filterFrame);filterFrame=requestAnimationFrame(update)});
  cards.forEach(card=>observer.observe(card,{attributes:true,attributeFilter:["class"]}));
  if(window.ResizeObserver){resizeObserver=new ResizeObserver(()=>{if(!stopped)map.resize()});resizeObserver.observe(host)}
 }catch(e){fallback(e.message)}
}
window.TatzoAtlas=Object.freeze({activate,style,features});
})();