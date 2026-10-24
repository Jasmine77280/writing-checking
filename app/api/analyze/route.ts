import {z} from 'zod';
import {taskSchema} from '@/lib/writewise/schema';
import {getProvider} from '@/lib/provider';
import {operation} from '@/lib/writewise/http';
export const maxDuration=60;
export async function POST(req:Request){return operation(req,async body=>{const {task}=z.object({task:taskSchema}).parse(body);return getProvider().analyzeEssay(task);});}
