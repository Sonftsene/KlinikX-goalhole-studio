/* GoalHole Studio Pro — Eleven-a-side football simulation (offline 2D).
 * The simulation uses one match ball, two independent squads, real trajectories
 * and goal-line detection. It does not use the pinball scoring director. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const W=100,H=160,CX=50,GOAL_HALF=9;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const rnd=(a,b)=>a+Math.random()*(b-a);
const lerp=(a,b,t)=>a+(b-a)*t;
const layout=[
 {role:'GK',x:50,y:146,n:1},
 {role:'DEF',x:17,y:120,n:2},{role:'DEF',x:39,y:125,n:4},
 {role:'DEF',x:61,y:125,n:5},{role:'DEF',x:83,y:120,n:3},
 {role:'MID',x:24,y:99,n:6},{role:'MID',x:50,y:103,n:8},{role:'MID',x:76,y:99,n:10},
 {role:'FWD',x:20,y:70,n:7},{role:'FWD',x:50,y:67,n:9},{role:'FWD',x:80,y:70,n:11}
];
const state={
 players:[],ball:null,elapsed:0,phase:'kickoff',possessions:[0,0],
 events:[],goals:[],current:null,cooldown:0,freeze:0,lastEvent:'',
 eventTime:0,passes:0,shots:0,saves:0,turnovers:0,halftime:false,
 camera:{x:50,y:80,zoom:1},lastShot:null,goalAnimation:null,scriptIndex:0,director:null,fx:[],lastDramaTick:-1,goalCard:null
};
function enabled(){return $('gameType')?.value==='football11'}
let crowdSource=null,crowdGain=null;
function startCrowd(){
 if(!enabled()||!$('footballCrowd')?.checked||crowdSource)return;
 try{
  ensureAudio();if(!audioCtx)return;
  const rate=audioCtx.sampleRate,n=rate*2,buffer=audioCtx.createBuffer(1,n,rate);
  const data=buffer.getChannelData(0);
  // Gentle filtered crowd roar, generated locally; no copyrighted audio.
  for(let i=0;i<n;i++)data[i]=(Math.random()*2-1)*.23;
  crowdSource=audioCtx.createBufferSource();crowdSource.buffer=buffer;crowdSource.loop=true;
  const filter=audioCtx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=650;
  crowdGain=audioCtx.createGain();crowdGain.gain.value=.045;
  crowdSource.connect(filter).connect(crowdGain).connect(sfxGain||audioMaster);
  crowdSource.start();
 }catch(e){crowdSource=null;crowdGain=null}
}
function stopCrowd(){
 if(crowdSource){try{crowdSource.stop();crowdSource.disconnect()}catch(e){}}
 crowdSource=null;crowdGain=null;
}
function boostCrowd(){
 if(!crowdGain||!audioCtx)return;
 const t=audioCtx.currentTime;
 crowdGain.gain.cancelScheduledValues(t);
 crowdGain.gain.setValueAtTime(.045,t);
 crowdGain.gain.linearRampToValueAtTime(.13,t+.14);
 crowdGain.gain.exponentialRampToValueAtTime(.045,t+1.35);
}
function duration(){return Math.max(5,Number($('footballDuration')?.value)||20)}
function clockDuration(){return Math.max(10,Number($('footballClock')?.value)||90)}
function extraFirst(){return clamp(Math.floor(Number($('footballExtraFirst')?.value)||0),0,120)}
function extraSecond(){return clamp(Math.floor(Number($('footballExtraSecond')?.value)||0),0,120)}
function totalMatchSeconds(){return clockDuration()+extraFirst()+extraSecond()}
function halfSecond(){return clockDuration()/2}
function halfVideoSecond(){return duration()*(halfSecond()+extraFirst())/totalMatchSeconds()}
function clockSecond(){return state.elapsed/duration()*totalMatchSeconds()}
function clockLabel(t=clockSecond()){
 t=Math.max(0,Math.floor(t+1e-6));
 const half=halfSecond(),first=extraFirst(),normal=clockDuration();
 if(t<=half)return String(t);
 if(t<=half+first)return String(half)+'+'+String(t-half);
 if(t<=normal+first)return String(t-first);
 return String(normal)+'+'+String(t-normal-first);
}
function parseMatchSecond(token){
 const v=String(token).trim(),m=v.match(/^(\d+(?:\.\d+)?)\+(\d+(?:\.\d+)?)$/);
 const half=halfSecond(),normal=clockDuration(),first=extraFirst(),second=extraSecond();
 if(m){
  const base=Number(m[1]),added=Number(m[2]);
  if(Math.abs(base-half)<.001&&added<=first)return half+added;
  if(Math.abs(base-normal)<.001&&added<=second)return normal+first+added;
  return NaN;
 }
 const plain=Number(v);
 if(!Number.isFinite(plain)||plain<0||plain>normal)return NaN;
 return plain>half?plain+first:plain;
}
function fmtClock(t){t=Math.max(0,Math.floor(t));return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')}
function scripted(){return !!$('footballSyncGoals')?.checked}
// Match minutes in the goal plan are authoritative. A 90-second video
// with a 90-minute simulated match uses a 1:1 minute-to-video-second timeline.
function planMinuteSecond(value){
 const v=String(value??'').trim().replace(/(?:dakika|dak|dk|minute|min)\.?/gi,'').replace(/[′’']/g,'').replace(/\.$/,'').trim();
 if(!v)return NaN;
 return parseMatchSecond(v);
}
function plannedEvents(){
 if(!$('scriptedResult')?.checked||!goalPlan.length)return [];
 const n=goalPlan.length,full=totalMatchSeconds();
 const items=goalPlan.map((event,i)=>{
  const minute=planMinuteSecond(event.minute);
  return {event,order:i,matchAt:Number.isFinite(minute)?minute:(i+1)*full/(n+1)};
 });
 items.sort((a,b)=>a.matchAt-b.matchAt||a.order-b.order);
 return items.map(({event,matchAt})=>({event,videoAt:matchAt/full*duration()}));
}
function plannedEventAt(index){return plannedEvents()[index]?.event||null}
function goalSchedule(){
 if(!scripted())return [];
 const plan=plannedEvents();
 // No interval input is needed when the goal plan contains minutes.
 if(plan.length)return plan.map(p=>p.videoAt).filter(v=>v>.15&&v<duration());
 const raw=$('goalTimes')?.value?.trim()||'';
 const matchUnits=$('footballGoalTimeUnit')?.value==='match',factor=duration()/totalMatchSeconds();
 if(raw)return raw.split(/[,;\\s]+/).map(v=>v.includes('+')||matchUnits?parseMatchSecond(v)*factor:Number(v))
  .filter(v=>Number.isFinite(v)&&v>.15&&v<duration()).sort((a,b)=>a-b);
 // In 11v11, a blank goal-time field means natural, unscripted football.
 // Unlike pinball mode, there is no mandatory first-goal or interval timer.
 return [];
}
function speed(){return clamp((Number($('footballSpeed')?.value)||1.3)*Math.sqrt(totalMatchSeconds()/duration()),.5,5.5)}
function tactic(side){return $('footballTactic'+(side===0?'Left':'Right'))?.value||'balanced'}
function pitch(){const w=canvas.width,h=canvas.height;const marginX=w*.075,marginY=h*.155;
 const pw=w-marginX*2,ph=h*.69;
 return {x:marginX,y:marginY,w:pw,h:ph,sx:pw/W,sy:ph/H}}
function toCanvas(x,y){const p=pitch();return{x:p.x+x*p.sx,y:p.y+y*p.sy}}
function say(msg,seconds=1.9){state.lastEvent=msg;state.eventTime=state.elapsed+seconds;state.events.push({at:state.elapsed,text:msg});if(state.events.length>30)state.events.shift()}
function teamName(side){return ($(side===0?'leftName':'rightName')?.value|| (side===0?'HOME':'AWAY')).trim()}
function color(side){return $(side===0?'leftColor':'rightColor')?.value|| (side===0?'#f59e0b':'#e11d48')}
function setCarrier(p){
 if(!p||!state.ball)return;
 const b=state.ball;b.owner=p;b.mode='carry';b.team=p.team;b.vx=0;b.vy=0;
 p.decision=rnd(.32,.83);
 state.current=p;
}
function reset(quiet=false){
 state.players=[];state.elapsed=0;state.phase='kickoff';state.possessions=[0,0];
 state.events=[];state.goals=[];state.current=null;state.cooldown=0;state.freeze=0;
 state.lastEvent='';state.eventTime=0;state.passes=0;state.shots=0;state.saves=0;
 state.turnovers=0;state.halftime=false;state.lastShot=null;state.goalAnimation=null;state.scriptIndex=0;state.director=null;state.fx=[];state.lastDramaTick=-1;state.goalCard=null;
 state.camera={x:50,y:80,zoom:1};state.ballHistory=[];state.ballTrailClock=0;
 for(let team=0;team<2;team++)for(const p of layout){
  const y=team===0?p.y:H-p.y;
  state.players.push({team,n:p.n,role:p.role,x:p.x,y,homeX:p.x,homeY:y,
   tx:p.x,ty:y,face:team===0?-1:1,stamina:1,decision:rnd(.3,1.5),run:0,
   touch:0,anim:0});
 }
 state.ball={x:50,y:80,vx:0,vy:0,owner:null,mode:'free',team:0,
  target:null,flight:0,spin:0,lastTouch:0};
 const side=Math.random()<.5?0:1;
 const kickoff=state.players.filter(p=>p.team===side&&p.role==='MID')
  .sort((a,b)=>Math.abs(a.x-50)-Math.abs(b.x-50))[0];
 kickoff.x=50;kickoff.y=80;
 setCarrier(kickoff);
 state.phase='live';
 score={left:0,right:0};updateScores();
 roundFinished=false;roundResultOverlay=null;goalOverlay=null;
 if(!quiet)say('KICK OFF • '+teamName(side).toUpperCase(),1.1);
 updateStats();
}
function updateStats(){
 if(!$('footballStats'))return;
 const p=state.possessions,percent=Math.round(100*p[0]/Math.max(.001,p[0]+p[1]));
 $('footballStats').textContent='⚽ '+teamName(0)+' '+score.left+'–'+score.right+' '+teamName(1)+
 '  •  '+clockLabel()+'/'+clockLabel(totalMatchSeconds())+' (×'+(totalMatchSeconds()/duration()).toFixed(2)+')  •  Possession '+percent+'%–'+(100-percent)+'%'+
 '  •  '+state.shots+' shots  •  '+state.passes+' passes';
}
function nearestOpponent(p){let best=null,d=Infinity;for(const q of state.players){
 if(q.team===p.team)continue;const v=dist(p,q);if(v<d){best=q;d=v}
}return {player:best,d}}
function advance(p,dt,tx,ty,rate){
 const dx=tx-p.x,dy=ty-p.y,d=Math.hypot(dx,dy);
 if(d<.03)return;
 const step=Math.min(d,rate*dt);p.x=clamp(p.x+dx/d*step,2,98);
 p.y=clamp(p.y+dy/d*step,1,159);p.face=dy>=0?1:-1;p.anim+=step*.2;
}
function roleTarget(p,owner){
 const attack=p.team===0?-1:1;
 const ownBall=owner&&owner.team===p.team;
 const t=tactic(p.team);
 const press=t==='press'?14:t==='counter'?6:9;
 const bx=state.ball.x,by=state.ball.y;
 if(p.role==='GK')return{x:clamp(bx,40,60),y:p.team===0?153:7};
 let tx=p.homeX,ty=p.homeY;
 if(ownBall){
  const shift=t==='possession'?16:t==='counter'?30:23;
  ty+=attack*shift;
  tx=lerp(tx,bx,t==='possession'?.33:.24);
  if(p.role==='FWD'){ty+=attack*11;tx=lerp(tx,bx,.23)}
  if(p.role==='MID')ty=lerp(ty,by-attack*13,.27);
 }else{
  const retreat=t==='counter'?6:0;
  ty+=-attack*retreat;
  tx=lerp(tx,bx,.24);
  const nearest=nearestOfTeam(p.team,bx,by,true);
  if(nearest===p){tx=bx;ty=by+attack*2}
  else if(p.role==='MID'&&Math.abs(p.y-by)<press*1.8){tx=lerp(tx,bx,.55);ty=lerp(ty,by,.53)}
  else if(p.role==='DEF'&&Math.abs(p.y-by)<28){ty=lerp(ty,by-attack*7,.30)}
 }
 return{x:clamp(tx,6,94),y:clamp(ty,8,152)};
}
function nearestOfTeam(team,x,y,excludeGK=false){
 let best=null,dd=Infinity;
 for(const p of state.players){if(p.team!==team||(excludeGK&&p.role==='GK'))continue;
  const d=Math.hypot(p.x-x,p.y-y);if(d<dd){dd=d;best=p}}
 return best;
}
function pickPass(p){
 const attack=p.team===0?-1:1;
 const candidates=state.players.filter(q=>q.team===p.team&&q!==p&&q.role!=='GK');
 let best=null,bestValue=-1e9;
 for(const q of candidates){
  const d=dist(p,q);if(d<6||d>60)continue;
  const forward=(q.y-p.y)*attack;
  let danger=0;
  for(const opp of state.players.filter(o=>o.team!==p.team)){
   const vx=q.x-p.x,vy=q.y-p.y,den=vx*vx+vy*vy||1;
   const t=clamp(((opp.x-p.x)*vx+(opp.y-p.y)*vy)/den,0,1);
   const clearance=Math.hypot(opp.x-(p.x+vx*t),opp.y-(p.y+vy*t));
   if(clearance<6)danger+=7*(1-clearance/7);
  }
  const tactical=tactic(p.team);
  const value=forward*(tactical==='counter'?1.7:.95)-d*.2-danger*2+
   (q.role==='FWD'?4:0)+rnd(-5,5);
  if(value>bestValue){bestValue=value;best=q}
 }
 return best;
}
function kick(p,tx,ty,kind,target){
 const b=state.ball;
 if(!b||b.owner!==p)return;
 const dx=tx-b.x,dy=ty-b.y,d=Math.hypot(dx,dy)||1;
 const v=(kind==='shot'?rnd(95,115):kind==='clear'?85:rnd(60,78))*speed();
 b.owner=null;b.mode=kind;b.vx=dx/d*v;b.vy=dy/d*v;b.target=target||null;
 b.team=p.team;b.flight=0;b.lastTouch=p.team;if(kind==='shot')b.lastShooter=p.n;
 p.touch=state.elapsed+.4;state.cooldown=.22;
 if(kind==='pass'){state.passes++;say('↗ '+teamName(p.team)+' • PASS',.8)}
 if(kind==='shot'){state.shots++;state.lastShot={team:p.team,x:tx,y:ty,at:state.elapsed};
 say('⚡ '+teamName(p.team).toUpperCase()+' • SHOT!',1.1);
 try{playTone(360,.09,'triangle',.045)}catch(e){}}
}
function attackDecision(p){
 if(state.ball.owner!==p)return;
 const attack=p.team===0?-1:1;
 const distanceToGoal=p.team===0?p.y:H-p.y;
 const pressure=nearestOpponent(p);
 const shotChance=Number($('footballAttack')?.value||60)/100;
 const targetGoalY=p.team===0?-2:H+2;
 const nearBox=distanceToGoal<42&&p.x>19&&p.x<81;
 if(nearBox&&(distanceToGoal<22||Math.random()<shotChance*.64)){
  const targetX=clamp(50+rnd(-8,8),41,59);
  kick(p,targetX,targetGoalY,'shot');return;
 }
 const q=pickPass(p);
 const passRate=tactic(p.team)==='possession'?.93:tactic(p.team)==='counter'?.63:.78;
 if(q&&(pressure.d<9||Math.random()<passRate)){
  kick(p,q.x+rnd(-2,2),q.y+attack*rnd(0,5),'pass',q);return;
 }
 p.decision=rnd(.24,.6);
}
function handleFlight(dt){
 const b=state.ball;
 const lastX=b.x,lastY=b.y;
 b.x+=b.vx*dt;b.y+=b.vy*dt;b.flight+=dt;b.spin+=dt*12;
 // A goal is valid only if the ball crosses the actual goal line inside the posts.
 const crossedTop=lastY>0&&b.y<=0, crossedBottom=lastY<H&&b.y>=H;
 if(crossedTop||crossedBottom){
  const lineY=crossedTop?0:H;
  const t=(lineY-lastY)/((b.y-lastY)||1);
  const atX=lerp(lastX,b.x,clamp(t,0,1));
  const scorer=crossedTop?0:1;
  if(b.mode==='shot'&&Math.abs(atX-CX)<=GOAL_HALF&&(!goalSchedule().length||b.directed)){
   makeGoal(scorer,atX,lineY);return;
  }
  restart(scorer===0?1:0,'GOAL KICK');return;
 }
 if(b.x<=0||b.x>=W){
  const x=clamp(b.x,0,W);
  const team=1-b.lastTouch;
  restart(team,'THROW IN',x,clamp(b.y,10,150));return;
 }
 // Goalkeepers actively save shots inside their own goal area.
 if(b.mode==='shot'&&!b.directed){
  for(const gk of state.players.filter(p=>p.role==='GK'&&p.team!==b.team)){
   const d=dist(gk,b);
   if(d<4.4){
    state.saves++;say('🧤 '+teamName(gk.team)+' • SAVE!',1.3);
    b.x=gk.x;b.y=gk.y;setCarrier(gk);gk.decision=.35;return;
   }
  }
 }
 if(b.flight<.10||b.directed)return;
 // Players physically intercept travelling balls.
 const candidates=state.players.filter(p=>
   p.role!=='GK'&&p.touch<state.elapsed&&dist(p,b)<(b.mode==='shot'?2.6:3.7))
  .sort((a,c)=>dist(a,b)-dist(c,b));
 if(candidates.length){
  const receiver=candidates[0];
  if(receiver.team!==b.team){state.turnovers++;say('✋ INTERCEPTION • '+teamName(receiver.team),.8)}
  setCarrier(receiver);return;
 }
 if(b.flight>2.6){
  // A long pass becomes a loose ball. No player is teleported to receive it.
  b.mode='loose';b.vx*=Math.pow(.28,dt);b.vy*=Math.pow(.28,dt);
  if(Math.hypot(b.vx,b.vy)<3){b.vx=0;b.vy=0}
  const receiver=state.players.filter(p=>p.role!=='GK').sort((a,c)=>dist(a,b)-dist(c,b))[0];
  if(receiver&&dist(receiver,b)<4)setCarrier(receiver);
 }
}
function restart(team,label,x=50,y=80){
 const b=state.ball;
 state.freeze=.65;state.phase='restart';b.mode='free';b.owner=null;
 b.vx=0;b.vy=0;b.x=x;b.y=y;b.team=team;
 state.current=null;
 say(label+' • '+teamName(team),1);
}
function makeGoal(team,x,y){
 const b=state.ball,dir=state.director,planned=!!dir&&b.directed;
 const event=planned?plannedEventAt(state.scriptIndex):null;
 score[team===0?'left':'right']++;updateScores();
 const scorer=event?.scorer||('#'+String(b.lastShooter||9));
 const minute=event?.minute||clockLabel();
 state.goals.push({team,second:state.elapsed,matchSecond:clockSecond(),scorer});
 state.goalCard={team,scorer,minute,imageImg:event?.imageImg||null,at:state.elapsed,until:state.elapsed+1.65};
 state.goalAnimation={team,x,y,at:state.elapsed,until:state.elapsed+1.5};state.ballHistory=[];
 say('⚽ GOAL! '+teamName(team).toUpperCase()+' • '+scorer,1.6);
 try{playGoalSound();boostCrowd()}catch(e){}
 if($('shake')?.checked)shakeAmount=canvas.width*.018;
 if(planned){state.scriptIndex++;state.director=null}
 const count=Math.min(42,Math.round(8+(Number($('goalFxPower')?.value||70)/100)*28));
 for(let i=0;i<count;i++){const a=rnd(0,Math.PI*2);state.fx.push({x,y,vx:Math.cos(a)*rnd(10,48),vy:Math.sin(a)*rnd(8,42),life:rnd(.5,1.2),team})}
 const next=goalSchedule()[state.scriptIndex];
 state.freeze=next===undefined?.55:clamp((next-state.elapsed)*.10,.08,.48);state.phase='goal';b.mode='goal';b.owner=null;b.directed=false;
 b.x=x;b.y=y;b.vx=0;b.vy=0;
 updateStats();
}
function resume(){
 const side=state.phase==='goal'?1-state.goalAnimation.team:state.ball.team;
 const b=state.ball;
 for(const p of state.players){
  p.x=p.homeX;p.y=p.homeY;p.touch=0;p.decision=rnd(.5,1.4);
 }
 const kickoff=nearestOfTeam(side,50,80,true);
 kickoff.x=50;kickoff.y=80;
 b.x=50;b.y=80;b.mode='free';b.owner=null;b.vx=0;b.vy=0;b.team=side;b.directed=false;
 setCarrier(kickoff);state.phase='live';state.goalAnimation=null;state.cooldown=.5;
}
// Scripted attack director: controls *when* the shot crosses the line, not the score.
function updateDirector(dt){
 const schedule=goalSchedule(),due=schedule[state.scriptIndex];
 if(due===undefined||roundFinished)return;
 const b=state.ball,remain=due-state.elapsed;
 // Build the attack late enough that the forward cannot camp on the goal line.
 // Shot preparation happens while players are still moving, not while they wait.
 const lead=clamp(due*.08,1.2,2.5);
 if(!state.director&&remain<=lead){
  const ev=plannedEventAt(state.scriptIndex);
  if($('scriptedResult')?.checked&&goalPlan.length&&!ev)return;
  const side=ev?.side==='right'?1:ev?.side==='left'?0:state.scriptIndex%2;
  const striker=state.players.filter(p=>p.team===side&&p.role==='FWD')
   .sort((a,c)=>Math.abs(a.x-50)-Math.abs(c.x-50))[0];
  state.director={due,side,striker,shot:false,started:state.elapsed,passed:false};
  say('⚡ ATTACK • '+teamName(side),.9);
 }
 const dir=state.director;if(!dir||dir.shot)return;
 const striker=dir.striker,goalY=dir.side===0?0:160;
 // The striker runs into a shooting lane rather than parking at the goalmouth.
 const runY=dir.side===0?clamp(striker.y-15,19,53):clamp(striker.y+15,107,141);
 advance(striker,dt*speed(),clamp(striker.x+(50-striker.x)*.30,28,72),runY,23);
 if(remain>.52){
  if(!dir.passed&&b.owner){
   const p=b.owner;
   if(p.team===dir.side){kick(p,striker.x,striker.y,'pass',striker);dir.passed=true}
   else if(remain<1.15){kick(p,striker.x,striker.y,'clear',striker);dir.passed=true}
  }
  // No pre-goal forced possession, waiting, or frozen striker.
  return;
 }
 // Strike in motion: the shot starts ~0.5s before the goal, and the
 // ball's real flight reaches the line at the scheduled video timestamp.
 const flight=Math.max(.08,remain),targetX=50+rnd(-3.5,3.5);
 b.owner=null;b.mode='shot';b.team=dir.side;b.lastTouch=dir.side;
 b.lastShooter=striker.n;b.directed=true;b.flight=0;
 b.vx=(targetX-b.x)/(flight*speed());
 b.vy=(goalY-b.y)/(flight*speed());
 dir.shot=true;state.shots++;state.lastShot={team:dir.side,x:targetX,y:goalY,at:state.elapsed};
 say('🔥 SHOT ON TARGET!',.6);
 try{playTone(410,.09,'triangle',.07)}catch(e){}
}
function step(dt){
 if(!enabled()||mode!=='play'||roundFinished)return;
 if(!state.ball)reset(true);
 const d=dt*speed();
 state.elapsed+=dt;
 if(state.elapsed>=duration()){
  state.elapsed=duration();updateStats();finishRound();return;
 }
 if(state.elapsed>=halfVideoSecond()&&!state.halftime){
  state.halftime=true;say('HALF TIME • SECOND HALF',2);
 }
 if(state.freeze>0){
  state.freeze-=dt;
  if(state.freeze<=0)resume();
  return;
 }
 updateDirector(dt);
 if($('viralDrama')?.checked){const remain=Math.ceil(duration()-state.elapsed);if(remain<=5&&remain>=1&&remain!==state.lastDramaTick){state.lastDramaTick=remain;try{playTone(remain===1?920:530+remain*40,.06,'sine',.025)}catch(e){}}}
 state.cooldown=Math.max(0,state.cooldown-dt);
 const b=state.ball;
 const owner=b.owner;
 if(owner){
  state.possessions[owner.team]+=dt;
  // Carrier dribbles toward the opponent goal, with defenders closing space.
  const attack=owner.team===0?-1:1;
  const pressure=nearestOpponent(owner);
  let tx=50+(owner.x-50)*.35,ty=owner.team===0?5:155;
  if(pressure.d<10){tx=clamp(owner.x+(owner.x<pressure.player.x?-12:12),10,90)}
  if(owner.role==='GK'){tx=owner.x;ty=owner.y;owner.decision=Math.min(owner.decision,.35)}
  advance(owner,d,tx,ty,owner.role==='GK'?6:23);
  b.x=owner.x;b.y=owner.y+attack*1.6;
  owner.decision-=dt;
  if(owner.decision<=0&&!state.director)attackDecision(owner);
  if(b.owner===owner&&state.cooldown<=0&&!state.director){
   const opp=nearestOpponent(owner);
   if(opp.d<3.4&&Math.random()<dt*(tactic(opp.player.team)==='press'?2.8:1.7)){
    state.turnovers++;setCarrier(opp.player);say('⚔ TACKLE • '+teamName(opp.player.team),.8);
    state.cooldown=.5;
   }
  }
 }else if(b.mode!=='free'&&b.mode!=='goal')handleFlight(d);
 else if(b.mode==='free'&&state.phase==='live'){
  const p=nearestOfTeam(b.team,b.x,b.y);if(p&&dist(p,b)<4)setCarrier(p);
 }
 if(!b.owner&&b.mode==='loose'){
  const receiver=state.players.filter(p=>p.role!=='GK').sort((a,c)=>dist(a,b)-dist(c,b))[0];
  if(receiver)advance(receiver,d,b.x,b.y,19);
 }
 // Off-ball intelligent formations: defenders press, attackers create lanes.
 for(const p of state.players){
  if(p===b.owner)continue;
  const target=roleTarget(p,b.owner);
  const pace=p.role==='GK'?10:p.role==='FWD'?23:19;
  advance(p,d,target.x,target.y,pace*(tactic(p.team)==='press'?1.16:1));
 }
 if(state.ball){state.ballTrailClock+=dt;if(state.ballTrailClock>.045){state.ballTrailClock=0;state.ballHistory.push({x:state.ball.x,y:state.ball.y,at:state.elapsed});if(state.ballHistory.length>14)state.ballHistory.shift()}}
 for(const f of state.fx){f.x+=f.vx*dt;f.y+=f.vy*dt;f.vx*=.975;f.vy*=.975;f.life-=dt}state.fx=state.fx.filter(f=>f.life>0);
 if(Math.floor(state.elapsed*4)!==Math.floor((state.elapsed-dt)*4))updateStats();
}
function path(ctx,points){ctx.beginPath();points.forEach(([x,y],i)=>{const q=toCanvas(x,y);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y)})}
let fieldCache=null,fieldCacheW=0,fieldCacheH=0;
function buildField(g){
 const p=pitch(),w=canvas.width,h=canvas.height;
 const grass=g.createLinearGradient(0,p.y,0,p.y+p.h);
 grass.addColorStop(0,'#0a5c37');grass.addColorStop(.5,'#087344');grass.addColorStop(1,'#064e31');
 g.fillStyle='#061521';g.fillRect(0,0,w,h);
 // Soft floodlights and stadium track outside the field.
 const light=g.createRadialGradient(w*.5,h*.48,w*.15,w*.5,h*.48,h*.68);
 light.addColorStop(0,'rgba(38,87,84,.32)');light.addColorStop(1,'rgba(2,5,15,0)');g.fillStyle=light;g.fillRect(0,0,w,h);
 g.fillStyle='#162f34';g.fillRect(p.x-w*.013,p.y-w*.015,p.w+w*.026,p.h+w*.03);
 // Stadium LED boards, beyond the field.
 for(let side=0;side<2;side++){
  const yy=side?p.y+p.h+w*.013:p.y-w*.028;
  const grd=g.createLinearGradient(0,yy,w,yy);
  grd.addColorStop(0,'#133654');grd.addColorStop(.5,'#337d9b');grd.addColorStop(1,'#133654');
  g.fillStyle=grd;g.fillRect(p.x,yy,p.w,w*.013);
  g.fillStyle='rgba(255,255,255,.50)';
  for(let i=0;i<9;i++)g.fillRect(p.x+i*p.w/9+w*.012,yy+w*.004,p.w/9-w*.027,w*.002);
 }
 g.fillStyle=grass;g.fillRect(p.x,p.y,p.w,p.h);
 for(let i=0;i<16;i++){g.fillStyle=i%2?'rgba(255,255,255,.036)':'rgba(0,0,0,.058)';g.fillRect(p.x,p.y+i*p.h/16,p.w,p.h/16)}
 // Fine, deterministic grass grain (no frame-to-frame flicker).
 g.fillStyle='rgba(220,255,212,.035)';for(let i=0;i<500;i++){const gx=(i*119.3%100)/100,gy=(i*71.7%100)/100;g.fillRect(p.x+gx*p.w,p.y+gy*p.h,Math.max(1,w*.001),Math.max(2,h*.002))}
 g.strokeStyle='rgba(245,255,246,.86)';g.lineWidth=Math.max(2,w*.0026);
 const line=(a,b,c,d)=>{const A=toCanvas(a,b),B=toCanvas(c,d);g.beginPath();g.moveTo(A.x,A.y);g.lineTo(B.x,B.y);g.stroke()};
 const rect=(x,y,rw,rh)=>{const a=toCanvas(x,y);g.strokeRect(a.x,a.y,rw*p.sx,rh*p.sy)};
 g.strokeRect(p.x,p.y,p.w,p.h);line(0,80,100,80);
 const mid=toCanvas(50,80);g.beginPath();g.ellipse(mid.x,mid.y,9.15*p.sx,9.15*p.sy,0,0,Math.PI*2);g.stroke();
 for(const y of [0,160]){
  const top=y===0;
  rect(20,top?0:132,60,28);rect(35,top?0:151,30,9);
  const penalty=toCanvas(50,top?18:142);
  g.beginPath();g.arc(penalty.x,penalty.y,Math.max(2,w*.003),0,Math.PI*2);g.fillStyle='#fff';g.fill();
  const arc=toCanvas(50,top?28:132);g.beginPath();g.ellipse(arc.x,arc.y,9.15*p.sx,9.15*p.sy,0,top?0:Math.PI,top?Math.PI:Math.PI*2);g.stroke();
 }
 // Goal nets beyond the goal line.
 for(const top of [true,false]){
  const a=toCanvas(41,top?-5:160),bb=toCanvas(59,top?0:165);
  g.fillStyle='rgba(255,255,255,.11)';g.fillRect(a.x,a.y,bb.x-a.x,bb.y-a.y);
  g.strokeStyle='#f5f8ff';g.lineWidth=Math.max(3,w*.005);g.strokeRect(a.x,a.y,bb.x-a.x,bb.y-a.y);
  g.strokeStyle='rgba(255,255,255,.35)';g.lineWidth=1;
  for(let x=44;x<60;x+=4)line(x,top?-5:160,x,top?0:165);
 }
 // All labels stay in the broadcast HUD outside the pitch and goal nets.
}
function field(){
 if(!fieldCache||fieldCacheW!==canvas.width||fieldCacheH!==canvas.height){
  fieldCache=document.createElement('canvas');fieldCache.width=canvas.width;fieldCache.height=canvas.height;
  fieldCacheW=canvas.width;fieldCacheH=canvas.height;
  buildField(fieldCache.getContext('2d',{alpha:false}));
 }
 ctx.drawImage(fieldCache,0,0);
}

// Player silhouettes are prerendered once per shirt/number/scale, not redrawn
// with 30+ Canvas paths and badge clipping on every video frame.
const spriteCache=new Map();
function buildPlayerSprite(p,r,c,badge,style){
 const size=Math.ceil(r*4.1),sprite=document.createElement('canvas');
 sprite.width=size;sprite.height=size;
 const g=sprite.getContext('2d');
 g.translate(size/2,size/2);
 const skin=p.team===0?'#e7b98c':'#d99b76';
 g.lineCap='round';
 const emblem=(x,y,rad)=>{
  if(!badge)return;
  g.save();g.beginPath();g.arc(x,y,rad,0,Math.PI*2);g.clip();
  const iw=badge.naturalWidth||badge.width||1,ih=badge.naturalHeight||badge.height||1;
  const scale=Math.max(2*rad/iw,2*rad/ih);
  g.drawImage(badge,x-iw*scale/2,y-ih*scale/2,iw*scale,ih*scale);
  g.restore();
 };
 if(style==='disc'){
  g.fillStyle=c;g.strokeStyle='#0e2030';g.lineWidth=r*.14;
  g.beginPath();g.arc(0,0,r*.82,0,Math.PI*2);g.fill();g.stroke();
  emblem(0,-r*.12,r*.48);
 }else{
  g.strokeStyle='#17222d';g.lineWidth=r*.28;
  g.beginPath();g.moveTo(-r*.25,r*.19);g.lineTo(-r*.34,r*.88);
  g.moveTo(r*.25,r*.19);g.lineTo(r*.34,r*.88);g.stroke();
  g.strokeStyle=p.team===0?'#fff':'#171827';g.lineWidth=r*.19;
  g.beginPath();g.moveTo(-r*.31,r*.50);g.lineTo(-r*.35,r*.73);
  g.moveTo(r*.31,r*.50);g.lineTo(r*.35,r*.73);g.stroke();
  g.fillStyle='#080f18';g.fillRect(-r*.52,r*.77,r*.35,r*.22);g.fillRect(r*.17,r*.77,r*.35,r*.22);
  g.fillStyle=p.team===0?'#fff':'#111827';g.fillRect(-r*.47,r*.09,r*.94,r*.37);
  g.strokeStyle=skin;g.lineWidth=r*.25;
  g.beginPath();g.moveTo(-r*.50,-r*.20);g.lineTo(-r*.89,-r*.04);
  g.moveTo(r*.50,-r*.20);g.lineTo(r*.89,-r*.04);g.stroke();
  g.fillStyle=c;g.strokeStyle='rgba(0,0,0,.52)';g.lineWidth=r*.085;
  g.beginPath();g.moveTo(-r*.56,-r*.49);g.lineTo(r*.56,-r*.49);
  g.lineTo(r*.52,r*.27);g.lineTo(-r*.52,r*.27);g.closePath();g.fill();g.stroke();
  g.fillStyle='rgba(255,255,255,.27)';
  g.fillRect(-r*.48,-r*.39,r*.13,r*.56);g.fillRect(r*.35,-r*.39,r*.13,r*.56);
  if(badge){g.fillStyle='rgba(255,255,255,.94)';g.beginPath();g.arc(0,-r*.15,r*.32,0,Math.PI*2);g.fill();emblem(0,-r*.15,r*.28)}
  g.fillStyle=skin;g.beginPath();g.ellipse(0,-r*.74,r*.36,r*.32,0,0,Math.PI*2);g.fill();
  g.fillStyle='#26221e';g.beginPath();g.ellipse(0,-r*.91,r*.34,r*.16,0,Math.PI,Math.PI*2);g.fill();
 }
 g.textAlign='center';g.textBaseline='middle';g.fillStyle='#fff';g.shadowColor='#000';g.shadowBlur=r*.12;
 g.font='900 '+Math.round(r*(badge?.44:.66))+'px Segoe UI';
 g.fillText(String(p.n),0,badge?r*.29:-r*.06);
 return sprite;
}
function drawPlayer(p){
 const q=toCanvas(p.x,p.y),r=clamp(canvas.width*.031,19,68)*(Number($('footballPlayerScale')?.value||125)/100);
 const c=p.role==='GK'?(p.team===0?'#a9f15a':'#59d2ed'):color(p.team);
 const badge=p.team===0?leftBadgeImg:rightBadgeImg;
 const style=$('footballPlayerStyle')?.value||'kit';
 const key=[p.team,p.n,p.role,Math.round(r),c,style,badge?.src||''].join('|');
 let sprite=spriteCache.get(key);
 if(!sprite){if(spriteCache.size>55)spriteCache.clear();sprite=buildPlayerSprite(p,r,c,badge,style);spriteCache.set(key,sprite)}
 ctx.save();ctx.translate(q.x,q.y);
 ctx.fillStyle='rgba(0,0,0,.32)';ctx.beginPath();ctx.ellipse(r*.17,r*.68,r*.95,r*.45,0,0,Math.PI*2);ctx.fill();
 const sway=Math.sin(p.anim*3)*.065;
 ctx.rotate((p.face===1?Math.PI:0)+sway);
 ctx.drawImage(sprite,-sprite.width/2,-sprite.height/2);
 ctx.rotate(-((p.face===1?Math.PI:0)+sway));
 if(state.ball?.owner===p){
  ctx.strokeStyle='#ffe88b';ctx.lineWidth=Math.max(2,r*.095);
  ctx.beginPath();ctx.ellipse(0,0,r*1.10,r*1.24,0,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#ffe88b';ctx.beginPath();ctx.moveTo(0,-r*1.46);ctx.lineTo(-r*.23,-r*1.23);ctx.lineTo(r*.23,-r*1.23);ctx.closePath();ctx.fill();
 }
 ctx.restore();
}
function drawBall(){
 const b=state.ball;if(!b)return;
 const q=toCanvas(b.x,b.y),r=clamp(canvas.width*.009,6,23);
 ctx.save();ctx.translate(q.x,q.y);ctx.rotate(b.spin);
 ctx.shadowColor='#000';ctx.shadowBlur=r;ctx.shadowOffsetY=r*.2;
 ctx.fillStyle='#fff';ctx.strokeStyle='#17202a';ctx.lineWidth=r*.16;
 ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.fillStyle='#1b2832';
 for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ctx.beginPath();ctx.arc(Math.cos(a)*r*.56,Math.sin(a)*r*.56,r*.19,0,Math.PI*2);ctx.fill()}
 ctx.beginPath();ctx.arc(0,0,r*.3,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawActionTrails(){
 const b=state.ball;
 if(!b)return;
 const history=state.ballHistory||[];
 if(history.length>2&&(b.mode==='pass'||b.mode==='shot'||b.mode==='clear'||b.mode==='loose')){
  ctx.save();
  for(let i=1;i<history.length;i++){
   const a=toCanvas(history[i-1].x,history[i-1].y),c=toCanvas(history[i].x,history[i].y);
   ctx.strokeStyle=b.mode==='shot'?'rgba(255,224,115,'+(i/history.length*.64)+')':'rgba(196,238,255,'+(i/history.length*.35)+')';
   ctx.lineWidth=Math.max(2,canvas.width*.003*(i/history.length));
   ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();
  }
  ctx.restore();
 }
 if(state.goalAnimation&&state.elapsed<state.goalAnimation.until){
  const ev=state.goalAnimation,age=state.elapsed-ev.at,q=toCanvas(ev.x,ev.y);
  ctx.save();
  for(let i=0;i<3;i++){
   const radius=canvas.width*(.035+Math.max(0,age-i*.11)*.12);
   ctx.globalAlpha=Math.max(0,.8-age*.9-i*.17);
   ctx.strokeStyle=i%2?'#fff':color(ev.team);ctx.lineWidth=Math.max(2,canvas.width*.005);
   ctx.beginPath();ctx.arc(q.x,q.y,radius,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
 }
}
function drawBroadcastMoment(){
 if(!$('footballBroadcast')?.checked)return;
 const w=canvas.width,h=canvas.height,ev=state.goalAnimation;
 if(state.elapsed<1.15&&$('viralHook')?.checked){
  const age=state.elapsed,alpha=clamp(Math.min(age/.18,(1.15-age)/.25),0,1);
  ctx.save();ctx.globalAlpha=alpha;
  const ww=w*.74,hh=h*.073,yy=h*.47;
  ctx.fillStyle='rgba(2,10,24,.88)';drawRoundRect(ctx,(w-ww)/2,yy,ww,hh,w*.018);ctx.fill();
  ctx.strokeStyle='rgba(255,217,119,.82)';ctx.lineWidth=Math.max(2,w*.003);ctx.stroke();
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ffe3a1';
  ctx.font='950 '+Math.round(w*.042)+'px Segoe UI';ctx.fillText('MATCHDAY • 90 SECONDS',w/2,yy+hh*.32);
  ctx.fillStyle='#fff';ctx.font='900 '+Math.round(w*.028)+'px Segoe UI';
  ctx.fillText(teamName(0).toUpperCase()+'  VS  '+teamName(1).toUpperCase(),w/2,yy+hh*.73,ww*.93);
  ctx.restore();
 }
 if(ev&&state.elapsed-ev.at<.65){
  const age=state.elapsed-ev.at,alpha=clamp(Math.min(age/.09,(.65-age)/.18),0,1);
  ctx.save();ctx.globalAlpha=alpha;
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.shadowColor=color(ev.team);ctx.shadowBlur=w*.024;
  ctx.fillStyle='#fff';ctx.font='950 '+Math.round(w*.098)+'px Segoe UI';
  ctx.fillText('GOOOOL!',w/2,h*.49);
  ctx.shadowBlur=0;ctx.font='900 '+Math.round(w*.037)+'px Segoe UI';
  ctx.fillStyle='#ffe6a1';ctx.fillText(teamName(ev.team).toUpperCase(),w/2,h*.53);
  ctx.restore();
 }
}

function drawHUD(){
 const w=canvas.width,h=canvas.height,fs=Math.max(20,w*.028)*(Number($('scoreFont')?.value||100)/100);
 const barW=w*clamp(Number($('scoreWidth')?.value||82),55,98)/100;
 const cx=w*clamp(Number($('scoreX')?.value||50),10,90)/100;
 const barH=Math.max(70,w*.083),barY=clamp(h*(Number($('scoreY')?.value||5)/100)-barH/2,h*.012,h*.105);
 const left=cx-barW/2,right=cx+barW/2;
 ctx.save();ctx.fillStyle='rgba(3,9,22,.97)';
 drawRoundRect(ctx,left,barY,barW,barH,barH*.20);ctx.fill();
 ctx.strokeStyle='rgba(160,199,216,.32)';ctx.lineWidth=2;ctx.stroke();
 ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.font='900 '+fs+'px Segoe UI';
 const nameMax=barW*.30;
 function fitted(name,maxW){let z=fs;while(z>12&&ctx.measureText(name).width>maxW){z-=2;ctx.font='900 '+z+'px Segoe UI'}return z}
 const l=teamName(0).toUpperCase(),r=teamName(1).toUpperCase();
 const logoR=barH*.21;
 if(typeof leftBadgeImg!=='undefined'&&leftBadgeImg)drawImageCoverCircle(leftBadgeImg,left+barW*.035+logoR,barY+barH*.48,logoR);
 if(typeof rightBadgeImg!=='undefined'&&rightBadgeImg)drawImageCoverCircle(rightBadgeImg,right-barW*.035-logoR,barY+barH*.48,logoR);
 ctx.textAlign='left';ctx.font='900 '+fitted(l,nameMax)+'px Segoe UI';ctx.fillText(l,left+barW*.025+(leftBadgeImg?logoR*2.5:0),barY+barH*.48);
 ctx.font='900 '+fs+'px Segoe UI';ctx.textAlign='right';ctx.font='900 '+fitted(r,nameMax)+'px Segoe UI';ctx.fillText(r,right-barW*.025-(rightBadgeImg?logoR*2.5:0),barY+barH*.48);
 ctx.textAlign='center';ctx.font='950 '+Math.round(fs*1.35)+'px Segoe UI';ctx.fillStyle='#fff';
 ctx.fillText(score.left+' : '+score.right,cx,barY+barH*.37);
 ctx.font='900 '+Math.round(fs*.66)+'px Segoe UI';ctx.fillStyle='#f7d477';
 ctx.fillText(clockLabel()+'  /  '+clockLabel(totalMatchSeconds()),cx,barY+barH*.77);
 if($('footballBroadcast')?.checked){
  ctx.font='900 '+Math.round(fs*.52)+'px Segoe UI';
  ctx.fillStyle='#ff5066';ctx.textAlign='center';
  ctx.fillText('● LIVE',cx,barY+barH*1.22);
  const b=state.ball;
  if(b&&state.phase==='live'){
   const attackSide=b.owner?.team??b.team;
   const distance=attackSide===0?b.y:160-b.y;
   if(distance<45){
    const urgency=clamp((45-distance)/45,0,1);
    const bw=w*.24,bx=(w-bw)/2,by=h*.125;
    ctx.fillStyle='rgba(2,13,27,.90)';ctx.fillRect(bx,by,bw,w*.014);
    ctx.fillStyle=urgency>.6?'#ff566e':'#ffcb5c';ctx.fillRect(bx,by,bw*urgency,w*.014);
    ctx.textAlign='center';ctx.font='900 '+Math.round(fs*.48)+'px Segoe UI';
    ctx.fillText(urgency>.6?'DANGER • SHOT?':'ATTACK BUILDUP',w/2,by-w*.010);
   }
  }
 }
 const total=Math.max(.01,state.possessions[0]+state.possessions[1]),home=state.possessions[0]/total;
 const meterY=h*.901,meterH=Math.max(6,w*.008),margin=w*.075,meterW=w-margin*2;
 ctx.fillStyle='rgba(5,12,24,.93)';ctx.fillRect(margin-w*.015,meterY-w*.011,meterW+w*.03,h*.053);
 ctx.fillStyle=color(1);ctx.fillRect(margin,meterY,meterW,meterH);
 ctx.fillStyle=color(0);ctx.fillRect(margin,meterY,meterW*home,meterH);
 ctx.font='800 '+Math.round(fs*.66)+'px Segoe UI';ctx.fillStyle='#e9f1fc';
 ctx.textAlign='left';ctx.fillText('POS '+Math.round(home*100)+'%',margin,meterY+w*.025);
 ctx.textAlign='right';ctx.fillText(Math.round((1-home)*100)+'%  •  '+state.shots+' SHOTS',w-margin,meterY+w*.025);
 // Bottom commentary never blocks the field or goals.
 if($('footballTicker')?.value!=='off'&&state.lastEvent&&state.elapsed<state.eventTime){
  const ew=w*.90,eh=Math.max(44,w*.059),ex=(w-ew)/2,ey=h*.95;
  ctx.fillStyle='rgba(5,12,26,.95)';drawRoundRect(ctx,ex,ey,ew,eh,eh*.18);ctx.fill();
  ctx.strokeStyle='rgba(109,176,255,.4)';ctx.lineWidth=2;ctx.stroke();
  ctx.textAlign='center';ctx.fillStyle='#f9fbff';ctx.font='900 '+Math.round(w*.025)+'px Segoe UI';
  ctx.fillText(state.lastEvent.slice(0,43),w/2,ey+eh/2);
 }
 if($('viralDrama')?.checked&&state.elapsed>duration()-5&&state.elapsed<duration()){
  const remain=Math.ceil(duration()-state.elapsed);
  ctx.textAlign='center';ctx.fillStyle=remain<3?'#ff607a':'#ffdc75';
  ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=w*.018;
  ctx.font='950 '+Math.round(w*.042)+'px Segoe UI';
  ctx.fillText(String(remain),w*.5,h*.975);ctx.shadowBlur=0;
 }
 if(state.goalCard&&state.elapsed<state.goalCard.until&&$('showGoalCard')?.checked){
  const ev=state.goalCard,cinema=$('footballGoalStyle')?.value==='cinema';
  const y=cinema?h*.49:h*.10,ww=cinema?w*.85:w*.84,hh=cinema?h*.16:h*.045;
  ctx.fillStyle='rgba(3,9,20,.94)';drawRoundRect(ctx,(w-ww)/2,y-hh/2,ww,hh,hh*.22);ctx.fill();
  ctx.strokeStyle=color(ev.team);ctx.lineWidth=Math.max(3,w*.003);ctx.stroke();
  if(ev.imageImg){drawImageCoverCircle(ev.imageImg,(w-ww)/2+hh*.48,y,hh*.35)}
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';
  ctx.font='950 '+Math.round(cinema?w*.075:w*.031)+'px Segoe UI';
  ctx.fillText('GOOOAL!  '+teamName(ev.team).toUpperCase(),w/2,y-(cinema?hh*.2:hh*.14),ww*.82);
  ctx.font='900 '+Math.round(cinema?w*.038:w*.021)+'px Segoe UI';
  ctx.fillText(ev.scorer+'  •  '+ev.minute,w/2,y+hh*.27,ww*.78);
 }
 if($('viralHook')?.checked&&state.elapsed<Number($('hookDuration')?.value||1.4)){
  const t=state.elapsed,limit=Number($('hookDuration')?.value||1.4);
  ctx.globalAlpha=clamp(Math.min(t/.16,(limit-t)/.18),0,1);
  const yy=h*.10,ww=w*.82,hh=h*.048;
  ctx.fillStyle='rgba(6,15,30,.95)';drawRoundRect(ctx,(w-ww)/2,yy,ww,hh,hh*.24);ctx.fill();
  ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='950 '+Math.round(w*.038)+'px Segoe UI';
  ctx.fillText(($('hookText')?.value||'WHO WILL WIN?').slice(0,28),w/2,yy+hh*.55);
  ctx.globalAlpha=1;
 }
 ctx.restore();
}
function drawFootballFX(){
 if(!state.fx.length)return;
 const p=pitch();
 ctx.save();
 for(const f of state.fx){
  const q=toCanvas(f.x,f.y);
  ctx.globalAlpha=clamp(f.life,0,1);
  ctx.fillStyle=f.team===0?color(0):color(1);
  ctx.fillRect(q.x,q.y,Math.max(3,canvas.width*.007),Math.max(4,canvas.width*.011));
 }
 ctx.restore();
}
function render(){
 if(!enabled())return;
 if(!state.ball)reset(true);
 ctx.save();ctx.clearRect(0,0,canvas.width,canvas.height);
 // The pitch, players and ball share the same camera transform.
 const owner=state.ball.owner;
 const attacking=owner&&((owner.team===0&&owner.y<60)||(owner.team===1&&owner.y>100));
 const target=state.goalAnimation&&state.elapsed<state.goalAnimation.until?1.10:attacking&&$('footballCamera')?.checked?Number($('footballCameraZoom')?.value||1.06):1;
 state.camera.zoom=lerp(state.camera.zoom,target,.04);
 ctx.save();
 if(state.goalAnimation&&state.elapsed<state.goalAnimation.until){
  const age=state.elapsed-state.goalAnimation.at,shake=(1-age/1.5)*canvas.width*.006;
  ctx.translate(Math.sin(age*85)*shake,Math.cos(age*93)*shake);
 }
 if(state.camera.zoom>1.001){
  const center=toCanvas(50,owner?owner.y:80);
  ctx.translate(center.x,center.y);ctx.scale(state.camera.zoom,state.camera.zoom);ctx.translate(-center.x,-center.y);
 }
 field();
 for(const p of state.players)drawPlayer(p);
 drawActionTrails();drawBall();drawFootballFX();
 ctx.restore();
 drawHUD();drawBroadcastMoment();
 if(roundFinished)drawFinalResult();
 ctx.restore();
}
function applyPreset(){
 $('ratio').value='9:16';$('quality').value='1080';resizeCanvas();
 $('fps').value='30';$('bitrate').value='12000000';$('showFinalResult').checked=true;
 $('finalResultDuration').value='2';
 $('viralLoop').checked=false;$('autoStopRecord').checked=true;
 $('recordReset').checked=true;
 $('footballDuration').value='90';$('footballClock').value='90';$('footballExtraFirst').value='0';$('footballExtraSecond').value='0';
 reset();render();
}
function init(){
 if(!$('gameType'))return;
 $('gameType').addEventListener('change',()=>{
  const isFootball=enabled();
  $('footballControls').style.display=isFootball?'block':'none';
  $('pinballOnlyNote').style.display=isFootball?'block':'none';
  if(isFootball)reset(true);
  else {spawnBalls(true);roundFinished=false}
  render();
 });
 $('footballPreset').addEventListener('click',()=>{applyPreset();toast('11v11 futbol simülasyonu hazır')});
 for(const id of ['footballDuration','footballClock','footballExtraFirst','footballExtraSecond','footballSyncGoals','footballGoalTimeUnit','footballGoalStyle','footballPlayerStyle','footballCameraZoom','footballTicker','footballSpeed','footballAttack','footballTacticLeft','footballTacticRight','footballCamera']){
  $(id)?.addEventListener('change',()=>{if(enabled())updateStats();const d=duration(),c=totalMatchSeconds();if($('footballClockRatio'))$('footballClockRatio').textContent=c+' ÷ '+d+' = '+(c/d).toFixed(2)+'×'});
 }
 if(enabled())reset(true);
}
window.Football11={enabled,reset,step,render,applyPreset,startCrowd,stopCrowd,state,init,goalSchedule,plannedEvents,planMinuteSecond,clockSecond,clockLabel,totalMatchSeconds,halfVideoSecond,parseMatchSecond,createTournamentSquads:()=>state.players};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
