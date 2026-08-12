import Anthropic from '@anthropic-ai/sdk'
import type { AIService } from './types'

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is required')
const client = new Anthropic({ apiKey })

export const anthropicService: AIService = {
  async summarizeCompany(websiteText, companyName) {
    const context = companyName ? `Company name: ${companyName}\n\n` : ''
    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [
        {
          role:    'user',
          content: `${context}Website content:\n${websiteText}\n\nSummarize this company for a sales rep who is about to call them. Respond with exactly 3 lines, each in the form "Label: answer", one sentence each:\nWhat they do: <what the company does>\nWho they target: <their target customers/market>\nGood to know: <one notable fact that helps the caller connect — e.g. funding, size, recent news, differentiator>\nDo not include any other text, headers, or markdown formatting.`,
        },
      ],
    })
    if (!msg.content.length) throw new Error('Anthropic returned empty content array')
    const block = msg.content[0]
    if (block.type !== 'text') throw new Error('Unexpected Anthropic response type')
    return block.text.trim()
  },
}
