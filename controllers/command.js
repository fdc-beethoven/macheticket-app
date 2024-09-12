const HELPER = require("../utils/helpers");
const COMMON = require("../utils/common");
const SERVICE = require("../utils/services");

async function handlePostTicket({ command, ack, respond, client }) {
    await ack();
    const jiraBaseUrl = "https://native-camp.atlassian.net/browse/";
    let requestKey = command.text.trim();
    let channelId = command.channel_id;
    try {
      HELPER.validateKey(requestKey);
      let jiraDetails = await SERVICE.fetchJiraIssue(requestKey);
      let jiraIssueLink = jiraBaseUrl + requestKey;
      let payloadText = `<!here> *${jiraDetails.issueKey} ${jiraDetails.summary}* \`\`\`JIRA: <${jiraIssueLink}|${jiraIssueLink}>\`\`\``;
      let postResponse = await client.chat.postMessage({
        channel: channelId,
        text: payloadText,
        attachments: [
          {
            id: 1,
            color: "3AA3E3",
            fallback: "Estimation unsuccessful.",
            callback_id: "estimation",
            fields: [
              {
                value: `<@${jiraDetails.assignedBE}>`,
                title: "AssignedBE:",
                short: true,
              },
              {
                value: `:${jiraDetails.priority}:  ${jiraDetails.priority}`,
                title: "Priority:",
                short: true,
              },
            ],
            actions: [
              {
                id: "click_estimate",
                name: "estimate",
                text: "Estimate",
                type: "button",
                value: "estimate_clicked",
                style: "",
              },
            ],
          },
        ],
      });
      if (postResponse.ok) {
        let updateResponse = await SERVICE.updateSlackThreadUrl(jiraDetails.issueKey,`https://fdcinc.slack.com/archives/${postResponse.channel}/p${postResponse.ts.replace(".", "")}`);
        respond({
          response_type: "ephemeral",
          text: "Ticket has been posted~",
        });
      }
    } catch (error) {
      await respond({
        response_type: "ephemeral",
        text: error.message,
      });
    }
  }

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

module.exports = { handlePostTicket, handleEstimate }