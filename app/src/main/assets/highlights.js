/* GoalHole Highlight Director v8 — independent authored football-highlight engine.
 * Not based on the 11v11 physics simulation. Offline, original canvas artwork.
 */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const C=()=>canvas, G=()=>ctx;
const cl=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const ease=t=>{t=cl(t,0,1);return t*t*(3-2*t)};
const colors=side=>side===0?$('leftColor').value:$('rightColor').value;
const name=side=>($((side===0?'leftName':'rightName')).value||['HOME','AWAY'][side]).toUpperCase();
const badge=side=>side===0?leftBadgeImg:rightBadgeImg;
const enabled=()=>$('gameType')?.value==='highlights';
let state={elapsed:0,events:[],segments:[],triggered:[],current:0,done:false,prevIdx:-1};
let pitchCache=null,pitchKey='';
let lastScript='',lastDuration=0;
const sample=[
'12|L|GOAL|HAALAND|UNSTOPPABLE FINISH!',
'37|R|SAVE|COURTOIS|WHAT A SAVE!',
'45+2|R|GOAL|MBAPPÉ|TOP CORNER!',
'78|L|MISS|BELLINGHAM|HOW DID HE MISS?',
'90+3|L|GOAL|HAALAND|LAST-SECOND WINNER!'
].join('\n');
function duration(){return cl(Number($('hlDuration')?.value)||30,8,240)}
function parseScript(src){
 const out=[];
 for(const [i,line] of String(src||'').split(/\n/).entries()){
  const t=line.trim();if(!t||t.startsWith('#'))continue;
  const a=t.split('|').map(x=>x.trim()),type=(a[2]||'GOAL').toUpperCase();
  const side=/^(R|RIGHT|2|AWAY|SAĞ)$/i.test(a[1]||'')?1:0;
  const allowed=['GOAL','SAVE','MISS','PENALTY','VAR','POST','COUNTER','FREEKICK'];
  const minute=/^\d{1,3}(?:\+\d{1,2})?$/.test(a[0]||'')?a[0]:(i*12+8)+'';
  out.push({minute,side,type:allowed.includes(type)?type:'GOAL',player:(a[3]||'STAR PLAYER').slice(0,36),caption:(a.slice(4).join('|')||'WHAT A MOMENT!').slice(0,76)});
 }
 return out.slice(0,18);
}
function events(){
 const text=$('hlScript')?.value||sample,d=duration();
 if(text===lastScript&&d===lastDuration&&state.events.length)return state.events;
 lastScript=text;lastDuration=d;state.events=parseScript(text);
 if(!state.events.length)state.events=parseScript(sample);
 const n=state.events.length,intro=d<18?.6:1.05,outro=d<18?1.1:2.1;
 const slot=Math.max(.45,(d-intro-outro)/n);
 state.segments=state.events.map((event,i)=>({
  ...event,start:intro+i*slot,end:intro+(i+1)*slot,
  goalAt:intro+(i+.77)*slot,slot
 }));
 return state.events;
}
function reset(silent=false){
 lastScript='';state={elapsed:0,events:[],segments:[],triggered:[],current:0,done:false,prevIdx:-1};
 events();score={left:0,right:0};updateScores();roundFinished=false;roundResultOverlay=null;
 if(!silent)toast('Highlight Director hazır');
}
function stats(){
 const e=state.segments;
 return {duration:duration(),events:e.length,goals:e.filter(x=>['GOAL','PENALTY','COUNTER','FREEKICK'].includes(x.type)).length};
}
function update(dt){
 if(!enabled()||mode!=='play'||state.done)return;
 events();
 state.elapsed=Math.min(duration(),state.elapsed+cl(dt,0,.1));
 for(let i=0;i<state.segments.length;i++){
  const e=state.segments[i];
  if(state.elapsed>=e.goalAt&&!state.triggered[i]){
   state.triggered[i]=true;
   if(['GOAL','PENALTY','COUNTER','FREEKICK'].includes(e.type)){
    if(e.side===0)score.left++;else score.right++;
    updateScores();
    try{playGoalSound()}catch(err){}
   }else{
    try{playTone(e.type==='SAVE'?800:330,.13,'triangle',.09)}catch(err){}
   }
  }
 }
 if(state.elapsed>=duration()){
  state.done=true;finishRound();
 }
}
function rect(x,y,w,h,r=0,color='#fff',stroke=null,sw=1){
 const g=G();g.beginPath();drawRoundRect(g,x,y,w,h,r);g.fillStyle=color;g.fill();
 if(stroke){g.strokeStyle=stroke;g.lineWidth=sw;g.stroke()}
}
function txt(t,x,y,size,color='#fff',weight=900,align='center',max=null){
 const g=G();g.fillStyle=color;g.textAlign=align;g.textBaseline='middle';g.font=weight+' '+Math.round(size)+'px Arial, sans-serif';
 g.fillText(String(t),x,y,max||C().width);
}
function imgCircle(im,x,y,r){
 if(!im)return;
 const g=G();g.save();g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.clip();
 const iw=im.naturalWidth||im.width||1,ih=im.naturalHeight||im.height||1,k=Math.max(r*2/iw,r*2/ih);
 try{g.drawImage(im,x-iw*k/2,y-ih*k/2,iw*k,ih*k)}catch(e){}
 g.restore();
}
function pitchBounds(){
 const w=C().width,h=C().height,vertical=h>w;
 return vertical?{x:w*.055,y:h*.205,w:w*.89,h:h*.585,v:true}:{x:w*.14,y:h*.16,w:w*.72,h:h*.71,v:false};
}
function buildPitch(){
 const w=C().width,h=C().height,b=pitchBounds();
 const off=document.createElement('canvas');off.width=w;off.height=h;const g=off.getContext('2d',{alpha:false});
 const bg=g.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#041020');bg.addColorStop(.52,'#0a1c30');bg.addColorStop(1,'#030914');
 g.fillStyle=bg;g.fillRect(0,0,w,h);
 // Floodlit stadium tiers and spectators: cached, not redrawn per frame.
 for(let side=0;side<2;side++){
  const y=side?h*.80:h*.15;
  const grad=g.createLinearGradient(0,y,0,y+h*.08);grad.addColorStop(0,'#122d42');grad.addColorStop(1,'#06111d');
  g.fillStyle=grad;g.fillRect(0,y,w,h*.085);
  for(let i=0;i<145;i++){
   const x=(i*73.7)%w,yy=y+((i*37.1)%(h*.065));
   g.fillStyle=i%6===0?'#b9d7e1':i%4===0?'#d7b77b':'#2d586b';
   g.globalAlpha=.25+(i%4)*.1;g.fillRect(x,yy,Math.max(1,w*.002),Math.max(1,w*.002));
  }
  g.globalAlpha=1;
 }
 // High contrast football pitch, wide sideboards and depth cues.
 rectOn(g,b.x-w*.009,b.y-w*.014,b.w+w*.018,b.h+w*.028,w*.012,'#081922');
 const field=g.createLinearGradient(b.x,b.y,b.x+b.w,b.y+b.h);
 field.addColorStop(0,'#075e47');field.addColorStop(.5,'#0a7753');field.addColorStop(1,'#064d3c');
 g.fillStyle=field;g.fillRect(b.x,b.y,b.w,b.h);
 for(let i=0;i<10;i++){g.fillStyle=i%2?'rgba(255,255,255,.04)':'rgba(0,0,0,.045)';g.fillRect(b.x,b.y+b.h*i/10,b.w,b.h/10)}
 g.strokeStyle='rgba(240,255,245,.80)';g.lineWidth=Math.max(2,w*.0024);
 g.strokeRect(b.x+w*.004,b.y+w*.004,b.w-w*.008,b.h-w*.008);
 g.beginPath();g.moveTo(b.x,b.y+b.h*.5);g.lineTo(b.x+b.w,b.y+b.h*.5);g.stroke();
 g.beginPath();g.ellipse(b.x+b.w*.5,b.y+b.h*.5,b.w*.14,b.h*.105,0,0,Math.PI*2);g.stroke();
 for(let edge=0;edge<2;edge++){
  const yy=edge?b.y+b.h:b.y,sign=edge?-1:1;
  g.strokeRect(b.x+b.w*.21,yy,b.w*.58,sign*b.h*.16);
  g.strokeRect(b.x+b.w*.36,yy,b.w*.28,sign*b.h*.065);
  const goalY=yy-sign*w*.027;
  g.fillStyle='#c7eff0';g.fillRect(b.x+b.w*.375,goalY,b.w*.25,w*.011);
  g.strokeStyle='rgba(230,250,255,.50)';g.lineWidth=Math.max(1,w*.0012);
  for(let j=0;j<=7;j++){let xx=b.x+b.w*(.375+.25*j/7);g.beginPath();g.moveTo(xx,yy);g.lineTo(xx,goalY);g.stroke()}
  g.strokeStyle='rgba(240,255,245,.80)';g.lineWidth=Math.max(2,w*.0024);
 }
 // Premium advertising boards stay outside the playing area.
 for(let i=0;i<8;i++){
  const x=b.x+i*b.w/8;
  g.fillStyle=i%2?'#113d62':'#172947';
  g.fillRect(x,b.y+b.h+w*.016,b.w/8-w*.003,w*.022);
 }
 return off;
}
function rectOn(g,x,y,w,h,r,color){g.beginPath();drawRoundRect(g,x,y,w,h,r);g.fillStyle=color;g.fill()}
function background(){
 const key=C().width+'x'+C().height;
 if(!pitchCache||pitchKey!==key){pitchKey=key;pitchCache=buildPitch()}
 G().drawImage(pitchCache,0,0);
}
function player(x,y,side,num,scale=1,keeper=false){
 const w=C().width,b=pitchBounds(),r=w*(b.v?.030:.017)*scale;
 const g=G();g.save();g.translate(x,y);
 g.fillStyle='rgba(0,0,0,.4)';g.beginPath();g.ellipse(r*.2,r*.9,r*.90,r*.32,0,0,Math.PI*2);g.fill();
 const kit=keeper?'#e9f4a0':colors(side);
 g.fillStyle=kit;g.strokeStyle='#07151f';g.lineWidth=Math.max(1,r*.12);
 g.beginPath();g.ellipse(0,0,r*.78,r*1.08,0,0,Math.PI*2);g.fill();g.stroke();
 g.fillStyle='#f5c6a1';g.beginPath();g.arc(0,-r*.63,r*.36,0,Math.PI*2);g.fill();
 g.fillStyle='#172638';g.beginPath();g.arc(0,-r*.75,r*.30,Math.PI,Math.PI*2);g.fill();
 imgCircle(badge(side),0,r*.08,r*.30);
 if(!badge(side))txt(num,0,r*.1,r*.56,'#fff',900);
 g.restore();
}
function ball(x,y,r){
 const g=G();g.save();g.shadowColor='#ffffff';g.shadowBlur=r*.4;
 g.fillStyle='#f7fbfc';g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();
 g.shadowBlur=0;g.fillStyle='#132330';g.beginPath();
 for(let i=0;i<5;i++){const a=i*Math.PI*2/5-Math.PI/2;g.lineTo(x+Math.cos(a)*r*.53,y+Math.sin(a)*r*.53)}
 g.closePath();g.fill();g.restore();
}
function sceneEvent(){
 const t=state.elapsed,segments=state.segments;
 if(!segments.length)return {e:null,p:0,idx:0};
 let idx=segments.findIndex(e=>t<e.end);
 if(idx<0)idx=segments.length-1;
 const e=segments[idx],p=cl((t-e.start)/e.slot,0,1);
 return {e,p,idx};
}
function scene(){
 const {e,p,idx}=sceneEvent();
 if(!e)return;
 const b=pitchBounds(),w=C().width,h=C().height,side=e.side;
 const attackTop=side===0,dir=attackTop?-1:1;
 const centerX=b.x+b.w*.5,goalY=attackTop?b.y:b.y+b.h;
 const isGoal=['GOAL','PENALTY','COUNTER','FREEKICK'].includes(e.type);
 const t=ease(cl((p-.50)/.27,0,1));
 const pre=ease(cl(p/.55,0,1));
 const shot=ease(cl((p-.68)/.09,0,1));
 const after=ease(cl((p-.77)/.23,0,1));
 // Camera follows the decisive move, not 22 static player dots.
 const zoom=$('hlStyle').value==='cinema'?1.075:1.025;
 const camera=1+(zoom-1)*ease(cl((p-.33)/.40,0,1));
 const g=G();g.save();
 g.translate(w*.5,h*.5);g.scale(camera,camera);g.translate(-w*.5,-h*.5);
 const midfield=b.y+b.h*.50;
 const startY=midfield-dir*b.h*.07;
 const passY=goalY-dir*b.h*.37;
 const shotY=goalY-dir*b.h*.20;
 const runY=mix(startY,passY,pre);
 const strikerY=mix(passY,shotY,t);
 const opponent=1-side;
 const variation=(idx%3-1)*b.w*.15;
 // Short choreographed formations (not the 11v11 simulation).
 for(let j=0;j<4;j++){
  const xx=centerX+(j-1.5)*b.w*.19+Math.sin(p*7+j)*w*.007;
  const yy=midfield+dir*(b.h*.15+j%2*b.h*.10)-dir*pre*b.h*.12;
  player(xx,yy,opponent,j+2,.80);
 }
 for(let j=0;j<3;j++){
  const xx=centerX+(j-1)*b.w*.24+variation*.16;
  const yy=mix(midfield-dir*b.h*.18,goalY-dir*b.h*.43,pre)+(j%2)*dir*b.h*.09;
  player(xx,yy,side,j+6,.91);
 }
 player(centerX+variation*.25,strikerY,side,9,1.30);
 player(centerX+Math.sin(p*9)*b.w*.06,goalY+dir*b.h*.07,opponent,1,1.10,true);
 let bx,by;
 if(p<.47){
  bx=mix(centerX-b.w*.23,centerX+variation*.25,ease(p/.47));
  by=mix(startY,passY,ease(p/.47));
 }else if(p<.68){
  bx=mix(centerX+variation*.25,centerX,ease((p-.47)/.21));
  by=mix(passY,shotY,ease((p-.47)/.21));
 }else{
  bx=mix(centerX,centerX+variation*.22,shot);
  by=mix(shotY,isGoal?goalY+dir*b.h*.012:goalY-dir*b.h*.10,shot);
  if(!isGoal&&p>.77){
   bx+=Math.sin(after*Math.PI)*b.w*.08;
   by-=dir*after*b.h*.17;
  }
 }
 const radius=w*(b.v?.014:.009);
 if(p>.68&&p<.88){
  g.strokeStyle='rgba(255,238,130,.64)';g.lineWidth=radius*.6;g.beginPath();
  g.moveTo(centerX,shotY);g.lineTo(bx,by);g.stroke();
 }
 ball(bx,by,radius);
 if(p>.77&&p<.95){
  const flash=ease(cl((p-.77)/.05,0,1))*(1-ease(cl((p-.89)/.06,0,1)));
  g.globalAlpha=flash*.75;g.fillStyle=isGoal?'#fff2a6':'#e4f7ff';
  g.beginPath();g.arc(bx,by,radius*(2+flash*8),0,Math.PI*2);g.fill();g.globalAlpha=1;
 }
 g.restore();
 if(p>.77&&p<.96){
  const alpha=cl((p-.77)/.055,0,1)*(1-ease((p-.91)/.05));
  g.save();g.globalAlpha=alpha;
  const label=isGoal?'GOOOOAL!':e.type==='SAVE'?'INCREDIBLE SAVE!':e.type==='POST'?'OFF THE POST!':e.type==='VAR'?'VAR CHECK!':'SO CLOSE!';
  const fs=w*(b.v?.105:.065);
  g.shadowColor=isGoal?colors(side):'#b6e7ff';g.shadowBlur=w*.035;
  txt(label,w*.5,h*.48,fs,'#fff',950,'center',w*.94);
  g.restore();
 }
}
function header(){
 const w=C().width,h=C().height,b=pitchBounds(),v=b.v;
 const top=v?h*.063:h*.028;
 const barW=v?w*.91:w*.68,barH=v?w*.125:h*.135;
 const x=(w-barW)/2;
 rect(x,top,barW,barH,barH*.23,'rgba(2,10,22,.96)','rgba(176,223,242,.35)',Math.max(2,w*.002));
 const logoR=barH*.29;
 imgCircle(badge(0),x+barH*.48,top+barH*.50,logoR);
 imgCircle(badge(1),x+barW-barH*.48,top+barH*.50,logoR);
 const textW=barW*.31,fs=v?w*.026:w*.015;
 txt(name(0),x+barW*.25,top+barH*.45,fs,'#fff',900,'center',textW);
 txt(name(1),x+barW*.75,top+barH*.45,fs,'#fff',900,'center',textW);
 txt(score.left+'  :  '+score.right,w*.5,top+barH*.38,v?w*.043:w*.029,'#fff',950);
 const {e}=sceneEvent();
 txt(e?.minute?e.minute+"'":'0',w*.5,top+barH*.80,v?w*.019:w*.011,'#fbd779',800);
 // Header label not inside pitch.
 txt('MATCH HIGHLIGHTS',w*.5,top+barH+w*(v?.043:.015),w*(v?.028:.013),'#d5edff',950);
}
function caption(){
 const {e,p}=sceneEvent(),w=C().width,h=C().height,v=h>w;
 if(!e)return;
 const by=v?h*.825:h*.875,barW=v?w*.91:w*.68,barH=v?h*.086:h*.085,x=(w-barW)/2;
 rect(x,by,barW,barH,w*.018,'rgba(3,11,25,.94)','rgba(120,184,215,.35)',Math.max(1,w*.0015));
 const tag=e.type==='GOAL'?'GOAL':e.type==='PENALTY'?'PENALTY':e.type==='COUNTER'?'COUNTER ATTACK':e.type==='FREEKICK'?'FREE KICK':e.type;
 txt(tag+'  •  '+e.minute+"'",w*.5,by+barH*.24,v?w*.026:w*.012,'#ffdd82',950);
 txt(p>.77?e.caption:e.player+'  •  '+(p<.47?'BUILD UP':p<.68?'THE FINAL PASS':'THE SHOT!'),w*.5,by+barH*.67,v?w*.032:w*.019,'#fff',950,'center',barW*.90);
 // Timeline: no empty dead time.
 const barY=by+barH+w*.016;
 rect(x,barY,barW,w*.007,w*.004,'#193044');
 rect(x,barY,barW*cl(state.elapsed/duration(),0,1),w*.007,w*.004,'#ffcd58');
 for(const event of state.segments){
  const px=x+barW*event.goalAt/duration();
  rect(px-w*.003,barY-w*.005,w*.006,w*.017,w*.002,'#f6f4e9');
 }
}
function hook(){
 const t=state.elapsed,w=C().width,h=C().height,v=h>w;
 if(t>1.25)return;
 const alpha=cl(Math.min(t/.12,(1.25-t)/.25),0,1);
 const msg=$('hlHook').value.trim()||'WHO WINS THIS MATCH?';
 const barW=w*(v?.90:.63),barH=h*(v?.068:.10),y=h*(v?.43:.43);
 const g=G();g.save();g.globalAlpha=alpha;
 rect((w-barW)/2,y,barW,barH,w*.018,'rgba(4,13,27,.95)','#ffcc66',Math.max(2,w*.003));
 txt(msg.toUpperCase(),w*.5,y+barH*.5,w*(v?.044:.033),'#ffe5a1',950,'center',barW*.91);
 g.restore();
}
function finale(){
 const t=state.elapsed,d=duration(),v=C().height>C().width,w=C().width,h=C().height;
 if(t<d-(d<18?1.1:2.1))return;
 const age=cl((t-(d-(d<18?1.1:2.1)))/.25,0,1);
 const g=G();g.save();g.globalAlpha=age;
 rect(w*.05,h*.36,w*.90,h*.24,w*.026,'rgba(3,11,26,.95)','#f2d27c',Math.max(2,w*.004));
 txt('FULL TIME',w*.5,h*.405,w*(v?.06:.036),'#ffda8b',950);
 txt(name(0)+'  '+score.left+'  :  '+score.right+'  '+name(1),w*.5,h*.485,w*(v?.038:.025),'#fff',950,'center',w*.83);
 txt('WHO WAS THE MVP?  COMMENT BELOW',w*.5,h*.56,w*(v?.025:.016),'#c7e8fb',900);
 g.restore();
}
function render(){
 if(!enabled())return;
 events();background();
 if(state.elapsed>=1.25)scene();else scene();
 header();caption();hook();finale();
}
function applyPreset(kind){
 $('gameType').value='highlights';
 $('highlightControls').style.display='block';
 $('footballControls').style.display='none';
 $('pinballOnlyNote').style.display='block';
 $('ratio').value=kind==='wide'?'16:9':'9:16';
 $('quality').value='1080';
 $('fps').value='30';$('bitrate').value='12000000';
 $('hlDuration').value=kind==='wide'?'150':'30';
 $('hlScript').value=kind==='wide'?[
 '8|L|SAVE|GOALKEEPER|MASSIVE OPENING SAVE!',
 '18|R|GOAL|FORWARD|FIRST BLOOD!',
 '29|L|MISS|STRIKER|INCHES WIDE!',
 '43|L|GOAL|CAPTAIN|BACK IN THE GAME!',
 '45+2|R|POST|WINGER|OFF THE WOODWORK!',
 '59|L|PENALTY|NUMBER 9|CLINICAL PENALTY!',
 '71|R|GOAL|NUMBER 10|WHAT A STRIKE!',
 '84|L|SAVE|KEEPER|WORLD CLASS STOP!',
 '90+3|L|GOAL|CAPTAIN|UNBELIEVABLE WINNER!'
 ].join('\n'):sample;
 $('hlStyle').value='cinema';$('hlHook').value='WHO WINS THIS MATCH?';
 resizeCanvas();reset(true);render();toast('Highlight Director • '+(kind==='wide'?'16:9':'9:16')+' hazır');
}
function init(){
 const sel=$('gameType');
 if(sel&&!sel.querySelector('[value="highlights"]')){
  const option=document.createElement('option');option.value='highlights';option.textContent='🎬 YENİ • Viral Maç Özeti Stüdyosu';
  sel.insertBefore(option,sel.firstChild);
 }
 const football=$('footballControls');
 const section=document.createElement('div');section.id='highlightControls';section.style.display='none';
 section.innerHTML=
  '<div class="tinyNote" style="margin:10px 0">🎬 Baştan tasarlanmış bağımsız maç özeti motoru: 22 oyuncunun maçını bekletmez; önemli pozisyonları sinematik sahnelerle anlatır. Kendi ürettiğin simülasyondur, gerçek yayın görüntüsü değildir.</div>'+
  '<div class="row"><button class="btn primary" id="hlShortPreset" type="button">⚡ Viral Shorts 9:16</button><button class="btn primary" id="hlWidePreset" type="button">🏟️ TV Özeti 16:9</button></div>'+
  '<div class="row"><div><label class="lbl">Video süresi (saniye)</label><input id="hlDuration" type="number" min="8" max="240" value="30"></div><div><label class="lbl">Kamera tarzı</label><select id="hlStyle"><option value="cinema">Cinematic • Dinamik</option><option value="broadcast">TV Yayını • Sakin</option></select></div></div>'+
  '<label class="lbl">İlk saniye merak cümlesi</label><input id="hlHook" type="text" value="WHO WINS THIS MATCH?" placeholder="WHO WINS THIS MATCH?">'+
  '<label class="lbl">Maç özeti senaryosu (her satır ayrı pozisyon)</label>'+
  '<textarea id="hlScript" rows="9" style="width:100%;min-height:180px;resize:vertical;font-size:12px;line-height:1.65" spellcheck="false"></textarea>'+
  '<div class="tinyNote">Biçim: <b>DAKİKA | L veya R | OLAY | OYUNCU | EKRAN YAZISI</b><br>Olaylar: GOAL, SAVE, MISS, PENALTY, VAR, POST, COUNTER, FREEKICK.<br>45+2 / 90+3 desteklenir. Dakikalar ekranda gösterilir; pozisyonlar videoya eşit aralıklarla sinematik olarak kurgulanır. Gol saniyesi zorunlu değildir.</div>'+
  '<div class="row"><button class="btn" id="hlPreview" type="button">▶ Özeti başlat</button><button class="btn" id="hlReset" type="button">↺ Baştan</button></div>'+
  '<div class="tinyNote" id="hlSummary">5 pozisyon • 3 gol • 30 saniye</div>';
 football.parentNode.insertBefore(section,football);
 $('hlScript').value=sample;
 $('hlShortPreset').onclick=()=>applyPreset('short');
 $('hlWidePreset').onclick=()=>applyPreset('wide');
 $('hlPreview').onclick=()=>{if(mode!=='play')$('playBtn').click();else reset(true)};
 $('hlReset').onclick=()=>{reset(true);render()};
 for(const id of ['hlDuration','hlStyle','hlHook','hlScript']){
  $(id).addEventListener('change',()=>{reset(true);render();const a=stats();$('hlSummary').textContent=a.events+' pozisyon • '+a.goals+' gol • '+a.duration+' saniye'});
 }
 sel.value='highlights';section.style.display='block';football.style.display='none';$('pinballOnlyNote').style.display='block';
 sel.addEventListener('change',()=>{
  section.style.display=enabled()?'block':'none';
  if(enabled()){football.style.display='none';$('pinballOnlyNote').style.display='block';reset(true)}
  else if($('pinballOnlyNote'))$('pinballOnlyNote').style.display=sel.value==='football11'?'block':'none';
  render();
 });
}
function config(){return {duration:$('hlDuration').value,style:$('hlStyle').value,hook:$('hlHook').value,script:$('hlScript').value}}
function restore(o={}){
 for(const [id,v] of [['hlDuration',o.duration??30],['hlStyle',o.style||'cinema'],['hlHook',o.hook||'WHO WINS THIS MATCH?'],['hlScript',o.script||sample]])if($(id))$(id).value=v;
 $('highlightControls').style.display=enabled()?'block':'none';
 reset(true);
}
window.HighlightDirector={enabled,init,reset,step:update,render,applyPreset,parseScript,stats,config,restore,get state(){return state}};
init();
})();