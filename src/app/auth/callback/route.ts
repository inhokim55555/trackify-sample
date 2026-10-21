import {NextResponse} from 'next/server';export async function GET(){return NextResponse.json({error:'External authentication removed from public sample'},{status:403});}
