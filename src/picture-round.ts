import type {Cue, Epoch} from './picture-decoder'

export const FACE_MS = 160
export const INTERVAL_MS = 700
// The Unicorn delivers blocks of up to 100 ms. Allow a full second from the
// marker before requesting the 800 ms response, including for the final cue.
const READ_AFTER_MS = 1000

export type Marker = {marker:number; invalid:number}
export class UnusableCue extends Error {}

export async function collectRound(
  sequence:number[],
  present:(slot:number)=>Promise<Marker>,
  read:(marker:Marker)=>Promise<Epoch>,
  wait:(ms:number)=>Promise<void>,
  retry:(reason:string)=>void
):Promise<Cue[]> {
  const queue=[...sequence]
  const cues:Cue[]=[]
  let pending:{slot:number; marker:Marker}|undefined
  let index=0, retries=0
  while(index<queue.length || pending){
    const previous=pending
    pending=undefined
    if(index<queue.length){
      const slot=queue[index++]
      pending={slot,marker:await present(slot)}
    }else{
      await wait(READ_AFTER_MS-INTERVAL_MS)
    }
    if(!previous)continue
    try{
      const features=await read(previous.marker)
      cues.push({slot:previous.slot,features})
    }catch(error){
      if(!(error instanceof UnusableCue))throw error
      if(retries>=3)throw Error('Repeated unusable cues. '+error.message+' Resume to repeat this round.')
      retries++
      queue.push(previous.slot)
      retry(error.message)
    }
  }
  return cues
}
