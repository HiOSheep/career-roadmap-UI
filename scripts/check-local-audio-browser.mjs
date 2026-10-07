import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try {
const page=await browser.newPage();
await page.route('**/real-audio-test',r=>r.fulfill({contentType:'text/html',body:'<html><body>Local recordings check</body></html>'}));
await page.goto('http://127.0.0.1:5199/real-audio-test');
const result=await page.evaluate(async()=>{
const config=await (await fetch('/content/album-audio.json')).json();
const paths=Object.values(config.albums).flat().filter(Boolean);
const decoded=[];const context=new AudioContext();
for(const path of paths){const response=await fetch('/'+path);if(!response.ok)throw Error(path+': '+response.status);const buffer=await context.decodeAudioData(await response.arrayBuffer());if(buffer.duration<10)throw Error('Invalid recording '+path);decoded.push({path,duration:buffer.duration,channels:buffer.numberOfChannels});}
await context.close();
const NativeAudio=window.Audio,voices=[];
window.Audio=function(src){const audio=new NativeAudio(src);voices.push(audio);return audio;};
const {AlbumPlayer}=await import('/src/album-player.ts');const player=new AlbumPlayer();const wait=ms=>new Promise(r=>setTimeout(r,ms));
const playing=async()=>{for(let i=0;i<200;i++){if(player.getStats().status==='playing')return;await wait(25);}throw Error(JSON.stringify(player.getStats()));};
player.select(0);player.configure(true,.6);document.dispatchEvent(new PointerEvent('pointerdown'));await playing();await wait(1300);
const outgoing=voices.at(-1);const firstTime=outgoing.currentTime;
player.select(1);await playing();await wait(450);const overlap=voices.filter(a=>!a.paused).map(a=>a.volume);await wait(900);
const settled=player.getStats();player.toggle();await wait(1300);const paused=player.getStats();player.toggle();await playing();await wait(1300);const resumed=player.getStats();
const months=[];for(let month=0;month<12;month++){player.select(month);await playing();await wait(100);months.push(player.getStats());}
await wait(1300);const final=player.getStats();player.dispose();window.Audio=NativeAudio;return{decoded,firstTime,overlap,settled,paused,resumed,months,final};
});
assert.equal(result.decoded.length,76);assert.ok(result.firstTime>0);assert.equal(result.overlap.length,2);assert.ok(result.overlap.every(v=>v>0&&v<.6));assert.equal(result.settled.activeVoices,1);assert.equal(result.paused.status,'paused');assert.equal(result.resumed.status,'playing');assert.equal(result.months.length,12);assert.equal(result.final.activeVoices,1);
await writeFile(process.env.AUDIO_REVIEW_OUTPUT,JSON.stringify(result,null,2));console.log('PASS: 76 recordings decode; all 12 months play; pause/resume and real 1.2-second crossfade verified.');
}finally{await browser.close();}
