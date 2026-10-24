import { z } from 'zod';
export const dimensionKeys = ['task_content','organization_cohesion','grammar_accuracy','lexis_expression','genre_style'] as const;
export const dimensionLabels = ['任务与内容','组织与衔接','语法准确性','词汇与表达','文体适切性'];
export const weights = { practical:[30,20,25,15,10], continuation:[35,25,20,15,5] };
const paragraph=z.object({id:z.string().min(1).max(80),text:z.string().max(12000)});
const starter=z.object({id:z.string().min(1).max(80),text:z.string().trim().min(1).max(500)});
export const taskSchema=z.object({
 product:z.literal('writewise'),taskType:z.enum(['practical','continuation']),title:z.string().trim().min(1).max(200),
 promptText:z.string().trim().min(1,'请填写写作任务').max(6000),grade:z.enum(['高一','高二','高三','未指定']),
 feedbackLanguage:z.enum(['zh-CN','en']),allowLocalExamples:z.boolean(),
 wordTarget:z.number().int().min(1).max(2000).nullable(),rubricVersion:z.literal('internal-v1'),
 genre:z.string().max(100),audience:z.string().max(200),purpose:z.string().max(300),
 requiredPoints:z.array(z.string().trim().min(1).max(500)).max(12),contextConfirmed:z.boolean(),
 readingText:z.string().max(20000),starters:z.array(starter).max(4),paragraphs:z.array(paragraph).min(1).max(4),
}).superRefine((t,c)=>{
 if(!t.paragraphs.some(p=>p.text.trim()))c.addIssue({code:'custom',path:['paragraphs'],message:'请填写英文正文'});
 if(t.paragraphs.reduce((s,p)=>s+p.text.length,0)>12000)c.addIssue({code:'custom',path:['paragraphs'],message:'正文最多12000字符，不会截断内容'});
 if(new Set(t.paragraphs.map(p=>p.id)).size!==t.paragraphs.length)c.addIssue({code:'custom',message:'段落编号重复'});
 if(t.taskType==='practical'&&t.starters.length)c.addIssue({code:'custom',message:'应用文不能包含续写段首句'});
 if(t.taskType==='continuation'){
  if(t.starters.length!==t.paragraphs.length)c.addIssue({code:'custom',message:'续写正文必须与给定段首句逐段对应'});
  if(new Set(t.starters.map(p=>p.id)).size!==t.starters.length)c.addIssue({code:'custom',message:'段首句编号重复'});
 }
});
export type TaskInput=z.infer<typeof taskSchema>;
export const evidenceSchema=z.object({id:z.string().min(1),sourceId:z.string().min(1),quote:z.string().min(1),start:z.number().int().nonnegative(),end:z.number().int().positive()});
export type Evidence=z.infer<typeof evidenceSchema>;
const dimensionSchema=z.object({key:z.enum(dimensionKeys),assessmentStatus:z.enum(['assessed','not_assessable']),level:z.number().int().min(0).max(4).nullable(),summary:z.string().min(1),strengths:z.array(z.string()),evidenceIds:z.array(z.string()),limitation:z.string().nullish().transform(v=>v??undefined)}).superRefine((d,c)=>{if((d.assessmentStatus==='assessed')!==(d.level!==null))c.addIssue({code:'custom',message:'可评估状态与等级不一致'});});
export const issueSchema=z.object({id:z.string().min(1),dimensionKey:z.enum(dimensionKeys),category:z.enum(['task_omission','task_mismatch','genre_register','organization','cohesion_reference','grammar','lexical_collocation','spelling_punctuation','story_contradiction','story_development','starter_connection']),judgmentType:z.enum(['error','possible_issue','optional_improvement']),title:z.string().min(1),severity:z.enum(['high','medium','low']),confidence:z.enum(['high','medium','low']),evidenceStatus:z.enum(['located','absence_claim','insufficient']),studentEvidenceIds:z.array(z.string()),contextEvidenceIds:z.array(z.string()),searchedSegmentIds:z.array(z.string()).nullish().transform(v=>v??undefined),requirementId:z.string().nullish().transform(v=>v??undefined),explanation:z.string().min(1),guidingQuestion:z.string().min(1),suggestedAction:z.string().min(1)});
export type Issue=z.infer<typeof issueSchema>;
const coverageSchema=z.object({requirementId:z.string(),text:z.string(),status:z.enum(['covered','partial','missing','uncertain','not_assessable']),evidenceIds:z.array(z.string()),reason:z.string()});
export const reviewSchema=z.object({schemaVersion:z.literal('writewise.review.v2'),taskType:z.enum(['practical','continuation']),assessmentScope:z.enum(['full','language_only','limited_context']),contextHash:z.string(),metadata:z.object({provider:z.enum(['mock','openai-compatible']),model:z.string().nullable(),promptVersion:z.literal('writewise-v2'),rubricVersion:z.literal('internal-v1'),createdAt:z.string()}),wordCounts:z.object({studentWords:z.number(),providedWords:z.number(),combinedWords:z.number(),version:z.literal('en-v1')}),contextChecks:z.object({sufficient:z.boolean(),missing:z.array(z.string())}),overallSummary:z.string().min(1),strengths:z.array(z.string()),dimensions:z.array(dimensionSchema).length(5),diagnosticIndex:z.number().min(0).max(100).nullable(),scoreEstimate:z.object({status:z.literal('unavailable'),fullScore:z.number(),lower:z.null(),upper:z.null(),point:z.null(),reason:z.string().min(1)}),taskCoverage:z.array(coverageSchema),storyChecks:z.array(z.object({label:z.string(),status:z.enum(['identified','possible','not_found','needs_review']),text:z.string(),evidenceIds:z.array(z.string())})),evidence:z.array(evidenceSchema).max(100),issues:z.array(issueSchema).max(10),priorities:z.array(z.string()).max(3),nextGoal:z.string().min(1),limitations:z.array(z.string()),disclaimer:z.string()}).superRefine((r,c)=>{if(new Set(r.dimensions.map(d=>d.key)).size!==5)c.addIssue({code:'custom',message:'必须包含五个不同维度'});if(new Set(r.issues.map(i=>i.id)).size!==r.issues.length)c.addIssue({code:'custom',message:'问题ID重复'});if(new Set(r.evidence.map(e=>e.id)).size!==r.evidence.length)c.addIssue({code:'custom',message:'证据ID重复'});});
export type Review=z.infer<typeof reviewSchema>;
export const hintSchema=z.object({issueId:z.string(),level:z.union([z.literal(1),z.literal(2),z.literal(3)]),explanation:z.string().min(1),example:z.string().nullable(),disclaimer:z.string()});
export type Hint=z.infer<typeof hintSchema>;
export const comparisonSchema=z.object({schemaVersion:z.literal('writewise.comparison.v2'),contextHash:z.string(),items:z.array(z.object({issueId:z.string(),status:z.enum(['resolved','partially_improved','unresolved','not_assessable']),alignmentStatus:z.enum(['aligned','partial','unmatched']),beforeEvidence:z.array(evidenceSchema),afterEvidence:z.array(evidenceSchema),reason:z.string().min(1),confidence:z.enum(['high','medium','low']),teacherReviewStatus:z.literal('pending')})).max(10),newIssues:z.array(z.object({issueId:z.string(),reason:z.string().min(1)})).max(10),nextGoal:z.string().min(1),limitations:z.array(z.string())});
export type Comparison=z.infer<typeof comparisonSchema>;
export const contextSchema=z.object({requiredPoints:z.array(z.string().min(1).max(500)).max(12),genre:z.string().max(100),audience:z.string().max(200),purpose:z.string().max(300),facts:z.array(z.object({text:z.string(),status:z.enum(['identified','possible','needs_review']),evidence:z.array(evidenceSchema)})).max(10),notice:z.string()});
export type Context=z.infer<typeof contextSchema>;
export function countWords(text:string){return (text.match(/[A-Za-z]+(?:['’‑-][A-Za-z]+)*|[0-9]+(?:[.,][0-9]+)*/g)||[]).length;}
export function wordCounts(t:TaskInput){const studentWords=t.paragraphs.reduce((n,p)=>n+countWords(p.text),0),providedWords=t.taskType==='continuation'?t.starters.reduce((n,p)=>n+countWords(p.text),0):0;return {studentWords,providedWords,combinedWords:studentWords+providedWords,version:'en-v1' as const};}
export function sources(t:TaskInput):Record<string,string>{return {prompt:t.promptText,reading:t.readingText,...Object.fromEntries(t.starters.map(s=>['starter:'+s.id,s.text])),...Object.fromEntries(t.paragraphs.map(p=>['student:'+p.id,p.text]))};}
export function contextStatus(t:TaskInput){const missing:string[]=[];if(!t.contextConfirmed)missing.push('任务上下文尚未确认');if(t.taskType==='practical'&&!t.requiredPoints.length)missing.push('未确认任务要点');if(t.taskType==='continuation'){if(!t.readingText.trim())missing.push('缺少故事原文');if(!t.starters.length)missing.push('缺少给定段首句');}return {sufficient:missing.length===0,missing};}
export function blankTask(type:TaskInput['taskType']='practical'):TaskInput{return {product:'writewise',taskType:type,title:'',promptText:'',grade:'高二',feedbackLanguage:'zh-CN',allowLocalExamples:false,wordTarget:null,rubricVersion:'internal-v1',genre:'',audience:'',purpose:'',requiredPoints:[],contextConfirmed:false,readingText:'',starters:type==='continuation'?[{id:'s1',text:''},{id:'s2',text:''}]:[],paragraphs:type==='continuation'?[{id:'p1',text:''},{id:'p2',text:''}]:[{id:'p1',text:''}]};}
