export type Point = readonly [number, number]
export type Half = 'upper' | 'lower'
export type Side = 'left' | 'right'
export type RoomId = 'living' | 'kitchen' | 'bedroom' | 'study'
export interface Room {
  id: RoomId
  name: string
  half: Half
  side: Side
  label: Point
}
export const rooms: Room[] = [
  { id: 'living', name: 'Living room', half: 'upper', side: 'left', label: [-5.45,-1.34] },
  { id: 'kitchen', name: 'Kitchen', half: 'upper', side: 'right', label: [1.65,-1.34] },
  { id: 'bedroom', name: 'Bedroom', half: 'lower', side: 'left', label: [-5.5,1.55] },
  { id: 'study', name: 'Study', half: 'lower', side: 'right', label: [1.55,1.55] }
]
export interface Destination {
  id: string
  name: string
  room: RoomId
  parking: Point
  heading: number // Radians clockwise from +z.
}
function destination(id: string, name: string, room: RoomId, parking: Point, heading: number): Destination {
  return { id, name, room, parking, heading }
}
export const destinations = [
  destination('tv','TV','living',[-5.38,-3.15],-Math.PI/2),
  destination('living-window','Living-room window','living',[-4.33,-4.53],Math.PI),
  destination('table','Dining table','kitchen',[3.5,-3.75],-Math.PI/2),
  destination('counter','Kitchen counter','kitchen',[5.23,-3.28],Math.PI/2),
  destination('bed','Bedside','bedroom',[-3.95,3.55],-Math.PI/2),
  destination('bed-window','Bedroom window','bedroom',[-2.18,4.48],0),
  destination('desk','Desk','study',[5.26,3.48],Math.PI/2),
  destination('books','Bookshelf','study',[1.68,3.5],0)
]
// Interior approach points keep diagonal segments clear of the doorway jambs.
const doorwayApproach: Record<RoomId, Point> = {
  living: [-3.5,-1.58], kitchen: [3.5,-1.58],
  bedroom: [-3.5,1.58], study: [3.5,1.58]
}
export function route(from: Destination, to: Destination): Point[] {
  if (from.id === to.id) return []
  if (from.room === to.room) return [from.parking, to.parking]
  const exit = doorwayApproach[from.room]
  const entry = doorwayApproach[to.room]
  const points = [from.parking, exit]
  if (exit[0] !== entry[0]) points.push([exit[0], 0], [entry[0], 0])
  points.push(entry, to.parking)
  return points
}
export function roomFor(half: Half, side: Side) {
  return rooms.find(room => room.half === half && room.side === side)!
}
