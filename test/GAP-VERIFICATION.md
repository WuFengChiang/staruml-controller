# What the gap fixes were actually verified against

Measured against StarUML 6 with the extension reloaded, on an empty scratch
project. Recorded here because the numbers are easy to lose and easy to
misquote: each row below says which layer produced it.

Four runs, each against different code:

| # | Date | Build | Gap checks | Endpoint suite |
|---|---|---|---|---|
| 1 | 2026-08-31 | the seven gap fixes | 12 pass, 3 fail | 428 / 0 |
| 2 | 2026-09-01 | plus the six review findings | 29 / 0 | **aborted** |
| 3 | 2026-09-01 | plus the serializer fix run 2 exposed | 29 / 0 | 428 / 0 |
| 4 | 2026-09-05 | plus the twelve A/B/C gap-report fixes | 71 pass, 4 fail | 426 / 2, 2 skipped |

Run 1's three failures were all faults in the check, not in the fix; they are
fixed and run 2 covers what they were meant to.

Run 4's six failures are not the same story, and that difference matters: two of
them are a real defect in this build. They are worked through under "Run 4"
below. Do not read run 1's precedent onto them.

Run 2 was killed after `GET /api/class/classes` stopped answering and stayed
that way for six minutes. That was a real bug, described under "What the live
run found" below. Its 29/0 stands — the gap checks completed before the suite
started — but its endpoint suite result does not exist, so nothing should quote
one.

The "Results" and "What the live run found" sections below describe run 3. Run 4
has its own section further down.

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

## Run 4 — the twelve gap-report fixes, 2026-09-05

The first time the A/B/C fixes in `docs/GAP-REPORT-REPLY-2026-09-05.md` met the
real engine. Everything the earlier runs covered still holds: gaps 1 through 7,
the attribute retype, A-3, B-1, B-2, B-3, C-1, C-2, C-3 and the sequence-diagram
layout refusal all came back clean. What follows is the six checks that did not,
and two of the six are a real defect in this build.

| Check | What came back | Verdict |
|---|---|---|
| A-1 "its views were not destroyed" | `{"before": 1, "after": 4}` | the check is wrong |
| A-2 "the label sits within a pixel of where it was asked" | `{"left": 866, "top": 34}`, asked for 900/40 | **a defect, not fixed** |
| A-2 "left/top survived the save" | the same two numbers, read out of the `.mdj` | the same defect, one step later |
| C-4 "both messages report a messageIndex" | `{"moved": 2, "other": null}` | the check reads a field the GET route does not serve |
| suite 138a `gen_create_child(UMLInputPin)` | `StarUML created no element for type "UMLInputPin"` | the fix working as intended |
| suite 138b `gen_create_child(UMLOutputPin)` | the same, for `outputs` | the same |

Two suite cases were skipped for want of a BPMN start event and a link object.
Neither is related to this change set.

The verdicts above are what run 4 measured. All six have since been acted on —
see "Fixed after run 4" at the end of this section for what changed and what
that leaves unproven.

### A-2 converts left/top with a size the label does not have yet

> **This section was wrong when first written, on 2026-09-05.** It said the
> controller's inverse "skips the subtraction" of half the label's width and
> height. It does not — the conversion is at api-handler.js:5777 and always was.
> That claim came from reading the snapshot's numbers and never opening the four
> lines that do the work. What follows replaces it, and the fix follows from the
> corrected reading rather than the original one.

The controller takes a requested `left`/`top`, converts it to the centre
`arrangeObject` measures from, inverts StarUML's geometry to recover
`alpha`/`distance`, and writes those. The conversion is present and correct.
What it lacked was a size to convert with.

`View`'s constructor assigns neither `width` nor `height` (`class View` in
`app.asar`, idx 23646704 — the constructor sets model, subViews, colours and
font, and no geometry). A label gets its size from `LabelView.arrange`, which
measures the text on a canvas (idx 23693980). So on a label that has never been
drawn, `view.width` is undefined, the controller's `(view.width || 0)` takes
zero, and the conversion moves the point nowhere. `arrangeObject` then subtracts
the real half-width and half-height, and the label lands that much short.

Which of the two it was is a matter of arithmetic. The live label measured
70.21 x 13 after the draw:

| size at write time | where the label should land | live result |
|---|---|---|
| `width` already 70.21 | 900 / 40 — the request | — |
| `width` still undefined | 865 / 34 | **866 / 34** |

The second line matches, `top` exactly and `left` within the one pixel the two
`Math.floor` calls account for. The first is out by 34. Both A-2 failures are
this one state — the second only reads the same pair back out of the `.mdj`.

**The fix** (api-handler.js:5764) draws the diagram once before reading the
size, and only when the size is missing, so a label that already has one behaves
exactly as before. `arrangeDiagram` is `editor.repaint()`, which measures
without touching the undo stack. The anchor is now read after that draw, because
a repaint can move the host edge's points.

**Why the offline tests could not see it.** Not because the mock is wrong:
`test/mock-staruml.js` copies `arrangeObject` faithfully, half-width subtraction
included (lines 304–305 and 328–329). Because every A-2 test assigned
`label.width = 60` before writing a position. That hands the controller a size
the live engine does not have yet, so the conversion had real numbers to work
with and the round trip closed — all 18 edge directions and anchor combinations
included.

The blind spot was the state, not the arithmetic: **no test had ever written a
position to a label that had not been drawn.** One does now, and the mock
reproduces the engine's order of operations — measure, then arrange. With the
fix reverted it fails the way the live run did: 400/120 asked, 365/113 landed.

### A-1's check binds the view count, and four is the normal number

`GET /api/elements/:id/views` answered 1 before the endpoint move and 4 after,
and the check asserts the two are equal. Four is the right number, and 1 is the
misleading one:

- In the run's own snapshot, `moves` (the association whose end was moved) and
  `labelled` (one that was never reconnected) **both** hold four views — one
  `UMLAssociationView` plus three `EdgeLabelView`.
- On the user's real project, an existing association untouched by any of this
  answers 4 as well.

Four is what an association on a canvas is made of: the line and its three
labels. The check read `before` immediately after `POST /api/class/associations`,
while the label subviews had not yet reached the index `getViewsOf` walks, so it
captured 1 and froze that as the expected value. A-1's other four checks — the
id survives, the reference reads back, it survives the save, and an end still
cannot be pointed at a package — all passed. Nothing about A-1 is broken. The
assertion should say the views survived, not that there are still exactly as
many as happened to be visible a moment earlier.

### C-4's ordering claim is still unverified

`messageIndex` is attached in `createMessage` (api-handler.js:3840) and in
`updateMessage` (api-handler.js:4118). `GET /api/seq/messages/:id` does not
attach it. The check reads the moved message's index from the PUT response and
the other message's from a GET, so it got `{"moved": 2, "other": null}` and had
nothing to compare.

C-4's central claim — that moving a message re-sorts `interaction.messages` —
**was therefore not tested against the live engine.** What was tested is that
the create call reports an index and that the move is accepted.

The check was not careless: README's endpoint table said `GET` returned
`messageIndex` alongside `PUT`, and the check was written against that sentence.
The documentation was wrong, and this run is what caught it — that line is now
corrected, in the table and in the "Moving a Message" section above it. Serving
`messageIndex` from the GET route would close the same gap from the other side,
and let the check do its job.

### The two suite failures are the fix, not a regression

Run 3 scored 428/0 and this run scored 426/2, which reads like something broke.
It did not. `UMLInputPin` and `UMLOutputPin` are not registered with StarUML's
model factory at all — `registerModelFn` in `app.asar` registers 90 types and
not one of them contains "Pin" — so `app.factory.createModel` returns null for
both, and always did.

What changed is what the controller does with that null. Commit `f27fe41` added
the check that refuses instead of reporting success. The `options` object, the
`createModel` call, and the `CHILD_TYPE_DEFAULT_FIELDS` entries mapping
`UMLInputPin` to `inputs` and `UMLOutputPin` to `outputs` are all context lines
in that diff — unchanged. Before it, these two calls answered `success: true`
and handed back an element the repository had never registered. `check()` in the
suite reads `success` and nothing else, so the suite scored them as passes for
as long as the lie held.

**The suite's expectation for 138a/138b is now wrong and should be inverted.**
Until it is, 426/2 is the passing score for this build.

This also corrects a claim in `docs/GAP-REPORT-REPLY-2026-09-05.md`, which
compared the change set against the suite statically and concluded the suite
would not be disturbed. That comparison walked the four behaviours the change
set altered on purpose, and never asked which previously-passing cases the new
null check would flip. Two of them flipped.

### Fixed after run 4

All six failures were acted on the same day. **None of it has been back through
the live engine** — the offline suite is 137/0 with these changes, and that is
the whole of the evidence.

| What | Change | How far it is proven |
|---|---|---|
| A-2's missing size | api-handler.js:5764 draws once before reading `width`/`height`, and only when they are absent | offline: a never-drawn label now lands on the request, and fails at 365/113 with the fix reverted |
| C-4's unreadable index | `attachMessagePlace` serves `messageIndex` from GET as well as create and update, one function for all three | offline suite unaffected; the ordering claim itself still needs a live run |
| A-1's bound view count | the check asserts the `UMLAssociationView` survived and the count did not shrink, rather than an exact match | not re-run |
| suite 138a/138b | a new `check_refused` helper expects the refusal and matches the reason | not re-run |

What a live run would still settle: whether A-2 now lands within the one pixel
the floors allow, and whether the interaction's message list really does
re-sort. Until then, treat both as offline-only.

## Not covered

- **The nine types restored to a list endpoint.** `test/test_offline_units.js`
  proves the configs declare them and that a widened relation answers get, update
  and delete — but against the mock. Nothing has yet created a
  UMLStructuredActivityNode or a UMLTimeConstraint on a live engine and listed it
  back. Five of the nine are creatable through this API, so that check is
  writable; the other four are not, and would need a model built in the GUI.

- **C-4's message reordering.** Run 4 accepted the move but could not read the
  second message's position back, so nothing has yet shown that the interaction's
  message list re-sorts. See "C-4's ordering claim is still unverified" above.

- **A-2's label placement, now that it is corrected.** The fix is in and the
  offline suite covers the state that produced the failure, but no live run has
  confirmed a never-drawn label lands on its request against the real engine.

## Known, not addressed

`component/dependencies`, `composite/dependencies`, `deployment/dependencies` and
`usecase/dependencies` still answer for `UMLDependency` alone. UMLAbstraction and
SysMLTrace are reachable through `class/dependencies`, which is enough to keep
them findable, so the other four were left as they are — deliberate, and
untested from those four paths.
