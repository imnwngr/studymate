'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'docs/images');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pictures={'popup.webp':[400,640],'popup-light.webp':[400,640],'style-editorial.webp':[400,640],'style-cognify.webp':[400,640],'style-insightos.webp':[400,640],'settings.webp':[1100,850],'inspector.webp':[1100,1080]};
function dimensions(b){const type=b.toString('ascii',12,16);if(type==='VP8 ')return [b.readUInt16LE(26)&16383,b.readUInt16LE(28)&16383];if(type==='VP8X')return [1+b.readUIntLE(24,3),1+b.readUIntLE(27,3)];throw Error('Unsupported capture encoding '+type);}
test('documentation SVGs are bounded self-contained artwork with accessible descriptions',()=>{
 for(const f of ['hero.svg','workflow.svg','workflow-mobile.svg']){const s=read('docs/images/'+f);assert.match(s,/<svg[^>]+viewBox=/);assert.match(s,/<title[^>]*>[^<]+<\/title>/);assert.match(s,/<desc[^>]*>[^<]+<\/desc>/);assert.doesNotMatch(s,/<(?:script|foreignObject|image|iframe|animate)\b|<!DOCTYPE|<!ENTITY|\bon\w+\s*=|(?:href|src)\s*=|@import|@font-face/i);assert.ok(Buffer.byteLength(s)<20000);}
 assert.match(read('docs/images/workflow.svg'),/SEPARATE READ-ONLY PATH/);assert.match(read('docs/images/workflow.svg'),/not guaranteed grading/);
});
test('captures are small WebP images without EXIF or XMP metadata',()=>{
 let total=0;for(const [f,size] of Object.entries(pictures)){const b=fs.readFileSync(path.join(dir,f));assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WEBP');assert.deepEqual(dimensions(b),size);for(let i=12;i+8<=b.length;){const chunk=b.toString('ascii',i,i+4);assert.ok(!['EXIF','XMP '].includes(chunk),f+' contains metadata');const n=b.readUInt32LE(i+4);i+=8+n+(n%2);}assert.ok(b.length<160000,f);total+=b.length;}assert.ok(total<450000);
});
test('README images, navigation and relative documentation links resolve in both languages',()=>{
 const sets=[];for(const f of ['README.md','README.vi.md']){const s=read(f);assert.match(s,/^<p[^>]*><img src="docs\/images\/hero.svg"/);const ids=[...s.matchAll(/<a id="([^"]+)"/g)].map(x=>x[1]);const assets=[];for(const m of s.matchAll(/(?:href|src|srcset)="([^"]+)"|\]\(([^)]+)\)/g)){const u=m[1]||m[2];if(u.startsWith('#'))assert.ok(ids.includes(u.slice(1)),f+u);else if(!/^https?:/.test(u))assert.ok(fs.existsSync(path.join(root,u)),f+u);if(u.startsWith('docs/images/'))assets.push(u);}for(const m of s.matchAll(/<img\b[^>]*>/g))assert.match(m[0],/alt="[^"]+"/);assert.equal((s.match(/^```/gm)||[]).length%2,0);assert.equal((s.match(/<details>/g)||[]).length,3);assert.doesNotMatch(s,/C:\\Users|spark-study-assistant/);sets.push([...new Set(assets)].sort());}assert.deepEqual(sets[0],sets[1]);
});
test('visual asset provenance distinguishes actual fixture captures from illustrations and live testing',()=>{
 const s=read('docs/images/README.md');assert.match(s,/not screenshots/);assert.match(s,/not installed-extension or authenticated Spark screenshots/);assert.match(s,/mocked Chrome APIs/);assert.match(s,/no recordings/);for(const f of ['README.md','README.vi.md']){const s=read(f);for(const name of ['Ventrix','Chainsaw Editorial','Cognify','InsightOS','Checkbox','Linking Lines'])assert.ok(s.includes(name));}
});
test('documentation keeps manifest version 0.8.0 and does not claim final linking verification',()=>{
 assert.equal(JSON.parse(read('manifest.json')).version,'0.8.0');assert.match(read('README.md'),/exact final graph unverified/);assert.match(read('README.md'),/Checkbox popup validation can reject/);
});
