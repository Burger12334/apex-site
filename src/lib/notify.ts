// Every kind of Discord message the site sends, for the "Notifications & pings" card in the Discord settings.
// `roles` says whether the event has its own ping list there; new reports and new applications keep theirs in
// the Reports and Applications cards. `on` is the default until staff change it.
export const NOTIFY_EVENTS = [
  { key: 'report_new', group: 'channel', on: true, roles: false, label: 'New report', hint: 'Posted to the reports channel. Its ping roles are in the Reports card.' },
  { key: 'report_reply', group: 'channel', on: true, roles: true, label: 'Reporter replies in a report chat', hint: 'Posted to the reports channel with a link to the report.' },
  { key: 'report_closed', group: 'channel', on: false, roles: true, label: 'Report resolved or dismissed', hint: 'Posted to the reports channel with the decision and the reason.' },
  { key: 'app_new', group: 'channel', on: true, roles: false, label: 'New application', hint: 'Posted to the application’s channel. Ping roles are set per application in the Applications card.' },
  { key: 'app_decided', group: 'channel', on: false, roles: true, label: 'Application accepted or denied', hint: 'Posted to the application’s channel with the outcome.' },
  { key: 'expedition_new', group: 'channel', on: true, roles: true, label: 'New expedition', hint: 'Announced in the expeditions channel.' },
  { key: 'dm_chat', group: 'dm', on: true, roles: false, label: 'DM the reporter when supervision replies', hint: 'A reminder with a link to their report, not the reply itself.' },
  { key: 'dm_report', group: 'dm', on: true, roles: false, label: 'DM the reporter when their report is closed', hint: 'Tells them it was resolved or dismissed, with the reason.' },
  { key: 'dm_app', group: 'dm', on: true, roles: false, label: 'DM the applicant when they are accepted or denied', hint: 'Includes the reason you give.' },
  { key: 'role_accept', group: 'dm', on: true, roles: false, label: 'Give the Discord role when an applicant is accepted', hint: 'Uses the role set for that application in the Applications card.' },
] as const;

export type NotifyKey = (typeof NOTIFY_EVENTS)[number]['key'];
export const NOTIFY_KEYS = NOTIFY_EVENTS.map(e => e.key) as [NotifyKey, ...NotifyKey[]];
export type NotifySettings = Partial<Record<NotifyKey, { on: boolean; roles: string[] }>>;

// Whether an event is sent and who it pings. Quiet mode keeps the messages but pings nobody.
export function notifyRule(config: { notify?: NotifySettings; quiet?: boolean }, key: NotifyKey) {
  const saved = config.notify?.[key];
  return { on: saved?.on ?? NOTIFY_EVENTS.find(e => e.key === key)!.on, roles: config.quiet ? [] : saved?.roles ?? [] };
}
