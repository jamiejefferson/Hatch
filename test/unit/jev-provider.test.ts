import { describe, expect, it } from 'vitest';
import { bodyFor, modelFor, providerOf, urlFor } from '../../src/main/jev/provider';

describe('the service behind a Jev key', () => {
  it('reads OpenRouter from the start of the key, and sends every other key to TypeSafe', () => {
    expect(providerOf('sk-or-v1-0123456789abcdef')).toBe('openrouter');
    expect(providerOf('  sk-or-v1-padded  ')).toBe('openrouter');
    expect(providerOf('ts_live_0123456789')).toBe('typesafe');
    expect(providerOf('sk-0123456789')).toBe('typesafe');
    expect(providerOf('')).toBe('typesafe');
  });

  it('names the address of each service, and lets a test address replace both', () => {
    expect(urlFor('typesafe')).toBe('https://api.typesafe.ai/v1/systemone');
    expect(urlFor('openrouter')).toBe('https://openrouter.ai/api/alpha/decisions');
    expect(urlFor('openrouter', 'http://127.0.0.1:9/v1/systemone')).toBe('http://127.0.0.1:9/v1/systemone');
  });

  it('changes the model name for OpenRouter and leaves the rest of the request alone', () => {
    expect(modelFor('typesafe', 'jev-latest')).toBe('jev-latest');
    expect(modelFor('openrouter', 'jev-latest')).toBe('~typesafe/jev-latest');
    const request = { state: 'An outline.', model: 'jev-latest', questions: { check: { type: 'noul', instructions: 'Is this a greeting?' } } };
    expect(bodyFor('openrouter', request)).toEqual({ ...request, model: '~typesafe/jev-latest' });
    expect(bodyFor('typesafe', request)).toEqual(request);
    expect(request.model).toBe('jev-latest');
  });
});
