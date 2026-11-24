/* Project Atlas: standalone native MapLibre renderer, opt-in only. */
(() => {
"use strict";
const rootURL="https://unpkg.com/maplibre-gl@5.6.1/dist/";
const sourceURL="https://tiles.openfreemap.org/styles/liberty";
const themes=["midnight","porcelain","ink"];
const palettes={
 midnight:{bg:"#101e25",land:"#23343b",park:"#25483f",forest:"#2e5949",water:"#163b50",shore:"#285c70",building:"#50666c",outline:"#2d4149",road:"#708e94",local:"#405b64",main:"#a6b7b2",edge:"#182b34",text:"#e1edeb"},
 porcelain:{bg:"#eeeae1",land:"#e5e0d6",park:"#c3d9b9",forest:"#a8c9a1",water:"#a6d1df",shore:"#83b5c9",building:"#e4d6c6",outline:"#c9bbaa",road:"#fffaf0",local:"#f6f1e8",main:"#fffdf7",edge:"#c8bfb1",text:"#31434a"},
 ink:{bg:"#211e29",land:"#302c39",park:"#374f46",forest:"#45685b",water:"#303e5b",shore:"#506587",building:"#675c70",outline:"#40394b",road:"#93869e",local:"#5d536a",main:"#c2a9bf",edge:"#302838",text:"#f3e5f3"}
};
const z=(...stops)=>["interpolate",["linear"],["zoom"],...stops];
const cls=(...values)=>["in",["get","class"],["literal",values]];
function style(base,theme,quality){
 const p=palettes[theme];if(!p)throw Error("Unknown Atlas theme");
 const s=window.TatzoVectorBasemap.makeStyle(base,theme,false);
 s.name="Tatzo Atlas "+theme;
 const source=Object.keys(s.sources)[0];
 s.sources[source]={...s.sources[source],attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · <a href="https://openmaptiles.org/">OpenMapTiles</a> · <a href="https://openfreemap.org/">OpenFreeMap</a>'};
 const extra=(id,type,sourceLayer,paint,options={})=>({id,type,source,"source-layer":sourceLayer,paint,...options});
 const by=id=>s.layers.find(l=>l.id===id);
 const before=(id,layer)=>s.layers.splice(s.layers.findIndex(l=>l.id===id),0,layer);
 const paint=(id,changes)=>Object.assign(by(id).paint,changes);
 paint("tatzo-background",{"background-color":p.bg});
 paint("tatzo-nature",{"fill-color":["match",["get","class"],"wood",p.forest,"grass",p.park,"farmland",p.land,p.park],"fill-opacity":.48});
 paint("tatzo-parks",{"fill-color":p.park,"fill-outline-color":p.forest});
 before("tatzo-nature",extra("atlas-neighbourhoods","fill","landuse",{"fill-color":p.land,"fill-opacity":.65},{minzoom:9,filter:cls("residential","commercial","industrial","retail","cemetery")}));
 paint("tatzo-water",{"fill-color":p.water});
 before("tatzo-buildings",extra("atlas-shoreline","line","water",{"line-color":p.shore,"line-width":z(9,.25,15,.9,18,1.5),"line-opacity":.65},{minzoom:9}));
 paint("tatzo-buildings",{"fill-color":p.building,"fill-outline-color":p.outline});
 by("tatzo-buildings").minzoom=13.5;
 paint("tatzo-buildings",{"fill-opacity":z(13.5,.1,15,.85,17,1)});
 by("tatzo-road-casing").filter=cls("tertiary","minor","service");by("tatzo-roads").filter=cls("tertiary","minor","service");
 by("tatzo-road-casing").minzoom=10;by("tatzo-roads").minzoom=10;
 paint("tatzo-road-casing",{"line-color":p.edge,"line-width":z(10,.8,14,3.6,18,13)});
 paint("tatzo-roads",{"line-color":p.local,"line-width":z(10,.35,14,2.5,18,10)});
 before("tatzo-road-casing",extra("atlas-walkways","line","transportation",{"line-color":p.road,"line-width":z(14,.4,18,1.8),"line-opacity":.45,"line-dasharray":[2,2]},{minzoom:14,filter:cls("path","track")}));
 paint("tatzo-main-casing",{"line-color":p.edge,"line-width":z(5,.8,10,2.7,14,6.5,18,21)});
 paint("tatzo-main-roads",{"line-color":["match",["get","class"],["motorway","trunk"],p.main,p.road],"line-width":z(5,.4,10,1.6,14,4.5,18,15)});
 before("tatzo-city-labels",extra("atlas-avenues","line","transportation",{"line-color":p.road,"line-width":z(11,.6,15,2.8,18,8)},{minzoom:11,filter:cls("tertiary"),layout:{"line-cap":"round","line-join":"round"}}));
 const extrusion=by("tatzo-building-3d");
 s.layers=s.layers.filter(l=>l!==extrusion);
 extrusion.minzoom=14;
 extrusion.filter=["!=",["to-string",["get","hide_3d"]],"true"];
 extrusion.layout={visibility:quality==="low"?"none":"visible"};
 const height=["max",3,["to-number",["get","render_height"],["get","height"],6]];
 extrusion.paint={"fill-extrusion-color":["interpolate",["linear"],height,3,p.building,45,p.building,120,p.road],"fill-extrusion-height":height,"fill-extrusion-base":["min",height,["max",0,["to-number",["get","render_min_height"],0]]],"fill-extrusion-opacity":1,"fill-extrusion-vertical-gradient":true};
 before("tatzo-city-labels",extrusion);
 s.light={anchor:"map",color:"#fff5e8",intensity:.38,position:[1.5,225,38]};
 for(const id of ["tatzo-city-labels","tatzo-street-labels"]){paint(id,{"text-color":p.text,"text-halo-color":p.bg,"text-halo-width":1.4});}
 const regularFont=base.layers.map(l=>l.layout?.["text-font"]).find(f=>Array.isArray(f)&&f.length&&f.every(n=>typeof n==="string"&&!/italic|oblique/i.test(n))&&f.some(n=>/regular|medium/i.test(n)));
 if(regularFont)for(const id of ["tatzo-city-labels","tatzo-street-labels"])by(id).layout["text-font"]=regularFont;
 const places=by("tatzo-city-labels");
 before("tatzo-city-labels",{...places,id:"atlas-country-labels",filter:cls("country"),maxzoom:8,layout:{...places.layout,"text-size":z(3,11,7,15),"text-padding":8}});
 places.minzoom=5;places.filter=cls("city","town","village","suburb","neighbourhood","quarter");
 places.layout["text-size"]=z(5,11,10,14,15,16);
 places.layout["text-padding"]=5;
 by("tatzo-borders").filter=["<=",["to-number",["get","admin_level"],2],2];
 before("tatzo-road-casing",extra("atlas-regional-borders","line","boundary",{"line-color":p.outline,"line-width":.65,"line-opacity":.6},{minzoom:6,maxzoom:11,filter:[">",["to-number",["get","admin_level"],2],2]}));
 const streets=by("tatzo-street-labels");streets.minzoom=13;streets.filter=cls("motorway","trunk","primary","secondary","tertiary","minor");streets.layout["symbol-spacing"]=380;streets.layout["text-size"]=z(13,10,17,12);streets.layout["text-padding"]=5;
 const language=(document.documentElement.lang||"en").split("-")[0];
 if(["en","fr","ru","ro"].includes(language))for(const id of ["atlas-country-labels","tatzo-city-labels"]){by(id).layout["text-field"]=["coalesce",["get","name:"+language],["get","name_"+language],["get","name"],["get","name:en"],""];}
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
 map.addLayer({id:"atlas-count",type:"symbol",source:"atlas-artists",filter:["has","point_count"],layout:{"text-field":["get","point_count_abbreviated"],"text-font":font,"text-size":13,"text-allow-overlap":true},paint:{"text-color":"#ffffff","text-halo-width":0}});
 map.addLayer({id:"atlas-points",type:"circle",source:"atlas-artists",filter:["!",["has","point_count"]],paint:{"circle-color":["case",["==",["get","verified"],1],"#04c5bf","#ee0c6f"],"circle-radius":9,"circle-stroke-color":"#fff","circle-stroke-width":2}});
}
async function activate({leafletMap,cards,markers,onPick}){
 const params=new URLSearchParams(location.search);if(params.get("basemap")!=="atlas")return;
 const status=document.querySelector("[data-basemap-status]");
 const settings=document.querySelector("[data-map-settings]"),nativeControls=document.querySelector("[data-atlas-native-controls]"),settingsTitle=document.querySelector("[data-map-settings-title]"),settingsCurrent=document.querySelector("[data-map-settings-current]");
 const classic=leafletMap.getContainer(),frame=classic.parentElement;
 let map,host,controls,observer,resizeObserver,popup,pick,deadline,stopped=false,avatars=new Map(),raf=0,filterFrame=0,base;
 const bubbles=new Map();let bubbleFrame=0,previousZoom=null,animateFrom=null,splitOrigins=[],splitUntil=0,brand;
 let lastData="";
 let theme=themes.includes(params.get("theme"))?params.get("theme"):"midnight";
 let quality=["low","medium","high"].includes(params.get("quality"))?params.get("quality"):"medium";
 const say=t=>{if(status)status.textContent=t};
 function clearBubbles(){for(const item of bubbles.values())item.marker.remove();bubbles.clear();animateFrom=null;previousZoom=null;splitOrigins=[];splitUntil=0;}
 function clearAvatars(){for(const m of avatars.values())m.remove();avatars.clear()}
 function fallback(reason){
  if(stopped)return;stopped=true;clearTimeout(deadline);cancelAnimationFrame(raf);cancelAnimationFrame(filterFrame);observer?.disconnect();resizeObserver?.disconnect();clearAvatars();clearBubbles();cancelAnimationFrame(bubbleFrame);try{map?.remove()}catch(_){}
  host?.remove();controls?.remove();brand?.remove();if(nativeControls)nativeControls.hidden=true;if(settingsTitle)settingsTitle.textContent="Classic";if(settingsCurrent)settingsCurrent.textContent="Fallback";if(settings)settings.open=true;classic.style.visibility="";leafletMap.invalidateSize({pan:false});say("Atlas → Classic: "+String(reason).slice(0,130));
 }
 function openCard(idx,coord){
  const card=cards[idx];if(!card)return;
  popup?.remove();
  if(window.matchMedia("(max-width:760px)").matches){markers.get(card.dataset.mapKey)?.fire("click");return}
  const html=markers.get(card.dataset.mapKey)?.getPopup()?.getContent();
  if(typeof html==="string")popup=new maplibregl.Popup({offset:20,maxWidth:"350px"}).setLngLat(coord).setHTML(html).addTo(map);
  card.scrollIntoView({behavior:"smooth",block:"nearest"});
 }
 function reducedMotion(){return window.matchMedia("(prefers-reduced-motion: reduce)").matches}
 function bubbleType(verified,count){return verified===count?"verified":verified===0?"unclaimed":"mixed"}
 function pickAt(coord){if(!onPick(coord[1],coord[0]))return false;popup?.remove();if(pick)pick.setLngLat(coord);else pick=new maplibregl.Marker({color:"#ee0c6f"}).setLngLat(coord).addTo(map);return true}
 async function expandCluster(f,face){
  const coord=f.geometry.coordinates;
  if(pickAt(coord))return;
  const source=map.getSource("atlas-artists");if(!source)return;
  try{
   const zoom=await source.getClusterExpansionZoom(f.properties.cluster_id);
   if(stopped)return;
   animateFrom={coord:coord.slice(),until:performance.now()+1400};
   if(face&&!reducedMotion()&&face.animate)face.animate([{transform:"scale(1)"},{transform:"scale(1.18)"},{transform:"scale(.85)",opacity:.6}],{duration:260,easing:"ease-out"});
   map.easeTo({center:coord,zoom:Math.min(map.getMaxZoom(),zoom),duration:reducedMotion()?0:650});
  }catch(_){}
 }
 function animateArrival(face,coord,origins){
  if(reducedMotion()||!origins.length||typeof face.animate!=="function")return;
  const to=map.project(coord);let nearest=null,dist=Infinity;
  for(const origin of origins){const p=map.project(origin);const d=Math.hypot(p.x-to.x,p.y-to.y);if(d<dist){nearest=p;dist=d}}
  if(!nearest||dist>260)return;
  const dx=nearest.x-to.x,dy=nearest.y-to.y;
  face.animate([{transform:"translate("+dx+"px,"+dy+"px) scale(.38)",opacity:.15},{transform:"translate(0,0) scale(1.1)",opacity:1,offset:.76},{transform:"translate(0,0) scale(1)",opacity:1}],{duration:380,easing:"cubic-bezier(.18,.75,.3,1)"});
 }
 function refreshBubbles(){
  if(stopped||!map?.getLayer("atlas-clusters"))return;
  const zoom=map.getZoom(),old=[...bubbles.values()];
  const split=previousZoom!==null&&zoom>previousZoom+.15;
  if(split&&old.length){splitOrigins=old.map(x=>x.coord);splitUntil=performance.now()+650;}
  const origins=performance.now()<splitUntil?splitOrigins.slice():[];
  if(animateFrom&&performance.now()<animateFrom.until)origins.unshift(animateFrom.coord);
  previousZoom=zoom;
  const found=new Map();
  for(const f of map.queryRenderedFeatures({layers:["atlas-clusters"]})){
   const id=String(f.properties.cluster_id);if(!found.has(id))found.set(id,f);if(found.size>=140)break;
  }
  for(const [id,item] of bubbles)if(!found.has(id)){item.marker.remove();bubbles.delete(id)}
  for(const [id,f] of found){
   const count=Number(f.properties.point_count),verified=Number(f.properties.verified),coord=f.geometry.coordinates;
   const type=bubbleType(verified,count);
   const existing=bubbles.get(id);
   const size=count>=100?"68px":count>=25?"58px":"48px";
   if(existing){existing.feature=f;existing.coord=coord;existing.marker.setLngLat(coord);existing.face.textContent=String(count);existing.face.className="atlas-bubble-face tatzo-cluster tatzo-cluster-"+type;existing.face.style.setProperty("--bubble-size",size);existing.button.setAttribute("aria-label",count+" locations — "+type);continue}
   const button=document.createElement("button");button.type="button";button.className="atlas-bubble-marker";button.setAttribute("aria-label",count+" locations — "+type);
   const face=document.createElement("span");face.className="atlas-bubble-face tatzo-cluster tatzo-cluster-"+type;face.textContent=String(count);face.style.setProperty("--bubble-size",size);button.append(face);
   const item={coord,feature:f,face,button,marker:new maplibregl.Marker({element:button,anchor:"center"}).setLngLat(coord).addTo(map)};
   button.addEventListener("click",e=>{e.stopPropagation();expandCluster(item.feature,face)});
   bubbles.set(id,item);animateArrival(face,coord,origins);
  }
 }
 function queueBubbles(){cancelAnimationFrame(bubbleFrame);bubbleFrame=requestAnimationFrame(refreshBubbles)}
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
   const wrapper=document.createElement("div");wrapper.className="atlas-avatar-marker";wrapper.append(el);
   avatars.set(idx,new maplibregl.Marker({element:wrapper,anchor:"center"}).setLngLat(coord).addTo(map));
   const origins=performance.now()<splitUntil?splitOrigins.slice():[];
   if(animateFrom&&performance.now()<animateFrom.until)origins.unshift(animateFrom.coord);
   animateArrival(el,coord,origins);
  }
 }
 function update(){if(stopped||!map?.getSource("atlas-artists"))return;const data=features(cards),signature=JSON.stringify(data);if(signature===lastData)return;lastData=signature;map.getSource("atlas-artists").setData(data);popup?.remove();clearAvatars();clearBubbles()}
 try{
  say("Atlas · loading native 3D");
  const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),12000);
  try{const response=await fetch(sourceURL,{signal:abort.signal,credentials:"omit",referrerPolicy:"no-referrer"});if(!response.ok)throw Error("Geography unavailable");base=await response.json()}finally{clearTimeout(timeout)}
  await Promise.all([load("link",rootURL+"maplibre-gl.css"),load("script",rootURL+"maplibre-gl.js")]);
  if(!window.maplibregl?.Map)throw Error("MapLibre unavailable");
  host=document.createElement("div");host.className="atlas-native-map";frame.append(host);
  const c=leafletMap.getCenter();
  const read=(key,lo,hi,fallback)=>{const raw=params.get(key),n=Number(raw);return raw!==null&&raw.trim()&&Number.isFinite(n)&&n>=lo&&n<=hi?n:fallback};
  const camera={center:[read("lng",-180,180,c.lng),read("lat",-85,85,c.lat)],zoom:read("z",2,19,Math.max(2,leafletMap.getZoom()-1)),pitch:quality==="low"?0:read("pitch",0,65,0),bearing:read("bearing",-180,180,0)};
  map=new maplibregl.Map({container:host,style:style(base,theme,quality),...camera,maxPitch:quality==="low"?0:65,maxZoom:19,minZoom:2,renderWorldCopies:false,attributionControl:false,canvasContextAttributes:{antialias:quality==="high"}});
  map.addControl(new maplibregl.AttributionControl({compact:false}),"bottom-right");
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
    if(settingsTitle)settingsTitle.textContent="Atlas";if(settingsCurrent)settingsCurrent.textContent=theme[0].toUpperCase()+theme.slice(1);
    const section=(label)=>{const row=document.createElement("div");row.className="atlas-settings-section";const caption=document.createElement("span");caption.className="atlas-settings-label";caption.textContent=label;row.append(caption);controls.append(row);return row};
    const cameraRow=section("View");const views=document.createElement("div");views.className="atlas-view-buttons";cameraRow.append(views);
    const button=(label,fn,container)=>{const b=document.createElement("button");b.type="button";b.textContent=label;b.addEventListener("click",fn);container.append(b);return b};
    const two=button("2D",()=>{map.easeTo({pitch:0,bearing:0});if(settings)settings.open=false},views);
    const three=button("3D",()=>{map.easeTo({pitch:55,bearing:-22,zoom:Math.max(15,map.getZoom())});if(settings)settings.open=false},views);
    three.disabled=quality==="low";three.title=quality==="low"?"Choose Medium or High for 3D":"";
    const syncView=()=>{const is3d=map.getPitch()>5;two.setAttribute("aria-pressed",String(!is3d));three.setAttribute("aria-pressed",String(is3d));if(settingsTitle)settingsTitle.textContent=is3d?"Atlas 3D":"Atlas 2D"};
    map.on("pitchend",syncView);syncView();
    for(const [key,values,current] of [["theme",themes,theme],["quality",["low","medium","high"],quality]]){
     const row=section(key==="theme"?"Theme":"Graphics");
     const select=document.createElement("select");select.setAttribute("aria-label","Atlas "+key);
     for(const value of values){const o=document.createElement("option");o.value=value;o.textContent=value[0].toUpperCase()+value.slice(1);o.selected=value===current;select.append(o)}
     select.addEventListener("change",()=>{const url=new URL(location.href),center=map.getCenter();url.searchParams.set(key,select.value);
      for(const [k,v] of [["lng",center.lng],["lat",center.lat],["z",map.getZoom()],["pitch",map.getPitch()],["bearing",map.getBearing()]])url.searchParams.set(k,String(Number(v.toFixed(4))));
      location.assign(url)});row.append(select);
    }
    const demo=section("Explore");button("Clermont-Ferrand",()=>{map.flyTo({center:[3.087,45.777],zoom:15.5,pitch:quality==="low"?0:55,bearing:quality==="low"?0:-22});if(settings)settings.open=false},demo);
    if(nativeControls){nativeControls.append(controls);nativeControls.hidden=false}else frame.append(controls);
    brand=document.createElement("div");brand.className="atlas-brand";brand.setAttribute("aria-label","Tatzo Atlas");
    const word=document.createElement("strong");word.textContent="Tatzo";const dot=document.createElement("span");dot.textContent=".";word.append(dot);const sub=document.createElement("small");sub.textContent="ATLAS";brand.append(word,sub);frame.append(brand);
    refreshBubbles();refreshAvatars();
   });
  });
  map.on("click",async e=>{
   if(stopped||!map.getLayer("atlas-points"))return;
   if(onPick(e.lngLat.lat,e.lngLat.lng)){
    popup?.remove();if(pick)pick.setLngLat(e.lngLat);else pick=new maplibregl.Marker({color:"#ee0c6f"}).setLngLat(e.lngLat).addTo(map);return
   }
   const hits=map.queryRenderedFeatures(e.point,{layers:["atlas-clusters","atlas-points"]});const f=hits[0];if(!f)return;
   if(f.layer.id==="atlas-clusters"){await expandCluster(f)}else openCard(Number(f.properties.idx),f.geometry.coordinates);
  });
  map.on("moveend",()=>{refreshBubbles();refreshAvatars()});map.on("zoomend",queueBubbles);map.on("sourcedata",e=>{if(e.sourceId==="atlas-artists"&&e.isSourceLoaded){queueBubbles();cancelAnimationFrame(raf);raf=requestAnimationFrame(refreshAvatars)}});
  observer=new MutationObserver(()=>{cancelAnimationFrame(filterFrame);filterFrame=requestAnimationFrame(update)});
  cards.forEach(card=>observer.observe(card,{attributes:true,attributeFilter:["class"]}));
  if(window.ResizeObserver){resizeObserver=new ResizeObserver(()=>{if(!stopped)map.resize()});resizeObserver.observe(host)}
 }catch(e){fallback(e.message)}
}
window.TatzoAtlas=Object.freeze({activate,style,features});
})();