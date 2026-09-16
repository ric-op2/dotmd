import {LibretroHost} from './vendor/host/LibretroHost.js';
import factory from './vendor/fceumm/fceumm_libretro.js';
import {DiskBridge} from './bridge.mjs';
import {TimingPanel,readTiming,TIMING_STORAGE_KEY,AUDIO_LEAD_SECONDS} from './timing.mjs';

const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d',{alpha:false});
const host=new LibretroHost({log:()=>{}}),heldKeys=new Set(),touches=new Map();
const keymap={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',KeyZ:'b',KeyX:'a',Enter:'start',ShiftLeft:'select',ShiftRight:'select'};
const SAVE_KEY='dotmd:records:v060';
let timingFrames=0;try{timingFrames=readTiming(localStorage);}catch{}
let bridge,audio,gain,nextAudio=0,muted=false,running=false,ready=false,loading=false,lastTime=0,accumulator=0,imageData,toastUntil=0;
const soundNodes=new Set();
function status(text,seconds=0){$('status').textContent=text;toastUntil=performance.now()+seconds*1000;}
function clearInput(){heldKeys.clear();touches.clear();document.querySelectorAll('[data-pad]').forEach(b=>b.classList.remove('held'));}
function clearAudio(){for(const node of soundNodes){try{node.stop();}catch{} }soundNodes.clear();nextAudio=audio?.currentTime||0;}
function draw(){const f=host.screenshotRgba();if(!imageData||imageData.width!==f.width||imageData.height!==f.height){canvas.width=f.width;canvas.height=f.height;imageData=new ImageData(f.width,f.height);}imageData.data.set(f.rgba);ctx.putImageData(imageData,0,0);}
function audioFrame(){
  for(const chunk of host.state.audioRing){
    if(!audio||muted||!running)continue;
    const frames=chunk.length/2,buffer=audio.createBuffer(2,frames,host.status.audioSampleRate);
    for(let channel=0;channel<2;channel++){const out=buffer.getChannelData(channel);for(let i=0;i<frames;i++)out[i]=chunk[i*2+channel]/32768;}
    if(nextAudio<audio.currentTime+.005||nextAudio>audio.currentTime+.18)nextAudio=audio.currentTime+AUDIO_LEAD_SECONDS;
    const source=audio.createBufferSource();source.buffer=buffer;source.connect(gain);soundNodes.add(source);source.onended=()=>soundNodes.delete(source);source.start(nextAudio);nextAudio+=buffer.duration;
  }
  host.state.audioRing.length=0;
}
function input(){
  const pad={};for(const k of heldKeys)if(keymap[k])pad[keymap[k]]=true;for(const p of touches.values())pad[p]=true;
  const gamepad=Array.from(navigator.getGamepads?.()||[]).find(p=>p&&p.mapping==='standard');
  if(gamepad){const b=i=>Boolean(gamepad.buttons[i]?.pressed);pad.left||=b(14)||gamepad.axes[0]<-.45;pad.right||=b(15)||gamepad.axes[0]>.45;pad.up||=b(12)||gamepad.axes[1]<-.45;pad.down||=b(13)||gamepad.axes[1]>.45;pad.a||=b(0);pad.b||=b(1);pad.start||=b(9);pad.select||=b(8);}
  return pad;
}
function fail(error){console.error(error);running=false;clearAudio();$('overlay').hidden=false;$('overlay-title').textContent='起動できませんでした';$('overlay-text').textContent='ページを再読み込みして、もう一度お試しください。';$('play').textContent='再読み込み';$('play').disabled=false;$('play').onclick=()=>location.reload();status('読み込みエラー');}
function tick(now){
  requestAnimationFrame(tick);if(!running){lastTime=now;return;}
  const elapsed=Math.min(50,Math.max(0,now-lastTime));lastTime=now;accumulator+=elapsed*host.status.coreFps/1000;
  try{let n=0;while(accumulator>=1&&n<4){host.setInput({ports:[input()]});host.stepFrames(1);bridge.service();audioFrame();accumulator--;n++;}if(n)draw();if(toastUntil&&now>toastUntil){status('プレイ中');toastUntil=0;}}
  catch(error){fail(error);}
}
function pause(){if(!running)return;running=false;clearInput();clearAudio();audio?.suspend();$('overlay').hidden=false;$('overlay-title').textContent='ひと休み';$('overlay-text').textContent='続きから再開できます。';$('play').textContent='再開する ▶';$('loading-note').textContent='';$('pause').disabled=true;status('一時停止中');}
async function ensureAudio(){audio??=new AudioContext({latencyHint:'interactive',sampleRate:48000});if(!gain){gain=audio.createGain();gain.gain.value=.7;gain.connect(audio.destination);}await audio.resume();return audio;}
const timingPanel=new TimingPanel({initialFrames:timingFrames,getAudio:ensureAudio,pauseGame:pause,onClose:()=>{if(!running)audio?.suspend();},onApply:frames=>{
  timingFrames=frames;bridge?.setTimingFrames(frames);timingPanel.updateButton();
  try{localStorage.setItem(TIMING_STORAGE_KEY,JSON.stringify({frames}));status('タイミング設定を保存しました',4);}catch{status('今回は適用しましたが、設定を保存できませんでした。',8);}
}});
async function start(){
  if(loading)return;loading=true;$('play').disabled=true;
  try{
    await ensureAudio();
    if(!ready){
      $('play').textContent='読み込み中…';status('準備中');
      const bytes=async url=>{const res=await fetch(url);if(!res.ok)throw Error('Cannot load '+url);return new Uint8Array(await res.arrayBuffer());};
      const [wasm,game,shim]=await Promise.all([bytes('./vendor/fceumm/fceumm_libretro.wasm'),bytes('./game.fds'),bytes('./dotmd-bridge.bin')]);
      await host.loadCore({factory,wasmBinary:wasm});
      await host.loadMedia({platform:'nes',bytes:game,name:'dotmd.fds',systemFiles:{'disksys.rom':shim}});
      let save=null;try{const s=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');if(Array.isArray(s)&&s.length===43&&s.every(x=>Number.isInteger(x)&&x>=0&&x<=255))save=Uint8Array.from(s);}catch{}
      bridge=new DiskBridge(host,game,{save,timingFrames,onSave:data=>{try{localStorage.setItem(SAVE_KEY,JSON.stringify([...data]));status('ハイスコアを保存しました',4);}catch{status('保存できませんでした。ブラウザの保存設定をご確認ください。',10);}}});
      ready=true;
      if(new URLSearchParams(location.search).has('debug'))window.dotmdDebug={host,bridge,pause,draw,timingPanel,get audio(){return audio;},get gain(){return gain;}};
    }
    running=true;clearInput();accumulator=0;lastTime=performance.now();nextAudio=audio.currentTime+AUDIO_LEAD_SECONDS;
    $('overlay').hidden=true;$('pause').disabled=false;status('プレイ中');canvas.focus();
  }catch(error){fail(error);}finally{loading=false;$('play').disabled=false;}
}
$('play').addEventListener('click',start);$('pause').addEventListener('click',pause);
$('sound').addEventListener('click',()=>{muted=!muted;clearAudio();$('sound').textContent=muted?'音 OFF':'音 ON';$('sound').setAttribute('aria-pressed',String(muted));canvas.focus();});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('screen').requestFullscreen();}catch{status('このブラウザでは全画面表示を利用できません。',5);}});
document.addEventListener('keydown',e=>{if($('timing-dialog').open)return;if(e.code==='Escape'){pause();return;}if(!running||e.ctrlKey||e.metaKey||e.altKey||!keymap[e.code])return;e.preventDefault();heldKeys.add(e.code);});
document.addEventListener('keyup',e=>heldKeys.delete(e.code));
window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
for(const b of document.querySelectorAll('[data-pad]')){
  b.addEventListener('pointerdown',e=>{e.preventDefault();if(!running)return;b.setPointerCapture(e.pointerId);touches.set(e.pointerId,b.dataset.pad);b.classList.add('held');});
  const release=e=>{touches.delete(e.pointerId);if(![...touches.values()].includes(b.dataset.pad))b.classList.remove('held');};
  b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);
}
const cover=new Image();cover.onload=()=>{if(!ready){ctx.imageSmoothingEnabled=false;ctx.drawImage(cover,0,0,canvas.width,canvas.height);}};cover.src='./cover.png';
requestAnimationFrame(tick);
