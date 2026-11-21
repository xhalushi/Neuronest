import type {Action,State} from './types'

export type HomeOption={label:string;detail:string;cue:string;action?:Action;view?:string;device?:string;confirm?:boolean}
type Pending={id:string;title:string;expires:number}
export type CommandReceipt={tone:'success'|'warning'|'error';title:string;detail:string}
export type HomeAPI=(path:string,body?:unknown)=>Promise<any>
export class HomeController {
  state:State|null=null
  view='home'
  device='bedroom.light'
  pending:Pending|null=null
  screen=0
  session=crypto.randomUUID()
  mode:'manual'|'erp'='erp'
  enabled=false
  busy=false
  private operation=0
  private api:HomeAPI
  private render:()=>void
  private feedback:(message:string)=>void
  private completed:(receipt:CommandReceipt)=>Promise<void>
  constructor(api:HomeAPI,render:()=>void,feedback:(message:string)=>void,completed:(receipt:CommandReceipt)=>Promise<void>=async()=>{}){this.api=api;this.render=render;this.feedback=feedback;this.completed=completed}
  get title(){return ({home:'Make yourself at home',assistance:'Who can help?',presets:'Set the mood',control:'Your room, your way',appliances:'Choose an appliance',device:this.device==='climate'?'Find your comfort':this.device==='bedroom.tv'?'Television':this.device==='bedroom.blind'?'Let the daylight in':'Bedroom lighting',review:'Ready to make it happen?'})[this.view]??'Your room'}
  get detail(){return this.pending?.title??'Count the faces on the letter above your choice. Look at + to make no selection.'}
  get options():HomeOption[]{
    const back={label:'Home',detail:'Return without a change',cue:'home',view:'home'}
    if(this.view==='review')return [
      {label:'Incorrect · Home',detail:'Cancel this action',cue:'cancel',view:'home'},
      {label:'Confirm',detail:'Apply the action above',cue:'confirm',confirm:true},
      {label:'Wait',detail:'Keep reviewing this action',cue:'wait'}]
    if(this.view==='assistance')return [
      {label:'Caregiver',detail:'Simulated support request',cue:'caregiver',action:{kind:'help',category:'Caregiver'}},
      {label:'Emergency',detail:'Simulation · no real call',cue:'emergency',action:{kind:'help',category:'Emergency'}},back]
    if(this.view==='presets')return [
      {label:'Sleep',detail:'Lights & TV off · blinds down',cue:'sleep',action:{kind:'routine',name:'sleep'}},
      {label:'Wake up',detail:'Lights on · blinds open · AC 74°F',cue:'wake',action:{kind:'routine',name:'morning'}},back]
    if(this.view==='control')return [
      {label:'Lights',detail:'Bedroom · on or off',cue:'lights-menu',view:'device',device:'bedroom.light'},
      {label:'AC',detail:'Cooler or warmer',cue:'ac-menu',view:'device',device:'climate'},
      {label:'Appliances',detail:'TV & window blinds',cue:'appliances',view:'appliances'}]
    if(this.view==='appliances')return [
      {label:'TV',detail:'Your screen · on or off',cue:'tv',view:'device',device:'bedroom.tv'},
      {label:'Blinds',detail:'Open up or wind down',cue:'blinds',view:'device',device:'bedroom.blind'},back]
    if(this.view==='device'){
      if(this.device==='climate'){
        const target=this.state?.devices.climate.target??72
        return [
          {label:'Cooler',detail:'Lower the target by 1°F',cue:'cooler',action:{kind:'set',target:'climate',value:Math.max(60,target-1),mode:'cool'}},
          {label:'Warmer',detail:'Raise the target by 1°F',cue:'warmer',action:{kind:'set',target:'climate',value:Math.min(85,target+1),mode:'cool'}},back]
      }
      if(this.device==='bedroom.blind')return [
        {label:'Up',detail:'Raise the blinds fully',cue:'blinds-up',action:{kind:'set',target:this.device,value:100}},
        {label:'Down',detail:'Lower the blinds fully',cue:'blinds-down',action:{kind:'set',target:this.device,value:0}},back]
      const tv=this.device==='bedroom.tv'
      return [
        {label:'On',detail:tv?'Turn on the TV':'Turn the bedroom light on',cue:tv?'tv-on':'light-on',action:{kind:'set',target:this.device,value:tv?1:100}},
        {label:'Off',detail:tv?'Turn off the TV':'Turn the bedroom light off',cue:tv?'tv-off':'light-off',action:{kind:'set',target:this.device,value:0}},back]
    }
    return [
      {label:'Assistance',detail:'Caregiver or emergency help',cue:'assistance',view:'assistance'},
      {label:'Presets',detail:'Sleep or wake up',cue:'presets',view:'presets'},
      {label:'Control',detail:'Lights · AC · appliances',cue:'control',view:'control'}]
  }
  async heartbeat(){await this.api('session',{session:this.session,screen:this.screen,mode:this.mode,ready:this.enabled})}
  cancel(){
    this.operation++
    if(this.pending)void this.api('cancel',{id:this.pending.id}).catch(()=>{})
    this.pending=null
  }
  go(view='home'){
    this.cancel();this.view=view;this.screen++;this.render()
  }
  pause(){this.enabled=false;this.go();void this.heartbeat().catch(()=>{})}
  async refresh(){
    const state:State=await this.api('state')
    if(!state.devices?.['bedroom.tv'])throw Error('Close the old launcher and restart Neuronest to load the bedroom appliances.')
    const changed=this.state && JSON.stringify(state.scenario)!==JSON.stringify(this.state.scenario)
    this.state=state
    if(changed){this.go();this.feedback(state.scenario.hurricane?'Simulated hurricane alert. Assistance is available from Home.':'Home conditions changed. Any pending action was canceled.')}
    const expired=!!this.pending && performance.now()>this.pending.expires
    if(expired){this.go();this.feedback('Confirmation expired. Choose the action again.')}
    return !!changed||expired
  }
  async choose(index:number){
    if(!this.enabled||this.busy||!this.state)return
    const option=this.options[index]
    if(!option)return
    if(option.view){if(option.device)this.device=option.device;this.go(option.view);return}
    if(!option.action&&!option.confirm){this.feedback('Waiting. Count Confirm when ready, or choose Home to cancel.');return}
    this.busy=true
    const operation=this.operation
    try{
      await this.heartbeat()
      if(operation!==this.operation||!this.enabled)return
      if(option.confirm){
        const pending=this.pending
        if(!pending)return
        const result=await this.api('commit',{id:pending.id,session:this.session,screen:this.screen,confirmed:true})
        if(operation!==this.operation)return
        this.pending=null;this.go()
        const receipt:CommandReceipt=result.receipt??{tone:'success',title:'Command sent',detail:'Your confirmed command was accepted.'}
        this.feedback(receipt.title+'. '+receipt.detail)
        // Commit has succeeded even if the following status refresh fails.
        await this.refresh().catch(()=>{})
        this.render()
        await this.completed(receipt)
      }else{
        const result=await this.api('prepare',{session:this.session,screen:this.screen,action:option.action})
        if(operation!==this.operation||!this.enabled){await this.api('cancel',{id:result.id});return}
        const action=option.action!
        const title=action.kind==='help'?`Send a simulated ${action.category?.toLowerCase()} request? No real call will be made.`:
          action.kind==='routine'?(action.name==='sleep'?'Sleep preset: lights and TV off, blinds down, AC target 72°F?':'Wake-up preset: lights on, blinds up, AC target 74°F?'):
          action.target==='climate'?`Set the AC target to ${action.value}°F? Cooling mode.`:
          action.target==='bedroom.tv'?`Turn the television ${option.label.toLowerCase()}?`:
          action.target==='bedroom.blind'?`${action.value?'Raise':'Lower'} the bedroom blinds all the way?`:`Turn the bedroom light ${option.label.toLowerCase()}?`
        this.pending={id:result.id,title,expires:performance.now()+(result.expiresInSeconds??30)*1000}
        this.view='review';this.screen++;this.render()
      }
    }catch(error){
      if(operation===this.operation){this.go();this.feedback(error instanceof Error?error.message:'Home service unavailable.')}
    }finally{this.busy=false}
  }
}
