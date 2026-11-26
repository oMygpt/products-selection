import test from 'node:test';
import assert from 'node:assert/strict';
import { selectTrials } from '../public/trial-desk.js';

test('prioritizes explicit online demo over regular web and github repos', () => {
  const products = [
    {
      key: 'gh-tool',
      name: 'GH Tool',
      url: 'https://github.com/org/tool',
      deliveryForm: 'github',
      experienceGuide: ['步骤1：克隆仓库', '步骤2：运行测试']
    },
    {
      key: 'demo-tool',
      name: 'Demo Tool',
      url: 'https://example.com/app',
      demoUrl: 'https://huggingface.co/spaces/org/demo',
      deliveryForm: 'web',
      frictionLevel: '免注册直玩',
      setupMinutes: 1,
      experienceGuide: ['步骤1：打开页面', '步骤2：输入提示词查看结果']
    }
  ];
  const { featured, alternatives } = selectTrials(products, null, {});
  assert.equal(featured.product.key, 'demo-tool');
  assert.equal(featured.mode.label, '在线 Demo');
  assert.equal(featured.url, 'https://huggingface.co/spaces/org/demo');
  assert.equal(alternatives.length, 1);
  assert.equal(alternatives[0].product.key, 'gh-tool');
});

test('deprioritizes already tried or dropped products', () => {
  const products = [
    {
      key: 'tried-one',
      name: 'Tried One',
      url: 'https://example.com/a',
      deliveryForm: 'web',
      experienceGuide: ['打开网页', '点击生成']
    },
    {
      key: 'fresh-one',
      name: 'Fresh One',
      url: 'https://example.com/b',
      deliveryForm: 'web',
      experienceGuide: ['打开网页', '试试模板']
    }
  ];
  const { featured } = selectTrials(products, null, { 'tried-one': { status: 'tried' } });
  assert.equal(featured.product.key, 'fresh-one');
});

test('falls back cleanly on un-enriched fresh items instead of returning empty', () => {
  const products = [
    {
      key: 'brand-new',
      name: 'Brand New',
      url: 'https://brandnew.dev',
      deliveryForm: 'web',
      tagline: '零配置在线画板'
    }
  ];
  const { featured } = selectTrials(products, null, {});
  assert.ok(featured);
  assert.equal(featured.product.key, 'brand-new');
  assert.ok(featured.task.includes('零配置在线画板'));
});
