import test from 'node:test'
import assert from 'node:assert/strict'
import {AlphaGate,fitAlpha} from '../src/input.ts'

test('calibration requires repeatable separation on a single channel',()=>{
 const block=v=>Array.from({length:4},()=>({Oz:v,Fz:15}))
 const p=fitAlpha([block(2),block(12),block(3),block(11)])
 assert.equal(p.channel,'Oz');assert.ok(p.close>p.release)
 assert.equal(fitAlpha([block(2),block(12),block(3),block(3)]),null)
})
test('an activation requires neutral and fires once until released',()=>{
 const gate=new AlphaGate(),p={channel:'Oz',release:4,close:9}
 assert.equal(gate.observe(12,p,0),false)
 gate.observe(2,p,100);gate.observe(2,p,701)
 assert.equal(gate.observe(12,p,800),false)
 assert.equal(gate.observe(12,p,1601),true)
 assert.equal(gate.observe(12,p,4000),false)
 gate.observe(2,p,4100);gate.observe(2,p,4800)
 gate.observe(12,p,5000);assert.equal(gate.observe(12,p,5900),true)
})
test('invalid data, resets and brief closures cannot select',()=>{
 const g=new AlphaGate(),p={channel:'Oz',release:4,close:9}
 g.observe(2,p,0);g.observe(2,p,700);g.observe(12,p,800)
 g.observe(NaN,p,1000);assert.equal(g.observe(12,p,2000),false)
 g.observe(2,p,2100);g.observe(2,p,2800);g.observe(12,p,2900);g.reset()
 assert.equal(g.observe(12,p,4000),false)
})
