import test from 'node:test'
import assert from 'node:assert/strict'
import {SpokenCues} from '../src/spoken-cues.ts'

class Player extends EventTarget{
  pause(){}
  play(){return Promise.resolve()}
}
test('interrupting an instruction releases the old round and waits for the new clip',async ()=>{
  const player=new Player()
  const voice=new SpokenCues(player,()=>assert.fail('unexpected audio error'))
  const first=voice.play('ready')
  const next=voice.play('lights')
  await first
  assert.equal(player.src,'/audio/lights.wav')
  player.dispatchEvent(new Event('ended'))
  await next
  const paused=voice.play('rest')
  voice.stop()
  await paused
})
test('blocked playback reports the audio problem and releases the visual sequence',async ()=>{
  const player=new Player()
  player.play=()=>Promise.reject(Error('Playback blocked'))
  let errors=0
  await new SpokenCues(player,()=>{errors++}).play('ac')
  assert.equal(errors,1)
})
