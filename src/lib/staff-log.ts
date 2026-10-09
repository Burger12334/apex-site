import { logStaffAction, logVisitorEvent } from './audit-log.functions';

// Fire-and-forget helpers for the activity log. A failed log entry never interrupts what the person was doing.
export function logStaff(title: string, lines: string[] = []) {
  void logStaffAction({ data: { title, lines } }).catch(() => undefined);
}
export function logVisitor(kind: 'page' | 'instagram' | 'discord' | 'helper', detail = '') {
  void logVisitorEvent({ data: { kind, detail } }).catch(() => undefined);
}
