import type { BotContext } from '../bot.js';
import { executeBashCommand } from '../services/bash-executor.js';
import * as sessionManager from '../core/session-manager.js';
import { postfixEmoji } from '../telegram/renderer.js';

export async function handleBashCommand(ctx: BotContext, command: string): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    await ctx.reply('No active session. Use /new to create one.');
    return;
  }

  const result = await executeBashCommand(command, session.cwd);

  const emoji = session.emoji;
  if (result.blocked) {
    await ctx.reply(postfixEmoji(`🚫 Blocked: ${result.reason}`, emoji));
    return;
  }

  const output = result.output?.trim() || '(no output)';
  const truncated = output.length > 3500 ? output.slice(0, 3500) + '\n... (truncated)' : output;
  const exitCode = result.exitCode === 0 ? '' : `\nExit code: ${result.exitCode}`;

  await ctx.reply(postfixEmoji(`\`\`\`\n$ ${command}\n${truncated}${exitCode}\n\`\`\``, emoji), {
    parse_mode: 'MarkdownV2',
  }).catch(async () => {
    // Fallback without markdown
    await ctx.reply(postfixEmoji(`$ ${command}\n${truncated}${exitCode}`, emoji));
  });
}
