import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { BellOff, BellRing, MessagesSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reportMessages, sendReportMessage, type ChatSide } from '@/lib/report-chat.functions';

// Chat on one report. `as` is the side this page is acting for; the server checks it.
export function ReportChat({ reportId, as }: { reportId: string; as: ChatSide }) {
  const qc = useQueryClient();
  const load = useServerFn(reportMessages); const send = useServerFn(sendReportMessage);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const messages = useQuery({ queryKey: ['report-chat', reportId, as], refetchInterval: 10000, queryFn: () => load({ data: { id: reportId, as } }) });
  const log = useRef<HTMLDivElement>(null);
  const count = messages.data?.length ?? 0;
  // Keep the newest message in view inside the chat box without scrolling the page or panel around it.
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [count]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const body = String(new FormData(form).get('body')).trim();
    if (!body) return;
    setBusy(true); setError('');
    try { await send({ data: { id: reportId, as, body } }); form.reset(); await qc.invalidateQueries({ queryKey: ['report-chat', reportId] }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not send the message.'); } finally { setBusy(false); }
  }

  return <div className="report-chat">
    <h3><MessagesSquare />Chat with {as === 'supervision' ? 'the reporter' : 'supervision'}</h3>
    <div className="chat-log" aria-live="polite" ref={log}>
      {messages.isLoading ? <p className="chat-empty">Loading messages…</p> : messages.error ? <p className="chat-empty">{messages.error.message}</p> : count === 0 ? <p className="chat-empty">{as === 'supervision' ? 'No messages yet. Your reply sends the reporter a Discord DM reminder.' : 'No messages yet. Supervision will reply here.'}</p>
        : messages.data?.map(m => <div key={m.id} className={`chat-message ${m.author_role} ${m.author_role === as ? 'mine' : ''}`}>
          <div className="chat-meta"><strong>{m.author_role === 'supervision' ? 'Supervision' : 'Reporter'}</strong>{as === 'supervision' && <span>@{m.author_username}</span>}<time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</time></div>
          <p>{m.body}</p>
          {m.dm_status && <small className={`chat-dm ${m.dm_status === 'sent' ? 'sent' : ''}`}>{m.dm_status === 'sent' ? <><BellRing />Reminder DM sent</> : <><BellOff />{m.dm_status === 'unavailable' ? 'No DM sent: no Discord bot is connected here' : `DM ${m.dm_status}`}</>}</small>}
        </div>)}
    </div>
    <form className="chat-form" onSubmit={submit}><textarea name="body" required maxLength={2000} rows={2} placeholder={as === 'supervision' ? 'Reply to the reporter…' : 'Message supervision…'} aria-label="Message" /><Button disabled={busy}><Send />{busy ? 'Sending…' : 'Send'}</Button></form>
    {error && <p role="alert" className="chat-error">{error}</p>}
  </div>;
}
