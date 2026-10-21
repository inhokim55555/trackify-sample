import type {User as SupabaseUser} from '@supabase/supabase-js';import {prisma} from '@/lib/db';
export async function getCurrentUserContext(){const user=await prisma.user.findUniqueOrThrow({where:{id:'sample-editor'},include:{organisation:true}});return {authUser:{id:user.supabaseUserId,email:user.email,user_metadata:{name:user.name},app_metadata:{},aud:"authenticated",created_at:"2026-01-01T00:00:00Z"} as SupabaseUser,user,org:user.organisation};}
export const requireAdmin=getCurrentUserContext;export const requireEditor=getCurrentUserContext;
