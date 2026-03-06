import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

declare global {
  interface Window {
    THREE?: any;
  }
}

type RawProfile = {
  id: string;
  lat: number | null;
  lon: number | null;
  is_online?: boolean | null;
  last_seen_at?: string | null;
};

type SafeNode = {
  id: string;
  lat: number;
  lon: number;
  active: boolean;
  isCurrentUser: boolean;
};

function clamp(value:number,min:number,max:number){
  return Math.max(min,Math.min(max,value));
}

function hashString(input:string){
  let hash=0;
  for(let i=0;i<input.length;i++){
    hash=(hash<<5)-hash+input.charCodeAt(i);
    hash|=0;
  }
  return Math.abs(hash);
}

function seededOffset(seed:string,scale:number){
  const hash=hashString(seed);
  const normalized=(hash%1000)/1000;
  return(normalized-.5)*2*scale;
}

function obfuscateNodeLocation(lat:number,lon:number,seed:string){
  const latBucket=2.5;
  const lonBucket=2.5;

  const roundedLat=Math.round(lat/latBucket)*latBucket;
  const roundedLon=Math.round(lon/lonBucket)*lonBucket;

  const safeLat=clamp(roundedLat+seededOffset(seed+"lat",.8),-72,72);
  const safeLon=roundedLon+seededOffset(seed+"lon",.8);

  return{lat:safeLat,lon:safeLon};
}

function isActiveNow(row:RawProfile){
  if(row.is_online===true)return true;
  if(!row.last_seen_at)return false;

  const lastSeen=new Date(row.last_seen_at).getTime();
  if(Number.isNaN(lastSeen))return false;

  return Date.now()-lastSeen<=5*60*1000;
}

function loadScript(src:string){
  return new Promise<void>((resolve,reject)=>{
    const script=document.createElement("script");
    script.src=src;
    script.async=true;
    script.onload=()=>resolve();
    script.onerror=()=>reject();
    document.head.appendChild(script);
  });
}

function latLonToVector3(THREE:any,lat:number,lon:number,radius:number){
  const phi=(90-lat)*(Math.PI/180);
  const theta=(lon+180)*(Math.PI/180);

  const x=-(radius*Math.sin(phi)*Math.cos(theta));
  const z=(radius*Math.sin(phi)*Math.sin(theta));
  const y=(radius*Math.cos(phi));

  return new THREE.Vector3(x,y,z);
}

export default function Globe(){

const mountRef=useRef<HTMLDivElement|null>(null);

const[nodes,setNodes]=useState<SafeNode[]>([]);
const[focusNode,setFocusNode]=useState<{lat:number;lon:number}|null>(null);
const[loadingNodes,setLoadingNodes]=useState(true);

useEffect(()=>{

let alive=true;

async function loadNodes(){

setLoadingNodes(true);

try{

const{data:{session}}=await supabase.auth.getSession();
const currentUserId=session?.user?.id??null;

const{data,error}=await supabase
.from("profiles")
.select("id,lat,lon,is_online,last_seen_at")
.not("lat","is",null)
.not("lon","is",null)
.limit(2500);

if(error)throw error;

const rows=(data as RawProfile[])??[];

const safeNodes=rows.map(row=>{
const safe=obfuscateNodeLocation(row.lat!,row.lon!,row.id);
return{
id:row.id,
lat:safe.lat,
lon:safe.lon,
active:isActiveNow(row),
isCurrentUser:row.id===currentUserId
};
});

const currentNode=safeNodes.find(n=>n.isCurrentUser);

setNodes(safeNodes);

if(currentNode){
setFocusNode({lat:currentNode.lat,lon:currentNode.lon});
}

}catch(err){
console.error(err);
}

finally{
if(alive)setLoadingNodes(false);
}

}

loadNodes();

return()=>{alive=false};

},[]);

useEffect(()=>{

let cancelled=false;
let renderer:any;
let scene:any;
let camera:any;
let controls:any;

async function buildGlobe(){

await loadScript("https://cdn.jsdelivr.net/npm/three@0.124.0/build/three.min.js");
await loadScript("https://cdn.jsdelivr.net/npm/three@0.124.0/examples/js/controls/OrbitControls.js");

if(cancelled||!mountRef.current||!window.THREE)return;

const THREE=window.THREE;
const container=mountRef.current;

scene=new THREE.Scene();

camera=new THREE.PerspectiveCamera(
42,
container.clientWidth/container.clientHeight,
0.1,
1000
);

camera.position.set(0,0,11);

renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(container.clientWidth,container.clientHeight);
container.appendChild(renderer.domElement);

controls=new THREE.OrbitControls(camera,renderer.domElement);
controls.enablePan=false;
controls.enableDamping=true;
controls.autoRotate=false;

const light=new THREE.AmbientLight(0xffffff,1);
scene.add(light);

const radius=3.4;

const textureLoader=new THREE.TextureLoader();

/* Earth texture */
const earthTexture=textureLoader.load(
"https://threejsfundamentals.org/threejs/resources/images/earth-day.jpg"
);

const globe=new THREE.Mesh(
new THREE.SphereGeometry(radius,64,64),
new THREE.MeshPhongMaterial({
map:earthTexture,
shininess:5
})
);

scene.add(globe);

/* nodes */

const nodeGroup=new THREE.Group();
scene.add(nodeGroup);

const nodeGeometry=new THREE.SphereGeometry(.05,12,12);

nodes.forEach(node=>{

const pos=latLonToVector3(THREE,node.lat,node.lon,radius*1.02);

const mat=new THREE.MeshBasicMaterial({
color:node.isCurrentUser
?0xffffff
:node.active
?0x8f6cff
:0x57d9ff
});

const marker=new THREE.Mesh(nodeGeometry,mat);
marker.position.copy(pos);

nodeGroup.add(marker);

});

/* center camera on current user */

if(focusNode){

const v=latLonToVector3(THREE,focusNode.lat,focusNode.lon,radius);

camera.lookAt(v);

}

/* star background */

const starGeometry=new THREE.BufferGeometry();
const starVertices=[];

for(let i=0;i<400;i++){

const r=60;

starVertices.push(
(Math.random()-.5)*r,
(Math.random()-.5)*r,
(Math.random()-.5)*r
);

}

starGeometry.setAttribute(
"position",
new THREE.Float32BufferAttribute(starVertices,3)
);

const starField=new THREE.Points(
starGeometry,
new THREE.PointsMaterial({color:0x77ddff,size:.05})
);

scene.add(starField);

function animate(){

if(cancelled)return;

requestAnimationFrame(animate);

controls.update();
renderer.render(scene,camera);

}

animate();

}

buildGlobe();

return()=>{cancelled=true};

},[nodes,focusNode]);

const cards=useMemo(()=>{

const activeNodes=nodes.length;
const liveSessions=nodes.filter(n=>n.active).length;

return[
{
label:"Active nodes",
value:loadingNodes?"…":activeNodes.toLocaleString(),
note:"Observers currently online"
},
{
label:"Live sessions",
value:loadingNodes?"…":liveSessions.toLocaleString(),
note:"Members currently active"
},
{
label:"Best window",
value:"21:00–02:00",
note:"Peak collection band"
},
{
label:"Verification queue",
value:"126",
note:"Items awaiting review"
}
];

},[nodes,loadingNodes]);

return(

<div className="pageStack">

<section className="heroPanel">
<div className="eyebrow">NETWORK VIEW</div>
<h1 className="pageTitle">Make the global array legible.</h1>
<p className="pageText">
Observer density and active collection nodes visualized across the planet.
</p>
</section>

<section className="panel">

<div style={{height:"440px"}} ref={mountRef}/>

</section>

<div className="gridFour">

{cards.map(card=>(
<section key={card.label} className="panel smallPanel">
<div className="sectionKicker">{card.label}</div>
<div className="bigStat">{card.value}</div>
<div className="sectionText">{card.note}</div>
</section>
))}

</div>

</div>

);

}
