import fs from 'node:fs';
import {getDocument} from './pdf-tools/package/legacy/build/pdf.mjs';
const doc=await getDocument({data:new Uint8Array(fs.readFileSync('./omg-uml-2.5.1.pdf')),useSystemFonts:true}).promise;
let out='';
for(let n=590;n<=640;n++){const p=await doc.getPage(n);const c=await p.getTextContent();out+='\nPDF PAGE '+n+'\n'+c.items.map(i=>i.str).join(' ')+'\n';}
fs.writeFileSync('./omg-interactions-extract.txt',out);
console.log('pages',doc.numPages,'extracted',out.length);
