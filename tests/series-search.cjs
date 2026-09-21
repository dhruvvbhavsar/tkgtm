const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const SERIES='Sri Isopanisad Series';

test('Series page lists lectures 1-N in archive order with progress and play-all',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:8765/#series?name='+encodeURIComponent(SERIES));
 await page.waitForSelector('#series-hero:not([hidden])');
 const ids=await page.locator('#list li[data-id]').evaluateAll(els=>els.map(e=>Number(e.dataset.id)));
 assert.ok(ids.length>5);
 // Verse order, not archive-id order: Invocation first, then mantra 1, 2, 3…
 const verses=await page.locator('#list li .row-meta').evaluateAll(els=>els.map(e=>e.textContent));
 const mantraNo=(t)=>/invocation/i.test(t)?0:Number((t.match(/Iso\s*(\d+)/)||[])[1]);
 const nos2=verses.map(mantraNo);
 assert.equal(nos2[0],0);
 assert.deepEqual([...nos2].sort((a,b)=>a-b),nos2);
 const nos=await page.locator('#list li .episode-no').evaluateAll(els=>els.map(e=>e.textContent));
 assert.equal(nos[0],'01');assert.equal(nos[nos.length-1],String(ids.length).padStart(2,'0'));
 const firstMeta=await page.locator('#list li .row-meta').first().textContent();
 assert.match(firstMeta,/Invocation/);
 assert.match(await page.locator('#series-progress').textContent(),/0 of \d+ heard/);
 assert.equal(await page.locator('#count').textContent(),ids.length+' in sequence');
 await page.locator('#series-play-all').click();
 await page.waitForSelector('#player:not([hidden])');
 assert.equal(await page.evaluate(()=>state.playing),ids[0]);
 assert.equal(await page.evaluate(()=>state.queue.length),ids.length);
 assert.equal(await page.evaluate(()=>state.queue[0].id),ids[0]);
 }finally{await browser.close()}
});

test('Series continue resumes the first unheard lecture and progress counts heard',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:8765/#series?name='+encodeURIComponent(SERIES));
 await page.waitForSelector('#series-hero:not([hidden])');
 const ids=await page.locator('#list li[data-id]').evaluateAll(els=>els.map(e=>Number(e.dataset.id)));
 await page.evaluate((pair)=>{toggleHeard(pair[0]);toggleHeard(pair[1]);},[ids[0],ids[1]]);
 assert.match(await page.locator('#series-progress').textContent(),new RegExp(`2 of ${ids.length} heard`));
 await page.locator('#series-continue').click();
 await page.waitForFunction((third)=>state.playing===third,ids[2]);
 }finally{await browser.close()}
});

test('Search groups verse matches ahead of the flat lecture list',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:8765/#search');
 await page.waitForSelector('#list li');
 await page.locator('#q').fill('SB 7.5');
 await page.waitForSelector('li.group-head');
 const heads=await page.locator('li.group-head').evaluateAll(els=>els.map(e=>e.textContent));
 assert.ok(heads.includes('Verses'));
 const firstVerseRow=await page.locator('li.group-head').first().evaluate(e=>{let n=e.nextElementSibling;while(n&&!n.dataset.id)n=n.nextElementSibling;return n?n.innerText:'';});
 assert.match(firstVerseRow,/SB 7\.5/);
 }finally{await browser.close()}
});

test('Search surfaces matching series as openable pages',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:8765/#search');
 await page.waitForSelector('#list li');
 await page.locator('#q').fill('Isopanisad');
 await page.waitForSelector('li.series-hit a');
 await page.locator('li.series-hit a').first().click();
 await page.waitForFunction(()=>state.view==='series');
 assert.match(page.url(),/#series\?name=/);
 assert.ok((await page.locator('#list li[data-id]').count())>5);
 }finally{await browser.close()}
});
