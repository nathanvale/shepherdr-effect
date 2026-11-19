# Launch model

One task launch, written in TLA+ (the Temporal Logic of Actions, a language
that describes how a system moves between states) and checked by TLC (the
TLA+ model checker) over every order of its steps. It models the design in
[../module-map-crashes.md](../module-map-crashes.md) and
[../launch-admission.md](../launch-admission.md). Nothing is built, so no step
is tied to code, and a TLC trace is the only evidence for each result. Words
follow [GLOSSARY.md](../../../GLOSSARY.md).

## The files

| File                         | What it is                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `Launch.tla`                 | The design as written                                                                         |
| `LaunchCloseOnAbsence.tla`   | A whole copy with one more step: the person closes the launch when no labelled terminal shows |
| `LaunchRefuteOnEvidence.tla` | A whole copy with one more step: the person refutes the launch on evidence, as Nathan decided |
| `*.cfg`                      | The rules TLC checks. The three are the same                                                  |

The tool that draws the charts needs each changed model as a whole copy. So a
change to `Launch.tla` must be made in the other two as well. TLA+ requires a
file to carry its module's name, which cannot hold a hyphen, so these names
are not kebab-case.

## What it models

| Who                  | Steps                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| The launch's own run | Records the intent, records that it is about to send, sends, confirms, assigns the agent, completes |
| A crash              | At any step of the run                                                                              |
| herdr-core           | Starts the terminal or drops the request, also after the run has stopped                            |
| The next tick        | Re-runs the task assignment of a confirmed launch and closes it                                     |
| The person           | `launch recover`, `launch reconcile`, and closing a Refuted launch                                  |

## Results

TLC finds 26 states and 32 steps. The statechart tool checks each rule in a
run of its own, and then checks every rule on every state of the whole graph.
So the rule that breaks does not hide a state from the others.

| Rule                                                                                          | In the design |
| --------------------------------------------------------------------------------------------- | ------------- |
| A launch is Confirmed, or closed as completed, only after herdr-core has started its terminal | Holds         |
| Nothing closes as not applied while a herdr-core request may still be pending                 | Holds         |
| An unresolved launch is never left with no step that anyone can take                          | Breaks        |

The first two rules are Nathan's. The third is the architecture review's.

Two of these say less than they may seem to:

- The first rule checks the order of steps, not the label. The model has one
  launch and one request, so "herdr-core has started its terminal" stands in
  for positive evidence. It cannot tell a terminal that carries the attempt
  id from one with a wrong or missing label.
- The third rule is weaker than "a launch never blocks its task for good". A
  stopped run with a pending request passes it, because herdr-core can still
  start or drop the request, and the model does not say that it ever does.

Nathan's third rule, that the task assignment happens at most once, is not a
result. The model writes the agent row as one store transaction keyed by the
attempt id, so no order of steps can break it. The rule is in the `.cfg`
files to catch a later edit that drops that key.

The rule that breaks does so two ways. Each path ends with the run stopped,
the launch Uncertain, and no step left for anyone:

1. The run records its intent. It records that it is about to send. It
   crashes before it writes the request.
2. The run records its intent. It records that it is about to send. The
   herdr-core link refuses the request. The run crashes before it records
   that. The same end is reached when herdr-core drops a pending request
   after the run has stopped.

## Two changes, checked the same way

| Change                                                                                             | The dead ends | The other rules                                      |
| -------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------- |
| `LaunchCloseOnAbsence.tla`: the person closes the launch when no labelled terminal shows           | Both gone     | Breaks "nothing closes as not applied while pending" |
| `LaunchRefuteOnEvidence.tla`: the person refutes it only on evidence that the request cannot apply | Both gone     | All hold                                             |

The path that the first change opens: the run sends the request and stops
waiting for a reply, the person closes the launch as not applied because no
terminal shows, and herdr-core can still start the terminal.

The second change holds only in the model, and on an assumption. The model
lets the person refute exactly when the request was never written or was
dropped. It does not model the evidence, or how it is observed. Whether
herdr-core can show that a request can no longer apply is not known.

## What it leaves out

- The prepare step and the launch revision check.
- A second start of the same task.
- A terminal that is removed later, and several terminals with one label.
- Publication stages, remote commands and message sends.
- Whether herdr-core ever does start the terminal or drop the request. The
  model only says that either can happen.

It assumes three things:

- A refuting reply is true.
- The person may close a Refuted launch. That is open question 7 in
  [../module-map.md](../module-map.md).
- The kernel can show that a run has stopped.

## Check the model again

You need Node, mise, and the statechart tool from the pstack plugin. On its
first run the tool installs TLC and Java with mise.

1. Copy the `.tla` and `.cfg` files to a folder outside the repository.
2. Set `STATECHART` to the path of the plugin's `statechart.mjs`.
3. Run the first command. It writes a file of chart labels, runs no check,
   and exits 2.
4. Run the first command again. It exits 0.
5. Run the second command. It exits 1, because closing on absence breaks a
   rule.

```sh
node "$STATECHART" from-spec Launch.tla --fixed LaunchRefuteOnEvidence.tla --expect-broken NoDeadEnd
node "$STATECHART" from-spec Launch.tla --fixed LaunchCloseOnAbsence.tla --expect-broken NoDeadEnd
```

The charts and their labels are not kept in the repository. `bun run check`
refuses a label file here, because no other file imports it.
