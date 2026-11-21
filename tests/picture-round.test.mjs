import test from 'node:test'
import assert from 'node:assert/strict'
import {collectRound,FACE_MS,INTERVAL_MS,UnusableCue} from '../src/picture-round.ts'

const sequence=[0,1,2,0,2,1,2,0,1,2,1,2]
function replay(reject){
  let clock=0
  const shown=[], readAges=[], notices=[]
  const result=collectRound(sequence,async slot=>{
    const marker=shown.length
    shown.push({slot,onset:clock})
    clock+=INTERVAL_MS
    return {marker,invalid:0}
  },async ({marker})=>{
    readAges.push(clock-shown[marker].onset)
    const error=reject(marker)
    if(error)throw error
    return [[marker]]
  },async ms=>{clock+=ms},reason=>notices.push(reason))
  return {result,shown,readAges,notices}
}

test('faster display waits for complete EEG and retains each original marker, including replacements',async ()=>{
  assert.ok(FACE_MS<250 && INTERVAL_MS<1000)
  const {result,shown,readAges,notices}=replay(i=>[1,11].includes(i)?new UnusableCue('high range'):null)
  const cues=await result
  assert.equal(cues.length,12)
  assert.equal(shown.length,14)
  assert.equal(notices.length,2)
  assert.ok(readAges.every(age=>age>=1000))
  assert.deepEqual(cues.map(c=>c.slot).sort(),[...sequence].sort())
  for(const cue of cues)assert.equal(cue.slot,shown[cue.features[0][0]].slot)
})

test('persistent bad contact pauses and stream or timing errors are never retried',async ()=>{
  const bad=replay(()=>new UnusableCue('high range'))
  await assert.rejects(bad.result,/Repeated unusable cues/)
  assert.equal(bad.notices.length,3)
  const stale=replay(()=>Error('stream interrupted'))
  await assert.rejects(stale.result,/stream interrupted/)
  assert.equal(stale.notices.length,0)
})
