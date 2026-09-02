# AI Behavior Rules

The following rules must be strictly adhered to by any agent or subagent working in this workspace.

## 1. Mandatory Git Push
- Whenever you modify, create, or delete any files in this project repository, you MUST automatically run git commit and push using the `run_command` tool.
- **CRITICAL COMMAND FORMAT**: The command line string MUST ALWAYS BE EXACTLY:
  `git add -A ; git commit -m "update" ; git push origin main`
- **NEVER change the commit message or syntax in this command.** Keeping this exact identical command line string is STRICTLY REQUIRED so that the user's IDE permission whitelist recognizes it every time and does not interrupt the user for manual approval.
- Do not wait for the user to ask you to commit and push. Do it immediately after completing your edits.

## 2. Server Commands Delivery
- The user operates a remote VPS over SSH. You do NOT have terminal access to the user's VPS (your `run_command` tool runs on the local Windows machine).
- Whenever you need the user to run commands on their remote VPS, you MUST provide ALL the commands consolidated into a **single markdown `bash` code block** at the very end of your message.
- This allows the user to click "Copy" once and paste everything into their SSH terminal.
- Add descriptive `# comments` inside the bash block explaining what each step does.
- You must ALWAYS include the `clear` command at the very beginning of the bash script block so the terminal is cleared before execution.

## 3. Autonomous End-to-End Execution (Proactive / No Hand-Holding)
- **Zero Interruption**: When a task, bug, or feature request is received, do not stop to ask trivial clarification questions or request permission for obvious steps. Act autonomously to research, plan, implement, and verify the entire solution end-to-end.
- **Root Cause Resolution**: When fixing a bug, do not apply quick superficial band-aids. Track down the root cause across all relevant files (Frontend, Backend, Database, Python Bot, Redis) and fix the entire flow.
- **Proactive Verification**: Before committing any code, ALWAYS run TypeScript validation (`tsc --noEmit`) to guarantee zero compilation errors across `@casino/shared`, `@casino/backend`, and `@casino/frontend`.
- **Parallel Subagents**: For complex, multi-component tasks (e.g. creating a new game, deep architectural refactoring, heavy UI + backend rewrites), proactively invoke specialized subagents (`invoke_subagent`) to work concurrently on frontend, backend, or research.

## 4. Key Project Invariants
- **Financial Pipeline**: All balance mutations (bets, wins, refunds, cashouts) MUST go strictly through `bettingPipeline` with atomic database transactions. Never mutate user balances directly in raw queries without auditing.
- **Sports Odds & Settlement**: Quoted ticket odds MUST be permanently locked in `leg.odds` upon bet placement. Max single odds and max combined express odds MUST NOT exceed 35.00.
- **Notification Hygiene**: Telegram notifications must never spam point-by-point (no spam for basketball points, Dota 2 kills, CS rounds). Goal alerts must always include an inline toggle button.
