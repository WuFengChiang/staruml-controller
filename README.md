# StarUML Controller

A [StarUML](https://staruml.io/) extension that exposes full diagram CRUD operations for all StarUML diagram types via an HTTP REST API.

Supports UML (class, sequence, use case, activity, state machine, component, deployment, object, communication, composite structure, timing, interaction overview, information flow, profile), BPMN, C4, SysML, Wireframe, MindMap, AWS, Azure, GCP, Flowchart, DFD, and ERD.

Designed for integration with AI tools such as Claude Code (via MCP) to programmatically create and edit any StarUML diagram.

<p align="center">
  <img src="images/image1.gif" alt="AI generating a Web Shopping ER diagram in StarUML via REST API" width="800">
  <br>
  <em>An AI tool creating a complete Web Shopping ER diagram through the StarUML Controller API</em>
</p>

<p align="center">
  <img src="images/image2.jpg" alt="PostgreSQL DDL generated from an ER diagram by StarUML Controller" width="800">
  <br>
  <em>PostgreSQL DDL exported from the ER diagram via the API</em>
</p>

<p align="center">
  <img src="images/image3.gif" alt="AI generating a Login Check sequence diagram from source code in StarUML via REST API" width="800">
  <br>
  <em>An AI tool analyzing source code and generating a Login Check sequence diagram through the API</em>
</p>

## Architecture Overview

<p align="center">
  <img src="images/architecture.svg" alt="Architecture overview: Claude Code communicates with staruml-controller-mcp via MCP protocol, which connects to StarUML's staruml-controller extension via HTTP REST API" width="800">
</p>

## Supported Versions

- Tested on StarUML v7 (should also work on v6)

## Features

- **All diagram types** - UML, BPMN, C4, SysML, Wireframe, MindMap, AWS, Azure, GCP, Flowchart, DFD via generic and dedicated family APIs
- **Dedicated family APIs** - 23 diagram families with type-specific CRUD endpoints (Class, Use Case, Activity, State Machine, Component, Deployment, Object, Communication, Composite Structure, Information Flow, Profile, Timing, Interaction Overview, Flowchart, DFD, BPMN, C4, SysML, Wireframe, MindMap, AWS, Azure, GCP)
- **All element types** - create any node element on any diagram (UMLClass, BPMNTask, C4Person, SysMLRequirement, WFButton, MMNode, AWSService, etc.)
- **All relation types** - UMLAssociation, BPMNSequenceFlow, C4Relationship, SysMLDeriveReqt, MMEdge, AWSArrow, etc.
- **Full CRUD for ERD elements** - data models, diagrams, entities, columns, tags, relationships, sequences, and indexes
- **Full CRUD for sequence diagram elements** - interactions, sequence diagrams, lifelines, messages, combined fragments, operands, state invariants, and interaction uses
- **Shapes** - create and manage view-only elements (Text, TextBox, Rect, RoundRect, Ellipse, Hyperlink, Image, UMLFrame)
- **Notes, note links, and free lines** - annotate any diagram
- **View manipulation** - move/resize views, update styles (fillColor, lineColor, fontColor, fontSize, autoResize, stereotypeDisplay, etc.), reconnect edges, align/distribute views
- **Edge shape** - set a line style, place waypoints by hand, or have a route worked out that avoids the other boxes
- **Child elements** - create attributes, operations, enumeration literals, pins, etc. under parent elements
- **Diagram export** - export diagrams to PNG, JPEG, SVG, or PDF; bulk export all diagrams; export project as HTML/Markdown
- **Auto layout** - automatic diagram layout with configurable direction and spacing
- **Undo / Redo** - undo and redo operations programmatically
- **Search** - search elements by keyword with optional type filter
- **Model validation** - validate model integrity
- **Input validation** - unknown fields rejected, type checking, required field enforcement, column type whitelist
- **Referential integrity** - DELETE blocked when other elements reference the target; self-reference prevention
- **Structured responses** - every response includes `success`, `message`/`error`, `request` context, and `data`
- **PostgreSQL DDL generation** - generate DDL from ER diagrams with schema prefix, FK auto-indexes, DEFAULT values (based on [staruml-postgresql](https://github.com/adrianandrei-ca/staruml-postgresql))
- **Mermaid import** - generate StarUML diagrams from Mermaid syntax (class, sequence, flowchart, ER, mindmap, requirement, state)
- **Diagram generation** - auto-generate overview, type hierarchy, or package structure diagrams from model
- **Project management** - save, open, new, close, import/export model fragments
- **CORS enabled** - accessible from any origin

## Installation

Clone or copy this repository into the StarUML extensions folder:

```
# macOS
~/Library/Application Support/StarUML/extensions/user/staruml-controller

# Windows
%APPDATA%\StarUML\extensions\user\staruml-controller

# Linux
~/.config/StarUML/extensions/user/staruml-controller
```

Restart StarUML to load the extension.

## Usage

### Starting the Server

1. **Launch StarUML** and open a project (or create a new one)

2. From the menu bar, select **Tools > StarUML Controller > Start Server...**

<p align="center">
  <img src="images/image4.jpg" alt="Tools menu showing StarUML Controller submenu with Start Server and Stop Server options" width="700">
</p>

3. A dialog appears asking for the port number. Enter a port (default: `12345`) and click **OK**

<p align="center">
  <img src="images/image5.jpg" alt="Port number input dialog with default value 12345" width="400">
</p>

4. The HTTP server starts and all diagrams become accessible via REST API

### Stopping the Server

Select **Tools > StarUML Controller > Stop Server** from the menu bar.

## Write Reporting

StarUML accepts a write and then silently changes or discards it: a view height
below the content minimum is clamped, a message dropped below the previous one is
pushed back up, a field whose target does not exist goes nowhere. A response that
says `success: true` and `Updated ...` for such a write is misleading — and the
mistake only surfaces on export.

Every create and update endpoint therefore compares each field before and after
the write and classifies it:

| Outcome | Meaning |
|---|---|
| updated | stored as asked |
| `clamped` | stored, but as a different value |
| `ignored` | not stored; the previous value stands |

`clamped` and `ignored` appear in the response **only when non-empty**, each entry
carrying `field`, `requested`, `actual` and sometimes a `reason`. The `message`
names them too, so a caller that reads only `success` and `message` still learns
the write was refused:

```json
{
  "success": true,
  "message": "Updated view (fields: left) — CLAMPED: height (requested 1, actual 324)",
  "data": { "left": 430, "height": 324 },
  "clamped": [{ "field": "height", "requested": 1, "actual": 324 }]
}
```

A clean write returns exactly what it always did — no new fields, and a message in
the original shape.

## Setting an Element's Type

An attribute's type, a parameter's type, and the classifier a lifeline stands for
are the same thing underneath: a `type` property holding either a reference to a
classifier or a plain string. Two fields write it wherever it exists.

| Field | Takes | Stores |
|---|---|---|
| `typeId` | an element id, or `null` to clear it | a reference to that classifier |
| `typeName` | a bare type name | the string as given |
| `type` | a bare type name | the same as `typeName` |

They are mutually exclusive — sending two of them is refused rather than
resolved by picking one. `typeId` is refused unless it names a UMLClassifier,
and all three are refused on an element with no type property at all, so a write
is never reported as successful when the engine would discard it.

`type` exists on `PUT /api/elements/:id` because `POST .../attributes` has always
taken that spelling, and the read side reports all three. One verification script
wrote `typeName` through the family endpoint, read `type` back, found nothing,
and reported 24 correct writes as failures. Whichever name you write, you can
read the same value back under any of them.

One place keeps the two apart on purpose. On
`POST /api/elements/:id/children`, `type` names the element **class** to build
(`UMLParameter`), while `typeName` and `typeId` name the type that element
**has** (`Money`). No alias there — they mean different things.

`PUT /api/elements/:id` takes them for any structural feature, and
`POST /api/elements/:id/children` takes them while creating one — which is what
makes an existing attribute's type changeable at all. Before, the only way to
change it was to delete the attribute and build a replacement.

Of the child types this API creates, these are structural features and accept a
type: UMLAttribute, UMLParameter, UMLPort, UMLInputPin, UMLOutputPin,
SysMLProperty and SysMLFlowProperty. UMLSlot is not one, so the write is refused
with a message that says so rather than reporting a write that went nowhere.

> **Correction, 2026-09-05.** This paragraph used to say UMLSlot "has no type
> property". That is wrong: StarUML's metamodel gives UMLSlot a `type` of kind
> `var` holding a UMLClassifier, alongside `definingFeature` and `value`. The
> refusal is real, but its cause is the gate itself — the check asks whether the
> element is a `UMLStructuralFeature`, and UMLSlot descends from
> `UMLModelElement` instead. So this is an over-strict refusal, not an absent
> property. Left as it is for now, and recorded here so the next reader does not
> repeat the claim.

An operation's return type is a parameter whose `direction` is `return`, so it
takes one call:

```bash
curl -X POST "http://localhost:12345/api/elements/$OP_ID/children" \
  -H 'Content-Type: application/json' \
  -d '{"type":"UMLParameter","name":"result","direction":"return","typeId":"'"$CLASS_ID"'"}'
```

Two classes carry a `direction`, and they do not accept the same values.
UMLParameter takes `in`, `inout`, `out` or `return`. SysMLFlowProperty takes
`in`, `out` or `inout` — there is no `return` on a flow property. Each is checked
against its own list, so `return` on a flow property is refused rather than
written and dropped by the engine.

Read the parameters back with `GET /api/elements/:id/children?field=parameters`.
Name the field you wrote to: without `field` the call walks a fixed set of
container fields (attributes, operations, parameters, literals, ports and the
rest), and that is not the same set `POST .../children` can write into — POST
accepts any `field`. Reading accepts any field the parent actually carries as a
collection, `ownedElements` included; a field it does not carry is still an
error, so a typo reports itself instead of coming back empty.

A lifeline puts the same idea one level further down. `UMLLifeline.represent`
holds a role, and the classifier sits on that role's type, which is why
`representTypeId` and `representTypeName` on `/api/seq/lifelines/:id` reach
through the role rather than naming it. Setting `representTypeId` to a class is
what makes a lifeline read `ui : OrderService`.

A lifeline with no role cannot take a type at all. That is checked before
anything is written, so a rejected update leaves the lifeline exactly as it was —
earlier it applied the name first and reported the failure afterwards, and the
name really had changed.

## Placing a New Element

Every create-on-a-diagram endpoint takes `x1`, `y1`, `x2`, `y2`. `x1`/`y1` are the
top-left corner and `x2`/`y2` the bottom-right, and you can send just the corner:
`x2`/`y2` then default to a size measured from it, so the element lands where you
put it.

Until this was fixed, `x2`/`y2` defaulted to fixed coordinates instead. Sending
`x1: 680, y1: 420` with no `x2`/`y2` produced the rectangle (680,420)-(200,180),
which StarUML normalises to `left: 200, top: 180, width: 480, height: 240` — the
element sat at (200,180) and was 480 wide. Anything placed past the default
corner stacked in that one spot, and nothing in the response showed it. Sending
all four coordinates always worked, and still behaves exactly as before.

## What a List Endpoint Returns

`GET /api/{family}/{resource}` returns elements of exactly the declared type.

It used to return subtypes as well, because StarUML's `select('@Type')` matches
the whole inheritance chain. So `component/components` also handed back every
UMLSubsystem and UMLUseCaseSubject in the model, and `class/dependencies` mixed
in every realization. Nothing failed — a caller just got a plausible row count
made of the wrong elements, which is the kind of mistake that only surfaces
later. Get, update and delete had always matched exactly; only listing differed.

Twenty-four resources changed behaviour — every one whose declared type has a
subtype in StarUML's metamodel. The `dependencies` endpoints changed most:
`component`, `composite`, `deployment` and `usecase` each stopped returning
thirteen kinds of relationship, and `class/dependencies` eleven, because
UMLAbstraction and SysMLTrace are declared there. `class/classes` stopped
returning eight, UMLStereotype and the SysML blocks among them.

Most of those subtypes already had a list of their own — UMLStereotype under
`profile/stereotypes`, UMLEnumeration under `class/enumerations`,
UMLInterfaceRealization under `class/interface-realizations` — and keeping them
out of the parent list is the point. Nine did not, in two different ways.

Five this API can create, so it could make something no endpoint would ever
report: UMLStructuredActivityNode, UMLActivityParameterNode, UMLTimeConstraint
and UMLDurationConstraint, all in `allowedNodeTypes`, plus SysMLFlowProperty in
`allowedChildTypes`. A caller cannot tell "I never made it" from "I cannot find
it", so it makes another one.

The other four have no create route here at all — UMLIntervalConstraint,
UMLAbstraction, SysMLTrace and SysMLItemFlow arrive from the GUI or an import.
They were not creatable-and-lost; they were simply invisible to an API being
asked to read someone else's model.

They are listed again through `modelTypes`, which lets a resource or a relation
answer for several exact types. `class/dependencies` declares
`['UMLDependency', 'UMLAbstraction', 'SysMLTrace']`: the two orphans have no
endpoint of their own, while the realizations keep theirs and stay out.
`modelTypes` widens listing, get, update and delete only — `type` still decides
what the endpoint creates.

`test/test_offline_units.js` keeps this honest. It reads every family config plus
StarUML's inheritance table (`test/metamodel-inheritance.json`, regenerated by
`test/dump_metamodel_inheritance.py`) and fails if any model type whose ancestor
is listed has no list of its own. Two types are excluded by name: C4Model, an
auto-created container, and SysMLAbstractRequirement, an abstract base with no
view.

## Moving a Relation's Endpoint

An association drawn to the wrong class used to mean deleting it and building a
replacement. That changes the association's `_id`, and every view of it
disappears with it — each diagram then has to be re-drawn and re-arranged by
hand. Three such moves in one session cost three deletions, three rebuilds, four
views re-created and a re-layout.

`end1` and `end2` now take a `reference`, which is the id of the element that end
should attach to:

```bash
curl -X PUT "http://localhost:12345/api/class/associations/$ASSOC_ID" \
  -H 'Content-Type: application/json' \
  -d '{"end2":{"reference":"'"$NEW_CLASS_ID"'"}}'
```

The association keeps its id and its views. `referenceId` is accepted as the same
field under the other name; sending both is refused.

Every view of the relation moves with the model. On a diagram that already shows
the new element, the edge is re-pointed at it and its waypoints are cleared so it
routes to the new position. A diagram that does **not** show the new element
cannot be re-pointed — an edge view needs a node view on its own diagram to
attach to — so that diagram keeps drawing the old endpoint and says so:

```json
{
  "success": true,
  "message": "Updated association (fields: end2.reference) — IGNORED: end2.view[Overview] ...",
  "ignored": [{
    "field": "end2.view[Overview]",
    "requested": "NewTarget",
    "reason": "\"NewTarget\" has no view on this diagram, so it still draws the old endpoint. Add a view of the new element to that diagram, then call PUT /api/views/<id>/reconnect"
  }]
}
```

The model is still correct in that case; only that one picture lags. Refusing the
whole write instead would put you back to deleting and rebuilding, which is the
cost this exists to remove.

An association end is checked against UML, not just against the metamodel.
StarUML declares `RelationshipEnd.reference` as a reference to any `Model`, so
the engine would happily attach an association to a package. A `UMLAssociation`
end is refused unless the target is a UMLClassifier.

`PUT /api/views/:id/reconnect` still exists and does the same job from the view
side, one diagram at a time. Use it when the two elements are already drawn and
you only want that one picture changed.

## Positioning an Edge Label

An edge label — an association's name, its multiplicities, a message's text —
stores no position of its own. StarUML recomputes `left` and `top` on every
arrange pass from two numbers: `alpha`, the angle from an anchor on the host
edge, and `distance`, the offset along it. Assigning `left`/`top` directly used
to look accepted and was overwritten by the next repaint.

`PUT /api/views/:id` now takes `left`/`top` on any parasitic view and converts
them, using the same arithmetic a mouse drag uses:

```bash
curl -X PUT "http://localhost:12345/api/views/$LABEL_VIEW_ID" \
  -H 'Content-Type: application/json' \
  -d '{"left":900,"top":40}'
```

The request goes through StarUML's own `Engine.moveParasiticView`, which sets
`alpha`/`distance`, draws the diagram so arrange recomputes `left`/`top`, and
records all four as one undoable operation. The recomputed coordinates are
therefore in the model — and in the `.mdj` after a save — without exporting an
image to force a redraw.

Arrange floors its arithmetic twice, so a requested `left` of 900 can settle at
899. That one pixel is reported in `clamped`; it is never rounded away into a
claim the write landed exactly.

> **Corrected 2026-09-05, after the first live run — twice.** The first live run
> asked for `left: 900, top: 40` and got 866/34: off by half the label, not by a
> pixel. A note here then blamed the conversion for never subtracting that half.
> That was wrong, and this replaces it.
>
> The conversion was always there. What it needed was a size, and a label has
> none until it has been drawn: `View`'s constructor assigns no `width` or
> `height`, and `LabelView.arrange` is what fills them in by measuring the text
> on a canvas. On a label created a moment earlier, `width` was undefined, the
> conversion took it as zero and moved the point nowhere, and arrange then
> subtracted the real half-width the request had never accounted for.
>
> **Fixed and verified.** A `left`/`top` request on a view with no measured size
> now draws the diagram first, so the size is the one arrange is about to use. A
> label that already has a size is untouched by this. On the live engine the same
> request that landed at 866/34 now lands at 900/40 exactly, and survives the
> save — see runs 4 and 5 in `test/GAP-VERIFICATION.md`. Whether `clamped`
> reported the 34-pixel gap while the defect stood was never checked.

`alpha` and `distance` still work and are still the values StarUML stores. Note
what that means for a hand-placed label: dragging one on the canvas writes
`alpha`/`distance` too, so a hand position is not lost when the diagram is
redrawn — but writing new ones through the API does replace it, exactly as a
second drag would.

If the label's diagram is not the one open in the editor, the draw happens on
StarUML's hidden editor, so nothing the user is looking at changes.

## Line Style and Edge Waypoints

A line on a diagram has two separable properties: the *style* that decides how
the engine bends it, and the *waypoints* that decide where it goes.

### Line style

`PUT /api/views/:id/style` takes `lineStyle` on an edge view. The five values
are `EdgeView`'s own constants:

| Value | Constant | Format menu |
|---|---|---|
| 0 | `LS_RECTILINEAR` | Rectilinear |
| 1 | `LS_OBLIQUE` | Oblique — what a new edge starts as |
| 2 | `LS_ROUNDRECT` | Rounded Rectilinear |
| 3 | `LS_CURVE` | Curve |
| 4 | `LS_DIRECT` | *no menu command* |

```bash
curl -X PUT "http://localhost:12345/api/views/$EDGE_VIEW_ID/style" \
  -H 'Content-Type: application/json' \
  -d '{"lineStyle":0}'
```

Anything outside 0–4 is refused with the list above rather than stored.
`lineStyle` is a saved integer on `EdgeView` with a default of 0, so a value the
engine cannot draw would otherwise reach the `.mdj`. Value 4 is accepted because
the engine draws it, but StarUML's own Format menu offers no way back from it —
set an edge to 4 only if the API is going to set it back.

The write goes through `Engine.setLineStyle`, which is what the Style editor
uses: it arranges the edge so its points follow the new style, repaints, and
records the labels the re-arrange moved in the same undoable operation. The
arrange happens on the hidden editor when the edge's diagram is not the one on
screen, so a line style can be set on a diagram nobody has open.

`lineStyle` is declared on `EdgeView`, not on `View`. Sending it for a node view
is refused by name rather than written and quietly dropped.

**A self-link is a permanent exception.** `EdgeView.arrangeObject` forces an edge
with both ends on the same view back to `LS_RECTILINEAR` on *every* arrange.
Asking for any other style on one reports the field in `ignored`, with that as
the reason. The value is not stored, because the arrange that follows the write
has already overwritten it.

### Waypoints

`GET /api/diagrams/:id/views` reports `lineStyle` and `points` for every edge, so
a caller can read a route back rather than guess at it.

`PUT /api/views/:id/points` replaces the route. It takes the whole thing, ends
included, and at least two points:

```bash
curl -X PUT "http://localhost:12345/api/views/$EDGE_VIEW_ID/points" \
  -H 'Content-Type: application/json' \
  -d '{"points":[{"x":115,"y":340},{"x":115,"y":520},{"x":715,"y":520},{"x":715,"y":340}]}'
```

Two things the engine does to a route are normal rather than failures, and the
response reports them in different places on purpose:

- **The two ends belong to the engine.** Every arrange snaps point 0 and the
  last point to where the line meets the tail and head boxes. Send the box
  centres and let it place them. This happens on nearly every write, so it is
  reported as `data.endsSnappedByEngine` rather than in the message, where it
  would become noise that hides the next one.
- **A waypoint inside an end box disappears.** `EdgeView.reducePoints` deletes
  any middle point that falls inside the tail or the head box. This one *is* in
  the message, naming how many points were asked for and how many were stored.

Middle points outside those boxes survive, under every line style. That is what
makes a hand-placed route stick, and it is the property routing below relies on.

### Moving a box no longer has to destroy the route

`PUT /api/views/:id` clears the waypoints of every edge on a node it moves or
resizes — the route is re-drawn as a straight line between the two centres. That
has always been this endpoint's behaviour and it is still the default, because a
route drawn for one arrangement is usually wrong for the next.

Pass `keepEdgeWaypoints: true` alongside the move to keep them:

```bash
curl -X PUT "http://localhost:12345/api/views/$CLASS_VIEW_ID" \
  -H 'Content-Type: application/json' \
  -d '{"top":300,"keepEdgeWaypoints":true}'
```

The ends still follow the box, because the engine owns them. On its own — with
no `left`, `top`, `width` or `height` — the flag is refused, since there would be
no move for it to qualify.

`PUT /api/views/:id/reconnect` always clears the route, with no opt-out. The
edge has new endpoints, so the old shape describes a line that no longer exists.

### Routing around the other boxes

`POST /api/views/:id/route` works out a right-angle route from tail to head that
misses every other box on the diagram, and writes it.

```bash
curl -X POST "http://localhost:12345/api/views/$EDGE_VIEW_ID/route" \
  -H 'Content-Type: application/json' \
  -d '{"margin":10,"grid":10}'
```

`margin` is how far the route keeps clear of a box it goes around (default 10).
`grid` is the step it plans on (default 10). A coarser grid searches a large
diagram faster and threads narrow gaps worse.

The response carries both routes: `data.points` is what the engine stored, and
`data.requestedPoints` is what the router worked out before the engine snapped
the two ends. They differ only at the ends. `data.obstacleCount` says how many
boxes the route had to consider.

**The path finding is this controller's own, not StarUML's.** The engine has
none: `recalcOblique` and `recalcRectilinear` look at `this.tail` and
`this.head` and at nothing else on the diagram, which is why a plain edge runs
straight through whatever is in the way. So the limits here are the
implementation's, and they are worth knowing:

- **Obstacles are node views only.** Other edges are not avoided — a route may
  cross another line. Treating lines as obstacles makes most diagrams
  unroutable.
- **Four things are never obstacles**: the edge's own two ends; any view that
  contains either end (a line leaving a box inside a package has to cross that
  package); edge labels and other parasitic views; and hidden views.
- **The line style is left alone.** Both recalc paths keep middle points, so the
  right-angle route draws correctly whatever the style is. Switching to
  `lineStyle: 0` afterwards is safe too: `convObliqueToRectilinear` only runs on
  a path that is not already at right angles, and this one is.
- **Failure is reported, not papered over.** If no route avoids everything, the
  response is `success: false` with the reason. It never falls back to the
  straight line and calls that success.
- **A self-link has no route to find**; the engine draws its shape itself, so
  routing one is refused.

A route written either way is a normal undoable operation: `POST /api/undo`
puts the previous shape back.

## Constraints

A `UMLConstraint` shows its `specification` on the canvas, not its name — a
constraint with no specification draws as an empty `{}`. `constrainedElements`
names the elements the constraint is about, and it is the only part of a
constraint a program can read; without it, a constraint says no more than a
sticky note would.

Both are writable through `PUT /api/elements/:id`, and both are refused on
anything that is not a UMLConstraint:

```bash
curl -X POST "http://localhost:12345/api/elements/$CLASS_ID/children" \
  -H 'Content-Type: application/json' \
  -d '{"type":"UMLConstraint","name":"paymentChoice","specification":"{xor}"}'

curl -X PUT "http://localhost:12345/api/elements/$CONSTRAINT_ID" \
  -H 'Content-Type: application/json' \
  -d '{"constrainedElementIds":["'"$ASSOC_A"'","'"$ASSOC_B"'"]}'
```

`constrainedElementIds` replaces the whole list rather than appending to it, and
every id is resolved before anything is written — a typo halfway down the list
leaves the constraint as it was. The read side reports the list back as
`constrainedElementIds` and `constrainedElementNames`.

A constraint is written into the parent's `ownedElements`. There is no
`constraints` collection on any UML class; the only one in StarUML's metamodel
belongs to SysMLBlock and holds SysMLProperty. Asking for `field: "constraints"`
on a UMLClass is now refused, with the collections that parent does have named in
the message.

## Pointing a Message at an Operation

`UMLMessage.signature` is what connects a sequence diagram to a class diagram.
UML 2.5.1 §17.12.18.7 expects the message name to match the operation name
(`signature_refer_to`) and the argument count to match the parameter count
(`signature_is_operation_request`). A model whose messages carry no signature has
two unconnected pictures rather than one traceable design.

```bash
curl -X PUT "http://localhost:12345/api/seq/messages/$MSG_ID" \
  -H 'Content-Type: application/json' \
  -d '{"signature":"'"$OPERATION_ID"'","arguments":"orderId"}'
```

`signature` takes the id the read side already reports; `signatureId` is the same
field under the other name. `null` clears it. The target must be a UMLOperation
or a UMLSignal — that is UML's rule, and it is tighter than StarUML's metamodel,
which would accept any model element. Pointing a message at a class satisfies no
UML rule and would only look like traceability.

Reading a message back reports `signatureName`, `signatureOwnerName` and
`signatureParameterCount`, so the two UML rules above can be checked without
fetching the operation.

The other UMLMessage fields are writable in the same call: `arguments`, `guard`,
`sequenceNumber`, `iteration`, `assignmentTarget` and `isConcurrentIteration`.

One thing signature does **not** change: StarUML's Java and C# code generators
read UMLOperation and UMLParameter, never `Message.signature`. Setting it
restores traceability, not code generation.

## Creating a Model Element Without a Diagram

`POST /api/{family}/{resource}` creates a model element and a view together, so
it makes you decide which diagram draws the element at the moment you create it.
`POST /api/elements/:id/children` now takes classifiers and packages too, and
creates the model element alone:

```bash
curl -X POST "http://localhost:12345/api/elements/$PACKAGE_ID/children" \
  -H 'Content-Type: application/json' \
  -d '{"type":"UMLClass","name":"Receipt"}'
```

Add a view later with `POST /api/diagrams/:id/views`, on as many diagrams as you
like or on none.

The child goes into the collection named by `field`, defaulting to the one for
its type. That default is checked against StarUML's metamodel, and the endpoint
now refuses a `field` the parent does not carry. It used to accept one: the
factory writes through `engine.addModel`, which does nothing when `parent[field]`
is not an array, and then reads the element back out of the repository where it
was never registered — so the response was `success: true` with `data: null` and
nothing in the model. Two defaults were wrong that way (`UMLConstraint` and
`UMLPort`), and one listed child type, `SysMLOperation`, is not a class in the
metamodel at all and has been removed.

## Which Fields a Build Accepts

`GET /api/status/capabilities` publishes `writableFields`: every endpoint that
takes a body, keyed by `"METHOD /path"`, with the fields it accepts.

```json
"writableFields": {
  "PUT /api/elements/:id": ["name", "stereotype", "documentation", "referenceId",
                            "typeId", "typeName", "type", "direction", ...],
  "POST /api/seq/interactions/:id/lifelines": ["name", "stereotype", "documentation",
                            "diagramId", "x", "y", "height", "representTypeId", ...],
  "PUT /api/class/classes/:id": ["name", "documentation", "isAbstract", ...]
}
```

The values are the arrays the handlers check against, not copies of them. The
family half — everything under `/api/class/`, `/api/seq/` and the other family
prefixes — is derived from the route table the router dispatches on, so a
resource added to a family config appears here with nothing else to update.

**This is the endpoint that answers "does any route accept field X".** Reading
an MCP tool's schema answers something narrower: whether that tool declares X. A
tool schema can omit a field the controller takes, and then the field cannot be
sent from an MCP client at all, because the client rejects undeclared arguments
before the request is made. That failure looks identical, from the client, to
the controller not supporting the field — which is how it has produced wrong
conclusions that then got written down and quoted.

Two checks keep the listing honest, both in `test/test_offline_units.js`:

- Every published path is probed with an unknown field. The rejection has to
  name exactly the fields the listing published. This proves the path exists,
  the method is right, and the value is the array that endpoint really enforces.
- Every `checkUnknownFields` constant in `api-handler.js` has to appear under
  some endpoint, so adding a whitelist without publishing it fails the suite.

The probe is read-only, and worth knowing as a technique on its own: field
checking runs before the lookup, so an unknown field sent to a made-up id comes
back as `Unknown field(s)` rather than `not found`, without touching anything.

```bash
curl -s -X PUT "http://localhost:12345/api/elements/probe-not-a-real-id" \
  -H 'Content-Type: application/json' -d '{"__probe__":1}'
# Unknown field(s): __probe__. Allowed fields: name, stereotype, documentation, ...
```

On the MCP side, `staruml-controller-mcp-core` has `npm run check-drift`, which
reads this endpoint and compares it against every tool's declared parameters,
reporting fields the controller takes that no tool declares.

## Undo and Redo

`POST /api/undo` used to answer `success: true` whether or not anything was
undone. `Repository.undo()` checks its own stack and returns silently when it is
empty, and StarUML exposes no `canUndo()`, so "Undo executed" was printed over a
request that did nothing — which reads as "your change was reverted" when it was
not.

The stack depth is now read before and after. An empty stack is a failure with
`Nothing to undo`, a stack that did not shrink is a failure naming the depth, and
a successful undo reports how much history is left:

```json
{
  "success": true,
  "message": "Undo executed (12 operation(s) left to undo)",
  "data": { "stackSizeBefore": 13, "stackSizeAfter": 12 }
}
```

Writes made through this API do go on the undo stack: every one of them goes
through `app.engine`, which builds an operation and hands it to
`Repository.doOperation`. A write that appears not to undo is usually a write
that never landed — check `ignored` in the original response.

## Layout and Sequence Diagrams

`POST /api/diagrams/:id/layout` is refused for a `UMLSequenceDiagram`, because
running it destroys the arrangement. The reason is not a poor choice of layout
algorithm — `UMLSequenceDiagram.layout()` is an empty stub, so no layout is
attempted at all. The damage comes from `Engine.layoutDiagram`'s own bookkeeping:
it snapshots `diagram.ownedViews[i]`, repaints, and then diffs
`diagram.ownedViews[i]` against that snapshot. A sequence diagram reorders
`ownedViews` during the repaint — `drawDiagram()` calls `regulateSequenceNumber()`
on every message view — so by the time of the diff, index `i` is a different
view, and each view is assigned another view's geometry.

To move a message, write its `y`:

```bash
curl -X PUT "http://localhost:12345/api/seq/messages/$MSG_ID" \
  -H 'Content-Type: application/json' \
  -d '{"y":320}'
```

That is also what re-sorts the interaction's message list, which is the order a
reader of the `.mdj` sees. Nothing but a draw of the diagram does that sorting,
and a draw does not happen on its own after an API write, so the request now
draws the diagram before answering and reports the resulting `messageIndex` and
`messageCount`. Before, a moved message kept its old place in the list and the
numbering on screen disagreed with the model.

> **Corrected 2026-09-05.** This table used to say `GET /api/seq/messages/:id`
> reported `messageIndex`. It did not — the field was attached in
> `createMessage` and `updateMessage` and nowhere else. The live check was
> written against that sentence, so it read one message's position from a PUT
> and the other's from a GET that answered `null`, and had nothing to compare.
>
> The GET route now serves it too, from the same `attachMessagePlace` the other
> two use. With that in place the check could finally run, and **the re-sorting
> claim in this section holds**: a message moved above another one comes first in
> `interaction.messages`. See runs 4 and 5 in `test/GAP-VERIFICATION.md`.

## The Server and Modal Dialogs

The HTTP server runs on StarUML's renderer thread, the same thread that draws
diagrams. A native modal dialog blocks that thread, and while one is open the
server accepts connections and answers nothing — `GET /api/status` included.
From a caller's side this is indistinguishable from a crash.

There is no fix available from inside the extension: `app.dialogs.showErrorDialog`
is `ipcRenderer.sendSync("show-error-box", ...)`, which blocks by design, and a
dialog StarUML raises for its own reasons cannot be observed from here either. So
the rule is that no request path raises one. The four dialog calls in this
extension are all in `main.js`, on the start-server and stop-server menu
commands, and none of them can be reached over HTTP.

If every request times out while StarUML is running and idle, look at the screen:
something is waiting for a button.

## API Endpoints

### General

| Endpoint | Method | Description |
|---|---|---|
| `/api/status` | GET | Health check. Small payload: status, version, and the open project |
| `/api/status/capabilities` | GET | Allowed type lists and the full endpoint list (~46 KB) |
| `/api/elements/:id` | GET / PUT / DELETE | Get, update, or delete any element. PUT takes `name` (empty string clears it), `stereotype`, `documentation`, `referenceId`, for structural features `typeId`/`typeName`/`type`/`direction`, and for a UMLConstraint `specification`/`constrainedElementIds` |
| `/api/elements/:id/tags` | GET / POST | List or create tags |
| `/api/tags/:id` | GET / PUT / DELETE | Get, update, or delete tag |
| `/api/elements/:id/children` | GET / POST | List or create child elements — features, constraints, and now classifiers and packages with no view. GET takes `?field=parameters` to list one container. POST refuses a `field` the parent does not carry |
| `/api/elements/:id/relationships` | GET | Get all relationships of an element |
| `/api/elements/:id/views` | GET | Get all views of an element |
| `/api/elements/:id/relocate` | PUT | Move element to a different parent |
| `/api/elements/:id/reorder` | PUT | Reorder element within parent (up/down) |
| `/api/diagrams` | GET / POST | List or create diagrams |
| `/api/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/diagrams/:id/elements` | GET / POST | List or create node elements |
| `/api/diagrams/:id/relations` | POST | Create relations |
| `/api/diagrams/:id/export` | POST | Export diagram (PNG/JPEG/SVG/PDF) |
| `/api/diagrams/:id/layout` | POST | Auto-layout diagram. Refused for a UMLSequenceDiagram — see *Layout and Sequence Diagrams* |
| `/api/diagrams/:id/open` | POST | Open diagram in editor |
| `/api/diagrams/:id/zoom` | PUT | Set zoom level |
| `/api/diagrams/:id/create-view-of` | POST | Create view of existing model on diagram |
| `/api/diagrams/:id/link-object` | POST | Create UMLLinkObject on object diagram |
| `/api/diagrams/:id/notes` | GET / POST | List or create notes |
| `/api/notes/:id` | GET / PUT / DELETE | Get, update, or delete note |
| `/api/diagrams/:id/note-links` | GET / POST | List or create note links |
| `/api/note-links/:id` | DELETE | Delete note link |
| `/api/diagrams/:id/free-lines` | GET / POST | List or create free lines |
| `/api/free-lines/:id` | DELETE | Delete free line |
| `/api/diagrams/:id/shapes` | GET / POST | List or create shapes |
| `/api/shapes/:id` | GET / PUT / DELETE | Get, update, or delete shape |
| `/api/diagrams/:id/views` | GET | List all views on diagram (top level only — use `/subviews` for nested) |
| `/api/views/:id/subviews` | GET | List views nested inside a view (edge labels, state regions). `?recursive=true`, `?type=EdgeLabelView` |
| `/api/views/:id` | PUT | Move/resize view (`left`, `top`, `width`, `height`). An edge label takes the same `left`/`top`, converted to the `alpha`/`distance`/`edgePosition` StarUML stores. `keepEdgeWaypoints` stops the move from clearing the routes of the edges on it — see *Line Style and Edge Waypoints* |
| `/api/views/:id/style` | PUT | Update view style (fillColor, lineColor, autoResize, suppressAttributes, suppressOperations, etc.), and `lineStyle` on an edge — see *Line Style and Edge Waypoints* |
| `/api/views/:id/points` | PUT | Replace an edge's route. Takes the whole path as `points: [{x, y}, ...]`, ends included |
| `/api/views/:id/route` | POST | Work out a right-angle route that avoids the other boxes, and write it. Optional `margin`, `grid` |
| `/api/views/:id/reconnect` | PUT | Reconnect edge to different source/target |
| `/api/views/align` | POST | Align/distribute views |
| `/api/project/save` | POST | Save project. This is "save as": it repoints the open project at `path`, so every later save writes there too |
| `/api/project/snapshot` | POST | Write the in-memory model to a separate `.mdj` without touching the open project. Leaves `project.filename` and the modified flag where they were, and returns `bytes` + `sha256` of what it wrote, so a caller can compare memory against the file on disk before deciding to save |
| `/api/project/open` | POST | Open project |
| `/api/project/new` | POST | Create new project |
| `/api/project/close` | POST | Close project |
| `/api/project/import` | POST | Import model fragment |
| `/api/project/export` | POST | Export model fragment |
| `/api/project/export-all` | POST | Export all diagrams as images |
| `/api/project/export-doc` | POST | Export project as HTML/Markdown |
| `/api/undo` | POST | Undo last operation. Fails with `Nothing to undo` on an empty stack, and reports the stack depth either way |
| `/api/redo` | POST | Redo last undone operation, reported the same way as undo |
| `/api/search` | GET | Search elements by keyword |
| `/api/validate` | POST | Validate model integrity |
| `/api/mermaid/import` | POST | Generate diagram from Mermaid syntax |
| `/api/diagrams/generate` | POST | Auto-generate diagram from model |

### ERD

| Endpoint | Method | Description |
|---|---|---|
| `/api/erd/data-models` | GET / POST | List or create data models |
| `/api/erd/data-models/:id` | GET / PUT / DELETE | Get, update, or delete data model |
| `/api/erd/diagrams` | GET / POST | List or create ER diagrams |
| `/api/erd/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/erd/entities` | GET / POST | List (filterable) or create entities |
| `/api/erd/entities/:id` | GET / PUT / DELETE | Get, update, or delete entity |
| `/api/erd/entities/:id/columns` | GET / POST | List or create columns |
| `/api/erd/columns/:id` | GET / PUT / DELETE | Get, update, or delete column |
| `/api/erd/entities/:id/sequences` | GET / POST | List or create sequences |
| `/api/erd/sequences/:id` | GET / PUT / DELETE | Get, update, or delete sequence |
| `/api/erd/entities/:id/indexes` | GET / POST | List or create indexes |
| `/api/erd/indexes/:id` | GET / PUT / DELETE | Get, update, or delete index |
| `/api/erd/relationships` | GET / POST | List (filterable) or create relationships |
| `/api/erd/relationships/:id` | GET / PUT / DELETE | Get, update, or delete relationship |
| `/api/erd/postgresql/ddl` | POST | Generate PostgreSQL DDL to a file |

### Sequence Diagram

| Endpoint | Method | Description |
|---|---|---|
| `/api/seq/interactions` | GET / POST | List or create interactions |
| `/api/seq/interactions/:id` | GET / PUT / DELETE | Get, update, or delete interaction |
| `/api/seq/diagrams` | GET / POST | List or create sequence diagrams |
| `/api/seq/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete sequence diagram |
| `/api/seq/interactions/:id/lifelines` | GET / POST | List or create lifelines. POST takes `representTypeId`/`representTypeName` to set what the lifeline stands for |
| `/api/seq/lifelines/:id` | GET / PUT / DELETE | Get, update, or delete lifeline. PUT takes `representTypeId` (a classifier's id, or `null` to clear) or `representTypeName` (a bare type name) |
| `/api/seq/interactions/:id/messages` | GET / POST | List or create messages. POST takes `signature` (the UMLOperation or UMLSignal the message invokes) and `arguments`, `guard`, `sequenceNumber`, `iteration`, `assignmentTarget`, `isConcurrentIteration` |
| `/api/seq/messages/:id` | GET / PUT / DELETE | Get, update, or delete message. PUT takes `signature` and the other UMLMessage fields, plus `y` (moves it and renumbers the sequence), `x` (found/lost messages only) and `activationHeight`. GET and PUT return the view geometry in `data.view`, the message's place in the list as `messageIndex`, and the operation's name and parameter count when a signature is set. GET reports `messageIndex` as of 2026-09-05 — before that only create and update did (see "Moving a Message") |
| `/api/seq/interactions/:id/combined-fragments` | GET / POST | List or create combined fragments |
| `/api/seq/combined-fragments/:id` | GET / PUT / DELETE | Get, update, or delete combined fragment |
| `/api/seq/combined-fragments/:id/operands` | GET / POST | List or add operands |
| `/api/seq/operands/:id` | GET / PUT / DELETE | Get, update, or delete operand |
| `/api/seq/interactions/:id/state-invariants` | GET / POST | List or create state invariants |
| `/api/seq/state-invariants/:id` | GET / PUT / DELETE | Get, update, or delete state invariant |
| `/api/seq/interactions/:id/interaction-uses` | GET / POST | List or create interaction uses |
| `/api/seq/interaction-uses/:id` | GET / PUT / DELETE | Get, update, or delete interaction use |

### Diagram Family APIs

Each diagram family below provides dedicated CRUD endpoints with type-specific validation. All families share a common pattern: 5 endpoints for diagrams, 5 per resource, 2 per child, and 5 per relation. See the [API Documentation](https://pontasan.github.io/staruml-controller/api.html) for full details including the common CRUD pattern.

#### Class/Package Diagram (`/api/class/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/class/diagrams` | GET / POST | List or create class/package diagrams |
| `/api/class/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/class/classes` | GET / POST | List or create classes |
| `/api/class/classes/:id` | GET / PUT / DELETE | Get, update, or delete class |
| `/api/class/classes/:id/attributes` | GET / POST | List or create attributes |
| `/api/class/classes/:id/operations` | GET / POST | List or create operations |
| `/api/class/classes/:id/receptions` | GET / POST | List or create receptions |
| `/api/class/classes/:id/template-parameters` | GET / POST | List or create template parameters |
| `/api/class/interfaces` | GET / POST | List or create interfaces |
| `/api/class/interfaces/:id` | GET / PUT / DELETE | Get, update, or delete interface |
| `/api/class/interfaces/:id/attributes` | GET / POST | List or create attributes |
| `/api/class/interfaces/:id/operations` | GET / POST | List or create operations |
| `/api/class/enumerations` | GET / POST | List or create enumerations |
| `/api/class/enumerations/:id` | GET / PUT / DELETE | Get, update, or delete enumeration |
| `/api/class/enumerations/:id/literals` | GET / POST | List or create enumeration literals |
| `/api/class/data-types` | GET / POST | List or create data types |
| `/api/class/data-types/:id` | GET / PUT / DELETE | Get, update, or delete data type |
| `/api/class/packages` | GET / POST | List or create packages |
| `/api/class/packages/:id` | GET / PUT / DELETE | Get, update, or delete package |
| `/api/class/associations` | GET / POST | List or create associations |
| `/api/class/associations/:id` | GET / PUT / DELETE | Get, update, or delete association. PUT takes `end1`/`end2` with `name`, `navigable` (`unspecified` / `navigable` / `notNavigable`), `aggregation` (`none` / `shared` / `composite`), `multiplicity`, the booleans `isDerived` / `isReadOnly` / `isOrdered` / `isUnique`, and `reference` — see *Moving a Relation's Endpoint* |
| `/api/class/generalizations` | GET / POST | List or create generalizations |
| `/api/class/generalizations/:id` | GET / PUT / DELETE | Get, update, or delete generalization |
| `/api/class/dependencies` | GET / POST | List or create dependencies |
| `/api/class/dependencies/:id` | GET / PUT / DELETE | Get, update, or delete dependency |
| `/api/class/interface-realizations` | GET / POST | List or create interface realizations |
| `/api/class/interface-realizations/:id` | GET / PUT / DELETE | Get, update, or delete interface realization |
| `/api/class/realizations` | GET / POST | List or create realizations |
| `/api/class/realizations/:id` | GET / PUT / DELETE | Get, update, or delete realization |
| `/api/class/template-bindings` | GET / POST | List or create template bindings |
| `/api/class/template-bindings/:id` | GET / PUT / DELETE | Get, update, or delete template binding |

#### Use Case Diagram (`/api/usecase/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/usecase/diagrams` | GET / POST | List or create use case diagrams |
| `/api/usecase/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/usecase/actors` | GET / POST | List or create actors |
| `/api/usecase/actors/:id` | GET / PUT / DELETE | Get, update, or delete actor |
| `/api/usecase/use-cases` | GET / POST | List or create use cases |
| `/api/usecase/use-cases/:id` | GET / PUT / DELETE | Get, update, or delete use case |
| `/api/usecase/use-cases/:id/extension-points` | GET / POST | List or create extension points |
| `/api/usecase/subjects` | GET / POST | List or create subjects |
| `/api/usecase/subjects/:id` | GET / PUT / DELETE | Get, update, or delete subject |
| `/api/usecase/associations` | GET / POST | List or create associations |
| `/api/usecase/associations/:id` | GET / PUT / DELETE | Get, update, or delete association |
| `/api/usecase/includes` | GET / POST | List or create includes |
| `/api/usecase/includes/:id` | GET / PUT / DELETE | Get, update, or delete include |
| `/api/usecase/extends` | GET / POST | List or create extends |
| `/api/usecase/extends/:id` | GET / PUT / DELETE | Get, update, or delete extend |
| `/api/usecase/generalizations` | GET / POST | List or create generalizations |
| `/api/usecase/generalizations/:id` | GET / PUT / DELETE | Get, update, or delete generalization |
| `/api/usecase/dependencies` | GET / POST | List or create dependencies |
| `/api/usecase/dependencies/:id` | GET / PUT / DELETE | Get, update, or delete dependency |

#### Activity Diagram (`/api/activity/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/activity/diagrams` | GET / POST | List or create activity diagrams |
| `/api/activity/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/activity/actions` | GET / POST | List or create actions |
| `/api/activity/actions/:id` | GET / PUT / DELETE | Get, update, or delete action |
| `/api/activity/actions/:id/pins` | GET / POST | List or create input pins |
| `/api/activity/actions/:id/output-pins` | GET / POST | List or create output pins |
| `/api/activity/control-nodes` | GET / POST | List or create control nodes |
| `/api/activity/control-nodes/:id` | GET / PUT / DELETE | Get, update, or delete control node |
| `/api/activity/object-nodes` | GET / POST | List or create object nodes |
| `/api/activity/object-nodes/:id` | GET / PUT / DELETE | Get, update, or delete object node |
| `/api/activity/partitions` | GET / POST | List or create partitions |
| `/api/activity/partitions/:id` | GET / PUT / DELETE | Get, update, or delete partition |
| `/api/activity/regions` | GET / POST | List or create regions |
| `/api/activity/regions/:id` | GET / PUT / DELETE | Get, update, or delete region |
| `/api/activity/control-flows` | GET / POST | List or create control flows |
| `/api/activity/control-flows/:id` | GET / PUT / DELETE | Get, update, or delete control flow |
| `/api/activity/object-flows` | GET / POST | List or create object flows |
| `/api/activity/object-flows/:id` | GET / PUT / DELETE | Get, update, or delete object flow |
| `/api/activity/exception-handlers` | GET / POST | List or create exception handlers |
| `/api/activity/exception-handlers/:id` | GET / PUT / DELETE | Get, update, or delete exception handler |
| `/api/activity/activity-interrupts` | GET / POST | List or create activity interrupts |
| `/api/activity/activity-interrupts/:id` | GET / PUT / DELETE | Get, update, or delete activity interrupt |

#### State Machine Diagram (`/api/statemachine/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/statemachine/diagrams` | GET / POST | List or create state machine diagrams |
| `/api/statemachine/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/statemachine/states` | GET / POST | List or create states |
| `/api/statemachine/states/:id` | GET / PUT / DELETE | Get, update, or delete state |
| `/api/statemachine/states/:id/regions` | GET / POST | List or create regions |
| `/api/statemachine/pseudostates` | GET / POST | List or create pseudostates |
| `/api/statemachine/pseudostates/:id` | GET / PUT / DELETE | Get, update, or delete pseudostate |
| `/api/statemachine/final-states` | GET / POST | List or create final states |
| `/api/statemachine/final-states/:id` | GET / PUT / DELETE | Get, update, or delete final state |
| `/api/statemachine/transitions` | GET / POST | List or create transitions |
| `/api/statemachine/transitions/:id` | GET / PUT / DELETE | Get, update, or delete transition |
| `/api/statemachine/transitions/:id/triggers` | GET / POST | List or create trigger events on a transition |
| `/api/statemachine/transitions/:id/triggers/:childId` | PUT | Update a trigger event |

A transition with no trigger is a **completion transition**: it fires as soon as the
source state's activity finishes. Write the event notation into the trigger's `name`
(`after(10 s)`, `at(12:00)`, or the signal name) and leave the transition's own `name`
empty — StarUML builds the edge label from the triggers, the guard and the effects.
Set `eventKind` too: omitting it leaves the event as `anyReceive`, meaning "any event
triggers this", which looks identical on the canvas.

#### Component Diagram (`/api/component/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/component/diagrams` | GET / POST | List or create component diagrams |
| `/api/component/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/component/components` | GET / POST | List or create components |
| `/api/component/components/:id` | GET / PUT / DELETE | Get, update, or delete component |
| `/api/component/artifacts` | GET / POST | List or create artifacts |
| `/api/component/artifacts/:id` | GET / PUT / DELETE | Get, update, or delete artifact |
| `/api/component/component-realizations` | GET / POST | List or create component realizations |
| `/api/component/component-realizations/:id` | GET / PUT / DELETE | Get, update, or delete component realization |
| `/api/component/dependencies` | GET / POST | List or create dependencies |
| `/api/component/dependencies/:id` | GET / PUT / DELETE | Get, update, or delete dependency |
| `/api/component/generalizations` | GET / POST | List or create generalizations |
| `/api/component/generalizations/:id` | GET / PUT / DELETE | Get, update, or delete generalization |
| `/api/component/interface-realizations` | GET / POST | List or create interface realizations |
| `/api/component/interface-realizations/:id` | GET / PUT / DELETE | Get, update, or delete interface realization |

#### Deployment Diagram (`/api/deployment/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/deployment/diagrams` | GET / POST | List or create deployment diagrams |
| `/api/deployment/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/deployment/nodes` | GET / POST | List or create nodes |
| `/api/deployment/nodes/:id` | GET / PUT / DELETE | Get, update, or delete node |
| `/api/deployment/node-instances` | GET / POST | List or create node instances |
| `/api/deployment/node-instances/:id` | GET / PUT / DELETE | Get, update, or delete node instance |
| `/api/deployment/artifact-instances` | GET / POST | List or create artifact instances |
| `/api/deployment/artifact-instances/:id` | GET / PUT / DELETE | Get, update, or delete artifact instance |
| `/api/deployment/component-instances` | GET / POST | List or create component instances |
| `/api/deployment/component-instances/:id` | GET / PUT / DELETE | Get, update, or delete component instance |
| `/api/deployment/artifacts` | GET / POST | List or create artifacts |
| `/api/deployment/artifacts/:id` | GET / PUT / DELETE | Get, update, or delete artifact |
| `/api/deployment/deployments` | GET / POST | List or create deployments |
| `/api/deployment/deployments/:id` | GET / PUT / DELETE | Get, update, or delete deployment |
| `/api/deployment/communication-paths` | GET / POST | List or create communication paths |
| `/api/deployment/communication-paths/:id` | GET / PUT / DELETE | Get, update, or delete communication path |
| `/api/deployment/dependencies` | GET / POST | List or create dependencies |
| `/api/deployment/dependencies/:id` | GET / PUT / DELETE | Get, update, or delete dependency |

#### Object Diagram (`/api/object/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/object/diagrams` | GET / POST | List or create object diagrams |
| `/api/object/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/object/objects` | GET / POST | List or create objects |
| `/api/object/objects/:id` | GET / PUT / DELETE | Get, update, or delete object |
| `/api/object/objects/:id/slots` | GET / POST | List or create slots |
| `/api/object/links` | GET / POST | List or create links |
| `/api/object/links/:id` | GET / PUT / DELETE | Get, update, or delete link |

#### Communication Diagram (`/api/communication/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/communication/diagrams` | GET / POST | List or create communication diagrams |
| `/api/communication/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/communication/lifelines` | GET / POST | List or create lifelines |
| `/api/communication/lifelines/:id` | GET / PUT / DELETE | Get, update, or delete lifeline |
| `/api/communication/connectors` | GET / POST | List or create connectors |
| `/api/communication/connectors/:id` | GET / PUT / DELETE | Get, update, or delete connector |

#### Composite Structure Diagram (`/api/composite/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/composite/diagrams` | GET / POST | List or create composite structure diagrams |
| `/api/composite/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/composite/ports` | GET / POST | List or create ports |
| `/api/composite/ports/:id` | GET / PUT / DELETE | Get, update, or delete port |
| `/api/composite/parts` | GET / POST | List or create parts |
| `/api/composite/parts/:id` | GET / PUT / DELETE | Get, update, or delete part |
| `/api/composite/collaborations` | GET / POST | List or create collaborations |
| `/api/composite/collaborations/:id` | GET / PUT / DELETE | Get, update, or delete collaboration |
| `/api/composite/collaboration-uses` | GET / POST | List or create collaboration uses |
| `/api/composite/collaboration-uses/:id` | GET / PUT / DELETE | Get, update, or delete collaboration use |
| `/api/composite/role-bindings` | GET / POST | List or create role bindings |
| `/api/composite/role-bindings/:id` | GET / PUT / DELETE | Get, update, or delete role binding |
| `/api/composite/dependencies` | GET / POST | List or create dependencies |
| `/api/composite/dependencies/:id` | GET / PUT / DELETE | Get, update, or delete dependency |
| `/api/composite/realizations` | GET / POST | List or create realizations |
| `/api/composite/realizations/:id` | GET / PUT / DELETE | Get, update, or delete realization |

#### Information Flow Diagram (`/api/infoflow/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/infoflow/diagrams` | GET / POST | List or create information flow diagrams |
| `/api/infoflow/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/infoflow/info-items` | GET / POST | List or create information items |
| `/api/infoflow/info-items/:id` | GET / PUT / DELETE | Get, update, or delete information item |
| `/api/infoflow/information-flows` | GET / POST | List or create information flows |
| `/api/infoflow/information-flows/:id` | GET / PUT / DELETE | Get, update, or delete information flow |

#### Profile Diagram (`/api/profile/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/profile/diagrams` | GET / POST | List or create profile diagrams |
| `/api/profile/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/profile/profiles` | GET / POST | List or create profiles |
| `/api/profile/profiles/:id` | GET / PUT / DELETE | Get, update, or delete profile |
| `/api/profile/stereotypes` | GET / POST | List or create stereotypes |
| `/api/profile/stereotypes/:id` | GET / PUT / DELETE | Get, update, or delete stereotype |
| `/api/profile/stereotypes/:id/attributes` | GET / POST | List or create stereotype attributes |
| `/api/profile/stereotypes/:id/operations` | GET / POST | List or create stereotype operations |
| `/api/profile/metaclasses` | GET / POST | List or create metaclasses |
| `/api/profile/metaclasses/:id` | GET / PUT / DELETE | Get, update, or delete metaclass |
| `/api/profile/extensions` | GET / POST | List or create extensions |
| `/api/profile/extensions/:id` | GET / PUT / DELETE | Get, update, or delete extension |

#### Timing Diagram (`/api/timing/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/timing/diagrams` | GET / POST | List or create timing diagrams |
| `/api/timing/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/timing/lifelines` | GET / POST | List or create lifelines |
| `/api/timing/lifelines/:id` | GET / PUT / DELETE | Get, update, or delete lifeline |
| `/api/timing/timing-states` | GET / POST | List or create timing states |
| `/api/timing/timing-states/:id` | GET / PUT / DELETE | Get, update, or delete timing state |
| `/api/timing/time-segments` | GET / POST | List or create time segments |
| `/api/timing/time-segments/:id` | GET / PUT / DELETE | Get, update, or delete time segment |

#### Interaction Overview Diagram (`/api/overview/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/overview/diagrams` | GET / POST | List or create interaction overview diagrams |
| `/api/overview/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/overview/interaction-uses` | GET / POST | List or create interaction uses |
| `/api/overview/interaction-uses/:id` | GET / PUT / DELETE | Get, update, or delete interaction use |
| `/api/overview/interactions` | GET / POST | List or create interactions |
| `/api/overview/interactions/:id` | GET / PUT / DELETE | Get, update, or delete interaction |
| `/api/overview/control-nodes` | GET / POST | List or create control nodes |
| `/api/overview/control-nodes/:id` | GET / PUT / DELETE | Get, update, or delete control node |
| `/api/overview/control-flows` | GET / POST | List or create control flows |
| `/api/overview/control-flows/:id` | GET / PUT / DELETE | Get, update, or delete control flow |

#### Flowchart Diagram (`/api/flowchart/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/flowchart/diagrams` | GET / POST | List or create flowchart diagrams |
| `/api/flowchart/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/flowchart/nodes` | GET / POST | List or create nodes |
| `/api/flowchart/nodes/:id` | GET / PUT / DELETE | Get, update, or delete node |
| `/api/flowchart/flows` | GET / POST | List or create flows |
| `/api/flowchart/flows/:id` | GET / PUT / DELETE | Get, update, or delete flow |

#### DFD Diagram (`/api/dfd/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/dfd/diagrams` | GET / POST | List or create DFD diagrams |
| `/api/dfd/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/dfd/external-entities` | GET / POST | List or create external entities |
| `/api/dfd/external-entities/:id` | GET / PUT / DELETE | Get, update, or delete external entity |
| `/api/dfd/processes` | GET / POST | List or create processes |
| `/api/dfd/processes/:id` | GET / PUT / DELETE | Get, update, or delete process |
| `/api/dfd/data-stores` | GET / POST | List or create data stores |
| `/api/dfd/data-stores/:id` | GET / PUT / DELETE | Get, update, or delete data store |
| `/api/dfd/data-flows` | GET / POST | List or create data flows |
| `/api/dfd/data-flows/:id` | GET / PUT / DELETE | Get, update, or delete data flow |

#### BPMN Diagram (`/api/bpmn/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/bpmn/diagrams` | GET / POST | List or create BPMN diagrams |
| `/api/bpmn/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/bpmn/participants` | GET / POST | List or create participants |
| `/api/bpmn/participants/:id` | GET / PUT / DELETE | Get, update, or delete participant |
| `/api/bpmn/participants/:id/lanes` | GET / POST | List or create lanes |
| `/api/bpmn/tasks` | GET / POST | List or create tasks |
| `/api/bpmn/tasks/:id` | GET / PUT / DELETE | Get, update, or delete task |
| `/api/bpmn/sub-processes` | GET / POST | List or create sub-processes |
| `/api/bpmn/sub-processes/:id` | GET / PUT / DELETE | Get, update, or delete sub-process |
| `/api/bpmn/events` | GET / POST | List or create events |
| `/api/bpmn/events/:id` | GET / PUT / DELETE | Get, update, or delete event |
| `/api/bpmn/events/:id/event-definitions` | GET / POST | List or create event definitions |
| `/api/bpmn/gateways` | GET / POST | List or create gateways |
| `/api/bpmn/gateways/:id` | GET / PUT / DELETE | Get, update, or delete gateway |
| `/api/bpmn/data-objects` | GET / POST | List or create data objects |
| `/api/bpmn/data-objects/:id` | GET / PUT / DELETE | Get, update, or delete data object |
| `/api/bpmn/conversations` | GET / POST | List or create conversations |
| `/api/bpmn/conversations/:id` | GET / PUT / DELETE | Get, update, or delete conversation |
| `/api/bpmn/choreographies` | GET / POST | List or create choreographies |
| `/api/bpmn/choreographies/:id` | GET / PUT / DELETE | Get, update, or delete choreography |
| `/api/bpmn/annotations` | GET / POST | List or create annotations |
| `/api/bpmn/annotations/:id` | GET / PUT / DELETE | Get, update, or delete annotation |
| `/api/bpmn/sequence-flows` | GET / POST | List or create sequence flows |
| `/api/bpmn/sequence-flows/:id` | GET / PUT / DELETE | Get, update, or delete sequence flow |
| `/api/bpmn/message-flows` | GET / POST | List or create message flows |
| `/api/bpmn/message-flows/:id` | GET / PUT / DELETE | Get, update, or delete message flow |
| `/api/bpmn/associations` | GET / POST | List or create associations |
| `/api/bpmn/associations/:id` | GET / PUT / DELETE | Get, update, or delete association |
| `/api/bpmn/data-associations` | GET / POST | List or create data associations |
| `/api/bpmn/data-associations/:id` | GET / PUT / DELETE | Get, update, or delete data association |
| `/api/bpmn/message-links` | GET / POST | List or create message links |
| `/api/bpmn/message-links/:id` | GET / PUT / DELETE | Get, update, or delete message link |
| `/api/bpmn/conversation-links` | GET / POST | List or create conversation links |
| `/api/bpmn/conversation-links/:id` | GET / PUT / DELETE | Get, update, or delete conversation link |

#### C4 Diagram (`/api/c4/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/c4/diagrams` | GET / POST | List or create C4 diagrams |
| `/api/c4/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/c4/elements` | GET / POST | List or create elements |
| `/api/c4/elements/:id` | GET / PUT / DELETE | Get, update, or delete element |
| `/api/c4/relationships` | GET / POST | List or create relationships |
| `/api/c4/relationships/:id` | GET / PUT / DELETE | Get, update, or delete relationship |

#### SysML Diagram (`/api/sysml/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/sysml/diagrams` | GET / POST | List or create SysML diagrams |
| `/api/sysml/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/sysml/requirements` | GET / POST | List or create requirements |
| `/api/sysml/requirements/:id` | GET / PUT / DELETE | Get, update, or delete requirement |
| `/api/sysml/blocks` | GET / POST | List or create blocks |
| `/api/sysml/blocks/:id` | GET / PUT / DELETE | Get, update, or delete block |
| `/api/sysml/blocks/:id/properties` | GET / POST | List or create properties |
| `/api/sysml/blocks/:id/operations` | GET / POST | List or create operations |
| `/api/sysml/blocks/:id/flow-properties` | GET / POST | List or create flow properties |
| `/api/sysml/stakeholders` | GET / POST | List or create stakeholders |
| `/api/sysml/stakeholders/:id` | GET / PUT / DELETE | Get, update, or delete stakeholder |
| `/api/sysml/viewpoints` | GET / POST | List or create viewpoints |
| `/api/sysml/viewpoints/:id` | GET / PUT / DELETE | Get, update, or delete viewpoint |
| `/api/sysml/views` | GET / POST | List or create views |
| `/api/sysml/views/:id` | GET / PUT / DELETE | Get, update, or delete view |
| `/api/sysml/parts` | GET / POST | List or create parts |
| `/api/sysml/parts/:id` | GET / PUT / DELETE | Get, update, or delete part |
| `/api/sysml/conforms` | GET / POST | List or create conforms |
| `/api/sysml/conforms/:id` | GET / PUT / DELETE | Get, update, or delete conform |
| `/api/sysml/exposes` | GET / POST | List or create exposes |
| `/api/sysml/exposes/:id` | GET / PUT / DELETE | Get, update, or delete expose |
| `/api/sysml/copies` | GET / POST | List or create copies |
| `/api/sysml/copies/:id` | GET / PUT / DELETE | Get, update, or delete copy |
| `/api/sysml/derive-reqts` | GET / POST | List or create derive requirements |
| `/api/sysml/derive-reqts/:id` | GET / PUT / DELETE | Get, update, or delete derive requirement |
| `/api/sysml/verifies` | GET / POST | List or create verifies |
| `/api/sysml/verifies/:id` | GET / PUT / DELETE | Get, update, or delete verify |
| `/api/sysml/satisfies` | GET / POST | List or create satisfies |
| `/api/sysml/satisfies/:id` | GET / PUT / DELETE | Get, update, or delete satisfy |
| `/api/sysml/refines` | GET / POST | List or create refines |
| `/api/sysml/refines/:id` | GET / PUT / DELETE | Get, update, or delete refine |
| `/api/sysml/connectors` | GET / POST | List or create connectors |
| `/api/sysml/connectors/:id` | GET / PUT / DELETE | Get, update, or delete connector |

#### Wireframe Diagram (`/api/wireframe/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/wireframe/diagrams` | GET / POST | List or create wireframe diagrams |
| `/api/wireframe/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/wireframe/frames` | GET / POST | List or create frames |
| `/api/wireframe/frames/:id` | GET / PUT / DELETE | Get, update, or delete frame |
| `/api/wireframe/widgets` | GET / POST | List or create widgets |
| `/api/wireframe/widgets/:id` | GET / PUT / DELETE | Get, update, or delete widget |

#### MindMap Diagram (`/api/mindmap/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/mindmap/diagrams` | GET / POST | List or create mindmap diagrams |
| `/api/mindmap/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/mindmap/nodes` | GET / POST | List or create nodes |
| `/api/mindmap/nodes/:id` | GET / PUT / DELETE | Get, update, or delete node |
| `/api/mindmap/edges` | GET / POST | List or create edges |
| `/api/mindmap/edges/:id` | GET / PUT / DELETE | Get, update, or delete edge |

#### AWS Diagram (`/api/aws/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/aws/diagrams` | GET / POST | List or create AWS diagrams |
| `/api/aws/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/aws/elements` | GET / POST | List or create elements |
| `/api/aws/elements/:id` | GET / PUT / DELETE | Get, update, or delete element |
| `/api/aws/arrows` | GET / POST | List or create arrows |
| `/api/aws/arrows/:id` | GET / PUT / DELETE | Get, update, or delete arrow |

#### Azure Diagram (`/api/azure/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/azure/diagrams` | GET / POST | List or create Azure diagrams |
| `/api/azure/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/azure/elements` | GET / POST | List or create elements |
| `/api/azure/elements/:id` | GET / PUT / DELETE | Get, update, or delete element |
| `/api/azure/connectors` | GET / POST | List or create connectors |
| `/api/azure/connectors/:id` | GET / PUT / DELETE | Get, update, or delete connector |

#### GCP Diagram (`/api/gcp/`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/gcp/diagrams` | GET / POST | List or create GCP diagrams |
| `/api/gcp/diagrams/:id` | GET / PUT / DELETE | Get, update, or delete diagram |
| `/api/gcp/elements` | GET / POST | List or create elements |
| `/api/gcp/elements/:id` | GET / PUT / DELETE | Get, update, or delete element |
| `/api/gcp/paths` | GET / POST | List or create paths |
| `/api/gcp/paths/:id` | GET / PUT / DELETE | Get, update, or delete path |

For full API specifications including request/response formats, validation rules, error codes, and the 23 diagram family APIs, see the [API Documentation](https://pontasan.github.io/staruml-controller/api.html).

## Examples

```bash
# Health check
curl http://localhost:12345/api/status

# Create a data model
curl -X POST http://localhost:12345/api/erd/data-models \
  -H "Content-Type: application/json" \
  -d '{"name": "MyDB"}'

# Create a diagram
curl -X POST http://localhost:12345/api/erd/diagrams \
  -H "Content-Type: application/json" \
  -d '{"parentId": "DATA_MODEL_ID", "name": "Main ER Diagram"}'

# Create entity with diagram placement
curl -X POST http://localhost:12345/api/erd/entities \
  -H "Content-Type: application/json" \
  -d '{"parentId": "DATA_MODEL_ID", "name": "users", "diagramId": "DIAGRAM_ID"}'

# Add column
curl -X POST http://localhost:12345/api/erd/entities/ENTITY_ID/columns \
  -H "Content-Type: application/json" \
  -d '{"name": "email", "type": "VARCHAR", "length": "255", "unique": true}'

# Set foreign key reference
curl -X PUT http://localhost:12345/api/erd/columns/COLUMN_ID \
  -H "Content-Type: application/json" \
  -d '{"foreignKey": true, "referenceToId": "TARGET_COLUMN_ID"}'

# Create relationship
curl -X POST http://localhost:12345/api/erd/relationships \
  -H "Content-Type: application/json" \
  -d '{"parentId": "DATA_MODEL_ID", "diagramId": "DIAGRAM_ID", "end1": {"reference": "ENTITY1_ID", "cardinality": "1"}, "end2": {"reference": "ENTITY2_ID", "cardinality": "0..*"}}'

# Create sequence
curl -X POST http://localhost:12345/api/erd/entities/ENTITY_ID/sequences \
  -H "Content-Type: application/json" \
  -d '{"name": "users_id_seq"}'

# Create index
curl -X POST http://localhost:12345/api/erd/entities/ENTITY_ID/indexes \
  -H "Content-Type: application/json" \
  -d '{"name": "idx_email", "definition": "CREATE INDEX idx_email ON users (email)"}'

# Set default value on a column (via tag)
curl -X POST http://localhost:12345/api/elements/COLUMN_ID/tags \
  -H "Content-Type: application/json" \
  -d '{"name": "default", "kind": 0, "value": "now()"}'

# Generate PostgreSQL DDL
curl -X POST http://localhost:12345/api/erd/postgresql/ddl \
  -H "Content-Type: application/json" \
  -d '{"path": "/Users/xxx/output.sql"}'

# Save project.
# Careful: this is "save as". Afterwards the open project IS the new path, and
# the file you started from stops receiving changes.
curl -X POST http://localhost:12345/api/project/save \
  -H "Content-Type: application/json" \
  -d '{"path": "/Users/xxx/my-project.mdj"}'

# Snapshot the in-memory model without changing the open project.
# Use it to find out whether anyone has unsaved work before you save over their
# file: snapshot to a scratch path, then compare the returned sha256 with the
# sha256 of the .mdj on disk. Equal means memory and disk agree.
curl -X POST http://localhost:12345/api/project/snapshot \
  -H "Content-Type: application/json" \
  -d '{"path": "/tmp/snapshot.mdj"}'

# Delete entity (blocked if referenced by other elements)
curl -X DELETE http://localhost:12345/api/erd/entities/ENTITY_ID

# --- Generic Diagrams ---

# Create a BPMN diagram
curl -X POST http://localhost:12345/api/diagrams \
  -H "Content-Type: application/json" \
  -d '{"type": "BPMNDiagram", "name": "My Process"}'

# Create a node element on a diagram
curl -X POST http://localhost:12345/api/diagrams/DIAGRAM_ID/elements \
  -H "Content-Type: application/json" \
  -d '{"type": "BPMNTask", "name": "Review Order"}'

# Create a relation between elements
curl -X POST http://localhost:12345/api/diagrams/DIAGRAM_ID/relations \
  -H "Content-Type: application/json" \
  -d '{"type": "BPMNSequenceFlow", "sourceId": "ELEMENT1_ID", "targetId": "ELEMENT2_ID"}'

# Export diagram as PNG
curl -X POST http://localhost:12345/api/diagrams/DIAGRAM_ID/export \
  -H "Content-Type: application/json" \
  -d '{"format": "png", "path": "/tmp/diagram.png"}'

# Search elements
curl "http://localhost:12345/api/search?keyword=User&type=UMLClass"

# --- Sequence Diagram ---

# Create an interaction
curl -X POST http://localhost:12345/api/seq/interactions \
  -H "Content-Type: application/json" \
  -d '{"name": "Login Flow"}'

# Create a sequence diagram
curl -X POST http://localhost:12345/api/seq/diagrams \
  -H "Content-Type: application/json" \
  -d '{"parentId": "INTERACTION_ID", "name": "Login Sequence"}'

# Create lifelines with diagram placement
curl -X POST http://localhost:12345/api/seq/interactions/INTERACTION_ID/lifelines \
  -H "Content-Type: application/json" \
  -d '{"name": "Client", "diagramId": "DIAGRAM_ID"}'

# Create a message between lifelines
curl -X POST http://localhost:12345/api/seq/interactions/INTERACTION_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"name": "login()", "messageSort": "synchCall", "source": "LIFELINE1_ID", "target": "LIFELINE2_ID", "diagramId": "DIAGRAM_ID"}'

# Create a combined fragment (alt/opt/loop)
curl -X POST http://localhost:12345/api/seq/interactions/INTERACTION_ID/combined-fragments \
  -H "Content-Type: application/json" \
  -d '{"interactionOperator": "alt", "diagramId": "DIAGRAM_ID"}'

# Add operand to a combined fragment
curl -X POST http://localhost:12345/api/seq/combined-fragments/FRAGMENT_ID/operands \
  -H "Content-Type: application/json" \
  -d '{"guard": "[success]"}'
```

## Tests

```bash
node test/test_offline_units.js       # no StarUML needed
bash test/run_integration_safely.sh   # needs StarUML running with the server started
```

The offline tests drive the same `route()` entry point against a mock runtime, so
they can run while someone else has a model open — the integration script writes
into whatever model is currently open, and there is only ever one. They cover
routing, validation and serialization; anything about how StarUML's own engine
behaves (clamping, view geometry, persistence) still needs the integration run.

Two things the mock does model faithfully, because the controller's own
arithmetic depends on them: StarUML's `Coord.getPointAwayLine` and
`EdgeParasiticView.arrangeObject`, ported from `app.asar`. The controller writes
the inverse of those, so a round trip through both is what shows the inverse is
right.

Run the integration suite through `run_integration_safely.sh`, never
`test_all_endpoints.sh` directly. The runner switches to an empty project first
and reopens the original from an EXIT trap, so a mid-run failure cannot leave
someone's model dirty. It also refuses to start unless the build under test is
loaded, which it checks by asking `GET /api/status/capabilities` whether
`PUT /api/elements/:id` takes `specification`.

Inside that run, `verify_gaps_live.py` does what a caller does to accept a fix:
write, read back, save the project, and then `json.load` the `.mdj` and look for
the field. A value that is only right in memory disappears at the next save, and
nothing short of reading the file catches that.

## File Structure

```
staruml-controller/
├── main.js            # Extension entry point (HTTP server management)
├── api-handler.js     # REST API routing and handlers
├── ddl-generator.js   # PostgreSQL DDL generation
├── handlers/
│   ├── shared-helpers.js   # Shared validation/serialization utilities
│   ├── crud-factory.js     # CRUD handler factory engine
│   ├── family-class.js     # Class/Package diagram config
│   ├── family-usecase.js   # Use Case diagram config
│   ├── family-activity.js  # Activity diagram config
│   └── ... (21 more family configs)
├── menus/
│   └── menu.json      # StarUML menu definition
├── docs/
│   └── api.html       # API documentation (HTML)
├── images/
│   ├── architecture.svg  # Architecture overview diagram
│   ├── image1.gif     # ER diagram demo animation
│   ├── image2.jpg     # PostgreSQL DDL export screenshot
│   ├── image3.gif     # Sequence diagram demo animation
│   ├── image4.jpg     # Tools menu screenshot
│   └── image5.jpg     # Port number dialog screenshot
├── test/
│   ├── test_all_endpoints.sh  # Integration tests (needs a live StarUML)
│   ├── test_offline_units.js  # Unit tests against a mock runtime (no StarUML)
│   └── mock-staruml.js        # Mock StarUML runtime for the unit tests
├── package.json       # Extension metadata
└── README.md
```

## Acknowledgments

The PostgreSQL DDL generation feature is based on [staruml-postgresql](https://github.com/adrianandrei-ca/staruml-postgresql) by Adrian Andrei. The type mapping and DDL output logic were ported from that extension.

## License

MIT
