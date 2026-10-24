'use client';
import {sources,type Evidence,type TaskInput} from '@/lib/writewise/schema';
export default function EvidenceView({task,evidence}:{task:TaskInput;evidence:Evidence[]}){
 const texts=sources(task);
 if(!evidence.length)return <p className="muted">未找到足够的直接引文；缺失要点请结合题目要求人工核对。</p>;
 return <div className="evidence-list">{evidence.map((e,i)=><details key={e.id+'-'+i}><summary><span className="tag">{e.sourceId==='reading'?'故事原文':e.sourceId==='prompt'?'题目要求':e.sourceId.startsWith('starter:')?'给定段首句':'学生正文'}</span> {e.quote}</summary><div className="original source-context">{texts[e.sourceId]?.slice(0,e.start)}<mark>{texts[e.sourceId]?.slice(e.start,e.end)}</mark>{texts[e.sourceId]?.slice(e.end)}</div></details>)}</div>;
}
