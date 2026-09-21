const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');

test('Installed-phone safe area stays outside the compact text navigation',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:393,height:852},serviceWorkers:'block'});
  // Desktop emulation reports zero for env(); explicitly simulate the home indicator inset.
  await page.route('**/style.css',async route=>{
   const response=await route.fetch();
   const css=(await response.text()).replace(/env\(safe-area-inset-bottom,\s*0px\)/g,'34px');
   await route.fulfill({response,body:css,contentType:'text/css'});
  });
  await page.goto('http://127.0.0.1:8765/');
  await page.waitForSelector('#list li');
  await page.evaluate(()=>play(state.list[0],{autoplay:false}));
  const measurements=await page.evaluate(()=>{
   const nav=document.querySelector('.dock .app-nav');
   const player=document.querySelector('#player');
   const dock=document.querySelector('.dock');
   return {padding:parseFloat(getComputedStyle(nav).paddingBottom),nav:nav.getBoundingClientRect().height,
    player:player.getBoundingClientRect().height,bottom:innerHeight-dock.getBoundingClientRect().bottom,
    overlap:player.getBoundingClientRect().bottom>nav.getBoundingClientRect().top,
    icons:[...nav.querySelectorAll('svg')].some(el=>getComputedStyle(el).display!=='none')};
  });
  console.log(measurements);
  assert.ok(measurements.padding<=6,'Do not put safe-area padding inside the tab pill');
  assert.ok(measurements.nav<=56,'Text-only tabs should remain compact with a nonzero safe area');
  assert.ok(measurements.player<=78,'Player should not reserve a separate grabber row');
  assert.ok(measurements.bottom>=34&&measurements.bottom<=40,'Account for the home indicator exactly once');
  assert.equal(measurements.overlap,false);
  assert.equal(measurements.icons,false);
  await page.locator('#expand-player').click();
  assert.equal(await page.locator('#now-playing').evaluate(el=>el.open),true);
  await page.keyboard.press('Escape');
 }finally{await browser.close();}
});
