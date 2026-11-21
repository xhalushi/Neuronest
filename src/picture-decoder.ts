export type Epoch = (number[] | null)[]
export type Cue = {slot:number; features:Epoch}
export type Round = {target:number; cues:Cue[]}
export const REPETITIONS=8
export const BINS=6
export type PictureModel = {
  channels:number[]; center:number[]; weights:number[]; threshold:number; margin:number
  diagnostics?:{correct:number; total:number; restRejected:number; restTotal:number}
}
export function shuffled<T>(items:T[]):T[] {
  const result=[...items]
  for(let i=result.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1))
    ;[result[i],result[j]]=[result[j],result[i]]
  }
  return result
}
// Equal exposure prevents a more frequent letter from acquiring an advantage.
export function cueSequence(repetitions=REPETITIONS):number[] {
  const result:number[]=[]
  for(let i=0;i<repetitions;i++){
    let next=shuffled([0,1,2])
    while(next[0]===result.at(-1))next=shuffled([0,1,2])
    result.push(...next)
  }
  return result
}
export function instructions(blocks=3):number[] {
  return Array.from({length:blocks},()=>shuffled([0,1,2,-1])).flat()
}
function mean(values:number[]){return values.reduce((a,b)=>a+b,0)/values.length}
function vector(epoch:Epoch,channels:number[]):number[]{
  return channels.flatMap(i=>{
    const values=epoch[i]
    if(!values || values.length!==BINS || !values.every(Number.isFinite))
      throw Error('A trained channel is unavailable. Repeat this round.')
    return values
  })
}
function validateRound(round:Round){
  if(![-1,0,1,2].includes(round.target) || round.cues.length!==3*REPETITIONS ||
    [0,1,2].some(slot=>round.cues.filter(c=>c.slot===slot).length!==REPETITIONS))
    throw Error('Incomplete picture round.')
}
export function slotScores(model:PictureModel,cues:Cue[]):number[]{
  validateRound({target:-1,cues})
  return [0,1,2].map(slot=>mean(cues.filter(c=>c.slot===slot).map(c=>
    vector(c.features,model.channels).reduce((sum,v,i)=>sum+(v-model.center[i])*model.weights[i],0))))
}
// Solve the positive definite, shrinkage-regularized covariance by Cholesky.
function solve(matrix:number[][],rhs:number[]):number[]{
  const n=rhs.length,L=Array.from({length:n},()=>Array(n).fill(0))
  for(let i=0;i<n;i++)for(let j=0;j<=i;j++){
    let sum=matrix[i][j]
    for(let k=0;k<j;k++)sum-=L[i][k]*L[j][k]
    L[i][j]=i===j?Math.sqrt(Math.max(sum,1e-12)):sum/L[j][j]
  }
  const y=Array(n).fill(0),x=Array(n).fill(0)
  for(let i=0;i<n;i++)y[i]=(rhs[i]-L[i].slice(0,i).reduce((s,v,k)=>s+v*y[k],0))/L[i][i]
  for(let i=n-1;i>=0;i--){
    let sum=y[i]
    for(let j=i+1;j<n;j++)sum-=L[j][i]*x[j]
    x[i]=sum/L[i][i]
  }
  return x
}
function fit(rounds:Round[],allowed=[0,1,2,3,4,5,6,7]):PictureModel {
  // Rest is reserved for abstention calibration. Fit the ERP template from
  // target vs non-target events within the same attended rounds.
  const attended=rounds.filter(r=>r.target>=0)
  const cues=rounds.flatMap(r=>r.cues)
  const channels=allowed.filter(i=>cues.every(c=>c.features[i]!=null))
  if(channels.length<2 || !channels.some(i=>i===2||i===4))
    throw Error('Too few channels stayed usable throughout training. Need two, including Cz or Pz.')
  const yes:number[][]=[],no:number[][]=[]
  for(const r of attended)for(const c of r.cues)
    (c.slot===r.target?yes:no).push(vector(c.features,channels))
  const n=channels.length*BINS
  const a=Array.from({length:n},(_,i)=>mean(yes.map(x=>x[i])))
  const b=Array.from({length:n},(_,i)=>mean(no.map(x=>x[i])))
  const difference=a.map((v,i)=>v-b[i]),center=a.map((v,i)=>(v+b[i])/2)
  const covariance=Array.from({length:n},()=>Array(n).fill(0))
  for(const [rows,average] of [[yes,a],[no,b]] as [number[][],number[]][])
    for(const row of rows){
      const residual=row.map((v,i)=>v-average[i])
      for(let i=0;i<n;i++)for(let j=0;j<=i;j++)covariance[i][j]+=residual[i]*residual[j]
    }
  const divisor=yes.length+no.length-2
  const scale=Math.max(mean(covariance.map((row,i)=>row[i]/divisor)),1e-6)
  // Fixed 20% shrinkage avoids tuning on independent test rounds.
  for(let i=0;i<n;i++)for(let j=0;j<=i;j++){
    const value=.8*covariance[i][j]/divisor+(i===j?.2*scale:0)
    covariance[i][j]=value;covariance[j][i]=value
  }
  let weights=solve(covariance,difference)
  const separation=weights.reduce((s,v,i)=>s+v*difference[i],0)
  if(!Number.isFinite(separation)||separation<1e-10)
    throw Error('No measurable target response in these recordings. Calibration cannot fit a decoder; this alone does not identify a contact problem.')
  weights=weights.map(w=>w/separation)
  return {channels,center,weights,threshold:0,margin:0}
}
function ranked(scores:number[]){return [0,1,2].sort((a,b)=>scores[b]-scores[a])}
function choice(scores:number[],threshold:number,margin:number){
  const [first,second]=ranked(scores)
  return scores[first]>threshold && scores[first]-scores[second]>margin?first:-1
}
export function train(rounds:Round[]):PictureModel {
  for(const label of [-1,0,1,2])
    if(rounds.filter(r=>r.target===label).length!==3)throw Error('Incomplete picture training.')
  rounds.forEach(validateRound)
  const available=[0,1,2,3,4,5,6,7].filter(i=>rounds.every(r=>r.cues.every(c=>c.features[i]!=null)))
  // Hold out complete rounds; never split neighboring epochs across folds.
  const held:{target:number;scores:number[]}[]=[]
  for(let fold=0;fold<3;fold++){
    const test=[-1,0,1,2].map(label=>rounds.filter(r=>r.target===label)[fold])
    const model=fit(rounds.filter(r=>!test.includes(r)),available)
    for(const round of test)held.push({target:round.target,scores:slotScores(model,round.cues)})
  }
  const attended=held.filter(r=>r.target>=0),rest=held.filter(r=>r.target<0)
  const peaks=[...new Set(held.map(r=>Math.max(...r.scores)))].sort((a,b)=>a-b)
  const thresholds=[-Infinity,...peaks.slice(1).map((v,i)=>(v+peaks[i])/2),Infinity]
  const margins=[0,...held.map(r=>{const [a,b]=ranked(r.scores);return r.scores[a]-r.scores[b]})]
  let best=-1,threshold=Infinity,margin=0
  // Rest rejection uses held-out scores, without demanding perfect separation.
  // Only the subsequent independent test can pass the complete system.
  for(const t of thresholds)for(const m of margins){
    const specificity=rest.filter(r=>choice(r.scores,t,m)<0).length/rest.length
    const accuracy=attended.filter(r=>choice(r.scores,t,m)===r.target).length/attended.length
    const balanced=(specificity+accuracy)/2
    if(balanced>best || (balanced===best && t>threshold)){best=balanced;threshold=t;margin=m}
  }
  const model=fit(rounds)
  model.threshold=threshold;model.margin=margin
  model.diagnostics={correct:attended.filter(r=>ranked(r.scores)[0]===r.target).length,total:attended.length,
    restRejected:rest.filter(r=>choice(r.scores,threshold,margin)<0).length,restTotal:rest.length}
  return model
}
export function predict(model:PictureModel,cues:Cue[]):number {
  return choice(slotScores(model,cues),model.threshold,model.margin)
}
