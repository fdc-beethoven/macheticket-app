const HELPER = require('../utils/helpers');
const SERVICE = require('../utils/services');
const COMMON = require('../utils/common');

async function handleEstimateModalSubmit({ ack, view, client, body }) {
  await ack();
  let requesterId = body.user.id;
  let requesterProfile = await client.users.profile.get({ user: requesterId });
  let requesterProfilePhotoUrl = requesterProfile.profile.image_original;

  let issueKey = view.title.text.replace(' Estimation', '');
  let actionItem =
    view.state.values.action_item_owner.radio_buttons_action.selected_option
      .text.text;
  let arrPlatform =
    view.state.values.platform.platform_select_action.selected_options.map(
      option => option.text.text
    );
  let strPlatform = arrPlatform.join(', ');
  let md_estimate = view.state.values.md_estimate.md_estimate_action.value;
  let dl_estimate = view.state.values.dl_estimate.deadline_action.selected_date;
  let formatted_dl_estimate = HELPER.formatDate(dl_estimate);
  let dl_reason = view.state.values.dl_reason.dl_reason_action.value;
  let arrPlatformLead = HELPER.getLeadId(strPlatform, actionItem, issueKey);
  let arrApproverMentioned = arrPlatformLead.includes(requesterId)
    ? [COMMON.pmUserId]
    : arrPlatformLead;
  let assignedBEId = view.blocks[5].elements[2].text;

  let modal_errors = HELPER.checkEstimationModalErrors(
    formatted_dl_estimate,
    md_estimate,
    view
  );
  if (Object.keys(modal_errors).length > 0) {
    await ack({
      response_action: 'errors',
      errors: modal_errors,
    });
    return;
  } else {
    let estimateBlock = HELPER.createEstimateBlock(
      requesterId,
      actionItem,
      strPlatform,
      md_estimate,
      formatted_dl_estimate,
      dl_reason,
      assignedBEId,
      arrApproverMentioned
    );
    let slackResponse = await client.chat.postMessage({
      channel: view.blocks[5].elements[1].text,
      thread_ts: view.blocks[5].elements[0].text,
      blocks: estimateBlock,
      text: `<@${requesterId}> is requesting estimation approval.`,
      icon_url: requesterProfilePhotoUrl,
    });
    let slackAssigneeName = (await client.users.info({ user: body.user.id }))
      .user.profile.display_name;
    let jiraAssigneeId = await SERVICE.getJiraAccountId(slackAssigneeName);
    console.log(jiraAssigneeId[0].accountId);
    let jiraResponse = await SERVICE.updateJiraSubtasks(
      issueKey,
      actionItem,
      arrPlatform,
      dl_estimate,
      jiraAssigneeId
    );
    console.log(slackResponse.status, jiraResponse);
  }
}

module.exports = {
  handleEstimateModalSubmit,
};
