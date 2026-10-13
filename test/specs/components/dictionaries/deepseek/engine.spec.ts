import AxiosMockAdapter from 'axios-mock-adapter'
import axios from 'axios'
import { getDefaultConfig } from '@/app-config'
import { getDefaultProfile } from '@/app-config/profiles'
import {
  DEEPSEEK_API_ENDPOINT,
  DEEPSEEK_DEFAULT_MODEL,
  buildDeepSeekPayload,
  buildDeepSeekPrompt,
  getDeepSeekLanguageName,
  parseDeepSeekTranslatedText,
  search
} from '@/components/dictionaries/deepseek/engine'

describe('deepseek translator', () => {
  it('maps Saladict language codes to language names', () => {
    expect(getDeepSeekLanguageName('zh-CN')).toBe('Simplified Chinese')
    expect(getDeepSeekLanguageName('zh-TW')).toBe('Traditional Chinese')
    expect(getDeepSeekLanguageName('en')).toBe('English')
    expect(getDeepSeekLanguageName('ja')).toBe('Japanese')
  })

  it('builds prompts with and without a source language', () => {
    expect(buildDeepSeekPrompt('auto', 'zh-CN')).toContain(
      "Translate the user's message into Simplified Chinese."
    )
    expect(buildDeepSeekPrompt('en', 'ja')).toContain(
      "Translate the user's message from English into Japanese."
    )
  })

  it('builds DeepSeek chat completion payload', () => {
    const payload = buildDeepSeekPayload({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      model: 'deepseek-flash'
    })

    expect(payload.model).toBe('deepseek-flash')
    expect(payload.stream).toBe(false)
    expect(payload.thinking).toEqual({ type: 'disabled' })
    expect(payload.messages).toHaveLength(2)
    expect(payload.messages[0].role).toBe('system')
    expect(payload.messages[1]).toEqual({ role: 'user', content: 'hello' })
  })

  it('parses DeepSeek chat completion responses', () => {
    expect(
      parseDeepSeekTranslatedText({
        choices: [{ message: { role: 'assistant', content: ' 你好\n' } }]
      })
    ).toBe('你好')
    expect(parseDeepSeekTranslatedText({ choices: [] })).toBe('')
    expect(parseDeepSeekTranslatedText({})).toBe('')
  })

  it('requires an API key before calling DeepSeek', async () => {
    const mock = new AxiosMockAdapter(axios)
    const config = getDefaultConfig()
    const profile = getDefaultProfile()
    ;(config.dictAuth as any).deepseek.apiKey = '   '

    const result = await search('hello', config, profile, { isPDF: false })

    expect(result.result.requireCredential).toBe(true)
    expect(result.result.id).toBe('deepseek')
    expect(mock.history.post).toHaveLength(0)

    mock.restore()
  })

  it('reports invalid DeepSeek credentials', async () => {
    const mock = new AxiosMockAdapter(axios)
    mock.onPost(DEEPSEEK_API_ENDPOINT).reply(401, {
      error: { message: 'Authentication Fails' }
    })

    const config = getDefaultConfig()
    const profile = getDefaultProfile()
    ;(config.dictAuth as any).deepseek.apiKey = 'bad'

    const result = await search('hello', config, profile, {
      isPDF: false,
      sl: 'en',
      tl: 'zh-CN'
    })

    expect(result.result.requireCredential).toBe(true)
    expect(result.result.credentialError).toBe('invalid')

    mock.restore()
  })

  it('reports DeepSeek insufficient balance as quota error', async () => {
    const mock = new AxiosMockAdapter(axios)
    mock.onPost(DEEPSEEK_API_ENDPOINT).reply(402, {
      error: { message: 'Insufficient Balance' }
    })

    const config = getDefaultConfig()
    const profile = getDefaultProfile()
    ;(config.dictAuth as any).deepseek.apiKey = 'key'

    const result = await search('hello', config, profile, {
      isPDF: false,
      sl: 'en',
      tl: 'zh-CN'
    })

    expect(result.result.requireCredential).toBe(true)
    expect(result.result.credentialError).toBe('quota')

    mock.restore()
  })

  it('translates through DeepSeek with the default model', async () => {
    const mock = new AxiosMockAdapter(axios)
    mock.onPost(DEEPSEEK_API_ENDPOINT).reply(200, {
      choices: [{ message: { role: 'assistant', content: '你好\n世界' } }]
    })

    const config = getDefaultConfig()
    const profile = getDefaultProfile()
    ;(config.dictAuth as any).deepseek.apiKey = 'secret'

    const result = await search('hello\nworld', config, profile, {
      isPDF: false,
      sl: 'en',
      tl: 'zh-CN'
    })

    expect(result.result.id).toBe('deepseek')
    expect(result.result.sl).toBe('en')
    expect(result.result.tl).toBe('zh-CN')
    expect(result.result.trans.paragraphs).toEqual(['你好', '世界'])
    expect(mock.history.post[0].headers?.Authorization).toBe('Bearer secret')
    expect(JSON.parse(mock.history.post[0].data).model).toBe(
      DEEPSEEK_DEFAULT_MODEL
    )

    mock.restore()
  })

  it('uses the configured model when provided', async () => {
    const mock = new AxiosMockAdapter(axios)
    mock.onPost(DEEPSEEK_API_ENDPOINT).reply(200, {
      choices: [{ message: { role: 'assistant', content: '你好' } }]
    })

    const config = getDefaultConfig()
    const profile = getDefaultProfile()
    ;(config.dictAuth as any).deepseek.apiKey = 'secret'
    ;(config.dictAuth as any).deepseek.model = ' deepseek-v4-pro '

    await search('hello', config, profile, {
      isPDF: false,
      sl: 'en',
      tl: 'zh-CN'
    })

    expect(JSON.parse(mock.history.post[0].data).model).toBe('deepseek-v4-pro')

    mock.restore()
  })
})
