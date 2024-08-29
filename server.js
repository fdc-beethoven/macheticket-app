const { App, ExpressReceiver } = require("@slack/bolt");
const axios = require("axios");

const slackIdRegex = /<@(.+?)>/;

const jiraUser = process.env.JIRA_USERNAME;
const jiraToken = process.env.JIRA_TOKEN;
const jiraAuthString = `${jiraUser}:${jiraToken}`;
const jiraHeaders = {
  Accept: "application/json",
  Authorization: `Basic ${Buffer.from(jiraAuthString).toString("base64")}`,
};

const leadsUserId = {
  ios_lead: process.env.IOS_LEAD_ID,
  android_lead: process.env.ANDROID_LEAD_ID,
  talk_web_lead: process.env.TALK_WEB_LEAD_ID,
  qa_lead: process.env.QA_LEAD_ID,
  lulu_web_lead: process.env.LULU_WEB_LEAD_ID,
};

const pmUserId = process.env.PM_USER_ID;

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
app.command("/post-ticket", async ({ command, ack, respond, client }) => {
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
});

app.command("/estimate", async ({ command, ack, respond, client }) => {
  await ack();
  let requestKey = command.text.trim();
  let formattedTodayDate = new Date().toISOString().split("T")[0];
  try {
    let jiraData = await fetchJiraIssue(requestKey);
    let slackLink = jiraData.slackUrl;
    let slackTs = extractSlackTimestamp(slackLink);
    let slackChannel = extractSlackChannelId(slackLink);
    let estimateModal = createEstimateModal(requestKey,formattedTodayDate,slackTs,slackChannel,jiraData.assignedBE);
    let response = await client.views.open({
      trigger_id: command.trigger_id,
      view: estimateModal,
    });
    console.log(response);
  } catch (error) {
    await respond({
      response_type: "ephemeral",
      text: error.message,
    });
  }
});

app.view("estimation_modal", async ({ ack, view, client, body}) => {
  await ack();
  const pmUserId = process.env.PM_USER_ID;
  let requesterId = body.user.id;
  let requesterProfile = await client.users.profile.get({ user: requesterId });
  let requesterProfilePhotoUrl = requesterProfile.profile.image_original;

  let issueKey = view.title.text.replace(" Estimation", "");
  let actionItem =view.state.values.action_item_owner.radio_buttons_action.selected_option.text.text;
  let arrPlatform =view.state.values.platform.platform_select_action.selected_options.map((option) => option.text.text);
  let strPlatform = arrPlatform.join(", ");
  let md_estimate = view.state.values.md_estimate.md_estimate_action.value;
  let dl_estimate = view.state.values.dl_estimate.deadline_action.selected_date;
  let formatted_dl_estimate = formatDate(dl_estimate);
  let dl_reason = view.state.values.dl_reason.dl_reason_action.value;
  let arrPlatformLead = getLeadId(strPlatform, actionItem, issueKey);
  console.log(arrPlatformLead);
  let arrApproverMentioned = arrPlatformLead.includes(requesterId) ? [pmUserId] : arrPlatformLead;
  console.log(arrPlatformLead.includes((leadId) => leadId === requesterId));
  let assignedBEId = view.blocks[5].elements[2].text;

  let modal_errors = checkEstimationModalErrors(formatted_dl_estimate,md_estimate,view);
  if (Object.keys(modal_errors).length > 0) {
    await ack({
      response_action: "errors",
      errors: modal_errors,
    });
    return;
  } else {
    let estimateBlock = createEstimateBlock(requesterId,actionItem,strPlatform,md_estimate,formatted_dl_estimate,dl_reason,assignedBEId,arrApproverMentioned);
    let slackResponse = await client.chat.postMessage({
      channel: view.blocks[5].elements[1].text,
      thread_ts: view.blocks[5].elements[0].text,
      blocks: estimateBlock,
      icon_url: requesterProfilePhotoUrl,
    });
    let jiraResponse = await updateJiraSubtasks(issueKey,actionItem,arrPlatform,dl_estimate);
    console.log(slackResponse.ok, jiraResponse.status);
  }
});

app.action("estimate_approved", async ({ ack, body, client }) => {
  await ack();
  let whoClickedApprove = body.user.id;
  let requester = body.message.blocks[0].text.text.replace(" is requesting estimation approval.", "").split("\n")[1];
  let whoApprovedProfile = await client.users.profile.get({user: whoClickedApprove,});
  let whoApprovedProfilePhotoUrl = whoApprovedProfile.profile.image_original;
  let approver = body.message.blocks[0].text.text.match(/U[A-Z0-9]+/g).slice(0, -1);
  let canApprove =approver.includes(whoClickedApprove) || whoClickedApprove === pmUserId;
  let originalMessage = body.message.blocks;
  let assignedBE = originalMessage[originalMessage.length - 1].elements[0].text;

  if (canApprove && approver.includes(whoClickedApprove)) {
    originalMessage.length === 5 ? originalMessage.splice(2, 3) : originalMessage.splice(3, 3);
    originalMessage[0] = {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `<@${pmUserId}>\n <@${whoClickedApprove}> approved the request from ${requester}.`,
      },
    };
    let postMessageResponse = await client.chat.postMessage({
      channel: body.channel.id,
      thread_ts: body.message.ts,
      blocks: originalMessage,
      icon_url: whoApprovedProfilePhotoUrl,
    });
    console.log(postMessageResponse);
  } else if (canApprove && whoClickedApprove === pmUserId) {
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
  let canDeny = approver.includes(whoClickedDeny) || whoClickedDeny === pmUserId;
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

app.command("/versionbug", async ({ ack, body, client, respond }) => {
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
});

//handle legacy attachment action when estimate button clicked
app.use(async ({ ack, client, body, next }) => {
  if (body.type === "interactive_message" && body.callback_id === "estimation") {
    await ack();
    let assignedBEId = body.original_message.attachments[0].fields[0].value.match(slackIdRegex)[1];
    let formattedTodayDate = new Date().toISOString().split("T")[0];
    let jiraIssueRegex = /[A-Z]+-[0-9]+/;
    let issueKey =body.original_message.blocks[0].elements[0].elements[2].text.match(jiraIssueRegex);
    let estimateModal = createEstimateModal(issueKey, formattedTodayDate, body.message_ts, body.channel.id, assignedBEId);
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

  console.log("⚡️ Bolt app is running!" + process.env.PORT);
})();

// ========== helper functions ==========
function validateKey(requestKey) {
  if (!requestKey) {
    throw new Error("No such issue. Please check again.~");
  }
  const regex = /^[A-Z]+-[0-9]+$/;
  if (!regex.test(requestKey)) {
    throw new Error("This is not a valid ticket. Please check again.~");
  }
}

function extractSlackTimestamp(url) {
  var regex = /\/p(\d{10})(\d{6})/;
  var match = url.match(regex);

  if (match) {
    var timestamp = match[1] + "." + match[2];
    return timestamp;
  } else {
    return "Invalid URL format";
  }
}

function extractSlackChannelId(url) {
  const channelIdRegex = /\/archives\/([A-Z0-9]+)\//;
  const match = url.match(channelIdRegex);
  return match ? match[1] : null;
}

async function fetchJiraIssue(issueKey) {
  const response = await axios.get(
    `https://native-camp.atlassian.net/rest/api/2/issue/${issueKey}`,
    { headers: jiraHeaders }
  );
  const jiraData = response.data;
  let displayNameBE = jiraData.fields.customfield_10033
    ? jiraData.fields.customfield_10033.displayName
    : null;

  function getSlackIdBE(displayNameBE) {
    switch (displayNameBE) {
      case "FDC.Beethoven-MT-BE":
        return "U05MHT6UWS1";
      case "FDC.Julie-MT-BE":
        return "UBJUTB5AQ";
      case "FDC.Sakai-MT-Web/BE":
        return "U06A5K08K2L";
      case "Ko Inoue":
        return "U05ST3F2FGU";
      default:
        return "None";
    }
  }

  return {
    issueKey: jiraData.key,
    summary: jiraData.fields.summary,
    assignedBE: getSlackIdBE(displayNameBE),
    priority: jiraData.fields.priority.name,
    slackUrl: jiraData.fields.customfield_10257,
  };
}

async function updateSlackThreadUrl(issueKey, slackUrl) {
  let payload = {
    fields: {
      customfield_10257: slackUrl,
    },
  };
  return axios.put(
    `https://native-camp.atlassian.net/rest/api/2/issue/${issueKey}`,
    payload,
    { headers: jiraHeaders }
  );
}

function formatDate(inputDate) {
  const dateParts = inputDate.split("-");
  const year = parseInt(dateParts[0]);
  const month = parseInt(dateParts[1]);
  const day = parseInt(dateParts[2]);

  const formattedDate = new Date(year, month - 1, day);

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const monthName = monthNames[formattedDate.getMonth()];

  return `${monthName} ${day}, ${year}`;
}

function checkEstimationModalErrors(deadline, manDays, viewData) {
  let errors = {};
  function isDatePassed(inputDate) {
    let dateToCheck = new Date(inputDate);
    let currentDate = new Date();

    dateToCheck.setHours(0, 0, 0, 0);
    currentDate.setHours(0, 0, 0, 0);

    return dateToCheck.getTime() < currentDate.getTime();
  }

  function isValidMD(inputStr) {
    let pattern = /^(\d+\s*d)?\s*(\d+\s*h)?\s*(\d+\s*m)?$/;
    return pattern.test(inputStr);
  }

  function isDevMultiChoice(viewData) {
    if (
      viewData.state.values.action_item_owner.radio_buttons_action
        .selected_option.value == "dev"
    ) {
      return (
        viewData.state.values.platform.platform_select_action.selected_options
          .length > 1
      );
    }
  }

  if (isDatePassed(deadline)) {
    errors.deadline = "This date has passed. Please choose another date.";
  }
  if (!isValidMD(manDays)) {
    errors.manDays =
      "Invalid MD Estimate. Please enter estimate in this format: 1d 1h 1m";
  }
  if (isDevMultiChoice(viewData)) {
    errors.actionItemOwner = "DEV cannot select multiple platforms.";
  }
  return errors;
}

function getLeadId(platform, actionItemOwner, issueKey) {
  if (actionItemOwner == "DEV") {
    switch (platform) {
      case "Web":
        if (issueKey.includes("LULU")) {
          return [leadsUserId.lulu_web_lead];
        } else {
          return [leadsUserId.talk_web_lead, leadsUserId.lulu_web_lead];
        }
      case "Android":
        return [leadsUserId.android_lead];
      case "iOS":
        return [leadsUserId.ios_lead];
      default:
        return null; // Handle other platforms if needed
    }
  } else {
    return [leadsUserId.qa_lead];
  }
}

function createEstimateBlock(
  requester,
  action_item,
  platform,
  man_day,
  deadline,
  reason,
  assignedBEId,
  leadId
) {
  let leadMentioned = leadId.map((id) => `<@${id}>`).join(" ");
  let estimateBlock = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${leadMentioned}\n<@${requester}> is requesting estimation approval.`,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*${platform} ${action_item} MD:* ${man_day}`,
        },
        {
          type: "mrkdwn",
          text: `*${platform} ${action_item} DL:* ${deadline}`,
        },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Reason:*\n\`\`\`${reason}\`\`\``,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            emoji: true,
            text: "Approve",
          },
          style: "primary",
          value: "estimate_approved",
          action_id: "estimate_approved",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            emoji: true,
            text: "Deny",
          },
          style: "danger",
          value: "estimate_denied",
          action_id: "estimate_denied",
        },
      ],
    },
    {
      type: "divider",
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${assignedBEId}`,
        },
      ],
    },
  ];
  if (reason == null) {
    estimateBlock.splice(2, 1);
  }
  return estimateBlock;
}

async function updateJiraSubtasks(
  issueKey,
  action_item,
  platform_array,
  deadline
) {
  // Step 1: Construct JQL query
  const baseJQL = `project = MCT AND type = Sub-task AND parent = ${issueKey} AND summary ~ "${action_item}"`;

  const platformMapping = {
    Android: 'summary ~ "android"',
    iOS: 'summary ~ "ios"',
    Web: '(summary ~ "admin" OR summary ~ "api" OR summary ~ "db" OR summary ~ "cron" OR summary ~ "front" OR summary ~ "pc" OR summary ~ "SP")',
  };

  const platformConditions = platform_array.map(
    (platform) => platformMapping[platform]
  );
  const platformJQL = platformConditions.join(" OR ");
  const fullJQL = `${baseJQL} AND (${platformJQL}) ORDER BY created DESC`;
  const encodedJQLquery = encodeURIComponent(fullJQL);
  console.log(encodedJQLquery);

  // Step 2: Get Jira subtasks
  const jiraUrl = `https://native-camp.atlassian.net/rest/api/3/search?jql=${encodedJQLquery}`;

  const jiraSubtasksResponse = await axios.get(jiraUrl, {
    headers: jiraHeaders,
  });
  console.log(jiraSubtasksResponse);
  const jiraSubtasks = jiraSubtasksResponse.data;
  const subtaskIssueKeys = jiraSubtasks.issues.map((subtask) => subtask.key);
  console.log(subtaskIssueKeys);

  // Step 3: Update Jira subtasks
  const payload = {
    editedFieldsInput: {
      datePickerFields: [
        {
          date: {
            formattedDate: `${deadline}`,
          },
          fieldId: "customfield_10023",
        },
      ],
    },
    selectedActions: ["customfield_10023"],
    selectedIssueIdsOrKeys: subtaskIssueKeys,
  };

  const updateResponse = await axios.post(
    "https://native-camp.atlassian.net/rest/api/3/bulk/issues/fields",
    payload,
    { headers: jiraHeaders }
  );
  return updateResponse;
}

function createEstimateModal(
  request_key,
  formatted_dl_estimate,
  slack_timestamp,
  slack_channel,
  assigned_be
) {
  return {
    type: "modal",
    callback_id: "estimation_modal",
    title: {
      type: "plain_text",
      text: `${request_key} Estimation`,
      emoji: true,
    },
    submit: {
      type: "plain_text",
      text: "Submit",
      emoji: true,
    },
    close: {
      type: "plain_text",
      text: "Cancel",
      emoji: true,
    },
    blocks: [
      {
        type: "input",
        block_id: "action_item_owner",
        element: {
          type: "radio_buttons",
          options: [
            {
              text: {
                type: "plain_text",
                text: "DEV",
                emoji: true,
              },
              value: "dev",
            },
            {
              text: {
                type: "plain_text",
                text: "QA",
                emoji: true,
              },
              value: "qa",
            },
          ],
          action_id: "radio_buttons_action",
        },
        label: {
          type: "plain_text",
          text: "Action Item Owner",
          emoji: true,
        },
      },
      {
        type: "input",
        block_id: "platform",
        element: {
          type: "checkboxes",
          options: [
            {
              text: {
                type: "plain_text",
                text: "Web",
                emoji: true,
              },
              value: "web",
            },
            {
              text: {
                type: "plain_text",
                text: "iOS",
                emoji: true,
              },
              value: "ios",
            },
            {
              text: {
                type: "plain_text",
                text: "Android",
                emoji: true,
              },
              value: "android",
            },
          ],
          action_id: "platform_select_action",
        },
        label: {
          type: "plain_text",
          text: "Platform",
          emoji: true,
        },
      },
      {
        type: "input",
        block_id: "md_estimate",
        element: {
          type: "plain_text_input",
          action_id: "md_estimate_action",
        },
        label: {
          type: "plain_text",
          text: "MD Estimate",
          emoji: true,
        },
      },
      {
        type: "input",
        block_id: "dl_estimate",
        element: {
          type: "datepicker",
          initial_date: formatted_dl_estimate,
          placeholder: {
            type: "plain_text",
            text: "Select a date",
            emoji: true,
          },
          action_id: "deadline_action",
        },
        label: {
          type: "plain_text",
          text: "DL Estimate",
          emoji: true,
        },
      },
      {
        type: "input",
        block_id: "dl_reason",
        optional: true,
        element: {
          type: "plain_text_input",
          multiline: true,
          action_id: "dl_reason_action",
          placeholder: {
            type: "plain_text",
            text: "Leave this field blank during Initial Estimation. Reason is only for DL Extension request.",
          },
        },
        label: {
          type: "plain_text",
          text: "Reason",
          emoji: true,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: slack_timestamp,
          },
          {
            type: "mrkdwn",
            text: slack_channel,
          },
          {
            type: "mrkdwn",
            text: assigned_be,
          },
        ],
      },
    ],
  };
}

async function getJiraComponents() {
  let url = "https://native-camp.atlassian.net/rest/api/2/project/MCT/components";;

  const response = await axios.get(url, {
    headers: {
      'Authorization': `Basic ${Buffer.from(`${jiraUser}:${jiraToken}`).toString('base64')}`,
      'Content-Type': 'application/json'
    }
  });

  return response.data.map(({ name }) => name);
}
