import { GoogleGenerativeAI } from '@google/generative-ai'
import type { AIService } from './types'

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is required')
const genAI = new GoogleGenerativeAI(apiKey)
const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' })

export const geminiService: AIService = {
  async summarizeCompany(websiteText, companyName) {
    const context = companyName ? `Company name: ${companyName}\n\n` : ''
    const result = await model.generateContent(
      `${context}Website content:\n${websiteText}\n\nSummarize this company for a sales rep who is about to call them. Respond with exactly 3 lines, each in the form "Label: answer", one sentence each:\nWhat they do: <what the company does>\nWho they target: <their target customers/market>\nGood to know: <one notable fact that helps the caller connect — e.g. funding, size, recent news, differentiator>\nDo not include any other text, headers, or markdown formatting.`,
    )
    const text = result.response.text().trim()
    if (!text) throw new Error('Gemini returned empty response')
    return text
  },
}
