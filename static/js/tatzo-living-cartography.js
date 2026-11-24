/* Tatzo Living Cartography — original vector styling and procedural textures.
 * No raster tiles, demo coordinates or fabricated discovery activity.
 */
(() => {
"use strict";
const z=(...s)=>["interpolate",["linear"],["zoom"],...s];
const road=(...c)=>["in",["get","class"],["literal",c]];
const bridge=["==",["get","brunnel"],"bridge"];
const tunnel=["==",["get","brunnel"],"tunnel"];
const ground=["!",["in",["get","brunnel"],["literal",["bridge","tunnel"]]]];
const all=(...a)=>["all",...a];
const classes={local:road("minor","service"),avenue:road("tertiary","secondary"),arterial:road("primary","trunk","motorway")};
function apply(s,quality,dimension){
 const source=Object.keys(s.sources)[0],layers=s.layers;
 const get=id=>layers.find(l=>l.id===id);
 const before=(id,layer)=>layers.splice(layers.findIndex(l=>l.id===id),0,layer);
 const line=(id,filter,color,width,more={},minzoom=5)=>({id,type:"line",source,"source-layer":"transportation",minzoom,filter,layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":color,"line-width":width,...more}});
 const paint=(id,p)=>Object.assign(get(id).paint,p);
 paint("tatzo-background",{"background-color":"#0b1720"});
 paint("atlas-neighbourhoods",{"fill-color":["match",["get","class"],"industrial","#192b34","commercial","#20333c","retail","#25343d","#13232e"],"fill-opacity":.88});
 paint("tatzo-nature",{"fill-color":["match",["get","class"],"wood","#1e3937","grass","#263f3b","farmland","#263532","#203732"],"fill-opacity":.85});
 paint("tatzo-parks",{"fill-color":"#203d38","fill-outline-color":"#31534a"});
 paint("tatzo-water",{"fill-color":"#10515e"});
 paint("tatzo-waterways",{"line-color":"#26747b"});
 paint("atlas-shoreline",{"line-color":"#39858b","line-width":z(9,.25,15,.7,18,1.1),"line-opacity":.65});
 before("atlas-shoreline",{id:"living-water-bank",type:"line",source,"source-layer":"water",minzoom:10,paint:{"line-color":"#092a39","line-width":z(10,.7,15,3,18,6),"line-opacity":.75}});
 paint("tatzo-buildings",{"fill-color":["match",["get","class"],"industrial","#354650","commercial","#334b58","retail","#384d58","#243c49"],"fill-outline-color":"#48606a","fill-opacity":z(13.5,.2,15,.9,17,1)});
 // Replace inherited roads rather than stack a second copy. Geometry stays in the vector source.
 const remove=new Set(["tatzo-road-casing","tatzo-roads","tatzo-main-casing","tatzo-main-roads","atlas-avenues"]);
 for(let i=layers.length-1;i>=0;i--)if(remove.has(layers[i].id))layers.splice(i,1);
 const anchor="tatzo-building-3d";
 const widths={local:z(11,.35,14,1.6,18,9),avenue:z(8,.5,14,2.8,18,13),arterial:z(5,.45,14,4.3,18,17)};
 const casings={local:z(11,.65,14,2.8,18,12),avenue:z(8,.8,14,4.5,18,17),arterial:z(5,.8,14,6.8,18,23)};
 const colors={local:"#344b58",avenue:"#667577",arterial:"#af9070"};
 for(const k of Object.keys(classes)){
  const min=k==="local"?11:k==="avenue"?8:5;
  before(anchor,line("living-"+k+"-tunnel",all(classes[k],tunnel),colors[k],widths[k],{"line-opacity":.32,"line-dasharray":[2,2]},Math.max(min,12)));
 }
 for(const k of Object.keys(classes)){
  const min=k==="local"?11:k==="avenue"?8:5;
  before(anchor,line("living-"+k+"-edge",all(classes[k],ground),"#091720",casings[k],{},min));
  before(anchor,line("living-"+k+"-road",all(classes[k],ground),colors[k],widths[k],{},min));
 }
 for(const k of Object.keys(classes)){
  before(anchor,line("living-"+k+"-bridge-edge",all(classes[k],bridge),"#0a2029",casings[k],{},10));
  before(anchor,line("living-"+k+"-bridge",all(classes[k],bridge),colors[k],widths[k],{},10));
 }
 if(quality==="high")before(anchor,line("living-arterial-light",all(classes.arterial,["!",tunnel]),"#e8c19a",z(13,.35,16,.7,19,1.1),{"line-opacity":.45},13));
 const building=get("tatzo-building-3d");
 building.layout.visibility=dimension?"visible":"none";
 building.minzoom=quality==="low"?15.5:14;
 const h=["max",3,["to-number",["get","render_height"],["get","height"],6]];
 building.paint["fill-extrusion-color"]=["interpolate",["linear"],h,3,"#263f4c",20,"#36505d",70,"#4d6873",140,"#607984"];
 building.paint["fill-extrusion-vertical-gradient"]=true;
 s.light={anchor:"map",color:"#f4e8d5",intensity:.48,position:[1.5,220,35]};
 paint("tatzo-street-labels",{"text-color":"#a4b6be","text-halo-color":"#0b1720","text-halo-width":1});
 get("tatzo-street-labels").minzoom=14;
 get("tatzo-street-labels").layout["symbol-spacing"]=450;
 get("tatzo-street-labels").layout["text-size"]=z(14,10,18,12);
 return s;
}
function texture(kind){
 const size=64,c=document.createElement("canvas");c.width=c.height=size;const ctx=c.getContext("2d");
 if(!ctx)throw Error("Texture canvas unavailable");
 if(kind==="water"){
  ctx.strokeStyle="rgba(124,210,211,0.17)";ctx.lineWidth=1;
  for(let y=8;y<64;y+=16){ctx.beginPath();ctx.moveTo(0,y);for(let x=0;x<=64;x+=2)ctx.lineTo(x,y+Math.sin(x/64*Math.PI*2)*1.8);ctx.stroke()}
 }else{
  ctx.fillStyle="rgba(140,184,152,0.22)";
  for(let i=0;i<20;i++){const x=(i*23+7)%64,y=(i*37+11)%64;ctx.beginPath();ctx.arc(x,y,i%3===0?1.1:.65,0,Math.PI*2);ctx.fill()}
 }
 return ctx.getImageData(0,0,size,size);
}
function install(map,quality){
 if(quality==="low")return;
 const source=Object.keys(map.getStyle().sources)[0];
 const patterns=[["water","water","atlas-shoreline"],["green","park","tatzo-water"],["green","landcover","tatzo-parks"]];
 for(const [kind,layer,before] of patterns){
  const image="tatzo-living-"+kind,id=image+"-"+layer;
  if(!map.hasImage(image))map.addImage(image,texture(kind),{pixelRatio:2});
  const filter=layer==="landcover"?["in",["get","class"],["literal",["wood","grass"]]]:null;
  map.addLayer({id,type:"fill",source,"source-layer":layer,minzoom:quality==="high"?11:13,...(filter?{filter}:{}),paint:{"fill-pattern":image,"fill-opacity":quality==="high"?.85:.48}},before);
 }
}
window.TatzoLivingCartography=Object.freeze({apply,install,texture});
})();