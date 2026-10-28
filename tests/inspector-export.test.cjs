'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const exporter=require('../inspector-export.js');
const data=()=>({tool:'Spark Exercise Inspector',version:'3.4.0',captures:[{frames:[]}],recordings:[]});
function directory(permission='granted') {
  const files=new Map();
  return {kind:'directory',name:'exports',files,
    async queryPermission(){return permission;},async requestPermission(){return permission;},
    async getFileHandle(name,opts={}) {
      if(files.has(name))return files.get(name);
      if(!opts.create)throw Object.assign(Error('not found'),{name:'NotFoundError'});
      const f={name,async createWritable(){return {async write(text){f.contents=text;},async close(){},async abort(){}};}};
      files.set(name,f);return f;
    }};
}
test('serialization preserves complete JSON structure',()=>{
  const blob=exporter.serialize(data());assert.deepEqual(JSON.parse(blob),data());assert.ok(blob.endsWith('\n'));
});
test('stable timestamped filenames and unique collision suffixes prevent overwrite',async()=>{
  assert.equal(exporter.filename(new Date('2026-10-16T10:20:30.000Z'),'uuid-1'),
    'spark-inspector-20261016T102030-000Z-uuid-1.json');
  const dir=directory();globalThis.showDirectoryPicker=()=>Promise.resolve(dir);
  try {
    await exporter.chooseDirectory();
    const one=await exporter.writeJSON(await exporter.prepareDestination(),data());
    const original=dir.files.get(one.name).contents;
    const two=await exporter.writeJSON(await exporter.prepareDestination(),data());
    assert.notEqual(one.name,two.name);assert.equal(dir.files.get(one.name).contents,original);
    assert.equal(JSON.parse(original).version,'3.4.0');
  } finally {delete globalThis.showDirectoryPicker;}
});
test('directory picker rejects selecting a wrong folder',async()=>{
  globalThis.showDirectoryPicker=()=>Promise.resolve({kind:'directory',name:'Downloads'});
  try {await assert.rejects(exporter.chooseDirectory(),/exports folder/);}
  finally {delete globalThis.showDirectoryPicker;}
});
test('permission failure does not switch to a browser download',async()=>{
  const denied=directory('denied');globalThis.showDirectoryPicker=()=>Promise.resolve(denied);
  try {await exporter.chooseDirectory();await assert.rejects(exporter.prepareDestination(),/permission/);assert.equal(denied.files.size,0);}
  finally {delete globalThis.showDirectoryPicker;}
});
test('Save As fallback is offered on fresh context without a selected directory',async()=>{
  // A fresh copy of the module keeps its own unselected folder state.
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const script=fs.readFileSync(path.join(__dirname,'../inspector-export.js'),'utf8');
  let saved='';const handle={name:'chosen.json',async createWritable(){return {async write(text){saved=text;},async close(){},async abort(){}};}};
  const context={globalThis:null,showSaveFilePicker:()=>Promise.resolve(handle),indexedDB:null,Date,JSON,Promise,Error,URL,Blob,setTimeout};
  context.globalThis=context;
  vm.runInNewContext(script,context);
  const destination=await context.SparkInspectorExport.prepareDestination();
  assert.equal(destination.kind,'save-as');
  const result=await context.SparkInspectorExport.writeJSON(destination,data());
  assert.equal(result.name,'chosen.json');assert.equal(JSON.parse(saved).tool,'Spark Exercise Inspector');
});
