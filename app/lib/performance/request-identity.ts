import 'server-only'
import type {SupabaseClient} from '@supabase/supabase-js'
import {requestRead} from './request-timing'
export const requestUser=(db:SupabaseClient)=>requestRead(db,'user',()=>db.auth.getUser())
