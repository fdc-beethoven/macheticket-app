const jiraUser = process.env.JIRA_USERNAME;
const jiraToken = process.env.JIRA_TOKEN;
const jiraHeaders = {
  Accept: "application/json",
  Authorization: `Basic ${Buffer.from(`${jiraUser}:${jiraToken}`).toString("base64")}`,
};

const slackIdRegex = /<@(.+?)>/;

const leadsUserId = {
  ios_lead: process.env.IOS_LEAD_ID,
  android_lead: process.env.ANDROID_LEAD_ID,
  talk_web_lead: process.env.TALK_WEB_LEAD_ID,
  qa_lead: process.env.QA_LEAD_ID,
  lulu_web_lead: process.env.LULU_WEB_LEAD_ID,
};

const pmUserId = process.env.PM_USER_ID;

module.exports = {
  jiraHeaders,
  slackIdRegex,
  leadsUserId,
  pmUserId
};
