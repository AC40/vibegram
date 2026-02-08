import { InlineKeyboard } from 'grammy';
import type { Session } from '../types/session.js';

export function buildSessionListKeyboard(sessions: Session[], activeId: string | null): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const session of sessions) {
    const active = session.id === activeId ? ' (active)' : '';
    keyboard.text(
      `${session.emoji} ${session.name}${active}`,
      `switch:${session.id}`
    ).row();
  }
  return keyboard;
}

export function buildSessionDeleteKeyboard(sessions: Session[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const session of sessions) {
    keyboard.text(
      `${session.emoji} ${session.name}`,
      `delete:${session.id}`
    ).row();
  }
  keyboard.text('Cancel', 'cancel_action');
  return keyboard;
}

export function buildDirectoryKeyboard(dirs: string[], currentPath: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const dir of dirs.slice(0, 8)) {
    keyboard.text(`📁 ${dir}`, `cd:${currentPath}/${dir}`).row();
  }

  if (currentPath !== '/') {
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    keyboard.text('⬆️ Parent', `cd:${parent}`).row();
  }

  keyboard.text(`✅ Select: ${currentPath}`, `select_dir:${currentPath}`).row();
  return keyboard;
}

export function buildPermissionModeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Default', 'mode:default')
    .text('Accept Edits', 'mode:acceptEdits')
    .row()
    .text('Plan', 'mode:plan')
    .text("Don't Ask", 'mode:dontAsk');
}

export function buildNotificationKeyboard(current: string): InlineKeyboard {
  const mark = (mode: string) => (mode === current ? '✓ ' : '');
  return new InlineKeyboard()
    .text(`${mark('smart')}Smart`, 'notify:smart')
    .text(`${mark('all')}All`, 'notify:all')
    .text(`${mark('none')}None`, 'notify:none');
}

export function buildVerbosityKeyboard(current: string): InlineKeyboard {
  const mark = (mode: string) => (mode === current ? '✓ ' : '');
  return new InlineKeyboard()
    .text(`${mark('minimal')}Minimal`, 'verbosity:minimal')
    .text(`${mark('normal')}Normal`, 'verbosity:normal')
    .text(`${mark('verbose')}Verbose`, 'verbosity:verbose');
}

export function buildVisibilityKeyboard(current: string): InlineKeyboard {
  const mark = (mode: string) => (mode === current ? '✓ ' : '');
  return new InlineKeyboard()
    .text(`${mark('show_all')}Show All`, 'visibility:show_all')
    .text(`${mark('active_only')}Active Only`, 'visibility:active_only');
}

export function buildSettingsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔔 Notifications', 'settings:notifications').row()
    .text('📝 Verbosity', 'settings:verbosity').row()
    .text('👁 Cross-session', 'settings:visibility').row()
    .text('🔒 Permission Mode', 'settings:mode');
}

export function buildConfirmKeyboard(action: string, targetId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirm', `confirm:${action}:${targetId}`)
    .text('❌ Cancel', 'cancel_action');
}
