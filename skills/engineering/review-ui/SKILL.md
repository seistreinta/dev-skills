---
name: review-ui
description: "Review the UI in the current change against a checklist of common component rules (debounce, stale responses, bound defaults, clear errors, loading/empty/error states, lists, feedback, basic a11y, formatting). Each rule carries an ID and a static/manual tag. It previews the discrepancies, asks you rule by rule whether each one applies, shows a plain-language summary, and only if you confirm applies the fixes for the ones you marked applicable — using the context you gave — then reports what it changed. Use in step 5 (Review), after /code-review and before the Functional Review, opening the PR, or closing the ticket."
disable-model-invocation: true
---

Reviews the UI in the diff against a checklist of common component rules. It works in two halves: first a **preview** of discrepancies you walk through, then — only if you confirm — a **guided apply** of the fixes you approved.

Unlike `/code-review`, it doesn't end in a verdict. Each finding is a question you answer, because many of these rules depend on what Figma, the user story, and the business defined, and that isn't in the code. You have that context; the skill doesn't. It never changes code until you explicitly tell it to, and it only ever touches the rules you marked as applicable.

Each rule is tagged by how it can be checked: **🔍 static** (verifiable in the diff) or **👁 manual** (visual or behavioral — the skill flags it as a hint, you confirm it). Manual findings are always hypotheses; a static finding still deserves a look at the component before acting.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point (a commit SHA, branch, tag, `main`, `HEAD~5`). If they didn't specify one, ask.

Capture the diff once: `git diff <fixed-point>...HEAD` (three-dot, against the merge-base). Confirm the ref resolves (`git rev-parse <fixed-point>`) and the diff is non-empty before going further. Limit attention to UI files in the diff (components, views, forms). If the change has no UI, say so and stop.

### 2. Run the checklist

For each rule in **Checklist**, scan the UI hunks of the diff. For a **🔍 static** rule, cite the file + line. For a **👁 manual** rule, point at the component and say it needs a visual/behavioral check — don't assert it's broken from the code alone. Every finding carries its rule ID.

### 3. Ask the developer, rule by rule

Present findings in rounds. For each one: give its ID, state the discrepancy and its location, then ask **"Does this rule apply here? [yes / no / not by design (Figma, story, business)]"**. In the same answer the developer can add project knowledge they hold ("this edit screen defines no unsaved-changes alert in the story", "that message is already controlled from the backend"). Record the decision and the note.

### 4. Summarize what was decided

Show a short, plain-language recap the developer can scan: each finding by ID and tag (🔍/👁), its location, and what was decided — applies, or not-applicable with the reason, plus any context the developer added. No jargon; the point is that the developer sees clearly what would change before anything is touched.

### 5. Ask whether to apply

Ask the developer: apply the fixes for the applicable findings, using the information you gave? If the answer is no, stop here — the preview is the deliverable. If yes, continue.

### 6. Apply and confirm

Apply fixes only for the rules marked applicable, guided by the developer's notes. Never touch a rule marked not-applicable. Make small, reviewable edits, one finding at a time. When done, report what changed, per file, so the developer can review it (and run `/code-review` or the tests over it). Optionally record the not-applicable decisions in `docs/agents/review-ui.md` so a later run doesn't re-flag them.

## Checklist

Only generic rules, evaluable in any project. Tags: **🔍 static** (checkable in the diff) · **👁 manual** (the skill flags it, you confirm visually).

**A. Inputs and forms**

- `UI-01` 🔍 **Debounce** — inputs that trigger a backend query or costly compute debounce (project standard; 500 ms by default).
- `UI-02` 🔍 **Stale responses** — search/autocomplete cancels or ignores out-of-order responses (last one wins).
- `UI-03` 👁 **Search focus** — the search input keeps focus when backend results return.
- `UI-04` 🔍 **Bound default** — a value shown as selected by default (radio/pill/select/checkbox) is bound to form state from the first render, with no extra click.
- `UI-05` 🔍 **No silent empties** — the form doesn't push empty/`null` values on load.
- `UI-06` 🔍 **Clear required** — required fields are marked and show a clear message on the field itself.
- `UI-07` 👁 **Explained disable** — a disabled submit button lets the user know why.
- `UI-08` 🔍 **Idempotent click** — an action fires at most once; the control disables or shows loading while the request is in flight.
- `UI-09` 👁 **Warn on leave** — leaving with unsaved changes warns the user.
- `UI-10` 🔍 **No stale submit** — stale data isn't sent; the "unsaved" indicator reflects the real state.

**B. Loading, empty, and error states**

- `UI-11` 👁 **Loading** — initial load and user actions show a loading state (spinner/skeleton); background refetches don't flash it.
- `UI-12` 👁 **Empty** — an explicit empty state ("no results") instead of a blank list/table.
- `UI-13` 🔍 **Clear errors** — network/server errors show an actionable message in the product's language. A controlled frontend message is fine even if the backend originates it; flag only the **raw or untranslated** error reaching the user (stack trace, Prisma error, technical code, English text).
- `UI-14` 👁 **No layout shift** — the layout doesn't jump when validation/error messages appear (space is reserved).
- `UI-15` 🔍 **No junk values** — `undefined` / `NaN` / `Invalid Date` never reach the user.

**C. Lists and tables**

- `UI-16` 👁 **Live list** — deleting/editing an item updates the list without a manual reload, and no "ghost" item survives a reload.
- `UI-17` 👁 **Stable filters/paging** — filters and pagination persist after an edit; changing a filter resets to page 1.
- `UI-18` 🔍 **Optimistic rollback** — if an optimistic update fails, the UI reverts to the previous state.
- `UI-19` 👁 **Long text** — long text truncates/wraps without breaking the layout.

**D. Interaction and feedback**

- `UI-20` 🔍 **Confirm destructive** — destructive actions ask for confirmation.
- `UI-21` 👁 **Action feedback** — every action gives success/failure feedback; nothing silent.
- `UI-22` 👁 **Modals** — close on Esc and outside click (where appropriate), trap focus, and restore it on close.

**E. Basic accessibility**

- `UI-23` 🔍 **Labels** — every input has an associated label.
- `UI-24` 👁 **Focus and keyboard** — focus is visible and the UI is operable by keyboard (Enter to submit, Esc to close).

**F. Consistency and content**

- `UI-25` 👁 **Formatting** — dates, currency, and numbers use a correct, consistent format/locale/timezone.
- `UI-26` 👁 **Copy** — new copy has no typos and is in the product's language.
- `UI-27` 🔍 **Terminology** — terms match the project's `CONTEXT.md` glossary.

## Why it asks before applying

Each rule describes a common behavior, not a law. If Figma, the user story, or the business didn't define it, applying it would alter established behavior — **Warn on leave** (`UI-09`) is the clear case: some edit screens carry no such alert by design. So the skill previews first, confirms with you, and only applies what you marked applicable; the not-applicable ones are never touched.

It complements `/code-review` (standards and spec), it doesn't replace it; both run before the Functional Review. Findings are hypotheses, and so are the fixes — review the edits it makes before you ship them, and don't loop it to zero findings, because it won't converge.
