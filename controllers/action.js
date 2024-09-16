const COMMON = require('../utils/common');

async function handleEstimateApproved({ ack, body, client }) {
  await ack();
  let whoClickedApprove = body.user.id;
  let requester = body.message.blocks[0].text.text
    .replace(' is requesting estimation approval.', '')
    .split('\n')[1];
  let whoApprovedProfile = await client.users.profile.get({
    user: whoClickedApprove,
  });
  let whoApprovedProfilePhotoUrl = whoApprovedProfile.profile.image_original;
  let approver = body.message.blocks[0].text.text
    .match(/U[A-Z0-9]+/g)
    .slice(0, -1);
  let canApprove =
    approver.includes(whoClickedApprove) ||
    whoClickedApprove === COMMON.pmUserId;
  let originalMessage = body.message.blocks;
  let assignedBE = originalMessage[originalMessage.length - 1].elements[0].text;

  if (
    canApprove &&
    approver.includes(whoClickedApprove) &&
    whoClickedApprove !== COMMON.pmUserId
  ) {
    originalMessage.length === 5
      ? originalMessage.splice(2, 3)
      : originalMessage.splice(3, 3);
    originalMessage[0] = {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<@${COMMON.pmUserId}>\n <@${whoClickedApprove}> approved the request from ${requester}.`,
      },
    };
    let postMessageResponse = await client.chat.postMessage({
      channel: body.channel.id,
      thread_ts: body.message.ts,
      blocks: originalMessage,
      icon_url: whoApprovedProfilePhotoUrl,
    });
    console.log(postMessageResponse);
  } else if (canApprove && whoClickedApprove === COMMON.pmUserId) {
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
  } else {
    await client.chat.postEphemeral({
      channel: body.channel.id,
      user: whoClickedApprove,
      text: 'You do not have permission to approve this request.',
    });
  }
}

async function handleEstimateDenied ({ ack, body, client }) {
    await ack();
    let originalMessage = body.message.blocks;
    let requester = body.message.blocks[0].text.text.replace(" is requesting estimation approval.", "").split("\n")[1];
    let approver = body.message.blocks[0].text.text.match(/U[A-Z0-9]+/g).slice(0, -1);
    let whoClickedDeny = body.user.id;
    originalMessage.length === 5 ? originalMessage.splice(2, 3) : originalMessage.splice(3, 3);
    let canDeny = approver.includes(whoClickedDeny) || whoClickedDeny === COMMON.pmUserId;
    let whoDeniedProfile = await client.users.profile.get({user: whoClickedDeny,});
    let whoDeniedProfilePhotoUrl = whoDeniedProfile.profile.image_original;
  
    if (canDeny) {
      let postMessageResponse = await client.chat.postMessage({
        channel: body.channel.id,
        thread_ts: body.message.ts,
        text: `${requester}\n<@${whoClickedDeny}> has denied your estimation request. Please re-assess MD and DL.`,
        icon_url: whoDeniedProfilePhotoUrl,
      });
      let updateMessageResponse = await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        blocks: originalMessage,
      });
      console.log(postMessageResponse.ok, updateMessageResponse.ok);
    } else {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: whoClickedDeny,
        text: "You do not have permission to deny this request.",
      });
    }
  }

module.exports = {
  handleEstimateApproved,
  handleEstimateDenied
};
