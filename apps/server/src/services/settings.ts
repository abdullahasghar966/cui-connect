/** Campus-wide rules IT can change (today: the minimum attendance to sit the terminal exam). */
import {
  type CampusSettingsDTO,
  type CampusSettingsInput,
  campusSettingsSchema,
  canManageCampus,
  DEFAULT_MIN_ATTENDANCE,
} from '@cui/shared';
import { assertAllowed, parse } from '../lib/errors';
import { CampusSettings, type CampusSettingsDoc, type UserDoc } from '../models';
import { recordAudit } from './audit';
import { toPolicyUser } from './mappers';

let cached: { value: Promise<CampusSettingsDTO>; at: number } | null = null;
const TTL_MS = 30_000;

export function getCampusSettings(): Promise<CampusSettingsDTO> {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    const value = CampusSettings.findById('campus')
      .lean<CampusSettingsDoc>()
      .then((doc) => ({
        minAttendance: doc?.minAttendance ?? DEFAULT_MIN_ATTENDANCE,
        registrationMode: doc?.registrationMode ?? 'calendar',
        evaluationOpen: doc?.evaluationOpen ?? false,
      }));
    cached = { value, at: Date.now() };
    value.catch(() => {
      cached = null;
    });
  }
  return cached.value;
}

export function invalidateCampusSettings(): void {
  cached = null;
}

export async function updateCampusSettings(
  actor: UserDoc,
  input: CampusSettingsInput,
): Promise<CampusSettingsDTO> {
  assertAllowed(canManageCampus(toPolicyUser(actor)));
  const data = parse(campusSettingsSchema, input);
  const before = await getCampusSettings();
  await CampusSettings.updateOne({ _id: 'campus' }, { $set: data }, { upsert: true });
  invalidateCampusSettings();
  if (before.minAttendance !== data.minAttendance) {
    void recordAudit({
      action: 'settings.updated',
      actor,
      summary: `${actor.name} changed the minimum attendance from ${before.minAttendance}% to ${data.minAttendance}%`,
      targetType: 'settings',
    });
  }
  return getCampusSettings();
}
