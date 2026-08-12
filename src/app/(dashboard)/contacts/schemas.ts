import { z } from 'zod'
import { ContactStatus } from '@prisma/client'

export const ContactSchema = z.object({
  campaignId: z.string().min(1, 'Campaign is required'),
  accountOwnerId: z.string().optional(),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  mobilePhone: z.string().optional(),
  corporatePhone: z.string().optional(),
  companyName: z.string().optional(),
  jobTitle: z.string().optional(),
  industry: z.string().optional(),
  employeeCount: z.coerce.number().int().positive().optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  companyAddress: z.string().optional(),
  companyCity: z.string().optional(),
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
  linkedinUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  status: z.nativeEnum(ContactStatus).default('prospect'),
  dncReason: z.string().optional(),
})

export type ContactFormData = z.infer<typeof ContactSchema>
export const CreateContactSchema = ContactSchema
export const UpdateContactSchema = ContactSchema.partial()
