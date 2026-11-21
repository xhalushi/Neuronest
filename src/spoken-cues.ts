// Reuse the player first activated by the Start or Practice click for later rounds.
export class SpokenCues {
  private finish?:()=>void
  private player:HTMLAudioElement
  private unavailable:()=>void
  constructor(player:HTMLAudioElement, unavailable:()=>void){
    this.player=player
    this.unavailable=unavailable
  }

  stop(){
    this.finish?.()
    this.player.pause()
  }

  play(name:string):Promise<void>{
    this.stop()
    return new Promise(resolve=>{
      const finish=()=>{
        if(this.finish!==finish)return
        this.finish=undefined
        clearTimeout(timeout)
        this.player.removeEventListener('ended',finish)
        this.player.removeEventListener('error',fail)
        resolve()
      }
      const fail=()=>{
        if(this.finish!==finish)return
        this.player.pause()
        this.unavailable()
        finish()
      }
      // A blocked or unavailable audio output must leave visual control usable.
      const timeout=setTimeout(fail,8000)
      this.finish=finish
      this.player.addEventListener('ended',finish)
      this.player.addEventListener('error',fail)
      this.player.src='/audio/'+name+'.wav'
      this.player.play().catch(fail)
    })
  }
}
