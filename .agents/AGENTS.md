# AI Behavior Rules

The following rules must be strictly adhered to by any agent or subagent working in this workspace.

## 1. Mandatory Git Push
- Whenever you modify, create, or delete any files in this project repository, you MUST automatically run `git add`, `git commit` (with a descriptive message), and `git push` using the `run_command` tool.
- Do not wait for the user to ask you to commit and push. Do it immediately after completing your edits.

## 2. Server Commands Delivery
- The user operates a remote VPS over SSH. You do NOT have terminal access to the user's VPS (your `run_command` tool runs on the local Windows machine).
- Whenever you need the user to run commands on their remote VPS, you MUST provide ALL the commands consolidated into a **single markdown `bash` code block** at the very end of your message.
- This allows the user to click "Copy" once and paste everything into their SSH terminal.
- Add descriptive `# comments` inside the bash block explaining what each step does.
