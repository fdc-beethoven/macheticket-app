const HELPER = require("../utils/helpers");
const COMMON = require("../utils/common");
const SERVICE = require("../utils/services");

async function handleEstimate({ command, ack, respond, client }) {
  await ack();
  let requestKey = command.text.trim();
  let formattedTodayDate = new Date().toISOString().split('T')[0];
  try {
    let jiraData = await SERVICE.fetchJiraIssue(requestKey);
    let slackLink = jiraData.slackUrl;
    let slackTs = HELPER.extractSlackTimestamp(slackLink);
    let slackChannel = HELPER.extractSlackChannelId(slackLink);
    let estimateModal = HELPER.createEstimateModal(
      requestKey,
      formattedTodayDate,
      slackTs,
      slackChannel,
      jiraData.assignedBE
    );
    let response = await client.views.open({
      trigger_id: command.trigger_id,
      view: estimateModal,
    });
    console.log(response);
  } catch (error) {
    await respond({
      response_type: 'ephemeral',
      text: error.message,
    });
  }
}

module.exports = { handleEstimate }