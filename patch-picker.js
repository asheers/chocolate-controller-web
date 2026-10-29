import {searchCatalogue,patchText,assignPatch} from './catalogue.js';
// Editor-only DOM helper. Deliberately has no controller or MIDI dependency.
export function addPatchPicker(field,assignment,index,catalogue) {
  const label=document.createElement('label');label.className='patch-picker';label.textContent='GP-200 patch';
  const input=document.createElement('input');input.type='search';input.autocomplete='off';
  input.setAttribute('aria-label',`Search GP-200 patches for switch ${index+1}`);
  input.placeholder=catalogue.length?'Search name or bank-slot':'Import patches to search';
  input.disabled=!catalogue.length;
  const results=document.createElement('div');results.className='patch-results';
  results.id=`patch-results-${index}`;input.setAttribute('aria-controls',results.id);
  const bank=field.querySelector(`[name="bank${index}"]`),slot=field.querySelector(`[name="slot${index}"]`);
  const refresh=()=>{const p=catalogue.find(p=>p.bank===Number(bank.value)&&p.slot===slot.value);input.value=p?patchText(p):'';};
  const close=()=>{results.replaceChildren();};
  const search=()=>{
    close();
    const matches=searchCatalogue(catalogue,input.value);
    for(const patch of matches){
      const button=document.createElement('button');button.type='button';button.textContent=patchText(patch);
      button.onclick=()=>{const next=assignPatch(assignment,patch);bank.value=next.bank;slot.value=next.slot;field.querySelector(`[name="label${index}"]`).value=next.label;input.value=patchText(patch);close();input.focus();};
      results.append(button);
    }
    if(!matches.length){const p=document.createElement('p');p.textContent='No matching patches. Manual bank/slot entry is available.';results.append(p);}
  };
  input.oninput=search;
  input.onfocus=()=>input.select();
  input.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();refresh();}if(e.key==='ArrowDown'){e.preventDefault();if(!results.children.length)search();results.querySelector('button')?.focus();}};
  results.onkeydown=e=>{const buttons=[...results.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}if(e.key==='Escape'){e.stopPropagation();close();input.focus();}};
  label.onfocusout=e=>{if(!label.contains(e.relatedTarget)){close();refresh();}};
  bank.addEventListener('input',refresh);slot.addEventListener('change',refresh);
  label.append(input,results);field.append(label);refresh();
}
