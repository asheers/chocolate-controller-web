import {Controller,samples,validateSongs,songNumberMessages} from './model.js';
import {loadData,saveData,exportData,importData,rawSavedData,loadReconciliation,recordReconciliation,undoReconciliation,undoProblem,dismissFlag} from './storage.js';
import {catalogueFromEntries,mergeCatalogue,reconcile,outstandingFlags,flagText,moveText} from './catalogue.js';
import {readZip} from './zip-reader.js';
import {addPatchPicker} from './patch-picker.js';
import {Midi,hex} from './midi.js';
const $=id=>document.getElementById(id);
const notice=message=>$('notice').textContent=message;
const log=message=>{$('log').textContent=(new Date().toLocaleTimeString()+' '+message+'\n'+$('log').textContent).split('\n').slice(0,60).join('\n');};
let songs=[],catalogue=[],loadFailed=false;
try{({songs,catalogue}=loadData());}catch(error){loadFailed=true;notice('Saved data could not be read. Export or repair it before saving new songs. '+error.message);}
const controller=new Controller(songs,messages=>{if($('simulation').checked)log('SIM '+messages.map(hex).join(' / '));else midi.send(messages);});
const midi=new Midi(log,data=>{controller.receive(data);render();},devices,(event,data)=>{
  if(event.number===undefined){log('SONG RX '+hex(data)+' → Bank '+event.bank);return;}
  const song=controller.songForMidi(event.number);
  log('SONG RX '+hex(data)+' → MIDI Song '+event.number+(event.bank?' (bank '+event.bank+')':'')+' → '+(song?song.title:'no song assigned; ignored'));
  if(song){const loaded=chooseSong(song.id);notice('MIDI selected '+song.title+'. '+(loaded||'Press a footswitch to change patch.'));}else notice('No song has MIDI Song Number '+event.number+'.');
});
// Every active song choice (list, Mini, Previous/Next, external MIDI). Auto-load is skipped silently
// unless simulating or connected. Returns notice text when a first patch was loaded or failed, else ''.
function chooseSong(id){const sim=$('simulation').checked;let sent=null,text='';
  try{sent=controller.choose(id,sim||midi.connected);}catch(error){log('ERROR '+error.message);text='First patch not sent: '+error.message;}
  render();const p=controller.song.patches[0];if(sent)text=sim?'Simulated first patch '+p.bank+'-'+p.slot+' — no MIDI sent.':'Loaded first patch '+p.bank+'-'+p.slot+'.';
  return text;}
function safe(action){return async()=>{try{await action();}catch(error){notice(error.message);log('ERROR '+error.message);}};}
function el(tag,text){const node=document.createElement(tag);node.textContent=text;return node;}
function render(){const song=controller.song;const query=$('search').value.toLowerCase();const listTop=$('songs').scrollTop;$('songs').replaceChildren();controller.songs.filter(s=>(s.title+' '+s.artist).toLowerCase().includes(query)).forEach(s=>{const b=el('button',s.title);b.append(el('span',s.artist));b.classList.toggle('active',s.id===song?.id);b.setAttribute('aria-current',s.id===song?.id?'true':'false');b.onclick=()=>{const text=chooseSong(s.id);if(text)notice(text);};$('songs').append(b);});$('songs').scrollTop=listTop;if(!$('songs').children.length)$('songs').append(el('p','No matching songs.'));
  $('title').textContent=song?.title||'Your next song starts here';$('mini-song').replaceChildren(...controller.songs.map(s=>{const o=el('option',s.title);o.value=s.id;return o;}));$('mini-song').value=song?.id??'';$('artist').textContent=song?.artist||'Add a song to assign your four switches.';$('patches').replaceChildren();song?.patches.forEach((p,i)=>{const b=el('button','');b.className='patch';b.dataset.key='ABCD'[i];b.classList.toggle('active',controller.last===i);b.setAttribute('aria-pressed',String(controller.last===i));const target=p.ctrl?'CTRL '+p.ctrl:p.bank+'-'+p.slot;const inFirstBank=q=>!q.ctrl&&!song.patches[0].ctrl&&q.bank===song.patches[0].bank;const sameBank=inFirstBank(p)&&song.patches.filter(inFirstBank).length>1;const samePos=sameBank&&p.slot==='ABCD'[i];b.classList.toggle('same-bank',sameBank);b.classList.toggle('same-pos',samePos);b.classList.toggle('ctrl',!!p.ctrl);b.append(el('span','SWITCH 0'+(i+1)),el('strong',p.label||(p.ctrl?'CTRL '+p.ctrl:'Patch '+(i+1))),el('span','GP-200 · '+target+(p.ctrl?' (toggle)':'')));if(sameBank){const s=el('span',samePos?'✓ same footswitch':'GP-200 footswitch '+p.slot);s.className='footswitch';b.append(s);}if(sameBank&&!samePos){const badge=el('span',p.slot);badge.className='slot-badge';b.append(badge);}b.onclick=safe(()=>{controller.press(i);render();notice(p.ctrl?($('simulation').checked?'Simulated '+target+' toggle — no MIDI sent.':'Sent '+target+' toggle.'):($('simulation').checked?'Simulated patch '+target+' — no MIDI sent.':'Sent patch selection '+target+'.'));});$('patches').append(b);});$('selected').textContent=controller.last===null?'No patch selected for this song':($('simulation').checked?'Simulated':'Last sent')+' · Switch '+(controller.last+1);const index=controller.songs.indexOf(song);$('previous').disabled=index<=0;$('next').disabled=index<0||index>=controller.songs.length-1;$('edit').disabled=!song;
}
function devices(){for(const [id,ports,defaultName,placeholder] of [['input',midi.access?.inputs,'USB-Midi','Select device…'],['output',midi.access?.outputs,'GP-200 MIDI','Select device…'],['song-input',midi.access?.inputs,'','None / Disabled']]){const select=$(id),current=select.value;let preferred=defaultName;try{preferred=localStorage.getItem('chocolate.'+id)||defaultName;}catch{}select.replaceChildren(el('option',placeholder));select.firstChild.value='';for(const port of ports?.values()||[]){if(port.state!=='connected')continue;const option=el('option',port.name||port.id);option.value=port.id;select.append(option);if(port.id===current||(!current&&port.name===preferred))select.value=port.id;}}
  $('status').textContent=$('simulation').checked?'Simulation · no transmission':midi.connected?'Connected · channel 1':'Disconnected';$('connect').disabled=$('simulation').checked||midi.connected;$('input').disabled=midi.connected;$('output').disabled=midi.connected;$('song-input').disabled=midi.connected;$('reconnect').hidden=!midi.lost;
}
$('search').oninput=render;
// Same selection as the setlist buttons, including auto-load.
$('mini-song').onchange=()=>{const text=chooseSong($('mini-song').value);if(text)notice(text);};
for(const [id,delta] of [['previous',-1],['next',1]])$(id).onclick=()=>{const next=controller.songs[controller.songs.indexOf(controller.song)+delta];if(next){const text=chooseSong(next.id);if(text)notice(text);}};
$('simulation').onchange=()=>{midi.disconnect();midi.lost=false;controller.last=null;render();notice($('simulation').checked?'Simulation ready. No MIDI will be transmitted.':'Live mode. Find devices and connect deliberately.');};
$('discover').onclick=safe(()=>midi.discover());$('disconnect').onclick=()=>{midi.disconnect();midi.lost=false;notice('Disconnected.');};
// Ports reappear by saved name via devices(); require every previously used device before reconnecting.
$('reconnect').onclick=()=>{let song='';try{song=localStorage.getItem('chocolate.song-input')||'';}catch{}if(!$('input').value||!$('output').value||(song&&!$('song-input').value)){notice('MIDI device not found yet. Check the USB cables, then tap Reconnect again.');return;}return $('connect').onclick();};
$('connect').onclick=safe(async()=>{if($('simulation').checked)throw Error('Turn off simulation before connecting.');await midi.connect($('input').value,$('output').value,$('song-input').value);try{localStorage.setItem('chocolate.input',midi.input.name);localStorage.setItem('chocolate.output',midi.output.name);localStorage.setItem('chocolate.song-input',midi.songInput?.name??'');}catch{notice('Connected, but device preferences could not be saved.');return;}notice('Connected. Ready for Chocolate Program Change 0–3 on channel 1.'+(midi.songInput?' Song select: '+midi.songInput.name+'.':''));});
let draftId=null,isNew=false,draftOrder=[];
function midiSongHint(){const n=Number($('form').elements.midiSong.value);$('midi-song-hint').textContent=Number.isInteger(n)&&n>=1&&n<=16384?'Send CC0 = '+songNumberMessages(n)[0][2]+', then Program Change = '+songNumberMessages(n)[1][1]+' (zero-based).':'Blank = no external MIDI selection.';}
$('form').elements.midiSong.oninput=midiSongHint;
function editSong(fresh=false){isNew=fresh;const topSong=Math.max(0,...controller.songs.map(s=>s.midiSong??0));const song=fresh?{id:crypto.randomUUID(),title:'',artist:'',...(topSong&&topSong<16384?{midiSong:topSong+1}:{}),patches:['Rhythm','Chorus','Lead','Alternative'].map(label=>({label,bank:33,slot:'A'}))}:controller.song;draftId=song.id;draftOrder=controller.songs.map(s=>s.id);if(fresh)draftOrder.push(draftId);$('form').elements.title.value=song.title;$('form').elements.artist.value=song.artist;$('form').elements.midiSong.value=song.midiSong??'';$('form').elements.autoLoad.checked=song.autoLoad!==false;midiSongHint();$('assignments').replaceChildren();song.patches.forEach((p,i)=>{const field=el('fieldset','');field.append(el('legend','Switch '+(i+1)));for(const [name,title,value] of [['label','Button label',p.label],['bank','Bank',p.bank],['slot','Slot',p.slot]]){const label=el('label',title);const input=document.createElement(name==='slot'?'select':'input');input.name=name+i;if(name==='slot'){for(const slot of 'ABCD'){const option=el('option',slot);input.append(option);}}else if(name==='bank'){input.type='number';input.min=1;input.max=64;input.required=true;input.step=1;}else input.maxLength=200;input.value=value??(name==='bank'?33:'A');label.append(input);field.append(label);}addPatchPicker(field,p,i,catalogue);addSwitchType(field,p,i);$('assignments').append(field);});$('edit-error').textContent='';$('delete').disabled=fresh;$('editor').showModal();}
// Patch (default) or CTRL 1–8. CTRL hides and disables bank/slot/patch search so they are neither validated nor saved.
function addSwitchType(field,p,i){const type=document.createElement('select');type.name='type'+i;type.setAttribute('aria-label','Switch '+(i+1)+' type');type.append(el('option','GP-200 patch'));type.firstChild.value='patch';for(let n=1;n<=8;n++){const o=el('option','CTRL '+n+' (toggle)');o.value=n;type.append(o);}type.value=p.ctrl??'patch';field.querySelector('legend').append(' ',type);
  const patchOnly=[field.querySelector(`[name="bank${i}"]`),field.querySelector(`[name="slot${i}"]`),field.querySelector('.patch-picker input')];
  const sync=()=>{const ctrl=type.value!=='patch';for(const input of patchOnly){input.closest('label').hidden=ctrl;if(input.name)input.disabled=ctrl;}};type.onchange=sync;sync();}
$('add').onclick=()=>editSong(true);$('edit').onclick=()=>editSong();$('cancel').onclick=()=>$('editor').close();
for(const [id,delta] of [['up',-1],['down',1]])$(id).onclick=()=>{const i=draftOrder.indexOf(draftId),j=i+delta;if(j>=0&&j<draftOrder.length){[draftOrder[i],draftOrder[j]]=[draftOrder[j],draftOrder[i]];$('edit-error').textContent='Setlist position '+(j+1)+' (save to apply)';}};
function persist(next,selected,nextCatalogue=catalogue){if(loadFailed)throw Error('Existing saved data is unreadable. Back up and repair the saved controller data before saving.');const valid=validateSongs(next);saveData(valid,nextCatalogue);catalogue=nextCatalogue;controller.songs=valid;controller.songId=selected;controller.last=null;render();refreshReconcile();}
$('form').onsubmit=e=>{e.preventDefault();try{const values=new FormData($('form'));const midiSong=values.get('midiSong');const song={id:draftId,title:values.get('title'),artist:values.get('artist'),...(midiSong===''?{}:{midiSong:Number(midiSong)}),...(values.get('autoLoad')?{}:{autoLoad:false}),patches:Array.from({length:4},(_,i)=>values.get('type'+i)!=='patch'?{label:values.get('label'+i),ctrl:Number(values.get('type'+i))}:{label:values.get('label'+i),bank:Number(values.get('bank'+i)),slot:values.get('slot'+i)})};const next=draftOrder.map(id=>id===draftId?song:controller.songs.find(s=>s.id===id));persist(next,draftId);$('editor').close();notice('Song saved.');}catch(error){$('edit-error').textContent=error.message;}};
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
    const next=mergeCatalogue(catalogue,result.patches),plan=reconcile(catalogue,next,controller.songs);
    const finish=outcome=>{summary.textContent=`Imported ${result.patches.length} patch names; ${catalogue.length} in catalogue. ${outcome}`+
      (result.warnings.length?'\n'+result.warnings.length+' warning(s):\n'+result.warnings.join('\n'):' No warnings.');};
    const namesOnly=outcome=>{saveData(controller.songs,next);catalogue=next;finish(outcome);refreshReconcile();};
    if(!plan.moves.length&&!plan.flags.length){namesOnly('Song labels and assignments preserved.'+(!catalogue.length?' This is your naming baseline: check your songs play the right patches before importing a backup with moved patches.':''));return;}
    previewReconcile(plan,next,result,finish,namesOnly);
  } catch(error){summary.textContent='Import failed: '+error.message;}
};
const PENDING='Review the import. Nothing is saved until you confirm.';
function previewReconcile(plan,next,result,finish,namesOnly){
  const section=(heading,items)=>{if(!items.length)return [];const list=el('ul','');list.append(...items.map(text=>el('li',text)));return [el('h3',heading),list];};
  $('reconcile-warnings').replaceChildren(...section('Backup warnings',result.warnings));
  $('reconcile-rows').replaceChildren(...section('Will update ('+plan.moves.length+')',plan.moves.map(moveText)),...section('Needs your attention: left unchanged ('+plan.flags.length+')',plan.flags.map(flagText)));
  const missing=256-result.patches.length;
  $('reconcile-note').textContent=(plan.unknown?'Couldn’t check: '+plan.unknown+' assignments on blank or unnamed slots. ':'')+(missing?'Not in this backup: '+missing+' positions keep their saved names and are treated as unchanged. ':'')+'Custom labels are kept. The GP-200 is not changed.';
  $('reconcile-error').textContent='';
  $('reconcile-apply').textContent=plan.moves.length?'Apply '+plan.moves.length+' update'+(plan.moves.length===1?'':'s')+' and import':'Import and keep warnings';
  $('patch-summary').textContent=PENDING;
  $('reconcile-apply').onclick=()=>{try{
    const {flags}=loadReconciliation();
    const earlier=outstandingFlags(flags,plan.songs).filter(o=>!plan.flags.some(f=>f.songId===o.songId&&f.index===o.index));
    recordReconciliation({flags:[...earlier,...plan.flags],undo:{before:exportData(controller.songs,catalogue),after:exportData(plan.songs,next),beforeFlags:flags}},()=>persist(plan.songs,controller.songId,next));
    finish(plan.moves.length+' assignment(s) updated; '+plan.flags.length+' need attention.');
    $('reconcile').close();
  }catch(error){$('reconcile-error').textContent=error.message;}};
  $('reconcile-names').onclick=()=>{try{namesOnly('Song labels and assignments left unchanged at your request.');$('reconcile').close();}catch(error){$('reconcile-error').textContent=error.message;}};
  $('reconcile').showModal();
}
$('reconcile-cancel').onclick=()=>$('reconcile').close();
// Also catches Escape.
$('reconcile').onclose=()=>{if($('patch-summary').textContent===PENDING)$('patch-summary').textContent='Import cancelled. Nothing changed.';};
// Runs after saves only, not from render(), so song and MIDI selection never pay for it.
function refreshReconcile(){
  const {flags,undo}=loadReconciliation(),open=outstandingFlags(flags,controller.songs),problem=undoProblem(undo);
  $('patch-flags').hidden=!open.length;$('patch-flag-list').replaceChildren(...open.map(f=>{const item=el('li',flagText(f)),dismiss=el('button','Dismiss');dismiss.setAttribute('aria-label','Dismiss warning for '+f.song+', switch '+(f.index+1));dismiss.onclick=safe(()=>{dismissFlag(f);refreshReconcile();notice('Warning dismissed. Song and patch catalogue unchanged.');($('patch-flag-list').querySelector('button')??$('patch-import')).focus();});item.append(dismiss);return item;}));
  $('undo-reconcile').hidden=!undo;$('undo-reconcile').disabled=!!problem;
  $('undo-reason').hidden=!problem;$('undo-reason').textContent=problem;
  document.querySelector('aside').classList.toggle('reconciling',open.length>0||!!undo);
}
$('undo-reconcile').onclick=safe(()=>{try{
  if(!confirm('Undo the last reconciliation? This restores the songs and patch catalogue saved before it.'))return;
  undoReconciliation(data=>persist(data.songs,data.songs.some(s=>s.id===controller.songId)?controller.songId:data.songs[0]?.id,data.catalogue));
  $('patch-summary').textContent=catalogue.length+' patch names saved.';notice('Reconciliation undone. Songs and patch catalogue restored.');
}finally{refreshReconcile();}});
$('patch-summary').textContent=catalogue.length?catalogue.length+' patch names saved.':'No patch catalogue imported.';refreshReconcile();
// Mini Mode is CSS only: nothing reloads, so MIDI, song and patch state are untouched.
function setMini(on){document.body.classList.toggle('mini',on);$('mini-toggle').textContent=on?'Full mode':'Mini mode';const url=new URL(location.href);if(on)url.searchParams.set('mode','mini');else url.searchParams.delete('mode');history.replaceState(null,'',url);}
$('mini-toggle').onclick=()=>setMini(!document.body.classList.contains('mini'));
setMini(new URLSearchParams(location.search).get('mode')==='mini');
const build=globalThis.CHOCOLATE_BUILD??{channel:'DEV',version:'dev'};
$('version').textContent='Version '+build.channel+' · '+build.version;
if(build.channel!=='LIVE'){document.title=build.channel+' · '+document.title;$('eyebrow').textContent=build.channel+' ('+build.version+') · '+$('eyebrow').textContent;}
if(build.channel!=='DEV'&&'serviceWorker' in navigator)navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>{
  const offer=()=>{if(reg.waiting&&navigator.serviceWorker.controller)$('update').hidden=false;};
  offer();reg.onupdatefound=()=>{reg.installing.onstatechange=offer;};
  $('update').onclick=()=>{if(!confirm('Reload to install the update? MIDI will disconnect until you reconnect. Songs are kept.'))return;navigator.serviceWorker.oncontrollerchange=()=>location.reload();reg.waiting.postMessage('activate');};
}).catch(error=>log('Offline app cache unavailable: '+error.message));
devices();render();
