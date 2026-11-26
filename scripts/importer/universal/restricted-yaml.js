/** Restricted data-only YAML reader: two-space indentation, maps, sequences and JSON flow values.
 * Deliberately rejects aliases, tags, merges, directives and multiline scalars. */
const own=(o,k)=>Object.hasOwn(o,k);
const keyOK=k=>/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(k)&&!["__proto__","prototype","constructor"].includes(k);
function fail(line,msg){throw Error("YAML linha "+line+": "+msg);}
function scalar(s,line){
  if(s.startsWith('"')){try{const v=JSON.parse(s);if(typeof v==="string")return v;}catch{}fail(line,"string entre aspas duplas inválida.");}
  if(s.startsWith("'")){if(!/^'(?:[^']|'')*'$/.test(s))fail(line,"string entre aspas simples inválida.");return s.slice(1,-1).replace(/''/g,"'");}
  if(/^[\[{]/.test(s)){try{return JSON.parse(s);}catch{fail(line,"coleções inline devem ser JSON válido.");}}
  if(/^(?:true|false|null)$/.test(s))return JSON.parse(s);
  if(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s)){const n=Number(s);if(!Number.isFinite(n))fail(line,"número não finito.");return n;}
  if(/^[&*!|>%@#\x60]|^<<:|(?:^|\s)#|:\s|[\t]/.test(s))fail(line,"sintaxe não suportada; use aspas ou estrutura indentada.");
  return s;
}
export function parseRestrictedYaml(source){
  const lines=[];
  String(source).split(/\r?\n/).forEach((raw,i)=>{
    const s=raw.trim();if(!s||s.startsWith("#"))return;
    if(s==="---"&&lines.length===0&&i===0)return;
    if(s==="---"||s==="..."||s.startsWith("%")||raw.includes("\t"))fail(i+1,"diretivas, múltiplos documentos e tabs não suportados.");
    const indent=raw.match(/^ */)[0].length;
    if(indent%2||indent>64)fail(i+1,"use dois espaços por nível (máximo 32 níveis).");
    if(/^-\s+[A-Za-z0-9_.-]+\s*:/.test(s)){
      lines.push({indent,s:"-",line:i+1},{indent:indent+2,s:s.slice(1).trimStart(),line:i+1});
    }else lines.push({indent,s,line:i+1});
  });
  if(!lines.length||lines[0].indent!==0||lines.length>20000)throw Error("YAML vazio, excessivo ou sem raiz válida.");
  let cursor=0;
  function block(indent){
    const first=lines[cursor],array=/^-(?:$| )/.test(first.s),out=array?[]:Object.create(null);
    while(cursor<lines.length&&lines[cursor].indent===indent){
      const {s,line}=lines[cursor++];let tail,key;
      if(array){if(!/^-(?:$| )/.test(s))fail(line,"mistura de lista e mapa.");tail=s.slice(1).trim();}
      else{const m=s.match(/^([A-Za-z0-9_.-]+):(?:\s+(.*)|\s*)$/);if(!m||!keyOK(m[1]))fail(line,"chave inválida ou sintaxe não suportada.");key=m[1];if(own(out,key))fail(line,"chave repetida: "+key);tail=(m[2]??"").trim();}
      let value;
      if(tail)value=scalar(tail,line);
      else if(lines[cursor]?.indent===indent+2)value=block(indent+2);
      else fail(line,"valor ausente (use null explicitamente).");
      if(array)out.push(value);else out[key]=value;
      if(lines[cursor]?.indent>indent)fail(lines[cursor].line,"indentação inesperada.");
    }
    return out;
  }
  const out=block(0);if(cursor!==lines.length)fail(lines[cursor].line,"indentação inválida.");return out;
}
