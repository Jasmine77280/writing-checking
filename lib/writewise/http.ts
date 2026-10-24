import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ProviderError, readConfig } from '../provider';
export async function readBody(req:Request){
 const origin=req.headers.get('origin');
 const url=new URL(req.url);
 const expectedOrigin=process.env.APP_ORIGIN||`${req.headers.get('x-forwarded-proto')||url.protocol.slice(0,-1)}://${req.headers.get('host')||url.host}`;
 if(origin&&origin!==expectedOrigin)throw new ProviderError('ORIGIN','不允许跨站提交。',403);
 if(!req.headers.get('content-type')?.includes('application/json'))throw new ProviderError('INPUT','请发送JSON请求。',400);
 const reader=req.body?.getReader();if(!reader)throw new ProviderError('INPUT','请求为空。',400);
 const chunks:Uint8Array[]=[];let length=0;
 for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>128*1024){await reader.cancel();throw new ProviderError('TOO_LARGE','请求超过128KiB，请减少内容。',413);}chunks.push(value);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ProviderError('INPUT','请求不是有效JSON。',400);}
}
export function consent(body:{externalConsent?:boolean}){if(readConfig().AI_PROVIDER!=='mock'&&body.externalConsent!==true)throw new ProviderError('CONSENT','请确认同意将本次内容发送给当前模型服务。',400);}
export function failure(e:unknown){const requestId=crypto.randomUUID();if(e instanceof z.ZodError)return NextResponse.json({code:'INPUT',message:e.issues[0].message,error:e.issues[0].message,requestId,retryable:false},{status:400});if(e instanceof ProviderError)return NextResponse.json({code:e.code,message:e.message,error:e.message,requestId,retryable:['TIMEOUT','NETWORK'].includes(e.code)},{status:e.status});return NextResponse.json({code:'VALIDATION',message:'结果校验失败，请检查上下文或重新批改。',error:'结果校验失败，请检查上下文或重新批改。',requestId,retryable:false},{status:422});}

// Anonymous demo replay protection only. Production must use an authenticated,
// shared persistent idempotency/usage store across processes and deployments.
const replays=new Map<string,{hash:string;at:number;response:Promise<Response>}>();
export async function operation(req:Request,handler:(body:unknown)=>Promise<unknown>){
 try{
  const body=await readBody(req);const parsed=z.object({externalConsent:z.boolean().optional()}).passthrough().parse(body);consent(parsed);
  const key=req.headers.get('idempotency-key');if(key&&(!/^[a-zA-Z0-9-]{16,128}$/.test(key)))throw new ProviderError('INPUT','无效幂等标识。',400);
  const {createHash}=await import('node:crypto');const c=readConfig();
  const hash=createHash('sha256').update(JSON.stringify({path:new URL(req.url).pathname,body,provider:c.AI_PROVIDER,model:c.AI_MODEL,endpoint:c.AI_BASE_URL})).digest('hex');
  const now=Date.now();for(const [k,value] of replays)if(now-value.at>10*60*1000)replays.delete(k);
  if(key){const cached=replays.get(key);if(cached){if(cached.hash!==hash)throw new ProviderError('CONFLICT','相同幂等标识对应不同内容。',409);return (await cached.response).clone();}if(replays.size>=100)throw new ProviderError('RATE_LIMIT','同时请求较多，请稍后重试。',429);}
  const response=(async()=>{try{return NextResponse.json(await handler(body));}catch(e){return failure(e);}})();
  if(key)replays.set(key,{hash,at:now,response});
  return (await response).clone();
 }catch(e){return failure(e);}
}
