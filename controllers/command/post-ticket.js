module.exports = {
    handlePostTicket: async ({ command, ack, respond, client }) => {
        await ack();
        const jiraBaseUrl = "https://native-camp.atlassian.net/browse/";
        let requestKey = command.text.trim();
        let channelId = command.channel_id;
        try {
          validateKey(requestKey);
          let jiraDetails = await fetchJiraIssue(requestKey);
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
            let updateResponse = await updateSlackThreadUrl(jiraDetails.issueKey,`https://fdcinc.slack.com/archives/${postResponse.channel}/p${postResponse.ts.replace(".", "")}`);
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
}