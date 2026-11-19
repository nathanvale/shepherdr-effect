---- MODULE Launch ----
\* One task launch in Shepherdr, as designed in docs/design/module-map-crashes.md
\* and docs/design/launch-admission.md. Nothing is built, so no line of code backs
\* any step: each step is a row of the crash table or a decision in those notes.
EXTENDS Naturals

VARIABLES
  owner,    \* the launch's own run: "running", "crashed" or "ended"
  journal,  \* what the kernel journal holds for this launch
  request,  \* herdr-core's side of the terminal start: "none", "inFlight", "applied", "dropped"
  row,      \* TRUE once the agent row (the agent on its task) is in the store
  assigns   \* how many times a task assignment changed the store

vars == <<owner, journal, request, row, assigns>>

Init ==
  /\ owner = "running"
  /\ journal = "none"
  /\ request = "none"
  /\ row = FALSE
  /\ assigns = 0

\* The kernel closes a case only once the run that recorded it has stopped.
Stopped == owner # "running"

\* assignAgent is one store transaction keyed by the attempt id.
Assign ==
  /\ row' = TRUE
  /\ assigns' = IF row THEN assigns ELSE assigns + 1

\* ---- the launch's own run (crash table steps 1 to 6) ----

RunRecordsIntent ==
  /\ owner = "running" /\ journal = "none"
  /\ journal' = "intent"
  /\ UNCHANGED <<owner, request, row, assigns>>

RunRefusesBeforeSend ==
  /\ owner = "running" /\ journal = "intent"
  /\ journal' = "notApplied" /\ owner' = "ended"
  /\ UNCHANGED <<request, row, assigns>>

RunRecordsEffectStarted ==
  /\ owner = "running" /\ journal = "intent"
  /\ journal' = "termStarted"
  /\ UNCHANGED <<owner, request, row, assigns>>

RunWritesRequest ==
  /\ owner = "running" /\ journal = "termStarted" /\ request = "none"
  /\ request' = "inFlight"
  /\ UNCHANGED <<owner, journal, row, assigns>>

LinkRefusesRequest ==
  /\ owner = "running" /\ journal = "termStarted" /\ request = "none"
  /\ request' = "dropped"
  /\ UNCHANGED <<owner, journal, row, assigns>>

RunSeesTerminal ==
  /\ owner = "running" /\ journal = "termStarted" /\ request = "applied"
  /\ journal' = "termConfirmed"
  /\ UNCHANGED <<owner, request, row, assigns>>

RunGetsRefutingReply ==
  /\ owner = "running" /\ journal = "termStarted" /\ request = "dropped"
  /\ journal' = "termUnconfirmed" /\ owner' = "ended"
  /\ UNCHANGED <<request, row, assigns>>

RunGivesUpWaiting ==
  /\ owner = "running" /\ journal = "termStarted" /\ request = "inFlight"
  /\ owner' = "ended"
  /\ UNCHANGED <<journal, request, row, assigns>>

RunAssigns ==
  /\ owner = "running" /\ journal = "termConfirmed" /\ ~row
  /\ Assign
  /\ UNCHANGED <<owner, journal, request>>

RunCompletes ==
  /\ owner = "running" /\ journal = "termConfirmed" /\ row
  /\ journal' = "completed" /\ owner' = "ended"
  /\ UNCHANGED <<request, row, assigns>>

Crash ==
  /\ owner = "running"
  /\ owner' = "crashed"
  /\ UNCHANGED <<journal, request, row, assigns>>

\* ---- herdr-core ----

HcApplies ==
  /\ request = "inFlight"
  /\ request' = "applied"
  /\ UNCHANGED <<owner, journal, row, assigns>>

HcDrops ==
  /\ request = "inFlight"
  /\ request' = "dropped"
  /\ UNCHANGED <<owner, journal, row, assigns>>

\* ---- the next tick (the default in launch-admission.md) ----

TickFinishesConfirmed ==
  /\ Stopped /\ journal = "termConfirmed" /\ request = "applied"
  /\ Assign
  /\ journal' = "closedCompleted"
  /\ UNCHANGED <<owner, request>>

\* ---- the person's closure commands ----

PersonRecovers ==
  /\ Stopped /\ journal = "intent"
  /\ journal' = "closedNotApplied"
  /\ UNCHANGED <<owner, request, row, assigns>>

PersonClosesRefuted ==
  /\ Stopped /\ journal = "termUnconfirmed"
  /\ journal' = "closedNotApplied"
  /\ UNCHANGED <<owner, request, row, assigns>>

PersonReconciles ==
  /\ Stopped /\ journal \in {"termStarted", "termConfirmed"} /\ request = "applied"
  /\ Assign
  /\ journal' = "closedCompleted"
  /\ UNCHANGED <<owner, request>>

System ==
  \/ RunRecordsIntent \/ RunRefusesBeforeSend \/ RunRecordsEffectStarted
  \/ RunWritesRequest \/ LinkRefusesRequest \/ RunSeesTerminal
  \/ RunGetsRefutingReply \/ RunGivesUpWaiting \/ RunAssigns \/ RunCompletes
  \/ Crash \/ HcApplies \/ HcDrops \/ TickFinishesConfirmed

Next ==
  \/ System
  \/ PersonRecovers \/ PersonClosesRefuted \/ PersonReconciles

Spec == Init /\ [][Next]_vars

Unresolved == journal \in {"intent", "termStarted", "termUnconfirmed", "termConfirmed"}

\* A launch counts as Confirmed, or is closed as completed, only on positive
\* evidence: a terminal that carries its attempt id.
EvidenceBeforeConfirmed ==
  journal \in {"termConfirmed", "completed", "closedCompleted"} => request = "applied"

\* Nothing closes as not applied while a herdr-core request may still be pending.
NoNotAppliedWhilePending ==
  journal \in {"notApplied", "closedNotApplied"} => request # "inFlight"

\* The task assignment happens at most once.
AssignedAtMostOnce == assigns <= 1

\* The review's own rule, not one of Nathan's three: a launch never blocks its
\* task for good. Someone can always still close an unresolved launch.
NoDeadEnd == ~(Unresolved /\ ~ENABLED Next)
====
