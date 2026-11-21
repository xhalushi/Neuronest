export const FREQUENCIES = [5,6,60/7]
export const WINDOW_SAMPLES = 750
export const WINDOW_MS = 3000
export const PREPARE_MS = 3000
export const TARGETS = [
  {name:'Blue',rgb:'89 160 222'},
  {name:'Amber',rgb:'226 173 56'},
  {name:'Green',rgb:'67 171 132'},
]
export const CALIBRATION_TARGETS = [0,1,2,-1]
export const VALIDATION_TARGETS = [2,-1,0,1,0,2,-1,1]

// Teach each lamp in isolation. Rest and independent validation use the live display.
export function lampLevel(slot:number,elapsedMs:number,teachingTarget:number|null,depth:number){
  if(teachingTarget!==null && teachingTarget>=0 && teachingTarget!==slot)return .38
  return elapsedMs<0 ? .7 : pulseLevel(FREQUENCIES[slot],elapsedMs,depth)
}
export function pulseLevel(hz:number,elapsedMs:number,depth=.15):number {
  return .7+depth*Math.sin(2*Math.PI*hz*elapsedMs/1000)
}
export type FrequencyProfile={thresholds:number[];release:number[];margin:number}
export function fitFrequency(trials:number[][][]):FrequencyProfile|null {
  if(trials.length!==FREQUENCIES.length+1||trials.some(t=>t.length<3||t.some(s=>s.length!==FREQUENCIES.length||s.some(v=>!Number.isFinite(v)))))return null
  const thresholds:number[]=[],release:number[]=[]
  for(let i=0;i<FREQUENCIES.length;i++){
    const target=Math.min(...trials[i].map(s=>s[i]))
    const background=Math.max(...trials.filter((_,j)=>j!==i).flat().map(s=>s[i]))
    const lead=Math.min(...trials[i].map(s=>s[i]-Math.max(...s.filter((_,j)=>i!==j))))
    if(target-background<.07||lead<.08)return null
    thresholds.push((target+background)/2)
    release.push(Math.min(thresholds[i]-.025,Math.max(...trials[FREQUENCIES.length].map(s=>s[i]))+.025))
  }
  return {thresholds,release,margin:.08}
}
export class FrequencyGate {
  armed=false;private neutral:number|null=null;private candidate=-1;private since=0
  reset(requireRest=true){this.armed=!requireRest;this.neutral=null;this.candidate=-1}
  observe(scores:number[],profile:FrequencyProfile,now:number,activeCount:number):number|null{
    if(scores.length!==FREQUENCIES.length||scores.some(v=>!Number.isFinite(v))){this.reset();return null}
    if(!this.armed){if(scores.every((s,i)=>s<profile.release[i])){this.neutral??=now;if(now-this.neutral>=500){this.armed=true;this.neutral=null}}else this.neutral=null;return null}
    const best=scores.indexOf(Math.max(...scores)),other=Math.max(...scores.filter((_,i)=>i!==best))
    if(best>=activeCount||scores[best]<profile.thresholds[best]||scores[best]-other<profile.margin){this.candidate=-1;return null}
    if(this.candidate!==best){this.candidate=best;this.since=now}
    if(now-this.since<1000)return null
    this.reset();return best
  }
}
