import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { z } from 'zod';
import { sources, hintSchema, contextSchema, countWords, type TaskInput, type Review, type Issue, type Hint, type Context, type Comparison } from './writewise/schema';
import { finalizeReview, finalizeComparison, locate } from './writewise/validation';
import { mockReview, mockHint, mockCompare, mockContext } from './writewise/mock';
import { guard, reviewContract, hintContract, comparisonContract, contextContract } from './writewise/prompts';
// The cloud runtime injects scoped credentials through its HTTPS egress proxy.
// Native Node fetch needs an explicit dispatcher to honor that route.
if (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy) {
 setGlobalDispatcher(new EnvHttpProxyAgent());
}
export class ProviderError extends Error {
 constructor(public code:string, message:string, public status=502){super(message);}
}
const configSchema=z.object({
 AI_PROVIDER:z.enum(['mock','openai-compatible']).default('mock'),
 AI_BASE_URL:z.string().url().default('https://api.openai.com/v1'),
 AI_API_KEY:z.string().optional(),AI_MODEL:z.preprocess(v=>v===''?undefined:v,z.string().trim().min(1).optional()),
 AI_TIMEOUT_MS:z.coerce.number().int().min(1000).max(120000).default(25000),
 AI_MAX_REQUESTS_PER_MINUTE:z.coerce.number().int().min(1).max(60).default(5),
 AI_MAX_CALLS_PER_DAY:z.coerce.number().int().min(1).max(10000).default(50),
 AI_MAX_OUTPUT_TOKENS:z.coerce.number().int().min(500).max(12000).default(6000)
});
export function readConfig(){
 const parsed=configSchema.safeParse(process.env);
 if(!parsed.success)throw new ProviderError('CONFIG','模型配置无效，请检查服务端环境变量。',503);
 const c=parsed.data;
 if(c.AI_PROVIDER==='openai-compatible'){
  if(!c.AI_API_KEY||!c.AI_MODEL)throw new ProviderError('CONFIG','真实模型尚未配置完整，请在服务端设置 AI_API_KEY 和 AI_MODEL。',503);
  const url=new URL(c.AI_BASE_URL);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new ProviderError('CONFIG','模型服务地址必须是无凭据、无查询参数的 HTTPS 地址。',503);
 }
 return c;
}
export function publicConfig(){try{const c=readConfig();return {product:'writewise',schemaVersion:'writewise.review.v2',taskTypes:['practical','continuation'],ocrEnabled:false,storageMode:'local-demo',provider:c.AI_PROVIDER,model:c.AI_PROVIDER==='mock'?null:c.AI_MODEL,configured:true,external:c.AI_PROVIDER!=='mock'};}catch{return {provider:process.env.AI_PROVIDER==='mock'||!process.env.AI_PROVIDER?'mock':'openai-compatible',model:null,configured:false,external:process.env.AI_PROVIDER!=='mock'&&!!process.env.AI_PROVIDER};}}
// Shared instance-wide ceilings. Each outbound attempt, including a format retry, consumes one call.
// This is intentionally conservative for an anonymous demo. Production needs a shared persistent limiter.
let minute={at:0,count:0};let day={date:'',count:0};
export function reserveCall(c:ReturnType<typeof readConfig>,now=Date.now()){
 const date=new Date(now).toISOString().slice(0,10);
 if(now-minute.at>=60000)minute={at:now,count:0};
 if(day.date!==date)day={date,count:0};
 if(minute.count>=c.AI_MAX_REQUESTS_PER_MINUTE)throw new ProviderError('RATE_LIMIT','模型调用频率已达上限，请稍后重试。',429);
 if(day.count>=c.AI_MAX_CALLS_PER_DAY)throw new ProviderError('DAILY_LIMIT','本实例今日模型调用额度已用完。',429);
 minute.count++;day.count++;
}
export interface WritingProvider {
 analyzeEssay(t:TaskInput):Promise<Review>;
 generateHint(t:TaskInput,issue:Issue,level:1|2|3):Promise<Hint>;
 compareDrafts(before:TaskInput,after:TaskInput,r:Review,next:Review):Promise<Comparison>;
 extractTaskContext(t:TaskInput):Promise<Context>;
}
export class MockWritingProvider implements WritingProvider {
 async analyzeEssay(t:TaskInput){return mockReview(t);}
 async generateHint(t:TaskInput,i:Issue,l:1|2|3){return mockHint(i,l,t.allowLocalExamples);}
 async compareDrafts(b:TaskInput,a:TaskInput,r:Review,n:Review){return mockCompare(b,a,r,n);}
 async extractTaskContext(t:TaskInput){return mockContext(t);}
}
export class OpenAICompatibleProvider implements WritingProvider {
 constructor(private config:ReturnType<typeof readConfig>,private send:typeof fetch=fetch){}
 private async request<T>(contract:string,data:unknown,validate:(v:unknown)=>T):Promise<T>{
  let correction='';
  for(let attempt=0;attempt<2;attempt++){
   reserveCall(this.config);
   let response:Response;
   try{response=await this.send(`${this.config.AI_BASE_URL.replace(/\/$/,'')}/chat/completions`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.config.AI_API_KEY}`},signal:AbortSignal.timeout(this.config.AI_TIMEOUT_MS),body:JSON.stringify({model:this.config.AI_MODEL,messages:[{role:'system',content:guard+'\n'+contract+(attempt?'\n上次字段校验失败，请重新输出完整JSON并修复：'+correction:'')},{role:'user',content:JSON.stringify(data)}],response_format:{type:'json_object'},max_tokens:this.config.AI_MAX_OUTPUT_TOKENS})});}
   catch(e){if(e instanceof Error&&['TimeoutError','AbortError'].includes(e.name))throw new ProviderError('TIMEOUT','模型响应超时，请稍后重试。',504);throw new ProviderError('NETWORK','无法连接模型服务，请检查服务地址和代理配置。');}
   if(!response.ok){if([401,403].includes(response.status))throw new ProviderError('AUTH','模型服务拒绝访问，请检查密钥与模型权限。',503);if(response.status===429)throw new ProviderError('UPSTREAM_LIMIT','模型服务额度或频率受限。',429);throw new ProviderError('UPSTREAM','模型服务返回错误，未生成结果。');}
   try{
    const envelope=z.object({choices:z.array(z.object({finish_reason:z.string().nullable().optional(),message:z.object({content:z.string().nullable(),refusal:z.string().nullable().optional()})})).min(1)}).parse(await response.json());
    const choice=envelope.choices[0];if(choice.message.refusal||choice.finish_reason==='content_filter')throw new ProviderError('REFUSAL','模型未能处理此内容，请联系教师。');
    if(choice.finish_reason==='length')throw new Error('响应被截断，请缩短内容或增加输出预算');
    return validate(JSON.parse(choice.message.content||''));
   }catch(e){if(e instanceof ProviderError)throw e;correction=e instanceof z.ZodError?e.issues.map(i=>i.path.join('.')+':'+i.code).join(';'):e instanceof Error?e.message:'字段不满足要求';if(attempt)throw new ProviderError('FORMAT','模型结果重试后仍未通过结构或原文证据校验。');}
  }
  throw new ProviderError('FORMAT','未取得有效结果。');
 }
 analyzeEssay(t:TaskInput){return this.request(reviewContract,{task:t,sources:sources(t)},v=>finalizeReview(v,t,'openai-compatible',this.config.AI_MODEL!));}
 generateHint(t:TaskInput,issue:Issue,level:1|2|3){return this.request(hintContract,{task:t,issue,level,allowLocalExamples:t.allowLocalExamples},v=>{
  const h=hintSchema.parse(v);if(h.issueId!==issue.id||h.level!==level)throw new Error('问题或层级不匹配');
  if(h.example&&(!t.allowLocalExamples||level!==3||countWords(h.example)>60||h.example.split(/[.!?]+/).filter(s=>s.trim()).length>2))throw new Error('局部示例越界');
  return h;
 });}
 compareDrafts(before:TaskInput,after:TaskInput,r:Review,next:Review){return this.request(comparisonContract,{before,after,beforeReview:r,afterReview:next},v=>finalizeComparison(v,before,after,r,next));}
 extractTaskContext(t:TaskInput){return this.request(contextContract,{task:t,sources:sources(t)},v=>{const c=contextSchema.parse(v);c.facts.forEach(f=>{if(!f.evidence.length&&f.status==='identified')throw new Error('明示事实需原文证据');f.evidence.forEach(e=>{if(e.sourceId!=='reading')throw new Error('事实须引用故事原文');locate(e,sources(t));});});return c;});}
}
export function getProvider():WritingProvider{const config=readConfig();return config.AI_PROVIDER==='mock'?new MockWritingProvider():new OpenAICompatibleProvider(config);}
