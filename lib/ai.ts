import { z } from 'zod';
export const inputSchema = z.object({ title: z.string().trim().max(200), material: z.string().max(2000).default(''), text: z.string().trim().min(1,'请填写作文正文').max(12000,'正文最多12000字，请分段提交'), examples: z.boolean().default(false) }).refine(v => v.title || v.material.trim(), '请填写题目或材料');
export const labels = ['中心论点与立意','论据质量与相关性','论证逻辑与推理','辩证思维与回应质疑','结构组织','语言表达'];
export const maxima = [20,20,25,15,10,10];
const evidenceSchema = z.object({quote:z.string(),start:z.number().int().nonnegative(),end:z.number().int().nonnegative()});
export const reviewSchema = z.object({schemaVersion:z.literal('1.0'),provider:z.enum(['mock','openai-compatible']),model:z.string().optional(),overallSummary:z.string(),dimensions:z.array(z.object({key:z.string(),label:z.string(),score:z.number().nonnegative(),maxScore:z.number(),evidence:z.array(evidenceSchema),issue:z.string(),whyItMatters:z.string(),guidingQuestion:z.string(),suggestedAction:z.string(),severity:z.enum(['高','中','低']),confidence:z.enum(['高','中','低'])})).length(6),argumentMap:z.array(z.object({label:z.string(),text:z.string(),status:z.enum(['已识别','可能存在','未发现','需人工确认'])})),disclaimer:z.string()}).superRefine((r,c)=>r.dimensions.forEach((d,i)=>{if(d.score>d.maxScore||d.maxScore!==maxima[i]||d.label!==labels[i])c.addIssue({code:'custom',message:'维度分数无效'});}));
export type Review = z.infer<typeof reviewSchema>;
export type EssayInput = z.infer<typeof inputSchema>;
export interface AIProvider { analyzeEssay(input:EssayInput):Promise<Review> }
export class MockAIProvider implements AIProvider {
 async analyzeEssay(input:EssayInput):Promise<Review>{
 const text=input.text; const sentences=text.split(/(?<=[。！？])/).map(s=>s.trim()).filter(Boolean);
 const absolute=sentences.find(s=>/所有|必然|完全|一定|只要.*就/.test(s));
 const quote=absolute||sentences[0]||text; const start=text.indexOf(quote); const evidence=[{quote,start,end:start+quote.length}];
 const counter=/但是|然而|固然|诚然|并非|未必|也有人|反对/.test(text);
 const causal=/因为|因此|这说明|意味着|原因|从而/.test(text);
 const example=/例如|比如|以.*为例|曾经|数据显示/.test(text);
 const issues=['中心论点的适用范围值得进一步澄清',example?'案例和论点之间的联系需要人工核查':'尚未识别到明确的案例引导词',absolute?'绝对化表达可能超出论据支持范围':'推理关系仍需逐句核查',counter?'检测到转折表达，是否回应质疑需人工确认':'尚未识别到明确的反方回应', '段落之间的递进关系需要人工确认','表达是否准确、简洁需要结合语境复核'];
 const questions=['你的核心判断在什么条件下成立？','这个事例的哪一个细节能够支持你的判断？','从这条证据到结论，中间还缺少哪一步解释？','有没有一个合理的反例？你会如何回应？','每一段分别推进了哪一步论证？','哪些词可以表达得更准确？'];
 const actions=['明确论点并补充适用条件','补充一个具体细节并解释其相关性','写出证据、解释、结论之间的连接','补充一种质疑并作有限度的回应','概括每段作用并检查顺序','检查绝对化用词及含糊概念'];
 return reviewSchema.parse({schemaVersion:'1.0',provider:'mock',overallSummary:'这篇文章已迈出表达观点的第一步。请优先检查“证据如何支持结论”，让读者看见你的推理过程。以下是规则生成的模拟演示，不代表真实模型评价。',dimensions:labels.map((label,i)=>({key:String(i),label,maxScore:maxima[i],score:[14,example?13:10,absolute?13:causal?18:15,counter?11:7,7,7][i],evidence,issue:issues[i],whyItMatters:'读者需要具体证据和清晰的推理才能判断结论是否成立；该模拟规则不能确认真实论证质量。',guidingQuestion:questions[i],suggestedAction:actions[i],severity:i===2?'高':'中',confidence:'低'})),argumentMap:[{label:'中心论点',text:sentences[0]||text,status:'可能存在'},{label:'分论点',text:'请人工标记每段的核心判断',status:'需人工确认'},{label:'论据',text:example?'检测到案例提示词；事实、数据及引用均需核实':'没有找到明确的案例提示词',status:example?'可能存在':'未发现'},{label:'推理关系',text:causal?'检测到因果或解释连接词':'需要检查证据到结论的连接',status:'需人工确认'},{label:'反方与限制',text:counter?'检测到转折表达':'尚未发现明确的反方回应',status:counter?'可能存在':'未发现'},{label:'结论',text:sentences.at(-1)||text,status:'可能存在'}],disclaimer:'AI辅助诊断分，不代表官方高考评分。模拟规则仅供流程演示，不能替代教师评价。'});
 }
}
export function validateEvidence(review:Review,text:string){return review.dimensions.every(d=>d.evidence.every(e=>e.quote.length>0 && e.end>e.start && e.end<=text.length && text.slice(e.start,e.end)===e.quote));}
