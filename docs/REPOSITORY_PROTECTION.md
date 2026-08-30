# Repository Protection Plan

This document defines the repository-level controls that complement `AGENTS.md`, CI, and the agent task protocol.

## Current limitation

Repository rules must be configured in GitHub itself. They cannot be enforced only by documentation or by a workflow that runs after a push.

Until `main` protection is enabled, agents are still forbidden by policy from pushing or merging directly to `main`, but GitHub does not yet technically block an authorized credential from doing so.

## Recommended `main` protection

Configure a branch protection rule or repository ruleset targeting `main` with these controls:

1. Require changes to arrive through a pull request.
2. Require the `Validate` GitHub Actions check to pass before merge.
3. Require branches to be up to date before merge when practical.
4. Block force pushes.
5. Block branch deletion.
6. Apply protections to administrators when GitHub plan/settings allow it.
7. Do not allow bypass by automation accounts used by coding agents.

For a solo-maintainer repository, do **not** require one approving review unless another human reviewer is available. GitHub does not treat self-approval as an independent review, so requiring an external approval can deadlock a one-person project.

When another trusted human reviewer is available, enable at least one required approval and dismiss stale approvals when new commits are pushed.

## Required status check

The current CI workflow exposes the validation job as:

`Validate`

Before making it a required check, verify that GitHub shows this exact check name on a successful pull request run.

## CODEOWNERS

`.github/CODEOWNERS` identifies the human owner for all files and explicitly highlights governance and production-sensitive areas.

CODEOWNERS is useful for routing review, but it is not a security boundary by itself. Required code-owner review only becomes enforceable when repository protection settings support and enable it.

## PR policy guard

CI also runs `scripts/check-pr-policy.mjs` on pull requests.

The guard:

- blocks local/sensitive artifacts such as `.env`, private database files, backup files, private-key-like files, and SQLite files
- prevents `agent/*` branches from changing agent governance or CI controls
- emits GitHub warnings when a PR touches Supabase, deployment configuration, dependency manifests, or authentication/permission-related paths

This guard is deliberately narrower than branch protection. It protects the review path; it cannot prevent a direct push to an unprotected `main` branch.

## Manual setup path

In GitHub, open the repository and use either:

- **Settings → Rules → Rulesets**, or
- **Settings → Branches → Branch protection rules**

Target `main` and apply the controls above.

After protection is enabled, verify it with a disposable branch and pull request rather than by attempting a risky direct push to `main`.

## Safety invariant

Even after GitHub protection is enabled:

- agents work only on task branches
- agents may push validated task branches
- agents may open/update pull requests
- agents never merge their own pull requests
- human approval remains the final merge authority
