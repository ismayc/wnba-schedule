# Findings

Durable notes from working on this project: root causes, constraints, and
decisions with the reasoning behind them. Each file is one finding, dated, with
the evidence that established it.

These are things that were **not obvious** and cost real effort to work out —
not a changelog, and not a restatement of what the code already says.

| Finding | Date | What it covers |
|---|---|---|
| [Coverage lost to a borrowed clock](wall-clock-coverage-flake.md) | 2026-07-26 | A branch covered incidentally by another test's pinned clock, and how a data refresh took it away |
| [Spoiler-free is the default](spoiler-free-default-on.md) | 2026-07-26 | Precedence, why the URL now carries the opt-out, and the test fallout |
