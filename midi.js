export class Midi {
  constructor(log,receive,changed){this.log=log;this.receive=receive;this.changed=changed;this.access=null;this.input=null;this.output=null;this.connected=false;}
  async discover(){if(!navigator.requestMIDIAccess)throw Error('Web MIDI unavailable. Use Chrome or Edge on Windows at localhost.');this.access=await navigator.requestMIDIAccess({sysex:false});this.access.onstatechange=()=>{if(this.connected && (this.input?.state!=='connected'||this.output?.state!=='connected')){this.disconnect();this.log('Device disconnected. Reconnect deliberately.');}this.changed();};this.changed();}
  async connect(inputId,outputId){this.disconnect();const input=this.access?.inputs.get(inputId),output=this.access?.outputs.get(outputId);if(!input||!output||input.state!=='connected'||output.state!=='connected')throw Error('Select connected MIDI input and output.');if(input.name===output.name)throw Error('Input and output must be different devices.');try{await input.open();await output.open();if(input.state!=='connected'||output.state!=='connected')throw Error('Device disconnected while connecting.');this.input=input;this.output=output;this.connected=true;input.onmidimessage=e=>{this.log('RX '+hex(e.data));try{this.receive(e.data);}catch(error){this.log(error.message);}};this.changed();}catch(error){await input.close();await output.close();throw error;}}
  disconnect(){if(this.input){this.input.onmidimessage=null;this.input.close().catch(()=>{});}if(this.output){this.output.clear?.();this.output.close().catch(()=>{});}this.nextSendAt=0;this.input=null;this.output=null;this.connected=false;this.changed();}
  send(messages){if(!this.connected||this.output?.state!=='connected'||this.input?.state!=='connected')throw Error('MIDI disconnected — no patch sent.');// Match GP200 Studio's hardware-tested 50 ms CC0-to-PC interval.
    // Schedule whole requests in order so rapid presses cannot mix banks/programs.
    const start=Math.max(performance.now(),this.nextSendAt||0);
    messages.forEach((message,index)=>{this.output.send(message,start+index*50);this.log('TX '+hex(message));});
    this.nextSendAt=start+(messages.length-1)*50+1;
  }
}
export function hex(data){return Array.from(data,b=>b.toString(16).padStart(2,'0').toUpperCase()).join(' ');}
