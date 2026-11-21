import { copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await copyFile('dist/index.html','dist/play.html');
const files=(await readdir('dist',{recursive:true,withFileTypes:true}))
  .filter(entry=>entry.isFile() && entry.name!=='sw.js')
  .map(entry=>(entry.parentPath+'/'+entry.name).replace(/^dist\//,'')).sort();
const digest=createHash('sha256');
for(const file of files)digest.update(await readFile('dist/'+file));
const version='silk-'+digest.digest('hex').slice(0,16);
await writeFile('dist/sw.js',`
const version=${JSON.stringify(version)};
const files=${JSON.stringify(files)};
self.addEventListener('install',event=>event.waitUntil(
  caches.open(version).then(cache=>cache.addAll(files)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(names=>Promise.all(names.filter(n=>n.startsWith('silk-')&&n!==version).map(n=>caches.delete(n)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url), base=new URL(self.registration.scope);
  if(url.origin!==base.origin || !url.pathname.startsWith(base.pathname))return;
  const path=url.pathname.slice(base.pathname.length);
  const navigation=event.request.mode==='navigate';
  const page=path==='play'||path==='play/'?'play.html':path||'index.html';
  if(navigation && files.includes(page)){
    event.respondWith(fetch(event.request).catch(()=>caches.open(version).then(cache=>cache.match(page))));
    return;
  }
  if(!files.includes(path))return;
  event.respondWith(caches.open(version).then(async cache=>(await cache.match(path||'index.html'))||fetch(event.request)));
});
`);
