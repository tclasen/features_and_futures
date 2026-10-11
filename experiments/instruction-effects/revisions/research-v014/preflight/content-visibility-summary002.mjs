import {resolve} from 'node:path';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve('.local/browsers');
const {chromium,expect}=await import('@playwright/test');
const output=resolve('experiments/instruction-effects/revisions/research-v014/preflight/content-visibility-summary002');
await mkdir(output);await writeFile(output+'/executed-controller.mjs',await readFile(new URL(import.meta.url)));
const browser=await chromium.launch({headless:true});const rows=[];
try {const page=await browser.newPage();
for(let repeat=1;repeat<=3;repeat++)for(const mode of ['auto','visible']){
 await page.setContent(`<div style="height:20000px"></div><div data-testid="project-row" style="content-visibility:${mode};contain-intrinsic-size:60px"><span>Return owner</span><span data-testid="project-summary">0/4 completed</span></div>`);
 const summary=page.getByTestId('project-row').filter({visible:true}).getByTestId('project-summary');
 await expect(summary).toHaveText(/^\d+\/\d+ completed$/);
 const offscreenInnerText=await summary.innerText();
 const textContent=await summary.textContent();
 await summary.scrollIntoViewIfNeeded();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const onscreenInnerText=await summary.innerText();
 expect(offscreenInnerText).toBe(mode==='auto'?'':'0/4 completed');
 expect(textContent).toBe('0/4 completed');expect(onscreenInnerText).toBe('0/4 completed');
 rows.push({repeat,mode,offscreenInnerText,textContent,onscreenInnerText});
}
await writeFile(output+'/verified.json',JSON.stringify({verified:true,model_calls:0,controller_sha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),rows,scope:'Synthetic browser reproduction of summary extraction assumption; does not reclassify native attempts or alter frozen tests.'},null,2)+'\n');
console.log(JSON.stringify({verified:true,rows:rows.length,output}));
}finally{await browser.close();}
