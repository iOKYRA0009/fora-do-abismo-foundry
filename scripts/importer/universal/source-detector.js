/** Format recognition only. No eval, execution, file uploads or document writes. */
const object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const actorTypes=new Set(["character","npc","vehicle","group"]);
const itemTypes=new Set(["feat","weapon","spell","consumable","equipment","tool","loot","container","class","subclass","background","race"]);
const item=v=>object(v)&&typeof v.name==="string"&&v.name.trim()&&itemTypes.has(v.type);
const extensions={json:"json",js:"javascript",mjs:"javascript",yaml:"yaml",yml:"yaml",xml:"xml",csv:"csv",md:"markdown",markdown:"markdown",txt:"text"};
const result=(format,route,message,source,data=null)=>({format,route,message,source,data,supported:route!==null});
export function detectUniversalSource(input,{filename=""}={}) {
  let source=String(input??"").replace(/^\uFEFF/,"").trim();
  if(!source)throw new Error("Cole um conteúdo ou escolha um arquivo.");
  if(source.length>2*1024*1024)throw new Error("Conteúdo acima de 2 MB.");
  const extension=String(filename).toLowerCase().split(".").pop();
  const hint=extensions[extension]??null;
  const otherLanguage=/^(?:py|python|lua|rb|ruby|java|c|cpp|cs|go|rs|rust|ts|typescript|php|sh|bash|powershell|ps1)$/i;
  let explicitOther=otherLanguage.test(extension);
  let fenceHint=null;
  // Accept one complete fenced code block, never arbitrary surrounding prose.
  if(source.startsWith("```")){
    const match=source.match(/^```([\w-]*)[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/);
    if(!match||match[2].includes("```"))return result("markdown",null,"Envie somente um bloco de código completo, sem texto adicional.",source);
    const tag=match[1].toLowerCase();
    fenceHint=extensions[tag]??(tag==="javascript"?"javascript":null);
    if(tag)explicitOther=!fenceHint;
    source=match[2].trim();
  }
  const preferred=fenceHint??hint;
  let data;
  try{data=JSON.parse(source);}catch{
    if(preferred==="json"||/^[\[{]/.test(source))return result("json-invalid",null,"JSON inválido ou incompleto. Não será tratado como JavaScript.",source);
  }
  if(data!==undefined){
    if(object(data)&&data.schemaVersion==="jarvis-executor-1")
      return result("jarvis-executor","executor-package","Pacote Jarvis: validar no Executor antes de criar documentos.",source,data);
    if(object(data)&&["9.0","9.1"].includes(data.schemaVersion)&&object(data.actor))
      return result("jarvis-actor-"+data.schemaVersion,"actor","Ficha Jarvis: usar a revisão e importação de personagens.",source,data);
    if(object(data)&&("schemaVersion" in data||"actor" in data))
      return result("json-unknown",null,"Versão ou estrutura de pacote não reconhecida. Nenhum código será executado.",source,data);
    if(object(data)&&actorTypes.has(data.type)&&typeof data.name==="string"&&object(data.system))
      return result("foundry-actor",null,"Actor nativo do Foundry detectado. Nesta versão, utilize a importação JSON nativa do Foundry; o conversor será implementado separadamente.",source,data);
    const items=Array.isArray(data)?data:object(data)&&Array.isArray(data.items)?data.items:item(data)?[data]:null;
    if(items&&items.length>0&&items.length<=100&&items.every(item))
      return result("jarvis-items","items","Items detectados: selecione a ficha de destino e revise antes de importar.",source,items);
    return result("json-unknown",null,"JSON válido, mas não corresponde a um formato suportado de ficha, Items ou pacote.",source,data);
  }
  if(explicitOther)return result("unsupported-language",null,"Linguagem não suportada pelo Foundry. Converta os dados para JSON Jarvis; não execute como macro.",source);
  if(preferred==="yaml"||/^---\s*\n/.test(source)||/^(?:schemaVersion|actor|name|personagem):\s*[^\n]*\n/m.test(source))return result("yaml",null,"YAML reconhecido; conversão ainda não disponível.",source);
  if(preferred==="xml"||/^\s*<(?:\?xml\b|[A-Za-z_][\w.-]*(?:\s|>|\/))/.test(source))return result("xml",null,"XML reconhecido; conversão ainda não disponível.",source);
  if(preferred==="csv"||/^(?:name|nome|actor|personagem)[,;][^\n]+\r?\n/i.test(source))return result("csv",null,"CSV reconhecido; conversão ainda não disponível.",source);
  if(preferred==="javascript"||/^(?:\s*\/\/[^\n]*\n)*\s*(?:const\s+\w+\s*=|let\s+\w+\s*=|(?:await\s+)?(?:game|canvas|ui|Actor|Item|ChatMessage|foundry)\.|(?:async\s+)?function\s+\w+\s*\(|return\s+)/.test(source))
    return result("javascript","executor-js","Possível JavaScript. Exige validação de sintaxe e autorização no Executor; não será executado pelo detector.",source);
  if(preferred==="markdown"||/^#{1,6}\s/m.test(source))return result("markdown",null,"Markdown detectado; conversão de fichas estruturadas ainda não disponível.",source);
  return result("text",null,"Texto ou linguagem não reconhecida. Nenhuma execução automática.",source);
}
export function universalReport(detected){
  return {formato:detected.format,suportado:detected.supported,destino:detected.route,mensagem:detected.message,somenteLeitura:true};
}
