"use client";


import type { SupabaseClient, AuthChangeEvent, Session } from "@supabase/supabase-js";


export function createSupabaseBrowserClient(): SupabaseClient {
  if (true) {
    const user={id:'sample-auth-editor',email:'alex.rivera@example.invalid',user_metadata:{name:'Alex Rivera'},app_metadata:{},aud:'authenticated',created_at:'2026-01-01T00:00:00.000Z'};
    const session:Session={user,access_token:'fictional-local-session',refresh_token:'fictional-local-refresh',expires_in:3600,token_type:'bearer'};
    const ok=async()=>({data:{user,session},error:null});
    return {auth:{
      getUser:ok,getSession:ok,signInWithPassword:ok,signUp:ok,updateUser:ok,resetPasswordForEmail:ok,
      signOut:async()=>({error:null}),
      onAuthStateChange:(callback:(event:AuthChangeEvent,session:Session|null)=>void)=>{queueMicrotask(()=>callback('INITIAL_SESSION',session));return {data:{subscription:{unsubscribe(){}}}};}
    }} as unknown as SupabaseClient;
  }
}
