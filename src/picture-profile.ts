import {train,predict,type PictureModel,type Round} from './picture-decoder.ts'

// Recompute the saved session, rather than trusting an editable "passed" flag
// or accepting model weights from a file. No test data enters model fitting.
export function restorePictureProfile(value:unknown):PictureModel {
  const data=value as {version?:number;training?:Round[];validation?:Round[]}
  if(data?.version!==2 || !Array.isArray(data.training)||data.training.length!==12 ||
    !Array.isArray(data.validation)||data.validation.length!==8)
    throw Error('Choose a saved passing face-test results file from this version.')
  for(const target of [-1,0,1,2])
    if(data.validation.filter(r=>r.target===target).length!==2)throw Error('The saved test is incomplete.')
  try{
    const model=train(data.training)
    if(data.validation.some(r=>predict(model,r.cues)!==r.target))throw Error('Failed validation')
    return model
  }catch{throw Error('The saved recordings do not pass all six choices and both rest tests. Calibrate again.')}
}
