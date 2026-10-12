import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { X } from 'lucide-react';
import { DiscordAvatar } from '@/components/community';
import { discordPerson } from '@/lib/members.functions';

export type PickedPerson = { id: string; username: string; avatar_url: string };

// A box that takes Discord user IDs and fills in the person: paste an ID and their name and picture appear.
// Plain names are accepted too (press Enter), for people without a Discord ID to hand.
// The chosen people are submitted with the form as JSON under `name`; with `single` it holds one person.
export function DiscordPicker({ name, placeholder, single = false, required = false, initial = [] }: { name: string; placeholder?: string; single?: boolean; required?: boolean; initial?: PickedPerson[] }) {
  const lookup = useServerFn(discordPerson);
  const [people, setPeople] = useState<PickedPerson[]>(initial);
  const [text, setText] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const add = (p: PickedPerson) => setPeople(list => single ? [p] : list.some(x => (p.id && x.id === p.id) || (!p.id && x.username === p.username)) ? list : [...list, p]);

  async function take(raw: string) {
    const value = raw.trim().replace(/,$/, '').trim();
    if (!value) return;
    if (!/^\d{17,20}$/.test(value)) {
      if (/^\d+$/.test(value)) { setNote('A Discord ID has 17 to 20 digits.'); return; }
      add({ id: '', username: value, avatar_url: '' }); setText(''); setNote(''); return;
    }
    setBusy(true); setNote('Looking up that ID…');
    try {
      const person = await lookup({ data: value });
      if (!person) { setNote('No Discord user has that ID.'); return; }
      add({ id: person.id, username: person.username, avatar_url: person.avatar_url }); setText(''); setNote('');
    } catch (e) { setNote(e instanceof Error ? e.message : 'Could not look up that ID.'); } finally { setBusy(false); }
  }
  // A pasted or fully typed ID is looked up straight away; names wait for Enter or a comma.
  function change(value: string) { setText(value); setNote(''); if (/^\s*\d{17,20}\s*$/.test(value)) void take(value); }

  return <div className="discord-picker">
    <input type="hidden" name={name} value={JSON.stringify(people)} />
    {people.length > 0 && <div className="picker-people">{people.map(p => <span key={p.id || p.username} className="picker-person"><DiscordAvatar user={p} /><span>{p.id ? `@${p.username}` : p.username}</span><button type="button" aria-label={`Remove ${p.username}`} onClick={() => setPeople(list => list.filter(x => x !== p))}><X /></button></span>)}</div>}
    {!(single && people.length > 0) && <input value={text} disabled={busy} required={required && people.length === 0} inputMode="text" placeholder={placeholder ?? 'Paste a Discord user ID'} onChange={e => change(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); void take(text); } }} onBlur={() => { if (text.trim()) void take(text); }} />}
    {note && <small className="field-hint">{note}</small>}
  </div>;
}

export function readPicked(value: FormDataEntryValue | null): PickedPerson[] {
  try { return JSON.parse(String(value ?? '[]')) as PickedPerson[]; } catch { return []; }
}
