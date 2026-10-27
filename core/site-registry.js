(function(root){
  'use strict';
  if(root.SparkSites)return;
  const sites=Object.freeze([Object.freeze({
    id:'ngl-spark',name:'NGL / Spark',adapterId:'ngl',
    hosts:[{hostname:'learn.eltngl.com',subdomains:false}],
    frameHosts:[{hostname:'avallain.net',subdomains:true}],
    detection:['.content-wrap','.interaction','.learningObject__title'],
    capabilities:['qti','text','dropdown','choice','multi','checkbox','order','textCorrection','gapWordPool','linkingLines','verified-submit']
  })]);
  function hostname(url){try{return new URL(url).hostname.toLowerCase();}catch{return '';}}
  function matches(host,rule){return host===rule.hostname||(rule.subdomains&&host.endsWith('.'+rule.hostname));}
  function recognize(url){
    if(!/^https?:/i.test(url||''))return null;
    const host=hostname(url);
    return sites.find(site=>site.hosts.some(rule=>matches(host,rule)))||null;
  }
  function frameSite(url){
    if(!/^https?:/i.test(url||''))return null;
    const host=hostname(url);
    return recognize(url)||sites.find(site=>site.frameHosts.some(rule=>matches(host,rule)))||null;
  }
  function access(url){
    try{
      const parsed=new URL(url);
      if(!['http:','https:'].includes(parsed.protocol))return false;
      return parsed.hostname!=='chromewebstore.google.com'&&
        !(parsed.hostname==='chrome.google.com'&&parsed.pathname.startsWith('/webstore'));
    }catch{return false;}
  }
  root.SparkSites=Object.freeze({sites,recognize,frameSite,access});
  if(typeof module!=='undefined')module.exports=root.SparkSites;
})(globalThis);
