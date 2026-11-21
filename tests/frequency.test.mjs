import test from 'node:test'
import assert from 'node:assert/strict'
import {FrequencyGate,fitFrequency,pulseLevel,lampLevel,CALIBRATION_TARGETS,VALIDATION_TARGETS,FREQUENCIES,WINDOW_MS} from '../src/frequency.ts'
const target=i=>Array.from({length:3},(_,j)=>j===i?.75:.12)
const rest=[.1,.12,.13]
const samples=[...Array.from({length:3},(_,i)=>[target(i),target(i),target(i)]),[rest,rest,rest]]
test('fits three targets and rest without treating scores as probabilities',()=>{
 const p=fitFrequency(samples);assert.ok(p);assert.equal(p.thresholds.length,3)
 assert.equal(fitFrequency([...samples.slice(0,3),[target(0),target(0),target(0)]]),null)
 assert.equal(fitFrequency([]),null)
})
test('all three targets require rest and produce one event each',()=>{
 const p=fitFrequency(samples),g=new FrequencyGate()
 for(let i=0;i<3;i++){
  const t=i*4000
  assert.equal(g.observe(target(i),p,t,3),null)
  g.observe(rest,p,t+10,3);g.observe(rest,p,t+520,3)
  g.observe(target(i),p,t+600,3)
  assert.equal(g.observe(target(i),p,t+1700,3),i)
  assert.equal(g.observe(target(i),p,t+2500,3),null)
 }
})
test('screen reset prevents a held target from confirming the next action',()=>{
 const p=fitFrequency(samples),g=new FrequencyGate();g.reset(false)
 g.observe(target(1),p,0,3);assert.equal(g.observe(target(1),p,1100,3),1)
 g.reset();assert.equal(g.observe(target(1),p,3000,2),null)
})
test('hidden, ambiguous and invalid targets do not select',()=>{
 const p=fitFrequency(samples),g=new FrequencyGate();g.reset(false)
 assert.equal(g.observe(target(2),p,0,2),null)
 assert.equal(g.observe(target(2),p,1000,2),null)
 assert.equal(g.observe([.8,.79,.1],p,2000,3),null)
 assert.equal(g.observe([NaN,0,0],p,3000,3),null)
})
test('gentle pulses never turn off and repeat at their declared frequency',()=>{
 assert.equal(WINDOW_MS,3000)
 for(const hz of FREQUENCIES){
  for(let ms=0;ms<3000;ms+=7){
   const level=pulseLevel(hz,ms)
   assert.ok(level>=.55-1e-9&&level<=.85+1e-9)
   assert.ok(Math.abs(level-pulseLevel(hz,ms+1000/hz))<1e-9)
  }
 }
})

test('teach one lamp at a time and validate all three with two independent rest trials',()=>{
 assert.deepEqual(CALIBRATION_TARGETS,[0,1,2,-1])
 for(const cue of CALIBRATION_TARGETS){
  assert.equal(VALIDATION_TARGETS.filter(target=>target===cue).length,2)
  for(let slot=0;slot<3;slot++){
   const level=ms=>lampLevel(slot,ms,cue,.15)
   assert.equal(level(-100),level(-1))
   if(cue===slot||cue===-1)assert.notEqual(level(0),level(20))
   else assert.equal(level(0),level(20))
   assert.equal(lampLevel(slot,20,null,.15),pulseLevel(FREQUENCIES[slot],20))
  }
 }
 assert.equal(fitFrequency([...samples,[rest,rest,rest]]),null)
 const g=new FrequencyGate();g.reset(false)
 assert.equal(g.observe([.9,.1,.1,.1],fitFrequency(samples),0,3),null)
 assert.equal(g.armed,false)
})
