import * as T from 'three'

const mats = new Map<string,T.MeshStandardMaterial>()
function material(color: string) {
  if (!mats.has(color)) mats.set(color,new T.MeshStandardMaterial({ color,roughness:.83 }))
  return mats.get(color)!
}
function mesh(parent: T.Object3D, geo: T.BufferGeometry, color: string, x:number,y:number,z:number) {
  const m = new T.Mesh(geo,material(color))
  m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; parent.add(m); return m
}
const cube = new T.BoxGeometry(1,1,1)
function box(p:T.Object3D,c:string,x:number,y:number,z:number,w:number,h:number,d:number) {
  const m=mesh(p,cube,c,x,y,z); m.scale.set(w,h,d); return m
}
function cylinder(p:T.Object3D,c:string,x:number,y:number,z:number,rt:number,rb:number,h:number) {
  return mesh(p,new T.CylinderGeometry(rt,rb,h,18),c,x,y,z)
}
function group(p:T.Object3D,x:number,z:number,angle=0) {
  const g=new T.Group(); g.position.set(x,0,z); g.rotation.y=angle; p.add(g); return g
}
const cream='#f1e9d5', wood='#ae7852', darkWood='#75503b', leaf='#57774e'
function legs(p:T.Object3D,w:number,d:number,h:number) {
  for (const x of [-w/2,w/2]) for (const z of [-d/2,d/2]) box(p,darkWood,x,h/2,z,.09,h,.09)
}
function plant(p:T.Object3D,x:number,z:number,size:number,y=0) {
  const g=group(p,x,z); g.position.y=y; g.scale.setScalar(size)
  cylinder(g,'#bd8463',0,.24,0,.29,.22,.47)
  cylinder(g,'#594c3b',0,.482,0,.24,.24,.03)
  for(let i=0;i<9;i++) {
    const a=i*2.4, radius=i%3===0?.16:.28
    const l=mesh(g,new T.SphereGeometry(1,8,6),i%2?leaf:'#789464',Math.cos(a)*radius,.74+(i%3)*.09,Math.sin(a)*radius)
    l.scale.set(.13,.38,.085); l.rotation.z=-Math.cos(a)*.64; l.rotation.x=Math.sin(a)*.64
  }
}
function rug(p:T.Object3D,x:number,z:number,w:number,d:number,base:string,trim:string) {
  box(p,base,x,.028,z,w,.035,d)
  for(const sign of [-1,1]) {
    box(p,trim,x,.051,z+sign*(d/2-.12),w-.18,.007,.055)
    box(p,trim,x+sign*(w/2-.12),.051,z,.055,.007,d-.18)
  }
}
function windowUnit(p:T.Object3D,x:number,z:number,w:number) {
  box(p,'#a2bdba',x,.80,z,w,.77,.11)
  for(const dx of [-w/2,0,w/2]) box(p,cream,x+dx,.82,z,.08,.85,.15)
  for(const y of [.39,1.23]) box(p,cream,x,y,z,w+.15,.075,.2)
}
function diningChair(p:T.Object3D,x:number,z:number,angle:number) {
  const g=group(p,x,z,angle); legs(g,.48,.49,.52)
  box(g,'#678473',0,.54,0,.67,.14,.64)
  box(g,'#678473',0,.83,-.28,.66,.54,.10)
}
function living(p:T.Object3D) {
  rug(p,-3.87,-3.27,4.7,2.96,'#a8b2a0','#d6d6bc')
  const sofa=group(p,-1.55,-3.52,Math.PI/2)
  box(sofa,darkWood,0,.23,0,2.36,.23,.86)
  box(sofa,'#ce8256',0,.44,0,2.65,.37,1.03)
  box(sofa,'#bb724d',0,.81,.42,2.64,.63,.20)
  for(const x of [-1.24,1.24]) box(sofa,'#c47a51',x,.70,-.02,.19,.41,1.05)
  for(const x of [-.58,.58]) box(sofa,'#dfa27a',x,.66,-.05,1.1,.2,.75)
  const pillow=box(sofa,'#f4ddaf',.72,.88,.16,.51,.47,.18); pillow.rotation.x=.15
  box(sofa,'#758472',-.68,.89,.16,.52,.47,.18)
  const tv=group(p,-6.49,-3.15,Math.PI/2)
  box(tv,wood,0,.38,0,2.68,.6,.64)
  box(tv,'#e0ad79',0,.705,0,2.74,.085,.69)
  box(tv,'#39464a',0,.81,0,.52,.12,.21)
  box(tv,'#26363b',0,1.29,0,1.98,.97,.13)
  box(tv,'#42585b',0,1.29,.075,1.86,.84,.012)
  plant(p,-.66,-4.88,.85)
  windowUnit(p,-4.35,-5.28,2.25)
}
function kitchen(p:T.Object3D) {
  const table=group(p,1.74,-3.78); legs(table,1.14,1.32,.75)
  box(table,'#ce9d71',0,.81,0,1.56,.13,1.72)
  cylinder(table,'#eee1b7',0,.91,0,.27,.18,.095)
  for(const z of [-1.18,1.18]) diningChair(p,1.74,-3.78+z,z<0?0:Math.PI)
  for(const z of [-4.49,-3.51,-2.53]) {
    box(p,'#91a391',6.43,.43,z,.94,.82,.96)
    box(p,'#e5dcc4',6.42,.88,z,1.05,.12,.98)
    box(p,'#536b5a',5.944,.63,z,.02,.045,.30)
  }
  box(p,'#677c7c',6.4,.96,-3.51,.62,.035,.63)
  box(p,'#98aca9',6.4,.982,-3.51,.43,.02,.47)
  box(p,'#414948',6.42,.963,-4.48,.72,.04,.72)
  for(const z of [-4.65,-4.31]) for(const x of [6.24,6.57]) cylinder(p,'#697473',x,.993,z,.105,.105,.018)
  plant(p,6.43,-2.48,.42,.95)
  box(p,'#c8d0c4',4.36,.79,-4.89,1.06,1.55,.70)
  box(p,'#79897a',4.36,.69,-4.52,1.02,.025,.015)
}
function bedroom(p:T.Object3D) {
  rug(p,-5.42,3.44,2.82,3.25,'#c5ab8c','#eee0c4')
  box(p,wood,-5.57,.29,3.62,1.89,.52,2.98)
  box(p,cream,-5.57,.60,3.6,1.84,.25,2.86)
  box(p,'#aa7656',-5.57,.73,5.03,1.98,1.22,.16)
  box(p,'#9cae96',-5.57,.78,3.23,1.88,.16,1.98)
  box(p,'#738f7a',-5.57,.87,2.54,1.9,.07,.56)
  for(const x of [-6.02,-5.12]) box(p,'#fcf0d8',x,.83,4.60,.77,.21,.48)
  box(p,wood,-6.62,.39,4.55,.51,.67,.58)
  cylinder(p,'#b59856',-6.62,.83,4.55,.06,.10,.30)
  cylinder(p,cream,-6.62,1.02,4.55,.13,.23,.28)
  windowUnit(p,-2.17,5.25,2.15)
  plant(p,-.68,4.62,.9)
}
function study(p:T.Object3D) {
  rug(p,4.65,3.35,3.4,2.7,'#b8b5a8','#e2d8c4')
  const desk=group(p,6.4,3.42,Math.PI/2)
  legs(desk,2.22,.68,.85)
  box(desk,wood,0,.89,0,2.55,.12,.95)
  box(desk,'#354948',0,1.01,-.12,.43,.12,.25)
  box(desk,'#344348',0,1.31,-.21,1.06,.61,.07)
  box(desk,'#8ca9a9',0,1.31,-.255,.94,.49,.018)
  box(desk,'#647270',0,.97,.18,.68,.045,.22)
  plant(desk,.94,.06,.37,.95)
  const shelf=group(p,1.63,4.92)
  box(shelf,darkWood,0,.71,.17,1.98,1.4,.12)
  for(const x of [-.96,.96]) box(shelf,wood,x,.70,0,.09,1.4,.55)
  for(const y of [.13,.77,1.39]) box(shelf,wood,0,y,0,1.98,.08,.55)
  const colors=['#738c7e','#b98763','#ead7ae','#667a85','#a77866']
  for(let i=0;i<9;i++) {
    const height=.32+(i%3)*.065
    box(shelf,colors[i%5],-.79+i*.18,.80+height/2,-.02,.13,height,.32)
  }
  for(let i=0;i<4;i++) box(shelf,colors[4-i],-.40,.22+i*.10,-.02,.66,.09,.36)
  plant(p,.68,2.8,.72)
}
export function buildHouse(p:T.Object3D) {
  box(p,'#b09e85',0,-.23,0,14.32,.43,10.93)
  box(p,'#d7c3a4',0,-.055,0,14.15,.10,10.80)
  const shades=['#d9c4a2','#e1cdac','#d5bf9d','#dfc9a8','#ddc7a6']
  for(let i=0;i<27;i++) {
    const z=-5.2+i*.4
    let x=-7, n=0
    while(x<6.999) {
      const w=Math.min(7-x,n===0?1+(i%4)*.54:3.2)
      box(p,shades[(i*3+n*2)%5],x+w/2,.003,z,w-.015,.018,.389); x+=w; n++
    }
  }
  box(p,'#d7cbb4',0,.018,0,14,.03,1.39)
  const wall=(x:number,z:number,w:number,d:number,h:number) => {
    box(p,'#e6e0ce',x,h/2+.02,z,w,h,d)
    box(p,'#fcf5e2',x,h+.035,z,w+.035,.065,d+.035)
    box(p,'#b7ab93',x,.095,z,w+.025,.14,d+.025)
  }
  // Low outer walls leave the dollhouse interior visible from the fixed camera.
  wall(0,-5.38,14.20,.15,1.03); wall(0,5.38,14.20,.15,.32)
  wall(-7.05,0,.15,10.75,.68); wall(7.05,0,.15,10.75,.77)
  for (const z of [-3.07,3.07]) wall(0,z,.16,4.6,.72)
  for (const z of [-.76,.76]) {
    wall(-5.70,z,2.7,.14,.45); wall(0,z,5.3,.14,.45); wall(5.70,z,2.7,.14,.45)
  }
  living(p); kitchen(p); bedroom(p); study(p)
}
export function buildChair() {
  const g=new T.Group()
  for(const x of [-.35,.35]) {
    const wheel=cylinder(g,'#233636',x,.33,-.09,.32,.32,.105); wheel.rotation.z=Math.PI/2
    const hub=cylinder(g,'#9baaaa',x*1.1,.33,-.09,.22,.22,.03); hub.rotation.z=Math.PI/2
    const cap=cylinder(g,'#4a6460',x*1.16,.33,-.09,.09,.09,.022); cap.rotation.z=Math.PI/2
    const caster=cylinder(g,'#2a3a39',x*.79,.13,.36,.13,.13,.085); caster.rotation.z=Math.PI/2
    box(g,'#728885',x*.85,.42,.09,.055,.13,.61)
    box(g,'#203f3b',x,.70,-.01,.085,.09,.46)
    box(g,'#8d9b99',x,.60,0,.04,.19,.05)
  }
  box(g,'#2c5850',0,.51,0,.6,.13,.54)
  box(g,'#306759',0,.78,-.27,.61,.58,.11)
  box(g,'#81aa93',0,1.06,-.27,.63,.09,.12)
  box(g,'#586d6b',0,.23,.43,.53,.06,.22)
  return g
}
