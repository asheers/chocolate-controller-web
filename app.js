import {Controller,samples,validateSongs} from './model.js';
import {loadData,saveData,exportData,importData,rawSavedData} from './storage.js';
import {catalogueFromEntries,mergeCatalogue} from './catalogue.js';
import {readZip} from './zip-reader.js';
import {addPatchPicker} from './patch-picker.js';
import {Midi,hex} from './midi.js';
const $=id=>document.getElementById(id);
const notice=message=>$('notice').textContent=message;
const log=message=>{$('log').textContent=(new Date().toLocaleTimeString()+' '+message+'\n'+$('log').textContent).split('\n').slice(0,60).join('\n');};
let songs=[],catalogue=[],loadFailed=false;
try{({songs,catalogue}=loadData());}catch(error){loadFailed=true;notice('Saved data could not be read. Export or repair it before saving new songs. '+error.message);}
const controller=new Controller(songs,messages=>{if($('simulation').checked)log('SIM '+messages.map(hex).join(' / '));else midi.send(messages);});
const midi=new Midi(log,data=>{controller.receive(data);render();},devices);
function safe(action){return async()=>{try{await action();}catch(error){notice(error.message);log('ERROR '+error.message);}};}
function el(tag,text){const node=document.createElement(tag);node.textContent=text;return node;}
function render(){const song=controller.song;const query=$('search').value.toLowerCase();$('songs').replaceChildren();controller.songs.filter(s=>(s.title+' '+s.artist).toLowerCase().includes(query)).forEach(s=>{const b=el('button',s.title);b.append(el('span',s.artist));b.classList.toggle('active',s.id===song?.id);b.setAttribute('aria-current',s.id===song?.id?'true':'false');b.onclick=()=>{controller.select(s.id);render();};$('songs').append(b);});if(!$('songs').children.length)$('songs').append(el('p','No matching songs.'));
  $('title').textContent=song?.title||'Your next song starts here';$('artist').textContent=song?.artist||'Add a song to assign your four switches.';$('patches').replaceChildren();song?.patches.forEach((p,i)=>{const b=el('button','');b.className='patch';b.classList.toggle('active',controller.last===i);b.setAttribute('aria-pressed',String(controller.last===i));b.append(el('span','SWITCH 0'+(i+1)),el('strong',p.label||'Patch '+(i+1)),el('span','GP-200 · '+p.bank+'-'+p.slot));b.onclick=safe(()=>{controller.press(i);render();notice($('simulation').checked?'Simulated patch '+p.bank+'-'+p.slot+' — no MIDI sent.':'Sent patch selection '+p.bank+'-'+p.slot+'.');});$('patches').append(b);});$('selected').textContent=controller.last===null?'No patch selected for this song':($('simulation').checked?'Simulated':'Last sent')+' · Switch '+(controller.last+1);const index=controller.songs.indexOf(song);$('previous').disabled=index<=0;$('next').disabled=index<0||index>=controller.songs.length-1;$('edit').disabled=!song;
}
function devices(){for(const [id,ports,defaultName] of [['input',midi.access?.inputs,'USB-Midi'],['output',midi.access?.outputs,'GP-200 MIDI']]){const select=$(id),current=select.value;let preferred=defaultName;try{preferred=localStorage.getItem('chocolate.'+id)||defaultName;}catch{}select.replaceChildren(el('option','Select device…'));select.firstChild.value='';for(const port of ports?.values()||[]){if(port.state!=='connected')continue;const option=el('option',port.name||port.id);option.value=port.id;select.append(option);if(port.id===current||(!current&&port.name===preferred))select.value=port.id;}}
  $('status').textContent=$('simulation').checked?'Simulation · no transmission':midi.connected?'Connected · channel 1':'Disconnected';$('connect').disabled=$('simulation').checked||midi.connected;$('input').disabled=midi.connected;$('output').disabled=midi.connected;
}
$('search').oninput=render;
for(const [id,delta] of [['previous',-1],['next',1]])$(id).onclick=()=>{const next=controller.songs[controller.songs.indexOf(controller.song)+delta];if(next){controller.select(next.id);render();}};
$('simulation').onchange=()=>{midi.disconnect();controller.last=null;render();notice($('simulation').checked?'Simulation ready. No MIDI will be transmitted.':'Live mode. Find devices and connect deliberately.');};
$('discover').onclick=safe(()=>midi.discover());$('disconnect').onclick=()=>{midi.disconnect();notice('Disconnected.');};
$('connect').onclick=safe(async()=>{if($('simulation').checked)throw Error('Turn off simulation before connecting.');await midi.connect($('input').value,$('output').value);try{localStorage.setItem('chocolate.input',midi.input.name);localStorage.setItem('chocolate.output',midi.output.name);}catch{notice('Connected, but device preferences could not be saved.');return;}notice('Connected. Ready for Chocolate Program Change 0–3 on channel 1.');});
let draftId=null,isNew=false,draftOrder=[];
function editSong(fresh=false){isNew=fresh;const song=fresh?{id:crypto.randomUUID(),title:'',artist:'',patches:['Rhythm','Chorus','Lead','Alternative'].map(label=>({label,bank:33,slot:'A'}))}:controller.song;draftId=song.id;draftOrder=controller.songs.map(s=>s.id);if(fresh)draftOrder.push(draftId);$('form').elements.title.value=song.title;$('form').elements.artist.value=song.artist;$('assignments').replaceChildren();song.patches.forEach((p,i)=>{const field=el('fieldset','');field.append(el('legend','Switch '+(i+1)));for(const [name,title,value] of [['label','Button label',p.label],['bank','Bank',p.bank],['slot','Slot',p.slot]]){const label=el('label',title);const input=document.createElement(name==='slot'?'select':'input');input.name=name+i;if(name==='slot'){for(const slot of 'ABCD'){const option=el('option',slot);input.append(option);}}else if(name==='bank'){input.type='number';input.min=1;input.max=64;input.required=true;input.step=1;}else input.maxLength=200;input.value=value;label.append(input);field.append(label);}addPatchPicker(field,p,i,catalogue);$('assignments').append(field);});$('edit-error').textContent='';$('delete').disabled=fresh;$('editor').showModal();}
$('add').onclick=()=>editSong(true);$('edit').onclick=()=>editSong();$('cancel').onclick=()=>$('editor').close();
for(const [id,delta] of [['up',-1],['down',1]])$(id).onclick=()=>{const i=draftOrder.indexOf(draftId),j=i+delta;if(j>=0&&j<draftOrder.length){[draftOrder[i],draftOrder[j]]=[draftOrder[j],draftOrder[i]];$('edit-error').textContent='Setlist position '+(j+1)+' (save to apply)';}};
function persist(next,selected,nextCatalogue=catalogue){if(loadFailed)throw Error('Existing saved data is unreadable. Back up and repair the saved controller data before saving.');const valid=validateSongs(next);saveData(valid,nextCatalogue);catalogue=nextCatalogue;controller.songs=valid;controller.songId=selected;controller.last=null;render();}
$('form').onsubmit=e=>{e.preventDefault();try{const values=new FormData($('form'));const song={id:draftId,title:values.get('title'),artist:values.get('artist'),patches:Array.from({length:4},(_,i)=>({label:values.get('label'+i),bank:Number(values.get('bank'+i)),slot:values.get('slot'+i)}))};const next=draftOrder.map(id=>id===draftId?song:controller.songs.find(s=>s.id===id));persist(next,draftId);$('editor').close();notice('Song saved.');}catch(error){$('edit-error').textContent=error.message;}};
$('delete').onclick=()=>{if(!confirm('Delete this song from the setlist?'))return;try{const next=controller.songs.filter(s=>s.id!==draftId);persist(next,next[0]?.id);$('editor').close();notice('Song deleted.');}catch(error){$('edit-error').textContent=error.message;}};
$('export').onclick=safe(()=>{const raw=loadFailed?rawSavedData():exportData(controller.songs,catalogue);const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=el('a','');a.href=url;a.download='chocolate-songs.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('import').onchange=safe(async()=>{const file=$('import').files[0];$('import').value='';if(!file)return;if(file.size>2000000)throw Error('Import must be under 2 MB.');const data=importData(await file.text());const next=data.songs;if(!confirm('Replace the current setlist with '+next.length+' imported songs'+(data.catalogue===null?' (keep existing patch catalogue)?':' and replace the patch catalogue with '+data.catalogue.length+' names?')))return;persist(next,next[0]?.id,data.catalogue??catalogue);notice('Setlist imported and saved.');});
$('patch-import').onchange=async()=>{
  const file=$('patch-import').files[0];$('patch-import').value='';if(!file)return;
  const summary=$('patch-summary');summary.textContent='Reading patch backup...';
  try {
    if(loadFailed)throw Error('Saved controller data must be repaired before importing.');
    if(file.size>32*1024*1024)throw Error('ZIP must be under 32 MB.');
    const result=catalogueFromEntries(await readZip(await file.arrayBuffer()));
    const next=mergeCatalogue(catalogue,result.patches);
    saveData(controller.songs,next);catalogue=next;
    summary.textContent=`Imported ${result.patches.length} patch names; ${catalogue.length} in catalogue. Song labels and assignments preserved.`+
      (result.warnings.length?'\n'+result.warnings.length+' warning(s):\n'+result.warnings.join('\n'):' No warnings.');
  } catch(error){summary.textContent='Import failed: '+error.message;}
};
$('patch-summary').textContent=catalogue.length?catalogue.length+' patch names saved.':'No patch catalogue imported.';
devices();render();
