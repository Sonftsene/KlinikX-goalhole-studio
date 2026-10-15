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
function duration(){return Math.max(5,Number($('footballDuration')?.value)||20)}
function clockDuration(){return Math.max(10,Number($('footballClock')?.value)||60)}
function clockSecond(){return state.elapsed/duration()*clockDuration()}
function fmtClock(t){t=Math.max(0,Math.floor(t));return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')}
function scripted(){return !!$('footballSyncGoals')?.checked}
function goalSchedule(){if(!scripted())return [];const raw=$('goalTimes')?.value?.trim()||'';if(raw)return raw.split(/[,;\s]+/).map(Number).filter(v=>Number.isFinite(v)&&v>.15&&v<duration()).sort((a,b)=>a-b);const first=Math.max(.5,Number($('firstGoalSecond')?.value)||4),step=Math.max(.5,Number($('goalInterval')?.value)||5),count=$('scriptedResult')?.checked&&goalPlan.length?goalPlan.length:Math.max(1,Math.min(20,Math.floor(duration()/step)));return Array.from({length:count},(_,i)=>first+i*step).filter(v=>v<duration())}
function speed(){return clamp(Number($('footballSpeed')?.value)||1.3,.5,3)}
function tactic(side){return $('footballTactic'+(side===0?'Left':'Right'))?.value||'balanced'}
function pitch(){const w=canvas.width,h=canvas.height;const marginX=w*.075,marginY=h*.095;
 const pw=w-marginX*2,ph=h-marginY*2;
 return {x:marginX,y:marginY,w:pw,h:ph,sx:pw/W,sy:ph/H}}
function toCanvas(x,y){const p=pitch();return{x:p.x+x*p.sx,y:p.y+y*p.sy}}
function say(msg,seconds=1.9){state.lastEvent=msg;state.eventTime=state.elapsed+seconds;state.events.push({at:state.elapsed,text:msg});if(state.events.length>30)state.events.shift()}
function teamName(side){return ($(side===0?'leftName':'rightName')?.value|| (side===0?'HOME':'AWAY')).trim()}
function color(side){return $(side===0?'leftColor':'rightColor')?.value|| (side===0?'#f59e0b':'#e11d48')}
function setCarrier(p){
 if(!p||!state.ball)return;
 const b=state.ball;b.owner=p;b.mode='carry';b.team=p.team;b.vx=0;b.vy=0;
 p.decision=rnd(.65,1.45);
 state.current=p;
}
function reset(quiet=false){
 state.players=[];state.elapsed=0;state.phase='kickoff';state.possessions=[0,0];
 state.events=[];state.goals=[];state.current=null;state.cooldown=0;state.freeze=0;
 state.lastEvent='';state.eventTime=0;state.passes=0;state.shots=0;state.saves=0;
 state.turnovers=0;state.halftime=false;state.lastShot=null;state.goalAnimation=null;state.scriptIndex=0;state.director=null;state.fx=[];state.lastDramaTick=-1;state.goalCard=null;
 state.camera={x:50,y:80,zoom:1};
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
 '  •  '+fmtClock(clockSecond())+'/'+fmtClock(clockDuration())+' (×'+(clockDuration()/duration()).toFixed(1)+')  •  Possession '+percent+'%–'+(100-percent)+'%'+
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
  const shift=t==='possession'?12:t==='counter'?24:17;
  ty+=attack*shift;
  tx=lerp(tx,bx,t==='possession'?.23:.11);
  if(p.role==='FWD')ty+=attack*8;
 }else{
  const retreat=t==='counter'?6:0;
  ty+=-attack*retreat;
  tx=lerp(tx,bx,.16);
  const nearest=nearestOfTeam(p.team,bx,by,true);
  if(nearest===p){tx=bx;ty=by+attack*2}
  else if(p.role==='MID'&&Math.abs(p.y-by)<press){tx=lerp(tx,bx,.4);ty=lerp(ty,by,.4)}
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
 const passRate=tactic(p.team)==='possession'?.88:tactic(p.team)==='counter'?.58:.70;
 if(q&&(pressure.d<9||Math.random()<passRate)){
  kick(p,q.x+rnd(-2,2),q.y+attack*rnd(0,5),'pass',q);return;
 }
 p.decision=rnd(.45,1);
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
  if(b.mode==='shot'&&Math.abs(atX-CX)<=GOAL_HALF){
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
 const event=planned&&$('scriptedResult')?.checked?goalPlan[state.scriptIndex]||null:null;
 score[team===0?'left':'right']++;updateScores();
 const scorer=event?.scorer||('#'+String(b.lastShooter||9));
 const minute=event?.minute||fmtClock(clockSecond());
 state.goals.push({team,second:state.elapsed,matchSecond:clockSecond(),scorer});
 state.goalCard={team,scorer,minute,imageImg:event?.imageImg||null,until:state.elapsed+1.55};
 state.goalAnimation={team,x,y,until:state.elapsed+1.35};
 say('⚽ GOAL! '+teamName(team).toUpperCase()+' • '+scorer,1.6);
 try{playGoalSound()}catch(e){}
 if($('shake')?.checked)shakeAmount=canvas.width*.018;
 if(planned){state.scriptIndex++;state.director=null}
 const count=Math.min(100,Math.round(10+(Number($('goalFxPower')?.value||70)/100)*55));
 for(let i=0;i<count;i++){const a=rnd(0,Math.PI*2);state.fx.push({x,y,vx:Math.cos(a)*rnd(10,48),vy:Math.sin(a)*rnd(8,42),life:rnd(.5,1.2),team})}
 state.freeze=1.35;state.phase='goal';b.mode='goal';b.owner=null;b.directed=false;
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
 if(!state.director&&remain<=Math.min(3.8,Math.max(1.1,due*.8))){
  const ev=$('scriptedResult')?.checked?goalPlan[state.scriptIndex]:null;
  if($('scriptedResult')?.checked&&goalPlan.length&&!ev)return;
  const side=ev?.side==='right'?1:ev?.side==='left'?0:state.scriptIndex%2;
  const striker=state.players.filter(p=>p.team===side&&p.role==='FWD').sort((a,c)=>Math.abs(a.x-50)-Math.abs(c.x-50))[0];
  state.director={due,side,striker,shot:false,started:state.elapsed};
  say('⚡ ATTACK • '+teamName(side),1.1);
 }
 const dir=state.director;if(!dir)return;
 if(dir.shot)return;
 const striker=dir.striker,goalY=dir.side===0?0:160;
 // The striker makes a real run, without teleporting.
 const runY=dir.side===0?14:146;
 advance(striker,dt*speed(),50,runY,34);
 if(remain>.78){
  // Through-ball: the ball physically travels to the attacker.
  if(!dir.passed){
   const p=b.owner;
   if(p&&p.team===dir.side){
    kick(p,striker.x,striker.y,'pass',striker);
    dir.passed=true;say('↗ THROUGH BALL • '+teamName(dir.side),.9);
   }else if(p){
    // The defending side plays a real long clearance toward the attack.
    kick(p,striker.x,striker.y,'clear',striker);dir.passed=true;
   }
  }
  // Make the attacking striker chase the actual ball, not appear at it.
  if(!b.owner&&b.mode!=='goal'&&dist(striker,b)<5)setCarrier(striker);
  return;
 }
 // The timed shot is a genuine ball flight. Velocity is calculated so that
 // the ball crosses the goal line at the chosen *video* second.
 const flight=Math.max(.12,remain);
 const targetX=50+rnd(-3.5,3.5);
 b.owner=null;b.mode='shot';b.team=dir.side;b.lastTouch=dir.side;
 b.lastShooter=striker.n;b.directed=true;b.flight=0;
 b.vx=(targetX-b.x)/(flight*speed());
 b.vy=(goalY-b.y)/(flight*speed());
 dir.shot=true;state.shots++;state.lastShot={team:dir.side,x:targetX,y:goalY,at:state.elapsed};
 say('🔥 SHOT ON TARGET!',.8);
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
 if(state.elapsed>=duration()/2&&!state.halftime){
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
  advance(owner,d,tx,ty,owner.role==='GK'?6:17);
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
  const pace=p.role==='GK'?10:p.role==='FWD'?17:14;
  advance(p,d,target.x,target.y,pace*(tactic(p.team)==='press'?1.16:1));
 }
 for(const f of state.fx){f.x+=f.vx*dt;f.y+=f.vy*dt;f.vx*=.975;f.vy*=.975;f.life-=dt}state.fx=state.fx.filter(f=>f.life>0);
 if(Math.floor(state.elapsed*4)!==Math.floor((state.elapsed-dt)*4))updateStats();
}
function path(ctx,points){ctx.beginPath();points.forEach(([x,y],i)=>{const q=toCanvas(x,y);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y)})}
function field(){
 const p=pitch(),w=canvas.width,h=canvas.height;
 const grass=ctx.createLinearGradient(0,p.y,0,p.y+p.h);
 grass.addColorStop(0,'#0a5c37');grass.addColorStop(.5,'#087344');grass.addColorStop(1,'#064e31');
 ctx.fillStyle='#071522';ctx.fillRect(0,0,w,h);
 ctx.fillStyle=grass;ctx.fillRect(p.x,p.y,p.w,p.h);
 for(let i=0;i<12;i++){ctx.fillStyle=i%2?'rgba(255,255,255,.033)':'rgba(0,0,0,.05)';ctx.fillRect(p.x,p.y+i*p.h/12,p.w,p.h/12)}
 ctx.strokeStyle='rgba(245,255,246,.86)';ctx.lineWidth=Math.max(2,w*.0026);
 const line=(a,b,c,d)=>{const A=toCanvas(a,b),B=toCanvas(c,d);ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke()};
 const rect=(x,y,rw,rh)=>{const a=toCanvas(x,y);ctx.strokeRect(a.x,a.y,rw*p.sx,rh*p.sy)};
 ctx.strokeRect(p.x,p.y,p.w,p.h);line(0,80,100,80);
 const mid=toCanvas(50,80);ctx.beginPath();ctx.ellipse(mid.x,mid.y,9.15*p.sx,9.15*p.sy,0,0,Math.PI*2);ctx.stroke();
 for(const y of [0,160]){
  const top=y===0;
  rect(20,top?0:132,60,28);rect(35,top?0:151,30,9);
  const penalty=toCanvas(50,top?18:142);
  ctx.beginPath();ctx.arc(penalty.x,penalty.y,Math.max(2,w*.003),0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();
  const arc=toCanvas(50,top?28:132);ctx.beginPath();ctx.ellipse(arc.x,arc.y,9.15*p.sx,9.15*p.sy,0,top?0:Math.PI,top?Math.PI:Math.PI*2);ctx.stroke();
 }
 // Goal nets beyond the goal line.
 for(const top of [true,false]){
  const a=toCanvas(41,top?-5:160),bb=toCanvas(59,top?0:165);
  ctx.fillStyle='rgba(255,255,255,.11)';ctx.fillRect(a.x,a.y,bb.x-a.x,bb.y-a.y);
  ctx.strokeStyle='#f5f8ff';ctx.lineWidth=Math.max(3,w*.005);ctx.strokeRect(a.x,a.y,bb.x-a.x,bb.y-a.y);
  ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=1;
  for(let x=44;x<60;x+=4)line(x,top?-5:160,x,top?0:165);
 }
 // Team banners at the two ends.
 ctx.save();ctx.textAlign='center';ctx.font='900 '+Math.round(w*.032)+'px Segoe UI, sans-serif';ctx.fillStyle='#dceeff';
 ctx.fillText(teamName(1).toUpperCase(),w/2,p.y-w*.035);
 ctx.fillText(teamName(0).toUpperCase(),w/2,p.y+p.h+w*.056);ctx.restore();
}
function drawPlayer(p){
 const q=toCanvas(p.x,p.y),field=pitch(),r=clamp(canvas.width*.017,11,43);
 const c=color(p.team);
 ctx.save();ctx.translate(q.x,q.y);
 const shadow=ctx.createRadialGradient(0,r*.6,r*.2,0,r*.6,r*1.8);
 shadow.addColorStop(0,'rgba(0,0,0,.4)');shadow.addColorStop(1,'rgba(0,0,0,0)');
 ctx.fillStyle=shadow;ctx.beginPath();ctx.ellipse(0,r*.65,r*1.6,r*.75,0,0,Math.PI*2);ctx.fill();
 // Running animation with visible legs, sleeves and torso.
 const stride=Math.sin(p.anim*2)*r*.25;
 ctx.strokeStyle='#1d2933';ctx.lineWidth=r*.27;ctx.lineCap='round';
 ctx.beginPath();ctx.moveTo(-r*.32,r*.32);ctx.lineTo(-r*.45+stride,r*.83);
 ctx.moveTo(r*.32,r*.32);ctx.lineTo(r*.45-stride,r*.83);ctx.stroke();
 ctx.fillStyle=c;ctx.strokeStyle='rgba(0,0,0,.55)';ctx.lineWidth=r*.12;
 ctx.beginPath();ctx.arc(0,0,r*.86,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.fillStyle='rgba(255,255,255,.27)';ctx.beginPath();ctx.arc(-r*.18,-r*.2,r*.38,0,Math.PI*2);ctx.fill();
 ctx.fillStyle=p.role==='GK'?'#d8ff67':'#fff';ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.font='900 '+Math.round(r*.9)+'px Segoe UI, sans-serif';ctx.fillText(String(p.n),0,r*.05);
 if(state.ball?.owner===p){
  ctx.strokeStyle='#f8e36e';ctx.lineWidth=Math.max(3,r*.16);ctx.shadowColor='#fff0a0';ctx.shadowBlur=r*.8;
  ctx.beginPath();ctx.arc(0,0,r*1.22,0,Math.PI*2);ctx.stroke();
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
function drawHUD(){
 const w=canvas.width,h=canvas.height;
 const margin=w*.045,barY=h*.015,barH=Math.max(48,w*.078);
 const barW=w-margin*2;
 ctx.save();ctx.fillStyle='rgba(3,8,18,.94)';
 drawRoundRect(ctx,margin,barY,barW,barH,barH*.23);ctx.fill();
 const fs=Math.max(19,w*.028);
 ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.font='900 '+fs+'px Segoe UI';
 ctx.textAlign='left';ctx.fillText(teamName(0).slice(0,12).toUpperCase(),margin+w*.025,barY+barH/2);
 ctx.textAlign='right';ctx.fillText(teamName(1).slice(0,12).toUpperCase(),w-margin-w*.025,barY+barH/2);
 ctx.textAlign='center';ctx.font='950 '+Math.round(fs*1.25)+'px Segoe UI';
 ctx.fillText(score.left+'  -  '+score.right,w/2,barY+barH*.39);
 const matchMinute=Math.floor(state.elapsed/duration()*90);
 ctx.fillStyle='#f9cf56';ctx.font='900 '+Math.round(fs*.64)+'px Segoe UI';
 ctx.fillText(matchMinute+"'  •  "+Math.ceil(duration()-state.elapsed)+'s',w/2,barY+barH*.79);
 const total=Math.max(.01,state.possessions[0]+state.possessions[1]);
 const home=state.possessions[0]/total;
 const meterY=h*.905,meterH=Math.max(9,w*.009);
 ctx.fillStyle=color(1);ctx.fillRect(margin,meterY,barW,meterH);
 ctx.fillStyle=color(0);ctx.fillRect(margin,meterY,barW*home,meterH);
 ctx.font='800 '+Math.round(fs*.65)+'px Segoe UI';ctx.fillStyle='#e4eeff';
 ctx.textAlign='left';ctx.fillText('POSSESSION '+Math.round(home*100)+'%',margin,meterY+w*.031);
 ctx.textAlign='right';ctx.fillText(Math.round((1-home)*100)+'%  '+state.shots+' SHOTS',w-margin,meterY+w*.031);
 if(state.lastEvent&&state.elapsed<state.eventTime){
  const ew=w*.82,eh=Math.max(40,w*.065),ex=(w-ew)/2,ey=h*.79;
  ctx.fillStyle='rgba(5,11,23,.86)';drawRoundRect(ctx,ex,ey,ew,eh,eh*.26);ctx.fill();
  ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='900 '+Math.round(w*.027)+'px Segoe UI';
  ctx.fillText(state.lastEvent.slice(0,38),w/2,ey+eh/2);
 }
 if(state.goalAnimation&&state.elapsed<state.goalAnimation.until){
  const t=state.goalAnimation.until-state.elapsed;
  ctx.fillStyle='rgba(0,0,0,'+clamp(t/3,0,.55)+')';ctx.fillRect(0,h*.36,w,h*.25);
  ctx.textAlign='center';ctx.fillStyle='#fff';ctx.shadowColor=color(state.goalAnimation.team);
  ctx.shadowBlur=w*.035;ctx.font='950 '+Math.round(w*.13)+'px Segoe UI';
  ctx.fillText('GOOOAL!',w/2,h*.47);
  ctx.shadowBlur=0;ctx.font='900 '+Math.round(w*.046)+'px Segoe UI';
  ctx.fillText(teamName(state.goalAnimation.team).toUpperCase(),w/2,h*.53);
 }
 ctx.restore();
}
function render(){
 if(!enabled())return;
 if(!state.ball)reset(true);
 ctx.save();ctx.clearRect(0,0,canvas.width,canvas.height);
 // The pitch, players and ball share the same camera transform.
 const owner=state.ball.owner;
 const target=owner&&((owner.team===0&&owner.y<42)||(owner.team===1&&owner.y>118))&&$('footballCamera')?.checked?1.085:1;
 state.camera.zoom=lerp(state.camera.zoom,target,.04);
 ctx.save();
 if(state.camera.zoom>1.001){
  const center=toCanvas(50,owner?owner.y:80);
  ctx.translate(center.x,center.y);ctx.scale(state.camera.zoom,state.camera.zoom);ctx.translate(-center.x,-center.y);
 }
 field();
 for(const p of state.players)drawPlayer(p);
 drawBall();
 ctx.restore();
 drawHUD();
 if(roundFinished)drawFinalResult();
 ctx.restore();
}
function applyPreset(){
 $('ratio').value='9:16';$('quality').value='1080';resizeCanvas();
 $('fps').value='60';$('showFinalResult').checked=true;
 $('finalResultDuration').value='2';
 $('viralLoop').checked=false;$('autoStopRecord').checked=true;
 $('recordReset').checked=true;
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
 for(const id of ['footballDuration','footballSpeed','footballAttack','footballTacticLeft','footballTacticRight','footballCamera']){
  $(id)?.addEventListener('change',()=>{if(enabled())updateStats()});
 }
 if(enabled())reset(true);
}
window.Football11={enabled,reset,step,render,applyPreset,state,init,createTournamentSquads:()=>state.players};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
