const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
// Compile the two dependency-free definitions with the project's TypeScript version.
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  module._compile(outputText, filename);
};
const { ANKETA } = require('../lib/survey-anketa.ts');
const { cleanAnswers, isAnswered, formatAnswer, formatResponseAnswer } = require('../lib/survey.ts');
const ranking = ANKETA.questions.at(-1);
const ordered = ['cena', 'foto_baterie', 'vyzkouseni', 'ergonomie'];

test('all nine questions remain, with purchase before the final ranking', () => {
  assert.equal(ANKETA.questions.length, 9);
  assert.equal(ANKETA.questions.at(-2).id, 'purchase');
  assert.equal(ranking.ranked, true);
});

test('a complete ranking survives validation and exports in the chosen order', () => {
  assert.equal(isAnswered(ranking, ordered), true);
  assert.deepEqual(cleanAnswers({ [ranking.id]: ordered }, [ranking]), { answers: { [ranking.id]: ordered } });
  assert.equal(formatAnswer(ranking, ordered), ordered.map((v, i) => `${i + 1}. ${ranking.options.find(o => o.value === v).label}`).join('; '));
});

test('partial, duplicate, unknown and mixed opt-out rankings are rejected', () => {
  for (const invalid of [undefined, [], ['cena'], [...ordered, 'cena'], ['cena', 'cena', 'cena', 'cena'], ['fake', ...ordered.slice(1)], ['nic', ...ordered], 'cena']) {
    assert.equal(isAnswered(ranking, invalid), false);
    assert.ok(cleanAnswers({ [ranking.id]: invalid }, [ranking]).error);
  }
});

test('exclusive opt-out is valid on its own and has no artificial rank', () => {
  assert.equal(isAnswered(ranking, ['nic']), true);
  assert.deepEqual(cleanAnswers({ [ranking.id]: ['nic'] }, [ranking]).answers[ranking.id], ['nic']);
  assert.equal(formatAnswer(ranking, ['nic']), ranking.options.find(o => o.value === 'nic').label);
});

test('legacy selections are readable and never accepted as a new ranking', () => {
  const old = { convince: ['cena', 'vyzkouseni'] };
  assert.match(formatResponseAnswer(ranking, old), /^Dřívější výběr bez pořadí: /);
  assert.ok(cleanAnswers(old, [ranking]).error);
});

test('a full questionnaire accepts rankings while ordinary multi-choice keeps working', () => {
  const answers = Object.fromEntries(ANKETA.questions.map(q => [q.id, q.kind === 'single' ? q.options[0].value : q.ranked ? ordered : [q.options[0].value]]));
  assert.deepEqual(cleanAnswers(answers, ANKETA.questions), { answers });
  const multi = ANKETA.questions.find(q => q.id === 'benefits');
  assert.equal(isAnswered(multi, ['video']), true);
  assert.deepEqual(cleanAnswers({ benefits: ['video', 'zadna'] }, [multi]).answers.benefits, ['zadna']);
});
