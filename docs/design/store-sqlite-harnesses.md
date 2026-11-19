# Harness evidence for how the store uses SQLite

The measurements behind [store-sqlite.md](store-sqlite.md), which holds the
choices, the open routine and what is not tested.

## Contention harness

`daemon.ts` reads every 50 ms and writes once a second. N worker slots each
spawn fresh `bun cmd.ts` processes one after another; each opens with the
routine's pragmas, runs one `BEGIN IMMEDIATE` that updates a row and inserts
a row, closes, exits. 600 commands per run. Wall is spawn to exit, timed by
the parent; transaction time is timed inside and includes any busy wait.
Latencies cover acknowledged commands. In all 27 runs (25 below, 2 behind the
read test) the row count and the counter equalled the acknowledged commits,
and `integrity_check` returned `ok`.

N=20, busy timeout 2,000 ms, in ms ("ff" is `fullfsync`):

| Build                   | Wall p50 | Wall p99 | Tx p50 | Tx p99 | Busy errors |
| ----------------------- | -------- | -------- | ------ | ------ | ----------- |
| Homebrew 3.54.1, ff on  | 17.9     | 1,415    | 8.4    | 1,405  | 3 of 600    |
| Same, busy timeout 10 s | 17.0     | 1,310    | 7.2    | 1,301  | 0 of 600    |
| Homebrew, ff off        | 30.9     | 54.1     | 0.3    | 13.2   | 0 of 600    |
| Apple 3.51.0, ff on     | 27.7     | 80.2     | 2.1    | 56.3   | 0 of 600    |
| Apple, ff off           | 33.2     | 51.5     | 0.5    | 6.4    | 0 of 600    |
| Pilot 3.53.4            | 8.8      | 650      | 5.3    | 647    | 0 of 600    |

N=1 and N=5, busy timeout 2,000 ms, wall p50 and p99 in ms, no busy errors:

| Build            | N=1        | N=5         |
| ---------------- | ---------- | ----------- |
| Homebrew, ff on  | 15.1, 27.5 | 19.1, 466.9 |
| Homebrew, ff off | 10.1, 20.2 | 11.2, 20.8  |
| Apple, ff on     | 10.9, 17.3 | 10.9, 15.8  |
| Apple, ff off    | 10.1, 16.8 | 11.6, 16.4  |
| Pilot            | 4.9, 8.5   | 5.7, 123.7  |

Busy timeout 0, busy errors of 600 at N=1, 5, 20: Homebrew ff on 2, 387, 495;
Apple ff on 0, 270, 292; pilot 1, 337, 522. All at the transaction, none at
open. A timeout of 0 is unusable.

What limits these numbers:

- **Floor: Bun's start.** At N=1 the transaction is 0.3 to 5 ms of a 5 to
  15 ms wall. No Effect is loaded, so a real command costs more.
- **Ceiling: one writer at a time behind the sync.** Homebrew with
  `fullfsync` committed 600 in 3.2 to 3.9 s, 155 to 190 a second, about one
  4 ms `F_FULLFSYNC` per commit. Apple's build with `fullfsync` commits in 1
  to 2 ms, which fits `F_BARRIERFSYNC` and not `F_FULLFSYNC`; so Apple's
  build likely does not issue a true full flush (inferred from timing).
- **The p99 tail is unfair waiting, not queue length.** Twenty writers at 8
  ms each predict about 160 ms of wait, yet Homebrew's p99 is 1.4 s and the
  pilot's 650 ms while p50 stays under 10 ms. SQLite's default busy handler
  sleeps and polls, so a waiter can lose the lock to later arrivals. Apple's
  build has `ENABLE_SETLK_TIMEOUT` (blocking locks) and a 56 ms tail at a
  similar commit time. Inferred from compile options and tails, not proven.

## Proposed latency limit for `herdr-task status`

A status-like read (`status.ts`: open, read two values, close) ran 200 times
while 20 writer slots ran 3,000 commands. Homebrew with `fullfsync`: wall p50
9.3 ms, p99 13.5 ms, open plus read p99 2.2 ms. Apple with `fullfsync`: p50
20.2 ms, p99 71.4 ms, open plus read p99 15.3 ms. No errors; a WAL reader does
not wait for the writer.

**Proposed: p99 at or under 250 ms from spawn to exit with 20 writing
commands running, and the store's share (open plus read) at or under 25 ms
p99.** Not claimed as met: the real command loads Effect and renders. With
the store at 2.2 ms and Bun's start near 9 ms, about 200 ms is left for
Effect and rendering, which a person reads as immediate. Writing commands need their own limit. On the Mac
with `fullfsync` their p99 at N=20 is 1.3 to 1.4 s, so 2 s p99 is honest
today, and a fairer lock wait could lower it.

## Crash harness

`writer.ts` commits numbered rows (with a 200 to 4,000 byte blob, so
checkpoints run) in `BEGIN IMMEDIATE` transactions, printing each number only
after the commit returns. The parent reads stdout continuously, sends SIGKILL
after 5 to 405 ms, reopens the file, runs `integrity_check`, checks every
acknowledged number, and starts a fresh writer. 100 kills per build.

| Build                  | Integrity failures | Lost acknowledged | Acknowledged | Unacknowledged rows left |
| ---------------------- | ------------------ | ----------------- | ------------ | ------------------------ |
| Homebrew 3.54.1, ff on | 0 of 100           | 0                 | 3,777        | 87                       |
| Homebrew, ff off       | 0 of 100           | 0                 | 307,639      | 65                       |
| Apple 3.51.0, ff on    | 0 of 100           | 0                 | 54,757       | 86                       |
| Apple, ff off          | 0 of 100           | 0                 | 289,315      | 66                       |
| Pilot 3.53.4           | 0 of 100           | 0                 | 16,339       | 95                       |

Every kill left a `-wal` file (up to 4.1 MB), and every reopen recovered it:
integrity `ok`, all acknowledged rows present. On close the WAL was deleted
(Homebrew, pilot) or left at 0 bytes (Apple's build keeps the file). An
unacknowledged row is allowed: the commit reached the operating system before
the kill, the print did not. Most kills land there because the sync is most
of each loop.

**What this proves, exactly.** A killed process lost no acknowledged commit
and corrupted no file on these builds. It does not test a power cut or an
operating system crash: after SIGKILL the operating system still holds every
write, so `synchronous` and `fullfsync` are never exercised. sqlite.org says
even `synchronous=OFF` "is safe from damage due to application crashes"
(howtocorrupt.html 7).

## Rerunning the harnesses

```sh
cd ~/.local/state/shepherdr-effect-design/sqlite-harness
./run.sh mac results 600 100   # probes, contention, crash; Apple and Homebrew
BREW=/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib
SQLITE_LIB=$BREW BUSY_MS=10000 FULLFSYNC=1 bun contention.ts "$(mktemp -d)" 20 600 rerun results
SQLITE_LIB=$BREW FULLFSYNC=1 bun status-under-load.ts "$(mktemp -d)" 20 rerun results
SQLITE_LIB=$BREW bun check-cost.ts ~/.local/state/shepherdr-effect-design
bun fsync-cost.ts ~/.local/state/shepherdr-effect-design
```

In the pilot, from a folder made by `mktemp -d /home/agent/sqlite-harness.XXXXXX`
holding the `.ts` files and `run.sh`, run
`BUN=/opt/bun/bun WORK_PARENT=<folder> nice -n 10 ./run.sh pilot <folder>/results 600 100`,
then copy `results` out and remove the folder. Raw results are in `results/`
and `results-pilot/results/`.
