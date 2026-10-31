'use strict';
const groups=[['ba','ck'],['ba','nd','s']];
const xml='<assessmentItem identifier="Identify:Mark:Marking">'+
  '<responseDeclaration identifier="R" baseType="identifier" cardinality="ordered"><correctResponse><value>GT1 G0 G3</value></correctResponse></responseDeclaration>'+
  '<itemBody><gapMatchInteraction responseIdentifier="R"><gapText identifier="GT1" style="#F9C52A"/>'+
  groups.map((group,i)=>'<div id="contentblock"><p>'+group.map((label,j)=>'<gap identifier="G'+(i?j+2:j)+'" label="'+label+'"/>').join(' ')+'</p></div>').join('')+
  '</gapMatchInteraction></itemBody></assessmentItem>';
module.exports='ajaxData = '+JSON.stringify({'synthetic.xml':xml})+';';
