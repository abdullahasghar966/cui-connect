/** Rooms: classrooms, labs and exam halls (campus setup, IT only). */
import type { RoomDTO, RoomInput } from '@cui/shared';
import { roomSchema } from '@cui/shared';
import { conflict, isDuplicateKeyError, notFound, parse } from '../lib/errors';
import { Room, type RoomDoc, type UserDoc } from '../models';
import { recordAudit } from './audit';

export function toRoomDTO(room: RoomDoc): RoomDTO {
  return {
    id: String(room._id),
    name: room.name,
    block: room.block,
    floor: room.floor,
    kind: room.kind,
    capacity: room.capacity,
    examRows: room.examRows,
    examCols: room.examCols,
  };
}

export async function listRooms(): Promise<RoomDTO[]> {
  const rooms = await Room.find().sort({ block: 1, name: 1 }).lean<RoomDoc[]>();
  return rooms.map(toRoomDTO);
}

export async function saveRoom(
  actor: UserDoc,
  roomId: string | null,
  input: RoomInput,
): Promise<RoomDTO> {
  const data = parse(roomSchema, input);
  try {
    const room = roomId
      ? await Room.findByIdAndUpdate(
          roomId,
          { $set: data },
          { returnDocument: 'after' },
        ).lean<RoomDoc>()
      : (await Room.create(data)).toObject<RoomDoc>();
    if (!room) throw notFound('Room not found.');
    void recordAudit({
      action: roomId ? 'room.updated' : 'room.created',
      actor,
      summary: `${actor.name} ${roomId ? 'updated' : 'added'} room ${room.name} (${room.block})`,
      targetType: 'room',
      targetId: room._id,
    });
    return toRoomDTO(room);
  } catch (err) {
    if (isDuplicateKeyError(err)) throw conflict(`A room named ${data.name} already exists.`);
    throw err;
  }
}

export async function deleteRoom(actor: UserDoc, roomId: string): Promise<void> {
  const room = await Room.findById(roomId).lean<RoomDoc>();
  if (!room) throw notFound('Room not found.');
  await Room.deleteOne({ _id: room._id });
  void recordAudit({
    action: 'room.deleted',
    actor,
    summary: `${actor.name} removed room ${room.name}`,
    targetType: 'room',
    targetId: room._id,
  });
}
