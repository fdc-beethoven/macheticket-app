const { App, ExpressReceiver } = require("@slack/bolt");
const HELPER = require("./utils/helpers");
const COMMON = require("./utils/common");
const SERVICE = require("./utils/services");
const COMMAND = require("./controllers/command");
const ACTION = require("./controllers/action");
const VIEW = require("./controllers/view");

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

app.command("/versionbug", COMMAND.handleVersionBug);

app.action("estimate_approved", ACTION.handleEstimateApproved);

app.action("estimate_denied", ACTION.handleEstimateDenied);

app.view("estimation_modal", VIEW.handleEstimateModalSubmit);

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