/**
 * Orthogonal connection router shared by the scene editor and the P&ID panel.
 *
 * Pipe geometry is never stored: it is recomputed from the two port anchors on
 * every render, so a pipe follows its equipment when the consumer drags it.
 * The routine mirrors the JointJS rightAngle family: push a stub out of each
 * port along its declared side, choose an L/Z/S/U bend set from the two sides,
 * collapse collinear points, and emit a rounded SVG path.
 */

export type RoutePoint = { x: number; y: number };
export type RouteSide = "left" | "right" | "top" | "bottom";
export type RoutePort = RoutePoint & { side: RouteSide };

export function stubOut(point: RoutePoint, side: RouteSide, distance: number): RoutePoint {
  if (side === "left") return { x: point.x - distance, y: point.y };
  if (side === "right") return { x: point.x + distance, y: point.y };
  if (side === "top") return { x: point.x, y: point.y - distance };
  return { x: point.x, y: point.y + distance };
}

function bends(first: RoutePoint, firstSide: RouteSide, second: RoutePoint, secondSide: RouteSide): RoutePoint[] {
  const firstHorizontal = firstSide === "left" || firstSide === "right";
  const secondHorizontal = secondSide === "left" || secondSide === "right";
  if (firstHorizontal && secondHorizontal) {
    const middleX = (first.x + second.x) / 2;
    return [{ x: middleX, y: first.y }, { x: middleX, y: second.y }];
  }
  if (!firstHorizontal && !secondHorizontal) {
    const middleY = (first.y + second.y) / 2;
    return [{ x: first.x, y: middleY }, { x: second.x, y: middleY }];
  }
  return firstHorizontal ? [{ x: second.x, y: first.y }] : [{ x: first.x, y: second.y }];
}

export function simplify(points: RoutePoint[]): RoutePoint[] {
  const result: RoutePoint[] = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (previous && Math.abs(previous.x - point.x) < 0.5 && Math.abs(previous.y - point.y) < 0.5) continue;
    result.push(point);
    while (result.length >= 3) {
      const first = result[result.length - 3];
      const middle = result[result.length - 2];
      const last = result[result.length - 1];
      if (!first || !middle || !last) break;
      const collinear = (Math.abs(first.x - middle.x) < 0.5 && Math.abs(middle.x - last.x) < 0.5)
        || (Math.abs(first.y - middle.y) < 0.5 && Math.abs(middle.y - last.y) < 0.5);
      if (!collinear) break;
      result.splice(result.length - 2, 1);
    }
  }
  return result;
}

export function routeOrthogonal(source: RoutePort, target: RoutePort, stub = 24): RoutePoint[] {
  const sourceStub = stubOut(source, source.side, stub);
  const targetStub = stubOut(target, target.side, stub);
  return simplify([source, sourceStub, ...bends(sourceStub, source.side, targetStub, target.side), targetStub, target]);
}

export function pointsToPath(points: RoutePoint[], radius = 9): string {
  const first = points[0];
  if (!first) return "";
  let path = `M ${first.x} ${first.y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    if (!previous || !corner || !next) continue;
    const incoming = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outgoing = Math.hypot(next.x - corner.x, next.y - corner.y);
    const appliedRadius = Math.min(radius, incoming / 2, outgoing / 2);
    if (appliedRadius < 1) {
      path += ` L ${corner.x} ${corner.y}`;
      continue;
    }
    const incomingX = corner.x - ((corner.x - previous.x) / incoming) * appliedRadius;
    const incomingY = corner.y - ((corner.y - previous.y) / incoming) * appliedRadius;
    const outgoingX = corner.x + ((next.x - corner.x) / outgoing) * appliedRadius;
    const outgoingY = corner.y + ((next.y - corner.y) / outgoing) * appliedRadius;
    path += ` L ${incomingX} ${incomingY} Q ${corner.x} ${corner.y} ${outgoingX} ${outgoingY}`;
  }
  const last = points.at(-1);
  return last ? `${path} L ${last.x} ${last.y}` : path;
}
