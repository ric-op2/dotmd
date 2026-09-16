// DOTMD v0.60-only high-level disk service; no original BIOS is used.
import {TIMING_PATCH,TIMING_OFFSET,TIMING_LIMIT} from './timing-patch.mjs';
export function parseDisk(bytes) {
  if (String.fromCharCode(...bytes.slice(0,4)) !== 'FDS\x1a' || bytes[4] !== 1) throw Error('対応していないゲームデータです。');
  const files=[];
  for(let n=0,at=16+58;n<bytes[16+57];n++) {
    if(bytes[at]!==3||bytes[at+16]!==4)throw Error('ゲームデータが破損しています。');
    const size=bytes[at+13]|bytes[at+14]<<8;
    files.push({id:bytes[at+2],address:bytes[at+11]|bytes[at+12]<<8,type:bytes[at+15],data:bytes.slice(at+17,at+17+size)});
    at+=17+size;
  }
  return files;
}
export class DiskBridge {
  constructor(host,disk,{save=null,onSave=()=>{},timingFrames=0}={}) {
    this.host=host;this.files=parseDisk(disk);this.onSave=onSave;this.calls=[];
    const program=this.files.find(f=>f.id===0).data;
    for(const [at,before,after] of TIMING_PATCH){if(program[at]!==before)throw Error('タイミング調整に対応していないゲームの版です。');program[at]=after;}
    this.timingFrames=0;this.setTimingFrames(timingFrames);
    const record=this.files.find(f=>f.id===12);
    if(save&&save.length===record.data.length)record.data.set(save);
  }
  address(a) {
    const m=this.host.mod;
    if(a<0x2000)return m._retro_get_memory_data(2)+(a&2047);
    if(a>=0x6000&&a<0xe000)return m._retro_get_memory_data(0x107)+a-0x6000;
    throw Error('ブラウザ版で未対応のメモリー参照です。');
  }
  byte(a){return this.host.mod.HEAPU8[this.address(a)];}
  word(a){return this.byte(a)|(this.byte(a+1)<<8);}
  set(a,v){this.host.mod.HEAPU8[this.address(a)]=v;}
  setTimingFrames(value){
    this.timingFrames=Math.max(-TIMING_LIMIT,Math.min(TIMING_LIMIT,Math.round(Number(value)||0)));
    this.set(TIMING_OFFSET,this.timingFrames&255);this.set(TIMING_OFFSET+1,this.timingFrames<0?255:0);
  }
  load(file) {
    if(!file)throw Error('曲データが見つかりません。');
    if(file.type===1)this.host.writeMemory('nes_chr',file.address,file.data);
    else {
      if(file.address<0x6000||file.address+file.data.length>0xe000)throw Error('未対応の読込み先です。');
      this.host.mod.HEAPU8.set(file.data,this.address(file.address));
    }
  }
  service() {
    // Startup clears ZP. Reapply the user's setting before the next game frame.
    this.setTimingFrames(this.timingFrames);
    const cmd=this.byte(0x7f0);if(!cmd)return;
    let count=0,error=0;const ids=[];
    if(cmd===1){this.host.mod.HEAPU8.set(this.files.find(f=>f.id===2).data,this.address(0x6000));ids.push(2);count=1;}
    else if(cmd===4){for(const id of [0,1]){this.load(this.files.find(f=>f.id===id));ids.push(id);}count=2;}
    else if(cmd===2){
      const list=this.word(this.word(0x7f1)+3);
      for(let i=0;i<32;i++){
        const id=this.byte(list+i);if(id===255)break;
        this.load(this.files.find(f=>f.id===id));ids.push(id);count++;
        if(i===31)throw Error('読込みリストが不正です。');
      }
    }else if(cmd===3){
      const header=this.word(this.word(0x7f1)+3),id=this.byte(header);
      const file=this.files.find(f=>f.id===id),size=this.word(header+11),source=this.word(header+14);
      if(id!==12||!file||size!==file.data.length)throw Error('保存データが不正です。');
      for(let i=0;i<size;i++)file.data[i]=this.byte(source+i);
      this.onSave(file.data.slice());ids.push(id);count=1;
    }else throw Error('未対応のディスク操作です。');
    this.calls.push({cmd,ids});this.set(0x7f4,error);this.set(0x7f5,count);this.set(0x7f0,0);
  }
}
