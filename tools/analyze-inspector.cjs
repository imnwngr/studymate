#!/usr/bin/env node
'use strict';
const {run}=require('./inspector-intelligence.cjs');
const path=require('node:path');
const args=process.argv.slice(2),imports=[];
let root;
for(let i=0;i<args.length;i++) {
  if(args[i]==='--import' && args[i+1]) imports.push(args[++i]);
  else if(args[i]==='--root' && args[i+1]) root=path.resolve(args[++i]);
  else {console.error('Usage: node tools/analyze-inspector.cjs [--import "C:\\path\\export.json"] [--root PROJECT]');process.exit(2);}
}
try {
  const report=run({root,imports});
  console.log(`Inspector analysis: ${report.filesScanned} JSON file(s), ${report.uniqueValidReports} unique report(s), ${report.duplicateCount} duplicate(s), ${report.errors.length} error(s).`);
  for(const r of report.reports) console.log(`${r.sources.join(', ')} -> inspector-data/reports/${r.report}, inspector-data/prompts/${r.prompt}`);
  for(const e of report.errors) console.error(`${e.file||e.files?.join(', ')||'Unknown'}: ${e.error}`);
  if(report.errors.length) process.exitCode=1;
} catch(error){console.error(`Inspector analysis failed: ${error.message}`);process.exitCode=1;}
