import test from 'node:test'
import assert from 'node:assert/strict'
import {HomeController} from '../src/home-controller.ts'
import {restorePictureProfile} from '../src/picture-profile.ts'
import {BINS,REPETITIONS} from '../src/picture-decoder.ts'

function fixture(){
 const calls=[],state={revision:0,devices:{door:{value:1},climate:{target:72},'bedroom.light':{value:100},'bedroom.tv':{value:0}},scenario:{grid:true,internet:true,hurricane:false},requests:[],history:[]}
 let prepare
 const api=async (path,body)=>{
  calls.push({path,body})
  if(path==='state')return structuredClone(state)
  if(path==='prepare')return prepare?await prepare():{id:'action-1',expiresInSeconds:90}
  if(path==='commit')return {message:'Command accepted'}
  return {ok:true}
 }
 const home=new HomeController(api,()=>{},()=>{})
 return {home,calls,state,holdPrepare(fn){prepare=fn}}
}
test('three-choice navigation prepares, cancels, and confirms only distinct choices',async()=>{
 const {home,calls}=fixture();await home.refresh();home.enabled=true
 assert.deepEqual(home.options.map(x=>x.label),['Assistance','Presets','Control'])
 await home.choose(2);await home.choose(0);await home.choose(1)
 assert.equal(home.view,'review')
 assert.equal(home.options.length,3)
 assert.equal(calls.filter(c=>c.path==='commit').length,0)
 assert.deepEqual(calls.find(c=>c.path==='prepare').body.action,{kind:'set',target:'bedroom.light',value:0})
 await home.choose(0)
 assert.equal(home.view,'home');assert.equal(home.pending,null)
 assert.equal(calls.filter(c=>c.path==='commit').length,0)
 await home.choose(0);await home.choose(1)
 assert.equal(home.view,'review')
 await home.choose(2) // Wait must never apply an action.
 assert.ok(home.pending)
 await home.choose(1)
 assert.equal(calls.filter(c=>c.path==='commit').length,1)
 assert.equal(home.view,'home');assert.equal(home.pending,null)
})
test('pause discards an in-flight preparation and later selections cannot confirm it',async()=>{
 const f=fixture();await f.home.refresh();f.home.enabled=true
 await f.home.choose(0)
 let release
 const started=new Promise(resolve=>f.holdPrepare(()=>{resolve();return new Promise(r=>release=r)}))
 const selecting=f.home.choose(0)
 await started;f.home.pause();release({id:'late-action',expiresInSeconds:90});await selecting
 assert.equal(f.home.pending,null);assert.equal(f.home.enabled,false)
 assert.ok(f.calls.some(c=>c.path==='cancel'&&c.body.id==='late-action'))
 await f.home.choose(1)
 assert.equal(f.calls.filter(c=>c.path==='commit').length,0)
})
test('scenario changes cancel pending review, normal refresh keeps it',async()=>{
 const f=fixture();await f.home.refresh();f.home.enabled=true
 await f.home.choose(1);await f.home.choose(0)
 assert.equal(await f.home.refresh(),false);assert.ok(f.home.pending)
 f.state.scenario.grid=false
 assert.equal(await f.home.refresh(),true);assert.equal(f.home.pending,null)
})
test('appliances replace security and TV and blinds retain three choices',async()=>{
 const f=fixture();await f.home.refresh();f.home.enabled=true
 await f.home.choose(2)
 assert.deepEqual(f.home.options.map(x=>x.label),['Lights','AC','Appliances'])
 await f.home.choose(2)
 assert.deepEqual(f.home.options.map(x=>x.label),['TV','Blinds','Home'])
 await f.home.choose(0);await f.home.choose(0)
 assert.deepEqual(f.calls.find(c=>c.path==='prepare').body.action,{kind:'set',target:'bedroom.tv',value:1})
 assert.match(f.home.pending.title,/television on/)
 await f.home.choose(0)
 await f.home.choose(2);await f.home.choose(2);await f.home.choose(1)
 assert.deepEqual(f.home.options.map(x=>x.label),['Up','Down','Home'])
 await f.home.choose(1)
 assert.deepEqual(f.calls.filter(c=>c.path==='prepare').at(-1).body.action,{kind:'set',target:'bedroom.blind',value:0})
 assert.match(f.home.pending.title,/Lower/)
})
test('receipt appears only after a successful commit and blocks further selections until dismissed',async()=>{
 const calls=[],receipts=[]
 let dismiss,visible
 const shown=new Promise(r=>visible=r)
 const api=async(path,body)=>{
  calls.push({path,body})
  if(path==='state')return fixture().state
  if(path==='prepare')return {id:'tv-on',expiresInSeconds:90}
  if(path==='commit')return {receipt:{tone:'success',title:'TV is on',detail:'Your change is reflected in the room.'}}
  return {}
 }
 const home=new HomeController(api,()=>{},()=>{},async receipt=>{receipts.push(receipt);visible();await new Promise(r=>dismiss=r)})
 await home.refresh();home.enabled=true
 await home.choose(2);await home.choose(2);await home.choose(0);await home.choose(0)
 assert.equal(receipts.length,0)
 const confirming=home.choose(1);await shown
 assert.equal(receipts[0].title,'TV is on');assert.equal(home.busy,true)
 await home.choose(0);assert.equal(home.view,'home')
 dismiss();await confirming;assert.equal(home.busy,false)
 assert.equal(calls.filter(c=>c.path==='commit').length,1)
})
function cues(target,offset=0){return Array.from({length:REPETITIONS*3},(_,i)=>({slot:i%3,
 features:Array.from({length:8},(_,ch)=>Array.from({length:BINS},(_,b)=>(i%3===target&&b===2?7:0)+Math.sin(i+ch+b+offset)*.1))}))}
function report(){return {version:2,training:Array.from({length:12},(_,i)=>({target:i%4-1,cues:cues(i%4-1,i)})),validation:Array.from({length:8},(_,i)=>({target:i%4-1,cues:cues(i%4-1,i+100)}))}}
test('saved results must independently pass again before opening live home control',()=>{
 const data=report()
 assert.ok(restorePictureProfile(data).channels.length===8)
 data.validation[1].cues=cues(2,900)
 assert.throws(()=>restorePictureProfile({...data,passed:true}),/do not pass/)
 assert.throws(()=>restorePictureProfile({version:2,model:{},passed:true}),/passing/)
})
