const HELPER = require('../utils/helpers');
const COMMON = require('../utils/common');

async function handleEstimateButtonClicked({ ack, client, body, next }) {
  if (
    body.type === 'interactive_message' &&
    body.callback_id === 'estimation'
  ) {
    await ack();
    let assignedBEId =
      body.original_message.attachments[0].fields[0].value.match(
        COMMON.slackIdRegex
      )[1];
    let formattedTodayDate = new Date().toISOString().split('T')[0];
    let jiraIssueRegex = /[A-Z]+-[0-9]+/;
    let issueKey =
      body.original_message.blocks[0].elements[0].elements[2].text.match(
        jiraIssueRegex
      );
    let estimateModal = HELPER.createEstimateModal(
      issueKey,
      formattedTodayDate,
      body.message_ts,
      body.channel.id,
      assignedBEId
    );
    let showModalResponse = await client.views.open({
      trigger_id: body.trigger_id,
      view: estimateModal,
      user_id: body.user.id,
    });
    console.log(showModalResponse);
  } else {
    await next();
  }
}

module.exports = {
  handleEstimateButtonClicked,
};
