export function validateSongs(data) {
  if (!Array.isArray(data) || data.length > 2000) throw Error('Expected an array of up to 2000 songs.');
  const ids = new Set(), numbers = new Map();
  return data.map(song => {
    if (!song || typeof song.id !== 'string' || !song.id || ids.has(song.id)) throw Error('Each song needs a unique ID.');
    ids.add(song.id);
    const midiSong = song.midiSong ?? undefined;
    if (midiSong !== undefined && (!Number.isInteger(midiSong) || midiSong < 1 || midiSong > 16384)) throw Error('MIDI Song Number must be a whole number from 1 to 16,384.');
    if (numbers.has(midiSong)) throw Error(`MIDI Song Number ${midiSong} is already assigned to "${numbers.get(midiSong)}".`);
    if (midiSong !== undefined) numbers.set(midiSong, song.title);
    if (typeof song.title !== 'string' || !song.title.trim() || song.title.length > 200 || typeof song.artist !== 'string' || song.artist.length > 200) throw Error('Songs need a title and artist text (maximum 200 characters).');
    if (!Array.isArray(song.patches) || song.patches.length !== 4) throw Error('Each song needs four patches.');
    if (song.autoLoad !== undefined && typeof song.autoLoad !== 'boolean') throw Error('Auto-load first patch must be true or false.');
    return {id:song.id,title:song.title.trim(),artist:song.artist,patches:song.patches.map(p=>{
      if (p && p.ctrl !== undefined) {
        if (!Number.isInteger(p.ctrl) || p.ctrl<1 || p.ctrl>8 || p.bank !== undefined || p.slot !== undefined || typeof p.label !== 'string' || p.label.length>200) throw Error('CTRL switches need CTRL 1–8, no bank/slot, and a label of up to 200 characters.');
        return {label:p.label,ctrl:p.ctrl};
      }
      if (!p || !Number.isInteger(p.bank) || p.bank<1 || p.bank>64 || !['A','B','C','D'].includes(p.slot) || typeof p.label !== 'string' || p.label.length>200) throw Error('Patches need bank 1–64, slot A–D and a label of up to 200 characters.');
      return {label:p.label,bank:p.bank,slot:p.slot};
    }),...(midiSong===undefined?{}:{midiSong}),...(song.autoLoad===false?{autoLoad:false}:{})};
  });
}
export function patchMessages(patch) {
  if (patch?.ctrl !== undefined) throw Error('Not a patch assignment.');
  validateSongs([{id:'check',title:'check',artist:'',patches:Array(4).fill(patch)}]);
  // GP200 Studio hardware notes (CLAUDE.md, Hardware / MIDI) verify this
  // through 64-D; the manual's CC0 values are reversed. No CC32 is used.
  // See gp200_midi.py:MidiOut.send_pc and gp200_usb.py:select_preset.
  const program = (patch.bank-1)*4+'ABCD'.indexOf(patch.slot);
  return [[0xB0,0,Math.floor(program/128)],[0xC0,program%128]];
}
// CTRL 1–4 = CC69–72, CTRL 5–8 = CC76–79 (73–75 are tempo/tap). Hardware-verified on
// firmware 1.8.0 (docs/GP200_CTRL_MIDI_FINDINGS.md): every message toggles, whatever its value,
// so one CC127 per press. A release message would toggle back.
export function ctrlMessages(ctrl) {
  if (!Number.isInteger(ctrl) || ctrl<1 || ctrl>8) throw Error('CTRL must be 1–8.');
  return [[0xB0,ctrl<=4?68+ctrl:71+ctrl,127]];
}
export const switchMessages = a => a.ctrl !== undefined ? ctrlMessages(a.ctrl) : patchMessages(a);
export function chocolateButton(data) {
  return data.length===2 && data[0]===0xC0 && Number.isInteger(data[1]) && data[1]>=0 && data[1]<=3 ? data[1] : null;
}
// External song select: CC0 sets the bank per channel and persists (standard MIDI); PC selects.
export function songNumberMessages(number) {return [[0xB0,0,Math.floor((number-1)/128)],[0xC0,(number-1)%128]];}
export class SongSelect {
  constructor(){this.reset();}
  reset(){this.banks=Array(16).fill(0);}
  receive(data){const type=data[0]&0xF0,channel=data[0]&0x0F;
    if(type===0xB0&&data.length===3&&data[1]===0){this.banks[channel]=data[2];return {channel,bank:data[2]};}
    if(type===0xC0&&data.length===2)return {channel,bank:this.banks[channel],number:this.banks[channel]*128+data[1]+1};
    return null;}
}
export class Controller {
  constructor(songs,send) {this.songs=validateSongs(songs);this.songId=this.songs[0]?.id;this.send=send;this.last=null;}
  get song(){return this.songs.find(s=>s.id===this.songId);}
  select(id){if(!this.songs.some(s=>s.id===id))throw Error('Unknown song');this.songId=id;this.last=null;}
  // The only path that transmits. A CTRL press leaves the last-patch highlight alone: its state is unknown.
  press(index){if(!Number.isInteger(index)||index<0||index>3||!this.song)throw Error('Select a song first.');const a=this.song.patches[index],messages=switchMessages(a);this.send(messages);if(a.ctrl===undefined)this.last=index;return messages;}
  receive(data){const index=chocolateButton(data);if(index!==null)this.press(index);}
  // An active song choice (list, Mini, Previous/Next, external MIDI). A different song auto-loads
  // Button 1's patch when enabled, Button 1 is a patch and `ready` (connected or simulating).
  // patchMessages refuses CTRL, so selection can never toggle a CTRL. Returns the messages sent, or null.
  // A failed send leaves the new song selected and no highlight.
  choose(id,ready=false){if(id===this.songId){this.select(id);return null;}this.select(id);const song=this.song,first=song.patches[0];
    if(song.autoLoad===false||first.ctrl!==undefined||!ready)return null;const messages=patchMessages(first);this.send(messages);this.last=0;return messages;}
  songForMidi(number){return this.songs.find(s=>s.midiSong===number)??null;}
}
export const samples = [
  {id:'wonderful',title:'Wonderful Tonight',artist:'Eric Clapton',patches:[{label:'Rhythm',bank:36,slot:'A'},{label:'Chorus',bank:36,slot:'C'},{label:'Lead',bank:42,slot:'B'},{label:'Alternative',bank:45,slot:'D'}]},
  {id:'numb',title:'Comfortably Numb',artist:'Pink Floyd',patches:[{label:'Clean Intro',bank:33,slot:'A'},{label:'Chorus',bank:38,slot:'C'},{label:'Solo 1',bank:51,slot:'B'},{label:'Solo 2',bank:52,slot:'A'}]}
];
