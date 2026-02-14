import type { BotContext } from '../bot.js';

const HELP_TEXT = `*Vibegram — Claude Code via Telegram*

*Session Management*
/new [name] — Create a new session
/sessions — List all sessions
/switch — Switch active session
/delete — Delete a session
/rename [name] — Rename active session
/cd [path] — Change working directory
/clear — Reset Claude conversation
/status — Show session info
/querystatus — Show processing status

*Claude Control*
/cancel — Abort current query + clear queue
/mode — Set permission mode
Plain text → Sent to Claude
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
Text — Sent to active Claude session
!command — Direct bash execution
Voice — Transcribed then sent to Claude
Photo — Analyzed by Claude
Document — Content sent to Claude`;

export async function bothelpCommand(ctx: BotContext): Promise<void> {
  await ctx.reply(HELP_TEXT);
}
