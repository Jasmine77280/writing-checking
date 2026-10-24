import {afterEach,expect,it,vi} from 'vitest';
import {readBody,consent} from './http';
afterEach(()=>vi.unstubAllEnvs());
it('rejects cross-site writes and oversized streams before processing',async()=>{const cross=new Request('https://app.example/api/analyze',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'});await expect(readBody(cross)).rejects.toHaveProperty('status',403);const big=new Request('https://app.example/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'a'.repeat(129*1024)})});await expect(readBody(big)).rejects.toHaveProperty('status',413);});
it('requires explicit external consent in real mode',()=>{vi.stubEnv('AI_PROVIDER','openai-compatible');vi.stubEnv('AI_MODEL','test');vi.stubEnv('AI_API_KEY','test-key');expect(()=>consent({})).toThrow();expect(()=>consent({externalConsent:true})).not.toThrow();});
it('deduplicates concurrent operations and rejects changed content for the same key',async()=>{
 vi.stubEnv('AI_PROVIDER','mock');const {operation}=await import('./http');let calls=0;
 const req=(n:number)=>new Request('https://app.example/api/analyze',{method:'POST',headers:{'content-type':'application/json','idempotency-key':'test-idempotency-unique-123'},body:JSON.stringify({n})});
 const handler=async()=>{calls++;await Promise.resolve();return {ok:true};};
 const [a,b]=await Promise.all([operation(req(1),handler),operation(req(1),handler)]);expect(a.status).toBe(200);expect(b.status).toBe(200);expect(calls).toBe(1);expect((await operation(req(2),handler)).status).toBe(409);
});
