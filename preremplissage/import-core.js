const norm=v=>String(v??"").trim();
export const boolVal=v=>["1","oui","true","vrai","yes","y","x"].includes(norm(v).toLowerCase());
export const code=v=>norm(v);
export function splitMultiValue(v){if(Array.isArray(v))return v.map(norm).filter(Boolean);return norm(v).split(/\s*[|;]\s*/).map(norm).filter(Boolean);}
export function sheetKind(name){const n=norm(name).toUpperCase().replace(/[ÉÈÊË]/g,"E").replace(/[ÀÂÄ]/g,"A").replace(/[ÎÏ]/g,"I").replace(/[ÔÖ]/g,"O").replace(/[ÛÜ]/g,"U");if(n==="REPONSES"||n==="REPONSE")return"REPONSES";if(n==="FICHES"||n==="FICHE")return"FICHES";if(n==="SOUS_FICHES"||n==="SOUS-FICHES"||n==="SOUS FICHES")return"SOUS_FICHES";return"";}
export function rowsAsObjects(rows=[]){if(!rows.length)return{headers:[],rows:[]};const headers=rows[0].map(norm);return{headers,rows:rows.slice(1).filter(r=>r.some(v=>norm(v)!=="")).map((r,i)=>({line:i+2,data:Object.fromEntries(headers.map((h,j)=>[h,r[j]??""]))}))};}
export function questionScope(q){const raw=q?.TypeFiche_Code;return raw==null||raw===""||raw===0?"":String(raw);}
export function analyzeSheets(sheets,ctx){
  const errors=[],warnings=[],parsed=[],knownKinds=new Set();
  const qByCode=new Map((ctx.questions||[]).map(q=>[code(q.Question_Code).toUpperCase(),q]));
  const typeByCode=new Map((ctx.ficheTypes||[]).map(t=>[code(t.TypeFiche_Code).toUpperCase(),t]));
  const required={REPONSES:[ctx.identifierColumn],FICHES:[ctx.identifierColumn,"TYPE_FICHE","CODE_FICHE"],SOUS_FICHES:[ctx.identifierColumn,"TYPE_FICHE","CODE_FICHE","CODE_PARENT"]};
  let recognizedQuestions=0,unknownColumns=0,ficheCount=0,subCount=0;
  const identifiers=new Set(),ficheCodes=new Map(),principalIds=new Set();
  for(const sheet of sheets||[]){const kind=sheetKind(sheet.name);if(!kind)continue;knownKinds.add(kind);const obj=rowsAsObjects(sheet.rows);const headerSet=new Set(obj.headers.map(h=>h.toUpperCase()));for(const h of required[kind])if(!headerSet.has(String(h).toUpperCase()))errors.push(`${sheet.name} : colonne obligatoire manquante « ${h} ».`);
    const technical=new Set([ctx.identifierColumn,"TYPE_FICHE","CODE_FICHE","CODE_PARENT","LECTURE_SEULE_FICHE"].map(x=>String(x).toUpperCase()));
    const mappings=[];
    for(const h of obj.headers){const hu=h.toUpperCase();if(technical.has(hu))continue;if(hu.endsWith("__LECTURE_SEULE")){const base=hu.slice(0,-"__LECTURE_SEULE".length);if(!qByCode.has(base)){warnings.push(`${sheet.name} : verrouillage « ${h} » sans question correspondante.`);unknownColumns++;}continue;}const q=qByCode.get(hu);if(q){recognizedQuestions++;mappings.push({column:h,question:q});}else{warnings.push(`${sheet.name} : colonne « ${h} » non reconnue et ignorée.`);unknownColumns++;}}
    for(const row of obj.rows){const id=norm(row.data[ctx.identifierColumn]);if(!id)errors.push(`${sheet.name}, ligne ${row.line} : identifiant vide.`);else{identifiers.add(id);if(kind==="REPONSES"){if(principalIds.has(id))errors.push(`${sheet.name}, ligne ${row.line} : identifiant « ${id} » présent plusieurs fois dans REPONSES.`);else principalIds.add(id);}}let type=null,typeCode="",ficheCode="",parentCode="";
      if(kind!=="REPONSES"){typeCode=norm(row.data.TYPE_FICHE);ficheCode=norm(row.data.CODE_FICHE);type=typeByCode.get(typeCode.toUpperCase());if(!type)errors.push(`${sheet.name}, ligne ${row.line} : type de fiche « ${typeCode||"(vide)"} » introuvable.`);if(!ficheCode)errors.push(`${sheet.name}, ligne ${row.line} : CODE_FICHE vide.`);const key=`${id}::${ficheCode}`;if(ficheCodes.has(key))errors.push(`${sheet.name}, ligne ${row.line} : CODE_FICHE « ${ficheCode} » en double pour ${id}.`);else ficheCodes.set(key,{kind,typeCode});if(kind==="FICHES")ficheCount++;else{subCount++;parentCode=norm(row.data.CODE_PARENT);if(!parentCode)errors.push(`${sheet.name}, ligne ${row.line} : CODE_PARENT vide.`);}}
      const values=[];for(const m of mappings){const q=m.question,raw=row.data[m.column];if(norm(raw)==="")continue;const qScope=questionScope(q);if(kind==="REPONSES"&&qScope)warnings.push(`${sheet.name}, ligne ${row.line} : ${m.column} appartient à une fiche et sera ignorée dans REPONSES.`);else if(kind!=="REPONSES"&&type&&qScope&&String(qScope)!==String(type.id))warnings.push(`${sheet.name}, ligne ${row.line} : ${m.column} n’appartient pas au type ${typeCode} et sera ignorée.`);else values.push({question:q,column:m.column,raw,readOnly:boolVal(row.data[`${m.column}__LECTURE_SEULE`])});}
      parsed.push({sheet:sheet.name,kind,line:row.line,identifier:id,type,typeCode,ficheCode,parentCode,readOnlyElement:boolVal(row.data.LECTURE_SEULE_FICHE),values,raw:row.data});
    }
  }
  if(!knownKinds.size)errors.push("Aucune feuille REPONSES, FICHES ou SOUS_FICHES n’a été trouvée.");
  for(const r of parsed.filter(x=>x.kind==="SOUS_FICHES")){if(r.identifier&&r.parentCode&&!ficheCodes.has(`${r.identifier}::${r.parentCode}`))errors.push(`${r.sheet}, ligne ${r.line} : parent « ${r.parentCode} » introuvable pour ${r.identifier}.`);}
  const expected=new Set((ctx.expectedIdentifiers||[]).map(String));let found=0,notFound=0;for(const id of identifiers){if(expected.size&&expected.has(String(id)))found++;else if(expected.size)notFound++;}
  return{parsed,errors:[...new Set(errors)],warnings:[...new Set(warnings)],stats:{lines:parsed.length,identifiers:identifiers.size,participantsFound:found,participantsNotFound:notFound,recognizedQuestions,unknownColumns,ficheCount,subCount}};
}
