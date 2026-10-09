// Direct messages sent when staff decide an application or close a report.
// They go through the bot (the Lovable Discord connection, or DISCORD_BOT_TOKEN locally); the bot must
// share a server with the person and they must allow DMs from server members.

// Returns 'sent', 'unavailable' (no bot connected) or 'failed: <reason>'. Only the recipient is pinged.
export async function sendDm(userId: string, content: string) {
  const { discordFetch } = await import('./community.server');
  try {
    const dm = await discordFetch('users/@me/channels', { recipient_id: userId }) as { id: string };
    await discordFetch(`channels/${dm.id}/messages`, { content, allowed_mentions: { parse: [], users: [userId] } });
    return 'sent';
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'unknown error';
    return reason === 'Discord is not connected' ? 'unavailable' : `failed: ${reason.slice(0, 200)}`;
  }
}

const quote = (text: string) => text.split('\n').map(line => `> ${line}`).join('\n');
const withReason = (label: string, reason: string) => reason ? `\n\n**${label}**\n${quote(reason)}` : '';

export function applicationDm(application: { discord_id: string; form_title: string }, status: 'accepted' | 'denied', reason: string) {
  return status === 'accepted'
    ? `<@${application.discord_id}> Congratulations! Your application has been accepted! We appreciate you taking the time to apply and look forward to having you as part of the team. If you have any questions, feel free to reach out to a member of staff. Welcome aboard, and we look forward to seeing what you bring to the community!\n\n**Application:** ${application.form_title}${withReason('Note from staff', reason)}`
    : `<@${application.discord_id}> Thank you for applying. After careful review, your application has not been accepted at this time. We appreciate the time and effort you put into it, and you are welcome to apply again in the future. If you have any questions, feel free to reach out to a member of staff.\n\n**Application:** ${application.form_title}${withReason('Reason', reason)}`;
}

export function reportDm(report: { id: string; reporter_discord_id: string; reported_name: string }, status: 'resolved' | 'dismissed', reason: string, origin: string) {
  const outcome = status === 'resolved'
    ? `Your report about **${report.reported_name}** has been resolved by Apex supervision. Thank you for helping keep the community safe.`
    : `Your report about **${report.reported_name}** has been reviewed by Apex supervision and closed without further action.`;
  return `<@${report.reporter_discord_id}> ${outcome}${withReason('Reason', reason)}\n\nView your report: ${origin}/reports?report=${report.id}`;
}

// Gives someone a role in the Discord server. Returns 'given', 'unavailable' (no bot) or 'failed: <reason>'.
// The bot needs the Manage Roles permission, and its own role must sit above the role it gives.
export async function giveRole(userId: string, roleId: string) {
  const { discordFetch, roleGuild } = await import('./community.server');
  try {
    const guild = await roleGuild();
    if (!guild) return 'failed: no Discord server is set';
    await discordFetch(`guilds/${guild}/members/${userId}/roles/${roleId}`, undefined, 0, 'PUT');
    return 'given';
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'unknown error';
    return reason === 'Discord is not connected' ? 'unavailable' : `failed: ${reason.slice(0, 200)}`;
  }
}