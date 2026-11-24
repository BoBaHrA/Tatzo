/* Run: node --test scripts/atlas_living.test.cjs */
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const w={};
const ctx=vm.createContext({window:w,document:{documentElement:{lang:"fr"},createElement:()=>({getContext:()=>({beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},getImageData(){return {width:64,height:64,data:new Uint8Array(64*64*4)}}})})}});
for(const name of ["tatzo-vector-basemap.js","tatzo-living-cartography.js","tatzo-atlas.js"]){
 vm.runInContext(fs.readFileSync(path.join(__dirname,"../static/js",name),"utf8"),ctx,{filename:name});
}
const base={sources:{osm:{type:"vector",url:"https://example.invalid/tiles.json"}},glyphs:"https://example.invalid/{fontstack}/{range}.pbf",layers:[{type:"symbol",layout:{"text-font":["Noto Sans Regular"]}}]};
test("every theme, quality, dimension combination has unique layers and correct extrusion visibility",()=>{
 for(const theme of ["midnight","porcelain","ink"])for(const quality of ["low","medium","high"])for(const dimension of [false,true]){
  const style=w.TatzoAtlas.style(base,theme,quality,dimension);
  const ids=style.layers.map(l=>l.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(style.layers.find(l=>l.id==="tatzo-building-3d").layout.visibility,dimension?"visible":"none");
  assert.equal(ids.includes("living-arterial-light"),theme==="midnight"&&quality==="high");
  assert.ok(style.sources.osm.attribution.includes("OpenStreetMap"));
 }
});
test("Midnight replaces roads and separates tunnels, bridges, and surface roads",()=>{
 const style=w.TatzoAtlas.style(base,"midnight","high",true),ids=style.layers.map(l=>l.id);
 assert.ok(!ids.includes("tatzo-main-roads"));
 for(const kind of ["local","avenue","arterial"])for(const type of ["road","tunnel","bridge"])assert.ok(ids.includes("living-"+kind+"-"+type));
 assert.ok(ids.indexOf("living-arterial-bridge")>ids.indexOf("living-arterial-road"));
});
test("texture installation uses real vector polygon layers and skips low quality",()=>{
 for(const quality of ["low","medium","high"]){
  const images=new Set(),layers=[];
  const map={getStyle:()=>({sources:base.sources}),hasImage:id=>images.has(id),addImage:(id,img)=>{assert.equal(img.width,64);images.add(id)},addLayer:(layer,before)=>layers.push({layer,before})};
  w.TatzoLivingCartography.install(map,quality);
  assert.equal(layers.length,quality==="low"?0:3);
  for(const {layer,before} of layers){assert.ok(["water","park","landcover"].includes(layer["source-layer"]));assert.ok(images.has(layer.paint["fill-pattern"]));assert.ok(before);}
 }
});
test("filtering excludes hidden or invalid locations, preserves verification status",()=>{
 const card=(lat,lng,source,hidden=false)=>({dataset:{lat,lng,source},classList:{contains:()=>hidden}});
 const data=w.TatzoAtlas.features([card("0","0","verified"),card("45.7","4.8","unclaimed"),card("","2","verified"),card("45","3","verified",true)]);
 assert.equal(data.features.length,2);assert.equal(data.features[0].properties.verified,1);assert.equal(data.features[1].properties.verified,0);
});
