
import './style.css'
import {HouseScene} from './scene'
import {FREQUENCIES,WINDOW_SAMPLES,WINDOW_MS,PREPARE_MS,TARGETS,CALIBRATION_TARGETS,VALIDATION_TARGETS,lampLevel,FrequencyGate,fitFrequency,type FrequencyProfile} from './frequency'
import type {State,Action,EEGPacket} from './types'
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const uid=()=>crypto.randomUUID()
let state:State,mode:'manual'|'ssvep'='ssvep',session:string=uid(),screen=0,focused=document.hasFocus(),connected=false,busy=false
let view='setup',device='bedroom.light',pending:{id:string;action:Action;title:string;expires:number}|null=null
let options:{label:string;detail:string;icon:string;run:()=>void}[]=[]
let notice='Choose a category, or connect your Unicorn for frequency selection.',speaking=localStorage.getItem('homeway.audio')!=='false',lastHurricane=false
let latest:EEGPacket|null=null,lastSeq=-1,lastEEG=0,profile:FrequencyProfile|null=null,gate=new FrequencyGate()
let phase:'off'|'waiting'|'calibration'|'validation'|'ready'|'paused'='waiting',trials:number[][][]=[],trial=0,nextSequence=0,trialAt=0,epochAt=0,epochSequence=0
function trialTargets(){return phase==='calibration'?CALIBRATION_TARGETS:VALIDATION_TARGETS}
function cue(){return trialTargets()[trial]}
let validationResults:boolean[]=[],animation=0,lastFrame=0,frameStart=0,frameCount=0,timingReady=false,keyboardChoice=0
let lastInteraction=performance.now(),armedAnnouncement=false,initialConnection=true
let comfortDepth=Number(localStorage.getItem('homeway.depth'))===.25?.25:.15,measurementAnnounced=false
document.querySelector('#app')!.innerHTML=`
<div class="demo-banner">LOCAL DEMONSTRATION <span>Home devices, weather and assistance requests are simulated</span></div>
<header><a class="brand" href="#">⌂ <b>homeway<span>YOUR HOME, WITHIN REACH</span></b></a><div class="header-right"><span id="input-label" class="badge">Manual control</span><button id="input-button">Connect headset</button><button id="settings-button" aria-label="Preferences">Preferences</button><button id="presenter-button">Presenter</button><button id="pause-targets" hidden>Pause targets</button></div></header>
<main><div id="alert" hidden class="alert"></div>
<div class="workspace"><section class="house-card"><div class="section-top"><div><p class="eyebrow">YOUR SPACE</p><h2>Home overview</h2></div><div class="segmented"><button id="view-3d" aria-pressed="true">3D view</button><button id="view-plan" aria-pressed="false">Floor plan</button></div></div><div id="scene"></div><div class="room-tabs" id="room-tabs"></div><div class="house-footer"><span id="grid-status"></span><span id="net-status"></span><span>All devices simulated</span></div></section>
<section class="control-card"><div class="section-top"><div><p class="eyebrow" id="breadcrumb">YOUR CONTROLS</p><h2 id="title">What would you like to do?</h2></div><span class="control-mark">✦</span></div><p id="subtitle" class="subtitle"></p><div id="options"></div><div class="status-box"><span class="status-dot"></span><p id="status" role="status" aria-live="polite"></p></div><div class="control-footer"><span id="input-hint">Click a choice · 1–3 selects in manual mode</span></div></section></div>
<section class="device-strip" id="device-strip" aria-label="Device status"></section>
<section class="assistance-summary" aria-label="Assistance status"><span class="eyebrow">ASSISTANCE</span><div id="requests" aria-live="polite"></div></section></main>
<dialog id="presenter-dialog" aria-labelledby="presenter-title"><div class="dialog-heading"><h2 id="presenter-title">Presenter tools</h2><button id="close-presenter">Close</button></div><div id="presenter"></div><section class="presenter-history"><h3>Recent activity</h3><div id="history"></div></section><div class="presenter-pagination"><button id="presenter-prev">Previous</button><span id="presenter-page"></span><button id="presenter-next">Next</button></div></dialog>
<dialog id="settings"><h2>Frequency selection</h2><label>Pulse contrast<select id="pulse-depth"><option value="0.15">Gentle (default)</option><option value="0.25">Stronger signal</option></select></label><label class="check"><input id="audio" type="checkbox" checked> Spoken cues and feedback</label><p>Focus on a flickering target to choose its option. Look at the rest cross between selections. Frequency scores are correlations, not probabilities.</p><p><strong>Flashing targets can trigger seizures.</strong> Do not use this mode with photosensitivity or visually triggered seizures. Stop immediately if uncomfortable. Manual mode has no flicker.</p><button id="close-settings" class="primary">Done</button></dialog>`

const scene=new HouseScene($('scene'))
function say(text:string){if(!speaking)return;window.speechSynthesis?.cancel();window.speechSynthesis?.speak(new SpeechSynthesisUtterance(text))}
function status(text:string){notice=text;if($('status').textContent!==text)$('status').textContent=text}
async function api(path:string,body?:unknown){const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(2000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Local service unavailable');return data}
function eegReady(){return latest?.ssvepState==='ready'&&performance.now()-lastEEG<900}
function ready(){return connected&&focused&&(mode==='manual'||phase==='ready'&&!!profile&&timingReady&&eegReady())&&!$<HTMLDialogElement>('settings').open&&!$<HTMLDialogElement>('presenter-dialog').open}
async function heartbeat(){const healthy=connected&&focused&&!$<HTMLDialogElement>('settings').open&&!$<HTMLDialogElement>('presenter-dialog').open&&(mode==='manual'||phase==='ready'&&!!profile&&eegReady());await api('session',{session,mode,screen,ready:healthy})}
function cancelPending(){if(pending)void api('cancel',{id:pending.id}).catch(()=>{});pending=null}
function go(next:string){cancelPending();view=next;render()}
function add(label:string,detail:string,icon:string,run:()=>void){options.push({label,detail,icon,run})}
function setManual(){cancelPending();mode='manual';session=uid();phase='off';profile=null;cancelAnimationFrame(animation);window.speechSynthesis?.cancel();status('Manual control. No targets are flashing.');view='home';render()}
function pause(reason:string){if(mode!=='ssvep')return;if(phase==='validation')profile=null;phase='paused';cancelPending();gate.reset();cancelAnimationFrame(animation);document.querySelectorAll<HTMLElement>('.frequency-patch').forEach(el=>el.style.opacity='0.55');status(reason);view='setup';void api('stop').catch(()=>{});render()}
async function execute(action:Action,title:string){if(busy||!ready())return;busy=true;try{await heartbeat();const result=await api('prepare',{session,screen,action});pending={id:result.id,action,title,expires:performance.now()+30000};view='review';render()}catch(e){status((e as Error).message)}finally{busy=false}}
async function confirm(){if(!pending||busy||!ready())return;busy=true;const command=pending;try{await heartbeat();const result=await api('commit',{id:command.id,session,screen,confirmed:true});pending=null;status(result.message);say(result.message);view='home';await pull();render()}catch(e){status((e as Error).message);go('home')}finally{busy=false}}
function choose(index:number){if(!ready()||busy||!options[index])return;lastInteraction=performance.now();gate.reset();options[index].run()}
function help(category:string){void execute({kind:'help',category},`Simulate ${category==='Emergency'?'an':'a'} ${category.toLowerCase()} request for Alex Morgan at 100 Demo Lane, Tampa (fictional). Wheelchair access and transfer assistance required.`)}
function render(){
 document.body.classList.toggle('frequency-active',mode==='ssvep')
 measurementAnnounced=false;screen++;gate.reset();keyboardChoice=0;armedAnnouncement=false;epochAt=performance.now();epochSequence=latest?.sequence??0;timingReady=false;options=[];cancelAnimationFrame(animation)
 $('input-label').textContent=mode==='manual'?'Manual control':phase==='ready'?'Live EEG · frequencies':phase==='paused'?'EEG paused':'Frequency setup'
 $('input-button').textContent=mode==='manual'?'Connect headset':'Use manual control'
 $('pause-targets').hidden=mode!=='ssvep'||!['ready','calibration','validation'].includes(phase)
 const titles:Record<string,string>={home:'What would you like to do?',assistance:'Who would you like to contact?',presets:'Choose your daily preset',control:'What would you like to control?',device:device==='door'?'Home security':device==='climate'?'Adjust the AC':'Bedroom lighting',review:'Is this correct?',setup:'Connect with frequencies'}
 $('title').textContent=titles[view]||titles.home
 $('breadcrumb').textContent=view==='home'?'THREE SIMPLE CHOICES':view==='review'?'CONFIRM YOUR ACTION':view.toUpperCase()
 $('subtitle').textContent=view==='review'?pending?.title||'Action expired.':view==='setup'?'Focus on a frequency target with your eyes open. Look at the rest cross between choices.':'Select a target directly. Every action is reviewed before it happens.'
 if(view==='setup'){
  if(phase==='calibration'||phase==='validation'){
   const expected=cue()
   const prompt=expected===-1?'Look at the rest cross. Do not focus on a flashing target.':`Look at the steady ${TARGETS[expected].name.toLowerCase()} center, number ${expected+1}. Do not follow the pulse.`
   $('subtitle').textContent=(phase==='calibration'?'Calibration':'Independent validation')+` · ${trial+1} of ${trialTargets().length}. `+prompt
   for(let i=0;i<TARGETS.length;i++)add(TARGETS[i].name,'',String(i+1),()=>{})
  }else{
   $('subtitle').innerHTML='<strong>Flashing targets can trigger seizures.</strong> Do not use with photosensitivity or visually triggered seizures. Stop immediately if uncomfortable. Manual mode has no flicker. Use a 60 Hz or faster display and keep this window in the foreground.'
   if(phase==='paused'&&profile)add('Resume frequency control','Keep your gaze at the rest cross to rearm','▶',()=>{phase='ready';lastInteraction=performance.now();view='home';render()})
   add(phase==='waiting'?'Waiting for headset…':'Calibrate frequency selection',phase==='waiting'?'Calibration starts automatically when live EEG is ready':'Measure three lamps and rest, then run independent validation','◉',()=>startCalibration())
   add('Use manual control','No flickering targets','⌨',()=>setManual())
  }
 }else if(view==='review'){
  add('Incorrect — go Home','Cancel and return Home','⌂',()=>go('home'))
  add('Confirm','Apply the action shown above','✓',()=>void confirm())
 }else if(view==='home'){
  add('Assistance','Caregiver or emergency services','♡',()=>go('assistance'))
  add('Presets','Sleep or wake up','☼',()=>go('presets'))
  add('Control','Lights, AC and security','⌂',()=>go('control'))
 }else if(view==='assistance'){
  add('Caregiver','Simulated request to your support contact','♡',()=>help('Caregiver'))
  add('Emergency services','Simulated request only · no real call','✚',()=>help('Emergency'))
 }else if(view==='presets'){
  add('Sleep','Lights off · blinds closed · AC target 72°F','☾',()=>void execute({kind:'routine',name:'sleep'},'Sleep preset: bedroom lights off, blinds closed and AC target 72°F. Door lock and bed stay unchanged.'))
  add('Wake up','Lights on · blinds open · AC target 74°F','☼',()=>void execute({kind:'routine',name:'morning'},'Wake up preset: bedroom lights on, blinds open and AC target 74°F. Door lock and bed stay unchanged.'))
 }else if(view==='control'){
  add('Lights','Bedroom light · on or off','☼',()=>{device='bedroom.light';go('device')})
  add('AC','Cooler or warmer','♧',()=>{device='climate';go('device')})
  add('Security','Lock or unlock the front door','⌑',()=>{device='door';go('device')})
 }else if(view==='device'){
  if(device==='bedroom.light')for(const [value,label] of [[100,'On'],[0,'Off']] as const)add(label,'Bedroom light','☼',()=>void execute({kind:'set',target:device,value},`Turn the bedroom light ${label.toLowerCase()}?`))
  else if(device==='climate'){
   const d=state.devices.climate
   add('Cooler','Lower AC target by 1°F','−',()=>void execute({kind:'set',target:'climate',value:Math.max(60,d.target-1),mode:'cool'},`Lower AC target from ${d.target}°F to ${Math.max(60,d.target-1)}°F in cooling mode?`))
   add('Warmer','Raise AC target by 1°F','+',()=>void execute({kind:'set',target:'climate',value:Math.min(85,d.target+1),mode:'cool'},`Raise AC target from ${d.target}°F to ${Math.min(85,d.target+1)}°F? The AC will cool less; heating is not enabled.`))
  }else for(const [value,label] of [[1,'Lock'],[0,'Unlock']] as const)add(label,'Simulated front door','⌑',()=>void execute({kind:'set',target:'door',value},`${label} the simulated front door?`))
 }
 if(!['home','setup','review','control'].includes(view))add('Home','Return without changing anything','⌂',()=>go('home'))
 document.body.dataset.view=view;document.body.dataset.phase=phase;
 const signalBoard=view!=='setup'||phase==='calibration'||phase==='validation'
 $('options').classList.toggle('signal-board',signalBoard)
 document.body.classList.toggle('live-board',mode==='ssvep'&&signalBoard)
 $('options').classList.toggle('frequency-layout',signalBoard)
 $('options').innerHTML=options.map((o,i)=>`<button class="option" data-option="${i}" style="--target-rgb:${TARGETS[i].rgb}"><span class="frequency-patch" aria-hidden="true"><span class="target-center">${i+1}</span></span><span class="option-icon">${o.icon}</span><span><strong>${esc(o.label)}</strong><small>${esc(o.detail)}</small></span><span class="frequency-label">${mode==='ssvep'?TARGETS[i].name:i+1}</span></button>`).join('')
 if(mode==='ssvep'&&signalBoard)$('options').insertAdjacentHTML('beforeend','<div class="rest-target" aria-label="Steady rest cross"><b>+</b><span>REST</span></div>')

 $('options').querySelectorAll<HTMLButtonElement>('[data-option]').forEach((b,i)=>b.onclick=()=>{if(phase==='calibration'||phase==='validation')return;if(view==='setup')options[i].run();else if(mode==='manual')choose(i);else status('Live frequency control is active. Focus on the target, or switch to manual control.')})
 $('status').textContent=notice
 $('input-hint').textContent=mode==='manual'?'Click an option · keys 1–3 select · Escape returns Home':'Look at a target to select · rest at + between choices · Escape stops flicker'
 if(view==='setup'&&(phase==='calibration'||phase==='validation')){const expected=cue();if(expected<0)document.querySelector('.rest-target')?.classList.add('cued');else document.querySelector(`[data-option="${expected}"]`)?.classList.add('calibration-focus')}
 if(mode==='ssvep'&&['ready','calibration','validation'].includes(phase))startFlicker()
 void heartbeat().catch(()=>{})
}
function signalMessage(){
 if(latest?.error)return latest.error
 if(latest?.ssvepState==='settling')return `Headset connected. Letting the signal settle… ${latest.settlingSeconds} s remaining.`
 if(latest?.signalIssues?.length)return latest.signalIssues.join(' ')
 if(latest?.ssvepState==='warming')return `Receiving EEG: ${latest.bufferedSamples??0} / ${WINDOW_SAMPLES} consecutive valid samples. Calibration will start automatically.`
 if(latest?.ssvepState==='contact')return 'Check both L/R sticky pads and scalp contact at rear electrodes 6–8.'
 return 'Headset mode is waiting for live EEG. Keep Start Unicorn.cmd open.'
}
function readerMatches(){return latest?.windowSamples===WINDOW_SAMPLES&&latest.frequencies?.length===FREQUENCIES.length&&latest.frequencies.every((f,i)=>Math.abs(f-FREQUENCIES[i])<.001)}
function startCalibration(){
 if(latest?.ssvepState==='ready'&&!readerMatches()){status('Restart Start Unicorn.cmd to load the three-lamp reader, then refresh this page.');return}
 if(latest?.ssvepState!=='ready'){mode='ssvep';phase='waiting';view='setup';status(signalMessage());render();return}
 if(!focused||document.hidden||$<HTMLDialogElement>('settings').open||$<HTMLDialogElement>('presenter-dialog').open)return;
 mode='ssvep';session=uid();profile=null;phase='calibration';trials=CALIBRATION_TARGETS.map(()=>[]);trial=0;validationResults=[];beginTrial()
}
function beginTrial(){trialAt=performance.now();nextSequence=(latest?.sequence??0)+WINDOW_SAMPLES;render();const expected=cue();say(expected<0?'Take a breath and look at the rest cross.':'Get comfortable. Look at the '+TARGETS[expected].name.toLowerCase()+' center, number '+(expected+1));if(phase==='validation')gate.reset(false)}
function startFlicker(){
 let previous=0;lastFrame=0;frameStart=performance.now();frameCount=0
 const targets=Array.from(document.querySelectorAll<HTMLElement>('.frequency-patch'))
 const frame=(now:number)=>{
  if(mode!=='ssvep'||!['ready','calibration','validation'].includes(phase))return
  if(!focused||document.hidden){pause('Control paused because this window lost focus.');return}
  if(targets.some(target=>{const rect=target.getBoundingClientRect();return rect.top<0||rect.bottom>innerHeight||rect.left<0||rect.right>innerWidth})){pause('All frequency targets must be visible. Restore the window size and resume.');return}
  frameCount++;const elapsed=now-frameStart
  if((previous&&now-previous>120)||(elapsed>=1100&&frameCount*1000/elapsed<50)){pause('Display timing interrupted. Use a 60 Hz or faster foreground display, then resume.');return}
  previous=now;lastFrame=now
  if(elapsed>=1100){timingReady=true;frameStart=now;frameCount=0}
  const stimulusTime=now-epochAt-PREPARE_MS
  targets.forEach((target,i)=>target.style.setProperty('--pulse',String(lampLevel(i,stimulusTime,phase==='calibration'?cue():null,comfortDepth))))
  if(stimulusTime>=0&&!measurementAnnounced){
   measurementAnnounced=true
   const instruction=phase==='ready'?'Look at the rest cross until ready.':cue()<0?'Keep looking at the rest cross. Measuring rest.':'Keep looking at lamp '+(cue()+1)+'. Measuring now.'
   status(instruction);say(instruction)
  }
  if(stimulusTime<0)status('Take a breath. Pulses begin in '+Math.max(1,Math.ceil(-stimulusTime/1000))+' seconds.')
  animation=requestAnimationFrame(frame)
 };animation=requestAnimationFrame(frame)
}
async function pollEEG(){
 try{
  const data:EEGPacket=await api('eeg');latest=data
  if(initialConnection){initialConnection=false;if(!data.live){setManual();return}}
  if(mode==='ssvep'&&phase==='waiting'){if(data.ssvepState==='ready'&&focused&&!document.hidden){lastSeq=data.sequence;lastEEG=performance.now();startCalibration()}else status(data.ssvepState==='ready'?'Bring this app to the foreground to start calibration.':signalMessage());return}
  if(data.sequence===lastSeq)return
  lastSeq=data.sequence;lastEEG=performance.now()
  if(mode!=='ssvep'||phase==='paused')return
  const now=performance.now()
  if(data.ssvepState!=='ready'||!data.scores){pause('Frequency control paused. '+signalMessage());return}
  if(!readerMatches()){pause('Restart Start Unicorn.cmd to load the matching frequency reader, then refresh this page.');return}
  if(!timingReady||now-epochAt<PREPARE_MS+WINDOW_MS+300||data.sequence-epochSequence<WINDOW_SAMPLES)return
  if(phase==='calibration'){
   if(data.sequence<nextSequence)return
   trials[trial].push(data.scores);nextSequence=data.sequence+WINDOW_SAMPLES
   status(`Measuring ${cue()<0?'rest':'target '+(trial+1)}: ${trials[trial].length} of 3 independent windows.`)
   if(trials[trial].length===3){trial++;if(trial===CALIBRATION_TARGETS.length){profile=fitFrequency(trials);if(!profile){phase='paused';status('Targets did not reliably separate from rest. Check contact and retry calibration.');render();return}phase='validation';trial=0}beginTrial()}
  }else if(phase==='validation'&&profile){
   const expected=VALIDATION_TARGETS[trial],choice=gate.observe(data.scores,profile,now,FREQUENCIES.length)
   if(choice!==null){validationResults.push(choice===expected);if(choice!==expected){phase='paused';profile=null;status('Lamp '+(choice+1)+' registered while '+(expected<0?'resting':'testing lamp '+(expected+1))+'. Recalibrate before use.');render();return}nextValidation()}
   else if(now-trialAt>(VALIDATION_TARGETS[trial]===-1?PREPARE_MS+WINDOW_MS+6000:PREPARE_MS+20000)){if(expected!==-1){phase='paused';profile=null;status('Lamp '+(expected+1)+' ('+TARGETS[expected].name+') did not register. Check rear contact and recalibrate.');render();return}validationResults.push(true);nextValidation()}
  }else if(phase==='ready'&&profile&&ready()){
   const index=gate.observe(data.scores,profile,now,options.length)
   if(gate.armed&&!armedAnnouncement){armedAnnouncement=true;status('Ready. Focus on your choice.');say('Ready')}
   if(index!==null)choose(index)
  }
 }catch{if(mode==='ssvep'&&phase==='waiting')status('Waiting for the local Unicorn reader to start…');else if(mode==='ssvep'&&phase!=='paused')pause('EEG reader unavailable. Restore the local connection, then resume.')}
}
function nextValidation(){trial++;if(trial===VALIDATION_TARGETS.length){phase='ready';lastInteraction=performance.now();status('Validation passed: '+validationResults.filter(Boolean).length+' of '+validationResults.length+' trials. Rest at + to arm.');say('Validation passed. Look at the rest cross.');view='home';render()}else beginTrial()}
async function request(id:string,action:string){try{await api('request',{id,action});await pull()}catch(e){status((e as Error).message)}}
function updateData(){
  scene.update(state)
  $('grid-status').textContent=state.scenario.grid?'● Grid available':'○ Grid outage · backup lights only'
  $('net-status').textContent=state.scenario.internet?'● External connection available':'○ External connection unavailable'
  $('alert').hidden=!state.scenario.hurricane;$('alert').innerHTML='<strong>Simulated hurricane alert · Tampa Bay</strong><span>Review your saved support plan through Assistance. No evacuation order or live weather data.</span>'
  const d=state.devices;$('device-strip').innerHTML=[['☼','Bedroom light',d['bedroom.light'].value?'On':'Off'],['♧','AC',d.climate.value.toFixed(1)+' °F · target '+d.climate.target+'°'],['▤','Bedroom blinds',Math.round(d['bedroom.blind'].value)+'% open'],['⌑','Front door',d.door.value?'Locked':'Unlocked']].map(([i,t,v])=>`<div><span class="strip-icon">${i}</span><span><small>${t}</small><strong>${v}</strong></span></div>`).join('')
  const latestRequest=state.requests[0]
  $('requests').innerHTML=latestRequest?`<strong>${esc(latestRequest.category)}</strong><span class="badge">${esc(latestRequest.status)}</span><span class="summary-extra">${state.requests.length>1?`+${state.requests.length-1} earlier request(s)`: 'Simulated request'}</span>`:'<span>No active request. Assistance is available from Home.</span>'
  updatePresenter()

}
let presenterPage=0,presenterSignature=''
function updatePresenter(){
 if(!state)return
 const pages=Math.max(1,Math.ceil(state.requests.length/2),Math.ceil(state.history.length/2))
 presenterPage=Math.min(presenterPage,pages-1)
 const signature=JSON.stringify([state.scenario,state.requests,state.history.slice(presenterPage*2,presenterPage*2+2),presenterPage,state.devices.bed.available])
 if(signature===presenterSignature)return
 presenterSignature=signature
 $('presenter').innerHTML=`<div class="scenario-buttons"><button data-scenario="hurricane">${state.scenario.hurricane?'Clear':'Trigger'} hurricane</button><button data-scenario="internet">${state.scenario.internet?'Disconnect':'Restore'} internet</button><button data-scenario="grid">${state.scenario.grid?'Grid outage':'Restore grid'}</button><button id="reset">Reset demo</button></div><p class="muted">All requests and responses stay on this laptop.</p>`+state.requests.slice(presenterPage*2,presenterPage*2+2).map(r=>`<div class="presenter-request"><strong>${esc(r.category)} · ${esc(r.status)}</strong>${r.status==='delivered'?`<button data-request="${r.id}" data-action="acknowledge">Acknowledge</button>`:''}${['acknowledged','cancellation requested'].includes(r.status)?`<button data-request="${r.id}" data-action="resolve">Resolve</button>`:''}${r.status==='failed'?`<button data-request="${r.id}" data-action="retry">Retry</button>`:''}${!['resolved','canceled','cancellation requested'].includes(r.status)?`<button data-request="${r.id}" data-action="cancel">Cancel request</button>`:''}</div>`).join('')
 $('presenter').querySelectorAll<HTMLButtonElement>('[data-scenario]').forEach(b=>b.onclick=()=>void scenario(b.dataset.scenario!,!state.scenario[b.dataset.scenario as keyof State['scenario']]))
 $('reset').onclick=()=>{presenterPage=0;void scenario('reset',true)}
 $('presenter').querySelectorAll<HTMLButtonElement>('[data-request]').forEach(b=>b.onclick=()=>void request(b.dataset.request!,b.dataset.action!))
 $('history').innerHTML=state.history.slice(presenterPage*2,presenterPage*2+2).map(e=>`<div class="event"><div>${esc(e.text)}<small>${esc(e.source)}</small></div></div>`).join('')
 $('presenter-page').textContent=`Page ${presenterPage+1} of ${pages}`
 $<HTMLButtonElement>('presenter-prev').disabled=presenterPage===0;$<HTMLButtonElement>('presenter-next').disabled=presenterPage===pages-1
}
async function scenario(action:string,value:boolean,target?:string){try{await api('scenario',{action,value,target});cancelPending();view='home';await pull();render()}catch(e){status((e as Error).message)}}
async function pull(){try{const next:State=await api('state');const first=!state;if(!next.devices?.door)throw Error('An older Homeway server is running. Close its window and restart Start Unicorn.cmd.');connected=true;state=next;if(first)render();if(state.scenario.hurricane!==lastHurricane){lastHurricane=state.scenario.hurricane;cancelPending();status(lastHurricane?'Simulated hurricane alert. Assistance is available from Home.':'Simulated hurricane alert cleared.');if(mode==='manual'||phase==='ready')go('home')}updateData()}catch(error){connected=false;gate.reset();status((error as Error).message||'Local service unavailable. Controls paused; displayed values are last known.')}}

$('pause-targets').onclick=()=>pause('Targets paused. Rest your eyes; resume only when comfortable.')
$<HTMLSelectElement>('pulse-depth').value=String(comfortDepth)
$('pulse-depth').onchange=()=>{comfortDepth=Number($<HTMLSelectElement>('pulse-depth').value);localStorage.setItem('homeway.depth',String(comfortDepth));if(mode==='ssvep'){profile=null;phase='waiting';view='setup';status('Pulse contrast changed. Recalibration will begin after closing Preferences.');render()}}
$('input-button').onclick=()=>{if(mode==='ssvep')setManual();else{view='setup';render()}}
$('view-3d').onclick=()=>{scene.plan(false);$('view-3d').setAttribute('aria-pressed','true');$('view-plan').setAttribute('aria-pressed','false')}
$('view-plan').onclick=()=>{scene.plan(true);$('view-plan').setAttribute('aria-pressed','true');$('view-3d').setAttribute('aria-pressed','false')}
$('presenter-button').onclick=()=>{if(mode==='ssvep')pause('Presenter tools opened. Resume when ready.');else{cancelPending();view='home';render()}$<HTMLDialogElement>('presenter-dialog').showModal();updatePresenter()}
$('close-presenter').onclick=()=>$<HTMLDialogElement>('presenter-dialog').close()
$('presenter-prev').onclick=()=>{presenterPage=Math.max(0,presenterPage-1);presenterSignature='';updatePresenter()}
$('presenter-next').onclick=()=>{presenterPage++;presenterSignature='';updatePresenter()}
$('settings-button').onclick=()=>{if(mode==='ssvep')pause('Preferences opened. Resume when ready.');$<HTMLDialogElement>('settings').showModal()}
$('close-settings').onclick=()=>$<HTMLDialogElement>('settings').close()
$('audio').onchange=()=>{speaking=$<HTMLInputElement>('audio').checked;localStorage.setItem('homeway.audio',String(speaking));if(!speaking)window.speechSynthesis?.cancel()}
$<HTMLInputElement>('audio').checked=speaking
window.addEventListener('blur',()=>{focused=false;if(mode==='ssvep'&&phase!=='paused')pause('Frequency selection paused when this window lost focus.');if(mode==='manual'&&pending){cancelPending();view='home';render()}else cancelPending();void heartbeat().catch(()=>{})})
window.addEventListener('focus',()=>{focused=true})
document.addEventListener('visibilitychange',()=>{focused=!document.hidden&&document.hasFocus();if(!focused&&mode==='ssvep'&&phase!=='paused')pause('Frequency selection paused in the background.')})
window.addEventListener('keydown',e=>{
 if(e.key==='Escape'){if($<HTMLDialogElement>('settings').open||$<HTMLDialogElement>('presenter-dialog').open)return;e.preventDefault();if(mode==='ssvep')pause('Frequency targets stopped. Resume or use manual control.');else go('home');return}
 if(mode!=='manual'||e.repeat||$<HTMLDialogElement>('settings').open||$<HTMLDialogElement>('presenter-dialog').open)return
 if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return
 if(/^[1-3]$/.test(e.key)){e.preventDefault();choose(Number(e.key)-1)}
 if(e.code==='Space'){e.preventDefault();keyboardChoice=(keyboardChoice+1)%Math.max(options.length,1);document.querySelectorAll('.option').forEach((el,i)=>el.classList.toggle('scanning',i===keyboardChoice))}
 if(e.key==='Enter'&&e.target===document.body){e.preventDefault();choose(keyboardChoice)}
})
setInterval(()=>{void heartbeat().catch(()=>{});if(pending&&performance.now()>pending.expires){status('Confirmation expired. Please choose again.');go('home')}if(mode==='ssvep'&&phase!=='paused'&&phase!=='waiting'&&(performance.now()-lastEEG>1000))pause('EEG stream stopped. Check the headset and restart the reader if needed.');if(mode==='ssvep'&&phase==='ready'&&performance.now()-lastInteraction>120000)pause('Frequency control paused after inactivity.')},250)
async function cycle(){await pull();await pollEEG();setTimeout(()=>void cycle(),180)}
void cycle()
