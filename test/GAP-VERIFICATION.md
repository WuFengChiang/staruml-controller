# What the gap fixes were actually verified against

Measured against StarUML 6 with the extension reloaded, on an empty scratch
project. Recorded here because the numbers are easy to lose and easy to
misquote: each row below says which layer produced it.

Three runs, each against different code:

| # | Date | Build | Gap checks | Endpoint suite |
|---|---|---|---|---|
| 1 | 2026-08-31 | the seven gap fixes | 12 pass, 3 fail | 428 / 0 |
| 2 | 2026-09-01 | plus the six review findings | 29 / 0 | **aborted** |
| 3 | 2026-09-01 | plus the serializer fix run 2 exposed | 29 / 0 | 428 / 0 |

Run 1's three failures were all faults in the check, not in the fix; they are
fixed and run 2 covers what they were meant to.

Run 2 was killed after `GET /api/class/classes` stopped answering and stayed
that way for six minutes. That was a real bug, described under "What the live
run found" below. Its 29/0 stands — the gap checks completed before the suite
started — but its endpoint suite result does not exist, so nothing should quote
one.

Everything below describes run 3 unless it says otherwise.

## Three layers, and what each one can and cannot show

| Layer | Command | Shows | Cannot show |
|---|---|---|---|
| Offline units | `node test/test_offline_units.js` | the controller's own logic | whether StarUML keeps what was written — the mock assigns properties straight through, so it can never produce an `ignored` result |
| Live gap checks | `test/verify_gaps_live.py`, via the runner | what the engine did with the write, read back on a second call | only the seven gaps it was written for |
| Endpoint suite | `test/test_all_endpoints.sh`, via the runner | nothing regressed | nothing about correctness — `check()` reads `success` and no value |

Run the last two only through `bash test/run_integration_safely.sh`. It parks the
open project, switches to an empty one, and reopens the original from an EXIT
trap. `verify_gaps_live.py` writes into whatever project is open; use
`python3 -m py_compile` to check it parses.

## Results

| Gap | Verdict | Evidence |
|---|---|---|
| 1 — lists leak subtypes | holds | A UMLRealization is created first, then checked to be absent from `class/dependencies` and present under `class/realizations` — the first run could not show this, because an empty dependency list satisfies "contains no subtypes" without testing anything. `component/components` excluded UMLSubsystem after one was created. On the real project `GET /api/class/classes` returned 94 rows, `_type` all `UMLClass`. |
| 2 — operation return type | holds | `POST /children` with `{"direction":"return","typeId":<class>}`, then read back through `GET /children?field=parameters`: both fields survived. This is the one answer no offline test could give. |
| 3 — lifeline classifier | holds | `representTypeId` written, read back on `GET /api/seq/lifelines/:id` unchanged, with `representTypeName: "Cashier"` alongside. |
| 4 — clamped message y | holds | y=200 landed at 200 with no report. y=900 landed at 242, y=5000 at 942, each reported as `[{"field":"y","requested":…,"actual":…}]`. **The ceiling moves with the diagram's contents — 242 is not a constant.** |
| 5 — x1/y1 placement | holds | `left: 680, top: 420, width: 100, height: 80` for a class created with x1/y1 only: placed where asked, default size intact. |
| 6 — hardcoded version | holds | `/api/status` returned `1.1.2`, matching package.json. |
| 7 — association end id | holds | `end1._id` present, different from `end1.reference`, and a `documentation` write through that id succeeded. |
| retyping an existing attribute | works | `PUT /api/elements/:id` with `typeId` on a UMLAttribute created earlier, read back through `GET /children?field=attributes`: the new type survived. Reported elsewhere as impossible short of delete-and-recreate, which was itself blocked. |

On the first run, gaps 3, 4 and 5 reported as failures. All three were faults in
`verify_gaps_live.py`, not in the fixes, and all three are fixed:

- it read geometry from `GET /api/elements/:id/views`, which answers *which
  diagrams show this element* and carries no coordinates at all. Geometry is on
  `GET /api/diagrams/:id/views`. Every value came back absent, which reads
  exactly like a positioning bug.
- it created the sequence diagram before the interaction, but
  `POST /api/seq/diagrams` requires `parentId` and it must be a UMLInteraction.
  Gap 3 failed outright and took Gap 4 down with it.
- it did not check `success` on reads, so a missing route degraded into an empty
  list rather than an error.

## What the live run found that nothing else could

`GET /api/class/classes` stopped answering partway through the second run — no
response, no error, the request never returned. Its serializer emitted an
attribute's `type` field as-is, and that field holds either a plain string or a
reference to a classifier. Given a reference it returned the element whole, and
`_parent` brought the model tree in behind it.

Three things had to line up, which is why it surfaced only here:

1. `serializeElement` reports `typeId`/`typeName` and never the element. The
   family-class serializer did not. Two paths, same job, different answers.
2. They could disagree in silence because nothing could put a reference in that
   field. Attributes in a real model were typed by hand as strings.
3. Making `typeId` writable removed that. The gap check that retypes an existing
   attribute created the first classifier reference this endpoint had ever been
   asked to serialise.

The offline tests could not have caught it as they stood: mock elements have no
parent chain, so the cycle never forms. They now walk every list route and fail
on a raw `_parent` in any response, which is what a whole element looks like on
the way out.

Worth keeping in mind for the next fix in this area: **making a field writable
can be what exposes a reader that was never asked to handle it.**

## Not covered

- **The nine types restored to a list endpoint.** `test/test_offline_units.js`
  proves the configs declare them and that a widened relation answers get, update
  and delete — but against the mock. Nothing has yet created a
  UMLStructuredActivityNode or a UMLTimeConstraint on a live engine and listed it
  back. Five of the nine are creatable through this API, so that check is
  writable; the other four are not, and would need a model built in the GUI.

## Known, not addressed

`component/dependencies`, `composite/dependencies`, `deployment/dependencies` and
`usecase/dependencies` still answer for `UMLDependency` alone. UMLAbstraction and
SysMLTrace are reachable through `class/dependencies`, which is enough to keep
them findable, so the other four were left as they are — deliberate, and
untested from those four paths.
