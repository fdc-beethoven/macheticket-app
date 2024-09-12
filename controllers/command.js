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

async function handleVersionBug ({ ack, body, client, respond }) {
    await ack();
    let parameter = body.text.trim();
    let request = parameter.split(" ");
    if (request[0] === "create") {
      let createVersionBugModal = {
        "type": "modal",
        callback_id: "create_versionbug_modal",
        "title": {
          "type": "plain_text",
          "text": "Create Version Bug",
          "emoji": true
        },
        "submit": {
          "type": "plain_text",
          "text": "Submit",
          "emoji": true
        },
        "close": {
          "type": "plain_text",
          "text": "Cancel",
          "emoji": true
        },
        "blocks": [
          {
            "block_id": "summary",
            "type": "input",
            "element": {
              "type": "plain_text_input",
              "action_id": "jira_summary"
            },
            "label": {
              "type": "plain_text",
              "text": "Summary",
              "emoji": true
            }
          },
          {
            "block_id": "description",
            "type": "input",
            "element": {
              "type": "plain_text_input",
              "multiline": true,
              "action_id": "jira_description"
            },
            "label": {
              "type": "plain_text",
              "text": "Description",
              "emoji": true
            }
          },
          {
            "block_id": "components",
            "type": "input",
            "element": {
              "type": "multi_external_select",
              "placeholder": {
                "type": "plain_text",
                "text": "Choose bug components",
                "emoji": true
              },
              "min_query_length": 0,
              "action_id": "select_jira_components"
            },
            "label": {
              "type": "plain_text",
              "text": "Components",
              "emoji": true
            }
          },
          {
            "block_id": "priority",
            "type": "input",
            "element": {
              "type": "static_select",
              "placeholder": {
                "type": "plain_text",
                "text": "Choose priority",
                "emoji": true
              },
              "options": [
                {
                  "text": {
                    "type": "plain_text",
                    "text": ":highest: Highest",
                    "emoji": true
                  },
                  "value": "highest"
                },
                {
                  "text": {
                    "type": "plain_text",
                    "text": ":high: High",
                    "emoji": true
                  },
                  "value": "high"
                },
                {
                  "text": {
                    "type": "plain_text",
                    "text": ":medium: Medium",
                    "emoji": true
                  },
                  "value": "medium"
                },
                {
                  "text": {
                    "type": "plain_text",
                    "text": ":low: Low",
                    "emoji": true
                  },
                  "value": "low"
                },
                {
                  "text": {
                    "type": "plain_text",
                    "text": ":lowest: Lowest",
                    "emoji": true
                  },
                  "value": "lowest"
                }
              ],
              "action_id": "select_jira_priority"
            },
            "label": {
              "type": "plain_text",
              "text": "Priority",
              "emoji": true
            }
          },
          {
            "block_id": "feature_type",
            "type": "input",
            "element": {
              "type": "static_select",
              "placeholder": {
                "type": "plain_text",
                "text": "Is this a version bug or crashlytics?",
                "emoji": true
              },
              "options": [
                {
                  "text": {
                    "type": "plain_text",
                    "text": "version_bug",
                    "emoji": true
                  },
                  "value": "10160"
                },
                {
                  "text": {
                    "type": "plain_text",
                    "text": "crashlytics",
                    "emoji": true
                  },
                  "value": "10161"
                }
              ],
              "action_id": "select_feature_type"
            },
            "label": {
              "type": "plain_text",
              "text": "Feature_type",
              "emoji": true
            }
          }
        ]
      }
      let response = await client.views.open({
        trigger_id: body.trigger_id,
        view: createVersionBugModal
      });
      console.log(response);
    }
  }

module.exports = { handlePostTicket, handleEstimate, handleVersionBug }