import {codeOf,isTrue,isRequiredQuestion,evaluateCondition,sortByOrder,validateQuestion} from '../shared/grist-common.js';

const active=row=>{const value=row?.Actif??row?.Active;return value==null||value===''||isTrue(value)};
const findRef=(value,rows,column)=>{const raw=codeOf(value);return (rows??[]).find(row=>String(row.id)===raw||codeOf(row[column])===raw)};
const refCode=(value,rows,column)=>codeOf(findRef(value,rows,column)?.[column])||codeOf(value);
const typeOf=q=>String(q?.Type_question??q?.Type??'').trim().toLowerCase();

// Never mutate QUESTIONS: effective obligation is local to the current response/fiche.
export function effectiveQuestion(question,definition={},answers={}){
  const ref=codeOf(question?.Condition_obligation_Code);
  if(!ref)return question;
  const condition=findRef(ref,definition.conditions,'Condition_Code');
  if(!condition)return {...question,_obligationError:'La condition d’obligation de cette question est introuvable.'};
  const rules=(definition.rules??[]).map(rule=>({...rule,
    Condition_Code:refCode(rule.Condition_Code,definition.conditions,'Condition_Code'),
    Question_source_Code:refCode(rule.Question_source_Code,definition.questions,'Question_Code'),
    Question_comparaison_Code:refCode(rule.Question_comparaison_Code,definition.questions,'Question_Code')
  }));
  try{
    const required=evaluateCondition(condition,rules,answers);
    return {...question,Mode_obligation:required?'Obligatoire':'Facultative',Obligatoire:required,_obligationError:''};
  }catch{return {...question,_obligationError:'La condition d’obligation de cette question est invalide.'}}
}

export function matrixValidationErrors(question,value,definition={},answers={}){
  const type=typeOf(question);
  if(!type.includes('matrice'))return [];
  const kind=type.includes('checkbox')||type.includes('case')?'checkbox':type.includes('radio')?'radio':/nombre|numérique|numerique/.test(type)?'number':'text';
  const code=codeOf(question.Question_Code),errors=[],data=value&&typeof value==='object'?value:{};
  const belongs=row=>refCode(row.Question_Code,definition.questions,'Question_Code')===code;
  const rows=sortByOrder((definition.questions??[]).filter(row=>active(row)&&isTrue(row.Est_ligne_matrice)&&refCode(row.Question_parente_Code,definition.questions,'Question_Code')===code));
  const today=new Date(),day=Date.UTC(today.getFullYear(),today.getMonth(),today.getDate())/1000;
  const date=v=>{if(!v)return null;if(typeof v==='number')return v>1e12?v/1000:v;const n=Date.parse(String(v));return Number.isFinite(n)?n/1000:null};
  const isAvailable=c=>!String(c.Visibilite_colonne||'').toLowerCase().startsWith('masqu')&&(date(c.Date_ouverture_colonne)===null||day>=date(c.Date_ouverture_colonne));
  const columns=sortByOrder(((kind==='radio'||kind==='checkbox')?definition.choices:definition.matrixColumns)??[]).filter(row=>active(row)&&belongs(row)&&isAvailable(row));
  if(!columns.length)return []; // Aucune cellule visible : ne pas bloquer la validation.
  let hasValue=false;
  for(const original of rows){
    const row=effectiveQuestion(original,definition,answers),rowCode=codeOf(row.Question_Code),rowValue=data[rowCode],label=String(row.Libelle??row.Libellé??row.Titre??rowCode);
    if(row._obligationError)errors.push(`${label} : ${row._obligationError}`);
    if(kind==='radio'||kind==='checkbox'){
      const selected=kind==='checkbox'?(Array.isArray(rowValue)?rowValue:[]):(rowValue==null||rowValue===''?[]:[rowValue]);
      if(selected.length)hasValue=true;
      if(isRequiredQuestion(row)&&!selected.length)errors.push(`${label} : réponse obligatoire.`);
      continue;
    }
    for(const column of columns){
      const cc=codeOf(column.ColonneMatrice_Code),v=rowValue?.[cc]??'',empty=v===''||v==null,colLabel=String(column.Libelle??column.Libellé??cc);
      if(!empty)hasValue=true;
      if(!isTrue(column.Lecture_seule_colonne)&&(isRequiredQuestion(row)||isTrue(column.Obligatoire))&&empty)errors.push(`${label} / ${colLabel} : champ obligatoire.`);
      if(empty)continue;
      if(kind==='number'){
        const n=Number(v);
        if(!Number.isFinite(n))errors.push(`${colLabel} : nombre invalide.`);
        else{
          if(column.Minimum!==''&&column.Minimum!=null&&n<Number(column.Minimum))errors.push(`${colLabel} : minimum ${column.Minimum}.`);
          if(column.Maximum!==''&&column.Maximum!=null&&n>Number(column.Maximum))errors.push(`${colLabel} : maximum ${column.Maximum}.`);
        }
      }else if(Number(column.Longueur_max)>0&&String(v).length>Number(column.Longueur_max))errors.push(`${colLabel} : maximum ${column.Longueur_max} caractères.`);
    }
  }
  if(isRequiredQuestion(effectiveQuestion(question,definition,answers))&&!hasValue&&!errors.length)errors.push('Cette matrice est obligatoire.');
  return errors;
}

export function validateConfiguredQuestion(question,value,definition={},answers={},scalarValidator=validateQuestion){
  const type=typeOf(question);
  if(['description','sommaire','indicateurs','tableau_donnees'].includes(type))return '';
  const effective=effectiveQuestion(question,definition,answers);
  if(effective._obligationError)return effective._obligationError;
  if(type.includes('matrice'))return matrixValidationErrors(effective,value,definition,answers).join(' ');
  return scalarValidator(effective,value,true);
}
