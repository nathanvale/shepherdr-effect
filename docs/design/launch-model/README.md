# Launch model

One task launch, written in TLA+ (a language that describes how a system moves
between states) and checked by TLC (its model checker) over every order of
its steps. It models the design in
[../module-map-crashes.md](../module-map-crashes.md) and
[../launch-admission.md](../launch-admission.md). Nothing is built, so no step
is tied to code, and a TLC trace is the only evidence for each result. Words
follow [GLOSSARY.md](../../../GLOSSARY.md).

## What it models

| Who                  | Steps                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| The launch's own run | Records the intent, records that it is about to send, sends, confirms, assigns the agent, completes |
| A crash              | At any step of the run                                                                              |
| herdr-core           | Starts the terminal or drops the request, also after the run has stopped                            |
| The next tick        | Re-runs the task assignment of a confirmed launch and closes it                                     |
| The person           | `launch recover`, `launch reconcile`, and closing a Refuted launch                                  |

## Results

TLC finds 26 states and 32 steps.

| Rule                                                                                          | In the design |
| --------------------------------------------------------------------------------------------- | ------------- |
| A launch is Confirmed, or closed as completed, only on a terminal that carries its attempt id | Holds         |
| Nothing closes as not applied while a herdr-core request may still be pending                 | Holds         |
| The task assignment happens at most once                                                      | Holds         |
| A launch never blocks its task for good                                                       | Breaks        |

The first three rules are Nathan's. The fourth is the architecture review's.

The fourth rule breaks two ways. Each path ends with the run stopped, the
launch Uncertain, and no step left for anyone:

1. The run records its intent. It records that it is about to send. It
   crashes before it writes the request.
2. The run records its intent. It records that it is about to send. The
   herdr-core link refuses the request. The run crashes before it records
   that. The same end is reached when herdr-core drops a request in flight
   after the run has stopped.

## Two changes, checked the same way

| Change                                                                                                | The dead ends | The other rules                                      |
| ----------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------- |
| `LaunchNaive.tla`: the person closes the launch as not applied when no labelled terminal shows        | Both gone     | Breaks "nothing closes as not applied while pending" |
| `LaunchSound.tla`: the person closes it only on proof that herdr-core can no longer apply the request | Both gone     | All hold                                             |

The path that the first change opens: the run sends the request and stops
waiting for a reply, the person closes the launch as not applied because no
terminal shows, and herdr-core can still start the terminal.

## What it leaves out

- The prepare step and the launch revision check.
- A second start of the same task.
- A terminal that is removed later, and several terminals with one label.
- Publication stages, remote commands and message sends.
- Whether herdr-core ever does start the terminal or drop the request. The
  model only says that either can happen.

It assumes that a refuting reply is true, that the person may close a Refuted
launch, and that the kernel can show that a run has stopped.

## Check it again

The check needs the statechart tool from the pstack plugin, which installs
TLC and Java on its first run. Copy the `.tla` and `.cfg` files to a folder
outside the repository, and run each command there twice. The first run only
writes a file of chart labels.

```sh
node "$STATECHART" from-spec Launch.tla --fixed LaunchSound.tla --expect-broken NoDeadEnd
node "$STATECHART" from-spec Launch.tla --fixed LaunchNaive.tla --expect-broken NoDeadEnd
```

`STATECHART` is the path of the plugin's `statechart.mjs`. The first command
exits 0. The second exits 1, because closing on absence breaks a rule.

The charts and their labels are not kept in the repository. The check refuses
a label file here, because nothing imports it.
