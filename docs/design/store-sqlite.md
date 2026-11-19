# How the store uses SQLite

How the store opens SQLite under Bun 1.4.4, with evidence from two harnesses
run on 2026-11-19 on this Mac (Apple M4 Pro, APFS) and in the Linux pilot
(`agents-pilot`, a btrfs volume). Nothing is built in `src/`. Harness code
and raw results are throwaway evidence in
`~/.local/state/shepherdr-effect-design/sqlite-harness/`.

## Choices

The owner left these open. The defaults below were applied so he can
overrule them.

| Choice          | Default given                    | Result                                     |
| --------------- | -------------------------------- | ------------------------------------------ |
| macOS library   | Decide from evidence             | Homebrew's, via `Database.setCustomSQLite` |
| Minimum version | From the bug's conditions        | Refuse below 3.51.3, and refuse 3.52.x     |
| Durability      | `synchronous=FULL`, not weakened | Kept; on macOS also `fullfsync=ON` (below) |
| Latency limit   | Not set                          | Proposed for `herdr-task status`, not met  |
| Client          | `bun:sqlite` directly            | Kept                                       |
| Database files  | One per machine                  | Kept                                       |

**One decision for the owner.** On macOS `synchronous=FULL` calls `fsync()`,
which does not flush the drive's cache. Measured here (`fsync-cost.ts`, 300
calls each): `fsync` p50 0.03 ms, `F_BARRIERFSYNC` 0.3 ms, `F_FULLFSYNC` 4.0
ms. sqlite.org: "The default value of the fullfsync flag is off. Only Mac OS
X supports F_FULLFSYNC" ([pragma.html](https://www.sqlite.org/pragma.html#pragma_fullfsync)).
So FULL alone is weaker on macOS than on Linux. This note turns `fullfsync`
on, since the intent is durability. The cost is a long tail at 20 concurrent
writers (p99 1.3 to 1.4 s). Off, the p99 is near 54 ms but the last commits
may be lost on a power cut. That weakens durability, so it is the owner's
call and not recommended here.

## The 3.52.0 corruption bug

sqlite.org's news for 3.52.0: "A 15-year-old database corruption bug was
discovered just a few days ago, and is now fixed"
([news.html](https://www.sqlite.org/news.html)). 3.52.0 was withdrawn; its
release notes say only that its features "have been moved forward into
version 3.53.0" ([3_52_0](https://www.sqlite.org/releaselog/3_52_0.html)).
The bug is the WAL-reset bug, and
[wal.html](https://www.sqlite.org/wal.html#walresetbug) gives the conditions:

- "present in all version of SQLite from 3.7.0 (2010-07-21) through 3.51.2
  (2026-01-09). It is fixed in version 3.51.3 (2026-03-13) and later."
- "The bug only affects databases in WAL mode when there are two or more
  database connections open on the same file, in separate threads or
  processes, and when those two connections attempt to write or checkpoint at
  the same instant."
- The result: parts of a committed transaction "never reach the database
  file, and the database file goes corrupt."

**Shepherdr meets every condition.** WAL mode, several processes on one
file, and any of them may write or checkpoint at any moment, since an
automatic checkpoint runs in "the same thread that does the COMMIT" (wal.html
2.3). Local disk or Docker volume makes no difference; the race is inside
SQLite. It is rare (sqlite.org puts it at or below "SSD malfunctions and/or
cosmic-ray hits"), but refusing costs nothing on our machines, so the store
**refuses** rather than warns. 3.52.x is refused too: 3.52.0 "has been
withdrawn because some of the new features found in 3.52.0 are not 100%
compatible with prior releases" (news, 3.51.3 entry).

Apple's library reports 3.51.0, inside the affected range. Its source id ends
in `apl` and is dated 2025-06-12; nothing visible shows a backport, and a
version check cannot see one. That is the deciding fact for Homebrew.

## Probes

`probe.ts` on each build.

| Item                                | Apple (macOS)                     | Homebrew (macOS) | Bundled (pilot)        |
| ----------------------------------- | --------------------------------- | ---------------- | ---------------------- |
| `sqlite_version()`                  | 3.51.0 (source 2025-06-12, `apl`) | 3.54.1           | 3.53.4                 |
| `setCustomSQLite`                   | not called                        | returned `true`  | no effect on Linux     |
| `DEFAULT_WAL_SYNCHRONOUS`           | 1 (NORMAL)                        | 2 (FULL)         | 2 (FULL)               |
| `DEFAULT_CKPTFULLFSYNC`             | yes                               | no               | no                     |
| `ENABLE_SETLK_TIMEOUT`              | yes                               | no               | no                     |
| `synchronous` on a fresh connection | **1**                             | 2                | 2                      |
| Each pragma read back               | as set                            | as set           | as set                 |
| `fullfsync=ON` read back            | 1                                 | 1                | 1 (no effect on Linux) |
| STRICT, JSONB, `BEGIN IMMEDIATE`    | all work                          | all work         | all work               |

The pragmas are `journal_mode=WAL`, `synchronous=FULL`, `busy_timeout=2000`,
`foreign_keys=ON` and `wal_autocheckpoint=1000`. STRICT rejected text in an
INTEGER column.

On Apple's build a new connection to a WAL database starts at NORMAL, so
every connection sets FULL and reads it back. Bun's docs: call
`setCustomSQLite` "before creating any Database instances"; on Linux "the
call does nothing and returns `false`"
([bun.com/docs/runtime/sqlite](https://bun.com/docs/runtime/sqlite)).

## The open routine

A sketch for `src/adapters/store/`, not built:

```ts
import { Database } from "bun:sqlite";

const HOMEBREW_SQLITE = "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib";

const chooseLibrary = (): void => {
  if (process.platform !== "darwin") return; // Bun's bundled build
  if (!Database.setCustomSQLite(HOMEBREW_SQLITE)) {
    throw new StoreRefused("Homebrew SQLite not loaded: brew install sqlite");
  }
};

const versionAllowed = (v: string): boolean => {
  const [major, minor = 0, patch = 0] = v.split(".").map(Number);
  if (major !== 3 || minor === 52) return false; // 3.52 withdrawn
  return minor > 51 || (minor === 51 && patch >= 3); // WAL-reset fix
};

export const openStore = (
  path: string,
  role: "command" | "daemon",
): Database => {
  chooseLibrary(); // once per process, before any Database
  const db = new Database(path, { create: true, strict: true });
  const one = (sql: string) => Object.values(db.query(sql).get() ?? {})[0];
  const version = String(one("SELECT sqlite_version()"));
  if (!versionAllowed(version))
    throw new StoreRefused(`SQLite ${version} refused`);

  db.run("PRAGMA busy_timeout = 10000");
  if (one("PRAGMA journal_mode = WAL") !== "wal")
    throw new StoreRefused("not WAL");
  db.run("PRAGMA synchronous = FULL");
  if (process.platform === "darwin") db.run("PRAGMA fullfsync = ON");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA wal_autocheckpoint = 1000");
  if (one("PRAGMA synchronous") !== 2 || one("PRAGMA foreign_keys") !== 1) {
    throw new StoreRefused("pragma did not take");
  }
  if (role === "daemon" && one("PRAGMA quick_check") !== "ok") {
    throw new StoreRefused("quick_check failed");
  }
  return db;
};
```

Why each step, in order:

- **Library first.** Bun requires it. Every Mac process loads the same file,
  as "all connections to the same database file use the same locking
  protocol" ([howtocorrupt.html](https://www.sqlite.org/howtocorrupt.html)
  2.4).
- **Version check.** Refuses the WAL-reset range and the withdrawn 3.52.
  Apple's 3.51.0 would be refused.
- **`busy_timeout` first, at 10,000 ms.** Changing the journal mode can need
  a lock. At 2,000 ms the Mac with `fullfsync` had 3 busy errors in 600
  commands and 14 in 3,000; at 10,000 ms, none in 600.
- **`journal_mode=WAL`.** It "stays in effect across multiple database
  connections" (pragma.html), and readers do not block the writer. Read
  back, since a failed change returns the old mode.
- **`synchronous=FULL`.** "FULL is atomic, consistent, isolated, and durable
  (ACID) in WAL mode"; under NORMAL a commit "might roll back following a
  power loss or system crash" (pragma.html).
- **`fullfsync=ON` on macOS.** The owner's decision above.
- **`foreign_keys=ON`.** Off by default and "a no-op within a transaction",
  so set at open.
- **`wal_autocheckpoint=1000`.** The default, made explicit. It stays on in
  every process, because commands run with the daemon down.
- **Integrity.** Commands run no check, since every command would pay a cost
  that grows with the file. The daemon runs `PRAGMA quick_check` at start and
  will not start on anything but `ok`. Once a day when idle it runs
  `integrity_check` and `foreign_key_check` (integrity_check "does not find
  FOREIGN KEY errors"). A command that meets `SQLITE_CORRUPT` refuses.
  Measured on Homebrew (`check-cost.ts`): 10,000 rows (2.7 MB) quick 1.2 ms,
  full 2.4 ms; 100,000 rows (27 MB) quick 13.9 ms, full 49 ms; 1,000,000 rows
  (269 MB) quick 137 ms, full 1.2 s.

**Command and daemon differ only in** the daemon's checks above and its
scheduled checkpoint (see "The write-ahead log"). The pragmas are the same,
because most are per connection. Every write is one `BEGIN IMMEDIATE`
transaction, so any busy wait happens at `BEGIN`, before a write; a
`SQLITE_BUSY` means nothing was recorded. The store returns it as a typed
"store busy, nothing recorded" failure, safe to retry. Launch admission
acknowledges an intent only after `COMMIT` returns, so a busy failure never
loses a recorded intent. Commands close with `db.close(true)` before exit.

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

## The write-ahead log

Sampled every 100 ms in every contention run, the `-wal` file grew to
4,120,032 bytes, exactly 1,000 frames of 4,120 bytes plus a 32-byte header,
then stopped growing. The largest seen was 4.9 MB (1,186 frames). It never
grew without bound.

Who checkpoints, from sqlite.org: "SQLite will automatically checkpoint
whenever a COMMIT occurs that causes the WAL file to be 1000 pages or more in
size, or when the last database connection on a database file closes", run
"by the same thread that does the COMMIT" (wal.html 3.1, 2.3). Commands made over 98% of commits (600 against 0 to 9 daemon
writes per run), so a short-lived command almost always paid for the
checkpoint inside its commit (inferred from those counts; the harness did not
record which process checkpointed). With the daemon down, the last command to
close checkpoints and removes the WAL.

The WAL keeps growing only while a reader always holds it: "if there is
always at least one active reader, then no checkpoints will be able to
complete" (wal.html 6). The daemon must not hold a read transaction open
between ticks.

**Should the daemon checkpoint on a schedule?** Yes, to spare commands, not
for correctness: `PRAGMA wal_checkpoint(PASSIVE)` every 30 s. PASSIVE never
waits; FULL, RESTART and TRUNCATE block writers, so the daemon avoids them.
Automatic checkpoints stay on everywhere, because the daemon may be down. A
daemon checkpoint beside a committing command is exactly the WAL-reset bug's
condition, one more reason to refuse below 3.51.3.

## Alternatives considered: Dolt and DoltLite

Read from their repositories on 2026-11-19; neither was tested.
[Dolt](https://github.com/dolthub/dolt) (Go, v2.7.5) is a version-controlled,
MySQL-compatible database, used through `dolt` or `dolt sql-server`; Beads
embeds it with one writer and runs `dolt sql-server` for several. Under Bun it
means a server every command depends on (against the rule that a command
works with the daemon down) or starting `dolt` per command.
[DoltLite](https://github.com/dolthub/doltlite) (C, v0.51.13, Beta since
2026-08-31) is a SQLite fork on a prolly tree, shipping `libdoltlite.dylib`
and `.so` with the `sqlite3_*` API, no WAL, and one durable writer (a second
gets `SQLITE_BUSY`). On macOS `setCustomSQLite` could in principle load it
(not tried); on Linux Bun links SQLite statically, so `bun:sqlite` cannot use
it without another binding. Version control would buy a history of every
change and sync by push, pull and merge; today it costs a Beta format or a
server. **Not chosen for the first version.** The store adapter stays thin
(plain SQL through one module) so a DoltLite store could replace it later.
Sync by Dolt remotes is an open idea, not designed.

## Not tested

- Power loss and operating system crashes (SIGKILL only).
- Whether the pilot's flush reaches the host's disk: btrfs (`/dev/vdb1`, the
  same filesystem as `/home/agent/.local/state`) inside OrbStack on a Mac.
- Network filesystems: "WAL does not work over a network filesystem"
  (wal.html 1).
- A full disk, or an I/O error during a checkpoint.
- More than 20 concurrent commands, or a busier daemon.
- Long uptime: days of daemon life and file growth.
- Effect's load time, and which process ran each checkpoint.
- `brew upgrade sqlite` under a running daemon.

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
