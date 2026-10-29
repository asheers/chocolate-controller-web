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
// Preserve the existing song-only helper API.
export function loadSongs(){return loadData().songs;}
export function saveSongs(songs){saveData(songs,loadData().catalogue??[]);}
export function exportSongs(songs){return JSON.stringify(validateSongs(songs),null,2);}
export function importSongs(text){return importData(text).songs;}
