import { createHash } from 'node:crypto';
import { comparisonSchema,contextStatus,dimensionKeys,reviewSchema,sources,weights,wordCounts,type Comparison,type Evidence,type Review,type TaskInput } from './schema';
export function contextHash(t:TaskInput){const {paragraphs: _paragraphs,...context}=t;void _paragraphs;return createHash('sha256').update(JSON.stringify(context)).digest('hex');}
export function locate(e:Evidence,texts:Record<string,string>){const text=texts[e.sourceId];if(text===undefined)throw new Error('未知证据来源');if(e.end>e.start&&text.slice(e.start,e.end)===e.quote)return;if(!e.quote)throw new Error('引文为空');const start=text.indexOf(e.quote);if(start<0||text.indexOf(e.quote,start+1)>=0)throw new Error('引文缺失或重复且定位不明确');e.start=start;e.end=start+e.quote.length;}
export function finalizeReview(raw:unknown,t:TaskInput,provider:'mock'|'openai-compatible',model:string|null):Review{
 const r=reviewSchema.parse(raw),texts=sources(t),checks=contextStatus(t);
 if(r.taskType!==t.taskType)throw new Error('题型不一致');
 r.evidence.forEach(e=>locate(e,texts));const evidence=new Map(r.evidence.map(e=>[e.id,e]));
 const references=[...r.dimensions.flatMap(d=>d.evidenceIds),...r.taskCoverage.flatMap(c=>c.evidenceIds),...r.storyChecks.flatMap(c=>c.evidenceIds),...r.issues.flatMap(i=>[...i.studentEvidenceIds,...i.contextEvidenceIds])];
 const missingRefs=[...new Set(references.filter(id=>!evidence.has(id)))];
 if(missingRefs.length)throw new Error('未定义证据引用ID：'+JSON.stringify(missingRefs)+'；evidence表可用ID：'+JSON.stringify([...evidence.keys()])+'。所有evidenceIds必须引用evidence条目的id，不能直接使用sourceId/issueId/requirementId；需要新引文则新增evidence条目。');
 const resolve=(ids:string[])=>ids.map(id=>{const e=evidence.get(id);if(!e)throw new Error('证据引用无效');return e;});
 r.dimensions.forEach(d=>{resolve(d.evidenceIds);if(!checks.sufficient&&(d.key==='task_content'||d.key==='genre_style')){d.assessmentStatus='not_assessable';d.level=null;d.limitation=checks.missing.join('；');}});
 const issueIds=new Set(r.issues.map(i=>i.id));if(r.priorities.some(id=>!issueIds.has(id)))throw new Error('优先问题引用无效');
 r.issues.forEach((i,index)=>{
  const student=resolve(i.studentEvidenceIds),context=resolve(i.contextEvidenceIds);
  if(student.some(e=>!e.sourceId.startsWith('student:')))throw new Error(`issues.${index}.studentEvidenceIds 只能引用sourceId以student:开头的学生正文证据；题目和reading引用放contextEvidenceIds`);
  if(context.some(e=>e.sourceId.startsWith('student:')))throw new Error(`issues.${index}.contextEvidenceIds 只能引用prompt/reading/starter来源，不能引用学生正文`);
  if(i.evidenceStatus==='located'&&!student.length)throw new Error('缺少学生原文证据');
  if(i.evidenceStatus==='insufficient'&&i.judgmentType==='error')throw new Error('证据不足不能确诊');
  if(i.evidenceStatus==='absence_claim'){
   if(i.judgmentType==='error'||!context.length||!i.searchedSegmentIds?.length)throw new Error('缺失要点需要上下文与搜索范围');
   if(i.searchedSegmentIds.some(s=>!s.startsWith('student:')||!(s in texts)))throw new Error('检索范围无效');
   if(!i.requirementId||!t.requiredPoints[Number(i.requirementId.replace('req-',''))])throw new Error('任务要点引用无效');
  }
  if(i.category==='story_contradiction'&&(!student.length||!context.some(e=>e.sourceId==='reading')))throw new Error('故事矛盾必须有双源证据');
  if(!checks.sufficient&&['task_omission','task_mismatch','story_contradiction','starter_connection'].includes(i.category))throw new Error('上下文不足不能诊断任务与故事问题');
 });
 const requirementIds=t.requiredPoints.map((_,i)=>'req-'+i);
 if(new Set(r.taskCoverage.map(c=>c.requirementId)).size!==r.taskCoverage.length)throw new Error('重复任务要点');
 if(t.taskType==='practical'&&checks.sufficient&&(r.taskCoverage.length!==requirementIds.length||r.taskCoverage.some(c=>!requirementIds.includes(c.requirementId))))throw new Error('任务清单不完整');
 r.taskCoverage.forEach(c=>{if(!requirementIds.includes(c.requirementId))throw new Error('未知任务要点');c.text=t.requiredPoints[Number(c.requirementId.slice(4))];resolve(c.evidenceIds);if(!checks.sufficient)c.status='not_assessable';if(c.status==='covered'&&!resolve(c.evidenceIds).some(e=>e.sourceId.startsWith('student:')))throw new Error('要点覆盖需要学生证据');});
 r.storyChecks.forEach(s=>resolve(s.evidenceIds));
 if(t.taskType==='practical'&&r.storyChecks.length)throw new Error('应用文不能输出续写检查');
 if(t.taskType==='continuation'&&r.taskCoverage.length)throw new Error('续写使用storyChecks，不输出应用文要点覆盖表');
 if(t.taskType==='continuation'&&checks.sufficient&&!r.storyChecks.length)throw new Error('续写需提供情节衔接检查');
 r.contextChecks=checks;r.assessmentScope=checks.sufficient?'full':t.taskType==='practical'?'language_only':'limited_context';
 r.contextHash=contextHash(t);r.wordCounts=wordCounts(t);r.metadata={provider,model,promptVersion:'writewise-v2',rubricVersion:'internal-v1',createdAt:new Date().toISOString()};
 r.diagnosticIndex=r.dimensions.some(d=>d.level===null)?null:Math.round(dimensionKeys.reduce((sum,key,i)=>sum+(r.dimensions.find(d=>d.key===key)!.level!/4)*weights[t.taskType][i],0));
 r.scoreEstimate={status:'unavailable',fullScore:t.taskType==='practical'?15:25,lower:null,upper:null,point:null,reason:'当前采用内部训练规则，尚无教师确认的整体分档标准，不换算高考分数。'};
 r.disclaimer='AI辅助反馈与内部能力指数，不代表官方高考评分。置信程度为模型自评，重要判断请由教师复核。';
 return r;
}
export function finalizeComparison(raw:unknown,before:TaskInput,after:TaskInput,review:Review,afterReview:Review):Comparison{
 if(contextHash(before)!==contextHash(after)||review.contextHash!==contextHash(before)||afterReview.contextHash!==contextHash(after))throw new Error('不同任务上下文不可直接比较');
 if(review.metadata.model!==afterReview.metadata.model||review.metadata.provider!==afterReview.metadata.provider)throw new Error('模型改变，请使用相同模型重新批改后比较');
 const c=comparisonSchema.parse(raw);c.contextHash=contextHash(before);
 if(c.items.length!==review.issues.length||new Set(c.items.map(i=>i.issueId)).size!==c.items.length)throw new Error('比较必须覆盖初稿全部问题');
 c.items.forEach(i=>{
  const issue=review.issues.find(x=>x.id===i.issueId);if(!issue)throw new Error('未知问题');
  i.beforeEvidence.forEach(e=>locate(e,sources(before)));i.afterEvidence.forEach(e=>locate(e,sources(after)));
  if(i.beforeEvidence.some(e=>!e.sourceId.startsWith('student:'))||i.afterEvidence.some(e=>!e.sourceId.startsWith('student:')))throw new Error('比较证据必须来自学生正文');
  const validBefore=issue.studentEvidenceIds.map(id=>review.evidence.find(e=>e.id===id)!);
  if(i.beforeEvidence.some(e=>!validBefore.some(v=>v.sourceId===e.sourceId&&v.quote===e.quote)))throw new Error('比较前稿证据必须属于该问题');
  if(i.status==='resolved'&&(!i.afterEvidence.length||i.alignmentStatus!=='aligned'))throw new Error('确认解决需要可对齐后稿证据');
  if(i.status==='not_assessable')i.alignmentStatus='unmatched';
  if(i.status==='unresolved'&&!i.afterEvidence.length)throw new Error('未解决判断需要后稿证据');
 });
 if(new Set(c.newIssues.map(i=>i.issueId)).size!==c.newIssues.length||c.newIssues.some(i=>!afterReview.issues.some(n=>n.id===i.issueId)))throw new Error('新问题引用无效');
 return c;
}
