import {z} from 'zod';
import {taskSchema,reviewSchema} from '@/lib/writewise/schema';
import {finalizeReview,contextHash} from '@/lib/writewise/validation';
import {getProvider,ProviderError} from '@/lib/provider';
import {operation} from '@/lib/writewise/http';
export const maxDuration=60;
export async function POST(req:Request){return operation(req,async body=>{const {before,after,beforeReview,afterReview}=z.object({before:taskSchema,after:taskSchema,beforeReview:reviewSchema,afterReview:reviewSchema}).parse(body);if(contextHash(before)!==contextHash(after))throw new ProviderError('CONTEXT','题目与规则改变，不能直接比较。',409);const r=finalizeReview(beforeReview,before,beforeReview.metadata.provider,beforeReview.metadata.model),next=finalizeReview(afterReview,after,afterReview.metadata.provider,afterReview.metadata.model);return getProvider().compareDrafts(before,after,r,next);});}
