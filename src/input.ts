export type Powers = Record<string,number>
export type Profile = {channel:string; release:number; close:number}
export function fitAlpha(blocks:Powers[][]):Profile|null {
  let best:Profile|null=null, gap=0
  for(const channel of Object.keys(blocks[0]?.[0]||{})) {
    if(blocks.length!==4 || blocks.some(b=>b.length<4 || b.some(p=>!Number.isFinite(p[channel])))) continue
    const sorted=blocks.map(b=>b.map(p=>p[channel]).sort((a,b)=>a-b))
    const opened=Math.max(sorted[0].at(-2)!,sorted[2].at(-2)!),closed=Math.min(sorted[1][1],sorted[3][1])
    if(closed-opened>=3 && closed-opened>gap) {gap=closed-opened;best={channel,release:opened+gap*.3,close:opened+gap*.7}}
  }
  return best
}
export class AlphaGate {
  armed=false; since:number|null=null; closed=false
  reset(){this.armed=false;this.since=null;this.closed=false}
  observe(value:number,p:Profile,now:number):boolean {
    if(!Number.isFinite(value)){this.reset();return false}
    if(!this.armed){
      if(value<=p.release){this.since??=now;if(now-this.since>=600){this.armed=true;this.since=null}}
      else this.since=null
      return false
    }
    if(value>=p.close){
      if(!this.closed){this.since=now;this.closed=true}
      if(this.since!==null && now-this.since>=800){this.reset();return true}
    }else{this.closed=false;this.since=null}
    return false
  }
}
