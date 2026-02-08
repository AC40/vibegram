export type SessionStatus = 'idle' | 'processing' | 'awaiting_input';

export interface Session {
  readonly id: string;
  readonly userId: number;
  name: string;
  cwd: string;
  readonly emoji: string;
  claudeSessionId: string | null;
  status: SessionStatus;
  permissionMode: string;
  readonly createdAt: string;
  lastActiveAt: string;
}

export type Verbosity = 'minimal' | 'normal' | 'verbose';
export type NotificationMode = 'smart' | 'all' | 'none';
export type CrossSessionVisibility = 'show_all' | 'active_only';

export interface UserSettings {
  readonly userId: number;
  defaultDirectory: string;
  verbosity: Verbosity;
  notificationMode: NotificationMode;
  crossSessionVisibility: CrossSessionVisibility;
  defaultPermissionMode: string;
}

export interface BufferedMessage {
  readonly sessionId: string;
  readonly text: string;
  readonly timestamp: number;
  readonly disableNotification: boolean;
}
