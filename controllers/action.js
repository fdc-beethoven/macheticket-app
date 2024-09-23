const COMMON = require('../utils/common');

async function handleEstimateApproved({ ack, body, client }) {
  await ack();
  const whoClickedApprove = body.user.id;
  const requester = body.message.blocks[0].text.text
    .replace(' is requesting estimation approval.', '')
    .split('\n')[1];
  const whoApprovedProfile = await client.users.profile.get({
    user: whoClickedApprove,
  });
  const whoApprovedProfilePhotoUrl = whoApprovedProfile.profile.image_original;
  const approver = body.message.blocks[0].text.text
    .match(/U[A-Z0-9]+/g)
    .slice(0, -1);
  const canApprove =
    approver.includes(whoClickedApprove) ||
    whoClickedApprove === COMMON.pmUserId;
  const originalMessage = body.message.blocks;
  const assignedBE =
    originalMessage[originalMessage.length - 1].elements[0].text;

  if (canApprove && approver.includes(whoClickedApprove)) {
    originalMessage.length === 5
      ? originalMessage.splice(2, 3)
      : originalMessage.splice(3, 3);
    const leadApprovedMessageBlock = [...originalMessage];
    leadApprovedMessageBlock.length === 5
      ? leadApprovedMessageBlock.splice(2, 3)
      : leadApprovedMessageBlock.splice(3, 3);
    leadApprovedMessageBlock[0] = {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<@${assignedBE}>\n <@${whoClickedApprove}> approved the request from ${requester}.`,
      },
    };
    const postMessageResponse = await client.chat.postMessage({
      channel: body.channel.id,
      thread_ts: body.message.ts,
      blocks: leadApprovedMessageBlock,
      icon_url: whoApprovedProfilePhotoUrl,
    });
    const updateMessageResponse = await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      blocks: originalMessage,
    });
    console.log(postMessageResponse.ok, updateMessageResponse.ok);
  } else {
    /*
  else if (canApprove && whoClickedApprove === COMMON.pmUserId) {
    let pmApprovedMessageBlock = [...originalMessage];
    pmApprovedMessageBlock.length === 5
      ? pmApprovedMessageBlock.splice(2, 3)
      : pmApprovedMessageBlock.splice(3, 3);
    originalMessage.length === 5
      ? originalMessage.splice(2, 3)
      : originalMessage.splice(3, 3);
    pmApprovedMessageBlock[0] = {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<@${assignedBE}>\n <@${whoClickedApprove}> approved the request from ${requester}.`,
      },
    };
    let updateMessageResponse = await client.chat.postMessage({
      channel: body.channel.id,
      thread_ts: body.message.ts,
      blocks: originalMessage,
    });
    let postMessageResponse = await client.chat.postMessage({
      channel: body.channel.id,
      thread_ts: body.message.ts,
      blocks: pmApprovedMessageBlock,
      icon_url: whoApprovedProfilePhotoUrl,
    });
    console.log(postMessageResponse.ok, updateMessageResponse.ok);
  } */
    await client.chat.postEphemeral({
      channel: body.channel.id,
      user: whoClickedApprove,
      text: 'You do not have permission to approve this request.',
    });
  }
}

async function handleEstimateDenied({ ack, body, client }) {
  await ack();
  const originalMessage = body.message.blocks;
  const requester = body.message.blocks[0].text.text
    .replace(' is requesting estimation approval.', '')
    .split('\n')[1];
  const approver = body.message.blocks[0].text.text
    .match(/U[A-Z0-9]+/g)
    .slice(0, -1);
  const whoClickedDeny = body.user.id;
  originalMessage.length === 5
    ? originalMessage.splice(2, 3)
    : originalMessage.splice(3, 3);
  const canDeny =
    approver.includes(whoClickedDeny) || whoClickedDeny === COMMON.pmUserId;
  const whoDeniedProfile = await client.users.profile.get({
    user: whoClickedDeny,
  });
  const whoDeniedProfilePhotoUrl = whoDeniedProfile.profile.image_original;

  if (canDeny) {
    const postMessageResponse = await client.chat.postMessage({
      channel: body.channel.id,
      thread_ts: body.message.ts,
      text: `${requester}\n<@${whoClickedDeny}> has denied your estimation request. Please re-assess MD and DL.`,
      icon_url: whoDeniedProfilePhotoUrl,
    });
    const updateMessageResponse = await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      blocks: originalMessage,
    });
    console.log(postMessageResponse.ok, updateMessageResponse.ok);
  } else {
    await client.chat.postEphemeral({
      channel: body.channel.id,
      user: whoClickedDeny,
      text: 'You do not have permission to deny this request.',
    });
  }
}

module.exports = {
  handleEstimateApproved,
  handleEstimateDenied,
};
