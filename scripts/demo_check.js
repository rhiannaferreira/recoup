// Walks the whole demo path (start, confirm, results, draft, packet, About) for both samples,
// in English and Spanish, at laptop and phone width. Flags errors, empty strings and
// anything wider than the screen. Run with the server up: node scripts/demo_check.js

const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const out=[];
  for (const [w,h] of [[1360,900],[390,844]]) for (const lang of ['en','es']) for (const sample of ['maria','rosa']) {
    const p = await b.newPage({ viewport:{width:w,height:h} }); const errs=[];
    p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
    await p.goto(process.env.RECOUP_URL || 'http://localhost:8000/'); await p.evaluate(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
    if (lang==='es') await p.click('[data-lang=es]');
    const ov = async (tag)=>{ const o=await p.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth); if(o>0) errs.push(`${tag} overflow ${o}px`);
      const missing = await p.evaluate(()=>[...document.querySelectorAll('[data-i18n]')].filter(e=>e.offsetParent&&!e.textContent.trim()).map(e=>e.dataset.i18n)); if(missing.length) errs.push(`${tag} empty: ${missing}`);
      const und = await p.evaluate(()=>document.body.innerText.match(/undefined|NaN|\[object/g)); if(und) errs.push(`${tag} text: ${und}`); };
    await ov('start');
    await p.click(`[data-sample=${sample}]`); await p.waitForTimeout(600); await ov('confirm');
    await p.click('#run'); await p.waitForTimeout(1500); await ov('results');
    await p.click('.entry-row'); await p.waitForTimeout(200);
    const dr = await p.$('[data-draft]'); if (dr) { await dr.click(); await p.waitForTimeout(800); await ov('sheet'); await p.keyboard.press('Escape'); }
    await p.click('#openPacket'); await p.waitForTimeout(800); await ov('packet');
    await p.click('#aboutLink'); await p.waitForTimeout(800); await ov('about');

    out.push(`${w} ${lang} ${sample}: ${errs.length?errs.join(' | '):'ok'}`); await p.close();
  }
  console.log(out.join('\n')); await b.close();
})();
