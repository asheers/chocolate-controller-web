import {validateSongs,samples} from './model.js';
import {validateCatalogue} from './catalogue.js';
export const DATA_KEY='chocolate.data.v2';
const LEGACY_KEY='chocolate.songs.v1';
export function importData(text){
  const data=JSON.parse(text);
  if(Array.isArray(data))return {songs:validateSongs(data),catalogue:null};
  if(!data || data.format!=='chocolate-controller/2')throw Error('Unsupported controller JSON format.');
  return {songs:validateSongs(data.songs),catalogue:validateCatalogue(data.catalogue)};
}
export function loadData(){
  const saved=localStorage.getItem(DATA_KEY);
  if(saved!==null){const data=importData(saved);return {...data,catalogue:data.catalogue??[]};}
  const legacy=localStorage.getItem(LEGACY_KEY);
  return {songs:legacy===null?structuredClone(samples):validateSongs(JSON.parse(legacy)),catalogue:[]};
}
export function exportData(songs,catalogue){return JSON.stringify({format:'chocolate-controller/2',songs:validateSongs(songs),catalogue:validateCatalogue(catalogue)},null,2);}
export function saveData(songs,catalogue){localStorage.setItem(DATA_KEY,exportData(songs,catalogue));}
export function rawSavedData(){return localStorage.getItem(DATA_KEY)??localStorage.getItem(LEGACY_KEY);}
// Separate from DATA_KEY so older builds keep reading songs and catalogue unchanged.
export const RECONCILE_KEY='chocolate.reconcile.last';
// Damaged reconciliation data must never stop the controller from loading.
export function loadReconciliation(){
  try{
    const r=JSON.parse(localStorage.getItem(RECONCILE_KEY)),valid=list=>Array.isArray(list)?list.filter(f=>f&&typeof f.songId==='string'&&Number.isInteger(f.index)):[];
    const u=r?.undo;
    return {flags:valid(r?.flags),undo:typeof u?.before==='string'&&typeof u.after==='string'?{before:u.before,after:u.after,beforeFlags:valid(u.beforeFlags)}:null};
  }catch{return {flags:[],undo:null};}
}
// Record first: a save without an undo record could not be reversed. A failed save restores the prior record.
export function recordReconciliation(record,save){
  const prior=localStorage.getItem(RECONCILE_KEY);
  localStorage.setItem(RECONCILE_KEY,JSON.stringify(record));
  try{save();}catch(error){if(prior===null)localStorage.removeItem(RECONCILE_KEY);else localStorage.setItem(RECONCILE_KEY,prior);throw error;}
}
// Compares saved data, not memory, because TEST and LIVE share this storage.
export function undoProblem(undo){
  return undo&&rawSavedData()!==undo.after?'Undo unavailable: songs or the patch catalogue have changed since this reconciliation, and undoing would overwrite those changes.':'';
}
export function undoReconciliation(save){
  const {undo}=loadReconciliation();
  if(!undo)throw Error('Nothing to undo.');
  const problem=undoProblem(undo);
  if(problem)throw Error(problem);
  save(importData(undo.before));
  localStorage.setItem(RECONCILE_KEY,JSON.stringify({flags:undo.beforeFlags,undo:null}));
}
// Acknowledges one warning only. Also removed from the undo copy so Undo cannot bring it back.
export function dismissFlag(flag){
  const same=f=>['songId','index','label','bank','slot','kind','name'].every(key=>f[key]===flag[key]);
  const {flags,undo}=loadReconciliation();
  localStorage.setItem(RECONCILE_KEY,JSON.stringify({flags:flags.filter(f=>!same(f)),undo:undo&&{...undo,beforeFlags:undo.beforeFlags.filter(f=>!same(f))}}));
}
// Preserve the existing song-only helper API.
export function loadSongs(){return loadData().songs;}
export function saveSongs(songs){saveData(songs,loadData().catalogue??[]);}
export function exportSongs(songs){return JSON.stringify(validateSongs(songs),null,2);}
export function importSongs(text){return importData(text).songs;}
