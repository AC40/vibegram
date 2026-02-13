# Systemd Service Configuration

The VibeGram systemd service should be configured WITHOUT memory limits
to prevent Claude from hitting cgroup constraints and entering D-state.

## Service File Location

```bash
~/.config/systemd/user/vibegram.service
# or
/etc/systemd/user/vibegram.service
```

## Recommended Configuration

```ini
[Unit]
Description=VibeGram - Telegram bot for Claude Code sessions
After=network.target

[Service]
Type=simple
ExecStart=/path/to/node /path/to/vibegram/dist/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=vibegram

# Environment
Environment=NODE_ENV=production
Environment=HOME=/root
Environment=USER=root

# IMPORTANT: Do NOT set memory limits
# Claude requires significant memory for context caching
# and can easily exceed 256MB, causing D-state hangs
# MemoryHigh=256M  # <- REMOVE THIS
# MemoryMax=512M   # <- REMOVE THIS

[Install]
WantedBy=default.target
```

## Troubleshooting

### Problem: Claude processes hang in D-state (uninterruptible sleep)

**Symptoms:**
- Bot stops responding to messages
- Claude processes show state 'D' in ps aux
- Cannot kill processes even with SIGKILL
- Stack trace shows: `mem_cgroup_handle_over_high`

**Diagnosis:**
```bash
# Check process state
cat /proc/<PID>/stat | grep -oP '\d+ \([^)]+\) \K[A-Za-z]'

# Check stack trace
cat /proc/<PID>/stack
```

**Solution:**
Remove memory limits from the systemd service file:
```bash
systemctl --user stop vibegram
# Edit ~/.config/systemd/user/vibegram.service
# Comment out or remove MemoryHigh and MemoryMax lines
systemctl --user daemon-reload
systemctl --user start vibegram
```
