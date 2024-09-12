const { App, ExpressReceiver } = require("@slack/bolt");
const HELPER = require("./utils/helpers");
const COMMON = require("./utils/common");
const SERVICE = require("./utils/services");
const COMMAND = require("./controllers/command");

const expressReceiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: "/slack/events",
})

expressReceiver.router.get('/ping', (req, res) => {
  res.status(200).send('OK');
})

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: expressReceiver
});
// ========== ENTER BOLT CODE AFTER THIS LINE  ==========
app.command("/post-ticket", COMMAND.handlePostTicket);

app.command("/estimate", COMMAND.handleEstimate);

app.view("estimation_modal", async ({ ack, view, client, body}) => {
  await ack();
  let requesterId = body.user.id;
  let requesterProfile = await client.users.profile.get({ user: requesterId });
  let requesterProfilePhotoUrl = requesterProfile.profile.image_original;

  let issueKey = view.title.text.replace(" Estimation", "");
  let actionItem = view.state.values.action_item_owner.radio_buttons_action.selected_option.text.text;
  let arrPlatform =view.state.values.platform.platform_select_action.selected_options.map((option) => option.text.text);
  let strPlatform = arrPlatform.join(", ");
  let md_estimate = view.state.values.md_estimate.md_estimate_action.value;
  let dl_estimate = view.state.values.dl_estimate.deadline_action.selected_date;
  let formatted_dl_estimate = HELPER.formatDate(dl_estimate);
  let dl_reason = view.state.values.dl_reason.dl_reason_action.value;
  let arrPlatformLead = HELPER.getLeadId(strPlatform, actionItem, issueKey);
  let arrApproverMentioned = arrPlatformLead.includes(requesterId) ? [COMMON.pmUserId] : arrPlatformLead;
  let assignedBEId = view.blocks[5].elements[2].text;

  let modal_errors = HELPER.checkEstimationModalErrors(formatted_dl_estimate,md_estimate,view);
  if (Object.keys(modal_errors).length > 0) {
    await ack({
      response_action: "errors",
      errors: modal_errors,
    });
    return;
  } else {
    let estimateBlock = HELPER.createEstimateBlock(requesterId,actionItem,strPlatform,md_estimate,formatted_dl_estimate,dl_reason,assignedBEId,arrApproverMentioned);
    let slackResponse = await client.chat.postMessage({
      channel: view.blocks[5].elements[1].text,
      thread_ts: view.blocks[5].elements[0].text,
      blocks: estimateBlock,
      text: `<@${requesterId}> is requesting estimation approval.`,
      icon_url: requesterProfilePhotoUrl,
    });
    let slackAssigneeName = (await client.users.info({user: body.user.id})).user.profile.display_name;
    let jiraAssigneeId = await SERVICE.getJiraAccountId(slackAssigneeName);
    console.log(jiraAssigneeId[0].accountId);
    let jiraResponse = await SERVICE.updateJiraSubtasks(issueKey,actionItem,arrPlatform,dl_estimate,jiraAssigneeId);
    console.log(slackResponse.status, jiraResponse);
  }
});

app.action("estimate_approved", async ({ ack, body, client }) => {
  await ack();
  let whoClickedApprove = body.user.id;
  let requester = body.message.blocks[0].text.text.replace(" is requesting estimation approval.", "").split("\n")[1];
  let whoApprovedProfile = await client.users.profile.get({user: whoClickedApprove,});
  let whoApprovedProfilePhotoUrl = whoApprovedProfile.profile.image_original;
  let approver = body.message.blocks[0].text.text.match(/U[A-Z0-9]+/g).slice(0, -1);
  let canApprove = approver.includes(whoClickedApprove) || whoClickedApprove === COMMON.pmUserId;
  let originalMessage = body.message.blocks;
  let assignedBE = originalMessage[originalMessage.length - 1].elements[0].text;

  if (canApprove && approver.includes(whoClickedApprove) && whoClickedApprove !== COMMON.pmUserId) {
    originalMessage.length === 5 ? originalMessage.splice(2, 3) : originalMessage.splice(3, 3);
    originalMessage[0] = {
      type: "section",
      text: {
        type: "mrkdwn",
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
    pmApprovedMessageBlock.length === 5 ? pmApprovedMessageBlock.splice(2, 3) : pmApprovedMessageBlock.splice(3, 3);
    originalMessage.length === 5 ? originalMessage.splice(2, 3) : originalMessage.splice(3, 3);
    pmApprovedMessageBlock[0] = {
      type: "section",
      text: {
        type: "mrkdwn",
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
      text: "You do not have permission to approve this request.",
    });
  }
});

app.action("estimate_denied", async ({ ack, body, client }) => {
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
});

app.command("/versionbug", COMMAND.handleVersionBug);

//handle legacy attachment action when estimate button clicked
app.use(async ({ ack, client, body, next }) => {
  if (body.type === "interactive_message" && body.callback_id === "estimation") {
    await ack();
    let assignedBEId = body.original_message.attachments[0].fields[0].value.match(COMMON.slackIdRegex)[1];
    let formattedTodayDate = new Date().toISOString().split("T")[0];
    let jiraIssueRegex = /[A-Z]+-[0-9]+/;
    let issueKey =body.original_message.blocks[0].elements[0].elements[2].text.match(jiraIssueRegex);
    let estimateModal = HELPER.createEstimateModal(issueKey, formattedTodayDate, body.message_ts, body.channel.id, assignedBEId);
    let showModalResponse = await client.views.open({
      trigger_id: body.trigger_id,
      view: estimateModal,
      user_id: body.user.id,
    });
    console.log(showModalResponse);
  } else {
    await next();
  }
});
// ========== ENTER BOLT CODE BEFORE THIS LINE  ==========
(async () => {
  await app.start(process.env.PORT || 3000);

  console.log("⚡️ Bolt app is running at PORT " + process.env.PORT);
})();