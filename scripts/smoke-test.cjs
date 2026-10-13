'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const {chromium}=require('playwright-core');
const htmlPath=path.resolve('app/src/main/assets/index.html');
const html=fs.readFileSync(htmlPath,'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
for(let i=0;i<scripts.length;i++)new vm.Script(scripts[i][1],{filename:'inline-'+i+'.js'});
console.log('Inline JavaScript syntax OK:',scripts.length);
function wav(seconds=4){
 const rate=8000,n=seconds*rate,buf=Buffer.alloc(44+n*2);
 buf.write('RIFF',0);buf.writeUInt32LE(buf.length-8,4);buf.write('WAVEfmt ',8);
 buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);
 buf.writeUInt32LE(rate,24);buf.writeUInt32LE(rate*2,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);
 buf.write('data',36);buf.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)buf.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*220/rate)*3500),44+i*2);
 return buf;
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-web-security','--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('file://'+htmlPath,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(1200);
  assert(await page.locator('#uiLanguage').count(),'language selector missing');
  await page.locator('#uiLanguage').selectOption('en');
  await page.waitForTimeout(500);
  let text=await page.locator('body').innerText();
  console.log('DEBUG locale',await page.evaluate(()=>({selected:document.getElementById('uiLanguage').value,locale:window.GHLocale?.current?.(),heading:[...document.querySelectorAll('.panelHead')].slice(0,5).map(e=>e.innerText),ready:document.readyState})));
  console.log('DEBUG errors',errors.slice(0,10));
  for(const t of ['Teams & Score','Physics & Launch','Continuous motion','Select the music section','Background audio volume','Final result screen duration']){
    assert(text.toLowerCase().includes(t.toLowerCase()),'Missing English translation: '+t);
  }
  assert(!text.includes('Takımlar & Skor'),'Turkish heading still shown');
  console.log('English interface: OK');
  await page.locator('#bgmFile').setInputFiles({name:'test.wav',mimeType:'audio/wav',buffer:wav(4)});
  await page.waitForFunction(()=>typeof backgroundMusicBuffer!=='undefined'&&!!backgroundMusicBuffer,{timeout:12000});
  await page.locator('#bgmTrimStart').fill('0.8');
  await page.locator('#bgmTrimStart').dispatchEvent('change');
  await page.locator('#bgmTrimEnd').fill('2.3');
  await page.locator('#bgmTrimEnd').dispatchEvent('change');
  const trim=await page.evaluate(()=>bgmRange());
  assert(Math.abs(trim[0]-.8)<.15&&Math.abs(trim[1]-2.3)<.15,'Audio trim incorrect: '+JSON.stringify(trim));
  console.log('Audio trim: OK',trim);
  await page.evaluate(()=>{
    document.getElementById('bgmEnabled').checked=false;
    document.getElementById('ballCount').value='4';
    document.getElementById('scriptedResult').checked=false;
    document.getElementById('autoFinish').checked=false;
    document.getElementById('continuousMotion').checked=true;
    document.getElementById('motionSpeed').value='1600';
    document.getElementById('playBtn').click();
  });
  await page.waitForTimeout(2500);
  const motion=await page.evaluate(()=>balls.filter(b=>b.active&&b.released&&b.hasLaunched).map(b=>Math.hypot(b.vx,b.vy)));
  assert(motion.length>0,'No launched balls');
  assert(motion.every(v=>v>1400&&v<1800),'Motion decayed: '+JSON.stringify(motion));
  console.log('Continuous motion: OK',motion);
  await page.locator('#uiLanguage').selectOption('tr');
  await page.waitForTimeout(250);
  text=await page.locator('body').innerText();
  assert(text.includes('Takımlar & Skor'),'Turkish switch back failed');
  console.log('Turkish switch back: OK');
  assert(!errors.length,'Browser errors: '+errors.join('; '));
  console.log('ALL TESTS PASSED');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
