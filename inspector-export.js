/* User-authorized Inspector JSON export. This script runs only on the Inspector extension page. */
(() => {
  'use strict';
  const DB_NAME = 'spark-inspector-export';
  const STORE = 'settings';
  const KEY = 'exports-directory';
  let selected = null;
  let storageWarning = null;
  let counter = 0;

  const safeName = (value) => String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48);
  function filename(now = new Date(), nonce = globalThis.crypto?.randomUUID?.()) {
    // UTC time is sortable; nonce prevents collision across Inspector tabs/restarts.
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\./g, '-');
    return `spark-inspector-${stamp}-${safeName(nonce || `${now.getTime()}-${++counter}`)}.json`;
  }
  function serialize(data) {
    if (!data || typeof data !== 'object') throw Error('Inspector export must be a JSON object.');
    const json = JSON.stringify(data, null, 2);
    if (!json || JSON.parse(json).tool !== 'Spark Exercise Inspector') throw Error('Invalid Inspector export data.');
    return json + '\n';
  }
  function db() {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) return reject(Error('IndexedDB unavailable'));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || Error('IndexedDB open failed'));
    });
  }
  async function stored(value, writing = false) {
    const database = await db();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE, writing ? 'readwrite' : 'readonly');
        const request = writing ? transaction.objectStore(STORE).put(value, KEY) : transaction.objectStore(STORE).get(KEY);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || Error('IndexedDB access failed'));
        transaction.onerror = () => reject(transaction.error || Error('IndexedDB transaction failed'));
      });
    } finally {database.close();}
  }
  const initialized = stored().then(handle => {if (handle?.kind === 'directory') selected = handle;})
    .catch(error => {storageWarning = String(error?.message || error);});

  function isExportsDirectory(handle) {
    return handle?.kind === 'directory' && handle.name === 'exports';
  }
  async function chooseDirectory() {
    // showDirectoryPicker must be called directly from a user's click.
    if (typeof globalThis.showDirectoryPicker !== 'function') throw Error('Directory picker is unavailable in this browser. Use Save As and import the file.');
    const handle = await globalThis.showDirectoryPicker({id:'spark-inspector-exports',mode:'readwrite'});
    if (!isExportsDirectory(handle)) throw Error('Choose this project\'s inspector-data/exports folder (folder name: exports).');
    selected = handle;
    try {await stored(handle, true);storageWarning = null;}
    catch (error) {storageWarning = `Folder selected for this tab, but could not persist it: ${error.message}`;}
    return {name:handle.name,storageWarning};
  }
  function currentDirectory() {return selected?.name || null;}
  function prepareDestination() {
    if (selected) return (async () => {
      // Ask while the Export JSON click is still active; Chrome may require a
      // fresh gesture after the Inspector tab has been closed and reopened.
      const mode={mode:'readwrite'};
      let permission=typeof selected.queryPermission==='function' ? await selected.queryPermission(mode) : 'granted';
      if(permission!=='granted' && typeof selected.requestPermission==='function') permission=await selected.requestPermission(mode);
      if(permission!=='granted') throw Error('Export folder write permission was not granted. Choose exports again or use Save As.');
      return {kind:'directory',handle:selected};
    })();
    if (typeof globalThis.showSaveFilePicker === 'function') {
      // Called without a prior await to retain transient user activation.
      return globalThis.showSaveFilePicker({suggestedName:filename(),types:[{description:'Inspector JSON',accept:{'application/json':['.json']}}]})
        .then(handle=>({kind:'save-as',handle}));
    }
    // Explicit Export JSON click uses the existing download behavior on older browsers.
    return Promise.resolve({kind:'browser-download'});
  }
  async function writeFile(handle, payload) {
    const writable = await handle.createWritable();
    try {await writable.write(payload);await writable.close();}
    catch (error) {try {await writable.abort();} catch {} throw error;}
  }
  async function writeToDirectory(handle, payload, name) {
    if (!isExportsDirectory(handle)) throw Error('Selected folder is no longer the exports directory. Reselect it.');
    const mode = {mode:'readwrite'};
    let permission = typeof handle.queryPermission === 'function' ? await handle.queryPermission(mode) : 'granted';
    if (permission !== 'granted' && typeof handle.requestPermission === 'function') permission = await handle.requestPermission(mode);
    if (permission !== 'granted') throw Error('Export folder write permission was not granted. Choose exports again or use Save As.');
    // getFileHandle(create:true) overwrites on write. Check existence first, and never
    // reuse an existing name. Collision suffixes also handle deterministic test clocks.
    let candidate = name;
    for (let index=0; index<1000; index++) {
      try {
        await handle.getFileHandle(candidate);
        candidate = name.replace(/\.json$/, `-${String(index+1).padStart(3,'0')}.json`);
      } catch (error) {
        if (error?.name !== 'NotFoundError') throw error;
        const file = await handle.getFileHandle(candidate,{create:true});
        await writeFile(file,payload);
        return candidate;
      }
    }
    throw Error('Cannot allocate a unique export filename.');
  }
  function download(payload, name) {
    const url = URL.createObjectURL(new Blob([payload],{type:'application/json'}));
    const a = document.createElement('a');a.href=url;a.download=name;
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function writeJSON(destination, data) {
    const payload = serialize(data);
    if (destination?.kind === 'directory') {
      const name = await writeToDirectory(destination.handle,payload,filename());
      return {kind:'directory',name};
    }
    if (destination?.kind === 'save-as') {
      await writeFile(destination.handle,payload);
      return {kind:'save-as',name:destination.handle.name};
    }
    const name = filename();
    download(payload,name);
    return {kind:'browser-download',name};
  }
  const api = {initialized,filename,serialize,chooseDirectory,currentDirectory,prepareDestination,writeJSON,
    getStorageWarning:()=>storageWarning};
  globalThis.SparkInspectorExport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
