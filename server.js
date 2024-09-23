const { App, ExpressReceiver } = require('@slack/bolt');
const COMMAND = require('./controllers/command');
const ACTION = require('./controllers/action');
const VIEW = require('./controllers/view');
const MIDDLEWARE = require('./controllers/middleware');

const expressReceiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: '/slack/events',
});

expressReceiver.router.get('/ping', (req, res) => {
  res.status(200).send('OK');
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: expressReceiver,
});
// ========== ENTER BOLT CODE AFTER THIS LINE  ==========
app.command('/post-ticket', COMMAND.handlePostTicket);

app.command('/estimate', COMMAND.handleEstimate);

app.command('/versionbug', COMMAND.handleVersionBug);

app.action('estimate_approved', ACTION.handleEstimateApproved);

app.action('estimate_denied', ACTION.handleEstimateDenied);

app.view('estimation_modal', VIEW.handleEstimateModalSubmit);

//handle legacy attachment action when estimate button clicked
app.use(MIDDLEWARE.handleEstimateButtonClicked);
// ========== ENTER BOLT CODE BEFORE THIS LINE  ==========
(async () => {
  await app.start(process.env.PORT || 3000);

  console.log('⚡️ Bolt app is running at PORT ' + process.env.PORT);
})();
