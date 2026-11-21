import * as T from 'three'
import type {State} from './types'

/** A fixed, cutaway bedroom. Draws only when the simulated state changes. */
export class HouseScene {
  scene=new T.Scene()
  camera=new T.OrthographicCamera(-6,6,5,-5,.1,100)
  renderer:T.WebGLRenderer|null=null
  private host:HTMLElement
  private signature=''
  private sunlight=new T.DirectionalLight(0xffefd1,1.8)
  private roomLight=new T.PointLight(0xffc47a,35,7)
  private bulb:T.Mesh
  private blinds=new T.Group()
  private tv:T.Mesh
  private tvLed:T.Mesh
  private tvGlow=new T.PointLight(0x6ac4ee,0,5)
  private airflow=new T.Group()
  private acDisplay:T.Mesh
  private tvTexture:T.CanvasTexture
  private acCanvas=document.createElement('canvas')
  private acTexture:T.CanvasTexture
  constructor(host:HTMLElement){
    this.host=host
    const mat=(color:number|string)=>new T.MeshStandardMaterial({color,roughness:.76})
    const box=(color:number|string,x:number,y:number,z:number,w:number,h:number,d:number,parent:T.Object3D=this.scene)=>{
      const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),mat(color));mesh.position.set(x,y,z)
      mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh
    }
    const cylinder=(color:number|string,x:number,y:number,z:number,r:number,h:number)=>{
      const mesh=new T.Mesh(new T.CylinderGeometry(r,r,h,32),mat(color));mesh.position.set(x,y,z);mesh.castShadow=true;this.scene.add(mesh);return mesh
    }
    const plant=(x:number,z:number)=>{
      cylinder('#b98461',x,.24,z,.23,.45)
      for(let i=0;i<7;i++){
        const leaf=new T.Mesh(new T.SphereGeometry(1,12,8),mat(i%2?'#618767':'#416852'))
        const a=i*2.4;leaf.position.set(x+Math.cos(a)*.18,.65+i%3*.12,z+Math.sin(a)*.16)
        leaf.scale.set(.13,.38,.12);leaf.rotation.z=Math.cos(a)*.5;this.scene.add(leaf)
      }
    }
    this.scene.add(new T.HemisphereLight(0xe4f2fa,0x514736,.95))
    this.sunlight.position.set(-3,9,6);this.sunlight.castShadow=true;this.sunlight.shadow.mapSize.set(1024,1024)
    Object.assign(this.sunlight.shadow.camera,{left:-6,right:6,top:6,bottom:-6});this.sunlight.shadow.bias=-.001
    this.scene.add(this.sunlight)
    // Floating oak plinth, real floor boards and two open-front walls.
    box('#8d6d50',0,-.24,0,8.3,.45,6.3)
    for(let row=0;row<16;row++)for(let col=0;col<4;col++){
      const colors=['#d7b992','#dcc3a1','#cfb48e','#dfc6a6']
      box(colors[(row+col)%4],-3+col*2,.002,-2.82+row*.375,1.984,.03,.36)
    }
    box('#e4e0d4',0,1.5,-3,8.15,3,.14)
    box('#d7ded3',-4,1.5,0,.14,3,6.15)
    box('#f8f3e7',0,.12,-2.9,8,.17,.055)
    box('#f8f3e7',-3.9,.12,0,.055,.17,6)
    box('#ac8b61',0,3.02,-3,8.25,.06,.22)
    // Soft rug and generously sized accessible bed.
    box('#b8bbb0',-1.55,.035,.45,3.5,.045,4.2)
    box('#ddd7c5',-1.55,.062,.45,3.25,.015,3.95)
    box('#9a7352',-1.65,.3,.05,2.25,.5,3.35)
    box('#c1a786',-1.65,.9,-1.63,2.4,1.4,.17)
    for(let i=0;i<8;i++)box('#b29776',-2.68+i*.295,.95,-1.52,.018,1.18,.018)
    box('#fbf6e9',-1.65,.64,.05,2.2,.28,3.23)
    box('#839f91',-1.65,.83,.55,2.24,.18,2.2)
    box('#557969',-1.65,.935,1.18,2.25,.04,.55)
    for(const x of [-2.22,-1.1])box('#f9f4e7',x,.86,-1.03,.94,.23,.57)
    box('#b78c63',-3.15,.4,-1.12,.65,.74,.75)
    cylinder('#b69a62',-3.15,.96,-1.12,.055,.4)
    const shade=new T.Mesh(new T.CylinderGeometry(.16,.29,.36,32),mat('#f6e8c7'));shade.position.set(-3.15,1.23,-1.12);this.scene.add(shade)
    this.bulb=new T.Mesh(new T.SphereGeometry(.095,16,10),new T.MeshStandardMaterial({color:0xffe9aa,emissive:0xffbc68,emissiveIntensity:2}))
    this.bulb.position.set(-3.15,1.1,-1.12);this.scene.add(this.bulb)
    this.roomLight.position.set(-2.5,1.8,-.5);this.scene.add(this.roomLight)
    // Daylight window and articulated blinds on the left wall.
    box('#f5f3df',-3.9,1.9,.6,.12,1.8,2.65)
    const glass=box('#a8d4df',-3.81,1.9,.6,.035,1.62,2.42)
    ;(glass.material as T.MeshStandardMaterial).emissive.set('#44798b');(glass.material as T.MeshStandardMaterial).emissiveIntensity=.3
    for(const z of [-.6,.6,1.8])box('#f9f6e8',-3.76,1.9,z,.07,1.7,.055)
    this.blinds.position.set(-3.7,2.72,.6)
    for(let i=0;i<16;i++)box('#c6baa0',0,-i*.103,0,.11,.073,2.46,this.blinds)
    this.scene.add(this.blinds)
    // Media console and TV. The screen switches between artwork and black.
    box('#ae8259',1.8,.36,-2.5,3.25,.65,.63)
    for(const x of [.75,1.8,2.85])box('#8d6847',x,.35,-2.17,.018,.48,.02)
    box('#2b3638',1.8,.76,-2.49,.65,.08,.35)
    box('#2b3638',1.8,.92,-2.53,.12,.3,.12)
    box('#1f3035',1.8,1.61,-2.55,2.86,1.62,.13)
    const tvCanvas=document.createElement('canvas');tvCanvas.width=768;tvCanvas.height=432
    const tvContext=tvCanvas.getContext('2d')!
    const horizon=tvContext.createLinearGradient(0,0,768,432);horizon.addColorStop(0,'#1a4054');horizon.addColorStop(.6,'#8fc4bb');horizon.addColorStop(1,'#e8c698')
    tvContext.fillStyle=horizon;tvContext.fillRect(0,0,768,432)
    tvContext.fillStyle='#ffffff60';tvContext.beginPath();tvContext.arc(575,118,52,0,Math.PI*2);tvContext.fill()
    tvContext.fillStyle='#366d74';tvContext.beginPath();tvContext.moveTo(0,310);tvContext.lineTo(190,170);tvContext.lineTo(420,345);tvContext.lineTo(650,240);tvContext.lineTo(768,320);tvContext.lineTo(768,432);tvContext.lineTo(0,432);tvContext.fill()
    tvContext.fillStyle='#fff';tvContext.font='600 30px Segoe UI';tvContext.fillText('NEURONEST',40,62)
    tvContext.font='24px Segoe UI';tvContext.fillText('A little time for you.',40,382)
    this.tvTexture=new T.CanvasTexture(tvCanvas);this.tvTexture.colorSpace=T.SRGBColorSpace
    this.tv=new T.Mesh(new T.PlaneGeometry(2.68,1.44),new T.MeshBasicMaterial({color:0x101c23,toneMapped:false}))
    this.tv.position.set(1.8,1.61,-2.475);this.scene.add(this.tv)
    this.tvLed=new T.Mesh(new T.SphereGeometry(.025,8,6),new T.MeshBasicMaterial({color:0xd59255}));this.tvLed.position.set(2.98,.855,-2.46);this.scene.add(this.tvLed)
    this.tvGlow.position.set(1.8,1.6,-1.8);this.scene.add(this.tvGlow)
    // Air conditioner with an actual target display and static airflow traces.
    box('#f1f3eb',.2,2.64,-2.8,1.75,.44,.3)
    box('#6b807b',.2,2.49,-2.625,1.45,.035,.02)
    this.acCanvas.width=256;this.acCanvas.height=80;this.acTexture=new T.CanvasTexture(this.acCanvas);this.acTexture.colorSpace=T.SRGBColorSpace
    this.acDisplay=new T.Mesh(new T.PlaneGeometry(.55,.18),new T.MeshBasicMaterial({map:this.acTexture,toneMapped:false}))
    this.acDisplay.position.set(.6,2.67,-2.635);this.scene.add(this.acDisplay)
    for(let i=0;i<3;i++){
      const curve=new T.CatmullRomCurve3([new T.Vector3(-.3+i*.4,2.4,-2.5),new T.Vector3(-.2+i*.4,2.1,-2),new T.Vector3(.0+i*.4,1.75,-1.5)])
      const line=new T.Line(new T.BufferGeometry().setFromPoints(curve.getPoints(16)),new T.LineBasicMaterial({color:0x70c1d2,transparent:true,opacity:.7}));this.airflow.add(line)
    }
    this.scene.add(this.airflow)
    // Reading nook, plants and a framed print complete the room.
    const chair=box('#c28d66',2.8,.43,1.65,1.18,.42,1.18)
    box('#c28d66',2.8,.83,2.16,1.18,.8,.2)
    for(const x of [2.24,3.36])box('#b6815a',x,.69,1.65,.14,.35,1.15)
    chair.rotation.y=-.12
    cylinder('#af825a',1.45,.38,1.4,.48,.09);cylinder('#71513c',1.45,.18,1.4,.08,.36)
    cylinder('#f6ebd3',1.5,.46,1.4,.09,.1)
    plant(3.4,-1.25);plant(-3.2,2.25)
    box('#9a7654',-2.1,2.27,-2.89,1.2,.85,.06)
    box('#d6b28e',-2.1,2.27,-2.85,1.06,.71,.02)
    const art=new T.Mesh(new T.CircleGeometry(.22,32),new T.MeshBasicMaterial({color:0xf4d8a8}));art.position.set(-2.1,2.32,-2.831);this.scene.add(art)
    try{
      this.renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'})
      this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05
      this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap
      host.append(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-hidden','true')
    }catch{host.innerHTML='<div class="scene-fallback">Room preview unavailable on this display.<br>Your controls and live status still work.</div>'}
    this.camera.position.set(10,8.5,12);this.camera.lookAt(0,1,0)
    new ResizeObserver(()=>this.resize()).observe(host);this.resize()
  }
  resize(){
    const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h||!this.renderer)return
    this.renderer.setSize(w,h);const halfHeight=Math.max(4.1,5.7*h/w)
    this.camera.top=halfHeight;this.camera.bottom=-halfHeight;this.camera.right=halfHeight*w/h;this.camera.left=-this.camera.right
    this.camera.updateProjectionMatrix();this.draw()
  }
  update(state:State){
    const d=state.devices
    const signature=JSON.stringify([d['bedroom.light'],d['bedroom.blind'],d['bedroom.tv'],d.climate.target,d.climate.mode,d.climate.available,Math.round(d.climate.value*10),state.scenario.grid])
    if(signature===this.signature)return;this.signature=signature
    const powered=(id:string)=>!!d[id]?.available&&(state.scenario.grid||d[id].backup)
    const lit=powered('bedroom.light')&&d['bedroom.light'].value>0
    this.roomLight.intensity=lit?45:0;(this.bulb.material as T.MeshStandardMaterial).emissiveIntensity=lit?2:0
    const open=d['bedroom.blind'].value/100;this.blinds.scale.y=Math.max(.045,1-open);this.sunlight.intensity=.35+open*1.45
    const tvOn=powered('bedroom.tv')&&d['bedroom.tv'].value===1
    const tvMaterial=this.tv.material as T.MeshBasicMaterial
    const map=tvOn?this.tvTexture:null
    if(tvMaterial.map!==map){tvMaterial.map=map;tvMaterial.needsUpdate=true}
    tvMaterial.color.set(tvOn?0xffffff:0x101c23)
    ;(this.tvLed.material as T.MeshBasicMaterial).color.set(tvOn?0x94e4c0:0xb2804e);this.tvGlow.intensity=tvOn?8:0
    const cooling=powered('climate')&&d.climate.mode==='cool'&&d.climate.value>d.climate.target
    this.airflow.visible=cooling
    const ctx=this.acCanvas.getContext('2d')!;ctx.fillStyle='#ecf1ea';ctx.fillRect(0,0,256,80)
    ctx.fillStyle=powered('climate')?'#277969':'#87978e';ctx.font='600 48px Segoe UI';ctx.textAlign='center';ctx.textBaseline='middle'
    ctx.fillText(powered('climate')?d.climate.target+'°':'OFF',128,40);this.acTexture.needsUpdate=true
    this.draw()
  }
  plan(top:boolean){this.camera.position.set(top?0:10,top?24:8.5,top?.01:12);this.camera.lookAt(0,top?0:1,0);this.draw()}
  draw(){if(this.host.clientWidth)this.renderer?.render(this.scene,this.camera)}
}
