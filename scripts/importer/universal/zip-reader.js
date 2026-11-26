/** Bounded ZIP reader. Only stored/DEFLATE entries, no filesystem extraction. */
const MAX_ARCHIVE=56*1024*1024, MAX_TOTAL=50*1024*1024, MAX_ENTRY=8*1024*1024;
const utf8=new TextDecoder("utf-8",{fatal:true});
const crcTable=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function invalid(message){throw Error("ZIP Jarvis: "+message);}
function pathOK(name){
  const parts=name.replace(/\/$/,"").split("/");
  return name.length>0&&name.length<=240&&!/[\\:\x00-\x1f\x7f]/.test(name)&&parts.every(p=>p&&p!=="."&&p!==".."&&!/[. ]$/.test(p));
}
async function inflate(bytes,expected){
  if(typeof globalThis.DecompressionStream!=="function")invalid("Descompressão não disponível neste navegador.");
  let stream;try{stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));}catch{invalid("DEFLATE indisponível; compacte no modo armazenado (sem compressão).");}
  const reader=stream.getReader(),out=new Uint8Array(expected);let pos=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;if(pos+value.length>expected){await reader.cancel();invalid("Tamanho descomprimido excede o declarado.");}out.set(value,pos);pos+=value.length;}}finally{reader.releaseLock();}
  if(pos!==expected)invalid("Tamanho descomprimido divergente.");return out;
}
export async function readJarvisZip(file){
  if(!file||!Number.isSafeInteger(file.size)||file.size<22||file.size>MAX_ARCHIVE)invalid("Arquivo inválido ou acima de 56 MB.");
  const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.length!==file.size)invalid("Tamanho do arquivo divergente.");
  const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u16=o=>d.getUint16(o,true),u32=o=>d.getUint32(o,true);
  const check=(o,n)=>{if(o<0||n<0||o+n>bytes.length)invalid("Estrutura truncada.");};
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(u32(i)===0x06054b50&&i+22+u16(i+20)===bytes.length){end=i;break;}}
  if(end<0)invalid("Diretório central não encontrado.");
  const count=u16(end+10),size=u32(end+12),start=u32(end+16);
  if(u16(end+4)||u16(end+6)||u16(end+8)!==count||count<1||count>80||start+size!==end)invalid("ZIP multidisco, ZIP64 ou diretório central inválido/excessivo.");
  const entries=[],names=new Set();let pos=start,total=0;
  for(let i=0;i<count;i++){
    check(pos,46);if(u32(pos)!==0x02014b50)invalid("Entrada central inválida.");
    const flags=u16(pos+8),method=u16(pos+10),crc=u32(pos+16),compressed=u32(pos+20),plain=u32(pos+24),nl=u16(pos+28),xl=u16(pos+30),cl=u16(pos+32),offset=u32(pos+42);
    if(flags&~0x080e||![0,8].includes(method)||u16(pos+34))invalid("Entrada criptografada, multidisco ou método não suportado.");
    if(plain>MAX_ENTRY||compressed>MAX_ARCHIVE||offset>=start)invalid("Entrada excede limites.");
    const next=pos+46+nl+xl+cl;if(next>end)invalid("Nome ou metadados truncados.");
    const name=utf8.decode(bytes.subarray(pos+46,pos+46+nl)),key=name.toLowerCase();
    if(!pathOK(name)||names.has(key))invalid("Caminho inválido ou duplicado: "+name);names.add(key);
    const directory=name.endsWith("/");
    const unixType=(u32(pos+38)>>>16)&0xf000;
    if(unixType&&unixType!==0x8000&&unixType!==0x4000)invalid("Links e arquivos especiais não permitidos.");
    if(directory&&plain)invalid("Diretório com conteúdo.");
    total+=plain;if(total>MAX_TOTAL)invalid("Conteúdo descomprimido ultrapassa 50 MB.");
    check(offset,30);if(u32(offset)!==0x04034b50||u16(offset+6)!==flags||u16(offset+8)!==method)invalid("Cabeçalho local divergente.");
    const lnl=u16(offset+26),lxl=u16(offset+28),data=offset+30+lnl+lxl;
    if(data+compressed>start||lnl!==nl||utf8.decode(bytes.subarray(offset+30,offset+30+lnl))!==name)invalid("Entrada local truncada ou divergente.");
    if(!(flags&8)&&(u32(offset+14)!==crc||u32(offset+18)!==compressed||u32(offset+22)!==plain))invalid("Metadados locais divergentes.");
    if(method===0&&compressed!==plain)invalid("Entrada armazenada com tamanho incorreto.");
    let finish=data+compressed;
    if(flags&8){check(finish,12);if(u32(finish)===0x08074b50)finish+=4;check(finish,12);if(u32(finish)!==crc||u32(finish+4)!==compressed||u32(finish+8)!==plain)invalid("Descritor de dados divergente.");finish+=12;}
    if(finish>start)invalid("Entrada invade diretório central.");
    entries.push({name,directory,method,crc,plain,compressed,offset,data,finish});pos=next;
  }
  if(pos!==end)invalid("Diretório central inconsistente.");
  const sorted=[...entries].sort((a,b)=>a.offset-b.offset);
  if(sorted[0].offset!==0||sorted.some((e,i)=>i>0&&e.offset!==sorted[i-1].finish)||sorted.at(-1).finish!==start)invalid("Entradas sobrepostas ou dados não declarados.");
  const result=new Map();
  for(const e of entries){
    const raw=bytes.subarray(e.data,e.data+e.compressed);
    const decoded=e.method===0?raw.slice():await inflate(raw,e.plain);
    if(crc32(decoded)!==e.crc)invalid("CRC inválido: "+e.name);
    if(!e.directory)result.set(e.name,decoded);
  }
  return result;
}
