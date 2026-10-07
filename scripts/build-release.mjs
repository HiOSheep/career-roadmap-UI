import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const root=resolve('dist');
const all=await readdir(root,{recursive:true});
const files=all.map(path=>path.replaceAll('\\','/')).filter(path=>
  path==='index.html'||path==='favicon.svg'||
  /^(assets|archives|licenses|album-covers|album-audio)\/.*\.[^/]+$/.test(path)||
  /^fonts\/.*\.(woff2|pdf|txt|json|md)$/.test(path)||
  /^audio\/(atmosphere|motif|pulse)\.ogg$/.test(path)
).filter(path=>!/^assets\/(archive-(cassette|assembly)|cd-jewel-case(-(assembly|shelf))?)\.glb$/.test(path)).sort();
if(!files.some(path=>/^assets\/index-.*\.js$/.test(path)))throw Error('Build the application before generating release metadata.');
const hash=createHash('sha256');let bytes=0;
for(const file of files){const content=await readFile(resolve(root,file));hash.update(file).update(content);bytes+=content.length}
const version=hash.digest('hex').slice(0,16);
await writeFile(resolve(root,'release-build.json'),JSON.stringify({version,bytes,files},null,2));
console.log(`Static release ${version}: ${files.length} files, ${(bytes/1024/1024).toFixed(1)} MiB.`);
