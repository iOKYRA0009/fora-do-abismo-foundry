import test from "node:test";
import assert from "node:assert/strict";
import { executeJarvisConsoleAction, openJarvisConsole } from "../scripts/ui/jarvis-console.js";
import { captureSceneSnapshot, compareSceneSnapshot } from "../scripts/scenes/production-snapshot.js";
import { listAtmosphereCues, previewAtmosphereCue, applyAtmosphereCue, restoreAtmosphereCue } from "../scripts/scenes/atmosphere-director.js";

function setup() {
 const scene={id:"scene-ui",documentName:"Scene",name:"Grande Banquete",width:640,height:640,
   environment:{darknessLevel:.2},backgroundColor:"#121212",grid:{size:64},
   walls:{contents:[]},lights:{contents:[]},tiles:{contents:[]},sounds:{contents:[]},
   async update(data){this.environment.darknessLevel=data["environment.darknessLevel"];this.backgroundColor=data.backgroundColor;}};
 globalThis.canvas={scene};
 globalThis.game={user:{id:"gm",name:"GM",isGM:true,role:4},
   users:{contents:[],activeGM:{id:"gm"}},actors:{contents:[],get:()=>null},
   items:{contents:[]},scenes:{contents:[scene]},packs:{contents:[]},
   documentTypes:{Item:["feat"]},
   modules:new Map([["fora-do-abismo-foundry",{api:{
     version:"1.4.0",scenes:{
       director:{list:listAtmosphereCues,preview:(key,sc)=>previewAtmosphereCue(sc,key),
         apply:(key,sc)=>applyAtmosphereCue(sc,key),restore:restoreAtmosphereCue},
       production:{capture:captureSceneSnapshot,compare:compareSceneSnapshot},
       framework:{templates:()=>[],skins:()=>[],presets:()=>[]},
       lightingPresets:()=>[]
     },
     appearance:{status:()=>({active:false})},
     transformation:{status:()=>({active:false})},
     macros:{list:()=>[],commands:()=>[],favorites:()=>[]}
   }}]])};
 globalThis.foundry={applications:{api:{DialogV2:class {
   constructor(config){this.config=config;}render(){return Promise.resolve(this);}
   static confirm(){return Promise.resolve(true);}
 }}}};
 globalThis.document={createElement:()=>({innerHTML:""})};
 return scene;
}
function rootInput(fields={}) {
 const elements=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,typeof v==="object"?v:{value:v}]));
 const heading={textContent:""},content={textContent:"",closest:()=>({removeAttribute(){}})};
 const root={dataset:{},querySelector(selector){
   const field=/^\[name="([^"]+)"\]$/.exec(selector)?.[1];if(field)return elements[field]??null;
   return ({".jarvis-console-result-title":heading,".jarvis-console-result-content":content})[selector]??null;
 }};
 return {root,elements,heading,content};
}
test("Central displays three new controls with no external module required",()=>{
 setup();const html=openJarvisConsole().config.content.innerHTML;
 assert.match(html,/production-capture/);
 assert.match(html,/production-compare/);
 assert.match(html,/director-preview/);
 assert.match(html,/director-restore/);
 assert.match(html,/Liturgia velada/);
});
test("GM previews and applies atmosphere through Central, then restores",async()=>{
 const scene=setup();
 const {root,content}=rootInput({"director-cue":"hunger"});
 await executeJarvisConsoleAction("director-preview",root,{});
 assert.match(content.textContent,/0.82/);
 assert.equal(scene.environment.darknessLevel,.2);
 await executeJarvisConsoleAction("director-apply",root,{});
 assert.equal(scene.environment.darknessLevel,.82);
 await executeJarvisConsoleAction("director-restore",root,{});
 assert.equal(scene.environment.darknessLevel,.2);
});
test("GM compares saved snapshot in Central without touching the Scene",async()=>{
 const scene=setup(),baseline=captureSceneSnapshot(scene);
 scene.tiles.contents.push({id:"tile-new",x:0,y:0,width:640,height:640,texture:{src:"art.webp"}});
 const {root,content}=rootInput({"production-snapshot-file":{
   files:[{size:JSON.stringify(baseline).length,text:async()=>JSON.stringify(baseline)}]
 }});
 await executeJarvisConsoleAction("production-compare",root,{});
 assert.match(content.textContent,/tile-new/);
 assert.equal(scene.tiles.contents.length,1);
});

test("Executor HD preview exposes grid, quality inspector and three focus controls",async()=>{
  setup();
  const sourceScene={schemaVersion:"1.0",scene:{name:"Grande Banquete",columns:32,rows:60,grid:{size:128},
    imagePlacement:{width:4096,height:7680},
    imageTiles:Array.from({length:3},(_,i)=>({src:"asset://s"+i,
      rect:[0,i*2560,4096,2560],name:["Exterior","Interior","Porão"][i],
      pixelWidth:4096,pixelHeight:2560}))},
    walls:[{a:[10,10],b:[20,10]}],lights:[{x:50,y:80,dim:25,bright:10}]};
  const plan={kind:"package",files:[],data:{scenes:[sourceScene],assets:[]},review:{
    name:"Grande Banquete",actors:[],scenes:[{
      name:"Grande Banquete",walls:1,lights:1,sounds:0,tokens:0,
      pixels:{width:4096,height:7680,gridSize:128},positions:{
        walls:[{a:[10,10],b:[20,10],type:"wall"}],
        lights:[{x:50,y:80}],tokens:[],sounds:[]},
      imageTiles:sourceScene.scene.imageTiles,
      calibration:{source:{width:4096,height:7680}}
    }],images:[],itemAdditions:[]}};
  game.modules.get("fora-do-abismo-foundry").api.executor={preview:()=>plan};
  const output={innerHTML:"",querySelectorAll:()=>[]};
  const heading={textContent:""},content={textContent:"",closest:()=>({removeAttribute(){}})};
  const fields={"executor-source":{value:'{"schemaVersion":"jarvis-executor-1"}'},
    "executor-mode":{value:"package"}};
  const root={dataset:{},querySelector(selector){
    const m=/^\\[name="([^"]+)"\\]$/.exec(selector);if(m)return fields[m[1]]??null;
    return ({"[data-jarvis-executor-preview]":output,
      ".jarvis-console-result-title":heading,
      ".jarvis-console-result-content":content})[selector]??null;
  }};
  await executeJarvisConsoleAction("executor-preview",root,{});
  assert.match(output.innerHTML,/Mostrar grid/);
  assert.match(output.innerHTML,/Inspeção HD/);
  assert.match(output.innerHTML,/data-jarvis-map-focus="0"/);
  assert.match(output.innerHTML,/data-jarvis-map-focus="1"/);
  assert.match(output.innerHTML,/data-jarvis-map-focus="2"/);
  assert.match(output.innerHTML,/Porão/);
});
