const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
test('Home discovery routes to a real series page and browser back restores Home',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {const page=await browser.newPage(); await page.goto('http://127.0.0.1:8765');
 await page.waitForSelector('#list li');
 assert.equal(await page.locator('h1').textContent(),'Home');
 await page.locator('.collection-card').first().click();
 await page.waitForFunction(()=>state.view==='series');
 assert.match(page.url(),/#series\?name=/); assert.equal(await page.locator('h1').textContent(),'How To Improve Your Chanting');
 assert.equal(await page.locator('#list li[data-id]').count(),8);
 await page.goBack(); await page.waitForFunction(()=>document.querySelector('h1').textContent==='Home'); assert.equal(await page.locator('h1').textContent(),'Home');
 }finally{await browser.close()}
});
test('Per-lecture resume migrates legacy progress and Now Playing is accessible on mobile',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto('http://127.0.0.1:8765');await page.evaluate(()=>localStorage.setItem('tkgtm.playback.v1',JSON.stringify({id:1,position:123,duration:2841,rate:1.25})));await page.reload();
 await page.waitForSelector('#player:not([hidden])');
 assert.equal(await page.locator('#continue-listening').isVisible(),true);
 await page.locator('#expand-player').click({timeout:1500});assert.equal(await page.locator('#now-playing').evaluate(d=>d.open),true);
 assert.equal(await page.locator('#now-playing #seek').isVisible(),true);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#now-playing').evaluate(d=>d.open),false);
 await page.evaluate(()=>{play(state.all.find(x=>x.id===2),{autoplay:false});persistPlayback(true);});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('tkgtm.positions.v1'))['1'].position),123);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }finally{await browser.close()}
});
test('Home is a short listening selection, with accessible rows and useful Library empty states',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto('http://127.0.0.1:8765');await page.waitForSelector('#list li');
 assert.equal(await page.locator('#list li').count(),6);
 assert.equal(await page.locator('#list li').first().locator('button.row-body').count(),1);
 await page.locator('.app-nav a[href="#library"]').click();await page.waitForFunction(()=>state.view==='library');
 assert.match(await page.locator('#empty-text').textContent(),/favourite/i);
 await page.locator('[data-library=history]').click();assert.match(await page.locator('#empty-text').textContent(),/listening/i);
 await page.keyboard.press('Control+k');await page.waitForFunction(()=>document.activeElement.id==='q');
 await page.locator('#q').fill('zzzzzzzznotfound');assert.equal(await page.locator('#list li').count(),0);
 }finally{await browser.close()}
});
test('Mobile heard action and favourite focus remain accessible',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto('http://127.0.0.1:8765/#browse');await page.waitForSelector('#list li');
 await page.locator('#list li').first().locator('[data-act=favourite]').click();
 assert.equal(await page.evaluate(()=>document.activeElement.dataset.act),'favourite');
 await page.evaluate(()=>play(state.list[0],{autoplay:false}));await page.locator('#expand-player').click();
 await page.locator('#np-heard').click({timeout:1500});assert.equal(await page.evaluate(()=>state.heard.has(state.playing)),true);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement.id==='expand-player');
 }finally{await browser.close()}
});
test('Search and filter state survives navigation back',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:8765/#search');await page.waitForSelector('#list li');
 await page.locator('#q').fill('Preaching');await page.locator('#series').selectOption('Brhad Mrdanga Series');
 const count=await page.locator('#list li').count();assert.ok(count>0);
 await page.locator('.app-nav a[href="#home"]:not(.identity)').click();await page.waitForFunction(()=>state.view==='home');await page.goBack();await page.waitForFunction(()=>state.view==='search');
 assert.equal(await page.locator('#q').inputValue(),'Preaching');assert.equal(await page.locator('#series').inputValue(),'Brhad Mrdanga Series');assert.equal(await page.locator('#list li').count(),count);
 }finally{await browser.close()}
});
test('Favourites are independent of downloads and survive reload',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:8765/#browse');await page.waitForSelector('#list li');
 const id=await page.locator('#list li').first().getAttribute('data-id');
 await page.locator('#list li').first().locator('[data-act=favourite]').click({timeout:1500});
 await page.locator('.app-nav a[href="#library"]').click();await page.waitForSelector('[data-library=favourites]');
 assert.equal(await page.locator('#list li').count(),1);assert.equal(await page.locator('#list li').first().getAttribute('data-id'),id);
 await page.reload();await page.waitForSelector('#list li');assert.equal(await page.locator('#list li').count(),1);
 await page.locator('[data-library=downloads]').click();assert.equal(await page.locator('#list li').count(),0);
 }finally{await browser.close()}
});
