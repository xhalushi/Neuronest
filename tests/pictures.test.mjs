import test from 'node:test'
import assert from 'node:assert/strict'
import {cueSequence,instructions,train,predict,slotScores,BINS,REPETITIONS} from '../src/picture-decoder.ts'

function samples(target, offset=0){
  return cueSequence().map((slot,j)=>({
    slot,features:Array.from({length:8},(_,ch)=>Array.from({length:BINS},(_,b)=>
      (slot===target && b===2 ? 7 : 0)+Math.sin(j*3+ch+b+offset)*.18))
  }))
}
const training=instructions().map((target,i)=>({target,cues:samples(target,i)}))
test('balanced repetitions, separated faces and shuffled training blocks',()=>{
  for(let i=0;i<40;i++){
    const seq=cueSequence()
    assert.deepEqual([0,1,2].map(slot=>seq.filter(x=>x===slot).length),Array(3).fill(REPETITIONS))
    assert.ok(seq.every((x,k)=>!k||seq[k-1]!==x))
    for(const target of [-1,0,1,2])assert.equal(instructions().filter(x=>x===target).length,3)
    assert.equal(instructions(2).length,8)
  }
})
test('frozen model recognizes held-out synthetic responses and rejects rest',()=>{
  const model=train(training)
  assert.equal(model.diagnostics.correct,9)
  for(const target of [2,-1,1,0])assert.equal(predict(model,samples(target,150)),target)
  const changed=samples(1);changed[0].features[2]=null
  assert.throws(()=>predict(model,changed),/channel/i)
  assert.throws(()=>predict(model,samples(1).slice(1)),/incomplete/i)
})
test('flat responses and missing central channels cannot fit a decoder',()=>{
  const flat=training.map(({target,cues})=>({target,cues:cues.map(c=>({...c,features:Array.from({length:8},()=>Array(BINS).fill(1))}))}))
  assert.throws(()=>train(flat),/No measurable target/)
  for(const r of flat)for(const c of r.cues){c.features[2]=null;c.features[4]=null}
  assert.throws(()=>train(flat),/channels/)
})
test('one unusable peripheral channel is consistently excluded from every fold',()=>{
  const data=structuredClone(training)
  data[0].cues[0].features[0]=null
  const model=train(data)
  assert.ok(!model.channels.includes(0))
  assert.equal(predict(model,samples(2,456)),2)
})
function generator(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function noisy(target,seed,signal=true){
  const random=generator(seed)
  // Deterministic schedules avoid test outcomes depending on Math.random.
  return Array.from({length:3*REPETITIONS},(_,j)=>{
    const slot=j%3, common=(random()-.5)*60
    return {slot,features:Array.from({length:8},(_,ch)=>Array.from({length:BINS},(_,b)=>
      common+(random()-.5)*2+(signal && slot===target && b===2 ? (ch===2?8:ch===4?-8:0):0)))}
  })
}
test('covariance model separates target responses under strong shared-channel noise',()=>{
  const rounds=Array.from({length:12},(_,i)=>({target:i%4-1,cues:noisy(i%4-1,i+1)}))
  const model=train(rounds)
  assert.equal(model.diagnostics.correct,9)
  for(const target of [0,1,2]){
    const scores=slotScores(model,noisy(target,100+target))
    assert.equal(scores.indexOf(Math.max(...scores)),target)
  }
})
test('imperfect rest is measured without prematurely rejecting all letter training',()=>{
  const rounds=Array.from({length:12},(_,i)=>({target:i%4-1,cues:noisy(i%4-1,i+1)}))
  rounds[0].cues=noisy(0,201) // A rest round containing a target-like response.
  const model=train(rounds)
  assert.ok(model.diagnostics.correct>=8)
  assert.ok(model.diagnostics.restRejected<3 || predict(model,noisy(0,201))<0)
})
test('noise without a target response does not get reported as reliable recognition',()=>{
  const rounds=Array.from({length:12},(_,i)=>({target:i%4-1,cues:noisy(-1,700+i,false)}))
  const model=train(rounds)
  assert.ok(model.diagnostics.correct<7)
  let correct=0
  for(let i=0;i<30;i++)if(predict(model,noisy(-1,800+i,false))===i%3)correct++
  assert.ok(correct<20)
})
