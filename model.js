export function validateSongs(data) {
  if (!Array.isArray(data) || data.length > 2000) throw Error('Expected an array of up to 2000 songs.');
  const ids = new Set();
  return data.map(song => {
    if (!song || typeof song.id !== 'string' || !song.id || ids.has(song.id)) throw Error('Each song needs a unique ID.');
    ids.add(song.id);
    if (typeof song.title !== 'string' || !song.title.trim() || song.title.length > 200 || typeof song.artist !== 'string' || song.artist.length > 200) throw Error('Songs need a title and artist text (maximum 200 characters).');
    if (!Array.isArray(song.patches) || song.patches.length !== 4) throw Error('Each song needs four patches.');
    return {id:song.id,title:song.title.trim(),artist:song.artist,patches:song.patches.map(p=>{
      if (!p || !Number.isInteger(p.bank) || p.bank<1 || p.bank>64 || !['A','B','C','D'].includes(p.slot) || typeof p.label !== 'string' || p.label.length>200) throw Error('Patches need bank 1–64, slot A–D and a label of up to 200 characters.');
      return {label:p.label,bank:p.bank,slot:p.slot};
    })};
  });
}
export function patchMessages(patch) {
  validateSongs([{id:'check',title:'check',artist:'',patches:Array(4).fill(patch)}]);
  // GP200 Studio hardware notes (CLAUDE.md, Hardware / MIDI) verify this
  // through 64-D; the manual's CC0 values are reversed. No CC32 is used.
  // See gp200_midi.py:MidiOut.send_pc and gp200_usb.py:select_preset.
  const program = (patch.bank-1)*4+'ABCD'.indexOf(patch.slot);
  return [[0xB0,0,Math.floor(program/128)],[0xC0,program%128]];
}
export function chocolateButton(data) {
  return data.length===2 && data[0]===0xC0 && Number.isInteger(data[1]) && data[1]>=0 && data[1]<=3 ? data[1] : null;
}
export class Controller {
  constructor(songs,send) {this.songs=validateSongs(songs);this.songId=this.songs[0]?.id;this.send=send;this.last=null;}
  get song(){return this.songs.find(s=>s.id===this.songId);}
  select(id){if(!this.songs.some(s=>s.id===id))throw Error('Unknown song');this.songId=id;this.last=null;}
  press(index){if(!Number.isInteger(index)||index<0||index>3||!this.song)throw Error('Select a song first.');const messages=patchMessages(this.song.patches[index]);this.send(messages);this.last=index;return messages;}
  receive(data){const index=chocolateButton(data);if(index!==null)this.press(index);}
}
export const samples = [
  {id:'wonderful',title:'Wonderful Tonight',artist:'Eric Clapton',patches:[{label:'Rhythm',bank:36,slot:'A'},{label:'Chorus',bank:36,slot:'C'},{label:'Lead',bank:42,slot:'B'},{label:'Alternative',bank:45,slot:'D'}]},
  {id:'numb',title:'Comfortably Numb',artist:'Pink Floyd',patches:[{label:'Clean Intro',bank:33,slot:'A'},{label:'Chorus',bank:38,slot:'C'},{label:'Solo 1',bank:51,slot:'B'},{label:'Solo 2',bank:52,slot:'A'}]}
];
