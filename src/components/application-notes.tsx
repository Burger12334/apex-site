import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LockKeyhole, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useApexAuth } from '@/lib/apex-context';
import { logStaff } from '@/lib/staff-log';
export function ApplicationNotes({ submissionId }: { submissionId: string }) {
  const { user } = useApexAuth(); const qc = useQueryClient(); const [text, setText] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const notes = useQuery({ queryKey: ['application-notes', submissionId, user?.id], queryFn: async () => { const { data, error } = await supabase.from('application_notes').select('*').eq('submission_id', submissionId).order('created_at'); if (error) throw error; return data; } });
  return <section className="private-notes"><h3><LockKeyhole size={16} />Private reviewer notes</h3>{notes.isError && <p role="alert">Could not load notes.</p>}{notes.data?.map(n => <div className="note-entry" key={n.id}><small>{n.author_email} · {new Date(n.created_at).toLocaleString()}</small><p>{n.body}</p></div>)}<form className="editor-form" onSubmit={async e => { e.preventDefault(); if (!user || !text.trim()) return; setBusy(true); const { error } = await supabase.from('application_notes').insert({ submission_id: submissionId, author_id: user.id, author_email: user.email ?? '', body: text.trim() }); setBusy(false); setError(error?.message ?? ''); if (!error) { logStaff('Staff note added to an application'); setText(''); await qc.invalidateQueries({ queryKey: ['application-notes', submissionId] }); } }}><label>Add context<textarea rows={3} maxLength={4000} required value={text} onChange={e => setText(e.target.value)} /></label><Button disabled={busy || !text.trim()}><Plus />Add private note</Button></form>{error && <p role="alert">{error}</p>}</section>;
}
