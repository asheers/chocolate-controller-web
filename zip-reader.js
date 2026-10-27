// Bounded, read-only ZIP parser. Native DecompressionStream handles deflate.
const MAX_BYTES = 32 * 1024 * 1024;
export function crc32(bytes) {
  let crc=0xffffffff;
  for(const b of bytes) { crc^=b; for(let j=0;j<8;j++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
  return (crc^0xffffffff)>>>0;
}
export async function readZip(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if(bytes.length>MAX_BYTES) throw Error('ZIP must be under 32 MB.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const range=(p,n)=>{if(!Number.isInteger(p)||p<0||p+n>bytes.length)throw Error('Truncated ZIP.');};
  const u16=p=>{range(p,2);return view.getUint16(p,true);};
  const u32=p=>{range(p,4);return view.getUint32(p,true);};
  let end=-1;
  for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--) {
    if(u32(p)===0x06054b50 && p+22+u16(p+20)===bytes.length){end=p;break;}
  }
  if(end<0)throw Error('Not a supported ZIP file.');
  const count=u16(end+10),start=u32(end+16),size=u32(end+12);
  if(u16(end+4)||u16(end+6)||u16(end+8)!==count||count>8192||start+size!==end)throw Error('Unsupported ZIP directory.');
  const entries=new Map(); let p=start,total=0;
  for(let i=0;i<count;i++) {
    range(p,46);
    if(u32(p)!==0x02014b50)throw Error('Invalid ZIP directory entry.');
    const flags=u16(p+8),method=u16(p+10),crc=u32(p+16),compressed=u32(p+20),length=u32(p+24);
    const names=u16(p+28),extra=u16(p+30),comment=u16(p+32),local=u32(p+42);
    range(p+46,names+extra+comment);
    if(p+46+names+extra+comment>end)throw Error('Invalid ZIP directory bounds.');
    const name=new TextDecoder().decode(bytes.subarray(p+46,p+46+names));
    if(entries.has(name))throw Error('Duplicate ZIP entry: '+name);
    if(flags&1 || ![0,8].includes(method))throw Error('Encrypted or unsupported ZIP compression.');
    total+=length;
    if(total>MAX_BYTES || length>MAX_BYTES)throw Error('Expanded ZIP exceeds 32 MB.');
    range(local,30);
    if(u32(local)!==0x04034b50 || u16(local+8)!==method)throw Error('Invalid ZIP local header.');
    const begin=local+30+u16(local+26)+u16(local+28);
    range(begin,compressed);
    if(begin+compressed>start)throw Error('Invalid ZIP data bounds.');
    const raw=bytes.subarray(begin,begin+compressed);
    let data;
    if(method===0)data=raw;
    else {
      const reader=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const chunks=[];let received=0;
      try { while(true){const next=await reader.read();if(next.done)break;received+=next.value.length;if(received>length)throw Error('ZIP expanded size mismatch.');chunks.push(next.value);} }
      catch(e){await reader.cancel().catch(()=>{});throw e;}
      data=new Uint8Array(received);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
    }
    if(data.length!==length || crc32(data)!==crc)throw Error('Damaged ZIP entry: '+name);
    entries.set(name,data);p+=46+names+extra+comment;
  }
  if(p!==end)throw Error('Invalid ZIP directory size.');
  return entries;
}
