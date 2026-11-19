---- MODULE Launch ----
\* One task launch in Shepherdr, as designed in docs/design/module-map-crashes.md
\* and docs/design/launch-admission.md. Nothing is built, so no line of code backs
\* any step: each step is a row of the crash table or a decision in those notes.
EXTENDS Naturals

VARIABLES
  attemptOwner,   \* the launch's own run: "running", "crashed" or "ended"
  kernelJournal,  \* the last record the kernel journal holds for this launch
  request,        \* herdr-core's side of the terminal start: "none", "pending", "applied", "dropped"
  agentRow,       \* TRUE once the agent row (the agent on its task) is in the store
  assignments     \* how many times a task assignment changed the store

vars == <<attemptOwner, kernelJournal, request, agentRow, assignments>>

Init ==
  /\ attemptOwner = "running"
  /\ kernelJournal = "none"
  /\ request = "none"
  /\ agentRow = FALSE
  /\ assignments = 0

\* The kernel closes a case only once the run that recorded it has stopped.
AttemptOwnerStopped == attemptOwner # "running"

\* assignAgent is one store transaction keyed by the attempt id, so a repeat
\* finds the agent row there and changes nothing.
AssignAgent ==
  /\ agentRow' = TRUE
  /\ assignments' = IF agentRow THEN assignments ELSE assignments + 1

\* ---- the launch's own run (crash table steps 1 to 6) ----

RunRecordsIntent ==
  /\ attemptOwner = "running" /\ kernelJournal = "none"
  /\ kernelJournal' = "intent"
  /\ UNCHANGED <<attemptOwner, request, agentRow, assignments>>

RunRefusesBeforeSend ==
  /\ attemptOwner = "running" /\ kernelJournal = "intent"
  /\ kernelJournal' = "not-applied" /\ attemptOwner' = "ended"
  /\ UNCHANGED <<request, agentRow, assignments>>

RunRecordsEffectStarted ==
  /\ attemptOwner = "running" /\ kernelJournal = "intent"
  /\ kernelJournal' = "effect-started"
  /\ UNCHANGED <<attemptOwner, request, agentRow, assignments>>

RunWritesRequest ==
  /\ attemptOwner = "running" /\ kernelJournal = "effect-started" /\ request = "none"
  /\ request' = "pending"
  /\ UNCHANGED <<attemptOwner, kernelJournal, agentRow, assignments>>

HerdrCoreLinkRefusesRequest ==
  /\ attemptOwner = "running" /\ kernelJournal = "effect-started" /\ request = "none"
  /\ request' = "dropped"
  /\ UNCHANGED <<attemptOwner, kernelJournal, agentRow, assignments>>

RunSeesTerminal ==
  /\ attemptOwner = "running" /\ kernelJournal = "effect-started" /\ request = "applied"
  /\ kernelJournal' = "effect-confirmed"
  /\ UNCHANGED <<attemptOwner, request, agentRow, assignments>>

RunGetsRefutingReply ==
  /\ attemptOwner = "running" /\ kernelJournal = "effect-started" /\ request = "dropped"
  /\ kernelJournal' = "effect-unconfirmed" /\ attemptOwner' = "ended"
  /\ UNCHANGED <<request, agentRow, assignments>>

RunGivesUpWaiting ==
  /\ attemptOwner = "running" /\ kernelJournal = "effect-started" /\ request = "pending"
  /\ attemptOwner' = "ended"
  /\ UNCHANGED <<kernelJournal, request, agentRow, assignments>>

RunAssignsAgent ==
  /\ attemptOwner = "running" /\ kernelJournal = "effect-confirmed" /\ ~agentRow
  /\ AssignAgent
  /\ UNCHANGED <<attemptOwner, kernelJournal, request>>

RunRecordsCompletion ==
  /\ attemptOwner = "running" /\ kernelJournal = "effect-confirmed" /\ agentRow
  /\ kernelJournal' = "completion" /\ attemptOwner' = "ended"
  /\ UNCHANGED <<request, agentRow, assignments>>

RunCrashes ==
  /\ attemptOwner = "running"
  /\ attemptOwner' = "crashed"
  /\ UNCHANGED <<kernelJournal, request, agentRow, assignments>>

\* ---- herdr-core ----

HerdrCoreStartsTerminal ==
  /\ request = "pending"
  /\ request' = "applied"
  /\ UNCHANGED <<attemptOwner, kernelJournal, agentRow, assignments>>

HerdrCoreDropsRequest ==
  /\ request = "pending"
  /\ request' = "dropped"
  /\ UNCHANGED <<attemptOwner, kernelJournal, agentRow, assignments>>

\* ---- the next tick (the default in launch-admission.md) ----

TickFinishesConfirmed ==
  /\ AttemptOwnerStopped /\ kernelJournal = "effect-confirmed" /\ request = "applied"
  /\ AssignAgent
  /\ kernelJournal' = "closed-completed"
  /\ UNCHANGED <<attemptOwner, request>>

\* ---- the person's closure commands ----

\* launch recover
PersonClosesIntended ==
  /\ AttemptOwnerStopped /\ kernelJournal = "intent"
  /\ kernelJournal' = "closed-not-applied"
  /\ UNCHANGED <<attemptOwner, request, agentRow, assignments>>

PersonClosesRefuted ==
  /\ AttemptOwnerStopped /\ kernelJournal = "effect-unconfirmed"
  /\ kernelJournal' = "closed-not-applied"
  /\ UNCHANGED <<attemptOwner, request, agentRow, assignments>>

\* launch reconcile
PersonClosesOnPositiveEvidence ==
  /\ AttemptOwnerStopped /\ kernelJournal \in {"effect-started", "effect-confirmed"} /\ request = "applied"
  /\ AssignAgent
  /\ kernelJournal' = "closed-completed"
  /\ UNCHANGED <<attemptOwner, request>>

System ==
  \/ RunRecordsIntent \/ RunRefusesBeforeSend \/ RunRecordsEffectStarted
  \/ RunWritesRequest \/ HerdrCoreLinkRefusesRequest \/ RunSeesTerminal
  \/ RunGetsRefutingReply \/ RunGivesUpWaiting \/ RunAssignsAgent \/ RunRecordsCompletion
  \/ RunCrashes \/ HerdrCoreStartsTerminal \/ HerdrCoreDropsRequest \/ TickFinishesConfirmed

Next ==
  \/ System
  \/ PersonClosesIntended \/ PersonClosesRefuted \/ PersonClosesOnPositiveEvidence

Spec == Init /\ [][Next]_vars

\* The kernel's unresolved case: a launch with no completion and no closure.
UnresolvedCase == kernelJournal \in {"intent", "effect-started", "effect-unconfirmed", "effect-confirmed"}

\* A launch counts as Confirmed, or is closed as completed, only on positive
\* evidence: a terminal that carries its attempt id.
EvidenceBeforeConfirmed ==
  kernelJournal \in {"effect-confirmed", "completion", "closed-completed"} => request = "applied"

\* Nothing closes as not applied while a herdr-core request may still be pending.
NoNotAppliedWhilePending ==
  kernelJournal \in {"not-applied", "closed-not-applied"} => request # "pending"

\* The task assignment happens at most once. This holds by construction:
\* AssignAgent is keyed by the attempt id, so no order of steps can break it.
AssignedAtMostOnce == assignments <= 1

\* The review's own rule, not one of Nathan's three: a launch never blocks its
\* task for good. Someone can always still close an unresolved launch.
NoDeadEnd == ~(UnresolvedCase /\ ~ENABLED Next)
====
