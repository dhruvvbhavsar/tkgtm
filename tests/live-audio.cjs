const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base=process.env.TEST_URL||'http://127.0.0.1:8766';
test('Live audio: playback, skips, rate, cache download, offline reload and removal', {timeout:120000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/#search');await page.waitForSelector('#list li');
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForSelector('#list li');
  await page.locator('#q').fill('No One More Fortunate Than a Pujari');await page.locator('.play-btn').click();
  await page.waitForFunction(()=>audio.currentTime>1,null,{timeout:45000});
  console.log('LIVE STREAM',await page.evaluate(()=>({duration:audio.duration,position:audio.currentTime,paused:audio.paused})));
  await page.locator('#expand-player').click();await page.locator('#play').click();
  const before=await page.evaluate(()=>audio.currentTime);await page.locator('#forward').click();
  assert.ok(await page.evaluate(()=>audio.currentTime)>=before+14);
  await page.locator('#rate').click();assert.equal(await page.evaluate(()=>audio.playbackRate),1.25);
  await page.locator('#np-save').click();await page.waitForFunction(()=>state.saved.has(2940),null,{timeout:60000});
  console.log('CACHED AUDIO',await page.evaluate(async()=>{const c=await caches.open(AUDIO_CACHE);const r=await c.match(BASE+state.all.find(x=>x.id===2940).url);return{status:r.status,bytes:(await r.blob()).size}}));
  await page.locator('#close-player').click();await context.setOffline(true);await page.reload();
  await page.waitForSelector('#player:not([hidden])');await page.locator('#play').click();
  await page.waitForFunction(()=>audio.currentTime>17,null,{timeout:15000});
  console.log('OFFLINE PLAYBACK',await page.evaluate(()=>({position:audio.currentTime,duration:audio.duration})));
  await page.locator('#play').click();await page.locator('.app-nav a[href="#library"]').click();await page.waitForFunction(()=>state.view==='library');
  await page.locator('[data-library=downloads]').click();await page.locator('.save-btn').click();
  await page.waitForFunction(()=>!state.saved.has(2940));
  assert.equal(await page.locator('#list li').count(),0);
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
