import { NextResponse } from 'next/server';
import { publicConfig } from '@/lib/provider';
export const dynamic='force-dynamic';
export async function GET(){return NextResponse.json(publicConfig(),{headers:{'Cache-Control':'no-store'}});}
