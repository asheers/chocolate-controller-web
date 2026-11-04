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
const address = p => `${p.bank}-${p.slot}`;
// Names and positions only. Every lookup uses the two snapshots, so swaps and chains cannot compound.
export function reconcile(previous, next, songs) {
  const index = catalogue => {
    const names = new Map();
    for (const p of catalogue) if (p.name) names.set(p.name, [...(names.get(p.name) ?? []), p]);
    return names;
  };
  const nameAt = (catalogue, a) => catalogue.find(p => position(p) === position(a))?.name ?? '';
  const before = index(previous), after = index(next), moves = [], flags = [];
  let unknown = 0;
  const updated = songs.map(song => ({...song, patches:song.patches.map((a, i) => {
    const name = nameAt(previous, a), now = nameAt(next, a);
    if (!name) { unknown++; return a; }
    if (now === name) return a;
    const row = {songId:song.id, song:song.title, index:i, label:a.label, bank:a.bank, slot:a.slot, name, now};
    const found = after.get(name) ?? [];
    if (!found.length) flags.push({...row, kind:now && !before.has(now) ? 'rename' : 'missing'});
    else if (found.length > 1 || before.get(name).length > 1) flags.push({...row, kind:'duplicate', candidates:found.map(({bank, slot}) => ({bank, slot}))});
    else {
      const to = {bank:found[0].bank, slot:found[0].slot};
      moves.push({...row, to});
      return {...a, ...to}; // Bank and slot only: custom labels must survive.
    }
    return a;
  })}));
  return {songs:updated, moves, flags, unknown};
}
// A flag lasts until its assignment's label, bank or slot changes, or its song is removed.
export function outstandingFlags(flags, songs) {
  return flags.flatMap(f => {
    const song = songs.find(s => s.id === f.songId), a = song?.patches[f.index];
    return a && a.label === f.label && a.bank === f.bank && a.slot === f.slot ? [{...f, song:song.title}] : [];
  });
}
export function moveText(m) {
  return `${m.song} · Switch ${m.index + 1} "${m.label}": ${m.name} ${address(m)} → ${address(m.to)}`;
}
export function flagText(f) {
  const here = address(f), holds = f.now ? `${here} now holds "${f.now}"` : `${here} is now blank`;
  const problem = {
    rename:`possible rename — "${f.name}" is gone and ${holds}.`,
    missing:`missing — "${f.name}" not found; ${holds}.`,
    duplicate:`duplicate name "${f.name}" — candidates ${[].concat(f.candidates ?? []).map(address).join(', ')}; ${holds}.`,
  }[f.kind] ?? `check "${f.name}"; ${holds}.`;
  return `${f.song} · Switch ${f.index + 1} "${f.label}" (${here}): ${problem}`;
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
