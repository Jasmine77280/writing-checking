import {z} from 'zod';
import {taskSchema,reviewSchema} from '@/lib/writewise/schema';
import {finalizeReview} from '@/lib/writewise/validation';
import {getProvider,ProviderError} from '@/lib/provider';
import {operation} from '@/lib/writewise/http';
export const maxDuration=60;
export async function POST(req:Request){return operation(req,async body=>{const {task,review,issueId,level}=z.object({task:taskSchema,review:reviewSchema,issueId:z.string(),level:z.union([z.literal(1),z.literal(2),z.literal(3)])}).parse(body);const r=finalizeReview(review,task,review.metadata.provider,review.metadata.model);const issue=r.issues.find(i=>i.id===issueId);if(!issue)throw new ProviderError('INPUT','问题不属于当前批改。',400);return getProvider().generateHint(task,issue,level);});}
