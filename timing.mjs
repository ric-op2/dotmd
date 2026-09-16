export const FRAME_MS=1000/60.099826520671044;
export const MAX_OFFSET_FRAMES=12;
export const AUDIO_LEAD_SECONDS=.035;
export const TIMING_STORAGE_KEY='dotmd:timing:v1';
export const clampFrames=value=>Math.max(-MAX_OFFSET_FRAMES,Math.min(MAX_OFFSET_FRAMES,Math.round(Number(value)||0)));
export const signed=value=>`${value>0?'+':value<0?'−':''}${Math.abs(value)}`;
export const offsetText=frames=>`${signed(Math.round(frames*FRAME_MS))}ms`;
export function median(values){const a=[...values].sort((a,b)=>a-b),m=Math.floor(a.length/2);return a.length?(a.length%2?a[m]:(a[m-1]+a[m])/2):0;}
export function analyseTaps(values){
  const valid=values.filter(v=>Number.isFinite(v)&&Math.abs(v)<=250);
  if(valid.length<8)return{reliable:false,reason:'count',count:valid.length};
  const centre=median(valid),mad=median(valid.map(v=>Math.abs(v-centre)));
  const inliers=valid.filter(v=>Math.abs(v-centre)<=Math.max(40,mad*3));
  const measured=median(inliers),spread=median(inliers.map(v=>Math.abs(v-measured)));
  return{reliable:inliers.length>=8&&spread<=30&&Math.abs(measured)<=MAX_OFFSET_FRAMES*FRAME_MS,
    reason:Math.abs(measured)>MAX_OFFSET_FRAMES*FRAME_MS?'range':inliers.length<8||spread>30?'spread':null,
    count:inliers.length,measuredMs:measured,spreadMs:spread,frames:clampFrames(measured/FRAME_MS)};
}
export function readTiming(storage){try{return clampFrames(JSON.parse(storage.getItem(TIMING_STORAGE_KEY)||'null')?.frames);}catch{return 0;}}

export class TimingPanel {
  constructor({getAudio,pauseGame,onApply,onClose,initialFrames=0}){
    this.getAudio=getAudio;this.pauseGame=pauseGame;this.onApply=onApply;this.onClose=onClose;this.saved=clampFrames(initialFrames);
    this.dialog=document.getElementById('timing-dialog');this.range=document.getElementById('timing-offset');this.nodes=[];this.session=null;this.starting=false;
    const $=id=>document.getElementById(id);this.$=$;
    $('timing-open').addEventListener('click',()=>this.open());
    $('timing-close').addEventListener('click',()=>this.dialog.close());
    this.dialog.addEventListener('close',()=>{this.stop();this.onClose?.();});
    this.dialog.addEventListener('cancel',()=>this.stop());
    this.range.addEventListener('input',()=>this.render());
    $('timing-minus').addEventListener('click',()=>{this.range.value=clampFrames(Number(this.range.value)-1);this.render();});
    $('timing-plus').addEventListener('click',()=>{this.range.value=clampFrames(Number(this.range.value)+1);this.render();});
    $('timing-zero').addEventListener('click',()=>{this.range.value=0;this.render();});
    $('timing-apply').addEventListener('click',()=>{this.saved=clampFrames(this.range.value);this.onApply(this.saved);this.dialog.close();});
    $('calibrate-start').addEventListener('click',()=>this.measure());
    $('calibrate-stop').addEventListener('click',()=>{this.stop();$('calibrate-message').textContent='測定を中止しました。設定は変更していません。';});
    $('calibrate-tap').addEventListener('pointerdown',e=>{e.preventDefault();this.tap(e.timeStamp);});
    document.addEventListener('keydown',e=>{if(this.dialog.open&&this.session&&e.code==='Space'){e.preventDefault();if(!e.repeat)this.tap(e.timeStamp);}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.session){this.stop();$('calibrate-message').textContent='測定が中断されました。もう一度測定してください。';}});
    this.updateButton();
  }
  open(){this.pauseGame();this.range.value=this.saved;this.$('calibrate-message').textContent='4拍の予告のあと、リズムに合わせて12回押してください。';this.$('calibrate-result').textContent='';this.render();this.dialog.showModal();}
  render(){const frames=clampFrames(this.range.value);this.$('timing-value').textContent=offsetText(frames);this.$('timing-direction').textContent=frames===0?'補正なし':`${Math.abs(frames)}フレーム分、判定を${frames>0?'遅く':'早く'}します`;}
  updateButton(){this.$('timing-open').textContent=`タイミング ${offsetText(this.saved)}`;}
  stop(){this.session=null;this.starting=false;for(const n of this.nodes){try{n.stop();}catch{}}this.nodes=[];this.$('calibrate-orb').classList.remove('flash');this.$('calibrate-start').disabled=false;this.$('calibrate-stop').hidden=true;this.$('calibrate-tap').disabled=true;this.$('timing-apply').disabled=false;this.dialog.querySelectorAll('input[name="calibrate-mode"]').forEach(x=>x.disabled=false);}
  async measure(){
    if(this.starting||this.session)return;this.starting=true;this.$('calibrate-start').disabled=true;
    try{
      const audio=await this.getAudio();if(!this.dialog.open){this.stop();return;}
      const mode=this.dialog.querySelector('input[name="calibrate-mode"]:checked').value;
      // Reproduce the game's audio queue lead. Taps are compared with the
      // underlying judgement clock, not the delayed audible/output clock.
      const startPerf=performance.now()+800,startAudio=audio.currentTime+.8;
      this.session={mode,startPerf,taps:new Map(),count:16,period:600};this.starting=false;
      if(mode==='audio')for(let i=0;i<16;i++){
        const osc=audio.createOscillator(),env=audio.createGain(),t=startAudio+i*.6+AUDIO_LEAD_SECONDS;
        osc.type='sine';osc.frequency.value=i<4?700:1000;env.gain.setValueAtTime(0,t);env.gain.linearRampToValueAtTime(.22,t+.002);env.gain.exponentialRampToValueAtTime(.001,t+.035);
        osc.connect(env);env.connect(audio.destination);osc.start(t);osc.stop(t+.04);this.nodes.push(osc);
      }
      this.$('calibrate-result').textContent='';this.$('calibrate-stop').hidden=false;this.$('calibrate-tap').disabled=false;this.$('timing-apply').disabled=true;
      this.dialog.querySelectorAll('input[name="calibrate-mode"]').forEach(x=>x.disabled=true);
      const measuredSession=this.session;
      const paint=now=>{
        const s=this.session;if(!s||s!==measuredSession)return;
        const time=now-s.startPerf,beat=Math.floor(time/s.period);
        this.$('calibrate-orb').classList.toggle('flash',s.mode==='visual'&&time>=0&&beat<16&&time%s.period<80);
        this.$('calibrate-count').textContent=beat<0?'準備':beat<4?`予告 ${beat+1} / 4`:`${s.taps.size} / 12`;
        this.$('calibrate-message').textContent=beat<4?'数拍見聞きして、リズムをつかんでください。':s.mode==='audio'?'音に合わせて SPACE または下のボタンを押してください。':'光に合わせて SPACE または下のボタンを押してください。';
        if(time>15*s.period+400){this.finish();return;}requestAnimationFrame(paint);
      };requestAnimationFrame(paint);
    }catch(error){console.error(error);this.stop();this.$('calibrate-message').textContent='測定を開始できませんでした。もう一度お試しください。';}
  }
  tap(stamp){
    const s=this.session;if(!s)return;const now=performance.now();
    const t=Number.isFinite(stamp)&&Math.abs(stamp-now)<2000?stamp:now;
    const index=Math.round((t-s.startPerf)/s.period),delta=t-(s.startPerf+index*s.period);
    if(index<4||index>=16||Math.abs(delta)>250||s.taps.has(index))return;
    s.taps.set(index,delta);this.$('calibrate-count').textContent=`${s.taps.size} / 12`;
    if(s.taps.size===12)this.finish();
  }
  finish(){
    const result=analyseTaps([...this.session.taps.values()]);this.lastResult=result;this.stop();
    if(result.reliable){
      this.range.value=result.frames;this.render();this.$('calibrate-message').textContent='測定できました。下のボタンで設定を適用できます。';
      this.$('calibrate-result').textContent=`調整の目安：${offsetText(result.frames)}（${result.count}回の入力から算出）`;
    }else{
      this.$('calibrate-message').textContent=result.reason==='count'?'入力が少なかったため、もう一度測定してください。':result.reason==='range'?'測定値が調整範囲を超えました。接続する音声機器を変えるか、もう一度測定してください。':'入力のばらつきが大きいため、もう一度測定してください。';
      this.$('calibrate-result').textContent='現在の設定は変更していません。';
    }
  }
}
