import assert from 'node:assert/strict';
import { test } from 'node:test';
import questionTools from '../pi/extensions/question-tool/index.ts';

function createTools(register = questionTools) {
  const tools = new Map();
  register({ registerTool(tool) { assert.equal(tools.has(tool.name), false); tools.set(tool.name, tool); } });
  return tools;
}

const tools = createTools();
const question = { question: 'Synthetic private question?', options: [{ label: 'Alpha' }, { label: 'Beta' }] };
const questionnaire = { questions: [{ id: 'q1', prompt: 'Synthetic private prompt?', options: [{ value: 'a', label: 'Alpha' }] }] };

function mockUi(requireBlocked = true) {
  let status = 'working';
  let component;
  const history = [status];
  const spinner = [];
  const tui = { requestRender() {}, terminal: { columns: 80, rows: 24 } };
  const theme = { fg: (_color, text) => text, bg: (_color, text) => text, bold: (text) => text };
  return {
    get status() { return status; }, history, spinner,
    get component() { return component; },
    setWorkingVisible(value) { spinner.push(value); },
    custom(factory, options) {
      if (requireBlocked) {
        assert.equal(options?.blocked?.kind, 'question');
        assert.ok(options.blocked.message);
        assert.doesNotMatch(options.blocked.message, /Synthetic private/);
      } else {
        assert.equal(options, undefined);
      }
      const previous = status;
      status = 'blocked'; history.push(status);
      return new Promise((resolve, reject) => {
        try {
          component = factory(tui, theme, {}, (result) => {
            status = previous; history.push(status); resolve(result);
          });
        } catch (error) { status = previous; history.push(status); reject(error); }
      });
    },
  };
}

for (const [name, params] of [['question', question], ['questionnaire', questionnaire]]) {
  for (const [action, key] of [['answer', '\r'], ['cancel', '\x1b']]) {
    test(`${name}: blocked while awaiting ${action}, restored on completion`, async () => {
      const ui = mockUi();
      const promise = tools.get(name).execute('test', params, undefined, undefined, { mode: 'tui', ui });
      assert.equal(ui.status, 'blocked');
      assert.ok(ui.component.render(80).length > 0);
      ui.component.handleInput(key);
      const result = await promise;
      assert.deepEqual(ui.history, ['working', 'blocked', 'working']);
      assert.deepEqual(ui.spinner, [false, true]);
      if (name === 'question') {
        assert.equal(result.details.answer, action === 'answer' ? 'Alpha' : null);
      } else {
        assert.equal(result.details.cancelled, action === 'cancel');
        if (action === 'answer') assert.equal(result.details.answers[0].value, 'a');
      }
    });
  }
}

test('schemas, defaults and non-interactive behavior remain compatible', async () => {
  assert.deepEqual([...tools.keys()], ['question', 'questionnaire']);
  assert.deepEqual(Object.keys(tools.get('question').parameters.properties), ['question', 'options']);
  assert.deepEqual(Object.keys(tools.get('questionnaire').parameters.properties), ['questions']);
  assert.match((await tools.get('question').execute('test', question, undefined, undefined, { mode: 'rpc' })).content[0].text, /UI not available/);
  assert.match((await tools.get('questionnaire').execute('test', questionnaire, undefined, undefined, { mode: 'rpc' })).content[0].text, /UI not available/);
});

test('multi-question answers and submit preserve the original result structure', async () => {
  const ui = mockUi();
  const params = { questions: [
    { id: 'q1', prompt: 'One?', options: [{ value: 'a', label: 'Alpha' }] },
    { id: 'q2', prompt: 'Two?', options: [{ value: 'b', label: 'Beta' }] },
  ] };
  const promise = tools.get('questionnaire').execute('test', params, undefined, undefined, { mode: 'tui', ui });
  ui.component.handleInput('\r');
  ui.component.handleInput('\r');
  assert.equal(ui.status, 'blocked');
  ui.component.handleInput('\r');
  const result = await promise;
  assert.deepEqual(result.details.answers.map((answer) => answer.value), ['a', 'b']);
  assert.equal(result.details.cancelled, false);
  assert.equal(ui.status, 'working');
});
