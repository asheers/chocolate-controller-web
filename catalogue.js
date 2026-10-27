// GP-200 name layout verified against GP200-Librarian patch.js and golden tests.
// Format facts only; no Librarian application dependency.
export const position = p => (p.bank - 1) * 4 + 'ABCD'.indexOf(p.slot);
export const patchText = p => `${p.bank}-${p.slot} \u2014 ${p.name || '(unnamed patch)'}`;
export function validateCatalogue(data) {
  if (!Array.isArray(data) || data.length > 256) throw Error('Expected up to 256 catalogue patches.');
  const seen = new Set();
  return data.map(p => {
    if (!p || !Number.isInteger(p.bank) || p.bank < 1 || p.bank > 64 || !'ABCD'.split('').includes(p.slot) || typeof p.name !== 'string' || p.name.length > 200) throw Error('Invalid catalogue name or bank/slot.');
    const key = position(p);
    if (seen.has(key)) throw Error('Duplicate catalogue position.');
    seen.add(key);
    return {bank:p.bank, slot:p.slot, name:p.name};
  }).sort((a,b) => position(a)-position(b));
}
export function mergeCatalogue(previous, incoming) {
  const entries = new Map(validateCatalogue(previous).map(p => [position(p),p]));
  for (const p of validateCatalogue(incoming)) entries.set(position(p),p);
  return validateCatalogue([...entries.values()]);
}
export function searchCatalogue(catalogue, query) {
  const terms = query.toLowerCase().trim().split(/\s+/);
  return catalogue.filter(p => terms.every(term => patchText(p).toLowerCase().includes(term)));
}
// Called only for an explicit editor selection; the label remains editable.
export function assignPatch(assignment, patch) {
  return {...assignment, label:patch.name, bank:patch.bank, slot:patch.slot};
}
export function decodePatchName(bytes, offset = 0x44) {
  if (bytes.length < offset + 16) throw Error('Truncated patch name field.');
  let name = '';
  for (const b of bytes.subarray(offset,offset+16)) {
    if (b === 0) break;
    name += b < 128 ? String.fromCharCode(b) : '\uFFFD';
  }
  return name.replace(/[\x00-\x1f\x7f]/g,' ').trim();
}
export function catalogueFromEntries(entries) {
  const patches = [], warnings = [], seen = new Set();
  const add = (index, name) => {
    if (!Number.isInteger(index) || index < 0 || index > 255) throw Error('Position must be 0-255.');
    if (seen.has(index)) throw Error(`Duplicate position ${index}.`);
    if (typeof name !== 'string' || name.length > 200) throw Error('Invalid patch name.');
    seen.add(index);
    patches.push({bank:Math.floor(index/4)+1,slot:'ABCD'[index%4],name:name.replace(/[\x00-\x1f\x7f]/g,' ').trim()});
  };
  if (entries.has('manifest.json')) {
    const m = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));
    if (!['gp200-librarian-backup/1','gp200-librarian-backup/2'].includes(m.format) || !Array.isArray(m.slots) || m.slots.length > 256) throw Error('Not a supported Librarian pedal/selection backup.');
    if (m.demo) warnings.push('This backup contains demo patches.');
    for (const s of m.slots) {
      try {
        if (!s) throw Error('Invalid manifest entry.');
        const label = `${Math.floor(s.slot/4)+1}${'ABCD'[s.slot%4]}`;
        if (s.label !== label) throw Error('Slot and label disagree.');
        add(s.slot,s.name);
      } catch (e) { warnings.push(`Manifest entry ${s?.label ?? '?'}: ${e.message}`); }
    }
    if (m.missing?.length) warnings.push(`${m.missing.length} patches were missing from the backup read.`);
    if (m.slotsIncluded !== undefined && m.slotsIncluded !== patches.length) warnings.push('Manifest patch count differs from valid entries.');
  } else {
    for (const [file,bytes] of entries) {
      if (!/\.prst$/i.test(file)) continue;
      try {
        const match = /^(\d{1,2})([ABCD])_.*\.prst$/i.exec(file.split('/').at(-1));
        if (!match) throw Error('Filename needs a position such as 36A_Name.prst.');
        if (bytes.length !== 1224 || bytes[0]!==0x54 || bytes[1]!==0x53 || bytes[2]!==0x52 || bytes[3]!==0x50) throw Error('Invalid .prst header or length.');
        let sum=0; for(let i=0;i<0x4c6;i++) sum+=bytes[i];
        if ((sum & 65535) !== ((bytes[0x4c6]<<8)|bytes[0x4c7])) throw Error('Patch checksum mismatch.');
        add((Number(match[1])-1)*4+'ABCD'.indexOf(match[2].toUpperCase()),decodePatchName(bytes));
      } catch(e) { warnings.push(`${file}: ${e.message}`); }
    }
  }
  if (!patches.length) throw Error('No valid GP-200 patches found. '+warnings.join(' '));
  return {patches:validateCatalogue(patches),warnings};
}
