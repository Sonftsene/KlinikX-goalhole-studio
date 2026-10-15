'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const {chromium}=require('playwright-core');
const htmlPath=path.resolve('app/src/main/assets/index.html');
const html=fs.readFileSync(htmlPath,'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
for(let i=0;i<scripts.length;i++)new vm.Script(scripts[i][1],{filename:'inline-'+i+'.js'});
console.log('Inline JavaScript syntax OK:',scripts.length);
new vm.Script(fs.readFileSync(path.resolve('app/src/main/assets/football11.js'),'utf8'),{filename:'football11.js'});
console.log('11v11 match engine syntax OK');
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
  for(const t of ['Teams & Score','Physics & Launch','Continuous motion','Select the music section','Background audio volume','Final screen duration']){
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
  const motion=await page.evaluate(()=>balls.filter(b=>b.active&&b.released&&b.hasLaunched&&b.id!==timedShot?.ballId).map(b=>Math.hypot(b.vx,b.vy)));
  assert(motion.length>0,'No launched balls');
  assert(motion.every(v=>v>1400&&v<1800),'Motion decayed: '+JSON.stringify(motion));
  console.log('Continuous motion: OK',motion);
  await page.locator('#uiLanguage').selectOption('tr');
  await page.waitForTimeout(250);
  text=await page.locator('body').innerText();
  assert(text.toLocaleLowerCase('tr-TR').includes('takımlar & skor'),'Turkish switch back failed');
  console.log('Turkish switch back: OK');
  await page.evaluate(()=>{
    document.getElementById('timedMatch').checked=true;
    document.getElementById('matchDuration').value='3';
    document.getElementById('goalTimes').value='0.5,1.5,2.5';
    document.getElementById('scriptedResult').checked=false;
    document.getElementById('scoreWidth').value='90';
    document.getElementById('scoreFont').value='150';
    document.getElementById('scoreX').value='55';
    document.getElementById('scoreY').value='12';
    document.getElementById('resetBtn').click();
    if(mode==='edit')document.getElementById('playBtn').click();
  });
  const timed=await page.evaluate(()=>{
    const hits=[];const oldGoal=goal;
    goal=(h,b)=>{hits.push({at:matchElapsed(),distance:Math.hypot(h.x-b.x,h.y-b.y),radius:h.r});oldGoal(h,b)};
    matchClockStart=performance.now();
    for(let i=0;i<430&&!roundFinished;i++){
      matchClockStart-=1000/120;
      physicsStep(1/120);
    }
    return {finished:roundFinished,score:score.left+score.right,elapsed:matchElapsed(),goals:timedGoalIndex,hits};
  });
  assert(timed.finished,'Timed match did not finish: '+JSON.stringify(timed));
  assert(timed.score===3&&timed.goals===3,'Scheduled goals did not enter holes: '+JSON.stringify(timed));
  assert(timed.hits.every(x=>x.distance<=x.radius),'Goal awarded outside hole: '+JSON.stringify(timed.hits));
  assert(timed.hits.every((x,i)=>Math.abs(x.at-[.5,1.5,2.5][i])<.25),'Goals not timed: '+JSON.stringify(timed.hits));
  console.log('Timed goals and exact match finish: OK',timed);
  const viral=await page.evaluate(()=>{
    const old={w:canvas.width,h:canvas.height,holes:objects.filter(o=>o.type==='hole').map(o=>({x:o.x,y:o.y,r:o.r}))};
    document.getElementById('viralPreset').click();
    const plan=goalPlan.map(e=>e.side);
    return {old,w:canvas.width,h:canvas.height,balls:+document.getElementById('ballCount').value,
      fps:+document.getElementById('fps').value,goalTimes:scheduledGoalSeconds(),plan,
      holes:objects.filter(o=>o.type==='hole').map(o=>({x:o.x,y:o.y,r:o.r})),
      duration:+document.getElementById('matchDuration').value,
      viralHook:document.getElementById('viralHook').checked};
  });
  assert(viral.w===1080&&viral.h===1920,'Viral preset wrong dimensions: '+JSON.stringify(viral));
  assert(viral.fps===60&&viral.duration===21&&viral.balls===7&&viral.viralHook,'Viral preset incorrect: '+JSON.stringify(viral));
  assert(viral.plan.filter(x=>x==='left').length===3&&viral.plan.filter(x=>x==='right').length===4,'Wrong 3-4 script: '+JSON.stringify(viral.plan));
  assert(viral.goalTimes.length===7,'Wrong goal timing count: '+JSON.stringify(viral.goalTimes));
  for(let i=0;i<viral.holes.length;i++){
    assert(Math.abs(viral.holes[i].x-viral.old.holes[i].x*viral.w/viral.old.w)<1,'Field x geometry changed');
    assert(Math.abs(viral.holes[i].y-viral.old.holes[i].y*viral.h/viral.old.h)<1,'Field y geometry changed');
  }
  console.log('Viral preset, score script, field scaling: OK');
  const persisted=await page.evaluate(()=>serialize(false).viral);
  assert(persisted.viralCamera&&persisted.viralLoop&&persisted.viralGlow,'Viral settings not persisted');
  console.log('Viral settings persistence: OK');
  const viralMatch=await page.evaluate(()=>{
    document.getElementById('resetBtn').click();
    if(mode==='edit')document.getElementById('playBtn').click();
    matchClockStart=performance.now();
    for(let i=0;i<2700&&!roundFinished;i++){matchClockStart-=1000/120;physicsStep(1/120)}
    return {finished:roundFinished,left:score.left,right:score.right,goals:timedGoalIndex,elapsed:matchElapsed()};
  });
  assert(viralMatch.finished,'Viral preset did not finish: '+JSON.stringify(viralMatch));
  assert(viralMatch.left===3&&viralMatch.right===4,'Viral preset did not produce 3-4: '+JSON.stringify(viralMatch));
  console.log('21-second viral 3-4 match: OK',viralMatch);
  const tournamentTest=await page.evaluate(()=>{
    document.getElementById('tournamentSize').value='8';
    document.getElementById('tournamentTeams').value='Real Madrid, Barcelona, Arsenal, Liverpool, Bayern, Inter, Roma, PSG';
    document.getElementById('createTournament').click();
    document.getElementById('tournamentNext').click();
    const names=[document.getElementById('leftName').value,document.getElementById('rightName').value];
    score.left=2;score.right=1;
    document.getElementById('tournamentWinner').click();
    return {names,winner:tournament.rounds[0][0].winner,advance:tournament.rounds[1][0].a,saved:!!localStorage.getItem('goalhole_tournament_v1')};
  });
  assert(tournamentTest.names[0]==='Real Madrid'&&tournamentTest.names[1]==='Barcelona','Tournament fixture incorrect: '+JSON.stringify(tournamentTest));
  assert(tournamentTest.winner==='Real Madrid'&&tournamentTest.advance==='Real Madrid'&&tournamentTest.saved,'Tournament advancement failed: '+JSON.stringify(tournamentTest));
  console.log('Tournament bracket and progression: OK');
  const special=await page.evaluate(()=>{
    document.getElementById('specialBalls').checked=true;
    document.getElementById('scriptedResult').checked=false;
    document.getElementById('goldMultiplier').value='2';
    document.getElementById('powerupChance').value='0';
    resetRound();
    const b=balls[0],h=scoringHoles()[0];b.x=h.x;b.y=h.y;b.released=true;
    goal(h,b);
    return {gold:b.specialGold,score:score.left+score.right};
  });
  assert(special.gold&&special.score===2,'Golden ball multiplier failed: '+JSON.stringify(special));
  console.log('Special golden ball: OK');
  const football=await page.evaluate(()=>{
    document.getElementById('gameType').value='football11';
    document.getElementById('gameType').dispatchEvent(new Event('change'));
    document.getElementById('footballDuration').value='20';
    document.getElementById('footballPreset').click();
    const F=window.Football11;
    return {enabled:F.enabled(),players:F.state.players.length,keepers:F.state.players.filter(p=>p.role==='GK').length,
      ball:F.state.ball,dimensions:[canvas.width,canvas.height]};
  });
  assert(football.enabled&&football.players===22&&football.keepers===2,'11v11 players missing: '+JSON.stringify(football));
  assert(football.ball&&football.dimensions[0]===1080&&football.dimensions[1]===1920,'11v11 setup incorrect');
  console.log('11v11 22-player pitch and one match ball: OK');
  const footballPlay=await page.evaluate(()=>{
    const F=window.Football11;
    if(mode==='edit')document.getElementById('playBtn').click();
    for(let i=0;i<4000;i++)F.step(1/120);
    return {passes:F.state.passes,shots:F.state.shots,turnovers:F.state.turnovers,elapsed:F.state.elapsed,events:F.state.events.length};
  });
  assert(footballPlay.passes>1&&footballPlay.events>1,'No football attacks or passing: '+JSON.stringify(footballPlay));
  console.log('AI passing and tactical play: OK',footballPlay);
  const footballGoal=await page.evaluate(()=>{
    const F=window.Football11;
    document.getElementById('scriptedResult').checked=false;
    document.getElementById('goalTimes').value='';
    F.reset(true);
    const b=F.state.ball;
    for(const p of F.state.players.filter(x=>x.team===1)){p.x=10;p.y=50}
    b.owner=null;b.mode='shot';b.team=0;b.lastTouch=0;b.x=50;b.y=7;b.vx=0;b.vy=-105;
    for(let i=0;i<30;i++)F.step(1/120);
    return {score:score.left,goals:F.state.goals.length,goal:F.state.goals[0]};
  });
  assert(footballGoal.score===1&&footballGoal.goals===1,'Goal-line shot not scored: '+JSON.stringify(footballGoal));
  console.log('Real shot crossing goal line: OK',footballGoal);
  const footballFinish=await page.evaluate(()=>{
    const F=window.Football11;
    F.reset(true);
    document.getElementById('footballDuration').value='15';
    for(let i=0;i<1850&&!roundFinished;i++)F.step(1/120);
    return {finished:roundFinished,elapsed:F.state.elapsed,duration:+document.getElementById('footballDuration').value};
  });
  assert(footballFinish.finished&&Math.abs(footballFinish.elapsed-footballFinish.duration)<.05,'Football match did not finish on time: '+JSON.stringify(footballFinish));
  console.log('11v11 exact match duration: OK');
  const synced=await page.evaluate(()=>{
    const F=window.Football11;
    document.getElementById('footballDuration').value='20';
    document.getElementById('footballClock').value='60';
    document.getElementById('footballSyncGoals').checked=true;
    document.getElementById('goalTimes').value='5, 11, 18';
    document.getElementById('scriptedResult').checked=true;
    goalPlan=[makePlanEvent('left',{scorer:'Vinicius',minute:'15'}),
              makePlanEvent('right',{scorer:'Dybala',minute:'33'}),
              makePlanEvent('left',{scorer:'Bellingham',minute:'54'})];
    F.reset(true);
    const events=[];
    let last=0;
    for(let i=0;i<2440&&!roundFinished;i++){
      F.step(1/120);
      if(F.state.goals.length>last){events.push({...F.state.goals[F.state.goals.length-1]});last=F.state.goals.length}
    }
    return {events,finished:roundFinished,elapsed:F.state.elapsed,clock:F.clockSecond(),score:[score.left,score.right],
      schedule:F.goalSchedule()};
  });
  assert(synced.finished&&Math.abs(synced.clock-60)<.1,'3x football match clock failed: '+JSON.stringify(synced));
  assert(synced.events.length===3&&synced.score[0]===2&&synced.score[1]===1,'Scripted 11v11 goals missing: '+JSON.stringify(synced));
  assert(synced.events.every((e,i)=>Math.abs(e.second-[5,11,18][i])<.12),'Scripted goals not at exact video seconds: '+JSON.stringify(synced));
  assert(synced.events[0].scorer==='Vinicius'&&synced.events[1].scorer==='Dybala','Scorer names not synced: '+JSON.stringify(synced));
  console.log('11v11 20-second video, 60-second match clock, three timed real goals and scorers: OK',synced);
  const matchUnit=await page.evaluate(()=>{
    goalPlan=[];document.getElementById('scriptedResult').checked=false;
    document.getElementById('footballGoalTimeUnit').value='match';
    document.getElementById('goalTimes').value='15, 33, 54';
    const t=window.Football11.goalSchedule();
    document.getElementById('footballGoalTimeUnit').value='video';
    return t;
  });
  assert(matchUnit.every((v,i)=>Math.abs(v-[5,11,18][i])<.01),'Match-clock goal time conversion failed: '+JSON.stringify(matchUnit));
  console.log('11v11 match-clock timestamp conversion 15/33/54 → video 5/11/18: OK');
  const stoppage=await page.evaluate(()=>{
    const F=window.Football11;
    document.getElementById('footballDuration').value='20';
    document.getElementById('footballClock').value='90';
    document.getElementById('footballExtraFirst').value='2';
    document.getElementById('footballExtraSecond').value='4';
    document.getElementById('footballGoalTimeUnit').value='match';
    document.getElementById('goalTimes').value='45+2, 70, 90+3';
    const schedule=F.goalSchedule(),total=F.totalMatchSeconds(),half=F.halfVideoSecond();
    F.reset(true);
    F.state.elapsed=half*.98;const beforeHalf=F.clockLabel();
    F.state.elapsed=half;const atHalf=F.clockLabel();
    F.state.elapsed=half+.3;const afterHalf=F.clockLabel();
    F.state.elapsed=20;const final=F.clockLabel();
    return {schedule,total,half,beforeHalf,atHalf,afterHalf,final};
  });
  assert(stoppage.total===96&&Math.abs(stoppage.half-(47/96)*20)<.01,
    'Stoppage match duration or halftime incorrect: '+JSON.stringify(stoppage));
  assert(stoppage.atHalf==='45+2'&&stoppage.afterHalf==='46'&&stoppage.final==='90+4',
    'Stoppage-time clock labels incorrect: '+JSON.stringify(stoppage));
  assert(stoppage.schedule.length===3&&stoppage.schedule.every((v,i)=>Math.abs(v-[47,72,95][i]/96*20)<.001),
    '45+ and 90+ goal scheduling incorrect: '+JSON.stringify(stoppage));
  console.log('90-second match with 45+2 and 90+4, 45+2/90+3 goals, and halftime: OK',stoppage);
  const minutePlan=await page.evaluate(()=>{
    const F=window.Football11;
    document.getElementById('footballDuration').value='90';
    document.getElementById('footballClock').value='90';
    document.getElementById('footballExtraFirst').value='0';
    document.getElementById('footballExtraSecond').value='0';
    document.getElementById('goalTimes').value='';
    document.getElementById('goalInterval').value='';
    document.getElementById('firstGoalSecond').value='';
    document.getElementById('scriptedResult').checked=true;
    document.getElementById('footballSyncGoals').checked=true;
    goalPlan=[makePlanEvent('left',{scorer:'Haaland',minute:'20.dk'}),
              makePlanEvent('right',{scorer:'Messi',minute:'45'}),
              makePlanEvent('left',{scorer:'Mbappe',minute:'80'})];
    const schedule=F.goalSchedule(),minutes=goalPlan.map(p=>F.planMinuteSecond(p.minute));
    F.reset(true);
    let last=0;const events=[];
    for(let i=0;i<11000&&!roundFinished;i++){
      F.step(1/120);
      if(F.state.goals.length>last){events.push({...F.state.goals[F.state.goals.length-1]});last=F.state.goals.length}
    }
    const noPlan=(()=>{goalPlan=[];document.getElementById('scriptedResult').checked=false;return F.goalSchedule()})();
    return {schedule,minutes,events,finished:roundFinished,elapsed:F.state.elapsed,noPlan};
  });
  assert(minutePlan.schedule.every((v,i)=>Math.abs(v-[20,45,80][i])<.01),
    '90s match minute-to-second conversion incorrect: '+JSON.stringify(minutePlan));
  assert(minutePlan.events.length===3&&minutePlan.events.every((e,i)=>Math.abs(e.second-[20,45,80][i])<.15),
    'Goal-plan minute does not match physical goal second: '+JSON.stringify(minutePlan));
  assert(minutePlan.events.map(e=>e.scorer).join(',')==='Haaland,Messi,Mbappe',
    'Planned scorer not attached to goal: '+JSON.stringify(minutePlan));
  assert(minutePlan.finished&&minutePlan.noPlan.length===0,
    'Goal intervals must not be mandatory: '+JSON.stringify(minutePlan));
  console.log('90s match, goals at exactly 20/45/80, named scorers and no goal intervals: OK',minutePlan);



  assert(!errors.length,'Browser errors: '+errors.join('; '));
  console.log('ALL TESTS PASSED');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
