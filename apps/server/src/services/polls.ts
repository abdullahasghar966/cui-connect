/**
 * Polls in chats. Anyone who may post can start one (it is sent like a message); anyone who
 * may read the chat can vote, change or withdraw their vote; the poll's author or a moderator
 * closes it. Every change is broadcast to the chat's room, so counts update live for members.
 */
import {
  canModerate,
  canRead,
  type MessageRefInput,
  type PollDTO,
  type PollVoteInput,
} from '@cui/shared';
import { assertAllowed, badRequest, forbidden, notFound } from '../lib/errors';
import {
  Group,
  type GroupDoc,
  Membership,
  type MembershipDoc,
  Message,
  type MessageDoc,
  type UserDoc,
} from '../models';
import { broadcastPollUpdated } from '../realtime/notifier';
import { toObjectId, toPolicyGroup, toPolicyMembership, toPolicyUser, toPollDTO } from './mappers';

async function loadPoll(user: UserDoc, messageId: string) {
  const message = await Message.findById(toObjectId(messageId)).lean<MessageDoc>();
  if (!message || message.deletedAt || message.kind !== 'poll' || !message.poll) {
    throw notFound('This poll no longer exists.');
  }
  const [group, membership] = await Promise.all([
    Group.findById(message.groupId).lean<GroupDoc>(),
    Membership.findOne({ groupId: message.groupId, userId: user._id }).lean<MembershipDoc>(),
  ]);
  if (!group) throw notFound('This chat no longer exists.');
  const context = {
    user: toPolicyUser(user),
    group: toPolicyGroup(group),
    membership: toPolicyMembership(membership),
  };
  assertAllowed(canRead(context.user, context.group, context.membership));
  return { message, poll: message.poll, context };
}

async function publish(message: MessageDoc): Promise<PollDTO> {
  const fresh = await Message.findById(message._id).lean<MessageDoc>();
  if (!fresh?.poll) throw notFound('This poll no longer exists.');
  const poll = toPollDTO(fresh.poll);
  broadcastPollUpdated(String(fresh.groupId), String(fresh._id), poll);
  return poll;
}

export async function votePoll(user: UserDoc, input: PollVoteInput): Promise<PollDTO> {
  const { message, poll } = await loadPoll(user, input.messageId);
  if (poll.closedAt) throw badRequest('This poll is closed.');
  const choices = [...new Set(input.optionIds)];
  const known = new Set(poll.options.map((o) => o.id));
  if (choices.some((id) => !known.has(id))) throw badRequest('That option is not in this poll.');
  if (!poll.multiple && choices.length > 1) throw badRequest('This poll allows one answer.');

  // Replace this person's vote in one step (no window where it's counted twice).
  await Message.updateOne(
    { _id: message._id, 'poll.closedAt': null },
    [
      {
        $set: {
          'poll.votes': {
            $concatArrays: [
              {
                $filter: {
                  input: '$poll.votes',
                  cond: { $ne: ['$$this.userId', user._id] },
                },
              },
              choices.length ? [{ userId: user._id, optionIds: choices }] : [],
            ],
          },
        },
      },
    ],
    { updatePipeline: true },
  );
  return publish(message);
}

export async function closePoll(user: UserDoc, input: MessageRefInput): Promise<PollDTO> {
  const { message, poll, context } = await loadPoll(user, input.messageId);
  const author = String(message.senderId) === String(user._id);
  if (!author && !canModerate(context.user, context.group, context.membership).allowed) {
    throw forbidden('Only the person who started the poll or a moderator can close it.');
  }
  if (!poll.closedAt) {
    await Message.updateOne(
      { _id: message._id },
      { $set: { 'poll.closedAt': new Date(), 'poll.closedById': user._id } },
    );
  }
  return publish(message);
}
