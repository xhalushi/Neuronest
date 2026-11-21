export type Device={kind:string;room:string;value:number;target:number;mode?:string;available:boolean;backup:boolean;moving:boolean}
export type RequestRecord={id:string;category:string;status:string;created:number;resident:string;address:string;needs:string}
export type State={revision:number;devices:Record<string,Device>;scenario:{internet:boolean;grid:boolean;hurricane:boolean};requests:RequestRecord[];history:{id:string;text:string;source:string;at:number}[]}
export type Action={kind:string;target?:string;value?:number;mode?:string;category?:string;name?:string}
export type EEGPacket={state:string;ssvepState?:string;settlingSeconds?:number;scores?:number[];frequencies?:number[];windowSamples?:number;bufferedSamples?:number;invalidSamples?:number;signalIssues?:string[];sequence:number;powers:Record<string,number>;issues:string[];error:string;battery?:number;live:boolean}
