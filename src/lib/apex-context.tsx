import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';
const Context = createContext<{user: User | null; ready: boolean}>({user:null,ready:false});
export const useApexAuth = () => useContext(Context);
export function ApexAuthProvider({children}:{children:ReactNode}) {
 const [user,setUser]=useState<User|null>(null); const [ready,setReady]=useState(false); const qc=useQueryClient();
 useEffect(()=>{supabase.auth.getUser().then(({data})=>{setUser(data.user);setReady(true)}); const {data}=supabase.auth.onAuthStateChange((event,session)=>{ if(['SIGNED_IN','SIGNED_OUT','USER_UPDATED','INITIAL_SESSION'].includes(event)){setUser(session?.user??null);setReady(true);if(event==='SIGNED_OUT')qc.removeQueries({queryKey:['role']});else if(event!=='INITIAL_SESSION')void qc.invalidateQueries();}});return ()=>data.subscription.unsubscribe();},[qc]);
 return <Context.Provider value={{user,ready}}>{children}</Context.Provider>;
}
