import type { CanvasItem, Ink, Point } from './canvasModel';
function localPoint(item: CanvasItem, point: [number, number]): [number, number] {
    const angle = -item.rotation * Math.PI / 180;
    const x = point[0] - item.x - item.width / 2, y = point[1] - item.y - item.height / 2;
    return [x * Math.cos(angle) - y * Math.sin(angle) + item.width / 2, x * Math.sin(angle) + y * Math.cos(angle) + item.height / 2];
}
/** A freehand polygon selects objects it encloses or crosses. */
export function lassoHit(item: CanvasItem, polygon: Point[]): boolean {
    if (polygon.length < 3) return false;
    const points = polygon.map(p => localPoint(item, [p[0], p[1]]));
    const inside = (x: number, y: number) => {
        let result = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const a = points[i], b = points[j];
            if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
        }
        return result;
    };
    const intersects = (a: [number, number], b: [number, number], c: [number, number], d: [number, number]) => {
        const dx = b[0]-a[0], dy = b[1]-a[1], ex = d[0]-c[0], ey = d[1]-c[1], cross = dx*ey-dy*ex;
        if (Math.abs(cross) < 1e-9) return false;
        const t = ((c[0]-a[0])*ey-(c[1]-a[1])*ex)/cross, u = ((c[0]-a[0])*dy-(c[1]-a[1])*dx)/cross;
        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    };
    const path: [number, number][] = item.type === 'stroke' ? item.points.map(p => [p[0],p[1]]) : [[0,0],[item.width,0],[item.width,item.height],[0,item.height],[0,0]];
    if (path.some(p => inside(...p))) return true;
    if (item.type !== 'stroke' && points.some(p => p[0]>=0 && p[0]<=item.width && p[1]>=0 && p[1]<=item.height)) return true;
    for (let i=1;i<path.length;i++) for (let j=0;j<points.length;j++) if (intersects(path[i-1],path[i],points[j],points[(j+1)%points.length])) return true;
    return false;
}
export const roundCanvas = (n: number) => Math.round(n * 100) / 100;
export function directedLine(start: Point, end: Point, snap: boolean) {
    const dx = end[0] - start[0], dy = end[1] - start[1];
    const width = Math.max(.1, Math.hypot(dx, dy));
    const angle = snap ? Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4 : Math.atan2(dy, dx);
    return { x: roundCanvas(start[0] + Math.cos(angle) * width / 2 - width / 2), y: roundCanvas(start[1] + Math.sin(angle) * width / 2 - .05), width: roundCanvas(width), height: .1, rotation: roundCanvas(angle * 180 / Math.PI) };
}
export function simplifyInk(points: Point[], tolerance = .6): Point[] {
    if (points.length <= 2)
        return points;
    const result: Point[] = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
        const last = result[result.length - 1], p = points[i];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= tolerance || Math.abs(p[2] - last[2]) > .08)
            result.push(p);
    }
    result.push(points[points.length - 1]);
    return result;
}
export function inkPath(ink: Pick<Ink, 'points' | 'strokeWidth' | 'tool'>): string {
    const { points, strokeWidth, tool } = ink;
    if (!points.length)
        return '';
    if (tool === 'highlighter')
        return points.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
    const left: string[] = [], right: string[] = [];
    for (let i = 0; i < points.length; i++) {
        const p = points[i], previous = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
        const dx = next[0] - previous[0], dy = next[1] - previous[1], length = Math.hypot(dx, dy) || 1;
        const radius = strokeWidth * (.25 + .75 * p[2]) / 2;
        left.push(`${roundCanvas(p[0] - dy / length * radius)} ${roundCanvas(p[1] + dx / length * radius)}`);
        right.push(`${roundCanvas(p[0] + dy / length * radius)} ${roundCanvas(p[1] - dx / length * radius)}`);
    }
    if (points.length === 1) {
        const [x, y, p] = points[0], r = strokeWidth * (.25 + .75 * p) / 2;
        return `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
    }
    return `M${left.join('L')}L${right.reverse().join('L')}Z`;
}
function segmentDistance(point: [
    number,
    number
], a: Point, b: Point) {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length)) : 0;
    return Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dy * t);
}
export function inkHit(ink: Ink, point: [
    number,
    number
], radius: number): boolean {
    const local: [
        number,
        number
    ] = localPoint(ink, point);
    return ink.points.some((p, i) => segmentDistance(local, p, ink.points[Math.min(i + 1, ink.points.length - 1)]) <= radius + ink.strokeWidth / 2);
}
/** Clip each segment at the eraser circle, inserting boundary points instead of
 * merely dropping sampled vertices (which would reconnect gaps in sparse ink). */
export function splitInk(ink: Ink, point: [
    number,
    number
], radius: number): Point[][] {
    const center = localPoint(ink, point);
    const r = radius + ink.strokeWidth / 2;
    const parts: Point[][] = [];
    let current: Point[] = [];
    const outside = (p: Point) => Math.hypot(p[0] - center[0], p[1] - center[1]) > r;
    if (ink.points.length === 1)
        return outside(ink.points[0]) ? [ink.points] : [];
    for (let i = 0; i < ink.points.length - 1; i++) {
        const a = ink.points[i], b = ink.points[i + 1], dx = b[0] - a[0], dy = b[1] - a[1];
        const ox = a[0] - center[0], oy = a[1] - center[1], A = dx * dx + dy * dy, B = 2 * (ox * dx + oy * dy), C = ox * ox + oy * oy - r * r;
        const discriminant = B * B - 4 * A * C;
        const ts = [0, 1];
        if (A && discriminant > 0)
            for (const t of [(-B - Math.sqrt(discriminant)) / (2 * A), (-B + Math.sqrt(discriminant)) / (2 * A)])
                if (t > 0 && t < 1)
                    ts.push(t);
        ts.sort((x, y) => x - y);
        const interpolate = (t: number): Point => [roundCanvas(a[0] + dx * t), roundCanvas(a[1] + dy * t), roundCanvas(a[2] + (b[2] - a[2]) * t)];
        for (let j = 0; j < ts.length - 1; j++) {
            const from = interpolate(ts[j]), to = interpolate(ts[j + 1]), mid = interpolate((ts[j] + ts[j + 1]) / 2);
            if (outside(mid)) {
                if (!current.length)
                    current.push(from);
                current.push(to);
            }
            else if (current.length) {
                parts.push(current);
                current = [];
            }
        }
    }
    if (current.length)
        parts.push(current);
    return parts;
}
