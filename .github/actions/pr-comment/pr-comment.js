// Posts one PR comment per marker, edited on every push instead of piling up.
// Run by action.yml, whose inputs arrive as PR_COMMENT_* env vars (not
// INPUT_*, which github-script reads as its own). Still require()-able from
// actions/github-script for anything the inputs can't say.

const fs = require('fs');

// A comment holds at most 65536 characters.
const LIMIT = 60000;

const icon = (outcome) => ({ success: '✅', failure: '❌' })[outcome] || '⏭️';

// Empty string when the file is missing, e.g. its step never ran.
const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');

function truncate(text) {
  return text.length > LIMIT ? `${text.slice(0, LIMIT)}\n... (truncated, full output in the job log)` : text;
}

async function findComment({ github, context }, marker) {
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...context.repo,
    issue_number: context.issue.number,
  });
  return comments.find((c) => c.user.type === 'Bot' && c.body.startsWith(`<!-- ${marker} -->`));
}

// steps: [[label, outcome]], outcome '' meaning the step didn't run.
// details (optional): { title, lang, body } shown collapsed below the steps.
async function upsertComment({ github, context }, { marker, title, steps, summary, details }) {
  const run = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  // On pull_request, context.sha is GitHub's temporary merge commit; show the
  // branch commit that was pushed instead.
  const sha = (context.payload.pull_request?.head.sha || context.sha).slice(0, 7);
  const text = [
    `<!-- ${marker} -->`,
    `### ${title}`,
    '',
    ...steps.map(([label, outcome]) => `#### ${icon(outcome || 'skipped')} ${label} \`${outcome || 'skipped'}\``),
    '',
    ...(summary ? [`**${summary}**`, ''] : []),
    ...(details
      ? [
          `<details><summary>${details.title}</summary>`,
          '',
          `\`\`\`${details.lang}`,
          truncate(details.body),
          '```',
          '</details>',
          '',
        ]
      : []),
    `*Pushed by: @${context.actor}, Action: \`${context.eventName}\`, commit ${sha}, [job log](${run})*`,
  ].join('\n');

  const existing = await findComment({ github, context }, marker);
  if (existing) {
    await github.rest.issues.updateComment({ ...context.repo, comment_id: existing.id, body: text });
  } else {
    await github.rest.issues.createComment({ ...context.repo, issue_number: context.issue.number, body: text });
  }
}

// Removes a comment that no longer applies, e.g. a failed plan once plans
// are skipped, so the PR doesn't show a stale result.
async function deleteComment({ github, context }, marker) {
  const existing = await findComment({ github, context }, marker);
  if (existing) {
    await github.rest.issues.deleteComment({ ...context.repo, comment_id: existing.id });
  }
}

// "<label> = <outcome>" per line; split on the last "=", so a label may
// contain one. An empty outcome means the step didn't run.
function parseSteps(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.lastIndexOf('=');
      if (at < 1) throw new Error(`invalid steps line "${line}", expected "<label> = <outcome>"`);
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    });
}

const lines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean);

async function run({ github, context, env = process.env }) {
  if (!context.issue.number) {
    console.log('Not a pull request: no comment posted');
    return;
  }
  const input = (name) => (env[`PR_COMMENT_${name}`] || '').trim();

  const detailsFile = input('DETAILS_FILE');
  const details = input('DETAILS_TITLE')
    ? {
        title: input('DETAILS_TITLE'),
        lang: input('DETAILS_LANG') || 'text',
        body: (detailsFile && read(detailsFile)) || input('DETAILS_FALLBACK'),
      }
    : undefined;

  await upsertComment({ github, context }, {
    marker: input('MARKER'),
    title: input('TITLE'),
    steps: parseSteps(input('STEPS')),
    summary: input('SUMMARY'),
    details,
  });
  for (const marker of lines(input('DELETE_MARKERS'))) {
    await deleteComment({ github, context }, marker);
  }
}

module.exports = { upsertComment, deleteComment, read, parseSteps, run };
