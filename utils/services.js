const COMMON = require("./common");
const axios = require("axios");

async function fetchJiraIssue(issueKey) {
  const response = await axios.get(
    `https://native-camp.atlassian.net/rest/api/2/issue/${issueKey}`,
    { headers: COMMON.jiraHeaders }
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
    { headers: COMMON.jiraHeaders }
  );
}

async function updateJiraSubtasks(issueKey, action_item, platform_array, deadline, assignee) {
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

  // Step 2: Get Jira subtasks
  const jiraUrl = `https://native-camp.atlassian.net/rest/api/3/search?jql=${encodedJQLquery}`;

  const jiraSubtasksResponse = await axios.get(jiraUrl, {
    headers: COMMON.jiraHeaders,
  });
  const jiraSubtasks = jiraSubtasksResponse.data;
  const subtaskIssueKeys = jiraSubtasks.issues.map((subtask) => subtask.key);

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
      multipleSelectClearableUserPickerFields: [
      {
        fieldId: "assignee",
        users: [
          {
            accountId: `${assignee}`,
          }
        ]
      }
    ],
    },
    selectedActions: ["customfield_10023", "assignee"],
    selectedIssueIdsOrKeys: subtaskIssueKeys,
  };

  const updateResponse = await axios.post(
    "https://native-camp.atlassian.net/rest/api/3/bulk/issues/fields",
    payload,
    { headers: COMMON.jiraHeaders }
  );
  return updateResponse;
}

async function getJiraComponents() {
  let url = "https://native-camp.atlassian.net/rest/api/2/project/MCT/components";;

  const response = await axios.get(url, {
    headers: COMMON.jiraHeaders
  });

  return response.data.map(({ name }) => name);
}

async function getJiraAccountId(slackDisplayName) {
  let response = await axios.get(`https://native-camp.atlassian.net/rest/api/3/user/search?query=${slackDisplayName}`, {
    headers: COMMON.jiraHeaders
  });
  return response.data;
}

module.exports = {
  fetchJiraIssue,
  updateSlackThreadUrl,
  updateJiraSubtasks,
  getJiraComponents,
  getJiraAccountId
};