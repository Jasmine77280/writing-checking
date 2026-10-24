import {z} from 'zod';
import {taskSchema,reviewSchema,hintSchema,comparisonSchema} from './schema';
export const eventSchema=z.object({issueId:z.string(),action:z.string(),at:z.string(),note:z.string().optional()});
export const decisionSchema=z.object({status:z.enum(['采纳','修改','驳回']),note:z.string(),at:z.string()});
export const recordSchema=z.object({id:z.string(),created:z.string(),input:taskSchema,review:reviewSchema,after:taskSchema.optional(),afterReview:reviewSchema.optional(),comparison:comparisonSchema.optional(),events:z.array(eventSchema),hints:z.array(hintSchema),decisions:z.record(decisionSchema),comparisonDecisions:z.record(decisionSchema),shared:z.boolean()});
export const storeSchema=z.array(recordSchema);
export type EssayRecord=z.infer<typeof recordSchema>;
export type Decision=z.infer<typeof decisionSchema>;
export type PublicConfig={provider:string;model:string|null;configured:boolean;external:boolean;ocrEnabled?:boolean};
export const STORAGE_KEY='writewise-tasks-v2';
export async function api<T>(path:string,body:unknown):Promise<T>{
 const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 const d=await r.json();if(!r.ok)throw new Error(d.message||d.error||'请求失败，请保留输入并重试。');return d as T;
}
export function downloadJson(value:unknown,name:string){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
