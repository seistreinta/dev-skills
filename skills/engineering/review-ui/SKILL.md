---
name: review-ui
description: "Review the UI in the current change against a checklist of common component rules (debounce, search focus, bound defaults, clear errors, loading/empty states, feedback). It previews the discrepancies, asks you rule by rule whether each one applies, shows a plain-language summary, and only if you confirm applies the fixes for the ones you marked applicable — using the context you gave — then reports what it changed. Use in step 5 (Review), after /code-review and before the Functional Review, opening the PR, or closing the ticket."
disable-model-invocation: true
---

Reviews the UI in the diff against a checklist of common component rules. It works in two halves: first a **preview** of discrepancies you walk through, then — only if you confirm — a **guided apply** of the fixes you approved.

Unlike `/code-review`, it doesn't end in a verdict. Each finding is a question you answer, because many of these rules depend on what Figma, the user story, and the business defined, and that isn't in the code. You have that context; the skill doesn't. It never changes code until you explicitly tell it to, and it only ever touches the rules you marked as applicable.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point (a commit SHA, branch, tag, `main`, `HEAD~5`). If they didn't specify one, ask.

Capture the diff once: `git diff <fixed-point>...HEAD` (three-dot, against the merge-base). Confirm the ref resolves (`git rev-parse <fixed-point>`) and the diff is non-empty before going further. Limit attention to UI files in the diff (components, views, forms). If the change has no UI, say so and stop.

### 2. Run the checklist

For each rule in **Checklist**, scan the UI hunks of the diff. For every possible breach, note the file + line (or component) and what the rule expects. Findings are hypotheses with a citation; read the component before trusting them.

### 3. Ask the developer, rule by rule

Present findings in rounds. For each one: state the discrepancy and its location, then ask **"Does this rule apply here? [yes / no / not by design (Figma, story, business)]"**. In the same answer the developer can add project knowledge they hold ("this edit screen defines no unsaved-changes alert in the story", "that message is already controlled from the backend"). Record the decision and the note.

### 4. Summarize what was decided

Show a short, plain-language recap the developer can scan: each finding, its location, and what was decided — applies, or not-applicable with the reason, plus any context the developer added. No jargon; the point is that the developer sees clearly what would change before anything is touched.

### 5. Ask whether to apply

Ask the developer: apply the fixes for the applicable findings, using the information you gave? If the answer is no, stop here — the preview is the deliverable. If yes, continue.

### 6. Apply and confirm

Apply fixes only for the rules marked applicable, guided by the developer's notes. Never touch a rule marked not-applicable. Make small, reviewable edits, one finding at a time. When done, report what changed, per file, so the developer can review it (and run `/code-review` or the tests over it). Optionally record the not-applicable decisions in `docs/agents/review-ui.md` so a later run doesn't re-flag them.

## Checklist

Only generic rules, evaluable in any project. Each reads *what it is* → *what to flag*.

**Inputs and forms**

- **Debounce**: inputs that trigger a backend query or costly compute debounce at 500 ms. → flag an immediate call on every keystroke.
- **Search focus**: a search input keeps focus when backend results return. → flag a re-render that remounts the input and drops focus.
- **Bound default**: a value shown as selected by default (radio, pill, select, checkbox) is bound to form state from the first render. → flag a default that only registers after an explicit click.
- **No silent empties**: the form doesn't push empty/`null` values on load. → flag state seeded with blanks the user didn't choose.
- **Clear required**: required fields are marked and show a clear message on the field itself. → flag generic or missing messages.
- **Explained disable**: a disabled submit button lets the user know why. → flag a dead button with no hint.
- **Double-submit guard**: submit is disabled or shows loading while the request is in flight. → flag a button that can fire twice.
- **Unsaved changes**: leaving warns and stale data isn't sent; the "unsaved" indicator isn't lost. → flag silent loss.

**Loading, empty, and error states**

- **Loading**: every fetch shows a visible loading state (spinner/skeleton). → flag a blank screen.
- **Empty**: an explicit empty state ("no results") instead of a blank list/table. → flag the blank.
- **Clear errors**: network/server errors show an actionable message in the product's language. A controlled message the frontend handles is fine even if it originates in the backend; flag only the **raw or untranslated** error reaching the user (stack trace, Prisma error, technical code, English text).
- **No layout shift**: the layout doesn't jump when validation or error messages appear. → flag missing reserved space.

**Lists and tables**

- **Live list**: deleting or editing an item updates the list without a manual reload, and no "ghost" item survives a reload. → flag stale lists.

**Interaction and feedback**

- **Destructive confirm**: destructive actions ask for confirmation.
- **Action feedback**: every action gives success/failure feedback; nothing silent.
- **No repeat fire**: repeated clicks don't trigger the action several times.

**Consistency and content**

- **Copy**: new copy has no typos and is in the product's language.
- **Terminology**: terms match the project's `CONTEXT.md` glossary.

## Why it asks before applying

Each rule describes a common behavior, not a law. If Figma, the user story, or the business didn't define it, applying it would alter established behavior — **Unsaved changes** is the clear case: some edit screens carry no such alert by design. So the skill previews first, confirms with you, and only applies what you marked applicable; the not-applicable ones are never touched.

It complements `/code-review` (standards and spec), it doesn't replace it; both run before the Functional Review. Findings are hypotheses, and so are the fixes — review the edits it makes before you ship them, and don't loop it to zero findings, because it won't converge.
