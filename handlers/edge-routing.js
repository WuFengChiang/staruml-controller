/**
 * Edge waypoints: writing a route, and working one out.
 *
 * StarUML keeps an edge's shape in `EdgeView.points`, a Points collection that
 * is part of the metamodel and is saved to the .mdj. Two things about how the
 * engine treats those points shape everything in this file:
 *
 *   - An arrange pass rewrites only the first and last point, snapping them to
 *     where the line meets the tail and head boxes (EdgeView.recalcOblique and
 *     recalcRectilinear). Points in between survive, which is why a hand-placed
 *     waypoint stays put across a repaint.
 *   - EdgeView.reducePoints deletes any middle point that falls inside the tail
 *     or the head box. A waypoint placed there disappears on the next arrange.
 *
 * So a caller supplies the whole route, the engine owns its two ends, and a
 * waypoint must stay clear of both end boxes to survive.
 *
 * The engine offers no path finding of its own. recalcOblique and
 * recalcRectilinear look at `this.tail` and `this.head` and at nothing else on
 * the diagram, so a line will happily run straight through a third box. The
 * router below is this module's own work, not a call into StarUML.
 */

const { diagramOfView, editorForDiagram } = require('./shared-helpers')

// Grid step for the router, in diagram units. StarUML quantizes view geometry
// to a grid of its own, and a coarser step here keeps the search cheap while
// still threading gaps a reader would call a gap.
const DEFAULT_GRID = 10
// How far a route keeps away from a box it is going around.
const DEFAULT_MARGIN = 10
// A turn costs this many grid steps. Without it A* returns staircases: every
// path of equal length scores the same, so it picks an arbitrary one. With it
// the cheapest path is the one that turns least.
const TURN_PENALTY = 4
// Upper bound on grid cells searched. A large diagram at a fine grid can ask
// for millions of cells; refuse rather than hang the editor.
const MAX_CELLS = 250000

/**
 * A StarUML Points collection built from [{x, y}, ...].
 */
function arrayToPoints(arr) {
    const pts = new type.Points()
    for (let i = 0; i < arr.length; i++) {
        pts.add(new type.Point(arr[i].x, arr[i].y))
    }
    return pts
}

/**
 * Write a route onto an edge through Engine.modifyEdge, which assigns the
 * points, repaints, and records the edge and its labels in one undoable
 * operation. Returns an error string, or null when the write went through.
 */
function setEdgePoints(edge, arr) {
    if (!edge || !edge.points) {
        return 'This view has no points to write.'
    }
    if (typeof app.engine.modifyEdge !== 'function') {
        return 'This StarUML build has no Engine.modifyEdge, so an edge route cannot be written.'
    }
    const diagram = diagramOfView(edge)
    const editor = diagram ? editorForDiagram(diagram) : null
    if (!editor) {
        return 'No diagram editor is available, so the route cannot be written.'
    }
    app.engine.modifyEdge(editor, edge, arrayToPoints(arr))
    return null
}

/**
 * The boxes a route has to avoid.
 *
 * Everything on the diagram that occupies space, minus the four kinds that must
 * not count:
 *
 *   - the edge's own two ends, which the route is supposed to reach;
 *   - anything that contains either end, because a line leaving a box inside a
 *     package has to cross that package to get anywhere;
 *   - edge labels and other parasitic views, which ride on a line rather than
 *     sitting on the diagram;
 *   - hidden views, which a reader cannot see the line cross.
 *
 * Other edges are not obstacles. A route may cross another line, and treating
 * lines as obstacles makes most diagrams unroutable.
 */
function obstaclesFor(edge, diagram) {
    if (!diagram || !Array.isArray(diagram.ownedViews)) {
        return []
    }
    const skip = []
    const noteEnd = function (end) {
        let node = end
        while (node) {
            if (skip.indexOf(node) === -1) {
                skip.push(node)
            }
            node = node.containerView
        }
    }
    noteEnd(edge.tail)
    noteEnd(edge.head)

    const out = []
    for (let i = 0; i < diagram.ownedViews.length; i++) {
        const v = diagram.ownedViews[i]
        if (!v || skip.indexOf(v) !== -1) {
            continue
        }
        if (v.visible === false) {
            continue
        }
        // ParasiticView extends NodeView, so an edge label passes the NodeView
        // test below. It has to be excluded by what makes it parasitic: it is
        // positioned by alpha/distance along a host, not by sitting somewhere.
        if (v.hostEdge || v.hostNode || v.alpha !== undefined) {
            continue
        }
        if (!(type.NodeView && v instanceof type.NodeView)) {
            continue
        }
        if (!(v.width > 0 && v.height > 0)) {
            continue
        }
        out.push(v)
    }
    return out
}

function rectOf(view, margin) {
    return {
        x1: view.left - margin,
        y1: view.top - margin,
        x2: view.left + view.width + margin,
        y2: view.top + view.height + margin
    }
}

function centreOf(view) {
    return {
        x: view.left + view.width / 2,
        y: view.top + view.height / 2
    }
}

function inRect(x, y, r) {
    return x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2
}

/**
 * Drop points that sit on a straight run, so three collinear points become two.
 * A* emits one point per grid step; without this a route carries dozens of
 * points that draw exactly the same line.
 */
function reduceCollinear(pts) {
    const out = []
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i]
        if (out.length >= 2) {
            const a = out[out.length - 2]
            const b = out[out.length - 1]
            const sameX = a.x === b.x && b.x === p.x
            const sameY = a.y === b.y && b.y === p.y
            if (sameX || sameY) {
                out[out.length - 1] = p
                continue
            }
        }
        if (out.length >= 1) {
            const last = out[out.length - 1]
            if (last.x === p.x && last.y === p.y) {
                continue
            }
        }
        out.push(p)
    }
    return out
}

/**
 * Work out an orthogonal route from the tail box to the head box that misses
 * every obstacle.
 *
 * A* over a grid, four directions, with a penalty on turning. The search area
 * is the bounding box of the two ends and every obstacle, opened up by a few
 * cells so a route can leave the crowd and come back.
 *
 * Returns { points } on success, or { error } with a reason a caller can act
 * on. The two ends are the centres of the end boxes: the engine snaps them to
 * the box borders on the next arrange, and a point it snaps is a point this
 * router does not have to guess.
 */
function routeEdge(edge, options) {
    const opts = options || {}
    const grid = opts.grid > 0 ? opts.grid : DEFAULT_GRID
    const margin = opts.margin >= 0 ? opts.margin : DEFAULT_MARGIN

    if (!edge || !edge.tail || !edge.head) {
        return { error: 'This edge has no tail or head view, so there is nothing to route between.' }
    }
    if (edge.tail === edge.head) {
        return { error: 'Both ends of this edge are on the same view. A self-link is drawn by the engine and has no route to work out.' }
    }

    const diagram = diagramOfView(edge)
    const obstacleViews = obstaclesFor(edge, diagram)
    const obstacles = obstacleViews.map(function (v) { return rectOf(v, margin) })

    const start = centreOf(edge.tail)
    const goal = centreOf(edge.head)

    // Search area: everything involved, plus room to go around the outside.
    let x1 = Math.min(start.x, goal.x)
    let y1 = Math.min(start.y, goal.y)
    let x2 = Math.max(start.x, goal.x)
    let y2 = Math.max(start.y, goal.y)
    for (let i = 0; i < obstacles.length; i++) {
        const r = obstacles[i]
        x1 = Math.min(x1, r.x1)
        y1 = Math.min(y1, r.y1)
        x2 = Math.max(x2, r.x2)
        y2 = Math.max(y2, r.y2)
    }
    const pad = grid * 4
    x1 -= pad
    y1 -= pad
    x2 += pad
    y2 += pad

    const cols = Math.floor((x2 - x1) / grid) + 1
    const rows = Math.floor((y2 - y1) / grid) + 1
    if (cols * rows > MAX_CELLS) {
        return {
            error: 'The area to search is too large at grid ' + grid + ' (' + cols + ' x ' + rows +
                ' cells). Ask for a coarser grid.'
        }
    }

    const toCell = function (p) {
        return {
            cx: Math.round((p.x - x1) / grid),
            cy: Math.round((p.y - y1) / grid)
        }
    }
    const toPoint = function (cx, cy) {
        return { x: x1 + cx * grid, y: y1 + cy * grid }
    }

    const startCell = toCell(start)
    const goalCell = toCell(goal)

    // The two end boxes are obstacles to everyone except this edge, and the
    // start and goal cells sit inside them. Cells inside an end box are free
    // here; every other obstacle blocks.
    const blocked = function (cx, cy) {
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) {
            return true
        }
        const p = toPoint(cx, cy)
        for (let i = 0; i < obstacles.length; i++) {
            if (inRect(p.x, p.y, obstacles[i])) {
                return true
            }
        }
        return false
    }

    // Either end can be buried inside a third box when views overlap. Say which
    // one: the search would otherwise run out of frontier and report "no route
    // avoids every view", which sends the caller looking for the wrong problem.
    if (blocked(startCell.cx, startCell.cy)) {
        return { error: 'The tail view sits inside another view that the route must avoid, so there is no way out of it.' }
    }
    if (blocked(goalCell.cx, goalCell.cy)) {
        return { error: 'The head view sits inside another view that the route must avoid, so there is no way in.' }
    }

    const key = function (cx, cy, dir) { return cx + ',' + cy + ',' + dir }
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    const heuristic = function (cx, cy) {
        return (Math.abs(cx - goalCell.cx) + Math.abs(cy - goalCell.cy)) * grid
    }

    // A binary heap keeps the frontier ordered. A sorted array costs O(n log n)
    // per push on the diagrams this is meant for.
    const heap = []
    const heapPush = function (node) {
        heap.push(node)
        let i = heap.length - 1
        while (i > 0) {
            const parent = (i - 1) >> 1
            if (heap[parent].f <= heap[i].f) break
            const t = heap[parent]; heap[parent] = heap[i]; heap[i] = t
            i = parent
        }
    }
    const heapPop = function () {
        const top = heap[0]
        const last = heap.pop()
        if (heap.length > 0) {
            heap[0] = last
            let i = 0
            for (;;) {
                const l = i * 2 + 1
                const r = l + 1
                let small = i
                if (l < heap.length && heap[l].f < heap[small].f) small = l
                if (r < heap.length && heap[r].f < heap[small].f) small = r
                if (small === i) break
                const t = heap[small]; heap[small] = heap[i]; heap[i] = t
                i = small
            }
        }
        return top
    }

    const seen = {}
    const cameFrom = {}
    // dir -1 means "no direction yet", so the first step is never charged for
    // turning.
    heapPush({ cx: startCell.cx, cy: startCell.cy, dir: -1, g: 0, f: heuristic(startCell.cx, startCell.cy) })
    seen[key(startCell.cx, startCell.cy, -1)] = 0

    let found = null
    while (heap.length > 0) {
        const cur = heapPop()
        if (cur.cx === goalCell.cx && cur.cy === goalCell.cy) {
            found = cur
            break
        }
        const curKey = key(cur.cx, cur.cy, cur.dir)
        if (seen[curKey] !== undefined && seen[curKey] < cur.g) {
            continue
        }
        for (let d = 0; d < DIRS.length; d++) {
            const nx = cur.cx + DIRS[d][0]
            const ny = cur.cy + DIRS[d][1]
            if (blocked(nx, ny)) {
                continue
            }
            const turned = cur.dir !== -1 && cur.dir !== d
            const g = cur.g + grid + (turned ? TURN_PENALTY * grid : 0)
            const nKey = key(nx, ny, d)
            if (seen[nKey] !== undefined && seen[nKey] <= g) {
                continue
            }
            seen[nKey] = g
            cameFrom[nKey] = curKey
            heapPush({ cx: nx, cy: ny, dir: d, g: g, f: g + heuristic(nx, ny) })
        }
    }

    if (!found) {
        return { error: 'No route avoids every view between these two. Try a smaller margin, or move a view out of the way.' }
    }

    const path = []
    let k = key(found.cx, found.cy, found.dir)
    while (k !== undefined) {
        const parts = k.split(',')
        path.push(toPoint(parseInt(parts[0], 10), parseInt(parts[1], 10)))
        k = cameFrom[k]
    }
    path.reverse()

    // The engine owns both ends: it snaps point 0 and the last point to where
    // the line meets the end boxes. Handing it the box centres is what the
    // layout code does, and it keeps this router out of the snapping business.
    path[0] = { x: start.x, y: start.y }
    path[path.length - 1] = { x: goal.x, y: goal.y }

    const reduced = reduceCollinear(path)
    if (reduced.length < 2) {
        return { error: 'The route came out shorter than a line, which means the two ends resolve to the same point.' }
    }
    return { points: reduced, obstacleCount: obstacles.length }
}

module.exports = {
    arrayToPoints: arrayToPoints,
    setEdgePoints: setEdgePoints,
    obstaclesFor: obstaclesFor,
    reduceCollinear: reduceCollinear,
    routeEdge: routeEdge,
    DEFAULT_GRID: DEFAULT_GRID,
    DEFAULT_MARGIN: DEFAULT_MARGIN
}
