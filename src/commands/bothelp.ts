import type { BotContext } from '../bot.js';

const HELP_TEXT = `*Vibegram — Codex & Claude via Telegram*

*Session Management*
/new [backend] [name] — Create a new session
/sessions — List all sessions
/switch — Switch active session
/delete — Delete a session
/rename [name] — Rename active session
/cd [path] — Change working directory
/clear — Reset current conversation
/status — Show session info
/querystatus — Show processing status

*Backend Control*
/cancel — Abort current query + clear queue
/mode — Set permission mode
Plain text → Sent to active backend
!command → Run bash command

*History & Tracking*
/history — Browse conversation history
/search [query] — Search across sessions
/tools — View recent tool invocations
/costs — View API cost summary

*Settings*
/settings — All settings menu
/verbosity — Output detail level
/notifications — Notification sounds
/bothelp — This help message

*Input Types*
Text — Sent to active session
!command — Direct bash execution
Voice — Transcribed then sent to backend
Photo — Analyzed by backend
Document — Content sent to backend`;

export async function bothelpCommand(ctx: BotContext): Promise<void> {
  await ctx.reply(HELP_TEXT);
}
