import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage();
  const markup=`<main></main><script>
    (()=>{let archived=false;
    function render(filter='Active') {
      document.querySelector('main').innerHTML='<select aria-label="Project filter"><option'+(filter==='Active'?' selected':'')+'>Active</option><option'+(filter==='Archived'?' selected':'')+'>Archived</option></select>'+((filter==='Archived')===archived?'<div data-testid="project-row">Alpha<button>Open project</button><button>Archive project</button></div>':'');
      document.querySelector('select').onchange=e=>render(e.target.value);
      const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Archive project');
      if(button)button.onclick=()=>{window.finishArchive=(valid=true)=>{archived=valid;render('Active');};};
    }
    render();})();
  </script>`;
  await page.setContent(markup);
  await page.getByRole('button',{name:'Archive project',exact:true}).click();
  await page.getByRole('combobox',{name:'Project filter'}).selectOption({label:'Archived'});
  await page.evaluate(()=>window.finishArchive());
  assert.equal(await page.getByRole('combobox',{name:'Project filter'}).inputValue(),'Active');
  assert.equal(await page.getByTestId('project-row').count(),0);
  await page.setContent(markup);
  await page.getByRole('button',{name:'Archive project',exact:true}).click();
  const completed=expect(page.getByTestId('project-row')).toHaveCount(0);
  await page.evaluate(()=>window.finishArchive());await completed;
  await page.getByRole('combobox',{name:'Project filter'}).selectOption({label:'Archived'});
  assert.equal(await page.getByTestId('project-row').count(),1);
  await page.setContent(markup);
  await page.getByRole('button',{name:'Archive project',exact:true}).click();
  await page.evaluate(()=>window.finishArchive(false));
  assert.equal(await page.getByTestId('project-row').count(),1);
  console.log('Controlled pending archive reproduces premature filter loss; serialized completion passes; failed archive remains observable.');
} finally {await browser.close();}
