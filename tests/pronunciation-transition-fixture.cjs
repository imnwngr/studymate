'use strict';
const groups=[['a','tch'],['cr','b'],['pl','c','d'],['e','lf'],['f','nts']];
let index=0;
const xml='<assessmentItem identifier="Identify:Mark:Marking"><responseDeclaration identifier="R" baseType="identifier" cardinality="ordered"><correctResponse><value>GT1 G1 G2 G4 G8 G10</value></correctResponse></responseDeclaration><itemBody><gapMatchInteraction responseIdentifier="R"><gapText identifier="GT1" style="#F9C52A"/>'+groups.map(group=>'<p>'+group.map(label=>'<gap identifier="G'+index+++'" label="'+label+'"/>').join(' ')+'</p>').join('')+'</gapMatchInteraction></itemBody></assessmentItem>';
module.exports='window.transitionData='+JSON.stringify({'synthetic.xml':xml})+';';
