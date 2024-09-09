const COMMON = require("./common");

function validateKey(requestKey) {
  if (!requestKey) {
    throw new Error('No such issue. Please check again.~');
  }
  const regex = /^[A-Z]+-[0-9]+$/;
  if (!regex.test(requestKey)) {
    throw new Error('This is not a valid ticket. Please check again.~');
  }
}

function extractSlackTimestamp(url) {
  var regex = /\/p(\d{10})(\d{6})/;
  var match = url.match(regex);

  if (match) {
    var timestamp = match[1] + '.' + match[2];
    return timestamp;
  } else {
    return 'Invalid URL format';
  }
}

function extractSlackChannelId(url) {
  const channelIdRegex = /\/archives\/([A-Z0-9]+)\//;
  const match = url.match(channelIdRegex);
  return match ? match[1] : null;
}

function formatDate(inputDate) {
  const dateParts = inputDate.split('-');
  const year = parseInt(dateParts[0]);
  const month = parseInt(dateParts[1]);
  const day = parseInt(dateParts[2]);

  const formattedDate = new Date(year, month - 1, day);

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
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
        .selected_option.value == 'dev'
    ) {
      return (
        viewData.state.values.platform.platform_select_action.selected_options
          .length > 1
      );
    }
  }

  if (isDatePassed(deadline)) {
    errors.deadline = 'This date has passed. Please choose another date.';
  }
  if (!isValidMD(manDays)) {
    errors.manDays =
      'Invalid MD Estimate. Please enter estimate in this format: 1d 1h 1m';
  }
  if (isDevMultiChoice(viewData)) {
    errors.actionItemOwner = 'DEV cannot select multiple platforms.';
  }
  return errors;
}

function getLeadId(platform, actionItemOwner, issueKey) {
  if (actionItemOwner == 'DEV') {
    switch (platform) {
      case 'Web':
        if (issueKey.includes('LULU')) {
          return [COMMON.leadsUserId.lulu_web_lead];
        } else {
          return [COMMON.leadsUserId.talk_web_lead, COMMON.leadsUserId.lulu_web_lead];
        }
      case 'Android':
        return [COMMON.leadsUserId.android_lead];
      case 'iOS':
        return [COMMON.leadsUserId.ios_lead];
      default:
        return null; // Handle other platforms if needed
    }
  } else {
    return [COMMON.leadsUserId.qa_lead];
  }
}

function createEstimateBlock(requester, action_item, platform, man_day, deadline, reason, assignedBEId, leadId) {
  let leadMentioned = leadId.map(id => `<@${id}>`).join(' ');
  let estimateBlock = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${leadMentioned}\n<@${requester}> is requesting estimation approval.`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*${platform} ${action_item} MD:* ${man_day}`,
        },
        {
          type: 'mrkdwn',
          text: `*${platform} ${action_item} DL:* ${deadline}`,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Reason:*\n\`\`\`${reason}\`\`\``,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            emoji: true,
            text: 'Approve',
          },
          style: 'primary',
          value: 'estimate_approved',
          action_id: 'estimate_approved',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            emoji: true,
            text: 'Deny',
          },
          style: 'danger',
          value: 'estimate_denied',
          action_id: 'estimate_denied',
        },
      ],
    },
    {
      type: 'divider',
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
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

function createEstimateModal(request_key, formatted_dl_estimate, slack_timestamp, slack_channel, assigned_be) {
  return {
    type: 'modal',
    callback_id: 'estimation_modal',
    title: {
      type: 'plain_text',
      text: `${request_key} Estimation`,
      emoji: true,
    },
    submit: {
      type: 'plain_text',
      text: 'Submit',
      emoji: true,
    },
    close: {
      type: 'plain_text',
      text: 'Cancel',
      emoji: true,
    },
    blocks: [
      {
        type: 'input',
        block_id: 'action_item_owner',
        element: {
          type: 'radio_buttons',
          options: [
            {
              text: {
                type: 'plain_text',
                text: 'DEV',
                emoji: true,
              },
              value: 'dev',
            },
            {
              text: {
                type: 'plain_text',
                text: 'QA',
                emoji: true,
              },
              value: 'qa',
            },
          ],
          action_id: 'radio_buttons_action',
        },
        label: {
          type: 'plain_text',
          text: 'Action Item Owner',
          emoji: true,
        },
      },
      {
        type: 'input',
        block_id: 'platform',
        element: {
          type: 'checkboxes',
          options: [
            {
              text: {
                type: 'plain_text',
                text: 'Web',
                emoji: true,
              },
              value: 'web',
            },
            {
              text: {
                type: 'plain_text',
                text: 'iOS',
                emoji: true,
              },
              value: 'ios',
            },
            {
              text: {
                type: 'plain_text',
                text: 'Android',
                emoji: true,
              },
              value: 'android',
            },
          ],
          action_id: 'platform_select_action',
        },
        label: {
          type: 'plain_text',
          text: 'Platform',
          emoji: true,
        },
      },
      {
        type: 'input',
        block_id: 'md_estimate',
        element: {
          type: 'plain_text_input',
          action_id: 'md_estimate_action',
        },
        label: {
          type: 'plain_text',
          text: 'MD Estimate',
          emoji: true,
        },
      },
      {
        type: 'input',
        block_id: 'dl_estimate',
        element: {
          type: 'datepicker',
          initial_date: formatted_dl_estimate,
          placeholder: {
            type: 'plain_text',
            text: 'Select a date',
            emoji: true,
          },
          action_id: 'deadline_action',
        },
        label: {
          type: 'plain_text',
          text: 'DL Estimate',
          emoji: true,
        },
      },
      {
        type: 'input',
        block_id: 'dl_reason',
        optional: true,
        element: {
          type: 'plain_text_input',
          multiline: true,
          action_id: 'dl_reason_action',
          placeholder: {
            type: 'plain_text',
            text: 'Leave this field blank during Initial Estimation. Reason is only for DL Extension request.',
          },
        },
        label: {
          type: 'plain_text',
          text: 'Reason',
          emoji: true,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: slack_timestamp,
          },
          {
            type: 'mrkdwn',
            text: slack_channel,
          },
          {
            type: 'mrkdwn',
            text: assigned_be,
          },
        ],
      },
    ],
  };
}

module.exports = {
    validateKey,
    extractSlackTimestamp,
    extractSlackChannelId,
    formatDate,
    checkEstimationModalErrors,
    getLeadId,
    createEstimateBlock,
    createEstimateModal
};
