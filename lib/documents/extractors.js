import zlib from 'node:zlib';

const LOCAL = 0x04034b50;
const CEN = 0x02014b50;
const EOCD = 0x06054b50;

function xmlDecode(value='') {
  return value.replace(/<w:tab\/?\s*>/g,'\t').replace(/<w:br\/?\s*>/g,'\n')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));
}

function stripXml(xml='') {
  return xmlDecode(xml.replace(/<\/w:p>/g,'\n').replace(/<\/a:p>/g,'\n').replace(/<\/row>/g,'\n').replace(/<\/c>/g,'\t').replace(/<[^>]+>/g,''))
    .replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}

function findEocd(buffer) {
  for (let i=buffer.length-22;i>=Math.max(0,buffer.length-131072);i--) if (buffer.readUInt32LE(i)===EOCD) return i;
  return -1;
}

export function unzipSelected(buffer, accept) {
  const eocd=findEocd(buffer); if(eocd<0) throw new Error('ZIP central directory not found');
  const count=buffer.readUInt16LE(eocd+10); const centralOffset=buffer.readUInt32LE(eocd+16);
  let cursor=centralOffset; const out=new Map();
  for(let i=0;i<count;i++){
    if(buffer.readUInt32LE(cursor)!==CEN) throw new Error('Invalid ZIP central directory');
    const method=buffer.readUInt16LE(cursor+10); const compressedSize=buffer.readUInt32LE(cursor+20); const expandedSize=buffer.readUInt32LE(cursor+24);
    const nameLen=buffer.readUInt16LE(cursor+28), extraLen=buffer.readUInt16LE(cursor+30), commentLen=buffer.readUInt16LE(cursor+32); const localOffset=buffer.readUInt32LE(cursor+42);
    const name=buffer.subarray(cursor+46,cursor+46+nameLen).toString('utf8'); cursor+=46+nameLen+extraLen+commentLen;
    if(!accept(name)) continue;
    if(buffer.readUInt32LE(localOffset)!==LOCAL) throw new Error(`Invalid local ZIP header: ${name}`);
    const localNameLen=buffer.readUInt16LE(localOffset+26), localExtraLen=buffer.readUInt16LE(localOffset+28); const start=localOffset+30+localNameLen+localExtraLen;
    const compressed=buffer.subarray(start,start+compressedSize); let data;
    if(method===0) data=Buffer.from(compressed); else if(method===8) data=zlib.inflateRawSync(compressed); else continue;
    if(expandedSize && data.length!==expandedSize) throw new Error(`ZIP size mismatch: ${name}`);
    out.set(name,data);
  }
  return out;
}

export function extractDocx(buffer) {
  const entries=unzipSelected(buffer,(n)=>n==='word/document.xml'||/^word\/(header|footer)\d+\.xml$/.test(n)||n==='word/comments.xml');
  const ordered=[...entries.entries()].sort(([a],[b])=>a.localeCompare(b));
  const text=ordered.map(([name,data])=>`\n[${name}]\n${stripXml(data.toString('utf8'))}`).join('\n');
  return { text:text.trim(), parser:'docx-native', metrics:{parts:entries.size} };
}

export function extractPptx(buffer) {
  const entries=unzipSelected(buffer,(n)=>/^ppt\/slides\/slide\d+\.xml$/.test(n)||/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
  const slides=[...entries.entries()].filter(([n])=>n.includes('/slides/')).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}));
  const text=slides.map(([name,data],i)=>`\n[Slide ${i+1}]\n${stripXml(data.toString('utf8'))}`).join('\n');
  return { text:text.trim(), parser:'pptx-native', metrics:{slides:slides.length} };
}

export function extractXlsx(buffer) {
  const entries=unzipSelected(buffer,(n)=>n==='xl/sharedStrings.xml'||/^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const sharedXml=entries.get('xl/sharedStrings.xml')?.toString('utf8')||'';
  const shared=[...sharedXml.matchAll(/<si[\s\S]*?<\/si>/g)].map((m)=>stripXml(m[0]));
  const sheets=[...entries.entries()].filter(([n])=>n.includes('/worksheets/')).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}));
  const parts=sheets.map(([name,data],idx)=>{
    let xml=data.toString('utf8');
    xml=xml.replace(/<c([^>]*)t="s"([^>]*)>[\s\S]*?<v>(\d+)<\/v>[\s\S]*?<\/c>/g,(_,a,b,n)=>`<c>${shared[Number(n)]||''}</c>`);
    return `\n[Sheet ${idx+1}]\n${stripXml(xml)}`;
  });
  return { text:parts.join('\n').trim(), parser:'xlsx-native', metrics:{sheets:sheets.length,sharedStrings:shared.length} };
}

function decodePdfLiteral(value='') {
  return value.replace(/\\([nrtbf()\\])/g,(_,c)=>({n:'\n',r:'\n',t:'\t',b:'',f:'', '(': '(', ')':')','\\':'\\'}[c]??c))
    .replace(/\\([0-7]{1,3})/g,(_,n)=>String.fromCharCode(parseInt(n,8)));
}
function collectPdfOperators(source) {
  const values=[];
  for(const m of source.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) values.push(decodePdfLiteral(m[1]));
  for(const m of source.matchAll(/\[((?:.|\n)*?)\]\s*TJ/g)) for(const s of m[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g)) values.push(decodePdfLiteral(s[1]));
  return values;
}
export function extractPdf(buffer) {
  const source=buffer.toString('latin1'); const values=collectPdfOperators(source); let inflated=0;
  for(const m of source.matchAll(/stream\r?\n/g)){
    const start=m.index+m[0].length; const end=source.indexOf('endstream',start); if(end<0||end-start>8*1024*1024) continue;
    const head=source.slice(Math.max(0,m.index-400),m.index); if(!/FlateDecode/.test(head)) continue;
    let raw=buffer.subarray(start,end); while(raw.length&&[10,13].includes(raw[raw.length-1])) raw=raw.subarray(0,-1);
    try { const text=zlib.inflateSync(raw).toString('latin1'); values.push(...collectPdfOperators(text)); inflated++; } catch {}
  }
  const text=values.join(' ').replace(/\s+/g,' ').trim();
  const pages=(source.match(/\/Type\s*\/Page\b/g)||[]).length;
  return { text, parser:'pdf-native-v2', metrics:{pages,streamsInflated:inflated} };
}
