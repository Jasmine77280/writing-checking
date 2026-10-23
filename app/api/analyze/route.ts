import { NextResponse } from 'next/server';
import { inputSchema, validateEvidence } from '@/lib/ai';
import { getProvider, ProviderError, readConfig } from '@/lib/provider';
export const maxDuration = 60;
export async function POST(request:Request){
 try {
  const raw=await request.text();
  if(raw.length>60000)return NextResponse.json({error:'请求过长，请分段提交'},{status:413});
  let body;try{body=JSON.parse(raw);}catch{return NextResponse.json({error:'请求不是有效的JSON。'},{status:400});}
  const parsed=inputSchema.safeParse(body);
  if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0].message},{status:400});
  if(readConfig().AI_PROVIDER!=='mock'&&body.externalConsent!==true)return NextResponse.json({error:'请先确认同意将作文发送给所配置的模型服务。'},{status:400});
  const review=await getProvider().analyzeEssay(parsed.data);
  if(!validateEvidence(review,parsed.data.text))throw new ProviderError('EVIDENCE','原文证据校验未通过，没有生成诊断。');
  return NextResponse.json(review);
 }catch(e){if(e instanceof ProviderError)return NextResponse.json({error:e.message,code:e.code},{status:e.status});return NextResponse.json({error:'分析未完成，请稍后重试。没有生成诊断结果。'},{status:500});}
}
