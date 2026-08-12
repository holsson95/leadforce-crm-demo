export interface AIService {
  summarizeCompany(websiteText: string, companyName?: string): Promise<string>
}
