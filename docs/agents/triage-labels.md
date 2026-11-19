# Triage labels

The skills speak in terms of five triage roles. This file maps those roles to
the label strings used in this repository's issue tracker. All five keep their
default names.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role, use the label string from this table.

## Labels that already exist in the team

- None of the five existed in Linear on 2026-11-19. Create one the first time
  a skill needs it, with Nathan's say.
- `dispatch/ready` is a different label and stays as it is. It records a
  readiness check made just before a run, on a `kind/build` issue in Todo. It
  comes after `ready-for-agent`, which is a triage outcome.
- The team also has a Triage status. An issue in that status has not been
  triaged yet, whatever its labels.
