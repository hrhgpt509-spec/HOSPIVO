# Hospivo - Agent rules (read at the start of EVERY chat)

1. First read project-memory/PROGRESS.md and project-memory/RULES.md.
   Read PROJECT_BRIEF.md, DECISIONS.md, DESIGN_MAP.md only when the task needs them.
2. One task per chat. Do ONLY what the prompt asks. Do not refactor or touch files that are not listed.
3. Designs: use local files in /designs first. Use the Stitch MCP ONLY when the prompt names the screens,
   and save what you pull into /designs/<phase>/ so it never has to be pulled again.
4. The owner is NOT a programmer. Final answer = short, simple words: what you did, and how to check it.
5. Never invent a business rule. If something is unclear, ask the owner one short question.
6. Never put passwords, PINs or API keys in code or in Git.
7. Before finishing: run the build (and tests if they exist), then add 3-5 lines to PROGRESS.md.
8. Keep replies short. No long plans unless asked.
## Design fidelity rule (very important)
- The owner's Stitch screens are the exact design. Do NOT redesign, "improve", simplify or restyle.
- Start from the saved HTML in /designs/<phase>/. Keep the same layout, spacing, colours, fonts, icon style,
  sizes and Hindi/English text. Only change it to make it work (data, buttons, logic).
- Use the colours and fonts found inside the Stitch code. Do not invent new ones.
- Phone screens (390x844) and desktop screens are separate designs. Match each one.
- If the design conflicts with a rule in RULES.md, do NOT choose silently. Tell the owner in one line and ask.
- If a design detail is missing, ask the owner. Do not guess.
## Save the owner's credits
- Do NOT open a browser, take screenshots, or run browser tests. The owner checks the screen by eye.
- Do NOT run lint or tests unless the prompt asks. Run only "npm run build".
- Do NOT re-read files you do not need. Read only the files named in the prompt.
- Build 2-4 closely related screens per prompt when told to, never the whole app.
- If a step fails twice, STOP and explain in simple words. Do not keep trying.

## Words and languages
- Never type visible words directly inside a screen. Every label, message, hint and button text comes from src/i18n (en.ts = DEFAULT, hi.ts = Hindi in Devanagari script, hinglish.ts = Hindi in English letters) through t("key").
- Every new text needs all three versions at the same time. Stored data (audit log, records) uses fixed English codes, never translated sentences.

## Sample data
- Stitch designs contain example data. Never copy it into the app as real data. Forms start empty; examples may only be grey placeholders.

## Converting Stitch HTML to React
- Use React names, not HTML names: className, strokeWidth, strokeLinecap, strokeLinejoin, fillRule, clipRule, viewBox.
- The browser console must show no red errors after a screen is built.