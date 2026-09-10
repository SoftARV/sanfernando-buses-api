# Issue tracker: GitHub

Issues and specs live in `SoftARV/sanfernando-buses-api`.
Use the gh CLI with `--repo SoftARV/sanfernando-buses-api`
because the git remote uses the SSH alias `personal`.

## Operations

- Create: `gh issue create --title "..." --body-file <path>`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open --json number,title,body,labels`
- Comment: `gh issue comment <number> --body-file <path>`
- Label: `gh issue edit <number> --add-label "<label>"`
- Remove label: `gh issue edit <number> --remove-label "<label>"`
- Close: `gh issue close <number>`

Add the repo flag to each command. Use temporary files for multiline
bodies. Read `docs/agents/triage-labels.md` for label mappings.

“Publish to the issue tracker” means create a GitHub issue.
“Fetch the relevant ticket” means read the issue and its comments.

## Pull requests as a triage surface

PRs as a request surface: no.

## Wayfinding

Represent a map as an issue labelled `wayfinder:map`.
Link child tickets as sub-issues, or use a task list in the map and
a `Part of #<map>` line in each child when sub-issues are unavailable.

Use `wayfinder:<type>` labels for research, prototype, grilling,
and task tickets. Represent blockers with native issue dependencies;
fall back to a `Blocked by: #<number>` line when unavailable.

Choose the first unassigned child in map order whose blockers are
closed. Claim it by assigning yourself. On completion, comment with
the result, close the child, and link the result in the map's
Decisions-so-far section.
