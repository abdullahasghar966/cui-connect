/**
 * The viewer's own profile. Details like name, registration number and section are kept by IT
 * (they come from the university's records); people choose their own photo, which everyone signed
 * in sees next to their name in chats, member lists and the directory.
 */
import { type ProfilePhotoInput, profilePhotoSchema, type UserDTO } from '@cui/shared';
import { notFound, parse } from '../lib/errors';
import { User, type UserDoc } from '../models';
import { claimFiles, deleteFiles } from './files';
import { getOrgLookup, toObjectId, toUserDTO } from './mappers';

/** Sets (or, with null, removes) the viewer's photo; the previous one is deleted. */
export async function setProfilePhoto(viewer: UserDoc, input: ProfilePhotoInput): Promise<UserDTO> {
  const { photoId } = parse(profilePhotoSchema, input);
  const current = await User.findById(viewer._id)
    .select('photoId')
    .lean<Pick<UserDoc, 'photoId'>>();
  const unchanged = !!photoId && String(current?.photoId) === photoId;
  if (photoId && !unchanged) {
    await claimFiles(viewer, [photoId], {
      purpose: 'avatar',
      offeringId: null,
      attachTo: viewer._id,
    });
  }
  const updated = await User.findByIdAndUpdate(
    viewer._id,
    { $set: { photoId: photoId ? toObjectId(photoId) : null } },
    { returnDocument: 'after' },
  ).lean<UserDoc>();
  if (!updated) throw notFound('Account not found.');
  if (current?.photoId && String(current.photoId) !== photoId) await deleteFiles([current.photoId]);
  return toUserDTO(updated, await getOrgLookup());
}
