import './pictures.css'
import {cueSequence,instructions,train,predict,slotScores,type Round,type PictureModel,type Epoch} from './picture-decoder'
import {collectRound,FACE_MS,INTERVAL_MS,UnusableCue,type Marker} from './picture-round'
import {SpokenCues} from './spoken-cues'
import {HomeController,type CommandReceipt} from './home-controller'
import {restorePictureProfile} from './picture-profile'
import {HouseScene} from './scene'

const names=['Lights','AC','Appliances']
const letters=['L','A','S']
const portrait=new URL('./grace-hopper.jpg',import.meta.url).href
const label=(slot:number)=>slot<0?'Rest':names[slot]
const app=document.querySelector<HTMLElement>('#app')!
document.title='Neuronest · Your home, your choice'
app.innerHTML=`
<header><strong><span class="brand-mark">N</span> Neuronest</strong><span class="demo-label">INDEPENDENCE, AT HOME <b>LIVE DEMO</b></span><div class="toolbar"><button id="report" hidden>Save results</button><button id="tools">Setup</button><button id="sound" aria-label="Spoken cues">Sound on</button></div></header>
<main><section class="heading"><small id="stage">Letter selection</small><h1 id="instruction">Count faces on your letter</h1>
<p id="detail">Keep looking at the named letter. Count each time a face appears over it.</p></section>
<div class="home-workspace"><section class="house-preview" aria-label="Live simulated bedroom">
<div class="house-heading"><div><small>A SPACE THAT RESPONDS TO YOU</small><h2>Your bedroom</h2></div><span id="house-connection">Local simulation</span></div>
<div id="house-scene" role="img" aria-label="3D view of your simulated bedroom"></div>
<div class="house-readouts"><span id="house-light">Lighting · —</span><span id="house-climate">Climate · —</span><span id="house-tv">Television · —</span><span id="house-blinds">Blinds · —</span></div>
</section><section class="pictures" aria-label="Fixed letter board">
${letters.map((letter,i)=>`<button class="choice" data-slot="${i}" aria-label="${letter}: ${names[i]}"><span class="stimulus"><b>${letter}</b><span class="face"><img src="${portrait}" alt=""></span></span><strong id="label-${i}">${names[i]}</strong><small id="detail-${i}" class="choice-detail"></small></button>`).join('')}
<div class="rest"><b>+</b> Rest</div>
<div id="receipt" class="receipt-layer" hidden><section class="receipt-card" role="status" aria-live="polite"><div class="receipt-symbol" id="receipt-symbol">✓</div><span class="receipt-eyebrow" id="receipt-eyebrow">COMMAND SENT</span><h2 id="receipt-title"></h2><p id="receipt-detail"></p><div class="receipt-footer"><span>NEURONEST · LOCAL SIMULATION</span><button id="receipt-close" aria-label="Dismiss command result">Continue →</button></div><div class="receipt-timer"></div></section></div>
</section></div>
<footer><div><audio id="voice"></audio><small id="sound-error" role="status" hidden>Audio unavailable. Check your browser’s sound settings.</small><progress id="progress" max="20" value="0" aria-label="Completed rounds"></progress>
<div id="home-status" aria-label="Simulated home status"></div>
<p id="message" role="status">12 training rounds · 8 test rounds · about 8 minutes. Esc pauses.</p></div>
<div class="buttons"><button id="practice">Practice</button><button id="action">Start calibration</button></div></footer></main>
<dialog id="setup-dialog"><h2>Neuronest setup</h2><p>Count faces on your chosen letter. All devices and assistance requests are simulated.</p><p>Flashing images may be uncomfortable or trigger seizures in susceptible people. Pause whenever needed.</p><div class="tool-grid"><button id="load-profile">Load passing results</button><button id="recalibrate">New calibration</button><button id="manual">Manual demo</button><button id="live-home" hidden>Use headset</button><button id="presenter">Presenter tools</button><button id="close-setup">Done</button></div><p id="setup-message" role="status">Load results only for the same wearer and unchanged headset fit.</p><input type="file" id="profile-file" accept=".json,application/json" hidden></dialog>
<dialog id="presenter-dialog"><h2>Presenter tools</h2><p>Scenarios stay on this laptop. No real calls or device connections.</p><div class="tool-grid"><button id="hurricane">Toggle hurricane</button><button id="grid">Toggle grid power</button><button id="internet">Toggle internet</button><button id="reset-home">Reset home</button></div><p id="presenter-state"></p><p id="request-state"></p><div class="tool-grid"><button id="acknowledge">Acknowledge request</button><button id="resolve-request">Resolve request</button><button id="retry-request">Retry failed request</button><button id="close-presenter">Done</button></div></dialog>`
const byId=(id:string)=>document.getElementById(id)!
const houseScene=new HouseScene(byId('house-scene'))
const button=byId('action') as HTMLButtonElement
const progress=byId('progress') as HTMLProgressElement
const practiceButton=byId('practice') as HTMLButtonElement
const voice=new SpokenCues(byId('voice') as HTMLAudioElement,()=>{byId('sound-error').hidden=false})
let soundOn=localStorage.getItem('homeway.audio')!=='false'
function announce(name:string){return soundOn?voice.play(name):Promise.resolve()}
function updateSound(){
  byId('sound').setAttribute('aria-pressed',String(soundOn))
  byId('sound').textContent=soundOn?'Sound on':'Sound off'
}
updateSound()
byId('sound').onclick=()=>{
  soundOn=!soundOn
  localStorage.setItem('homeway.audio',String(soundOn))
  byId('sound-error').hidden=true
  updateSound()
  if(!soundOn)voice.stop()
  else if(!active)void announce('sound-on')
}
const targetCues=['lights','ac','security']
const detectedCues=['selected-lights','selected-ac','selected-security']
const faces=Array.from(app.querySelectorAll<HTMLElement>('.face'))
async function loadFaces(){
  await Promise.all(Array.from(app.querySelectorAll<HTMLImageElement>('.face img'),img=>img.decode()))
}
let training=instructions(), validation=instructions(2), rounds:Round[]=[], results:{target:number;choice:number;rankedChoice:number;scores:number[]}[]=[]
let testRounds:Round[]=[],timings:number[]=[],lastError=''
let model:PictureModel|null=null, active=false, practicing=false, completed=false, resetNeeded=false, generation=0
let inHome=false,passed=false,homeMode:'manual'|'erp'='erp',polling=false
const home=new HomeController(homeApi,renderHome,message,showReceipt)
let receiptFinish:(()=>void)|undefined
function closeReceipt(){receiptFinish?.()}
function showReceipt(receipt:CommandReceipt):Promise<void>{
  closeReceipt();show(-1)
  const layer=byId('receipt')
  layer.dataset.tone=receipt.tone
  byId('receipt-symbol').textContent=receipt.tone==='success'?'✓':receipt.tone==='warning'?'!':'×'
  byId('receipt-eyebrow').textContent=receipt.tone==='success'?'COMMAND SENT':receipt.tone==='warning'?'PLEASE NOTE':'REQUEST UPDATE'
  byId('receipt-title').textContent=receipt.title
  byId('receipt-detail').textContent=receipt.detail
  layer.hidden=false
  void announce(receipt.tone==='success'?'command-success':'command-attention')
  return new Promise(resolve=>{
    const done=()=>{if(receiptFinish!==done)return;clearTimeout(timer);layer.hidden=true;receiptFinish=undefined;resolve()}
    const timer=setTimeout(done,4500);receiptFinish=done
  })
}
byId('receipt-close').onclick=closeReceipt
async function homeApi(path:string,body?:unknown){
  const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(2000)})
  const value=await response.json()
  if(!response.ok)throw Error(value.error||'Local home service unavailable.')
  return value
}
function message(text:string){byId('message').textContent=text}
function show(slot:number){
  faces.forEach((face,i)=>face.classList.toggle('visible',i===slot))
}
function stop(reason:string,spoken='paused'){
  generation++; active=false; show(-1)
  closeReceipt()
  if(inHome)home.pause()
  voice.stop()
  if(!document.hidden && document.hasFocus())void announce(spoken)
  button.textContent=inHome?'Resume control':practicing?'Start calibration':resetNeeded?'Restart calibration':'Resume round'
  if(practicing)practiceButton.hidden=false
  practicing=false
  byId('stage').textContent='Paused'
  lastError=reason
  byId('report').hidden=rounds.length===0
  message(reason)
}
function check(run:number){
  if(run!==generation || !active)throw Error('Paused.')
  if(document.hidden || !document.hasFocus())throw Error('Window lost focus. Bring it forward and resume.')
  if((byId('setup-dialog') as HTMLDialogElement).open||(byId('presenter-dialog') as HTMLDialogElement).open)
    throw Error('Close the open panel and resume when ready.')
}
async function api(path:string,body:object){
  const res=await fetch('/api/picture/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(2000)})
  const data=await res.json()
  if(!res.ok){
    if(data.code==='unusable_cue')throw new UnusableCue(data.error)
    throw Error(data.error||'The reader could not complete this cue.')
  }
  return data
}
const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
async function present(slot:number,run:number,recordEEG:boolean){
  await frame(); check(run)
  show(slot)
  const onset=performance.now()
  // The marker and the portrait onset refer to the same fixed letter.
  const marker=recordEEG ? await api('mark',{}) : null
  if(recordEEG)timings.push(performance.now()-onset)
  check(run)
  if(performance.now()-onset>60)throw Error('Cue timing was delayed. Close busy apps and resume this round.')
  await delay(Math.max(0,FACE_MS-(performance.now()-onset)));check(run);show(-1)
  if(performance.now()-onset>FACE_MS+140)throw Error('The display stalled. Resume this round.')
  await delay(Math.max(0,INTERVAL_MS-(performance.now()-onset)));check(run)
  return marker
}
async function practice(){
  if(active)return
  practicing=true;active=true;practiceButton.hidden=true;button.textContent='Stop practice'
  const run=++generation
  const slots=cueSequence(4)
  byId('stage').textContent='Practice · no EEG'
  byId('instruction').textContent='Watch L · Lights'
  byId('detail').textContent='Keep your eyes on L. Count only the faces that appear on L.'
  message('Get ready for the first face.')
  try{
    await Promise.all([announce('lights'),loadFaces(),delay(3000)]);check(run)
    message('Keep your count until the round ends.')
    for(const slot of slots)await present(slot,run,false)
    const count=slots.filter(s=>s===0).length
    stop('A face appeared on L '+count+' times. Start the EEG test when ready.', ['three','four','five'][count-3])
    byId('stage').textContent='Practice complete';byId('instruction').textContent='Check your count'
    byId('detail').textContent='Compare your count with the answer below.'
  }catch(error){if(run===generation)stop(error instanceof Error?error.message:'Practice paused.')}
}
function reset(){
  training=instructions();validation=instructions(2);rounds=[];results=[];model=null
  testRounds=[];timings=[];lastError='';byId('report').hidden=true
  resetNeeded=false;completed=false;progress.value=0
  passed=false
}
async function start(){
  if(inHome){if(active)stop('Control paused. Pending actions canceled.');else await enterHome(homeMode);return}
  if(active){stop(practicing?'Practice stopped.':'Paused. Resume repeats the current round.');return}
  if(completed || resetNeeded)reset()
  active=true;practiceButton.hidden=true;button.textContent='Pause';const run=++generation
  try{
    byId('stage').textContent='Headset setup';byId('instruction').textContent='Getting ready'
    message('Waiting for valid EEG from the Unicorn…')
    await Promise.all([announce('ready'),loadFaces()]);check(run)
    // Wait for acquisition to settle without presenting any visual cue.
    for(;;){
      check(run)
      const res=await fetch('/api/eeg',{signal:AbortSignal.timeout(2000)})
      if(!res.ok)throw Error('Local reader unavailable.')
      const s=await res.json();check(run)
      if(!s.live)throw Error('Open Start Neuronest.cmd for live EEG, or choose Manual demo in Setup.')
      if(s.pictureVersion!==2)throw Error('The old reader is still running. Close its launcher, reopen Start Neuronest.cmd, and refresh this page.')
      if(s.error && !s.error.startsWith('Live headset not started'))throw Error(s.error)
      if(s.bufferedSamples>=125 && s.sampleAgeMs<200)break
      if(s.error)message('Waiting for the headset connection. Keep the launcher window open.')
      else message('Waiting for fresh EEG. Check that the headset is powered and connected.')
      await delay(500)
    }
    while(results.length<validation.length){
      check(run)
      const testing=model!==null
      const index=testing?results.length:rounds.length
      const target=(testing?validation:training)[index]
      byId('stage').textContent=(testing?'Independent test':'Training')+' · '+(index+1)+' of '+(testing?validation.length:training.length)
      byId('instruction').textContent=target<0?'Rest at the cross':'Watch '+letters[target]+' · '+label(target)
      byId('detail').textContent=target<0?'Look at + and let the faces pass without counting.':'Stay on '+letters[target]+'. Silently count each face that appears on that letter.'
      message('Get ready for the first face.')
      await Promise.all([announce(targetCues[target]??'rest'),delay(3000)]);check(run)
      // Keep spoken instructions outside the baseline of the first EEG cue.
      await delay(800);check(run)
      message(target<0?'Look at + until the round ends.':'Count faces on '+letters[target]+' until the round ends.')
      const cues=await collectRound(cueSequence(),slot=>present(slot,run,true),
        async (marker:Marker)=>{
          check(run)
          const data=await api('epoch',marker);check(run)
          const features:Epoch=data.features
          if(model?.channels.some(ch=>features[ch]===null))
            throw new UnusableCue('A trained channel lost contact.')
          return features
        },
        async ms=>{await delay(ms);check(run)},
        ()=>{check(run);message('One cue needs repeating. Keep following the round prompt.')}
      )
      let feedback:Promise<void>|undefined
      if(testing){
        const choice=predict(model!,cues)
        const scores=slotScores(model!,cues)
        const rankedChoice=[0,1,2].sort((a,b)=>scores[b]-scores[a])[0]
        results.push({target,choice,rankedChoice,scores})
        testRounds.push({target,cues})
        message('Expected '+label(target)+' · Detected '+label(choice))
        feedback=announce(detectedCues[choice]??'no-selection')
      }else{
        rounds.push({target,cues})
        message('Training round recorded.')
        if(rounds.length===training.length){
          try{model=train(rounds)}catch(error){resetNeeded=true;throw error}
          const d=model.diagnostics!
          message('Calibration recognition: '+d.correct+'/'+d.total+'. Now checking new rounds.')
          byId('report').hidden=false
        }
      }
      progress.value=rounds.length+results.length
      await Promise.all([feedback,delay(1200)]);check(run)
    }
    const correct=results.filter(r=>r.target>=0 && r.target===r.choice).length
    const recognized=results.filter(r=>r.target>=0 && r.target===r.rankedChoice).length
    const idle=results.filter(r=>r.target<0 && r.choice<0).length
    completed=true;active=false;button.textContent='Run again'
    byId('stage').textContent='Independent test complete'
    byId('instruction').textContent=correct===6&&idle===2?'Face cue test passed':'Face cue test did not pass'
    byId('detail').textContent='Letters ranked correctly: '+recognized+'/6 · Accepted correctly: '+correct+'/6 · Quiet at rest: '+idle+'/2'
    message(correct===6&&idle===2?'All test rounds passed. Results can be saved.':recognized>=5?'Letter recognition is promising; rest rejection or confidence still needs improvement. Save results for review.':'The new rounds did not show reliable letter recognition. Save results to inspect the responses and timing.')
    byId('report').hidden=false
    passed=correct===6&&idle===2
    await announce(passed?'passed':'failed')
    if(run===generation && passed)await enterHome('erp')
  }catch(error){
    if(run===generation)stop(error instanceof Error?error.message:'Reader unavailable. Check the launcher and resume.')
  }
}
button.onclick=()=>void start()
practiceButton.onclick=()=>void practice()
byId('report').onclick=()=>{
  const report={version:2,created:new Date().toISOString(),method:'face ERP, continuous 0.5–15 Hz, shrinkage LDA',
    training:rounds,validation:testRounds,results,model,markerRoundTripMs:timings,lastError}
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,(_key,value)=>typeof value==='number'&&!Number.isFinite(value)?String(value):value,2)],{type:'application/json'}))
  const a=document.createElement('a');a.href=url;a.download='neuronest-face-results.json';a.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}
window.addEventListener('blur',()=>{if(active)stop('Paused when the window lost focus. Resume repeats the current round.');voice.stop()})
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(active)stop('Paused while hidden. Resume repeats the current round.');voice.stop()}})
window.addEventListener('keydown',e=>{if(active&&e.key==='Escape'){e.preventDefault();stop('Paused. Resume when comfortable.')}})

function renderHome(){
  if(!inHome)return
  byId('stage').textContent=homeMode==='erp'?'Live headset · '+(home.view==='review'?'Confirmation':home.view):'Manual demo · '+home.view
  byId('instruction').textContent=home.title
  byId('detail').textContent=home.pending?.title??(homeMode==='manual'?'Click a choice or press 1–3. Every action opens a confirmation screen.':home.detail)
  home.options.forEach((option,i)=>{
    byId('label-'+i).textContent=option.label
    const symbols:Record<string,string>={Assistance:'♡',Presets:'☾',Control:'⌘',Lights:'☀',AC:'❄',Appliances:'▣',TV:'▰',Blinds:'▥',Home:'⌂',Up:'↑',Down:'↓',On:'⏻',Off:'⏻',Confirm:'✓',Wait:'◷',Sleep:'☾','Wake up':'☀'}
    byId('label-'+i).dataset.icon=symbols[option.label]??''
    byId('detail-'+i).textContent=option.detail
    app.querySelector('[data-slot="'+i+'"]')?.setAttribute('aria-label',letters[i]+': '+option.label)
  })
  practiceButton.hidden=true
  progress.hidden=true
  button.textContent=active?'Pause':'Resume control'
  byId('live-home').hidden=!passed
  updateHomeStatus()
}
function updateHomeStatus(){
  const state=home.state
  if(!state)return
  const d=state.devices,r=state.requests[0]
  houseScene.update(state)
  const powered=(key:string)=>d[key].available&&(state.scenario.grid||d[key].backup)
  byId('house-light').textContent='Bedroom light · '+(powered('bedroom.light')&&d['bedroom.light'].value?'On':'Off')
  byId('house-climate').textContent='AC · '+(powered('climate')?d.climate.value.toFixed(1)+'° → '+d.climate.target+'°F':'No power')
  byId('house-tv').textContent='Television · '+(powered('bedroom.tv')&&d['bedroom.tv'].value?'On':'Off')
  byId('house-blinds').textContent='Blinds · '+Math.round(d['bedroom.blind'].value)+'% open'
  byId('house-connection').textContent=state.scenario.hurricane?'Hurricane demo':!state.scenario.grid?'Backup power':'Live simulation'
  byId('house-scene').setAttribute('aria-label',`3D bedroom. ${byId('house-light').textContent}. ${byId('house-climate').textContent}. ${byId('house-tv').textContent}. ${byId('house-blinds').textContent}.`)
  byId('home-status').textContent=(state.scenario.hurricane?'HURRICANE DEMO · ':'')+
    'Light '+(powered('bedroom.light')&&d['bedroom.light'].value?'on':'off')+' · AC '+d.climate.target+'°F · TV '+(powered('bedroom.tv')&&d['bedroom.tv'].value?'on':'off')+
    (!state.scenario.grid?' · Grid outage':'')+(!state.scenario.internet?' · Offline':'')+(r?' · '+r.category+': '+r.status:'')
  byId('presenter-state').textContent='Hurricane '+(state.scenario.hurricane?'on':'off')+' · Grid '+(state.scenario.grid?'on':'off')+' · Internet '+(state.scenario.internet?'on':'off')
  byId('request-state').textContent=r?r.category+' request: '+r.status:'No assistance requests.'
  ;(byId('acknowledge') as HTMLButtonElement).disabled=r?.status!=='delivered'
  ;(byId('resolve-request') as HTMLButtonElement).disabled=!r||!['acknowledged','cancellation requested'].includes(r.status)
  ;(byId('retry-request') as HTMLButtonElement).disabled=r?.status!=='failed'||!state.scenario.internet
}
async function enterHome(mode:'manual'|'erp'){
  if(mode==='erp'&&(!model||!passed)){message('Complete calibration or load passing results first.');return}
  homeMode=mode;inHome=true;active=true;practicing=false
  const run=++generation
  home.enabled=false;home.cancel();home.mode=mode;home.session=crypto.randomUUID()
  try{
    // Activate the reused audio player in the assisted Resume / Use headset
    // click, before network awaits can consume browser user activation.
    const opening=mode==='erp'?announce('ready'):Promise.resolve()
    await Promise.all([opening,home.refresh(),loadFaces()]);check(run)
    if(mode==='erp'){
      const packet=await homeApi('eeg');check(run)
      if(!packet.live||packet.pictureVersion!==2)throw Error('Close the old reader and open Start Neuronest.cmd for live face control.')
      if(packet.error||packet.bufferedSamples<125||packet.sampleAgeMs>=250)throw Error(packet.error||'Waiting for fresh EEG. Resume when the headset is ready.')
    }
    home.enabled=true;home.go();renderHome();await home.heartbeat();check(run)
    message(mode==='manual'?'Click a choice or press 1–3. Every action requires confirmation.':'Count faces on your choice. Each new menu starts a fresh round.')
    if(mode==='erp')await controlLoop(run)
  }catch(error){if(run===generation)stop(error instanceof Error?error.message:'Home control paused.')}
}
async function controlLoop(run:number){
  while(active && inHome && homeMode==='erp'){
    check(run)
    const menuScreen=home.screen
    const verify=()=>{check(run);if(home.screen!==menuScreen)throw Error('The menu changed. Resume to start a fresh selection.')}
    const menuCue=home.view==='device'?(home.device==='climate'?'ac':home.device==='bedroom.tv'?'tv':home.device==='bedroom.blind'?'blinds':'lights'):home.view
    message('Listen to the choices, then count faces on your chosen letter.')
    await Promise.all([announce('menu-'+menuCue),delay(3000)]);verify()
    await delay(800);verify()
    message('Count faces on your choice · look at + for no selection.')
    const cues=await collectRound(cueSequence(),async slot=>{verify();return present(slot,run,true)},async (marker:Marker)=>{
      verify();const data=await api('epoch',marker);verify()
      const features:Epoch=data.features
      if(model!.channels.some(ch=>features[ch]===null))throw new UnusableCue('A trained channel is unavailable.')
      return features
    },async ms=>{await delay(ms);verify()},()=>{verify();message('Repeating one cue. Keep counting on your choice.')})
    verify()
    const choice=predict(model!,cues)
    if(choice<0){message('No clear choice. Rest, or count again in the next round.');await announce('no-selection');check(run)}
    else{
      const option=home.options[choice]
      message('Selected '+option.label)
      await announce(option.cue);verify()
      await home.choose(choice);check(run)
    }
    await delay(1200);check(run)
  }
}
async function pollHome(){
  if(!inHome||polling)return
  polling=true
  try{
    const changed=await home.refresh();updateHomeStatus()
    if(changed && active){stop('Home conditions changed. Any pending action was canceled. Resume when ready.');return}
    if(active && (!document.hasFocus()||document.hidden)){stop('Control paused when the window lost focus.');return}
    if(active && homeMode==='erp'){
      const packet=await homeApi('eeg')
      if(!packet.live||packet.pictureVersion!==2||packet.error||packet.sampleAgeMs>=250||packet.bufferedSamples<125){stop(packet.error||'EEG interrupted. Pending actions canceled. Resume when ready.');return}
    }
    await home.heartbeat()
  }catch(error){if(active)stop(error instanceof Error?error.message:'Connection lost. Control paused.')}
  finally{polling=false}
}
setInterval(()=>void pollHome(),500)
// Populate the preview before calibration without creating an input session.
void home.refresh().then(updateHomeStatus).catch(()=>{byId('house-connection').textContent='Waiting for local server'})
app.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((el,i)=>el.onclick=()=>{
  if(inHome&&active&&homeMode==='manual')void home.choose(i)
})
window.addEventListener('keydown',e=>{
  if(!inHome||!active||homeMode!=='manual'||(byId('setup-dialog') as HTMLDialogElement).open||(byId('presenter-dialog') as HTMLDialogElement).open)return
  if(['1','2','3'].includes(e.key)){e.preventDefault();void home.choose(Number(e.key)-1)}
})
const setupDialog=byId('setup-dialog') as HTMLDialogElement
const presenterDialog=byId('presenter-dialog') as HTMLDialogElement
byId('tools').onclick=()=>{
  if(active)stop('Setup opened. Pending actions canceled.')
  byId('live-home').hidden=!passed
  setupDialog.showModal()
}
byId('close-setup').onclick=()=>setupDialog.close()
byId('manual').onclick=()=>{setupDialog.close();void enterHome('manual')}
byId('live-home').onclick=()=>{setupDialog.close();void enterHome('erp')}
byId('recalibrate').onclick=()=>{
  setupDialog.close();if(active)stop('Starting a new calibration.')
  home.pause();inHome=false;reset();show(-1)
  names.forEach((name,i)=>{byId('label-'+i).textContent=name;byId('detail-'+i).textContent='';app.querySelector('[data-slot="'+i+'"]')?.setAttribute('aria-label',letters[i]+': '+name)})
  progress.hidden=false;practiceButton.hidden=false
  byId('stage').textContent='Headset setup';byId('instruction').textContent='Count faces on your letter'
  byId('detail').textContent='12 training rounds and 8 test rounds. Passing opens your home controls.'
  button.textContent='Start calibration';message('Start when the headset and wearer are ready.')
}
byId('load-profile').onclick=()=>{(byId('profile-file') as HTMLInputElement).click()}
byId('profile-file').onchange=async ()=>{
  const input=byId('profile-file') as HTMLInputElement,file=input.files?.[0]
  if(!file)return
  try{
    if(file.size>5_000_000)throw Error('This file is too large for a face-test results file.')
    const data=JSON.parse(await file.text())
    model=restorePictureProfile(data);passed=true
    rounds=data.training;testRounds=data.validation;results=data.results??[]
    byId('report').hidden=false;byId('live-home').hidden=false
    byId('setup-message').textContent='Passing results loaded. Keep the same wearer and headset fit. Choose Use headset when ready.'
  }catch(error){byId('setup-message').textContent=error instanceof Error?error.message:'Could not load results.'}
  finally{input.value=''}
}
byId('presenter').onclick=()=>{setupDialog.close();presenterDialog.showModal();void home.refresh().then(updateHomeStatus).catch(e=>message(e.message))}
byId('close-presenter').onclick=()=>presenterDialog.close()
for(const setting of ['hurricane','grid','internet'] as const)byId(setting).onclick=()=>void changeScenario(setting)
async function changeScenario(setting:string){
  try{
    await homeApi('scenario',{action:setting,value:setting==='reset'?true:!home.state?.scenario[setting as 'grid'|'internet'|'hurricane']})
    home.go();await home.refresh();updateHomeStatus()
  }catch(error){message(error instanceof Error?error.message:'Scenario unavailable.')}
}
byId('reset-home').onclick=()=>void changeScenario('reset')
for(const [id,action] of [['acknowledge','acknowledge'],['resolve-request','resolve'],['retry-request','retry']])byId(id).onclick=async ()=>{
  try{
    const request=home.state?.requests[0]
    if(request){await homeApi('request',{id:request.id,action});await home.refresh();updateHomeStatus()}
  }catch(error){message(error instanceof Error?error.message:'Request unavailable.')}
}
