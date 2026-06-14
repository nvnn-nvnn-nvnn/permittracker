
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, requireEnv } from "@/lib/env";



export function getSupabaseAdmin(){

    return createClient(
        publicEnv.NEXT_PUBLIC_SUPABASE_URL,
        requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
        { auth: { persistSession: false } },
    )




    

}