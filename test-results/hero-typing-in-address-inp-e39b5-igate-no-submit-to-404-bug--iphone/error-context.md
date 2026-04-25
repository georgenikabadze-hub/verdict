# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hero.spec.ts >> typing in address input does not navigate (no submit-to-404 bug)
- Location: e2e/hero.spec.ts:46:5

# Error details

```
Error: browserType.launch: Executable doesn't exist at /Users/georgenikabadze/Library/Caches/ms-playwright/webkit-2272/pw_run.sh
╔════════════════════════════════════════════════════════════╗
║ Looks like Playwright was just installed or updated.       ║
║ Please run the following command to download new browsers: ║
║                                                            ║
║     pnpm exec playwright install                           ║
║                                                            ║
║ <3 Playwright Team                                         ║
╚════════════════════════════════════════════════════════════╝
```